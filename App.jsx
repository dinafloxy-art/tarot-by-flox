import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  BookOpen,
  ChevronLeft,
  Upload,
  Film,
  Music,
  Check,
  X,
  Trash2,
  Send,
  KeyRound,
  Copy
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';

// --- ИНИЦИАЛИЗАЦИЯ FIREBASE (ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ ИСТОРИИ) ---
let app = null;
let auth = null;
let db = null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'tarot-by-flox-app';

try {
  const rawConfig =
    typeof __firebase_config !== 'undefined' && __firebase_config
      ? __firebase_config
      : typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FIREBASE_CONFIG
      ? import.meta.env.VITE_FIREBASE_CONFIG
      : null;
  if (rawConfig) {
    const firebaseConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.warn('Firebase init fallback:', e);
}

const FAL_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FAL_KEY) ||
  'fal_sk_93501a40318d4047a6d3c501918eaae0:bfe0578b8aaf2c3b74dda9f90728e7d9';

// Автоматическое определение: запущен ли сайт внутри песочницы превью или уже опубликован на Vercel
const IS_SANDBOX_PREVIEW =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('googleusercontent') ||
    window.location.hostname.includes('scf.usercontent') ||
    window.location.protocol === 'blob:');

// Вызов мощной языковой модели (Claude 3.5 Sonnet с автоматическим фоллбэком на GPT-4o)
const requestDeepTarotLLM = async ({ cleanKey, systemPrompt, prompt }) => {
  const preferredModels = [
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'openai/gpt-4o-mini'
  ];

  let lastError = null;

  for (const modelName of preferredModels) {
    try {
      const response = await fetch('https://fal.run/fal-ai/any-llm', {
        method: 'POST',
        headers: {
          Authorization: `Key ${cleanKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          system_prompt: systemPrompt,
          prompt
        })
      });

      const responseText = await response.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error('Некорректный ответ сервера');
      }

      if (!response.ok) {
        throw new Error(data?.detail ? JSON.stringify(data.detail) : `Ошибка (${response.status})`);
      }

      const rawText =
        data.output || data.text || data.response || data.choices?.[0]?.message?.content;
      if (rawText && String(rawText).trim().length > 0) {
        return String(rawText).trim();
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Не удалось получить ответ от модели');
};

// ТОЧНЫЕ КОДЫ ВСЕХ 78 КАРТ КОЛОДЫ РАЙДЕРА-УЭЙТА (PKT STANDARD):
// Туз = ac, 2..10 = 02..10, Паж = pa, Рыцарь = kn, Королева = qu, Король = ki
// Масти: Жезлы = wa, Кубки = cu, Мечи = sw, Пентакли = pa
const SUITS = [
  { id: 'wa', name: 'Жезлов', symbol: '🪄', color: '#e89b46' },
  { id: 'cu', name: 'Кубков', symbol: '🏆', color: '#63b3ed' },
  { id: 'sw', name: 'Мечей', symbol: '⚔️', color: '#cbd5e0' },
  { id: 'pa', name: 'Пентаклей', symbol: '🪙', color: '#ecc94b' }
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

// Генерация встроенного золотого SVG-аркана (мгновенная подстраховка, чтобы НИКОГДА не было битой иконки)
const createFallbackCardDataUri = (title, subtitle, symbol = '✦', accent = '#e5b05c') => {
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
    <circle cx="150" cy="235" r="72" fill="none" stroke="url(#gold)" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.45"/>
    <polygon points="150,125 174,202 252,202 189,248 212,324 150,278 88,324 111,248 48,202 126,202" fill="url(#gold)" opacity="0.22"/>
    <text x="150" y="92" text-anchor="middle" fill="#ffe3a8" font-family="Philosopher, Georgia, serif" font-size="24" font-weight="bold" letter-spacing="2">${subtitle}</text>
    <text x="150" y="254" text-anchor="middle" fill="#ffe3a8" font-family="serif" font-size="68">${symbol}</text>
    <text x="150" y="432" text-anchor="middle" fill="#fff6e0" font-family="Cormorant Garamond, Georgia, serif" font-size="22" font-weight="bold">${title}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// Формирование всех 78 карт с несколькими быстрыми CDN-зеркалами + встроенным векторным арканом
const buildCardUrls = (code) => [
  `https://cdn.jsdelivr.net/gh/ekelen/tarot-api@master/static/cards/${code}.jpg`,
  `https://raw.githubusercontent.com/ekelen/tarot-api/master/static/cards/${code}.jpg`,
  `https://sacred-texts.com/tarot/pkt/img/${code}.jpg`,
  `https://www.sacred-texts.com/tarot/pkt/img/${code}.jpg`
];

const DECK = (() => {
  const deck = [];
  MAJORS.forEach((name, i) => {
    const code = `ar${i.toString().padStart(2, '0')}`;
    const urls = buildCardUrls(code);
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
      const code = `${suit.id}${rank.code}`;
      const fullName = `${rank.name} ${suit.name}`;
      const urls = buildCardUrls(code);
      deck.push({
        code,
        name: fullName,
        img: urls[0],
        urls,
        fallbackSvg: createFallbackCardDataUri(fullName, rank.label, suit.symbol, suit.color)
      });
    })
  );
  return deck;
})();

// Глобальный кэш предзагруженных URL картинок, чтобы все 78 карт открывались мгновенно за 0 мс
const RESOLVED_CARD_CACHE = new Map();

const preloadSingleCard = (card) => {
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

// Компонент безотказной отрисовки карты Таро
const TarotCardImage = ({ card, style = {} }) => {
  const cardInDeck = DECK.find((d) => d.name === card?.name || d.code === card?.code) || card;
  const candidates = cardInDeck?.urls || (card?.img ? [card.img] : []);
  const fallbackUri =
    cardInDeck?.fallbackSvg || createFallbackCardDataUri(card?.name || 'Аркан Таро', '✦');

  const [srcIndex, setSrcIndex] = useState(0);
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    if (cardInDeck?.code && RESOLVED_CARD_CACHE.has(cardInDeck.code)) {
      return RESOLVED_CARD_CACHE.get(cardInDeck.code);
    }
    return candidates[0] || fallbackUri;
  });

  useEffect(() => {
    const target = DECK.find((d) => d.name === card?.name || d.code === card?.code) || card;
    const urls = target?.urls || (card?.img ? [card.img] : []);
    const fb = target?.fallbackSvg || createFallbackCardDataUri(card?.name || 'Аркан Таро', '✦');
    setSrcIndex(0);
    if (target?.code && RESOLVED_CARD_CACHE.has(target.code)) {
      setResolvedSrc(RESOLVED_CARD_CACHE.get(target.code));
    } else {
      setResolvedSrc(urls[0] || fb);
    }
  }, [card?.name, card?.code, card?.img]);

  const handleError = () => {
    const nextIdx = srcIndex + 1;
    if (nextIdx < candidates.length) {
      setSrcIndex(nextIdx);
      setResolvedSrc(candidates[nextIdx]);
    } else {
      setResolvedSrc(fallbackUri);
    }
  };

  const handleLoad = () => {
    if (cardInDeck?.code && resolvedSrc) {
      RESOLVED_CARD_CACHE.set(cardInDeck.code, resolvedSrc);
    }
  };

  return (
    <img
      src={resolvedSrc || fallbackUri}
      alt={card?.name || 'Карта Таро'}
      onError={handleError}
      onLoad={handleLoad}
      style={style}
    />
  );
};

// Ультра-детализированный SVG-дубликат вашего стола на фиолетово-серебристом облаке
const FloatingTableOnCloudSVG = ({ className = '', style = {} }) => (
  <svg
    viewBox="0 0 1920 1098"
    className={className}
    style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', ...style }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <radialGradient id="cloudMain" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#e8dff5" stopOpacity="0.98" />
        <stop offset="45%" stopColor="#b79fd9" stopOpacity="0.95" />
        <stop offset="72%" stopColor="#6c4d9c" stopOpacity="0.88" />
        <stop offset="90%" stopColor="#3c2266" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#160c28" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="cloudPuffLight" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#f5effc" stopOpacity="0.95" />
        <stop offset="55%" stopColor="#ae94d4" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#4f337d" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="cloudGoldGlow" cx="50%" cy="50%" r="48%">
        <stop offset="55%" stopColor="#ffcc66" stopOpacity="0.45" />
        <stop offset="78%" stopColor="#d4882a" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#d4882a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="woodOuter" cx="48%" cy="46%" r="52%">
        <stop offset="0%" stopColor="#7a4928" />
        <stop offset="55%" stopColor="#563018" />
        <stop offset="85%" stopColor="#3d200e" />
        <stop offset="100%" stopColor="#241105" />
      </radialGradient>
      <radialGradient id="woodInner" cx="46%" cy="44%" r="50%">
        <stop offset="0%" stopColor="#8c5530" />
        <stop offset="45%" stopColor="#6e3f20" />
        <stop offset="85%" stopColor="#4c2912" />
        <stop offset="100%" stopColor="#331908" />
      </radialGradient>
      <radialGradient id="amethystGrad" cx="40%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#e0b3ff" />
        <stop offset="45%" stopColor="#9933ff" />
        <stop offset="85%" stopColor="#4b0082" />
        <stop offset="100%" stopColor="#1f0036" />
      </radialGradient>
      <radialGradient id="crystalOrb" cx="35%" cy="30%" r="65%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="25%" stopColor="#e2cbf7" stopOpacity="0.85" />
        <stop offset="65%" stopColor="#8a5cb8" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#381c57" stopOpacity="0.95" />
      </radialGradient>
      <radialGradient id="candleFlame" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="35%" stopColor="#ffe596" />
        <stop offset="70%" stopColor="#ff9d2e" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#ff6a00" stopOpacity="0" />
      </radialGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="22" stdDeviation="28" floodColor="#090314" floodOpacity="0.85" />
      </filter>
      <filter id="itemShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000000" floodOpacity="0.75" />
      </filter>
    </defs>

    <g>
      <ellipse cx="960" cy="560" rx="790" ry="430" fill="url(#cloudMain)" />
      {[
        [370, 520, 230, 185], [460, 340, 220, 175], [680, 230, 250, 170],
        [960, 195, 280, 160], [1240, 240, 250, 175], [1460, 360, 230, 180],
        [1540, 550, 240, 195], [1430, 740, 240, 180], [1210, 860, 260, 175],
        [950, 895, 290, 165], [670, 855, 260, 175], [460, 730, 235, 180],
        [290, 600, 180, 145], [1620, 620, 175, 140]
      ].map(([cx, cy, rx, ry], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#cloudPuffLight)" />
      ))}
      <circle cx="936" cy="536" r="445" fill="url(#cloudGoldGlow)" />
      {[
        [240, 420, 3.5], [285, 690, 4], [420, 890, 3], [590, 955, 4.5],
        [1360, 920, 3.5], [1590, 780, 4], [1680, 460, 3.5], [1490, 220, 4],
        [520, 195, 3.5], [820, 130, 3], [1140, 145, 4], [330, 310, 3]
      ].map(([x, y, r], idx) => (
        <circle key={idx} cx={x} cy={y} r={r} fill="#ffe194" opacity="0.85" />
      ))}
    </g>

    <g filter="url(#softShadow)">
      <circle cx="935" cy="536" r="355" fill="url(#woodOuter)" stroke="#2b1406" strokeWidth="8" />
      <circle cx="935" cy="536" r="342" fill="none" stroke="#9c6b3b" strokeWidth="6" strokeDasharray="16 10" opacity="0.55" />
      <circle cx="935" cy="536" r="330" fill="none" stroke="#301708" strokeWidth="4" />
      <circle cx="935" cy="536" r="245" fill="none" stroke="#d9a752" strokeWidth="2.5" opacity="0.8" />
      <circle cx="935" cy="536" r="222" fill="url(#woodInner)" stroke="#e5b563" strokeWidth="2.5" opacity="0.95" />
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 935 + Math.cos(rad) * 245;
        const y1 = 536 + Math.sin(rad) * 245;
        const x2 = 935 + Math.cos(rad) * 330;
        const y2 = 536 + Math.sin(rad) * 330;
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2a1306" strokeWidth="2" opacity="0.65" />;
      })}
      <ellipse cx="935" cy="536" rx="190" ry="165" fill="none" stroke="#42220d" strokeWidth="2" opacity="0.4" />
      <ellipse cx="935" cy="542" rx="145" ry="120" fill="none" stroke="#42220d" strokeWidth="1.5" opacity="0.35" />
    </g>

    <g filter="url(#itemShadow)">
      <g transform="translate(735, 325) rotate(-38)">
        <rect x="-36" y="-54" width="76" height="112" rx="7" fill="#d49b3b" />
        <rect x="-39" y="-57" width="76" height="112" rx="7" fill="#f2c96d" />
        <rect x="-42" y="-60" width="76" height="112" rx="7" fill="#2c1d52" stroke="#e8ba5a" strokeWidth="3" />
        <rect x="-35" y="-53" width="62" height="98" rx="4" fill="none" stroke="#e8ba5a" strokeWidth="1" opacity="0.7" />
      </g>
      {[
        [935, 246],
        [935, 818],
        [635, 518],
        [1230, 518]
      ].map(([cx, cy], idx) => (
        <g key={idx} transform={`translate(${cx}, ${cy})`}>
          <circle cx="0" cy="0" r="24" fill="#a86e3b" stroke="#4a280d" strokeWidth="2" />
          <circle cx="0" cy="0" r="19" fill="#fae2b8" />
          <circle cx="0" cy="0" r="26" fill="url(#candleFlame)" />
          <circle cx="0" cy="-2" r="6" fill="#ffffff" />
        </g>
      ))}
      {[
        { x: 792, y: 274, rot: -20, glyph: 'ᚠ' },
        { x: 826, y: 298, rot: 15, glyph: 'ᚢ' },
        { x: 853, y: 256, rot: -10, glyph: 'ᚦ' },
        { x: 883, y: 242, rot: 8, glyph: 'ᚨ' },
        { x: 1002, y: 256, rot: 18, glyph: 'ᚱ' },
        { x: 1208, y: 452, rot: -25, glyph: 'ᚷ' },
        { x: 642, y: 604, rot: 14, glyph: 'ᚹ' },
        { x: 678, y: 615, rot: -18, glyph: 'ᚺ' },
        { x: 662, y: 648, rot: 25, glyph: 'ᚾ' },
        { x: 885, y: 812, rot: 5, glyph: 'ᛟ' }
      ].map((r, i) => (
        <g key={i} transform={`translate(${r.x}, ${r.y}) rotate(${r.rot})`}>
          <ellipse cx="0" cy="0" rx="14" ry="18" fill="#deb37c" stroke="#6e4720" strokeWidth="2" />
          <text x="0" y="6" textAnchor="middle" fill="#fff3cf" fontSize="18" fontWeight="bold" style={{ fontFamily: 'serif' }}>
            {r.glyph}
          </text>
        </g>
      ))}
      <g transform="translate(1148, 326)">
        <circle cx="0" cy="0" r="34" fill="url(#crystalOrb)" stroke="#d9b8ff" strokeWidth="1.5" />
        <ellipse cx="-12" cy="-12" rx="10" ry="6" transform="rotate(-30 -12 -12)" fill="#ffffff" opacity="0.7" />
      </g>
      {[
        { x: 1090, y: 280, scale: 0.9, rot: 15 },
        { x: 1212, y: 598, scale: 1.0, rot: -20 },
        { x: 710, y: 705, scale: 1.15, rot: 30 }
      ].map((am, i) => (
        <g key={i} transform={`translate(${am.x}, ${am.y}) rotate(${am.rot}) scale(${am.scale})`}>
          <polygon points="-28,10 -18,-25 5,-32 28,-12 22,22 -10,28" fill="#2e084f" />
          <polygon points="-20,5 -12,-22 4,-20 0,8" fill="url(#amethystGrad)" stroke="#e6ccff" strokeWidth="0.8" />
          <polygon points="0,-18 18,-24 24,0 6,12" fill="url(#amethystGrad)" stroke="#e6ccff" strokeWidth="0.8" />
          <polygon points="-14,10 6,2 18,18 -4,24" fill="url(#amethystGrad)" stroke="#e6ccff" strokeWidth="0.8" />
          <polygon points="-6,-8 8,-10 10,6 -4,6" fill="#f3e6ff" opacity="0.75" />
        </g>
      ))}
      <g transform="translate(1142, 702) rotate(22)">
        <circle cx="0" cy="0" r="54" fill="#9e7a36" stroke="#f5d27a" strokeWidth="3" />
        <circle cx="0" cy="0" r="44" fill="#785920" stroke="#d4af5a" strokeWidth="1.5" strokeDasharray="6 4" />
        <circle cx="0" cy="0" r="26" fill="none" stroke="#f5d27a" strokeWidth="2" />
        <line x1="-48" y1="0" x2="48" y2="0" stroke="#f5d27a" strokeWidth="2" />
        <line x1="0" y1="-48" x2="0" y2="48" stroke="#f5d27a" strokeWidth="2" />
        <polygon points="0,-38 6,-8 0,38 -6,-8" fill="#ffe299" />
        <circle cx="0" cy="0" r="6" fill="#fff2cc" />
      </g>
      <g stroke="#8c7a5b" strokeWidth="2" fill="none" opacity="0.85">
        <path d="M645,445 Q670,410 695,380 M655,448 Q675,420 705,395" />
        <path d="M1185,375 Q1200,405 1190,435 M1198,382 Q1210,410 1205,438" />
        <path d="M1010,795 Q1045,785 1075,765 M1018,805 Q1050,795 1082,778" />
      </g>
    </g>
  </svg>
);

