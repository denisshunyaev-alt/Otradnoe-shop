export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { name, phone, pickup, items, total } = req.body || {};

    if (!name || !phone || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Некорректные данные заказа' });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({ ok: false, error: 'Telegram не настроен' });
    }

    const orderNumber = String(Date.now()).slice(-6);

    const lines = items.map(item =>
      `• ${item.name} — ${item.quantity} ${item.unit} · ${Number(item.price * item.quantity).toLocaleString('ru-RU')} ₽`
    );

    const message = [
      `🛒 <b>Новый заказ №${orderNumber}</b>`,
      ``,
      `<b>Имя:</b> ${escapeHtml(name)}`,
      `<b>Телефон:</b> ${escapeHtml(phone)}`,
      ``,
      `<b>Товары:</b>`,
      ...lines,
      ``,
      `<b>Итого:</b> ${Number(total).toLocaleString('ru-RU')} ₽`,
      `<b>Самовывоз:</b> ${escapeHtml(pickup || 'Москва, Олонецкая, 18')}`,
      `<b>Оплата:</b> при получении`
    ].join('\n');

    const tgResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const tgData = await tgResponse.json();

    if (!tgResponse.ok || !tgData.ok) {
      console.error('Telegram error:', tgData);
      return res.status(502).json({ ok: false, error: 'Telegram не принял сообщение' });
    }

    return res.status(200).json({ ok: true, orderNumber });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: 'Ошибка сервера' });
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
