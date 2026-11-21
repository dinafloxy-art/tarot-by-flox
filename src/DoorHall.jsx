import React, { useCallback, useEffect, useRef, useState } from 'react';

// ЗАЛ ТРЁХ ДВЕРЕЙ
// Платформа с тремя дверями: стрелки / свайп / клавиши ← → поворачивают её,
// нажатие на переднюю дверь (или кнопку «Войти», или Enter) открывает дверь.
// Все файлы лежат в папке hall/.
//
// Исправления:
// • В покое на экране стоит последний кадр самого видео, а не отдельная картинка,
//   поэтому при старте поворота ничего не меняется в размере и цвете.
// • Два видео-слоя: новый ролик показывается только когда у него уже есть кадр,
//   поэтому между роликами нет мигания.
// • Зелёная вспышка в конце ролика «Звуки → Сны» обрезана (настройка TRIM ниже).

const DOORS = [
  { key: 'tarot', view: 'table', title: 'Таро-расклады', plaque: 'Таро', metal: ['#fff6d6', '#f1c86a', '#a8701c', '#ffe7a6'], color: '#ffe3a8', glow: 'rgba(229,176,92,0.85)' },
  { key: 'sounds', view: 'sounds', title: 'Звуки', plaque: 'Звуки', metal: ['#effffb', '#7ff0dc', '#127a72', '#c9fff4'], color: '#b7fff1', glow: 'rgba(94,234,212,0.85)' },
  { key: 'dreams', view: 'dreams', title: 'Сны', plaque: 'Сны', metal: ['#fbf9ff', '#cfc2ff', '#5b49b8', '#ece6ff'], color: '#e4dcff', glow: 'rgba(167,139,250,0.9)' }
];

// Ролики поворота уже пересобраны ровно на 2 секунды, поэтому скорость 1.
// Чтобы ускорить/замедлить, меняй ROTATE_RATE (1.2 = на 20% быстрее).
const ROTATE_RATE = 1;
// Открывание двери: примерно на 1 секунду быстрее прошлого
const OPEN_RATE = 1.85;

// Сколько секунд ролика отрезать (end — с конца, start — с начала).
// Если зелёная вспышка всё ещё видна, увеличь 0.6 до 0.9.
const TRIM = {}; // ролики пересобраны: обрезать больше ничего не нужно
// Все ролики останавливаем чуть раньше конца: в самых последних кадрах
// обратных поворотов картинка темнеет.
const END_GUARD = 0.02;
// За сколько секунд до конца поворота показывать надпись и кнопку новой двери
const UI_EARLY = 0.45;
// Плавная смена роликов (секунды), убирает мигание в начале поворота
const CROSSFADE = 0.15;

// Пропорции кадров и положение таблички передней двери (в процентах кадра)
const LAYOUT = {
  pc: { aspect: 1248 / 720, plaque: { x: 50.6, y: 14.6, font: 0.0165 }, door: { l: 39, t: 27, w: 23, h: 52 } },
  ph: { aspect: 720 / 1248, plaque: { x: 48.8, y: 28.1, font: 0.031 }, door: { l: 30, t: 32, w: 39, h: 42 } }
};

const LAST_DOOR_KEY = 'flox_hall_front_door';
const base = '/hall/';
const clipName = (dev, kind, a, b) => (kind === 'rot' ? `${base}${dev}-rot-${a}-${b}.mp4?v=7` : `${base}${dev}-open-${a}.mp4`);
const stillName = (dev, d, ext = 'webp') => `${base}${dev}-hall-${d}.${ext}?v=7`;

const detectDevice = () => {
  if (typeof window === 'undefined') return 'pc';
  return window.innerHeight > window.innerWidth ? 'ph' : 'pc';
};

