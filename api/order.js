import { neon } from '@neondatabase/serverless';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  try{
    const {name,phone,pickup,items,total}=req.body||{};
    if(!name||!phone||!Array.isArray(items)||!items.length) return res.status(400).json({ok:false,error:'Некорректный заказ'});
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
    await sql`CREATE TABLE IF NOT EXISTS products (
      id BIGINT PRIMARY KEY,name TEXT NOT NULL,cat TEXT NOT NULL,price NUMERIC NOT NULL,unit TEXT NOT NULL,
      stock NUMERIC NOT NULL DEFAULT 0,note TEXT DEFAULT '',icon TEXT DEFAULT '🛒',photo TEXT DEFAULT '',weight TEXT DEFAULT '',enabled BOOLEAN NOT NULL DEFAULT TRUE,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    for(const item of items){
      const rows=await sql`UPDATE products SET stock=GREATEST(0,stock-${Number(item.quantity)||0}),updated_at=NOW()
        WHERE id=${Number(item.id)} AND enabled=true AND stock>=${Number(item.quantity)||0} RETURNING id`;
      if(!rows.length) return res.status(409).json({ok:false,error:'Недостаточно товара: '+(item.name||item.id)});
    }
    const number=Date.now();
    const rows=await sql`INSERT INTO orders (number,name,phone,pickup,items,total,status) VALUES (${number},${name},${phone},${pickup||'Москва, Олонецкая, 18'},${JSON.stringify(items)},${Number(total)||0},'Новый') RETURNING number`;
    const text=['🛒 Новый заказ №'+number,'','Имя: '+name,'Телефон: '+phone,'Самовывоз: '+(pickup||'Москва, Олонецкая, 18'),''].concat(items.map(x=>`${x.name} — ${x.quantity} ${x.unit} × ${x.price} ₽`),['','Итого: '+(Number(total)||0).toLocaleString('ru-RU')+' ₽']).join('\n');
    const tg=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text})});
    const tgData=await tg.json().catch(()=>({}));
    if(!tg.ok || !tgData.ok) console.error('Telegram error:',tgData);
    return res.status(200).json({ok:true,orderNumber:rows[0].number});
  }catch(e){
    console.error(e);
    return res.status(500).json({ok:false,error:e.message||'Ошибка сервера'});
  }
}
