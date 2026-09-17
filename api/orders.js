import { neon } from '@neondatabase/serverless';

async function db(){
  const sql=neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    number BIGINT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    pickup TEXT NOT NULL,
    items JSONB NOT NULL,
    total NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'Новый',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  return sql;
}
export default async function handler(req,res){
  try{
    const sql=await db();
    if(req.method==='GET'){
      const rows=await sql`SELECT id,number,name,phone,pickup,items,total,status,created_at FROM orders ORDER BY created_at DESC LIMIT 200`;
      return res.status(200).json({ok:true,orders:rows.map(r=>({id:Number(r.id),number:Number(r.number),name:r.name,phone:r.phone,pickup:r.pickup,items:r.items,total:Number(r.total),status:r.status,createdAt:new Date(r.created_at).toLocaleString('ru-RU')}))});
    }
    if(req.method==='PATCH'){
      const {id,status}=req.body||{};
      const allowed=['Новый','Собирается','Готов к выдаче','Выдан','Отменён'];
      if(!id||!allowed.includes(status)) return res.status(400).json({ok:false,error:'Некорректный статус'});
      await sql`UPDATE orders SET status=${status} WHERE id=${Number(id)}`;
      return res.status(200).json({ok:true});
    }
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }catch(e){console.error(e);return res.status(500).json({ok:false,error:e.message||'Ошибка базы данных'});}
}