// Орнамент по бокам надписи на табличке
function Flourish({ id, metal, flip = false }) {
  return (
    <svg className="plaque-flourish" viewBox="0 0 60 24" style={flip ? { transform: 'scaleX(-1)' } : undefined} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={metal[0]} />
          <stop offset="0.5" stopColor={metal[1]} />
          <stop offset="1" stopColor={metal[2]} />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${id})`} strokeWidth="1.6" strokeLinecap="round">
        <path d="M4 12 H34" />
        <path d="M34 12 C38 4, 47 4, 48 10 C49 15, 43 16, 42 12" />
        <path d="M34 12 C38 20, 47 20, 48 14" />
        <path d="M14 12 C17 8, 21 8, 23 12" opacity=".7" />
      </g>
      <path d="M54 12 L57 9 L60 12 L57 15 Z" transform="translate(-3 0)" fill={`url(#${id})`} />
      <circle cx="6" cy="12" r="1.6" fill={`url(#${id})`} />
    </svg>
  );
}

export default function DoorHall({ onEnter, sfxEnabled = true }) {
  const [device, setDevice] = useState(detectDevice);
  const [front, setFront] = useState(() => {
    try {
      const v = Number(sessionStorage.getItem(LAST_DOOR_KEY));
      return v >= 0 && v <= 2 ? v : 0;
    } catch (e) {
      return 0;
    }
  });
  const [busy, setBusy] = useState(false);
  const [uiHidden, setUiHidden] = useState(false); // скрыты ли надпись и кнопка
  const [fadingLayer, setFadingLayer] = useState(-1); // слой, который готовится и пока прозрачен
  const [activeLayer, setActiveLayer] = useState(-1); // -1 = видео ещё не готово, видна картинка
  const [flash, setFlash] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false); // зал проявляется из темноты, когда кадр уже загружен

  const videoRefs = [useRef(null), useRef(null)];
  const layerRef = useRef(-1);
  const blobsRef = useRef({});
  const busyRef = useRef(false);
  const frontRef = useRef(front);
  const touchRef = useRef(null);
  const sfxRef = useRef({});

  frontRef.current = front;
  const layout = LAYOUT[device];

  const showLayer = (i) => {
    layerRef.current = i;
    setActiveLayer(i);
  };

  // Размер «сцены»: кадр заполняет экран целиком
  useEffect(() => {
    const onResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dev = detectDevice();
      setDevice(dev);
      const asp = LAYOUT[dev].aspect;
      const w = Math.max(vw, vh * asp);
      setBox({ w, h: w / asp });
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Предзагрузка кадров, роликов и звуков для текущего устройства
  useEffect(() => {
    let cancelled = false;
    DOORS.forEach((d) => {
      const img = new Image();
      img.src = stillName(device, d.key);
    });
    const urls = [];
    DOORS.forEach((a, i) => {
      const next = DOORS[(i + 1) % 3].key;
      const prev = DOORS[(i + 2) % 3].key;
      urls.push(clipName(device, 'rot', a.key, next), clipName(device, 'rot', a.key, prev));
    });
    DOORS.forEach((d) => urls.push(clipName(device, 'open', d.key)));
    (async () => {
      for (const u of urls) {
        if (cancelled) return;
        if (blobsRef.current[u]) continue;
        try {
          const res = await fetch(u);
          if (!res.ok) continue;
          const blob = await res.blob();
          if (!cancelled) blobsRef.current[u] = URL.createObjectURL(blob);
        } catch (e) {}
      }
    })();
    try {
      sfxRef.current.platform = new Audio(`${base}sfx-platform.mp3`);
      sfxRef.current.door = new Audio(`${base}sfx-door.mp3`);
      sfxRef.current.platform.preload = 'auto';
      sfxRef.current.door.preload = 'auto';
    } catch (e) {}
    return () => {
      cancelled = true;
    };
  }, [device]);

  useEffect(
    () => () => {
      Object.values(blobsRef.current).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch (e) {}
      });
    },
    []
  );

  // Кадр покоя: берём ролик, который ЗАКАНЧИВАЕТСЯ на текущей двери, и встаём на его последний кадр
  useEffect(() => {
    if (busyRef.current) return;
    const cur = frontRef.current;
    const prevKey = DOORS[(cur + 2) % 3].key;
    const curKey = DOORS[cur].key;
    const trim = TRIM[`${prevKey}-${curKey}`] || {};
    const url = clipName(device, 'rot', prevKey, curKey);
    const v = videoRefs[0].current;
    if (!v) return;
    let alive = true;
    layerRef.current = -1;
    setActiveLayer(-1);
    const seekToEnd = () => {
      try {
        v.currentTime = Math.max(0, (v.duration || 5) - (trim.end || 0) - END_GUARD);
      } catch (e) {}
    };
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => {
      // iPhone рисует кадр только после короткого play/pause
      const p = v.play();
      if (p && p.then) p.then(() => { v.pause(); seekToEnd(); }).catch(seekToEnd);
      else seekToEnd();
    };
    v.onseeked = () => {
      v.onseeked = null;
      if (alive && !busyRef.current) showLayer(0);
    };
    v.src = url;
    v.load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  const playSfx = (name, volume = 0.7) => {
    if (!sfxEnabled) return;
    try {
      const a = sfxRef.current[name];
      if (!a) return;
      a.currentTime = 0;
      a.volume = volume;
      a.play().catch(() => {});
    } catch (e) {}
  };

  // Проигрывает ролик на свободном слое; слой становится видимым, только когда у него есть кадр.
  // По окончании ролик остаётся на последнем кадре.
  const playClip = useCallback((url, rate, onTime, trim = {}) => {
    return new Promise((resolve) => {
      const nextIdx = layerRef.current === 0 ? 1 : 0;
      const v = videoRefs[nextIdx].current;
      if (!v) return resolve(false);
      const src = blobsRef.current[url] || url;
      const startAt = trim.start || 0;
      const endCut = (trim.end || 0) + END_GUARD;
      setFadingLayer(nextIdx);
      let done = false;
      let shown = false;
      let raf = 0;
      const finish = (ok) => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        v.onended = null;
        v.onerror = null;
        v.onloadedmetadata = null;
        v.onseeked = null;
        clearTimeout(safety);
        resolve(ok);
      };
      const safety = setTimeout(() => finish(false), 12000);
      const tick = () => {
        const d = v.duration || 5;
        const t = v.currentTime;
        if (!shown && !v.paused && v.readyState >= 2 && t >= startAt) {
          shown = true;
          showLayer(nextIdx);
          setFadingLayer(-1);
        }
        if (onTime) onTime(t, d);
        if (v.duration && t >= d - endCut) {
          v.pause();
          finish(true);
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      v.muted = true;
      v.playsInline = true;
      v.onloadedmetadata = () => {
        if (startAt) {
          try {
            v.currentTime = startAt;
          } catch (e) {}
        }
      };
      v.onended = () => finish(true);
      v.onerror = () => finish(false);
      v.src = src;
      v.playbackRate = rate;
      v.defaultPlaybackRate = rate;
      const p = v.play();
      if (p && p.then) {
        p.then(() => {
          v.playbackRate = rate;
        }).catch(() => finish(false));
      }
      raf = requestAnimationFrame(tick);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotate = useCallback(
    async (dir) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setUiHidden(true);
      const cur = frontRef.current;
      const target = (cur + (dir > 0 ? 1 : 2)) % 3;
      const a = DOORS[cur].key;
      const b = DOORS[target].key;
      const trim = TRIM[`${a}-${b}`] || {};
      playSfx('platform', 0.75);
      let uiShown = false;
      const revealUi = () => {
        if (uiShown) return;
        uiShown = true;
        setFront(target);
        setUiHidden(false);
      };
      await playClip(clipName(device, 'rot', a, b), ROTATE_RATE, (t, d) => {
        // надпись и кнопка новой двери появляются ещё до остановки платформы
        if (t >= d - (trim.end || 0) - END_GUARD - UI_EARLY * ROTATE_RATE) revealUi();
      }, trim);
      revealUi();
      try {
        sessionStorage.setItem(LAST_DOOR_KEY, String(target));
      } catch (e) {}
      busyRef.current = false;
      setBusy(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [device, playClip, sfxEnabled]
  );

  const openFront = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const door = DOORS[frontRef.current];
    setUiHidden(true);
    playSfx('door', 0.8);
    let flashed = false;
    const ok = await playClip(clipName(device, 'open', door.key), OPEN_RATE, (t, dur) => {
      // белая вспышка только в самом конце (~0.3 с)
      if (!flashed && t >= dur - 0.3 * OPEN_RATE) {
        flashed = true;
        setFlash(true);
      }
    });
    if (!ok || !flashed) {
      setFlash(true);
      await new Promise((r) => setTimeout(r, 200));
    } else {
      await new Promise((r) => setTimeout(r, 120));
    }
    busyRef.current = false;
    if (onEnter) onEnter(door.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, playClip, onEnter, sfxEnabled]);

  // Страховка: если кадр грузится долго, всё равно показываем зал
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Клавиатура
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') rotate(1);
      else if (e.key === 'ArrowLeft') rotate(-1);
      else if (e.key === 'Enter') openFront();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rotate, openFront]);

  // Свайп
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };
  const onTouchEnd = (e) => {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      rotate(dx < 0 ? 1 : -1);
    }
  };

  const door = DOORS[front];
  const plaqueFont = Math.max(11, box.w * layout.plaque.font);
  // Активный слой сверху и плавно проявляется; прошлый остаётся под ним на своём последнем кадре
  const layerStyle = (i) => {
    const isActive = activeLayer === i;
    const isFading = fadingLayer === i;
    const visibleBelow = activeLayer !== -1 && !isActive && !isFading;
    return {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      opacity: isActive || visibleBelow ? 1 : 0,
      zIndex: isActive || isFading ? 2 : 1,
      transition: isActive ? `opacity ${CROSSFADE}s ease-out` : 'none',
      pointerEvents: 'none'
    };
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ position: 'fixed', inset: 0, width: '100vw', overflow: 'hidden', background: '#070312', zIndex: 1, touchAction: 'pan-y' }}
    >
      <style>{`
        .plaque-title { display: flex; align-items: center; gap: .18em; white-space: nowrap; }
        .plaque-word { font-family: 'Cormorant Unicase', 'Cormorant Garamond', serif; font-weight: 700; letter-spacing: .09em; line-height: 1;
          background: linear-gradient(180deg, var(--m0) 0%, var(--m1) 34%, var(--m2) 52%, var(--m1) 70%, var(--m3) 100%);
          background-size: 100% 220%; animation: plaqueShine 5s ease-in-out infinite;
          -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent;
          -webkit-text-stroke: .5px rgba(28, 12, 2, .55);
          filter: drop-shadow(0 1px 1px rgba(0,0,0,.95)) drop-shadow(0 0 5px var(--glow)) drop-shadow(0 0 14px var(--glow)); }
        .plaque-flourish { width: 1.5em; height: .6em; flex-shrink: 0; filter: drop-shadow(0 0 4px var(--glow)); }
        @keyframes plaqueShine { 0%,100% { background-position: 0 0 } 50% { background-position: 0 100% } }
        @keyframes hallHint { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        @keyframes hallArrowL { 0%,100% { transform: translateY(-50%) translateX(0) } 50% { transform: translateY(-50%) translateX(-5px) } }
        @keyframes hallArrowR { 0%,100% { transform: translateY(-50%) translateX(0) } 50% { transform: translateY(-50%) translateX(5px) } }
        @keyframes plaqueGlow { 0%,100% { filter: brightness(1) } 50% { filter: brightness(1.18) } }
        .hall-arrow { position: absolute; top: 50%; z-index: 6; width: 58px; height: 58px; border-radius: 50%;
          background: rgba(14, 8, 30, 0.6); border: 1.5px solid rgba(229,176,92,0.85); color: #ffe3a8; font-size: 26px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(6px);
          box-shadow: 0 0 22px rgba(229,176,92,0.45); transition: opacity .3s ease, background .25s ease; }
        .hall-arrow:hover { background: rgba(60, 30, 100, 0.8); }
        .hall-arrow:disabled { opacity: .25; cursor: default; }
        @media (max-width: 600px) { .hall-arrow { width: 46px; height: 46px; font-size: 21px; } }
      `}</style>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: box.w || '100%',
          height: box.h || '100%',
          transform: 'translate(-50%, -50%)',
          opacity: ready ? 1 : 0,
          transition: 'opacity .45s ease-out'
        }}
      >
        {/* Картинка видна только пока видео не загрузилось */}
        <picture>
          <source srcSet={stillName(device, door.key, 'webp')} type="image/webp" />
          <img
            src={stillName(device, door.key, 'jpg')}
            alt={door.title}
            draggable={false}
            onLoad={() => setReady(true)}
            onError={() => setReady(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none', zIndex: 0 }}
          />
        </picture>

        <video ref={videoRefs[0]} muted playsInline webkit-playsinline="true" preload="auto" style={layerStyle(0)} />
        <video ref={videoRefs[1]} muted playsInline webkit-playsinline="true" preload="auto" style={layerStyle(1)} />

        {/* Надпись на передней табличке: золото/бирюза/серебро с орнаментом */}
        <div
          className="plaque-title"
          style={{
            position: 'absolute',
            left: `${layout.plaque.x}%`,
            top: `${layout.plaque.y}%`,
            transform: 'translate(-50%, -50%)',
            fontSize: `${plaqueFont * 1.45}px`,
            '--m0': door.metal[0],
            '--m1': door.metal[1],
            '--m2': door.metal[2],
            '--m3': door.metal[3],
            '--glow': door.glow,
            opacity: uiHidden ? 0 : 1,
            transition: uiHidden ? 'opacity .2s ease' : 'opacity .35s ease',
            pointerEvents: 'none',
            zIndex: 3
          }}
        >
          <Flourish id={`fl-l-${door.key}`} metal={door.metal} />
          <span className="plaque-word">{door.plaque}</span>
          <Flourish id={`fl-r-${door.key}`} metal={door.metal} flip />
        </div>

        {/* Кликабельная область передней двери */}
        <div
          role="button"
          aria-label={`Открыть дверь «${door.title}»`}
          onClick={openFront}
          style={{
            position: 'absolute',
            left: `${layout.door.l}%`,
            top: `${layout.door.t}%`,
            width: `${layout.door.w}%`,
            height: `${layout.door.h}%`,
            cursor: busy ? 'default' : 'pointer',
            zIndex: 4,
            borderRadius: '45% 45% 6% 6% / 30% 30% 4% 4%'
          }}
        />
      </div>

      <button className="hall-arrow" aria-label="Повернуть влево" onClick={() => rotate(-1)}
        style={{ left: 'max(14px, 3vw)', animation: 'hallArrowL 2.4s ease-in-out infinite' }}>
        ‹
      </button>
      <button className="hall-arrow" aria-label="Повернуть вправо" onClick={() => rotate(1)}
        style={{ right: 'max(14px, 3vw)', animation: 'hallArrowR 2.4s ease-in-out infinite' }}>
        ›
      </button>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 'max(84px, 11vh)',
          zIndex: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          padding: '0 16px',
          pointerEvents: 'none',
          opacity: uiHidden ? 0 : 1,
          transition: 'opacity .35s ease'
        }}
      >
        <button
          onClick={openFront}
          disabled={uiHidden}
          className="btn-magical mystic-font"
          style={{ pointerEvents: 'auto', padding: '13px 34px', fontSize: 'clamp(1rem, 2.4vw, 1.2rem)', borderColor: door.color }}
        >
          Войти: {door.title}
        </button>
        <div
          className="text-font"
          style={{ color: '#e8dcf7', fontSize: 'clamp(0.95rem, 2.2vw, 1.1rem)', textAlign: 'center', textShadow: '0 2px 6px #000', animation: 'hallHint 3s ease-in-out infinite' }}
        >
          Поверни платформу стрелками или свайпом
        </div>
      </div>

      {/* Белая вспышка при входе */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 20,
          background: 'radial-gradient(circle at 50% 45%, #ffffff 0%, #fffaf0 55%, #f3ecff 100%)',
          opacity: flash ? 1 : 0,
          transition: 'opacity .18s ease-in',
          pointerEvents: flash ? 'auto' : 'none'
        }}
      />
    </div>
  );
}
