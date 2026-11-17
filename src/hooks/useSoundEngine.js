import { useState, useRef, useEffect } from 'react';
import { BINAURAL_WAVES, SUBCONSCIOUS_GUIDE_STEPS } from '../data/sounds';
import { getAudioCtx } from '../lib/audio';

const GUIDE_AUDIO_URL = '/subconscious-voice-guide.mp3';

// Звуковой движок: бинауральные ритмы, эмбиенты, медитации, путеводитель.
// beforeStart — вызывается перед запуском (например, чтобы приглушить фоновую музыку).
export function useSoundEngine({ beforeStart } = {}) {
  const [activeAudioTrack, setActiveAudioTrack] = useState(null);
  const [selectedWave, setSelectedWave] = useState(BINAURAL_WAVES[1]);
  const [carrierFreq, setCarrierFreq] = useState(136.1);
  const [voiceGuideEnabled, setVoiceGuideEnabled] = useState(true);
  const [activeGuideStepIdx, setActiveGuideStepIdx] = useState(0);
  const [sleepTimerMin, setSleepTimerMin] = useState(0);

  const customSoundAudioRef = useRef(null);
  const guideAudioRef = useRef(null);
  const nodesRef = useRef([]);
  const timerRef = useRef(null);
  const guideCycleRef = useRef(null);

  const stopSoundEngine = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (guideCycleRef.current) clearInterval(guideCycleRef.current);
    guideCycleRef.current = null;
    try {
      [customSoundAudioRef.current, guideAudioRef.current].forEach((a) => {
        if (a) {
          a.pause();
          a.currentTime = 0;
        }
      });
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (e) {}
    nodesRef.current.forEach((node) => {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch (e) {}
    });
    nodesRef.current = [];
    setActiveAudioTrack(null);
  };

  useEffect(() => () => stopSoundEngine(), []);

  const speakSoftGuideLine = (text) => {
    try {
      if (!('speechSynthesis' in window) || !text) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ru-RU';
      utter.rate = 0.84;
      utter.pitch = 0.9;
      utter.volume = 0.85;
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  };

  const cycleSpeech = (lines, everyMs, onIndex) => {
    if (!lines || !lines.length) return;
    speakSoftGuideLine(lines[0]);
    let idx = 0;
    guideCycleRef.current = setInterval(() => {
      idx = (idx + 1) % lines.length;
      if (onIndex) onIndex(idx);
      speakSoftGuideLine(lines[idx]);
    }, everyMs);
  };

  const startSubconsciousGuide = () => {
    setActiveGuideStepIdx(0);
    const a = guideAudioRef.current;
    const fallback = () =>
      cycleSpeech(SUBCONSCIOUS_GUIDE_STEPS.map((s) => s.text), 16000, setActiveGuideStepIdx);
    if (!a) return fallback();
    a.src = GUIDE_AUDIO_URL;
    a.loop = true;
    a.volume = 0.85;
    a.play().catch(fallback);
  };

  const makeMaster = (ctx, level, rampSec) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(level, ctx.currentTime + rampSec);
    g.connect(ctx.destination);
    return g;
  };

  const startBinauralEngine = (waveObj, baseHz = carrierFreq, withGuide = voiceGuideEnabled) => {
    stopSoundEngine();
    if (beforeStart) beforeStart();
    try {
      const ctx = getAudioCtx();
      const master = makeMaster(ctx, 0.22, 2.0);
      const nodes = [master];
      [[baseHz, -1], [baseHz + waveObj.hz, 1]].forEach(([f, pan]) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, ctx.currentTime);
        if (ctx.createStereoPanner) {
          const p = ctx.createStereoPanner();
          p.pan.setValueAtTime(pan, ctx.currentTime);
          osc.connect(p);
          p.connect(master);
          nodes.push(p);
        } else {
          osc.connect(master);
        }
        osc.start();
        nodes.push(osc);
      });
      const pad = ctx.createOscillator();
      const padGain = ctx.createGain();
      pad.type = 'triangle';
      pad.frequency.setValueAtTime(baseHz / 2, ctx.currentTime);
      padGain.gain.setValueAtTime(0.08, ctx.currentTime);
      pad.connect(padGain);
      padGain.connect(master);
      pad.start();
      nodes.push(pad, padGain);
      nodesRef.current = nodes;

      setActiveAudioTrack({
        type: 'binaural',
        id: waveObj.id,
        title: `${waveObj.name} (${waveObj.hz} Гц)`,
        subtitle: `Несущая ${baseHz} Гц${withGuide ? ' • Путеводитель в подсознание' : ''}`,
        guideActive: withGuide
      });
      if (withGuide) startSubconsciousGuide();
      if (sleepTimerMin > 0) {
        timerRef.current = setTimeout(stopSoundEngine, sleepTimerMin * 60 * 1000);
      }
    } catch (e) {}
  };

  const startSynthAmbientFallback = (preset) => {
    try {
      const ctx = getAudioCtx();
      const master = makeMaster(ctx, 0.24, 2.2);
      const nodes = [master];
      preset.freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, ctx.currentTime);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(520 + idx * 140, ctx.currentTime);
        gain.gain.setValueAtTime(0.18 / preset.freqs.length, ctx.currentTime);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start();
        nodes.push(osc, filter, gain);
      });
      nodesRef.current = nodes;
    } catch (e) {}
  };

  const playFileOr = (url, loop, volume, fallback) => {
    const a = customSoundAudioRef.current;
    if (!a || !url) return fallback();
    a.src = url;
    a.loop = loop;
    a.volume = volume;
    a.play().catch(fallback);
  };

  const startAmbientEngine = (preset) => {
    stopSoundEngine();
    if (beforeStart) beforeStart();
    setActiveAudioTrack({ type: 'ambient', id: preset.id, title: preset.title, subtitle: preset.tag, guideActive: false });
    playFileOr(preset.audioUrl, true, 0.75, () => startSynthAmbientFallback(preset));
  };

  const startSynthMeditationFallback = (track) => {
    try {
      const ctx = getAudioCtx();
      const master = makeMaster(ctx, 0.2, 1.8);
      const oscL = ctx.createOscillator();
      const oscR = ctx.createOscillator();
      oscL.type = 'sine';
      oscR.type = 'sine';
      oscL.frequency.setValueAtTime(track.baseFreq, ctx.currentTime);
      oscR.frequency.setValueAtTime(track.baseFreq + track.beatFreq, ctx.currentTime);
      oscL.connect(master);
      oscR.connect(master);
      oscL.start();
      oscR.start();
      nodesRef.current = [oscL, oscR, master];
      cycleSpeech(track.voiceGuideScript, 14000);
    } catch (e) {}
  };

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
    playFileOr(track.audioUrl, false, 0.85, () => startSynthMeditationFallback(track));
  };

  return {
    activeAudioTrack,
    selectedWave, setSelectedWave,
    carrierFreq, setCarrierFreq,
    voiceGuideEnabled, setVoiceGuideEnabled,
    activeGuideStepIdx,
    sleepTimerMin, setSleepTimerMin,
    customSoundAudioRef,
    guideAudioRef,
    stopSoundEngine,
    startBinauralEngine,
    startAmbientEngine,
    startMeditationTrack
  };
}
