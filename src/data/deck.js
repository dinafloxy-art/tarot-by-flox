// --- КОЛОДА ТАРО, ТАБЛИЦА «ДА / НЕТ» И ЗАГРУЗКА КАРТИНОК ---

export const YES_NO_LOOKUP = {
  // Старшие Арканы (0 - XXI)
  ar00: { type: 'YES', label: 'Да (новое начало)' },
  ar01: { type: 'YES', label: 'Да' },
  ar02: { type: 'MAYBE', label: 'Неясно / пока нет информации' },
  ar03: { type: 'YES', label: 'Да' },
  ar04: { type: 'YES', label: 'Да' },
  ar05: { type: 'YES', label: 'Да' },
  ar06: { type: 'YES', label: 'Да, если выбор сделан осознанно' },
  ar07: { type: 'YES', label: 'Да' },
  ar08: { type: 'YES', label: 'Да' },
  ar09: { type: 'MAYBE', label: 'Не сейчас' },
  ar10: { type: 'YES', label: 'Да' },
  ar11: { type: 'YES', label: 'Да, если это справедливо' },
  ar12: { type: 'NO', label: 'Нет / не сейчас' },
  ar13: { type: 'NO', label: 'Нет (в текущем виде)' },
  ar14: { type: 'MAYBE', label: 'Да, но постепенно' },
  ar15: { type: 'NO', label: 'Нет (или «да», но с высокой ценой)' },
  ar16: { type: 'NO', label: 'Нет' },
  ar17: { type: 'YES', label: 'Да' },
  ar18: { type: 'MAYBE', label: 'Неясно' },
  ar19: { type: 'YES', label: 'Однозначно да' },
  ar20: { type: 'YES', label: 'Да' },
  ar21: { type: 'YES', label: 'Однозначно да' },

  // Жезлы (wa)
  waac: { type: 'YES', label: 'Да' },
  wa02: { type: 'YES', label: 'Да' },
  wa03: { type: 'YES', label: 'Да' },
  wa04: { type: 'YES', label: 'Да' },
  wa05: { type: 'MAYBE', label: 'Да, через борьбу' },
  wa06: { type: 'YES', label: 'Да' },
  wa07: { type: 'MAYBE', label: 'Да, через борьбу' },
  wa08: { type: 'YES', label: 'Да' },
  wa09: { type: 'YES', label: 'Да' },
  wa10: { type: 'YES', label: 'Да' },
  wapa: { type: 'MAYBE', label: 'Скорее да' },
  wakn: { type: 'YES', label: 'Да' },
  waqu: { type: 'YES', label: 'Да' },
  waki: { type: 'YES', label: 'Да' },

  // Кубки (cu)
  cuac: { type: 'YES', label: 'Да' },
  cu02: { type: 'YES', label: 'Да' },
  cu03: { type: 'YES', label: 'Да' },
  cu04: { type: 'YES', label: 'Да' },
  cu05: { type: 'NO', label: 'Нет' },
  cu06: { type: 'YES', label: 'Да' },
  cu07: { type: 'MAYBE', label: 'Неясно' },
  cu08: { type: 'NO', label: 'Нет (нужно уйти)' },
  cu09: { type: 'YES', label: 'Да' },
  cu10: { type: 'YES', label: 'Да' },
  cupa: { type: 'YES', label: 'Да' },
  cukn: { type: 'YES', label: 'Да' },
  cuqu: { type: 'YES', label: 'Да' },
  cuki: { type: 'YES', label: 'Да' },

  // Мечи (sw)
  swac: { type: 'YES', label: 'Да' },
  sw02: { type: 'MAYBE', label: 'Неясно' },
  sw03: { type: 'NO', label: 'Нет' },
  sw04: { type: 'MAYBE', label: 'Не сейчас' },
  sw05: { type: 'NO', label: 'Нет' },
  sw06: { type: 'YES', label: 'Да' },
  sw07: { type: 'NO', label: 'Нет' },
  sw08: { type: 'NO', label: 'Нет' },
  sw09: { type: 'NO', label: 'Нет' },
  sw10: { type: 'NO', label: 'Нет' },
  swpa: { type: 'MAYBE', label: 'Неясно' },
  swkn: { type: 'MAYBE', label: 'Да, но импульсивно' },
  swqu: { type: 'YES', label: 'Да' },
  swki: { type: 'YES', label: 'Да' },

  // Пентакли (pe)
  peac: { type: 'YES', label: 'Да' },
  pe02: { type: 'YES', label: 'Да' },
  pe03: { type: 'YES', label: 'Да' },
  pe04: { type: 'YES', label: 'Да' },
  pe05: { type: 'NO', label: 'Нет' },
  pe06: { type: 'YES', label: 'Да' },
  pe07: { type: 'MAYBE', label: 'Не сейчас' },
  pe08: { type: 'MAYBE', label: 'Да, через труд' },
  pe09: { type: 'YES', label: 'Да' },
  pe10: { type: 'YES', label: 'Да' },
  pepa: { type: 'YES', label: 'Да' },
  pekn: { type: 'YES', label: 'Да' },
  pequ: { type: 'YES', label: 'Да' },
  peki: { type: 'YES', label: 'Да' }
};

