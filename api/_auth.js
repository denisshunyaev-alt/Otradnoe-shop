import { neon } from '@neondatabase/serverless';
import { promisify } from 'node:util';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = 7;

function db(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL не настроен');
  return neon(process.env.DATABASE_URL);
}

export async function authDb(){
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS admins (
    id BIGSERIAL PRIMARY KEY,
    login TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS admin_sessions (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS admin_sessions_token_hash_idx ON admin_sessions(token_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions(expires_at)`;
  await bootstrap(sql);
  return sql;
}

async function bootstrap(sql){
  const countRows = await sql`SELECT COUNT(*)::int AS count FROM admins`;
  if(Number(countRows[0]?.count)!==0) return;
  const login = String(process.env.ADMIN_BOOTSTRAP_LOGIN||'').trim();
  const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD||'');
  if(!login || !password) return;
  if(password.length < 10) throw new Error('ADMIN_BOOTSTRAP_PASSWORD должен содержать минимум 10 символов');
  const hash = await hashPassword(password);
  await sql`INSERT INTO admins (login,password_hash,role,active) VALUES (${login},${hash},'owner',true) ON CONFLICT (login) DO NOTHING`;
}

export async function hashPassword(password){
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64, {N:16384,r:8,p:1});
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${Buffer.from(key).toString('base64url')}`;
}

export async function verifyPassword(password, encoded){
  try{
    const [algo,n,r,p,saltText,keyText] = String(encoded||'').split('$');
    if(algo!=='scrypt' || !saltText || !keyText) return false;
    const salt = Buffer.from(saltText,'base64url');
    const expected = Buffer.from(keyText,'base64url');
    const key = Buffer.from(await scryptAsync(password,salt,expected.length,{N:Number(n),r:Number(r),p:Number(p)}));
    return key.length===expected.length && timingSafeEqual(key,expected);
  }catch{return false;}
}

function hashToken(token){ return createHash('sha256').update(token).digest('hex'); }

function parseCookies(req){
  const out={};
  const raw=req.headers?.cookie||'';
  for(const part of raw.split(';')){
    const i=part.indexOf('=');
    if(i<0) continue;
    const key=part.slice(0,i).trim();
    const value=decodeURIComponent(part.slice(i+1).trim());
    out[key]=value;
  }
  return out;
}

export function clearSessionCookie(res){
 res.setHeader('Set-Cookie',['otradnoe_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax']);
}

export async function createSession(sql, adminId, res){
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now()+SESSION_DAYS*24*60*60*1000);
  await sql`DELETE FROM admin_sessions WHERE expires_at < NOW()`;
  await sql`INSERT INTO admin_sessions (admin_id,token_hash,expires_at) VALUES (${Number(adminId)},${tokenHash},${expires.toISOString()})`;
  res.setHeader('Set-Cookie', ['otradnoe_admin=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_DAYS*24*60*60}; HttpOnly; Secure; SameSite=Lax']);
}

export async function requireAdmin(req,res,roles=[]){
  const sql = await authDb();
  const token = parseCookies(req).otradnoe_admin;
  if(!token) return {sql,admin:null};
  const tokenHash = hashToken(token);
  const rows = await sql`SELECT a.id,a.login,a.role,a.active FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=${tokenHash} AND s.expires_at>NOW() AND a.active=true LIMIT 1`;
  const admin = rows[0] ? {id:Number(rows[0].id),login:rows[0].login,role:rows[0].role} : null;
  if(admin && roles.length && !roles.includes(admin.role)) return {sql,admin,forbidden:true};
  return {sql,admin};
}

export async function requireAdminResponse(req,res,roles=[]){
  const result=await requireAdmin(req,res,roles);
  if(!result.admin){res.status(401).json({ok:false,error:'Требуется вход в админ-панель'});return null;}
  if(result.forbidden){res.status(403).json({ok:false,error:'Недостаточно прав'});return null;}
  return result;
}

export async function destroySession(req,res){
  const sql=await authDb();
  const token=parseCookies(req).otradnoe_admin;
  if(token) await sql`DELETE FROM admin_sessions WHERE token_hash=${hashToken(token)}`;
  clearSessionCookie(res);
  return sql;
}
