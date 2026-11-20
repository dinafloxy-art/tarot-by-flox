// api/llm.js — серверная прослойка Vercel.
// Ключ fal хранится только в настройках Vercel (переменная FAL_KEY)
// и никогда не попадает в браузер или на GitHub.

const ALLOWED_MODELS = [
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
  'openai/gpt-4o'
];

const MAX_PROMPT_CHARS = 20000;
const MAX_SYSTEM_CHARS = 6000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ detail: 'Только POST' });
  }

  const key = process.env.FAL_KEY;
  if (!key) {
    return res.status(500).json({ detail: 'На сервере не задан FAL_KEY (Vercel → Settings → Environment Variables)' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { model, system_prompt, prompt } = body || {};

  if (!ALLOWED_MODELS.includes(model)) {
    return res.status(400).json({ detail: 'Недопустимая модель' });
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ detail: 'Пустой запрос' });
  }
  if (prompt.length > MAX_PROMPT_CHARS || (system_prompt || '').length > MAX_SYSTEM_CHARS) {
    return res.status(413).json({ detail: 'Слишком длинный запрос' });
  }

  try {
    const falRes = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: {
        Authorization: `Key ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, system_prompt: system_prompt || '', prompt })
    });
    const text = await falRes.text();
    res.status(falRes.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(text);
  } catch (err) {
    return res.status(502).json({ detail: 'Сервер ИИ недоступен' });
  }
}
