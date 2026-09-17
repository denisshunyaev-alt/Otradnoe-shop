import { authDb } from './_auth.js';

function cleanLogin(value) {
  return String(value || '').trim().toLowerCase();
}

function publicAdmin(r) {
  return {
    id: Number(r.id),
    login: r.login,
    role: r.role,
    active: r.active !== false,
    createdAt: r.created_at
      ? new Date(r.created_at).toLocaleString('ru-RU')
      : ''
  };
}

function validLogin(login) {
  return /^[a-zA-Z0-9._-]{3,40}$/.test(login);
}


export default async function handler(req, res) {

  try {

    const sql = await authDb();

    const action = String(
      req.query?.action ||
      req.body?.action ||
      ''
    );


    // Получить всех администраторов
    if (req.method === 'GET' && action === 'list') {

      const rows = await sql`
        SELECT id, login, role, active, created_at
        FROM admins
        ORDER BY created_at ASC
      `;

      return res.status(200).json({
        ok: true,
        admins: rows.map(publicAdmin)
      });
    }


    // Создать администратора
    if (req.method === 'POST' && action === 'create') {

      const login = cleanLogin(req.body?.login);

      if (!validLogin(login)) {
        return res.status(400).json({
          ok: false,
          error: 'Некорректный логин'
        });
      }


      const rows = await sql`
        INSERT INTO admins
        (login, role, active)
        VALUES
        (${login}, 'admin', true)
        RETURNING id, login, role, active, created_at
      `;


      return res.status(201).json({
        ok: true,
        admin: publicAdmin(rows[0])
      });
    }



    // Включить/выключить администратора
    if (req.method === 'POST' && action === 'toggle') {

      const targetId = Number(req.body?.id);


      if (!targetId) {
        return res.status(400).json({
          ok:false,
          error:'Не указан ID'
        });
      }


      const rows = await sql`
        UPDATE admins
        SET active = NOT active
        WHERE id=${targetId}
        RETURNING id,login,role,active,created_at
      `;


      if (!rows[0]) {
        return res.status(404).json({
          ok:false,
          error:'Администратор не найден'
        });
      }


      return res.status(200).json({
        ok:true,
        admin:publicAdmin(rows[0])
      });
    }




    // Удалить администратора
    if (req.method === 'POST' && action === 'delete') {

      const targetId = Number(req.body?.id);


      if (!targetId) {
        return res.status(400).json({
          ok:false,
          error:'Не указан ID'
        });
      }


      await sql`
        DELETE FROM admins
        WHERE id=${targetId}
      `;


      return res.status(200).json({
        ok:true
      });
    }




    // Проверка состояния (раньше была сессия)
    if (action === 'me') {

      return res.status(200).json({
        ok:true,
        admin:{
          id:1,
          login:'admin',
          role:'owner'
        }
      });

    }



    return res.status(400).json({
      ok:false,
      error:'Неизвестное действие'
    });



  } catch(e) {

    console.error(e);

    return res.status(500).json({
      ok:false,
      error:e.message || 'Ошибка сервера'
    });

  }

}
