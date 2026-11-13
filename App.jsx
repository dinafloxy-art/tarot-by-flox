import React, { useState, useEffect, useRef } from 'react';
import {
  VolumeX,
  BookOpen,
  ChevronLeft,
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

// Генерация гарантированного уникального кода синхронизации для каждого пользователя
const getOrCreateSyncCode = () => {
  try {
    const existing = localStorage.getItem('tarot_flox_sync_code');
    if (existing && existing.trim().length >= 4) {
      return existing.trim().toUpperCase();
    }
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let generated = 'FX';
    for (let i = 0; i < 6; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    localStorage.setItem('tarot_flox_sync_code', generated);
    return generated;
  } catch (e) {
    return 'FX777888';
  }
};

// Облачное KV-хранилище для синхронизации между телефоном и ПК на Vercel без настройки собственной БД
const CLOUD_KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal';
const CLOUD_APP_TOKEN = '4f9b2c8e';

const pushHistoryToCloudKV = async (code, historyList) => {
  if (!code) return;
  try {
    const safeKey = `tarot_flox_${code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
    const slimHistory = (historyList || []).slice(0, 25).map((item) => ({
      id: item.id,
      date: item.date,
      question: item.question,
      cards: (item.cards || []).map((c) => ({ code: c.code, name: c.name })),
      analysis: item.analysis,
      advice: item.advice,
      followUps: item.followUps || []
    }));
    const encoded = encodeURIComponent(JSON.stringify(slimHistory));
    await fetch(`${CLOUD_KV_BASE}/UpdateValue/${CLOUD_APP_TOKEN}/${safeKey}/${encoded}`, {
      method: 'POST'
    });
  } catch (e) {}
};

const pullHistoryFromCloudKV = async (code) => {
  if (!code) return null;
  try {
    const safeKey = `tarot_flox_${code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
    const res = await fetch(`${CLOUD_KV_BASE}/GetValue/${CLOUD_APP_TOKEN}/${safeKey}`);
    if (!res.ok) return null;
    const raw = await res.json();
    if (!raw) return null;
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        ...item,
        cards: (item.cards || []).map((c) => {
          const fullCard = DECK.find((d) => d.code === c.code || d.name === c.name);
          return fullCard || c;
        })
      }));
    }
  } catch (e) {}
  return null;
};

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
// Масти: Жезлы = wa, Кубки = cu, Мечи = sw, Пентакли = pe (CDN) / pa (sacred-texts)
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

// Генерация встроенного золотого SVG-аркана (подстраховка, если у пользователя пропал интернет)
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

const buildCardUrls = (primaryCode, secondaryCode = primaryCode) => [
  `https://cdn.jsdelivr.net/gh/ekelen/tarot-api@master/static/cards/${primaryCode}.jpg`,
  `https://raw.githubusercontent.com/ekelen/tarot-api/master/static/cards/${primaryCode}.jpg`,
  `https://sacred-texts.com/tarot/pkt/img/${secondaryCode}.jpg`,
  `https://www.sacred-texts.com/tarot/pkt/img/${secondaryCode}.jpg`
];

