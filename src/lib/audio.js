// Общий аудио-контекст и звук переворота карты
let ctxSingleton = null;
let flipAudio = null;

export const getAudioCtx = () => {
  if (!ctxSingleton) {
    ctxSingleton = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctxSingleton.state === 'suspended') ctxSingleton.resume();
  return ctxSingleton;
};

const FLIP_URL = '/media/sfx-flip.mp3';
let flipBuf = null;
let flipLoading = false;

// Заранее загружаем и раскодируем звук, чтобы он звучал мгновенно при нажатии
export const preloadFlipSound = () => {
  if (flipBuf || flipLoading) return;
  flipLoading = true;
  try {
    const ctx = getAudioCtx();
    fetch(FLIP_URL)
      .then((r) => r.arrayBuffer())
      .then((ab) => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }))
      .then((b) => { flipBuf = b; })
      .catch(() => { flipLoading = false; });
  } catch (e) { flipLoading = false; }
};

export const playCardFlipSound = (cardIndex = 0) => {
  try {
    const ctx = getAudioCtx();
    if (flipBuf) {
      const s = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = 0.45;
      s.buffer = flipBuf;
      s.connect(g);
      g.connect(ctx.destination);
      s.start(ctx.currentTime);
    } else {
      if (!flipAudio) {
        flipAudio = new Audio(FLIP_URL);
        flipAudio.preload = 'auto';
      }
      const clone = flipAudio.cloneNode();
      clone.volume = 0.45;
      clone.play().catch(() => {});
      preloadFlipSound();
    }
  } catch (e) {}

  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.14);
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
