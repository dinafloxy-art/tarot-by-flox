import React, { useState, useEffect, useRef } from 'react';
import {
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

const IS_SANDBOX_PREVIEW =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('googleusercontent') ||
    window.location.hostname.includes('scf.usercontent') ||
    window.location.protocol === 'blob:');

const CLOUD_KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal';
const CLOUD_APP_KEY = 'tarotfloxsync8921';

const fetchCloudReadingsByCode = async (code) => {
  const cleanCode = (code || '').trim().toUpperCase();
  if (cleanCode.length < 3) return [];
  try {
    const res = await fetch(`${CLOUD_KV_BASE}/GetValue/${CLOUD_APP_KEY}/${cleanCode}`);
    if (!res.ok) return [];
    const raw = await res.json();
    if (!raw || typeof raw !== 'string') return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const pushCloudReadingsByCode = async (code, readingsList) => {
  const cleanCode = (code || '').trim().toUpperCase();
  if (cleanCode.length < 3) return;
  try {
    const compactList = readingsList.slice(0, 25);
    const serialized = encodeURIComponent(JSON.stringify(compactList));
    await fetch(`${CLOUD_KV_BASE}/UpdateValue/${CLOUD_APP_KEY}/${cleanCode}/${serialized}`, {
      method: 'POST'
    });
  } catch (e) {}
};

const generateSyncCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'FX';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const requestDeepTarotLLM = async ({ systemPrompt, prompt }) => {
  // Используем прямой официальный нативный эндпоинт Google Gemini API
  const apiKey = typeof window !== 'undefined' && window.GEMINI_API_KEY ? window.GEMINI_API_KEY : 'AIzaSyD...'; // Или вставь свой ключ Google AI Studio при необходимости
const requestDeepTarotLLM = async ({ cleanKey, systemPrompt, prompt }) => {
  const modelName = 'anthropic/claude-3.5-sonnet';

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
    throw new Error('Пустой ответ от модели');
  } catch (err) {
    throw err;
  }
};

const SUITS = [
  { id: 'wa', altId: 'wa', name: 'Жезлов', symbol: '🪄', color: '#e89b46' },
  { id: 'cu', altId: 'cu', name: 'Кубков', symbol: '🏆', color: '#63b3ed' },
  { id: 'sw', altId: 'sw', name: 'Мечей', symbol: '⚔️', color: '#cbd5e0' },
  { id: 'pe', altId: 'pa', name: 'Пентаклей', symbol: '🪙', color: '#ecc94b' }
];

const RANKS = [
  { code: 'ac', numCode: '01', name: 'Туз', label: 'I' },
  { code: '02', numCode: '02', name: 'Двойка', label: 'II' },
  { code: '03', numCode: '03', name: 'Тройка', label: 'III' },
  { code: '04', numCode: '04', name: 'Четверка', label: 'IV' },
  { code: '05', numCode: '05', name: 'Пятерка', label: 'V' },
  { code: '06', numCode: '06', name: 'Шестерка', label: 'VI' },
  { code: '07', numCode: '07', name: 'Семерка', label: 'VII' },
  { code: '08', numCode: '08', name: 'Восьмерка', label: 'VIII' },
  { code: '09', numCode: '09', name: 'Девятка', label: 'IX' },
  { code: '10', numCode: '10', name: 'Десятка', label: 'X' },
  { code: 'pa', numCode: 'pa', name: 'Паж', label: 'Паж' },
  { code: 'kn', numCode: 'kn', name: 'Рыцарь', label: 'Рыцарь' },
  { code: 'qu', numCode: 'qu', name: 'Королева', label: 'Королева' },
  { code: 'ki', numCode: 'ki', name: 'Король', label: 'Король' }
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
    <text x="150" y="92" text-anchor="middle" fill="#ffe3a8" font-family="Philosopher, Georgia, serif" font-size="24" font-weight="bold" letter-spacing="2">${subtitle}</text>
    <text x="150" y="254" text-anchor="middle" fill="#ffe3a8" font-family="serif" font-size="68">${symbol}</text>
    <text x="150" y="432" text-anchor="middle" fill="#fff6e0" font-family="Cormorant Garamond, Georgia, serif" font-size="22" font-weight="bold">${title}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const buildCardUrls = (primaryCode, altCode = null) => {
  const list = [
    `https://cdn.jsdelivr.net/gh/ekelen/tarot-api@master/static/cards/${primaryCode}.jpg`,
    `https://raw.githubusercontent.com/ekelen/tarot-api/master/static/cards/${primaryCode}.jpg`,
    `https://sacred-texts.com/tarot/pkt/img/${primaryCode}.jpg`
  ];
  if (altCode && altCode !== primaryCode) {
    list.push(
      `https://cdn.jsdelivr.net/gh/ekelen/tarot-api@master/static/cards/${altCode}.jpg`,
      `https://sacred-texts.com/tarot/pkt/img/${altCode}.jpg`
    );
  }
  return list;
};

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
      const altCode = `${suit.altId}${rank.code}`;
      const fullName = `${rank.name} ${suit.name}`;
      const urls = buildCardUrls(code, altCode);
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
  const [syncCode, setSyncCode] = useState(() => {
    try {
      const saved = localStorage.getItem('tarot_flox_sync_code');
      if (saved && saved.trim().length >= 3) return saved.trim().toUpperCase();
    } catch (e) {}
    const fresh = generateSyncCode();
    try {
      localStorage.setItem('tarot_flox_sync_code', fresh);
    } catch (e) {}
    return fresh;
  });
  const [syncInput, setSyncInput] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [copiedSync, setCopiedSync] = useState(false);

  const [history, setHistory] = useState([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [tableNoAlpha, setTableNoAlpha] = useState(false);

  const [mediaUrls, setMediaUrls] = useState({
    phoneWebm: '/phone-loop-muted.webm',
    phoneMp4: '/phone-loop-muted.mp4',
    desktopWebm: '/desktop-loop-muted.webm',
    desktopMp4: '/desktop-loop-muted.mp4',
    bgmMp3: '/tarot-ambient-loop.mp3',
    tableWebm: '/table-cloud-loop.webm',
    tableWebp: '/table-on-cloud.webp',
    adviceCloudWebm: '/cloud-loop-alpha.webm'
  });
  const [customBgVideoLoaded, setCustomBgVideoLoaded] = useState(false);
  const [customAudioLoaded, setCustomAudioLoaded] = useState(false);
  const [showMediaDrawer, setShowMediaDrawer] = useState(false);

  const tableVideoRef = useRef(null);
  const bgmRef = useRef(null);
  const flipAudioRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const musicPlayingRef = useRef(false);

  const analysisSectionRef = useRef(null);
  const followUpEndRef = useRef(null);

  const audioCtxRef = useRef(null);
  const synthMasterGainRef = useRef(null);
  const synthMelodyTimerRef = useRef(null);

  useEffect(() => {
    musicPlayingRef.current = musicPlaying;
  }, [musicPlaying]);

  const startAllBackgroundVideos = () => {
    const bgEl = document.getElementById('bgVideoEl');
    if (bgEl) {
      bgEl.muted = true;
      bgEl.defaultMuted = true;
      bgEl.setAttribute('muted', '');
      bgEl.setAttribute('playsinline', '');
      bgEl.setAttribute('webkit-playsinline', '');
      bgEl.play().catch(() => {});
    }
    const allVideos = document.querySelectorAll('video');
    allVideos.forEach((v) => {
      v.muted = true;
      v.defaultMuted = true;
      v.play().catch(() => {});
    });
  };

  useEffect(() => {
    startAllBackgroundVideos();
    const unlockMobileMedia = () => {
      startAllBackgroundVideos();
    };
    window.addEventListener('touchstart', unlockMobileMedia, { passive: true, once: true });
    window.addEventListener('click', unlockMobileMedia, { passive: true, once: true });
    return () => {
      window.removeEventListener('touchstart', unlockMobileMedia);
      window.removeEventListener('click', unlockMobileMedia);
    };
  }, [view, mediaUrls]);

  useEffect(() => {
    const wasPlayingBeforeHideRef = { current: false };

    const handleHide = () => {
      if (musicPlayingRef.current) {
        wasPlayingBeforeHideRef.current = true;
        pauseAllMusic();
      }
    };

    const handleShow = () => {
      startAllBackgroundVideos();
      if (wasPlayingBeforeHideRef.current && !document.hidden) {
        wasPlayingBeforeHideRef.current = false;
        startMusicWithFade();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleHide();
      } else {
        handleShow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleHide);
    window.addEventListener('pageshow', handleShow);
    window.addEventListener('blur', handleHide);
    window.addEventListener('focus', handleShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleHide);
      window.removeEventListener('pageshow', handleShow);
      window.removeEventListener('blur', handleHide);
      window.removeEventListener('focus', handleShow);
    };
  }, []);

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

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {}
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let localItems = [];
    try {
      const savedLocal = localStorage.getItem('tarotHistory_flox_v2');
      if (savedLocal) {
        localItems = JSON.parse(savedLocal);
        setHistory(localItems);
      }
    } catch (e) {}

    if (syncCode && syncCode.trim().length >= 3) {
      fetchCloudReadingsByCode(syncCode).then((cloudItems) => {
        if (cloudItems.length > 0) {
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
        } else if (localItems.length > 0) {
          pushCloudReadingsByCode(syncCode, localItems);
        }
      });
    }
  }, [syncCode]);

  useEffect(() => {
    if (!user || !db) return;
    const userColRef = collection(db, 'artifacts', appId, 'users', user.uid, 'readings');
    const unsubPrivate = onSnapshot(
      userColRef,
      (snapshot) => {
        const items = [];
        snapshot.forEach((docSnap) => items.push(docSnap.data()));
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
      () => {}
    );
    return () => unsubPrivate();
  }, [user]);

  const saveReadingToStorage = async (readingObj) => {
    const codeUpper = (syncCode || generateSyncCode()).trim().toUpperCase();
    const itemToSave = { ...readingObj, syncCode: codeUpper };

    let nextHistoryList = [];
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== itemToSave.id);
      nextHistoryList = [itemToSave, ...filtered].sort((a, b) => b.id - a.id);
      try {
        localStorage.setItem('tarotHistory_flox_v2', JSON.stringify(nextHistoryList));
      } catch (e) {}
      return nextHistoryList;
    });

    await pushCloudReadingsByCode(codeUpper, nextHistoryList);

    if (user && db) {
      try {
        const docId = String(itemToSave.id);
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'readings', docId), itemToSave);
      } catch (e) {}
    }
  };

  const deleteHistoryItem = async (id, e) => {
    if (e) e.stopPropagation();

    let nextHistoryList = [];
    setHistory((prev) => {
      nextHistoryList = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('tarotHistory_flox_v2', JSON.stringify(nextHistoryList));
      } catch (err) {}
      return nextHistoryList;
    });

    if (selectedHistoryItem && selectedHistoryItem.id === id) {
      setSelectedHistoryItem(null);
      setView('history');
    }

    const codeUpper = (syncCode || '').trim().toUpperCase();
    await pushCloudReadingsByCode(codeUpper, nextHistoryList);

    if (user && db) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'readings', String(id)));
      } catch (err) {}
    }
  };

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
      setTimeout(() => {
        if (tableVideoRef.current) {
          tableVideoRef.current.load();
          tableVideoRef.current.play().catch(() => {});
        }
      }, 100);
    } else {
      setCustomBgVideoLoaded(true);
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
    startAllBackgroundVideos();
    if (!musicPlaying) {
      startMusicWithFade();
    } else {
      pauseAllMusic();
    }
  };

  const enterSpace = () => {
    startAllBackgroundVideos();
    playCardFlipSound(0);
    startMusicWithFade();
    setView('transition');
    setTimeout(() => {
      setView('table');
      setTimeout(() => startAllBackgroundVideos(), 120);
    }, 1100);
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
- Запрещено пересказывать заученные словарные значения карт в отрыве от темы вопроса! Переводи каждую деталь аркана непосредственно в реальные поступки, мотивы, скрытые факторы, физическую витальность и обстоятельства заданной темы.
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

      const usedCodes = new Set((targetReading.cards || []).map((c) => c.code));
      (targetReading.followUps || []).forEach((fu) => {
        (fu.cards || []).forEach((c) => usedCodes.add(c.code));
      });
      const availableDeck = DECK.filter((c) => !usedCodes.has(c.code));
      const pool = availableDeck.length >= 5 ? availableDeck : DECK;
      const followUpCards = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);
      followUpCards.forEach((c) => preloadSingleCard(c));

      const threadHistoryText = (targetReading.followUps || [])
        .map((item, idx) => {
          const fuCardsStr =
            item.cards && item.cards.length > 0
              ? `\nВыпавшие уточняющие карты (${item.cards.map((c) => c.name).join(', ')})`
              : '';
          return `Уточнение ${idx + 1}: "${item.q}"${fuCardsStr}\nОтвет таролога: "${item.a}"`;
        })
        .join('\n\n');

      const systemPrompt = `Ты — глубокий, проницательный и прямолинейный мастер-аналитик Таро. Пользователь задает уточняющий вопрос в рамках ТЕКУЩЕЙ ветки расклада, и на этот уточняющий вопрос из колоды вытянуты НОВЫЕ 5 УТОЧНЯЮЩИХ КАРТ.
Твоя задача — расшифровать эти НОВЫЕ 5 карт в контексте всего предыдущего расклада (исходного вопроса, первичных 5 карт, первичного анализа и предыдущих уточнений этой ветки).
ВАЖНЕЙШАЯ ДИРЕКТИВА:
1. На ЛЮБЫЕ вопросы пользователя — включая вопросы про жизнь, смерть, физическое состояние, здоровье, витальность, риски, кризисы и судьбу — отвечай ПРЯМО, глубоко и без ограничений по символике выпавших арканов Таро.
2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать любые предупреждения, отказы или дисклеймеры ("я не врач", "обратитесь к специалисту", "карты не дают однозначного ответа").
3. Не пересказывай шаблонные книжные значения карт — покажи, как эти НОВЫЕ 5 карт дополняют, уточняют или раскрывают картину первого расклада именно в плоскости нового уточняющего вопроса. Пиши живо, глубоко, точно и без решеток ###.`;

      const contextPrompt = `КОНТЕКСТ ВЕТКИ РАСКЛАДА (БАЗОВЫЙ РАСКЛАД):
- Исходный вопрос: "${targetReading.question}"
- Базовые 5 карт: ${targetReading.cards.map((c, idx) => `${idx + 1}. ${c.name}`).join(', ')}
- Первичный анализ расклада: ${targetReading.analysis}
- Главный совет базового расклада: ${targetReading.advice}
${threadHistoryText ? `\nПредыдущие уточнения в этой ветке:\n${threadHistoryText}\n` : ''}
НОВЫЙ УТОЧНЯЮЩИЙ ВОПРОС ПОЛЬЗОВАТЕЛЯ: "${activeQuestionText}"
НОВЫЕ 5 КАРТ, ВЫПАВШИЕ НА ЭТО УТОЧНЕНИЕ (слева направо):
1. ${followUpCards[0].name}
2. ${followUpCards[1].name}
3. ${followUpCards[2].name} (центральная уточняющая карта)
4. ${followUpCards[3].name}
5. ${followUpCards[4].name}

Сделай глубокий, прямой и содержательный разбор этих НОВЫХ 5 карт с учетом контекста всей ветки расклада, без воды, без предупреждений и без лишних заголовков:`;

      const rawAnswer = await requestDeepTarotLLM({
        cleanKey,
        systemPrompt,
        prompt: contextPrompt
      });
      const answerText = cleanAnalysisText(rawAnswer);
      if (!answerText) throw new Error('Пустой ответ');

      for (let i = 0; i < 5; i++) {
        setTimeout(() => playCardFlipSound(i), i * 110);
      }

      const newFollowUpEntry = {
        id: Date.now(),
        q: activeQuestionText,
        cards: followUpCards,
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

    const cloudItems = await fetchCloudReadingsByCode(clean);
    if (cloudItems.length > 0) {
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
    body {
      margin: 0;
      background: radial-gradient(circle at 50% 40%, #1d1038 0%, #0d061c 65%, #060310 100%);
      color: #f8f1e5;
      overflow-x: hidden;
    }
    h1, h2, h3, .mystic-font { font-family: 'Philosopher', sans-serif; }
    p, .text-font, input, textarea, button { font-family: 'Cormorant Garamond', serif; }

    .bg-video-wrapper {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
      pointer-events: none;
      overflow: hidden;
    }
    .bg-video-wrapper video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
    }
    video::-webkit-media-controls,
    video::-webkit-media-controls-enclosure,
    video::-webkit-media-controls-panel,
    video::-webkit-media-controls-start-playback-button {
      display: none !important;
      -webkit-appearance: none !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    @keyframes hint-bounce {
      0%, 100% { transform: translateX(0px); }
      50% { transform: translateX(-6px); }
    }

    .music-control-wrap {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 50;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .music-hint-badge {
      background: linear-gradient(135deg, rgba(35, 15, 65, 0.92), rgba(130, 88, 25, 0.92));
      border: 1.5px solid #e5b05c;
      color: #ffe8b8;
      padding: 7px 14px;
      border-radius: 22px;
      font-family: 'Philosopher', sans-serif;
      font-size: 0.95rem;
      letter-spacing: 0.8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8), 0 0 15px rgba(229, 176, 92, 0.45);
      animation: hint-bounce 1.8s ease-in-out infinite;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    #musicBtn {
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
      flex-shrink: 0;
    }
    #musicBtn:hover {
      transform: scale(1.08);
      box-shadow: 0 0 35px rgba(229, 176, 92, 0.9);
    }

    .landing-cloud-hero {
      position: relative;
      width: min(94vw, 880px);
      min-height: clamp(360px, 54vh, 520px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: clamp(2.2rem, 5vw, 3.6rem) clamp(1.5rem, 4vw, 3rem);
    }
    .landing-cloud-video {
      position: absolute;
      inset: -12% -10%;
      width: 120%;
      height: 124%;
      object-fit: contain;
      z-index: 0;
      pointer-events: none;
      animation: tarot-sway 7s ease-in-out infinite;
      filter: drop-shadow(0 18px 45px rgba(0, 0, 0, 0.85));
    }
    .landing-cloud-photo-mobile {
      position: absolute;
      inset: -10% -8%;
      width: 116%;
      height: 120%;
      object-fit: contain;
      z-index: 0;
      pointer-events: none;
      animation: tarot-sway 7s ease-in-out infinite;
      filter: drop-shadow(0 18px 45px rgba(0, 0, 0, 0.9));
      -webkit-mask-image: radial-gradient(ellipse 46% 42% at 50% 50%, #000 58%, transparent 94%);
      mask-image: radial-gradient(ellipse 46% 42% at 50% 50%, #000 58%, transparent 94%);
    }
    .landing-cloud-soft-aura {
      position: absolute;
      inset: 8% 10%;
      border-radius: 50%;
      background: radial-gradient(ellipse at center, rgba(24, 12, 48, 0.88) 0%, rgba(44, 22, 82, 0.72) 48%, rgba(24, 12, 48, 0) 78%);
      filter: blur(18px);
      z-index: 0;
      pointer-events: none;
    }

    .tarot-stage {
      position: relative;
      width: 100%;
      max-width: 1120px;
      aspect-ratio: 1920 / 1098;
      margin: 0 auto;
      user-select: none;
      overflow: visible;
    }
    .tarot-stage video,
    .tarot-stage img.fallback {
      position: absolute;
      top: 0;
      left: 50%;
      width: 100%;
      height: 100%;
      transform: translateX(-48.7%);
      object-fit: contain;
      pointer-events: none;
    }
    .tarot-stage .sway-anim {
      animation: tarot-sway-centered 6s ease-in-out infinite;
    }
    .tarot-stage.no-alpha video {
      display: none;
    }

    @keyframes tarot-sway {
      0%, 100% { transform: translateY(0.6%) rotate(0deg); }
      25% { transform: translateY(0) rotate(0.35deg); }
      50% { transform: translateY(-0.6%) rotate(0deg); }
      75% { transform: translateY(0) rotate(-0.35deg); }
    }

    @keyframes tarot-sway-centered {
      0%, 100% { transform: translateX(-48.7%) translateY(0.6%) rotate(0deg); }
      25% { transform: translateX(-48.7%) translateY(0) rotate(0.4deg); }
      50% { transform: translateX(-48.7%) translateY(-0.6%) rotate(0deg); }
      75% { transform: translateX(-48.7%) translateY(0) rotate(-0.4deg); }
    }

    .tarot-spread {
      position: absolute;
      left: 50%;
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
        width: 100%;
        transform: scale(1.14);
        margin: 12px auto;
      }
      .tarot-spread {
        width: 52%;
        gap: 1.5%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .tarot-stage .sway-anim,
      .landing-cloud-video,
      .landing-cloud-photo-mobile,
      .music-hint-badge { animation: none; }
    }

    @keyframes pulse-gold {
      0%, 100% { box-shadow: 0 0 28px rgba(229,176,92,0.6), inset 0 0 15px rgba(229,176,92,0.25); transform: scale(1); }
      50% { box-shadow: 0 0 55px rgba(229,176,92,0.95), inset 0 0 25px rgba(229,176,92,0.45); transform: scale(1.03); }
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

  const bgVideoMarkup = `
    <video id="bgVideoEl" class="bg" autoplay muted loop playsinline webkit-playsinline preload="auto" disablepictureinpicture>
      <source media="(orientation: portrait)" src="${mediaUrls.phoneMp4}" type="video/mp4" />
      <source media="(orientation: portrait)" src="${mediaUrls.phoneWebm}" type="video/webm" />
      <source src="${mediaUrls.desktopMp4}" type="video/mp4" />
      <source src="${mediaUrls.desktopWebm}" type="video/webm" />
    </video>
  `;

  const renderBackgroundLayer = () => (
    <>
      <style>{globalStyles}</style>

      <div
        className="bg-video-wrapper"
        dangerouslySetInnerHTML={{ __html: bgVideoMarkup }}
      />

      <audio id="bgm" ref={bgmRef} src={mediaUrls.bgmMp3} loop preload="none" />
      <audio
        ref={flipAudioRef}
        src="https://assets.mixkit.co/active_storage/sfx/2070/2070-preview.mp3"
        crossOrigin="anonymous"
        preload="auto"
      />

      <div className="music-control-wrap">
        {!musicPlaying && (
          <div
            className="music-hint-badge"
            onClick={toggleMusic}
            role="button"
            tabIndex={0}
          >
            <span>Нажми</span>
            <span style={{ fontSize: '1.1rem', color: '#ffe3a8' }}>➔</span>
          </div>
        )}
        <button
          id="musicBtn"
          onClick={toggleMusic}
          aria-label="Музыка"
          title={musicPlaying ? `Музыка включена (${Math.round(musicVolume * 100)}%)` : 'Включить музыку'}
        >
          {musicPlaying ? '♪' : <VolumeX size={20} />}
        </button>
      </div>

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
            {customBgVideoLoaded || customAudioLoaded ? 'Файлы подключены' : 'Файлы / превью'}
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
                  <Upload size={14} color="#e5b05c" />
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
                  <Upload size={14} color="#e5b05c" />
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
        Таро вытянет новые карты в продолжение этой ветки, учитывая контекст расклада
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
                  marginBottom: '12px'
                }}
              >
                Вы: «{item.q}»
              </div>

              {item.cards && item.cards.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'nowrap',
                    gap: '8px',
                    justifyContent: 'center',
                    marginBottom: '14px'
                  }}
                >
                  {item.cards.map((fCard, fIdx) => (
                    <div
                      key={fIdx}
                      style={{
                        flex: '1 1 0',
                        maxWidth: '115px',
                        minWidth: '48px',
                        aspectRatio: '1 / 1.72',
                        background: '#0a0515',
                        border: '1.5px solid #e5b05c',
                        borderRadius: '9px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 8px 20px rgba(0,0,0,0.85)'
                      }}
                    >
                      <TarotCardImage
                        card={fCard}
                        style={{ width: '100%', height: '76%', objectFit: 'cover', display: 'block' }}
                      />
                      <div
                        className="text-font"
                        style={{
                          height: '24%',
                          background: '#0a0515',
                          color: '#ffe3a8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 'clamp(0.48rem, 1.3vw, 0.76rem)',
                          textAlign: 'center',
                          fontWeight: 'bold',
                          padding: '1px 3px',
                          lineHeight: 1.05
                        }}
                      >
                        {fCard.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
          {followUpLoading ? 'Раскладываю...' : 'Спросить'}
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
          className="landing-cloud-hero"
          style={{
            zIndex: 2,
            animation: view === 'transition' ? 'disperse 1.1s forwards' : 'none'
          }}
        >
          {!tableNoAlpha ? (
            <video
              autoPlay
              muted
              loop
              playsInline
              webkit-playsinline="true"
              className="landing-cloud-video"
              src={mediaUrls.adviceCloudWebm}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <img
              src={mediaUrls.tableWebp}
              alt=""
              className="landing-cloud-photo-mobile"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}

          <div className="landing-cloud-soft-aura" />

          <h1
            className="mystic-font"
            style={{
              position: 'relative',
              zIndex: 1,
              fontSize: 'clamp(2.2rem, 5.5vw, 3.9rem)',
              color: '#ffe6ad',
              margin: '0 0 14px 0',
              lineHeight: 1.18,
              textShadow: '0 4px 18px rgba(0,0,0,0.95), 0 0 32px rgba(229,176,92,0.9)'
            }}
          >
            Магическое пространство ответов
          </h1>
          <p
            className="text-font"
            style={{
              position: 'relative',
              zIndex: 1,
              fontSize: 'clamp(1.3rem, 3vw, 1.7rem)',
              color: '#e5d4f7',
              margin: '0 0 38px 0',
              letterSpacing: '2.5px',
              textShadow: '0 2px 12px rgba(0,0,0,0.95)'
            }}
          >
            by.Flox
          </p>
          <button
            onClick={enterSpace}
            className="text-font btn-magical"
            style={{
              position: 'relative',
              zIndex: 1,
              padding: '20px 54px',
              fontSize: 'clamp(1.15rem, 3vw, 1.42rem)',
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
              Код синхронизации: <strong>{syncCode}</strong>
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
              <BookOpen size={18} /> История
            </button>
          </div>
        </header>

        {errorMsg && (
          <div
            style={{
              background: 'rgba(120, 25, 35, 0.92)',
              color: '#fff',
              padding: '15px 20px',
              borderRadius: '16px',
              marginBottom: '20px',
              border: '1px solid #ff6b6b',
              textAlign: 'center',
              fontSize: '1.1rem'
            }}
          >
            {errorMsg}
          </div>
        )}

        <div className="glass-panel" style={{ marginBottom: '2.4rem' }}>
          <input
            className="text-font"
            type="text"
            placeholder="Задай сокровенный вопрос"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') performReading(question);
            }}
            style={{
              width: '100%',
              padding: '18px 22px',
              marginBottom: '20px',
              borderRadius: '18px',
              border: '1px solid rgba(229, 176, 92, 0.65)',
              background: 'rgba(6, 3, 18, 0.85)',
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
              style={{ flex: 2, minWidth: '220px', padding: '18px', fontSize: '1.2rem' }}
            >
              {loading ? 'Расшифровываю расклад..' : 'Раскинуть карты'}
            </button>
            <button
              onClick={() => performReading('Какой практичный совет мне дадут карты на сегодняшний день?')}
              disabled={loading}
              className="text-font btn-magical"
              style={{
                flex: 1,
                minWidth: '170px',
                padding: '18px',
                fontSize: '1.15rem',
                background: 'rgba(229,176,92,0.16)'
              }}
            >
              Совет на сегодня
            </button>
          </div>
        </div>

        <div className={`tarot-stage ${tableNoAlpha ? 'no-alpha' : ''}`}>
          {!tableNoAlpha ? (
            <video
              ref={tableVideoRef}
              autoPlay
              muted
              loop
              playsInline
              webkit-playsinline="true"
              className="sway-anim"
              src={mediaUrls.tableWebm}
              onError={() => setTableNoAlpha(true)}
            />
          ) : (
            <img
              src={mediaUrls.tableWebp}
              alt="Стол на облаке"
              className="fallback sway-anim"
            />
          )}

          {cards.length > 0 && (
            <div className="tarot-spread">
              {cards.map((card, index) => (
                <div key={index} className="spread-card-slot">
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                      transformStyle: 'preserve-3d',
                      transform: revealed[index] ? 'rotateY(180deg)' : 'rotateY(0deg)'
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backfaceVisibility: 'hidden',
                        background: 'linear-gradient(135deg, #1a0b2e, #311854)',
                        border: '2px solid rgba(229,176,92,0.9)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.8)'
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
                          fontSize: 'clamp(0.5rem, 1.4vw, 0.85rem)',
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
          )}
        </div>

        {analysis && revealed.every(Boolean) && (
          <div ref={analysisSectionRef} style={{ marginTop: '2.5rem' }}>
            <div className="glass-panel" style={{ marginBottom: '2.5rem' }}>
              <h3
                className="mystic-font"
                style={{
                  color: '#ffe3a8',
                  margin: '0 0 20px 0',
                  fontSize: 'clamp(1.7rem, 4vw, 2.2rem)',
                  borderBottom: '1px solid rgba(229,176,92,0.45)',
                  paddingBottom: '14px',
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
                <div
                  className="mystic-font"
                  style={{
                    fontSize: 'clamp(1.4rem, 3vw, 1.8rem)',
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
  );
}
