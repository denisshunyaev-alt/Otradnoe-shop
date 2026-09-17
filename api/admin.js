
import { authDb } from './_auth.js';


function publicAdmin(r){
  return {
    id: Number(r.id),
    login: r.login,
    role: r.role,
    active: r.active !== false
  };
}


export default async function handler(req,res){

  try{

    const sql = await authDb();


    // получить текущего администратора
    if(req.method === 'GET'){

      const rows = await sql`
        SELECT id, login, role, active
        FROM admins
        ORDER BY id
        LIMIT 1
      `;


      return res.status(200).json({
        ok:true,
        admin: rows[0] ? publicAdmin(rows[0]) : null
      });

    }


    // список администраторов (если понадобится)
    if(req.method === 'POST' && req.body?.action === 'list'){

      const rows = await sql`
        SELECT id, login, role, active, created_at
        FROM admins
        ORDER BY id
      `;


      return res.status(200).json({
        ok:true,
        admins: rows.map(publicAdmin)
      });

    }


    return res.status(400).json({
      ok:false,
      error:'Неизвестный запрос'
    });


  }catch(e){

    console.error(e);

    return res.status(500).json({
      ok:false,
      error:e.message
    });

  }

}
