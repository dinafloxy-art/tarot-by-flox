import { useState, useRef, useEffect } from 'react';

// ПЛЕЕР ЗВУКОВ: проигрывает готовые записи из каталога src/data/sounds.js.
// Живёт на уровне всего приложения, поэтому звук не прерывается при переходах между разделами.
export function useSoundEngine({ beforeStart } = {}) {
  const [activeAudioTrack, setActiveAudioTrack] = useState(null);
  const [paused, setPaused] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sleepTimerMin, setSleepTimerMinState] = useState(0);
  const [timerEndsAt, setTimerEndsAt] = useState(null);
  const customSoundAudioRef = useRef(null);
  const guideAudioRef = useRef(null);
  const timerRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setTimerEndsAt(null);
  };

  const stopSoundEngine = () => {
    clearTimer();
    const a = customSoundAudioRef.current;
    if (a) {
      a.onended = null;
      a.ontimeupdate = null;
      a.onloadedmetadata = null;
      a.ondurationchange = null;
      a.onplay = null;
      a.onpause = null;
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    try {
      if ('mediaSession' in navigator) {
        const ms = navigator.mediaSession;
        ['play', 'pause', 'stop', 'seekto', 'seekbackward', 'seekforward'].forEach((n) => { try { ms.setActionHandler(n, null); } catch (err) {} });
        ms.metadata = null; ms.playbackState = 'none';
      }
    } catch (err) {}
    setActiveAudioTrack(null);
    setPaused(false);
    setCurrentTime(0);
    setDuration(0);
  };

  const armTimer = (min) => {
    clearTimer();
    if (!min) return;
    setTimerEndsAt(Date.now() + min * 60000);
    timerRef.current = setTimeout(stopSoundEngine, min * 60000);
  };

  const seek = (sec) => {
    const a = customSoundAudioRef.current;
    if (!a || !activeAudioTrack) return;
    const target = Math.max(0, Math.min(Number(sec) || 0, a.duration || 0));
    a.currentTime = target;
    setCurrentTime(target);
    try {
      const ms = navigator.mediaSession;
      if (ms && ms.setPositionState && Number.isFinite(a.duration) && a.duration > 0) {
        ms.setPositionState({ duration: a.duration, position: Math.min(target, a.duration), playbackRate: 1 });
      }
    } catch (err) {}
  };

  const playTrack = (track) => {
    const a = customSoundAudioRef.current;
    if (!a || !track || !track.src) return;
    if (beforeStart) beforeStart();
    a.src = track.src;
    a.loop = track.loop !== false;
    a.volume = 1; // громкость медитаций выровнена в самих файлах
    a.setAttribute('playsinline', '');
    setCurrentTime(0);
    setDuration(0);
    a.onloadedmetadata = () => {
      if (Number.isFinite(a.duration)) setDuration(a.duration);
      claimSession();
    };
    a.ondurationchange = () => {
      if (Number.isFinite(a.duration)) setDuration(a.duration);
    };
    a.ontimeupdate = () => {
      setCurrentTime(a.currentTime || 0);
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
    };
    a.onended = () => {
      if (!a.loop) stopSoundEngine();
    };
    // Экран блокировки iPhone: карточка «Сейчас играет» принадлежит медитации.
    // Обработчики заново ставятся при каждом запуске звука, чтобы их не перехватили эмбиент, ритмы или музыка сайта,
    // иначе кнопка ▶ на заблокированном экране включала другое приложение.
    const claimSession = () => {
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
        if (!('mediaSession' in navigator)) return;
        const ms = navigator.mediaSession;
        if (typeof window.MediaMetadata === 'function') {
          ms.metadata = new window.MediaMetadata({ title: track.title || 'Медитация', artist: 'Магическое пространство · by.Flox', album: 'Медитации', artwork: [{ src: '/media/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/media/icon-512.png', sizes: '512x512', type: 'image/png' }] });
        }
        const set = (n, f) => { try { ms.setActionHandler(n, f); } catch (err) {} };
        set('play', () => { a.play().catch(() => {}); });
        set('pause', () => { a.pause(); });
        set('stop', () => { stopSoundEngine(); });
        set('seekto', (d) => { if (d && typeof d.seekTime === 'number') { a.currentTime = d.seekTime; } });
        set('seekbackward', (d) => { a.currentTime = Math.max(0, a.currentTime - ((d && d.seekOffset) || 15)); });
        set('seekforward', (d) => { a.currentTime = Math.min(a.duration || 0, a.currentTime + ((d && d.seekOffset) || 15)); });
        set('previoustrack', null); set('nexttrack', null);
        ms.playbackState = a.paused ? 'paused' : 'playing';
        if (ms.setPositionState && Number.isFinite(a.duration) && a.duration > 0) {
          ms.setPositionState({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: 1 });
        }
      } catch (err) {}
    };
    // состояние кнопок синхронизируется и с паузой/пуском с экрана блокировки
    a.onplay = () => { setPaused(false); claimSession(); };
    a.onpause = () => { setPaused(true); try { navigator.mediaSession.playbackState = 'paused'; } catch (err) {} };
    a.play().then(claimSession).catch(() => {});
    claimSession();
    setActiveAudioTrack(track);
    setPaused(false);
    armTimer(sleepTimerMin);
  };

  const togglePause = () => {
    const a = customSoundAudioRef.current;
    if (!a || !activeAudioTrack) return;
    if (a.paused) {
      a.play().catch(() => {}); // карточку экрана блокировки обновит событие play
      setPaused(false);
    } else {
      a.pause();
      setPaused(true);
    }
  };

  const setVolume = (v) => {
    setVolumeState(v);
    if (customSoundAudioRef.current) customSoundAudioRef.current.volume = v;
  };

  const setSleepTimerMin = (min) => {
    setSleepTimerMinState(min);
    if (activeAudioTrack) armTimer(min);
  };

  useEffect(() => () => clearTimer(), []);

  return {
    activeAudioTrack,
    paused,
    volume,
    setVolume,
    currentTime,
    duration,
    seek,
    sleepTimerMin,
    setSleepTimerMin,
    timerEndsAt,
    playTrack,
    togglePause,
    stopSoundEngine,
    customSoundAudioRef,
    guideAudioRef
  };
}
