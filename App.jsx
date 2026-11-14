// ... existing code ...
// Вызов флагманской модели Google Gemini 2.5 Pro (с автоматическим резервом на Gemini 2.5 Flash и Claude 3.5 Sonnet)
const requestDeepTarotLLM = async ({ cleanKey, systemPrompt, prompt }) => {
  const preferredModels = [
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o'
  ];

  let lastError = null;
// ... existing code ...
