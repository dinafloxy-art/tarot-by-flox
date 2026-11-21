import { useState, useRef, useEffect } from 'react';
import { BINAURAL_WAVES, SUBCONSCIOUS_GUIDE_STEPS, MEDITATION_VOICES, AMBIENT_SYNTH } from '../data/sounds';
import { getAudioCtx } from '../lib/audio';

// Записанный голос-путеводитель появится на шаге 8. До тех пор — голос браузера.
const GUIDE_AUDIO_URL = null;

// ЗВУКОВОЙ ДВИЖОК (шаг 5)
// Бинауральные ритмы, эмбиенты, медитации, голос-путеводитель, таймер сна, громкость.
// Живёт на уровне всего приложения, поэтому звук не прерывается при переходах между разделами.
export function useSoundEngine({ beforeStart } = {}) {
  const [activeAudioTrack, setActiveAudioTrack] = useState(null);
  const [selectedWave, setSelectedWave] = useState(BINAURAL_WAVES[1]);
  const [carrierFreq, setCarrierFreq] = useState(136.1);
  const [voiceGuideEnabled, setVoiceGuideEnabled] = useState(true);
  const [activeGuideStepIdx, setActiveGuideStepIdx] = useState(0);
  const [sleepTimerMin, setSleepTimerMin] = useState(0);
  const [timerEndsAt, setTimerEndsAt] = useState(null);
  const [volume, setVolumeState] = useState(0.8);
  const [paused, setPaused] = useState(false);

  const customSoundAudioRef = useRef(null);
  const guideAudioRef = useRef(null);
  const nodesRef = useRef([]);
  const masterRef = useRef(null);
  const timerRef = useRef(null);
  const guideCycleRef = useRef(null);
  const volumeRef = useRef(0.8);
  const genRef = useRef(0);
  const speechRef = useRef({ lines: null, every: 0, onIndex: null, voice: null });

  const clearTimers = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (guideCycleRef.current) clearInterval(guideCycleRef.current);
    guideCycleRef.current = null;
  };

  const stopSoundEngine = () => {
    genRef.current += 1;
    clearTimers();
    try {
      [customSoundAudioRef.current, guideAudioRef.current].forEach((a) => {
        if (a) {
          a.pause();
          a.removeAttribute('src');
        }
      });
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (e) {}
    const old = nodesRef.current;
    const master = masterRef.current;
    nodesRef.current = [];
    masterRef.current = null;
    // мягкое затухание вместо щелчка
    try {
      if (master) {
        const ctx = getAudioCtx();
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      }
    } catch (e) {}
    setTimeout(() => {
      old.forEach((node) => {
        try {
          if (node.stop) node.stop();
        } catch (e) {}
        try {
          if (node.disconnect) node.disconnect();
        } catch (e) {}
      });
    }, master ? 700 : 0);
    setActiveAudioTrack(null);
    setTimerEndsAt(null);
    setPaused(false);
    speechRef.current = { lines: null, every: 0, onIndex: null, voice: null };
  };

  useEffect(() => () => stopSoundEngine(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- голос браузера ----------
  const pickVoice = (kind) => {
    try {
      const voices = window.speechSynthesis.getVoices().filter((v) => /^ru/i.test(v.lang));
      if (!voices.length) return null;
      const male = /(male|муж|yuri|pavel|dmitr|maxim|aleksandr|nikolai|artem)/i;
      const female = /(female|жен|milena|irina|svetlana|ekaterina|alena|dariya|elena|anna)/i;
      if (kind === 'male') return voices.find((v) => male.test(v.name)) || voices[0];
      if (kind === 'female') return voices.find((v) => female.test(v.name)) || voices[0];
      return voices[0];
    } catch (e) {
      return null;
    }
  };

  const speakLine = (text, kind) => {
    try {
      if (!('speechSynthesis' in window) || !text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU';
      const v = pickVoice(kind);
      if (v) u.voice = v;
      u.rate = 0.8;
      u.pitch = kind === 'male' ? 0.75 : 0.9;
      u.volume = Math.min(1, volumeRef.current + 0.1);
      window.speechSynthesis.speak(u);
    } catch (e) {}
  };

  const cycleSpeech = (lines, everyMs, onIndex, kind) => {
    if (!lines || !lines.length) return;
    speechRef.current = { lines, every: everyMs, onIndex, voice: kind };
    let idx = 0;
    if (onIndex) onIndex(0);
    speakLine(lines[0], kind);
    guideCycleRef.current = setInterval(() => {
      idx = (idx + 1) % lines.length;
      if (onIndex) onIndex(idx);
      speakLine(lines[idx], kind);
    }, everyMs);
  };

  const startSubconsciousGuide = () => {
    setActiveGuideStepIdx(0);
    const a = guideAudioRef.current;
    const fallback = () =>
      cycleSpeech(SUBCONSCIOUS_GUIDE_STEPS.map((s) => s.text), 22000, setActiveGuideStepIdx, 'female');
    if (!a || !GUIDE_AUDIO_URL) return setTimeout(fallback, 2500);
    a.src = GUIDE_AUDIO_URL;
    a.loop = true;
    a.volume = volumeRef.current;
    a.play().catch(fallback);
  };

  // ---------- общий выход ----------
  const makeMaster = (ctx, rampSec = 2) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(volumeRef.current, ctx.currentTime + rampSec);
    g.connect(ctx.destination);
    masterRef.current = g;
    return g;
  };

  const setVolume = (v) => {
    volumeRef.current = v;
    setVolumeState(v);
    try {
      if (masterRef.current) {
        const ctx = getAudioCtx();
        masterRef.current.gain.cancelScheduledValues(ctx.currentTime);
        masterRef.current.gain.setTargetAtTime(Math.max(0.0001, v), ctx.currentTime, 0.08);
      }
      [customSoundAudioRef.current, guideAudioRef.current].forEach((a) => {
        if (a) a.volume = v;
      });
    } catch (e) {}
  };

  const togglePause = () => {
    try {
      const ctx = getAudioCtx();
      if (!paused) {
        ctx.suspend();
        [customSoundAudioRef.current, guideAudioRef.current].forEach((a) => a && !a.paused && a.pause());
        if ('speechSynthesis' in window) window.speechSynthesis.pause();
        setPaused(true);
      } else {
        ctx.resume();
        [customSoundAudioRef.current, guideAudioRef.current].forEach((a) => a && a.getAttribute('src') && a.play().catch(() => {}));
        if ('speechSynthesis' in window) window.speechSynthesis.resume();
        setPaused(false);
      }
    } catch (e) {}
  };

  const armSleepTimer = (min = sleepTimerMin) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (min > 0) {
      timerRef.current = setTimeout(stopSoundEngine, min * 60 * 1000);
      setTimerEndsAt(Date.now() + min * 60 * 1000);
    } else {
      setTimerEndsAt(null);
    }
  };

  const changeSleepTimer = (min) => {
    setSleepTimerMin(min);
    if (activeAudioTrack) armSleepTimer(min);
  };

  // ---------- кирпичики синтеза ----------
  const noiseBuffer = (ctx, seconds = 4, brown = false) => {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else d[i] = w;
      }
    }
    return buf;
  };

  const addNoise = (ctx, out, { brown = false, type = 'lowpass', freq = 800, q = 0.7, gain = 0.1 }) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 5, brown);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start();
    nodesRef.current.push(src, f, g);
    return { src, f, g };
  };

  const addDrone = (ctx, out, freq, { type = 'sine', gain = 0.05, detune = 0, lfoRate = 0.05, lfoDepth = 0.5, pan = 0 }) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = gain;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const lg = ctx.createGain();
    lg.gain.value = gain * lfoDepth;
    lfo.connect(lg);
    lg.connect(g.gain);
    o.connect(g);
    let last = g;
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      last = p;
      nodesRef.current.push(p);
    }
    last.connect(out);
    o.start();
    lfo.start();
    nodesRef.current.push(o, g, lfo, lg);
  };

  // Удар поющей чаши / колокольчика: набор обертонов с долгим затуханием
  const strike = (ctx, out, base, { decay = 9, level = 0.12, ratios = [1, 2.76, 5.4, 8.9] } = {}) => {
    const now = ctx.currentTime;
    ratios.forEach((r, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * r;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(level / (i + 1), now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay / (1 + i * 0.6));
      o.connect(g);
      g.connect(out);
      o.start(now);
      o.stop(now + decay + 0.2);
      o.onended = () => {
        try {
          g.disconnect();
        } catch (e) {}
      };
    });
  };

  // Повторяющиеся события (капли, удары чаш). Останавливаются при смене звука.
  const every = (ms, fn, jitter = 0.4) => {
    const gen = genRef.current;
    const loop = () => {
      if (gen !== genRef.current) return;
      try {
        if (getAudioCtx().state === 'running') fn();
      } catch (e) {}
      setTimeout(loop, ms * (1 - jitter / 2 + Math.random() * jitter));
    };
    setTimeout(loop, 600);
  };

  const reverbBus = (ctx, out, seconds = 4, wet = 0.5) => {
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    conv.buffer = buf;
    const wg = ctx.createGain();
    wg.gain.value = wet;
    conv.connect(wg);
    wg.connect(out);
    nodesRef.current.push(conv, wg);
    const input = ctx.createGain();
    input.connect(out);
    input.connect(conv);
    nodesRef.current.push(input);
    return input;
  };

  // ---------- эмбиенты ----------
  const buildAmbient = (ctx, master, preset) => {
    const kind = AMBIENT_SYNTH[preset.id] || 'ether';
    const bus = reverbBus(ctx, master, kind === 'temple' ? 6 : 4, kind === 'rain' ? 0.15 : 0.55);
    if (kind === 'rain') {
      addNoise(ctx, bus, { type: 'bandpass', freq: 1400, q: 0.4, gain: 0.18 });
      addNoise(ctx, bus, { type: 'highpass', freq: 3500, q: 0.5, gain: 0.05 });
      addNoise(ctx, bus, { brown: true, type: 'lowpass', freq: 400, gain: 0.25 });
      // капли по стеклу
      every(180, () => {
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(1800 + Math.random() * 2400, now);
        o.frequency.exponentialRampToValueAtTime(600, now + 0.05);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.03, now + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
        o.connect(g);
        g.connect(bus);
        o.start(now);
        o.stop(now + 0.1);
      }, 1.6);
      // далёкий гром
      every(38000, () => {
        const now = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 6, true);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 160;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.5, now + 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 5.5);
        src.connect(f);
        f.connect(g);
        g.connect(bus);
        src.start(now);
        src.stop(now + 6);
      }, 0.6);
      return;
    }
    if (kind === 'temple') {
      addNoise(ctx, bus, { type: 'bandpass', freq: 500, q: 0.3, gain: 0.035 }); // горный ветер
      addDrone(ctx, bus, 68.05, { gain: 0.05, lfoRate: 0.03 });
      const bowls = [136.1, 204.15, 272.2];
      every(11000, () => strike(ctx, bus, bowls[Math.floor(Math.random() * bowls.length)], { decay: 14, level: 0.1 }), 0.5);
      return;
    }
    if (kind === 'cosmos') {
      preset.freqs.forEach((f, i) => addDrone(ctx, bus, f, { type: i % 2 ? 'triangle' : 'sine', gain: 0.045 / (i + 1), detune: (i - 1.5) * 4, lfoRate: 0.02 + i * 0.013, pan: [-0.6, 0.6, -0.3, 0.3][i] || 0 }));
      addNoise(ctx, bus, { type: 'bandpass', freq: 2200, q: 6, gain: 0.006 });
      every(7000, () => strike(ctx, bus, 864 * (Math.random() > 0.5 ? 1 : 1.5), { decay: 6, level: 0.025, ratios: [1, 2] }), 0.7);
      return;
    }
    if (kind === 'astral') {
      preset.freqs.forEach((f, i) => addDrone(ctx, bus, f, { gain: 0.06 / (i + 1), lfoRate: 0.015 + i * 0.01, lfoDepth: 0.7, pan: [0, -0.5, 0.5, 0][i] || 0 }));
      every(5000, () => strike(ctx, bus, 576 + Math.random() * 300, { decay: 5, level: 0.018, ratios: [1, 3] }), 0.8);
      return;
    }
    // ether 528
    preset.freqs.forEach((f, i) => addDrone(ctx, bus, f, { type: 'sine', gain: 0.055 / (i + 1), detune: i * 3, lfoRate: 0.04 + i * 0.02, pan: [-0.4, 0.4, -0.2, 0.2][i] || 0 }));
    addNoise(ctx, bus, { type: 'lowpass', freq: 900, gain: 0.02 });
  };

  const playFile = (url, loop, onFail) => {
    const a = customSoundAudioRef.current;
    if (!a || !url) return onFail();
    a.src = url;
    a.loop = loop;
    a.volume = volumeRef.current;
    a.play().catch(onFail);
  };

  const startAmbientEngine = (preset) => {
    stopSoundEngine();
    if (beforeStart) beforeStart();
    setActiveAudioTrack({ type: 'ambient', id: preset.id, title: preset.title, subtitle: preset.tag, guideActive: false });
    playFile(preset.audioUrl, true, () => {
      try {
        const ctx = getAudioCtx();
        buildAmbient(ctx, makeMaster(ctx, 2.5), preset);
      } catch (e) {}
    });
    armSleepTimer();
  };

  // ---------- бинауральные ритмы ----------
  const startBinauralEngine = (waveObj = selectedWave, baseHz = carrierFreq, withGuide = voiceGuideEnabled) => {
    stopSoundEngine();
    if (beforeStart) beforeStart();
    try {
      const ctx = getAudioCtx();
      const master = makeMaster(ctx, 3);
      const beatGain = ctx.createGain();
      beatGain.gain.value = 0.28;
      beatGain.connect(master);
      nodesRef.current.push(beatGain);
      [[baseHz, -1], [baseHz + waveObj.hz, 1]].forEach(([f, pan]) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        if (ctx.createStereoPanner) {
          const p = ctx.createStereoPanner();
          p.pan.value = pan;
          osc.connect(p);
          p.connect(beatGain);
          nodesRef.current.push(p);
        } else {
          // старые браузеры: раздельные каналы через ChannelMerger
          const m = ctx.createChannelMerger(2);
          osc.connect(m, 0, pan < 0 ? 0 : 1);
          m.connect(beatGain);
          nodesRef.current.push(m);
        }
        osc.start();
        nodesRef.current.push(osc);
      });
      // тихая тёплая подложка, чтобы чистый тон не утомлял
      addDrone(ctx, master, baseHz / 2, { type: 'triangle', gain: 0.03, lfoRate: 0.03 });
      addNoise(ctx, master, { brown: true, type: 'lowpass', freq: 300, gain: 0.05 });

      setActiveAudioTrack({
        type: 'binaural',
        id: waveObj.id,
        title: `${waveObj.name} • ${waveObj.hz} Гц`,
        subtitle: `Несущая ${baseHz} Гц${withGuide ? ' • голос-путеводитель' : ''}`,
        guideActive: withGuide
      });
      if (withGuide) startSubconsciousGuide();
      armSleepTimer();
    } catch (e) {}
  };

  // ---------- медитации ----------
  const startMeditationTrack = (track) => {
    stopSoundEngine();
    if (beforeStart) beforeStart();
    setActiveAudioTrack({
      type: 'meditation',
      id: track.id,
      title: track.title,
      subtitle: `${track.category} • ${track.duration}`,
      guideActive: Boolean(track.voiceGuideScript && track.voiceGuideScript.length)
    });
    playFile(track.audioUrl, false, () => {
      try {
        const ctx = getAudioCtx();
        const master = makeMaster(ctx, 2.5);
        const bus = reverbBus(ctx, master, 4, 0.4);
        if (track.id === 'med-nature-night') {
          buildAmbient(ctx, master, { id: 'amb-rain', freqs: [] });
          addNoise(ctx, bus, { brown: true, type: 'lowpass', freq: 220, gain: 0.12 }); // костёр
          every(260, () => {
            const now = ctx.currentTime;
            const src = ctx.createBufferSource();
            src.buffer = noiseBuffer(ctx, 0.05);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.06 + Math.random() * 0.08, now);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
            const f = ctx.createBiquadFilter();
            f.type = 'highpass';
            f.frequency.value = 2000;
            src.connect(f);
            f.connect(g);
            g.connect(bus);
            src.start(now);
          }, 1.8);
        } else {
          // мягкий бинауральный фон под голос
          const bg = ctx.createGain();
          bg.gain.value = 0.16;
          bg.connect(bus);
          nodesRef.current.push(bg);
          [[track.baseFreq, -1], [track.baseFreq + track.beatFreq, 1]].forEach(([f, pan]) => {
            const o = ctx.createOscillator();
            o.frequency.value = f;
            if (ctx.createStereoPanner) {
              const p = ctx.createStereoPanner();
              p.pan.value = pan;
              o.connect(p);
              p.connect(bg);
              nodesRef.current.push(p);
            } else o.connect(bg);
            o.start();
            nodesRef.current.push(o);
          });
          addDrone(ctx, bus, track.baseFreq / 2, { type: 'triangle', gain: 0.03, lfoRate: 0.025 });
          if (track.id === 'med-asmr-whisper') addNoise(ctx, bus, { type: 'highpass', freq: 5000, gain: 0.012 });
          setTimeout(() => cycleSpeech(track.voiceGuideScript, 18000, null, MEDITATION_VOICES[track.id]), 3000);
        }
      } catch (e) {}
    });
    armSleepTimer();
  };

  return {
    activeAudioTrack,
    selectedWave, setSelectedWave,
    carrierFreq, setCarrierFreq,
    voiceGuideEnabled, setVoiceGuideEnabled,
    activeGuideStepIdx,
    sleepTimerMin, setSleepTimerMin: changeSleepTimer,
    timerEndsAt,
    volume, setVolume,
    paused, togglePause,
    customSoundAudioRef,
    guideAudioRef,
    stopSoundEngine,
    startBinauralEngine,
    startAmbientEngine,
    startMeditationTrack
  };
}
