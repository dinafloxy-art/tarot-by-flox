// Очистка ответа ИИ и красивое оформление текста с золотыми названиями карт
export const cleanAnalysisText = (text) =>
  String(text || '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Шаблон одного слова с учётом падежных окончаний: «Башня» → «Башни», «Башней»…
const wordPattern = (word) => {
  const yo = (s) => s.replace(/[её]/g, '[её]').replace(/[ЕЁ]/g, '[ЕЁ]');
  if (word.length <= 3) {
    return `${yo(escapeRe(word))}(?:а|у|е|ом|ами|ов)?`;
  }
  const stem = /[аяоеёиыуюйь]$/i.test(word) ? word.slice(0, -1) : word;
  return `${yo(escapeRe(stem))}\\p{L}{0,3}`;
};

const buildCardNameRegex = (cards) => {
  const names = [...new Set((cards || []).map((c) => c && c.name).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (!names.length) return null;
  const alts = names.map((n) => n.split(/\s+/).map(wordPattern).join('\\s+'));
  try {
    return new RegExp(`(^|[^\\p{L}])(${alts.join('|')})(?![\\p{L}])`, 'gu');
  } catch (e) {
    return null;
  }
};

export const formatReadableText = (text, cards = []) => {
  let html = escapeHtml(String(text || ''));
  const re = buildCardNameRegex(cards);
  if (re) {
    html = html.replace(re, (m, pre, name) => `${pre}<span class="card-name-gold">${name}</span>`);
  }
  return html
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 1em 0">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
};

export const nowRuDate = () =>
  new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });

// Плавная прокрутка к элементу после того, как React его нарисует
export const scrollToEl = (getEl, block = 'start', delay = 120) => {
  setTimeout(() => {
    const el = typeof getEl === 'string' ? document.getElementById(getEl) : getEl && getEl.current;
    if (el) el.scrollIntoView({ behavior: 'smooth', block });
  }, delay);
};
