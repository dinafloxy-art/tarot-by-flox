// Все запросы к ИИ идут через нашу серверную функцию /api/llm (ключ спрятан на сервере).
// Глубокие расклады и уточнения: Gemini Pro (последняя версия), при отказе или ошибке — Claude Sonnet 5.
// Быстрые режимы («Да или Нет», «Совет на сегодня»): Gemini Flash, запасной — Gemini Pro.
const DEEP_MODELS = ['~google/gemini-pro-latest', 'anthropic/claude-sonnet-5', 'google/gemini-2.5-flash'];
const FAST_MODELS = ['google/gemini-2.5-flash', '~google/gemini-pro-latest', 'anthropic/claude-sonnet-5'];

// Признаки отказа модели читать расклад: тогда пробуем следующую модель
const REFUSAL_RE =
  /(не могу (помочь|ответить|выполнить|сделать|дать|предсказ)|не в состоянии|не буду (гадать|делать|отвечать)|I can(no|['’])t|I['’]m (sorry|unable)|обратит(есь|ься) (в|к) (полици|специалист|врач)|не стану)/i;

const looksLikeRefusal = (text) => text.length < 1800 && REFUSAL_RE.test(text.slice(0, 600));

export const requestDeepTarotLLM = async ({ systemPrompt, prompt, fastMode = false, maxTokens }) => {
  const models = fastMode ? FAST_MODELS : DEEP_MODELS;
  const max_tokens = maxTokens || (fastMode ? 1000 : 2500);

  let lastError = null;
  for (const model of models) {
    try {
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, system_prompt: systemPrompt, prompt, max_tokens, temperature: 0.7 })
      });
      const raw = await response.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch (e) {
        throw new Error('Некорректный ответ сервера');
      }
      if (!response.ok || data?.error) {
        const d = data?.detail || data?.error;
        throw new Error(d ? (typeof d === 'string' ? d : JSON.stringify(d)) : `Ошибка (${response.status})`);
      }
      const text = String(data.output || data.text || data.response || data.choices?.[0]?.message?.content || '').trim();
      if (!text) throw new Error('Пустой ответ');
      if (looksLikeRefusal(text)) throw new Error('Модель отказалась читать расклад');
      return text;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Не удалось получить ответ от модели');
};