// Итоговый вердикт по 3 картам на основе таблицы
export const computeYesNoVerdictFromCards = (threeCards) => {
  const entries = threeCards.map((c) => YES_NO_LOOKUP[c.code] || { type: 'MAYBE', label: 'Неясно' });
  const center = entries[1] || entries[0];
  const yesCount = entries.filter((e) => e.type === 'YES').length;
  const noCount = entries.filter((e) => e.type === 'NO').length;

  let finalVerdict = center.label.toUpperCase();
  if (yesCount >= 2 && center.type !== 'NO') {
    finalVerdict = center.type === 'YES' ? center.label.toUpperCase() : 'СКОРЕЕ ДА';
  } else if (noCount >= 2 && center.type !== 'YES') {
    finalVerdict = center.type === 'NO' ? center.label.toUpperCase() : 'СКОРЕЕ НЕТ';
  }
  return { finalVerdict, breakdown: entries };
};

const SUITS = [
  { id: 'wa', altId: 'wa', name: 'Жезлов', symbol: '🪄', color: '#e89b46' },
  { id: 'cu', altId: 'cu', name: 'Кубков', symbol: '🏆', color: '#63b3ed' },
  { id: 'sw', altId: 'sw', name: 'Мечей', symbol: '⚔️', color: '#cbd5e0' },
  { id: 'pe', altId: 'pa', name: 'Пентаклей', symbol: '🪙', color: '#ecc94b' }
];

const RANKS = [
  { code: 'ac', name: 'Туз', label: 'I' },
  { code: '02', name: 'Двойка', label: 'II' },
  { code: '03', name: 'Тройка', label: 'III' },
  { code: '04', name: 'Четверка', label: 'IV' },
  { code: '05', name: 'Пятерка', label: 'V' },
  { code: '06', name: 'Шестерка', label: 'VI' },
  { code: '07', name: 'Семерка', label: 'VII' },
  { code: '08', name: 'Восьмерка', label: 'VIII' },
  { code: '09', name: 'Девятка', label: 'IX' },
  { code: '10', name: 'Десятка', label: 'X' },
  { code: 'pa', name: 'Паж', label: 'Паж' },
  { code: 'kn', name: 'Рыцарь', label: 'Рыцарь' },
  { code: 'qu', name: 'Королева', label: 'Королева' },
  { code: 'ki', name: 'Король', label: 'Король' }
];

const MAJORS = [
  'Шут', 'Маг', 'Верховная Жрица', 'Императрица', 'Император', 'Иерофант',
  'Влюбленные', 'Колесница', 'Сила', 'Отшельник', 'Колесо Фортуны',
  'Справедливость', 'Повешенный', 'Смерть', 'Умеренность', 'Дьявол',
  'Башня', 'Звезда', 'Луна', 'Солнце', 'Страшный Суд', 'Мир'
];

const ROMAN_MAJORS = [
  '0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'
];

