// Серверная функция Vercel: ключ fal хранится только в переменной окружения FAL_KEY.
// Запросы идут через шлюз fal OpenRouter (openrouter/router), где доступны Gemini Pro и Claude.
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
    const { model, system_prompt, prompt, max_tokens, temperature } = body;
    if (!prompt || !model) {
      res.status(400).json({ detail: 'Пустой запрос' });
      return;
    }
    const payload = { model, prompt, system_prompt: system_prompt || '' };
    if (Number.isFinite(max_tokens)) payload.max_tokens = Math.min(4000, Math.max(100, Math.round(max_tokens)));
    if (Number.isFinite(temperature)) payload.temperature = Math.min(2, Math.max(0, temperature));
    const falRes = await fetch('https://fal.run/openrouter/router', {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