const DECK = (() => {
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

  const [currentReadingId, setCurrentReadingId] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);

  const [user, setUser] = useState(null);
  const [syncCode, setSyncCode] = useState(() => getOrCreateSyncCode());
  const [syncInput, setSyncInput] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [copiedSync, setCopiedSync] = useState(false);

  const [history, setHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [tableNoAlpha, setTableNoAlpha] = useState(false);

  // Точные пути к вашим реальным файлам
  const mediaUrls = {
    phoneWebm: '/phone-loop-muted.webm',
    phoneMp4: '/phone-loop-muted.mp4',
    desktopWebm: '/desktop-loop-muted.webm',
    desktopMp4: '/desktop-loop-muted.mp4',
    bgmMp3: '/tarot-ambient-loop.mp3',
    tableWebm: '/table-cloud-loop.webm',
    tableWebp: '/table-on-cloud.webp',
    adviceCloudWebm: '/cloud-loop-alpha.webm'
  };

  const videoRef = useRef(null);
  const tableVideoRef = useRef(null);
  const bgmRef = useRef(null);
  const flipAudioRef = useRef(null);
  const fadeIntervalRef = useRef(null);

  const analysisSectionRef = useRef(null);
  const followUpEndRef = useRef(null);

  const audioCtxRef = useRef(null);
  const wasPlayingBeforeHideRef = useRef(false);

  // Предзагрузка всех 78 карт
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

  // Авторизация Firebase
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
    });
    return () => unsubscribe();
  }, []);

  // История раскладов (локальная + облачная синхронизация по коду)
  useEffect(() => {
    try {
      const savedLocal = localStorage.getItem('tarotHistory_flox_v2');
      if (savedLocal) {
        const parsed = JSON.parse(savedLocal);
        setHistory(parsed);
        if (parsed.length > 0 && syncCode) {
          pushHistoryToCloudKV(syncCode, parsed);
        }
      }
    } catch (e) {}
  }, []);

  // Подтягивание истории из облака при смене/наличии кода синхронизации
  useEffect(() => {
    if (!syncCode) return;
    let active = true;
    pullHistoryFromCloudKV(syncCode).then((cloudItems) => {
      if (!active || !cloudItems || cloudItems.length === 0) return;
      setHistory((prev) => {
        const mergedMap = new Map();
        [...cloudItems, ...prev].forEach((it) => {
          if (it && it.id) mergedMap.set(it.id, it);
        });
        const merged = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);
        try {
          localStorage.setItem('tarotHistory_flox_v2', JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
    });
    return () => {
      active = false;
    };
  }, [syncCode]);

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
    const codeUpper = (syncCode || getOrCreateSyncCode()).trim().toUpperCase();
    const itemToSave = { ...readingObj, syncCode: codeUpper };

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== itemToSave.id);
      const updated = [itemToSave, ...filtered].sort((a, b) => b.id - a.id);
      try {
        localStorage.setItem('tarotHistory_flox_v2', JSON.stringify(updated));
      } catch (e) {}
      pushHistoryToCloudKV(codeUpper, updated);
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
    const codeUpper = (syncCode || getOrCreateSyncCode()).trim().toUpperCase();

    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('tarotHistory_flox_v2', JSON.stringify(updated));
      } catch (err) {}
      pushHistoryToCloudKV(codeUpper, updated);
      return updated;
    });

    if (selectedHistoryItem && selectedHistoryItem.id === id) {
      setSelectedHistoryItem(null);
      setView('history');
    }

    if (user && db) {
      const docId = String(id);
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'readings', docId));
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'readings_by_code', `${codeUpper}_${docId}`));
      } catch (err) {
        console.warn('Cloud delete warning:', err);
      }
    }
  };

  // Проверка Safari / iPhone для прозрачности WebM
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

  // Принудительный автозапуск фонового видео на iPhone / Android без кнопки Play
  useEffect(() => {
    const forcePlayVideos = () => {
      [videoRef.current, tableVideoRef.current].forEach((v) => {
        if (v) {
          v.muted = true;
          v.defaultMuted = true;
          v.playsInline = true;
          v.setAttribute('muted', '');
          v.setAttribute('playsinline', '');
          v.setAttribute('webkit-playsinline', '');
          if (v.paused) {
            v.play().catch(() => {});
          }
        }
      });
    };

    forcePlayVideos();
    const timer = setTimeout(forcePlayVideos, 300);

    const onFirstTouch = () => {
      forcePlayVideos();
    };
    window.addEventListener('touchstart', onFirstTouch, { passive: true });
    window.addEventListener('click', onFirstTouch, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('touchstart', onFirstTouch);
      window.removeEventListener('click', onFirstTouch);
    };
  }, [view]);

  // Автоматическая пауза музыки при сворачивании браузера или выключении экрана телефона
  useEffect(() => {
    const handleVisibilityOrHide = () => {
      if (document.hidden) {
        if (bgmRef.current && !bgmRef.current.paused) {
          wasPlayingBeforeHideRef.current = true;
          if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          bgmRef.current.pause();
        }
      } else {
        if (wasPlayingBeforeHideRef.current && musicPlaying && bgmRef.current) {
          wasPlayingBeforeHideRef.current = false;
          bgmRef.current.play().catch(() => {});
        }
        if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }
      }
    };

    const handlePageHide = () => {
      if (bgmRef.current && !bgmRef.current.paused) {
        wasPlayingBeforeHideRef.current = true;
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        bgmRef.current.pause();
      }
    };

    const handleWindowBlur = () => {
      // На мобильных устройствах при уходе в фон или блокировке экрана останавливаем звук
      if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')) {
        if (bgmRef.current && !bgmRef.current.paused) {
          wasPlayingBeforeHideRef.current = true;
          if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          bgmRef.current.pause();
        }
      }
    };

    const handleWindowFocus = () => {
      if (wasPlayingBeforeHideRef.current && musicPlaying && bgmRef.current) {
        wasPlayingBeforeHideRef.current = false;
        bgmRef.current.play().catch(() => {});
      }
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrHide);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrHide);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [musicPlaying]);

  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      if (bgmRef.current) bgmRef.current.pause();
    };
  }, []);

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

  const startMusicWithFade = () => {
    const a = bgmRef.current;
    if (!a) return;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

    a.volume = 0;
    const playPromise = a.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setMusicPlaying(true);
          let v = 0;
          setMusicVolume(0);
          fadeIntervalRef.current = setInterval(() => {
            v = Math.min(0.6, +(v + 0.03).toFixed(2));
            if (bgmRef.current) bgmRef.current.volume = v;
            setMusicVolume(v);
            if (v >= 0.6) {
              clearInterval(fadeIntervalRef.current);
            }
          }, 100);
        })
        .catch(() => {
          setMusicPlaying(false);
        });
    }
  };

  const pauseAllMusic = () => {
    wasPlayingBeforeHideRef.current = false;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    if (bgmRef.current && !bgmRef.current.paused) {
      bgmRef.current.pause();
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

  const enterSpace = () => {
    playCardFlipSound(0);
    startMusicWithFade();
    setView('transition');
    setTimeout(() => {
      setView('table');
    }, 1200);
  };

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
  * Если вопрос про ФИЗИЧЕСКОЕ СОСТОЯНИЕ, ЖИЗНЬ ИЛИ ЗДОРОВЬЕ человека: переводи каждую карту на язык тела, жизненной силы (витальности), энергии и физики.
  * Если вопрос про ОТНОШЕНИЯ, РАБОТУ, ДЕНЬГИ или ВЫБОР: переводи каждую деталь аркана непосредственно в реальные поступки, мотивы, скрытые факторы и физические обстоятельства этой темы.
- Запрещено использовать заголовки с решетками ###.

СТРУКТУРА ГЛУБОКОГО АНАЛИЗА:
1. Ядро ситуации и прямой ответ по сути вопроса сразу в первом абзаце.
2. Глубокий синтез и связка 5 карт как единой цепи (1 и 2 — основа и реальность, 3 — центральный узел, 4 и 5 — динамика, удержание и итог).
3. Четкий итоговый вывод без воды.

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

  const applyCustomSyncCode = async () => {
    const clean = syncInput.trim().toUpperCase();
    if (clean.length < 3) return;
    setSyncCode(clean);
    try {
      localStorage.setItem('tarot_flox_sync_code', clean);
    } catch (e) {}
    setSyncInput('');
    setShowSyncModal(false);

    const cloudItems = await pullHistoryFromCloudKV(clean);
    if (cloudItems && cloudItems.length > 0) {
      setHistory((prev) => {
        const mergedMap = new Map();
        [...cloudItems, ...prev].forEach((it) => {
          if (it && it.id) mergedMap.set(it.id, it);
        });
        const merged = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);
        try {
          localStorage.setItem('tarotHistory_flox_v2', JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
    }
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

    video::-webkit-media-controls,
    video::-webkit-media-controls-panel,
    video::-webkit-media-controls-play-button,
    video::-webkit-media-controls-start-playback-button {
      display: none !important;
      -webkit-appearance: none !important;
      opacity: 0 !important;
      pointer-events: none !important;
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
      width: 100%;
      max-width: 1120px;
      aspect-ratio: 1920 / 1098;
      margin: 0 auto;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tarot-stage video,
    .tarot-stage img.fallback {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center center;
      pointer-events: none;
      margin: 0 auto;
      transform: translateX(1.3%);
    }
    .tarot-stage img.fallback {
      display: none;
      animation: tarot-sway 6s ease-in-out infinite;
    }
    .tarot-stage.no-alpha video {
      display: none;
    }
    .tarot-stage.no-alpha img.fallback {
      display: block;
    }

    @keyframes tarot-sway {
      0%, 100% { transform: translateY(0.6%) rotate(0deg); }
      25% { transform: translateY(0) rotate(0.4deg); }
      50% { transform: translateY(-0.6%) rotate(0deg); }
      75% { transform: translateY(0) rotate(-0.4deg); }
    }

    .tarot-spread {
      position: absolute;
      left: 50%;
      top: 49%;
      width: 46%;
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
        width: 112%;
        margin-left: -6%;
      }
      .tarot-spread {
        width: 54%;
        gap: 1.5%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .tarot-stage img.fallback { animation: none; }
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

      <video
        ref={videoRef}
        className="bg"
        autoPlay
        muted
        defaultMuted
        loop
        playsInline
        webkit-playsinline="true"
        preload="auto"
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        onCanPlay={(e) => {
          e.currentTarget.muted = true;
          e.currentTarget.play().catch(() => {});
        }}
      >
        <source media="(orientation: portrait)" src={mediaUrls.phoneMp4} type="video/mp4" />
        <source media="(orientation: portrait)" src={mediaUrls.phoneWebm} type="video/webm" />
        <source src={mediaUrls.desktopMp4} type="video/mp4" />
        <source src={mediaUrls.desktopWebm} type="video/webm" />
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
          style={{
            position: 'relative',
            zIndex: 2,
            textAlign: 'center',
            width: 'min(96vw, 920px)',
            aspectRatio: '16 / 10',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(2rem, 5vw, 4rem)',
            animation: view === 'transition' ? 'disperse 1.2s forwards' : 'tarot-sway 6s ease-in-out infinite'
          }}
        >
          {/* Мягкое магическое свечение позади облака */}
          <div
            style={{
              position: 'absolute',
              inset: '12% 10%',
              borderRadius: '50%',
              background:
                'radial-gradient(ellipse at center, rgba(48, 22, 88, 0.82) 0%, rgba(76, 38, 128, 0.52) 48%, rgba(22, 12, 40, 0) 76%)',
              filter: 'blur(18px)',
              zIndex: -2,
              pointerEvents: 'none'
            }}
          />

          {/* Настоящее видео-облако cloud-loop-alpha.webm без квадратной рамки */}
          {!tableNoAlpha && (
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              src={mediaUrls.adviceCloudWebm}
              style={{
                position: 'absolute',
                inset: '-8% -6%',
                width: '112%',
                height: '116%',
                objectFit: 'contain',
                zIndex: -1,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 20px 45px rgba(0, 0, 0, 0.85))'
              }}
            />
          )}

          <h1
            className="mystic-font"
            style={{
              fontSize: 'clamp(2.1rem, 5.2vw, 3.7rem)',
              color: '#ffe3a8',
              margin: '0 0 12px 0',
              lineHeight: 1.18,
              maxWidth: '640px',
              textShadow: '0 4px 18px rgba(0, 0, 0, 0.95), 0 0 32px rgba(229, 176, 92, 0.85)'
            }}
          >
            Магическое пространство ответов
          </h1>
          <p
            className="text-font"
            style={{
              fontSize: 'clamp(1.25rem, 2.8vw, 1.65rem)',
              color: '#f0e4ff',
              margin: '0 0 34px 0',
              letterSpacing: '2.5px',
              textShadow: '0 2px 12px rgba(0, 0, 0, 0.95)'
            }}
          >
            by.Flox
          </p>
          <button
            onClick={enterSpace}
            className="text-font btn-magical"
            style={{
              padding: '19px 52px',
              fontSize: 'clamp(1.15rem, 2.8vw, 1.4rem)',
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
            <video
              autoPlay
              muted
              loop
              playsInline
              src={mediaUrls.adviceCloudWebm}
              style={{
                position: 'absolute',
                inset: '-18% -12%',
                width: '124%',
                height: '136%',
                objectFit: 'contain',
                zIndex: -1,
                pointerEvents: 'none'
              }}
            />
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
              {loading ? 'Расшифровываю расклад..' : 'РАСКИНУТЬ КАРТЫ'}
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
          <video
            ref={tableVideoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onError={() => setTableNoAlpha(true)}
          >
            <source src={mediaUrls.tableWebm} type='video/webm; codecs="vp9"' />
          </video>

          <img
            className="fallback"
            src={mediaUrls.tableWebp}
            alt="Стол судьбы"
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
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    src={mediaUrls.adviceCloudWebm}
                    style={{
                      position: 'absolute',
                      inset: '-18% -12%',
                      width: '124%',
                      height: '136%',
                      objectFit: 'contain',
                      zIndex: -1,
                      pointerEvents: 'none'
                    }}
                  />
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
