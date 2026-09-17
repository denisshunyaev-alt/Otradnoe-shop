import { authDb } from './_auth.js';

function publicAdmin(r){
 return {
   id:Number(r.id),
   login:r.login,
   role:r.role,
   active:r.active!==false
 };
}


export default async function handler(req,res){

 try{

   const sql=await authDb();

   const action=String(
     req.query?.action ||
     req.body?.action ||
     'me'
   );


   // просто показать администратора
   if(req.method==='GET' && action==='me'){

     const rows=await sql`
       SELECT id,login,role,active
       FROM admins
       LIMIT 1
     `;

     return res.json({
       ok:true,
       admin:rows[0] ? publicAdmin(rows[0]) : null
     });

   }


   // список товаров/админов без проверки
   if(req.method==='GET' && action==='list'){

     const rows=await sql`
       SELECT id,login,role,active,created_at
       FROM admins
       ORDER BY id
     `;

     return res.json({
       ok:true,
       admins:rows.map(publicAdmin)
     });

   }


   // выход больше не нужен
   if(req.method==='POST' && action==='logout'){
      return res.json({ok:true});
   }


   return res.status(400).json({
     ok:false,
     error:'Неизвестное действие'
   });


 }catch(e){

   console.error(e);

   return res.status(500).json({
     ok:false,
     error:e.message
   });

 }

}
