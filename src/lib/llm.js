// Все запросы к ИИ идут через нашу серверную функцию /api/llm (ключ спрятан на сервере)
export const requestDeepTarotLLM = async ({ systemPrompt, prompt, fastMode = false }) => {
  const preferredModels = fastMode
    ? ['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'openai/gpt-4o']
    : ['openai/gpt-4o', 'google/gemini-2.5-flash', 'openai/gpt-4o-mini'];

  let lastError = null;
  for (const model of preferredModels) {
    try {
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, system_prompt: systemPrompt, prompt })
      });
      const raw = await response.text();
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch (e) {
        throw new Error('Некорректный ответ сервера');
      }
      if (!response.ok) {
        throw new Error(data?.detail ? JSON.stringify(data.detail) : `Ошибка (${response.status})`);
      }
      const text = data.output || data.text || data.response || data.choices?.[0]?.message?.content;
      if (text && String(text).trim()) return String(text).trim();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Не удалось получить ответ от модели');
};