export const createFallbackCardDataUri = (title, subtitle, symbol = '✦', accent = '#e5b05c') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 520" width="300" height="520">
    <defs>
      <radialGradient id="bg" cx="50%" cy="42%" r="68%">
        <stop offset="0%" stop-color="#2c1654"/>
        <stop offset="60%" stop-color="#14092b"/>
        <stop offset="100%" stop-color="#070312"/>
      </radialGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fff2c2"/>
        <stop offset="50%" stop-color="${accent}"/>
        <stop offset="100%" stop-color="#9c6b21"/>
      </linearGradient>
    </defs>
    <rect width="300" height="520" fill="url(#bg)"/>
    <rect x="14" y="14" width="272" height="492" rx="14" fill="none" stroke="url(#gold)" stroke-width="3.5"/>
    <rect x="24" y="24" width="252" height="472" rx="10" fill="none" stroke="url(#gold)" stroke-width="1.2" stroke-dasharray="6 4" opacity="0.75"/>
    <circle cx="150" cy="235" r="92" fill="none" stroke="url(#gold)" stroke-width="2" opacity="0.55"/>
    <text x="150" y="92" text-anchor="middle" fill="#ffe3a8" font-family="Philosopher, Georgia, serif" font-size="24" font-weight="bold" letter-spacing="2">${subtitle}</text>
    <text x="150" y="254" text-anchor="middle" fill="#ffe3a8" font-family="serif" font-size="68">${symbol}</text>
    <text x="150" y="432" text-anchor="middle" fill="#fff6e0" font-family="Cormorant Garamond, Georgia, serif" font-size="22" font-weight="bold">${title}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Приоритет: папка public (мгновенно) -> зеркала CDN
const buildCardUrls = (primaryCode, secondaryCode = primaryCode) => [
  `/media/cards/${primaryCode}.webp`,
  `/${primaryCode}.jpg`,
  `https://cdn.jsdelivr.net/gh/ekelen/tarot-api@master/static/cards/${primaryCode}.jpg`,
  `https://raw.githubusercontent.com/ekelen/tarot-api/master/static/cards/${primaryCode}.jpg`,
  `https://sacred-texts.com/tarot/pkt/img/${secondaryCode}.jpg`
];

export const DECK = (() => {
  const deck = [];
  MAJORS.forEach((name, i) => {
    const code = `ar${i.toString().padStart(2, '0')}`;
    const urls = buildCardUrls(code, code);
    deck.push({
      code,
      name,
      img: urls[0],
      urls,
      fallbackSvg: createFallbackCardDataUri(name, ROMAN_MAJORS[i], '✧', '#e5b05c')
    });
  });
  SUITS.forEach((suit) =>
    RANKS.forEach((rank) => {
      const primaryCode = `${suit.id}${rank.code}`;
      const secondaryCode = `${suit.altId}${rank.code}`;
      const fullName = `${rank.name} ${suit.name}`;
      const urls = buildCardUrls(primaryCode, secondaryCode);
      deck.push({
        code: primaryCode,
        name: fullName,
        img: urls[0],
        urls,
        fallbackSvg: createFallbackCardDataUri(fullName, rank.label, suit.symbol, suit.color)
      });
    })
  );
  return deck;
})();

export const findDeckCard = (card) =>
  DECK.find((d) => d.code === card?.code || d.name === card?.name) || card;

// Честное перемешивание (Фишер–Йетс)
export const drawCards = (count, pool = DECK) => {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
};

export const RESOLVED_CARD_CACHE = new Map();

export const preloadSingleCard = (card) => {
  if (!card) return Promise.resolve('');
  if (RESOLVED_CARD_CACHE.has(card.code)) {
    return Promise.resolve(RESOLVED_CARD_CACHE.get(card.code));
  }
  const candidates = card.urls || (card.img ? [card.img] : []);
  return new Promise((resolve) => {
    let idx = 0;
    const tryNext = () => {
      if (idx >= candidates.length) {
        const fb = card.fallbackSvg || createFallbackCardDataUri(card.name || 'Таро', '✦');
        RESOLVED_CARD_CACHE.set(card.code, fb);
        resolve(fb);
        return;
      }
      const url = candidates[idx++];
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        RESOLVED_CARD_CACHE.set(card.code, url);
        resolve(url);
      };
      img.onerror = tryNext;
      img.src = url;
    };
    tryNext();
  });
};
