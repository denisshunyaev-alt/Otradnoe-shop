import { neon } from '@neondatabase/serverless';
import { requireAdminResponse } from './_auth.js';

const seed = [
  {id:1,name:'Картофель',cat:'Овощи',price:120,unit:'кг',stock:100,note:'Продажа по килограммам',icon:'🥔',photo:'',weight:'',enabled:true},
  {id:2,name:'Помидоры',cat:'Овощи',price:700,unit:'коробка',stock:20,note:'В коробке 10–11 кг',icon:'🍅',photo:'',weight:'10.5',enabled:true},
  {id:3,name:'Масло белорусское',cat:'Масло',price:1200,unit:'кг',stock:30,note:'Продажа по килограммам',icon:'🧈',photo:'',weight:'',enabled:true},
  {id:4,name:'Минтай заморозка',cat:'Заморозка',price:1200,unit:'коробка',stock:20,note:'Продажа коробками',icon:'🐟',photo:'',weight:'',enabled:true},
  {id:5,name:'Форель свежая',cat:'Рыба',price:1800,unit:'кг',stock:30,note:'Рыба примерно 5–6 кг',icon:'🐠',photo:'',weight:'5.5',enabled:true},
  {id:6,name:'Зефир',cat:'Сладости',price:600,unit:'коробка',stock:20,note:'Коробка 5 кг',icon:'🍬',photo:'',weight:'5',enabled:true}
];

async function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL не настроен');
  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS products (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    cat TEXT NOT NULL,
    price NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    stock NUMERIC NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    icon TEXT DEFAULT '🛒',
    photo TEXT DEFAULT '',
    weight TEXT DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  return sql;
}

function rowToProduct(r){return {id:Number(r.id),name:r.name,cat:r.cat,price:Number(r.price),unit:r.unit,stock:Number(r.stock),note:r.note||'',icon:r.icon||'🛒',photo:r.photo||'',weight:r.weight||'',enabled:r.enabled!==false};}

export default async function handler(req,res){
  try{
    const sql=await db();
    if(req.method==='GET'){
      const rows=await sql`SELECT * FROM products ORDER BY id`;
      return res.status(200).json({ok:true,source:rows.length?'db':'seed',products:rows.length?rows.map(rowToProduct):seed});
    }
    if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
    const auth=await requireAdminResponse(req,res);
    if(!auth) return;
    const body=req.body||{};
    if(body.action==='bulk'){
      const products=Array.isArray(body.products)?body.products:[];
      if(!products.length) return res.status(400).json({ok:false,error:'Нет товаров'});
      await sql`DELETE FROM products`;
      for(const p of products){
        await sql`INSERT INTO products (id,name,cat,price,unit,stock,note,icon,photo,weight,enabled,updated_at)
          VALUES (${Number(p.id)},${p.name},${p.cat},${Number(p.price)},${p.unit},${Number(p.stock)||0},${p.note||''},${p.icon||'🛒'},${p.photo||''},${p.weight||''},${p.enabled!==false},NOW())`;
      }
      const rows=await sql`SELECT * FROM products ORDER BY id`;
      return res.status(200).json({ok:true,products:rows.map(rowToProduct)});
    }
    if(body.action==='upsert'){
      const p=body.product;
      if(!p?.id || !p?.name || !p?.price) return res.status(400).json({ok:false,error:'Некорректный товар'});
      const rows=await sql`INSERT INTO products (id,name,cat,price,unit,stock,note,icon,photo,weight,enabled,updated_at)
        VALUES (${Number(p.id)},${p.name},${p.cat},${Number(p.price)},${p.unit},${Number(p.stock)||0},${p.note||''},${p.icon||'🛒'},${p.photo||''},${p.weight||''},${p.enabled!==false},NOW())
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,cat=EXCLUDED.cat,price=EXCLUDED.price,unit=EXCLUDED.unit,stock=EXCLUDED.stock,note=EXCLUDED.note,icon=EXCLUDED.icon,photo=EXCLUDED.photo,weight=EXCLUDED.weight,enabled=EXCLUDED.enabled,updated_at=NOW()
        RETURNING *`;
      return res.status(200).json({ok:true,product:rowToProduct(rows[0])});
    }
    if(body.action==='delete'){
      await sql`DELETE FROM products WHERE id=${Number(body.id)}`;
      return res.status(200).json({ok:true});
    }
    if(body.action==='toggle'){
      const rows=await sql`UPDATE products SET enabled=NOT enabled,updated_at=NOW() WHERE id=${Number(body.id)} RETURNING *`;
      return res.status(200).json({ok:true,product:rows[0]?rowToProduct(rows[0]):null});
    }
    if(body.action==='decrement'){
      const items=Array.isArray(body.items)?body.items:[];
      for(const item of items){
        const rows=await sql`UPDATE products SET stock=GREATEST(0,stock-${Number(item.quantity)||0}),updated_at=NOW() WHERE id=${Number(item.id)} AND stock>=${Number(item.quantity)||0} RETURNING *`;
        if(!rows.length) return res.status(409).json({ok:false,error:'Недостаточно товара: '+(item.name||item.id)});
      }
      const rows=await sql`SELECT * FROM products ORDER BY id`;
      return res.status(200).json({ok:true,products:rows.map(rowToProduct)});
    }
    return res.status(400).json({ok:false,error:'Неизвестное действие'});
  }catch(e){
    console.error(e);
    return res.status(500).json({ok:false,error:e.message||'Ошибка базы данных'});
  }
}
