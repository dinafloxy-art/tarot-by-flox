import { useState, useRef, useEffect } from 'react';

// ПЛЕЕР ЗВУКОВ: проигрывает готовые записи из каталога src/data/sounds.js.
// Живёт на уровне всего приложения, поэтому звук не прерывается при переходах между разделами.
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
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    setActiveAudioTrack(null);
    setPaused(false);
  };

  const armTimer = (min) => {
    clearTimer();
    if (!min) return;
    setTimerEndsAt(Date.now() + min * 60000);
    timerRef.current = setTimeout(stopSoundEngine, min * 60000);
  };

  const playTrack = (track) => {
    const a = customSoundAudioRef.current;
    if (!a || !track) return;
    if (beforeStart) beforeStart();
    a.src = track.src;
    a.loop = track.loop !== false;
    a.volume = volume;
    a.setAttribute('playsinline', '');
    a.play().catch(() => {});
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      if ('mediaSession' in navigator && typeof window.MediaMetadata === 'function') {
        navigator.mediaSession.metadata = new window.MediaMetadata({ title: track.title || 'Звуки', artist: 'Магическое пространство · by.Flox' });
        navigator.mediaSession.setActionHandler('play', () => { a.play().catch(() => {}); setPaused(false); });
        navigator.mediaSession.setActionHandler('pause', () => { a.pause(); setPaused(true); });
      }
    } catch (e) {}
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
