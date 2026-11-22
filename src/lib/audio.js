// Общий аудио-контекст, кэш звуковых эффектов через Web Audio API (громкость работает и на iPhone) и звук переворота карты
let ctxSingleton = null;

export const getAudioCtx = () => {
  if (!ctxSingleton) {
    const C = window.AudioContext || window.webkitAudioContext;
    ctxSingleton = new C();
  }
  if (ctxSingleton.state === 'suspended') {
    ctxSingleton.resume().catch(() => {});
  }
  return ctxSingleton;
};

const sfxBuffers = new Map();
const sfxLoading = new Map();

// Заранее загружаем и раскодируем MP3 в AudioBuffer:
// на iPhone свойство audio.volume у тега <audio> игнорируется (всегда 100%),
// а Web Audio GainNode регулирует громкость точно на всех устройствах.
export const preloadSfx = (url) => {
  if (!url) return Promise.resolve(null);
  if (sfxBuffers.has(url)) return Promise.resolve(sfxBuffers.get(url));
  if (sfxLoading.has(url)) return sfxLoading.get(url);

  let ctx;
  try {
    ctx = getAudioCtx();
  } catch (e) {
    return Promise.resolve(null);
  }

  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error('sfx fetch failed');
      return r.arrayBuffer();
    })
    .then(
      (ab) =>
        new Promise((res, rej) => {
          const dec = ctx.decodeAudioData(ab, res, rej);
          if (dec && dec.then) dec.then(res, rej);
        })
    )
    .then((buf) => {
      sfxBuffers.set(url, buf);
      sfxLoading.delete(url);
      return buf;
    })
    .catch(() => {
      sfxLoading.delete(url);
      return null;
    });

  sfxLoading.set(url, p);
  return p;
};

const playDecoded = (ctx, buf, volume) => {
  const s = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime);
  s.buffer = buf;
  s.connect(g);
  g.connect(ctx.destination);
  s.start(ctx.currentTime);
};

// Проигрывает короткий звук строго через Web Audio GainNode
export const playSfxUrl = (url, volume = 0.28) => {
  try {
    const ctx = getAudioCtx();
    const trigger = (buf) => {
      if (!buf) return;
      if (ctx.state === 'running') {
        playDecoded(ctx, buf, volume);
      } else {
        ctx.resume().then(() => {
          try { playDecoded(ctx, buf, volume); } catch (e) {}
        }).catch(() => {});
      }
    };
    const buf = sfxBuffers.get(url);
    if (buf) {
      trigger(buf);
      return;
    }
    preloadSfx(url).then(trigger);
  } catch (e) {}
};

const FLIP_URL = '/media/sfx-flip.mp3';

export const preloadFlipSound = () => {
  preloadSfx(FLIP_URL);
};

export const playCardFlipSound = (cardIndex = 0) => {
  playSfxUrl(FLIP_URL, 0.22);

  try {
    const ctx = getAudioCtx();
    const runSynth = () => {
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
      noiseGain.gain.linearRampToValueAtTime(0.1, now + 0.03);
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
      toneGain.gain.linearRampToValueAtTime(0.032, now + 0.02);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      osc.connect(toneGain);
      toneGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.34);
    };
    if (ctx.state === 'running') runSynth();
    else ctx.resume().then(() => { try { runSynth(); } catch (e) {} }).catch(() => {});
  } catch (e) {}
};
