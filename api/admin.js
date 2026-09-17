import { authDb, hashPassword, verifyPassword, createSession, clearSessionCookie, requireAdminResponse, destroySession } from './_auth.js';

function cleanLogin(value){ return String(value||'').trim().toLowerCase(); }
function cleanPassword(value){ return String(value||''); }
function validLogin(login){ return /^[a-zA-Z0-9._-]{3,40}$/.test(login); }
function publicAdmin(r){ return {id:Number(r.id),login:r.login,role:r.role,active:r.active!==false,createdAt:r.created_at?new Date(r.created_at).toLocaleString('ru-RU'):''}; }

export default async function handler(req,res){
  try{
    const sql=await authDb();
    const action=String(req.query?.action||req.body?.action||'me');

    if(req.method==='POST' && action==='login'){
      const login=cleanLogin(req.body?.login);
      const password=cleanPassword(req.body?.password);
      const rows=await sql`SELECT id,login,password_hash,role,active FROM admins WHERE login=${login} LIMIT 1`;
      const admin=rows[0];
      if(!admin || !admin.active || !(await verifyPassword(password,admin.password_hash))) return res.status(401).json({ok:false,error:'Неверный логин или пароль'});
      await createSession(sql,admin.id,res);
      return res.status(200).json({ok:true,admin:{id:Number(admin.id),login:admin.login,role:admin.role}});
    }

    if(req.method==='POST' && action==='logout'){
      await destroySession(req,res);
      return res.status(200).json({ok:true});
    }

    if(req.method==='GET' && action==='me'){
      const auth=await requireAdminResponse(req,res);
      if(!auth) return;
      return res.status(200).json({ok:true,admin:auth.admin});
    }

    if(req.method==='GET' && action==='list'){
      const auth=await requireAdminResponse(req,res,['owner']);
      if(!auth) return;
      const rows=await sql`SELECT id,login,role,active,created_at FROM admins ORDER BY created_at ASC`;
      return res.status(200).json({ok:true,admins:rows.map(publicAdmin)});
    }

    if(req.method==='POST' && action==='create'){
      const auth=await requireAdminResponse(req,res,['owner']);
      if(!auth) return;
      const login=cleanLogin(req.body?.login);
      const password=cleanPassword(req.body?.password);
      if(!validLogin(login)) return res.status(400).json({ok:false,error:'Логин: 3–40 символов, только латиница, цифры, точка, дефис и _'});
      if(password.length<10) return res.status(400).json({ok:false,error:'Пароль должен содержать минимум 10 символов'});
      const hash=await hashPassword(password);
      try{
        const rows=await sql`INSERT INTO admins (login,password_hash,role,active) VALUES (${login},${hash},'admin',true) RETURNING id,login,role,active,created_at`;
        return res.status(201).json({ok:true,admin:publicAdmin(rows[0])});
      }catch(e){
        if(String(e?.code)==='23505') return res.status(409).json({ok:false,error:'Такой логин уже существует'});
        throw e;
      }
    }

    if(req.method==='POST' && action==='changePassword'){
      const auth=await requireAdminResponse(req,res);
      if(!auth) return;
      const targetId=Number(req.body?.id||auth.admin.id);
      const password=cleanPassword(req.body?.password);
      if(password.length<10) return res.status(400).json({ok:false,error:'Пароль должен содержать минимум 10 символов'});
      if(targetId!==auth.admin.id && auth.admin.role!=='owner') return res.status(403).json({ok:false,error:'Недостаточно прав'});
      await sql`UPDATE admins SET password_hash=${await hashPassword(password)} WHERE id=${targetId}`;
      if(targetId===auth.admin.id){ await sql`DELETE FROM admin_sessions WHERE admin_id=${targetId}`; clearSessionCookie(res); }
      return res.status(200).json({ok:true,loggedOut:targetId===auth.admin.id});
    }

    if(req.method==='POST' && action==='toggle'){
      const auth=await requireAdminResponse(req,res,['owner']);
      if(!auth) return;
      const targetId=Number(req.body?.id);
      if(!targetId || targetId===auth.admin.id) return res.status(400).json({ok:false,error:'Нельзя отключить текущего администратора'});
      const rows=await sql`SELECT id,role,active FROM admins WHERE id=${targetId} LIMIT 1`;
      if(!rows[0]) return res.status(404).json({ok:false,error:'Администратор не найден'});
      if(rows[0].role==='owner' && rows[0].active){
        const owners=await sql`SELECT COUNT(*)::int AS count FROM admins WHERE role='owner' AND active=true`;
        if(Number(owners[0]?.count)<=1) return res.status(400).json({ok:false,error:'Нельзя отключить последнего владельца'});
      }
      const rows2=await sql`UPDATE admins SET active=NOT active WHERE id=${targetId} RETURNING id,login,role,active,created_at`;
      if(rows2[0].active===false) await sql`DELETE FROM admin_sessions WHERE admin_id=${targetId}`;
      return res.status(200).json({ok:true,admin:publicAdmin(rows2[0])});
    }

    return res.status(400).json({ok:false,error:'Неизвестное действие'});
  }catch(e){
    console.error(e);
    return res.status(500).json({ok:false,error:e.message||'Ошибка сервера'});
  }
}
