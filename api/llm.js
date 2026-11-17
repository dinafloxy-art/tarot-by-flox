// Серверная функция Vercel: ключ fal хранится только в переменной окружения FAL_KEY
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ detail: 'Method not allowed' });
    return;
  }
  const key = (process.env.FAL_KEY || '').trim();
  if (!key) {
    res.status(500).json({ detail: 'На сервере не задан FAL_KEY (Vercel > Settings > Environment Variables)' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { model, system_prompt, prompt } = body;
    if (!prompt) {
      res.status(400).json({ detail: 'Пустой запрос' });
      return;
    }
    const falRes = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, system_prompt, prompt })
    });
    const text = await falRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { detail: text.slice(0, 300) };
    }
    res.status(falRes.status).json(data);
  } catch (err) {
    res.status(500).json({ detail: String(err && err.message ? err.message : err) });
  }
}
