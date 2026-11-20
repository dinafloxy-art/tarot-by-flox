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
  { key: 'tarot', view: 'table', title: 'Таро-расклады', color: '#ffe3a8', glow: 'rgba(229,176,92,0.85)' },
  { key: 'sounds', view: 'sounds', title: 'Звуки', color: '#b7fff1', glow: 'rgba(94,234,212,0.85)' },
  { key: 'dreams', view: 'dreams', title: 'Сны', color: '#e4dcff', glow: 'rgba(167,139,250,0.9)' }
];

// Скорость поворота (1 = исходные 5 секунд, 1.5 ≈ 3.3 секунды)
const ROTATE_RATE = 1.5;
const OPEN_RATE = 1.1;

// Сколько секунд ролика отрезать (end — с конца, start — с начала).
// Если зелёная вспышка всё ещё видна, увеличь 0.6 до 0.9.
const TRIM = {
  'sounds-dreams': { end: 0.6 },
  'dreams-sounds': { start: 0.6 }
};

// Пропорции кадров и положение таблички передней двери (в процентах кадра)
const LAYOUT = {
  pc: { aspect: 1248 / 720, plaque: { x: 50.6, y: 14.6, font: 0.0165 }, door: { l: 39, t: 27, w: 23, h: 52 } },
  ph: { aspect: 720 / 1248, plaque: { x: 48.8, y: 28.1, font: 0.031 }, door: { l: 30, t: 32, w: 39, h: 42 } }
};

const LAST_DOOR_KEY = 'flox_hall_front_door';
const base = '/hall/';
const clipName = (dev, kind, a, b) => (kind === 'rot' ? `${base}${dev}-rot-${a}-${b}.mp4` : `${base}${dev}-open-${a}.mp4`);
const stillName = (dev, d, ext = 'webp') => `${base}${dev}-hall-${d}.${ext}`;

const detectDevice = () => {
  if (typeof window === 'undefined') return 'pc';
  return window.innerHeight > window.innerWidth ? 'ph' : 'pc';
};

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
  const [activeLayer, setActiveLayer] = useState(-1); // -1 = видео ещё не готово, видна картинка
  const [flash, setFlash] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });

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
        v.currentTime = Math.max(0, (v.duration || 5) - (trim.end || 0) - 0.05);
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
          const old = videoRefs[layerRef.current]?.current;
          showLayer(nextIdx);
          if (old && old !== v) old.pause();
        }
        if (onTime) onTime(t, d);
        if (trim.end && t >= d - trim.end) {
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
      const cur = frontRef.current;
      const target = (cur + (dir > 0 ? 1 : 2)) % 3;
      const a = DOORS[cur].key;
      const b = DOORS[target].key;
      playSfx('platform', 0.75);
      await playClip(clipName(device, 'rot', a, b), ROTATE_RATE, null, TRIM[`${a}-${b}`]);
      setFront(target);
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
    playSfx('door', 0.8);
    let flashed = false;
    const ok = await playClip(clipName(device, 'open', door.key), OPEN_RATE, (t, dur) => {
      if (!flashed && t >= dur - 1.1) {
        flashed = true;
        setFlash(true);
      }
    });
    if (!ok || !flashed) {
      setFlash(true);
      await new Promise((r) => setTimeout(r, 650));
    } else {
      await new Promise((r) => setTimeout(r, 250));
    }
    busyRef.current = false;
    if (onEnter) onEnter(door.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, playClip, onEnter, sfxEnabled]);

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
  const layerStyle = (i) => ({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: activeLayer === i ? 1 : 0,
    zIndex: activeLayer === i ? 2 : 1,
    pointerEvents: 'none'
  });

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ position: 'fixed', inset: 0, width: '100vw', overflow: 'hidden', background: '#070312', zIndex: 1, touchAction: 'pan-y' }}
    >
      <style>{`
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
          transform: 'translate(-50%, -50%)'
        }}
      >
        {/* Картинка видна только пока видео не загрузилось */}
        <picture>
          <source srcSet={stillName(device, door.key, 'webp')} type="image/webp" />
          <img
            src={stillName(device, door.key, 'jpg')}
            alt={door.title}
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none', zIndex: 0 }}
          />
        </picture>

        <video ref={videoRefs[0]} muted playsInline webkit-playsinline="true" preload="auto" style={layerStyle(0)} />
        <video ref={videoRefs[1]} muted playsInline webkit-playsinline="true" preload="auto" style={layerStyle(1)} />

        {/* Надпись на передней табличке */}
        <div
          className="mystic-font"
          style={{
            position: 'absolute',
            left: `${layout.plaque.x}%`,
            top: `${layout.plaque.y}%`,
            transform: 'translate(-50%, -50%)',
            fontSize: `${plaqueFont}px`,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
            color: door.color,
            textShadow: `0 1px 2px rgba(20,8,2,0.95), 0 0 10px ${door.glow}, 0 0 22px ${door.glow}`,
            opacity: busy ? 0 : 1,
            transition: busy ? 'opacity .25s ease' : 'opacity .6s ease .1s',
            pointerEvents: 'none',
            zIndex: 3,
            animation: 'plaqueGlow 3.5s ease-in-out infinite'
          }}
        >
          {door.title}
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

      <button className="hall-arrow" aria-label="Повернуть влево" disabled={busy} onClick={() => rotate(-1)}
        style={{ left: 'max(14px, 3vw)', animation: busy ? 'none' : 'hallArrowL 2.4s ease-in-out infinite' }}>
        ‹
      </button>
      <button className="hall-arrow" aria-label="Повернуть вправо" disabled={busy} onClick={() => rotate(1)}
        style={{ right: 'max(14px, 3vw)', animation: busy ? 'none' : 'hallArrowR 2.4s ease-in-out infinite' }}>
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
          opacity: busy ? 0 : 1,
          transition: 'opacity .4s ease'
        }}
      >
        <button
          onClick={openFront}
          disabled={busy}
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
          transition: 'opacity .9s ease',
          pointerEvents: flash ? 'auto' : 'none'
        }}
      />
    </div>
  );
}
