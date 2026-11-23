import { useState, useRef, useEffect } from 'react';

// ПЛЕЕР ЗВУКОВ: проигрывает готовые записи из каталога src/data/sounds.js.
// Живёт на уровне всего приложения, поэтому звук не прерывается при переходах между разделами.
// ВАЖНО: currentTime/duration НЕ хранятся в state этого хука, чтобы не перерисовывать весь App.jsx 4-10 раз в секунду!
export function useSoundEngine({ beforeStart } = {}) {
  const [activeAudioTrack, setActiveAudioTrack] = useState(null);
  const [paused, setPaused] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
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
      a.onloadedmetadata = null;
      a.onplay = null;
      a.onpause = null;
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    try {
      if ('mediaSession' in navigator) {
        const ms = navigator.mediaSession;
        ['play', 'pause', 'stop', 'seekto', 'seekbackward', 'seekforward'].forEach((n) => {
          try { ms.setActionHandler(n, null); } catch (err) {}
        });
        ms.metadata = null;
        ms.playbackState = 'none';
      }
    } catch (err) {}
    setActiveAudioTrack(null);
    setPaused(false);
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
    const dur = Number.isFinite(a.duration) ? a.duration : 0;
    const target = Math.max(0, Math.min(Number(sec) || 0, dur || 99999));
    a.currentTime = target;
    try {
      const ms = navigator.mediaSession;
      if (ms && ms.setPositionState && dur > 0) {
        ms.setPositionState({ duration: dur, position: Math.min(target, dur), playbackRate: 1 });
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

    const claimSession = () => {
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
        if (!('mediaSession' in navigator)) return;
        const ms = navigator.mediaSession;
        if (typeof window.MediaMetadata === 'function') {
          ms.metadata = new window.MediaMetadata({
            title: track.title || 'Медитация',
            artist: 'Магическое пространство · by.Flox',
            album: 'Медитации',
            artwork: [
              { src: '/media/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/media/icon-512.png', sizes: '512x512', type: 'image/png' }
            ]
          });
        }
        const set = (n, f) => { try { ms.setActionHandler(n, f); } catch (err) {} };
        set('play', () => { a.play().catch(() => {}); });
        set('pause', () => { a.pause(); });
        set('stop', () => { stopSoundEngine(); });
        set('seekto', (d) => { if (d && typeof d.seekTime === 'number') a.currentTime = d.seekTime; });
        set('seekbackward', (d) => { a.currentTime = Math.max(0, a.currentTime - ((d && d.seekOffset) || 15)); });
        set('seekforward', (d) => { a.currentTime = Math.min(a.duration || 0, a.currentTime + ((d && d.seekOffset) || 15)); });
        set('previoustrack', null);
        set('nexttrack', null);
        ms.playbackState = a.paused ? 'paused' : 'playing';
        if (ms.setPositionState && Number.isFinite(a.duration) && a.duration > 0) {
          ms.setPositionState({ duration: a.duration, position: Math.min(a.currentTime, a.duration), playbackRate: 1 });
        }
      } catch (err) {}
    };

    a.onloadedmetadata = () => { claimSession(); };
    a.onended = () => { if (!a.loop) stopSoundEngine(); };
    a.onplay = () => { setPaused(false); claimSession(); };
    a.onpause = () => {
      setPaused(true);
      try { navigator.mediaSession.playbackState = 'paused'; } catch (err) {}
    };

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
      a.play().catch(() => {});
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
