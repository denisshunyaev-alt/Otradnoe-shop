import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { name, phone, pickup, items, total } = req.body || {};

    if (!name || !phone || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Некорректные данные заказа'
      });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Создаём таблицу заказов, если её ещё нет
    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        id BIGSERIAL PRIMARY KEY,
        number BIGINT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        pickup TEXT NOT NULL,
        items JSONB NOT NULL,
        total NUMERIC NOT NULL,
        status TEXT NOT NULL DEFAULT 'Новый',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Номер заказа
    const orderNumber = Date.now();

    // Сохраняем заказ в Neon
    await sql`
      INSERT INTO orders
  (number, name, phone, pickup, items, total, status)
     VALUES
  (
    ${orderNumber},
    ${name},
    ${phone},
    ${pickup || 'Москва, Олонецкая, 18'},
    ${JSON.stringify(items)},
    ${Number(total) || 0},
    'Новый'
  )
    `;

    // Уменьшаем остатки товаров
    for (const item of items) {
      await sql`
        UPDATE products
        SET
          stock = GREATEST(0, stock - ${Number(item.quantity) || 0}),
          updated_at = NOW()
        WHERE id = ${Number(item.id)}
          AND enabled = true
      `;
    }

    // Формируем сообщение для Telegram
    const lines = items.map(item =>
      `${item.name} — ${item.quantity} ${item.unit} × ${Number(item.price * item.quantity).toLocaleString('ru-RU')} ₽`
    );

    const message = [
      `🛒 Новый заказ №${orderNumber}`,
      '',
      `Имя: ${name}`,
      `Телефон: ${phone}`,
      `Самовывоз: ${pickup || 'Москва, Олонецкая, 18'}`,
      '',
      ...lines,
      '',
      `Итого: ${(Number(total) || 0).toLocaleString('ru-RU')} ₽`,
      '',
      'Статус: Новый'
    ].join('\n');

    // Отправляем заказ в Telegram
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (token && chatId) {
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: message
          })
        }
      );

      const telegramData = await telegramResponse.json().catch(() => ({}));

      if (!telegramResponse.ok || !telegramData.ok) {
        console.error('Telegram error:', telegramData);
      }
    }

    return res.status(200).json({
      ok: true,
      orderNumber
    });

  } catch (error) {
    console.error('Order error:', error);

    return res.status(500).json({
      ok: false,
      error: error.message || 'Ошибка сервера'
    });
  }
}