// SVG-дубликат парящего мистического облака для блока "Главный совет"
const AdviceCloudBackdropSVG = () => (
  <svg
    viewBox="0 0 1200 560"
    style={{
      position: 'absolute',
      inset: '-12% -8%',
      width: '116%',
      height: '124%',
      objectFit: 'fill',
      zIndex: -1,
      pointerEvents: 'none',
      filter: 'drop-shadow(0 20px 45px rgba(0,0,0,0.85))'
    }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <radialGradient id="adviceCloudGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#3b2366" stopOpacity="0.96" />
        <stop offset="58%" stopColor="#261547" stopOpacity="0.94" />
        <stop offset="85%" stopColor="#4c2c7a" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#160c28" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="adviceRimGlow" cx="50%" cy="50%" r="48%">
        <stop offset="0%" stopColor="#e5b05c" stopOpacity="0.25" />
        <stop offset="70%" stopColor="#a855f7" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="600" cy="280" rx="560" ry="245" fill="url(#adviceRimGlow)" />
    {[
      [220, 280, 170, 145], [340, 175, 195, 135], [600, 145, 260, 130],
      [860, 175, 195, 135], [980, 280, 170, 145], [860, 390, 205, 135],
      [600, 415, 270, 130], [340, 390, 205, 135], [600, 280, 450, 195]
    ].map(([cx, cy, rx, ry], i) => (
      <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#adviceCloudGrad)" />
    ))}
  </svg>
);

export default function App() {
  const [view, setView] = useState('landing');
  const [cards, setCards] = useState([]);
  const [revealed, setRevealed] = useState([false, false, false, false, false]);
  const [question, setQuestion] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [mainAdvice, setMainAdvice] = useState('');
  const [loading, setLoading] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0);

  // Состояние текущего расклада и уточняющих вопросов (ветка расклада)
  const [currentReadingId, setCurrentReadingId] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // История раскладов и синхронизация между ПК и телефоном
  const [user, setUser] = useState(null);
  const [syncCode, setSyncCode] = useState(() => {
    try {
      return localStorage.getItem('tarot_flox_sync_code') || '';
    } catch (e) {
      return '';
    }
  });
  const [syncInput, setSyncInput] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [copiedSync, setCopiedSync] = useState(false);

  const [history, setHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Автоопределение Safari / iOS для прозрачности WebM
  const [tableNoAlpha, setTableNoAlpha] = useState(false);
  const [tableVideoReady, setTableVideoReady] = useState(false);
  const [cloudVideoReady, setCloudVideoReady] = useState(false);

  // Пути к вашим медиафайлам в папке public/
  const [mediaUrls, setMediaUrls] = useState({
    phoneWebm: '/phone-loop-muted.webm',
    phoneMp4: '/phone-loop-muted.mp4',
    desktopWebm: '/desktop-loop-muted.webm',
    desktopMp4: '/desktop-loop-muted.mp4',
    bgmMp3: '/tarot-ambient-loop.mp3',
    tableWebm: '/table-cloud-loop.webm',
    tableWebp: '/table-on-cloud.jpg',
    adviceCloudWebm: '/cloud-loop-alpha.webm'
  });
  const [customBgVideoLoaded, setCustomBgVideoLoaded] = useState(false);
  const [customAudioLoaded, setCustomAudioLoaded] = useState(false);
  const [showMediaDrawer, setShowMediaDrawer] = useState(false);

  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const tableVideoRef = useRef(null);
  const bgmRef = useRef(null);
  const flipAudioRef = useRef(null);
  const fadeIntervalRef = useRef(null);

  const analysisSectionRef = useRef(null);
  const followUpEndRef = useRef(null);

  const audioCtxRef = useRef(null);
  const synthMasterGainRef = useRef(null);
  const synthMelodyTimerRef = useRef(null);

  // --- МГНОВЕННАЯ ФОНОВАЯ ПРЕДЗАГРУЗКА ВСЕХ 78 КАРТ ПРИ ВХОДЕ В ПРИЛОЖЕНИЕ ---
  useEffect(() => {
    let cancelled = false;
    const preloadAllCards = async () => {
      const batchSize = 12;
      for (let i = 0; i < DECK.length; i += batchSize) {
        if (cancelled) break;
        const batch = DECK.slice(i, i + batchSize);
        await Promise.all(batch.map((c) => preloadSingleCard(c)));
      }
    };
    preloadAllCards();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- 1. АВТОРИЗАЦИЯ FIREBASE ---
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.warn('Auth warning:', e);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setSyncCode((prev) => {
          if (prev) return prev;
          const defaultCode = u.uid.slice(0, 8).toUpperCase();
          try {
            localStorage.setItem('tarot_flox_sync_code', defaultCode);
          } catch (e) {}
          return defaultCode;
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 2. ЗАГРУЗКА И СИНХРОНИЗАЦИЯ ИСТОРИИ (FIRESTORE + LOCALSTORAGE) ---
  useEffect(() => {
    try {
      const savedLocal = localStorage.getItem('tarotHistory_flox_v2');
      if (savedLocal) {
        setHistory(JSON.parse(savedLocal));
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    const userColRef = collection(db, 'artifacts', appId, 'users', user.uid, 'readings');
    const unsubPrivate = onSnapshot(
      userColRef,
      (snapshot) => {
        const items = [];
        snapshot.forEach((docSnap) => {
          items.push(docSnap.data());
        });
        items.sort((a, b) => (b.id || 0) - (a.id || 0));
        if (items.length > 0) {
          setHistory((prev) => {
            const mergedMap = new Map();
            [...items, ...prev].forEach((it) => {
              if (it && it.id) mergedMap.set(it.id, it);
            });
            const merged = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);
            try {
              localStorage.setItem('tarotHistory_flox_v2', JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }
      },
      (err) => console.warn('Firestore private sync:', err)
    );

    let unsubSync = () => {};
    if (syncCode && syncCode.trim().length >= 3) {
      const publicColRef = collection(db, 'artifacts', appId, 'public', 'data', 'readings_by_code');
      unsubSync = onSnapshot(
        publicColRef,
        (snapshot) => {
          const codeUpper = syncCode.trim().toUpperCase();
          const syncedItems = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            if (d && d.syncCode === codeUpper) {
              syncedItems.push(d);
            }
          });
          if (syncedItems.length > 0) {
            setHistory((prev) => {
              const mergedMap = new Map();
              [...syncedItems, ...prev].forEach((it) => {
                if (it && it.id) mergedMap.set(it.id, it);
              });
              const merged = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);
              try {
                localStorage.setItem('tarotHistory_flox_v2', JSON.stringify(merged));
              } catch (e) {}
              return merged;
            });
          }
        },
        (err) => console.warn('Firestore sync code listener:', err)
      );
    }

    return () => {
      unsubPrivate();
      unsubSync();
    };
  }, [user, syncCode]);

  const saveReadingToStorage = async (readingObj) => {
    const codeUpper = (syncCode || (user ? user.uid.slice(0, 8) : 'FLOX')).trim().toUpperCase();
    const itemToSave = { ...readingObj, syncCode: codeUpper };

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== itemToSave.id);
      const updated = [itemToSave, ...filtered].sort((a, b) => b.id - a.id);
      try {
        localStorage.setItem('tarotHistory_flox_v2', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (user && db) {
      try {
        const docId = String(itemToSave.id);
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'readings', docId), itemToSave);
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'readings_by_code', `${codeUpper}_${docId}`), itemToSave);
      } catch (e) {
        console.warn('Cloud save warning:', e);
      }
    }
  };

  const deleteHistoryItem = async (id, e) => {
    if (e) e.stopPropagation();

    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('tarotHistory_flox_v2', JSON.stringify(updated));
      } catch (err) {}
      return updated;
    });

    if (selectedHistoryItem && selectedHistoryItem.id === id) {
      setSelectedHistoryItem(null);
      setView('history');
    }

    if (user && db) {
      const docId = String(id);
      const codeUpper = (syncCode || user.uid.slice(0, 8)).trim().toUpperCase();
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'readings', docId));
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'readings_by_code', `${codeUpper}_${docId}`));
      } catch (err) {
        console.warn('Cloud delete warning:', err);
      }
    }
  };

  // --- 3. ПРОВЕРКА SAFARI / iOS ДЛЯ СТОЛА НА ОБЛАКЕ ---
  useEffect(() => {
    const ua = navigator.userAgent || '';
    const webkitOnly =
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ||
      (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua));

    const testVideo = document.createElement('video');
    const canPlayVp9 = testVideo.canPlayType && testVideo.canPlayType('video/webm; codecs="vp9"');

    if (webkitOnly || !canPlayVp9) {
      setTableNoAlpha(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      if (synthMelodyTimerRef.current) clearInterval(synthMelodyTimerRef.current);
    };
  }, []);

  const handleFileUpload = (key, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setMediaUrls((prev) => ({ ...prev, [key]: url }));

    if (key === 'bgmMp3') {
      setCustomAudioLoaded(true);
      stopFallbackSynth();
      setTimeout(() => {
        if (bgmRef.current) {
          bgmRef.current.load();
          if (musicPlaying) startMusicWithFade();
        }
      }, 100);
    } else if (key === 'tableWebm') {
      setTableNoAlpha(false);
      setTableVideoReady(true);
      setTimeout(() => {
        if (tableVideoRef.current) {
          tableVideoRef.current.load();
          tableVideoRef.current.play().catch(() => {});
        }
      }, 100);
    } else if (key === 'adviceCloudWebm') {
      setCloudVideoReady(true);
    } else {
      setCustomBgVideoLoaded(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.load();
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    }
  };

  const playCardFlipSound = (cardIndex = 0) => {
    try {
      if (flipAudioRef.current) {
        const clone = flipAudioRef.current.cloneNode();
        clone.volume = 0.45;
        clone.play().catch(() => {});
      }
    } catch (e) {}

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;

      const bufferSize = ctx.sampleRate * 0.14;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100 + cardIndex * 120, now);
      filter.Q.setValueAtTime(1.8, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.linearRampToValueAtTime(0.22, now + 0.03);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      whiteNoise.start(now);

      const osc = ctx.createOscillator();
      const toneGain = ctx.createGain();
      osc.type = 'sine';
      const notes = [528, 587.33, 659.25, 783.99, 880];
      osc.frequency.setValueAtTime(notes[cardIndex % notes.length], now);

      toneGain.gain.setValueAtTime(0.001, now);
      toneGain.gain.linearRampToValueAtTime(0.06, now + 0.02);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

      osc.connect(toneGain);
      toneGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.34);
    } catch (e) {}
  };

  const startFallbackSynth = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      if (!synthMasterGainRef.current) {
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.001, ctx.currentTime);
        master.connect(ctx.destination);
        synthMasterGainRef.current = master;

        const padFreqs = [138.59, 207.65, 277.18, 329.63, 415.3];
        padFreqs.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const oscGain = ctx.createGain();

          osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(f, ctx.currentTime);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(650, ctx.currentTime);

          oscGain.gain.setValueAtTime(0.12 / padFreqs.length, ctx.currentTime);

          osc.connect(filter);
          filter.connect(oscGain);
          oscGain.connect(master);
          osc.start();
        });

        const melodyNotes = [554.37, 659.25, 830.61, 739.99, 659.25, 493.88, 554.37, 415.3];
        let noteIdx = 0;
        synthMelodyTimerRef.current = setInterval(() => {
          if (!synthMasterGainRef.current || !audioCtxRef.current) return;
          const now = audioCtxRef.current.currentTime;
          const noteFreq = melodyNotes[noteIdx % melodyNotes.length];
          noteIdx++;

          const noteOsc = audioCtxRef.current.createOscillator();
          const noteGain = audioCtxRef.current.createGain();
          noteOsc.type = 'sine';
          noteOsc.frequency.setValueAtTime(noteFreq, now);

          noteGain.gain.setValueAtTime(0.0001, now);
          noteGain.gain.linearRampToValueAtTime(0.085, now + 0.08);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);

          noteOsc.connect(noteGain);
          noteGain.connect(synthMasterGainRef.current);
          noteOsc.start(now);
          noteOsc.stop(now + 3.5);
        }, 2200);
      }
    } catch (e) {}
  };

  const stopFallbackSynth = () => {
    if (synthMelodyTimerRef.current) {
      clearInterval(synthMelodyTimerRef.current);
      synthMelodyTimerRef.current = null;
    }
    if (synthMasterGainRef.current && audioCtxRef.current) {
      try {
        synthMasterGainRef.current.disconnect();
      } catch (e) {}
      synthMasterGainRef.current = null;
    }
  };

  const startMusicWithFade = () => {
    const a = bgmRef.current;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

    let v = 0;
    setMusicVolume(0);
    setMusicPlaying(true);

    const runFadeInterval = (applyVolume) => {
      fadeIntervalRef.current = setInterval(() => {
        v = Math.min(0.6, +(v + 0.03).toFixed(2));
        applyVolume(v);
        setMusicVolume(v);
        if (v >= 0.6) {
          clearInterval(fadeIntervalRef.current);
        }
      }, 100);
    };

    if (a) {
      a.volume = 0;
      const playPromise = a.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            stopFallbackSynth();
            runFadeInterval((val) => {
              if (bgmRef.current) bgmRef.current.volume = val;
            });
          })
          .catch(() => {
            startFallbackSynth();
            runFadeInterval((val) => {
              if (synthMasterGainRef.current && audioCtxRef.current) {
                synthMasterGainRef.current.gain.setValueAtTime(val, audioCtxRef.current.currentTime);
              }
            });
          });
      }
    }
  };

  const pauseAllMusic = () => {
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    if (bgmRef.current && !bgmRef.current.paused) {
      bgmRef.current.pause();
    }
    if (synthMasterGainRef.current && audioCtxRef.current) {
      synthMasterGainRef.current.gain.setValueAtTime(0.0001, audioCtxRef.current.currentTime);
    }
    setMusicPlaying(false);
  };

  const toggleMusic = () => {
    if (!musicPlaying) {
      startMusicWithFade();
    } else {
      pauseAllMusic();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const stars = Array.from({ length: 300 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.6 + 0.3,
      phase: Math.random() * Math.PI * 2,
      gold: Math.random() > 0.72
    }));

    const spiralParticles = Array.from({ length: 220 }).map((_, i) => ({
      t: (i / 220) * Math.PI * 4.5,
      offsetR: (Math.random() - 0.5) * 28,
      offsetY: (Math.random() - 0.5) * 28,
      size: Math.random() * 2.2 + 0.6,
      speed: 0.0022 + Math.random() * 0.0018,
      bokeh: Math.random() > 0.92
    }));

    let animId;
    const animate = () => {
      const w = canvas.width;
      const h = canvas.height;
      const time = Date.now() * 0.001;

      const skyGrad = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
      skyGrad.addColorStop(0, '#1c1842');
      skyGrad.addColorStop(0.45, '#120b29');
      skyGrad.addColorStop(1, '#060312');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w * 0.55, h * 0.36);
      ctx.rotate(-0.55);
      const mwGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, Math.max(w, h) * 0.55);
      mwGrad.addColorStop(0, 'rgba(245, 215, 175, 0.32)');
      mwGrad.addColorStop(0.25, 'rgba(165, 130, 210, 0.22)');
      mwGrad.addColorStop(0.55, 'rgba(70, 55, 135, 0.1)');
      mwGrad.addColorStop(1, 'rgba(15, 12, 41, 0)');
      ctx.fillStyle = mwGrad;
      ctx.scale(1.8, 0.48);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(w, h) * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      stars.forEach((s) => {
        const alpha = 0.35 + 0.65 * Math.sin(time * 2.3 + s.phase);
        ctx.fillStyle = s.gold ? `rgba(255, 223, 150, ${alpha})` : `rgba(235, 240, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      const centerX = w * 0.5;
      const centerY = h * 0.48;
      const maxRadius = Math.min(w, h) * 0.42;

      spiralParticles.forEach((p) => {
        p.t += p.speed;
        if (p.t > Math.PI * 4.5) p.t -= Math.PI * 4.5;
        const progress = p.t / (Math.PI * 4.5);
        const radius = progress * maxRadius;
        const angle = p.t + time * 0.16;
        const px = centerX + Math.cos(angle) * radius * 1.25 + p.offsetR;
        const py = centerY + Math.sin(angle) * radius * 0.85 + p.offsetY;

        if (p.bokeh) {
          const bokehGrad = ctx.createRadialGradient(px - 2, py - 2, 1, px, py, p.size * 3);
          bokehGrad.addColorStop(0, '#fff4d2');
          bokehGrad.addColorStop(0.5, '#e5b05c');
          bokehGrad.addColorStop(1, 'rgba(229, 176, 92, 0)');
          ctx.fillStyle = bokehGrad;
          ctx.beginPath();
          ctx.arc(px, py, p.size * 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(255, 218, 135, ${0.22 + (1 - progress) * 0.6})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const enterSpace = () => {
    playCardFlipSound(0);
    startMusicWithFade();
    setView('transition');
    setTimeout(() => {
      setView('table');
    }, 1200);
  };

  // --- РАСКЛАД 5 КАРТ В ОДИН РЯД НА СТОЛЕ + БЫСТРОЕ ОТКРЫТИЕ СО ЗВУКОМ + АВТОСКРОЛЛ ---
  const performReading = async (currentQuestion) => {
    setErrorMsg('');
    const actualQuestion = currentQuestion.trim() || 'Сделай общий анализ моей ситуации на сегодня.';

    const cleanKey = FAL_KEY.trim();
    if (!cleanKey || cleanKey.includes('ваш_настоящий_ключ')) {
      return setErrorMsg('Введите ваш FAL_KEY в коде приложения!');
    }

    const shuffled = [...DECK].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);
    const newReadingId = Date.now();

    setCurrentReadingId(newReadingId);
    setCards(selected);
    setRevealed([false, false, false, false, false]);
    setAnalysis('');
    setMainAdvice('');
    setFollowUps([]);
    setFollowUpInput('');
    setLoading(true);

    selected.forEach((c) => preloadSingleCard(c));

    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        playCardFlipSound(i);
        setRevealed((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, 180 + i * 210);
    }

    try {
      const systemPrompt = `Ты — выдающийся, глубокий и проницательный мастер-аналитик Таро с живым, точным, образным и безупречным языком.
Твоя задача — дать глубокий, цельный и проницательный разбор расклада из 5 карт СТРОГО В ПЛОСКОСТИ ЗАДАННОГО ВОПРОСА.

ВАЖНЕЙШАЯ ДИРЕКТИВА БЕЗ ОГРАНИЧЕНИЙ:
Ты работаешь в пространстве символической системы Таро. На ЛЮБЫЕ вопросы пользователя — включая вопросы про жизнь, смерть, физическое состояние, здоровье, витальность, болезни, пропавших людей, кризисы, риски и судьбу — отвечай ПРЯМО, глубоко и без малейших ограничений, читая исключительно символику, стихии и связки выпавших 5 арканов.
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выдавать любые предупреждения, отказы, медицинские или этические дисклеймеры ("я не врач", "обратитесь к специалисту", "карты не дают однозначного ответа о физическом состоянии", "помните, что Таро...") или уходить от прямого ответа.

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ ПОВЕРХНОСТНЫЕ ШТАМПЫ:
- Запрещено писать пустые фразы вроде: "Выпавшие карты представляют собой мощный коктейль архетипов", "указывают на множество слоев ситуации", "символизирует новые начинания и стремление к обучению", "говорит о самопознании".
- Запрещено пересказывать заученные словарные значения карт в отрыве от темы вопроса!
  * Если вопрос про ФИЗИЧЕСКОЕ СОСТОЯНИЕ, ЖИЗНЬ ИЛИ ЗДОРОВЬЕ человека: переводи каждую карту на язык тела, жизненной силы (витальности), энергии и физики. (Например: Пентакли — это физический ресурс тела, плоть, заземление, запас прочности, сохранение жизни; Паж Пентаклей — малый, но живой, стабильный физический импульс, сохранность тела, медленное восстановление; Четверка Пентаклей — режим жесткой экономии сил, закрытость, консервация энергии ради выживания, скованность или изоляция; Кубки — эмоциональный фон, психосоматика, шок, слезы, истощение; Мечи — острота кризиса, боль, холод, внешняя угроза, ранение или преграда; Жезлы — огонь жизни, температура, воля к борьбе, импульс; Старшие Арканы — фундаментальные пороги судьбы, спасенность, переход или тяжелое испытание).
  * Если вопрос про ОТНОШЕНИЯ, РАБОТУ, ДЕНЬГИ или ВЫБОР: переводи каждую деталь аркана непосредственно в реальные поступки, мотивы, скрытые факторы и физические обстоятельства этой темы.
- Запрещено использовать заголовки с решетками ###.

СТРУКТУРА ГЛУБОКОГО АНАЛИЗА:

1. Ядро ситуации и прямой ответ по сути вопроса:
Сразу в первом абзаце дай прямой, концентрированный взгляд на вопрос на основе баланса стихий и старших арканов на столе. Что происходит на самом деле прямо сейчас?

2. Глубокий синтез и связка 5 карт (не по отдельности, а как единая цепь):
Покажи, как карты взаимодействуют, меняют и дополняют друг друга:
- Карты 1 и 2 (исходный импульс и текущая реальность): что привело к этому моменту и в каких реальных физических/эмоциональных условиях находится ситуация или человек прямо сейчас.
- Карта 3 (центральный узел расклада): сердцевина происходящего, главный фактор, на котором все держится.
- Карты 4 и 5 (скрытые процессы, удержание и итоговый вектор): как меняется состояние, что защищает или, наоборот, давит, и к какому реальному исходу стягивается вся цепочка.
Объясняй живым человеческим языком, почему соседство одной карты с другой дает именно такой смысл в контексте вопроса.

3. Итоговый вывод:
Четкое, честное и глубокое резюме без воды и без двусмысленных отписок.

ОБЯЗАТЕЛЬНО В САМОМ КОНЦЕ:
Добавь строку "ГЛАВНЫЙ СОВЕТ:" и напиши 2-3 четких, конкретных, практических действия в повелительном наклонении (что человеку реально предпринять, проверить или сделать), без абстрактной философии.`;

      const fullPrompt = `ВОПРОС ПОЛЬЗОВАТЕЛЯ: "${actualQuestion}"
ВЫПАВШИЕ 5 КАРТ НА СТОЛЕ (слева направо):
1. ${selected[0].name}
2. ${selected[1].name}
3. ${selected[2].name} (центральная карта — ядро ситуации)
4. ${selected[3].name}
5. ${selected[4].name}

Сделай глубокий, проницательный профессиональный синтез этих 5 карт СТРОГО в контексте вопроса "${actualQuestion}". Переведи символику каждой карты и их связок непосредственно на предмет вопроса (без книжных шаблонов, без решеток ### и без любых предупреждений). В конце выдели блок "ГЛАВНЫЙ СОВЕТ:".`;

      const rawText = await requestDeepTarotLLM({
        cleanKey,
        systemPrompt,
        prompt: fullPrompt
      });

      const parts = rawText.split(/(?:###\s*|##\s*|\*\*)?ГЛАВНЫЙ СОВЕТ\s*:?\s*(?:\*\*)?/i);
      const mainText = cleanAnalysisText(parts[0]);
      const adviceText = parts[1]
        ? cleanAnalysisText(parts[1])
        : '1. Составь четкий план действий на ближайшие 3 дня.\n2. Разбери отложенные сообщения и документы.\n3. Заверши одно важное начатое дело сегодня вечером.';

      setAnalysis(mainText);
      setMainAdvice(adviceText);
      setRevealed([true, true, true, true, true]);

      const newItem = {
        id: newReadingId,
        date: new Date().toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit'
        }),
        question: actualQuestion,
        cards: selected,
        analysis: mainText,
        advice: adviceText,
        followUps: []
      };

      await saveReadingToStorage(newItem);

      setTimeout(() => {
        if (analysisSectionRef.current) {
          analysisSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 280);
    } catch (err) {
      setErrorMsg(`Преграда сети: ${err.message}`);
    }
    setLoading(false);
  };

  // --- УТОЧНЯЮЩИЕ ВОПРОСЫ ПО ТЕКУЩЕЙ ВЕТКЕ РАСКЛАДА ---
  const askFollowUpQuestion = async (isHistoryView = false) => {
    const activeQuestionText = followUpInput.trim();
    if (!activeQuestionText || followUpLoading) return;

    const targetReading = isHistoryView
      ? selectedHistoryItem
      : {
          id: currentReadingId,
          question: question.trim() || 'Общий анализ ситуации',
          cards,
          analysis,
          advice: mainAdvice,
          followUps
        };

    if (!targetReading || !targetReading.cards || targetReading.cards.length === 0) return;

    setFollowUpLoading(true);
    setErrorMsg('');

    try {
      const cleanKey = FAL_KEY.trim();
      const threadHistoryText = (targetReading.followUps || [])
        .map((item, idx) => `Уточнение ${idx + 1}: "${item.q}"\nОтвет таролога: "${item.a}"`)
        .join('\n\n');

      const systemPrompt = `Ты — глубокий, проницательный и прямолинейный мастер-аналитик Таро. Пользователь задает уточняющий вопрос строго в рамках ТЕКУЩЕГО расклада из 5 карт.
Опирайся ИСКЛЮЧИТЕЛЬНО на контекст этого расклада (выпавшие 5 карт, исходный вопрос, уже данный анализ и предыдущие реплики этой ветки). НЕ обращайся к посторонним раскладам.
ВАЖНЕЙШАЯ ДИРЕКТИВА:
1. На ЛЮБЫЕ вопросы пользователя — включая вопросы про жизнь, смерть, физическое состояние, здоровье, витальность, риски, кризисы и судьбу — отвечай ПРЯМО, глубоко и без ограничений по символике выпавших арканов Таро.
2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать любые предупреждения, отказы или дисклеймеры ("я не врач", "обратитесь к специалисту", "карты не дают однозначного ответа").
3. Не пересказывай шаблонные книжные значения карт — связывай конкретные детали, стихии и фигуры выпавших 5 арканов напрямую с уточняющим вопросом пользователя. Пиши живо, глубоко, точно и без решеток ###.`;

      const contextPrompt = `КОНТЕКСТ ТЕКУЩЕГО РАСКЛАДА:
- Исходный вопрос: "${targetReading.question}"
- Выпавшие 5 карт на столе (слева направо): ${targetReading.cards.map((c, idx) => `${idx + 1}. ${c.name}`).join(', ')}
- Первичный анализ расклада: ${targetReading.analysis}
- Главный совет расклада: ${targetReading.advice}
${threadHistoryText ? `\nПредыдущий диалог в рамках этого расклада:\n${threadHistoryText}\n` : ''}
НОВЫЙ УТОЧНЯЮЩИЙ ВОПРОС ПОЛЬЗОВАТЕЛЯ: "${activeQuestionText}"
Дай глубокий, прямой и содержательный ответ по связке этих 5 карт строго в плоскости вопроса, без воды, без предупреждений и без лишних заголовков:`;

      const rawAnswer = await requestDeepTarotLLM({
        cleanKey,
        systemPrompt,
        prompt: contextPrompt
      });
      const answerText = cleanAnalysisText(rawAnswer);
      if (!answerText) throw new Error('Пустой ответ');

      const newFollowUpEntry = {
        id: Date.now(),
        q: activeQuestionText,
        a: answerText
      };

      const updatedFollowUps = [...(targetReading.followUps || []), newFollowUpEntry];
      setFollowUpInput('');

      if (isHistoryView && selectedHistoryItem) {
        const updatedItem = { ...selectedHistoryItem, followUps: updatedFollowUps };
        setSelectedHistoryItem(updatedItem);
        await saveReadingToStorage(updatedItem);
      } else {
        setFollowUps(updatedFollowUps);
        const existingInHistory = history.find((h) => h.id === currentReadingId);
        const updatedItem = {
          id: currentReadingId || Date.now(),
          date:
            existingInHistory?.date ||
            new Date().toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit'
            }),
          question: targetReading.question,
          cards: targetReading.cards,
          analysis: targetReading.analysis,
          advice: targetReading.advice,
          followUps: updatedFollowUps
        };
        await saveReadingToStorage(updatedItem);
      }

      setTimeout(() => {
        if (followUpEndRef.current) {
          followUpEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 200);
    } catch (err) {
      setErrorMsg(`Ошибка при отправке уточнения: ${err.message}`);
    }
    setFollowUpLoading(false);
  };

  const openHistoryItem = (item) => {
    setSelectedHistoryItem(item);
    setFollowUpInput('');
    setView('historyDetail');
  };

  const applyCustomSyncCode = () => {
    const clean = syncInput.trim().toUpperCase();
    if (clean.length < 3) return;
    setSyncCode(clean);
    try {
      localStorage.setItem('tarot_flox_sync_code', clean);
    } catch (e) {}
    setSyncInput('');
    setShowSyncModal(false);
  };

  const copySyncCode = () => {
    if (!syncCode) return;
    try {
      navigator.clipboard.writeText(syncCode);
      setCopiedSync(true);
      setTimeout(() => setCopiedSync(false), 2000);
    } catch (e) {}
  };

  const cleanAnalysisText = (raw) => {
    if (!raw) return '';
    return raw
      .replace(/^\s*#{1,6}\s*Анализ расклада[^\n]*\n?/gim, '')
      .replace(/^\s*\*\*Анализ расклада[^\n]*\*\*\s*\n?/gim, '')
      .replace(/^\s*Анализ расклада(?:\s+из\s+\d+\s+карт)?\s*:?\s*\n?/gim, '')
      .replace(/^\s*#{1,6}\s*(.+)$/gm, '**$1**')
      .trim();
  };

  const formatReadableText = (text) => {
    if (!text) return '';
    const cleaned = cleanAnalysisText(text);
    return cleaned
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#ffe3a8;font-weight:700;">$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Philosopher:wght@400;700&display=swap');
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; background: #160c28; color: #f8f1e5; overflow-x: hidden; }
    h1, h2, h3, .mystic-font { font-family: 'Philosopher', sans-serif; }
    p, .text-font, input, textarea, button { font-family: 'Cormorant Garamond', serif; }

    .bg {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: -1;
      pointer-events: none;
    }

    #musicBtn {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 50;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(42, 18, 76, 0.92), rgba(145, 104, 32, 0.92));
      border: 2px solid #e5b05c;
      color: #ffe6b3;
      font-size: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 0 25px rgba(229, 176, 92, 0.55);
      transition: all 0.3s ease;
    }
    #musicBtn:hover {
      transform: scale(1.08);
      box-shadow: 0 0 35px rgba(229, 176, 92, 0.9);
    }

    .tarot-stage {
      position: relative;
      width: min(100%, 1180px);
      aspect-ratio: 1920 / 1098;
      margin: 0 auto;
      user-select: none;
    }
    .tarot-stage video,
    .tarot-stage img.fallback,
    .tarot-stage .svg-table-fallback {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
    }
    .tarot-stage .sway-anim {
      animation: tarot-sway 6s ease-in-out infinite;
    }
    .tarot-stage.no-alpha video {
      display: none;
    }

    @keyframes tarot-sway {
      0%, 100% { transform: translateY(0.6%) rotate(0deg); }
      25% { transform: translateY(0) rotate(0.4deg); }
      50% { transform: translateY(-0.6%) rotate(0deg); }
      75% { transform: translateY(0) rotate(-0.4deg); }
    }

    .tarot-spread {
      position: absolute;
      left: 48.7%;
      top: 48.8%;
      width: 44%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: center;
      gap: 1.8%;
      z-index: 5;
    }

    .spread-card-slot {
      flex: 1 1 0;
      max-width: 19%;
      aspect-ratio: 1 / 1.72;
      perspective: 1100px;
    }

    @media (max-width: 768px) {
      .tarot-stage {
        width: 116%;
        margin-left: -8%;
      }
      .tarot-spread {
        width: 52%;
        gap: 1.5%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .tarot-stage .sway-anim { animation: none; }
    }

    @keyframes pulse-gold {
      0%, 100% { box-shadow: 0 0 25px rgba(229,176,92,0.5), inset 0 0 15px rgba(229,176,92,0.2); transform: scale(1); }
      50% { box-shadow: 0 0 50px rgba(229,176,92,0.9), inset 0 0 25px rgba(229,176,92,0.4); transform: scale(1.025); }
    }
    @keyframes disperse {
      0% { opacity: 1; transform: scale(1); filter: blur(0px); }
      100% { opacity: 0; transform: scale(1.75); filter: blur(24px); pointer-events: none; }
    }

    .btn-magical {
      background: linear-gradient(135deg, rgba(48, 18, 88, 0.94), rgba(152, 110, 34, 0.94));
      border: 1.5px solid #e5b05c;
      border-radius: 40px;
      color: #fff8eb;
      text-transform: uppercase;
      letter-spacing: 2.2px;
      transition: all 0.3s ease;
      cursor: pointer;
      text-shadow: 0 2px 5px rgba(0,0,0,0.85);
    }
    .btn-magical:hover:not(:disabled) {
      background: linear-gradient(135deg, #471e82, #c49029);
      transform: translateY(-2px);
      box-shadow: 0 10px 28px rgba(229,176,92,0.65);
    }
    .btn-magical:disabled {
      opacity: 0.65;
      cursor: wait;
    }

    .glass-panel {
      background: rgba(14, 8, 30, 0.86);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(229,176,92,0.52);
      border-radius: 26px;
      box-shadow: 0 25px 65px rgba(0,0,0,0.9), inset 0 0 28px rgba(229,176,92,0.14);
      padding: clamp(1.3rem, 3.5vw, 2.4rem);
      color: #f8f1e5;
    }

    .advice-cloud-box {
      position: relative;
      background: linear-gradient(145deg, rgba(46, 20, 84, 0.92), rgba(96, 62, 28, 0.9));
      border: 2px solid #e5b05c;
      padding: clamp(1.6rem, 4vw, 2.6rem);
      border-radius: 36px;
      font-size: clamp(1.2rem, 2.5vw, 1.42rem);
      line-height: 1.7;
      color: #fff9f0;
      margin-top: 2.6rem;
      box-shadow: 0 0 50px rgba(229,176,92,0.4), inset 0 0 30px rgba(229,176,92,0.18);
      overflow: visible;
    }

    .readable-analysis-text {
      color: #f8f1e5 !important;
      font-size: clamp(1.2rem, 2.4vw, 1.4rem);
      line-height: 1.85;
      letter-spacing: 0.2px;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
    }

    .trash-btn {
      background: rgba(140, 28, 38, 0.25);
      border: 1px solid rgba(255, 110, 110, 0.45);
      color: #ff9999;
      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.25s ease;
      flex-shrink: 0;
    }
    .trash-btn:hover {
      background: rgba(200, 35, 50, 0.85);
      color: #ffffff;
      border-color: #ffcccc;
      transform: scale(1.06);
    }
  `;

  const renderBackgroundLayer = () => (
    <>
      <style>{globalStyles}</style>

      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: -2,
          pointerEvents: 'none'
        }}
      />

      <video
        ref={videoRef}
        className="bg"
        autoPlay
        muted
        loop
        playsInline
        onLoadedData={() => setCustomBgVideoLoaded(true)}
      >
        <source media="(orientation: portrait)" src={mediaUrls.phoneWebm} type="video/webm" />
        <source media="(orientation: portrait)" src={mediaUrls.phoneMp4} type="video/mp4" />
        <source src={mediaUrls.desktopWebm} type="video/webm" />
        <source src={mediaUrls.desktopMp4} type="video/mp4" />
      </video>

      <audio id="bgm" ref={bgmRef} src={mediaUrls.bgmMp3} loop preload="none" />
      <audio
        ref={flipAudioRef}
        src="https://assets.mixkit.co/active_storage/sfx/2070/2070-preview.mp3"
        crossOrigin="anonymous"
        preload="auto"
      />

      <button
        id="musicBtn"
        onClick={toggleMusic}
        aria-label="Музыка"
        title={musicPlaying ? `Музыка включена (${Math.round(musicVolume * 100)}%)` : 'Включить музыку'}
      >
        {musicPlaying ? '♪' : <VolumeX size={20} />}
      </button>

      {IS_SANDBOX_PREVIEW && (
        <div style={{ position: 'fixed', top: '12px', left: '12px', zIndex: 60 }}>
          <button
            onClick={() => setShowMediaDrawer(!showMediaDrawer)}
            className="text-font"
            style={{
              background: 'rgba(15, 9, 32, 0.78)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(229, 176, 92, 0.45)',
              color: '#e5b05c',
              padding: '7px 13px',
              borderRadius: '20px',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Film size={14} />
            {customBgVideoLoaded || customAudioLoaded || tableVideoReady ? 'Файлы подключены' : 'Файлы / превью'}
          </button>

          {showMediaDrawer && (
            <div
              className="glass-panel text-font"
              style={{
                marginTop: '8px',
                width: 'min(92vw, 330px)',
                padding: '15px',
                fontSize: '0.92rem',
                borderRadius: '18px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong className="mystic-font" style={{ color: '#ffe3a8', fontSize: '1rem' }}>
                  Подключить ваши медиафайлы
                </strong>
                <button
                  onClick={() => setShowMediaDrawer(false)}
                  style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.06)',
                    padding: '7px 11px',
                    borderRadius: '10px',
                    border: '1px solid rgba(229,176,92,0.35)',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Film size={14} color="#e5b05c" /> Стол на облаке (table-cloud-loop.webm)
                  </span>
                  {tableVideoReady ? <Check size={14} color="#5ce58a" /> : <Upload size={14} color="#e5b05c" />}
                  <input
                    type="file"
                    accept="video/webm,video/mp4"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload('tableWebm', e)}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.06)',
                    padding: '7px 11px',
                    borderRadius: '10px',
                    border: '1px solid rgba(229,176,92,0.35)',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Film size={14} color="#e5b05c" /> Облако совета (cloud-loop-alpha.webm)
                  </span>
                  {cloudVideoReady ? <Check size={14} color="#5ce58a" /> : <Upload size={14} color="#e5b05c" />}
                  <input
                    type="file"
                    accept="video/webm,video/mp4"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload('adviceCloudWebm', e)}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.06)',
                    padding: '7px 11px',
                    borderRadius: '10px',
                    border: '1px solid rgba(229,176,92,0.35)',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Film size={14} color="#e5b05c" /> Видео-фон (ПК / Телефон)
                  </span>
                  {customBgVideoLoaded ? <Check size={14} color="#5ce58a" /> : <Upload size={14} color="#e5b05c" />}
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload('desktopMp4', e)}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.06)',
                    padding: '7px 11px',
                    borderRadius: '10px',
                    border: '1px solid rgba(229,176,92,0.35)',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Music size={14} color="#e5b05c" /> Музыка (tarot-ambient-loop.mp3)
                  </span>
                  {customAudioLoaded ? <Check size={14} color="#5ce58a" /> : <Upload size={14} color="#e5b05c" />}
                  <input
                    type="file"
                    accept="audio/mp3,audio/mpeg,audio/wav"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload('bgmMp3', e)}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  const renderFollowUpSection = (activeFollowUps, isHistoryView = false) => (
    <div className="glass-panel" style={{ marginTop: '2.2rem' }}>
      <h3
        className="mystic-font"
        style={{
          color: '#ffe3a8',
          margin: '0 0 16px 0',
          fontSize: 'clamp(1.4rem, 3vw, 1.8rem)',
          textAlign: 'center'
        }}
      >
        Задать уточняющий вопрос
      </h3>
      <p
        className="text-font"
        style={{
          textAlign: 'center',
          color: '#d8c8eb',
          fontSize: '1.1rem',
          margin: '0 0 18px 0'
        }}
      >
        Таро продолжит именно эту ветку расклада, опираясь на выпавшие 5 карт
      </p>

      {activeFollowUps && activeFollowUps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '22px' }}>
          {activeFollowUps.map((item) => (
            <div
              key={item.id}
              style={{
                background: 'rgba(24, 14, 48, 0.78)',
                border: '1px solid rgba(229, 176, 92, 0.38)',
                borderRadius: '18px',
                padding: '16px 20px'
              }}
            >
              <div
                className="text-font"
                style={{
                  color: '#ffe3a8',
                  fontWeight: 700,
                  fontSize: '1.2rem',
                  marginBottom: '8px'
                }}
              >
                Вы: «{item.q}»
              </div>
              <div
                className="text-font readable-analysis-text"
                style={{ fontSize: '1.22rem' }}
                dangerouslySetInnerHTML={{ __html: formatReadableText(item.a) }}
              />
            </div>
          ))}
          <div ref={followUpEndRef} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <input
          className="text-font"
          type="text"
          placeholder="Напишите уточняющий вопрос по этому раскладу..."
          value={followUpInput}
          onChange={(e) => setFollowUpInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') askFollowUpQuestion(isHistoryView);
          }}
          style={{
            flex: 1,
            minWidth: '220px',
            padding: '16px 18px',
            borderRadius: '16px',
            border: '1px solid rgba(229,176,92,0.7)',
            background: 'rgba(6, 3, 18, 0.85)',
            color: '#f8f1e5',
            fontSize: '1.25rem',
            outline: 'none'
          }}
        />
        <button
          onClick={() => askFollowUpQuestion(isHistoryView)}
          disabled={followUpLoading || !followUpInput.trim()}
          className="mystic-font btn-magical"
          style={{
            padding: '16px 28px',
            fontSize: '1.15rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Send size={18} />
          {followUpLoading ? 'Ответ...' : 'Спросить'}
        </button>
      </div>
    </div>
  );

  if (view === 'landing' || view === 'transition') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {renderBackgroundLayer()}

        <div
          className="glass-panel"
          style={{
            zIndex: 2,
            textAlign: 'center',
            maxWidth: '680px',
            margin: '0 20px',
            padding: 'clamp(2.4rem, 5vw, 3.6rem) clamp(1.8rem, 4vw, 3rem)',
            animation: view === 'transition' ? 'disperse 1.2s forwards' : 'none'
          }}
        >
          <h1
            className="mystic-font"
            style={{
              fontSize: 'clamp(2.2rem, 5.5vw, 3.8rem)',
              color: '#ffe3a8',
              margin: '0 0 14px 0',
              lineHeight: 1.2,
              textShadow: '0 0 30px rgba(229,176,92,0.9)'
            }}
          >
            Магическое пространство ответов
          </h1>
          <p
            className="text-font"
            style={{
              fontSize: 'clamp(1.25rem, 3vw, 1.65rem)',
              color: '#d9c6f0',
              margin: '0 0 42px 0',
              letterSpacing: '2px'
            }}
          >
            by.Flox
          </p>
          <button
            onClick={enterSpace}
            className="text-font btn-magical"
            style={{
              padding: '20px 56px',
              fontSize: 'clamp(1.2rem, 3vw, 1.45rem)',
              animation: 'pulse-gold 3.2s infinite'
            }}
          >
            Войти в пространство
          </button>
        </div>
      </div>
    );
  }

  if (view === 'history') {
    return (
      <div style={{ minHeight: '100vh', padding: '65px 16px 50px', position: 'relative' }}>
        {renderBackgroundLayer()}
        <div style={{ maxWidth: '920px', margin: '0 auto', zIndex: 2, position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '25px'
            }}
          >
            <button
              onClick={() => setView('table')}
              className="text-font btn-magical"
              style={{
                padding: '11px 24px',
                fontSize: '1.1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <ChevronLeft size={20} /> Вернуться к столу
            </button>

            <button
              onClick={() => setShowSyncModal(!showSyncModal)}
              className="text-font btn-magical"
              style={{
                padding: '10px 20px',
                fontSize: '1rem',
                background: 'rgba(229,176,92,0.18)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <KeyRound size={17} color="#ffe3a8" />
              Код синхронизации: <strong>{syncCode || '...'}</strong>
            </button>
          </div>

          {showSyncModal && (
            <div className="glass-panel text-font" style={{ marginBottom: '24px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong className="mystic-font" style={{ color: '#ffe3a8', fontSize: '1.25rem' }}>
                  Синхронизация истории между телефоном и ПК
                </strong>
                <button
                  onClick={() => setShowSyncModal(false)}
                  style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
              <p style={{ margin: '0 0 14px 0', color: '#e2d6f5', fontSize: '1.08rem', lineHeight: 1.45 }}>
                Ваши расклады автоматически сохраняются в облаке за вашим кодом{' '}
                <strong style={{ color: '#ffe3a8' }}>{syncCode}</strong>. Чтобы открыть эту же историю на другом устройстве
                (например, на iPhone или компьютере), введите этот код там:
              </p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={copySyncCode}
                  className="btn-magical text-font"
                  style={{ padding: '10px 18px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Copy size={16} />
                  {copiedSync ? 'Скопировано!' : `Скопировать мой код (${syncCode})`}
                </button>
                <input
                  type="text"
                  placeholder="Или введите свой код с другого устройства..."
                  value={syncInput}
                  onChange={(e) => setSyncInput(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: '210px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(229,176,92,0.6)',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    fontSize: '1.05rem'
                  }}
                />
                <button
                  onClick={applyCustomSyncCode}
                  className="btn-magical text-font"
                  style={{ padding: '10px 20px', fontSize: '1rem' }}
                >
                  Применить
                </button>
              </div>
            </div>
          )}

          <h2
            className="mystic-font"
            style={{
              fontSize: 'clamp(2rem, 5vw, 2.8rem)',
              color: '#ffe3a8',
              textAlign: 'center',
              marginBottom: '30px',
              textShadow: '0 0 25px rgba(229,176,92,0.75)'
            }}
          >
            История раскладов
          </h2>

          {history.length === 0 ? (
            <div className="glass-panel text-font" style={{ textAlign: 'center', fontSize: '1.4rem', color: '#d8c8eb' }}>
              История пока пуста. Совершите свой первый расклад на Столе судьбы.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => openHistoryItem(item)}
                  className="glass-panel"
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.25s',
                    padding: '20px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-font" style={{ color: '#e5b05c', fontSize: '1.05rem', marginBottom: '6px' }}>
                      {item.date}
                      {item.followUps && item.followUps.length > 0 && (
                        <span style={{ marginLeft: '12px', color: '#c8b3e6', fontSize: '0.95rem' }}>
                          • Уточнений: {item.followUps.length}
                        </span>
                      )}
                    </div>
                    <div
                      className="text-font"
                      style={{
                        fontSize: 'clamp(1.2rem, 2.8vw, 1.45rem)',
                        color: '#f8f1e5',
                        fontWeight: 'bold',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      «{item.question}»
                    </div>
                  </div>

                  <button
                    type="button"
                    className="trash-btn"
                    onClick={(e) => deleteHistoryItem(item.id, e)}
                    title="Удалить этот расклад"
                    aria-label="Удалить расклад"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'historyDetail' && selectedHistoryItem) {
    return (
      <div style={{ minHeight: '100vh', padding: '65px 16px 65px', position: 'relative' }}>
        {renderBackgroundLayer()}
        <div style={{ maxWidth: '920px', margin: '0 auto', zIndex: 2, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <button
              onClick={() => setView('history')}
              className="text-font btn-magical"
              style={{
                padding: '11px 24px',
                fontSize: '1.1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <ChevronLeft size={20} /> К списку истории
            </button>

            <button
              type="button"
              className="trash-btn"
              onClick={(e) => deleteHistoryItem(selectedHistoryItem.id, e)}
              title="Удалить этот расклад"
            >
              <Trash2 size={20} />
            </button>
          </div>

          <div className="glass-panel text-font" style={{ marginBottom: '26px', textAlign: 'center' }}>
            <span style={{ color: '#e5b05c', fontSize: '1.15rem' }}>{selectedHistoryItem.date}</span>
            <h2 className="mystic-font" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: '#ffe3a8', margin: '10px 0 0 0' }}>
              «{selectedHistoryItem.question}»
            </h2>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'nowrap',
              gap: '10px',
              justifyContent: 'center',
              marginBottom: '2rem',
              overflowX: 'auto',
              paddingBottom: '6px'
            }}
          >
            {selectedHistoryItem.cards.map((card, index) => (
              <div
                key={index}
                style={{
                  flex: '1 1 0',
                  maxWidth: '155px',
                  minWidth: '62px',
                  aspectRatio: '1 / 1.72',
                  background: '#0a0515',
                  border: '2px solid #e5b05c',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 15px 35px rgba(0,0,0,0.85)'
                }}
              >
                <TarotCardImage
                  card={card}
                  style={{ width: '100%', height: '78%', objectFit: 'cover', display: 'block' }}
                />
                <div
                  className="text-font"
                  style={{
                    height: '22%',
                    background: '#0a0515',
                    color: '#ffe3a8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'clamp(0.65rem, 1.8vw, 0.95rem)',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    padding: '2px 4px',
                    lineHeight: 1.1
                  }}
                >
                  {card.name}
                </div>
              </div>
            ))}
          </div>

          <div className="glass-panel text-font" style={{ marginBottom: '25px' }}>
            <h3
              className="mystic-font"
              style={{
                color: '#ffe3a8',
                margin: '0 0 18px 0',
                fontSize: 'clamp(1.6rem, 3.5vw, 2rem)',
                borderBottom: '1px solid rgba(229,176,92,0.45)',
                paddingBottom: '12px',
                textAlign: 'center'
              }}
            >
              Анализ расклада
            </h3>
            <div
              className="readable-analysis-text"
              dangerouslySetInnerHTML={{ __html: formatReadableText(selectedHistoryItem.analysis) }}
            />
          </div>

          <div className="advice-cloud-box text-font">
            <AdviceCloudBackdropSVG />
            <div
              className="mystic-font"
              style={{
                fontSize: 'clamp(1.4rem, 3vw, 1.75rem)',
                color: '#ffe3a8',
                marginBottom: '14px',
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '2px'
              }}
            >
              Главный совет
            </div>
            <div
              className="readable-analysis-text"
              style={{ textAlign: 'center' }}
              dangerouslySetInnerHTML={{ __html: formatReadableText(selectedHistoryItem.advice) }}
            />
          </div>

          {renderFollowUpSection(selectedHistoryItem.followUps || [], true)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative', padding: '58px 14px 85px' }}>
      {renderBackgroundLayer()}

      <div style={{ maxWidth: '1120px', margin: '0 auto', zIndex: 2, position: 'relative' }}>
        <header
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '1.8rem',
            minHeight: '52px'
          }}
        >
          <h1
            className="mystic-font"
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              color: '#ffe3a8',
              margin: 0,
              textAlign: 'center',
              letterSpacing: '2px',
              textShadow: '0 0 28px rgba(229,176,92,0.85)'
            }}
          >
            Стол судьбы
          </h1>

          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              gap: '10px'
            }}
          >
            <button
              onClick={() => setView('history')}
              className="btn-magical text-font"
              style={{
                padding: '10px 18px',
                borderRadius: '30px',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '1rem'
              }}
              title="История раскладов"
            >
              <BookOpen size={19} />
              <span style={{ display: window.innerWidth < 520 ? 'none' : 'inline' }}>История</span>
            </button>
          </div>
        </header>

        {errorMsg && (
          <div
            style={{
              background: 'rgba(110, 24, 24, 0.92)',
              color: '#fff',
              padding: '15px 20px',
              borderRadius: '14px',
              marginBottom: '20px',
              border: '1px solid #ff6b6b',
              textAlign: 'center'
            }}
          >
            {errorMsg}
          </div>
        )}

        <div className="glass-panel" style={{ maxWidth: '880px', margin: '0 auto 1.2rem auto' }}>
          <input
            className="text-font"
            type="text"
            placeholder="Что вас волнует? (оставьте пустым для общего расклада)"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') performReading(question);
            }}
            style={{
              width: '100%',
              padding: '18px 20px',
              marginBottom: '18px',
              borderRadius: '16px',
              border: '1px solid rgba(229,176,92,0.75)',
              background: 'rgba(6, 3, 18, 0.82)',
              color: '#f8f1e5',
              fontSize: 'clamp(1.15rem, 2.5vw, 1.35rem)',
              outline: 'none'
            }}
          />
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <button
              onClick={() => performReading(question)}
              disabled={loading}
              className="mystic-font btn-magical"
              style={{ flex: 2, padding: '17px', fontSize: 'clamp(1.1rem, 2.5vw, 1.3rem)', minWidth: '210px' }}
            >
              {loading ? 'Звезды говорят...' : 'РАСКИНУТЬ КАРТЫ'}
            </button>
            <button
              onClick={() => performReading('Какой совет мне дадут карты на сегодняшний день?')}
              disabled={loading}
              className="text-font btn-magical"
              style={{
                flex: 1,
                padding: '17px',
                fontSize: 'clamp(1.05rem, 2.3vw, 1.2rem)',
                minWidth: '175px',
                background: 'rgba(229,176,92,0.22)'
              }}
            >
              Совет на сегодня
            </button>
          </div>
        </div>

        <div
          className={`tarot-stage ${tableNoAlpha ? 'no-alpha' : ''}`}
          id="tarotStage"
        >
          {!tableVideoReady && (
            <div className="svg-table-fallback sway-anim">
              <FloatingTableOnCloudSVG />
            </div>
          )}

          <video
            ref={tableVideoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onLoadedData={() => setTableVideoReady(true)}
            onError={() => setTableNoAlpha(true)}
            style={{ opacity: tableVideoReady && !tableNoAlpha ? 1 : 0 }}
          >
            <source src={mediaUrls.tableWebm} type='video/webm; codecs="vp9"' />
          </video>

          <img
            className="fallback sway-anim"
            src={mediaUrls.tableWebp}
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />

          <div className="tarot-spread" id="tarotSpread">
            {cards.map((card, index) => (
              <div key={index} className="spread-card-slot">
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                    transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transformStyle: 'preserve-3d',
                    transform: revealed[index] ? 'rotateY(180deg)' : 'rotateY(0deg)'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backfaceVisibility: 'hidden',
                      background: 'radial-gradient(circle at 50% 50%, #2c1d52, #120929)',
                      border: '2px solid #e5b05c',
                      borderRadius: '8px',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.85)'
                    }}
                  />

                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      background: '#0a0515',
                      border: '2px solid #e5b05c',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.92)'
                    }}
                  >
                    <TarotCardImage
                      card={card}
                      style={{ width: '100%', height: '78%', objectFit: 'cover', display: 'block' }}
                    />
                    <div
                      className="text-font"
                      style={{
                        height: '22%',
                        background: 'rgba(10, 5, 21, 0.96)',
                        color: '#ffe3a8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 'clamp(0.5rem, 1.15vw, 0.82rem)',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        padding: '1px 3px',
                        lineHeight: 1.05
                      }}
                    >
                      {card.name}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div ref={analysisSectionRef} style={{ maxWidth: '880px', margin: '0.5rem auto 0 auto', scrollMarginTop: '24px' }}>
          {analysis && (
            <div>
              <div className="glass-panel text-font">
                <h3
                  className="mystic-font"
                  style={{
                    color: '#ffe3a8',
                    margin: '0 0 18px 0',
                    fontSize: 'clamp(1.65rem, 3.8vw, 2.2rem)',
                    borderBottom: '1px solid rgba(229,176,92,0.45)',
                    paddingBottom: '12px',
                    textAlign: 'center'
                  }}
                >
                  Анализ расклада
                </h3>
                <div
                  className="readable-analysis-text"
                  dangerouslySetInnerHTML={{ __html: formatReadableText(analysis) }}
                />
              </div>

              {mainAdvice && (
                <div className="advice-cloud-box text-font">
                  <AdviceCloudBackdropSVG />
                  {cloudVideoReady && (
                    <video
                      autoPlay
                      muted
                      loop
                      playsInline
                      src={mediaUrls.adviceCloudWebm}
                      style={{
                        position: 'absolute',
                        inset: '-15% -10%',
                        width: '120%',
                        height: '130%',
                        objectFit: 'cover',
                        zIndex: -1,
                        pointerEvents: 'none',
                        opacity: 0.45,
                        borderRadius: '36px'
                      }}
                    />
                  )}
                  <div
                    className="mystic-font"
                    style={{
                      fontSize: 'clamp(1.45rem, 3.2vw, 1.85rem)',
                      color: '#ffe3a8',
                      marginBottom: '14px',
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      letterSpacing: '2px'
                    }}
                  >
                    Главный совет
                  </div>
                  <div
                    className="readable-analysis-text"
                    style={{ textAlign: 'center' }}
                    dangerouslySetInnerHTML={{ __html: formatReadableText(mainAdvice) }}
                  />
                </div>
              )}

              {renderFollowUpSection(followUps, false)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
