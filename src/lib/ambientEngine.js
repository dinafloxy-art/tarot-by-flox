// ГЕНЕРАТИВНЫЙ ЭМБИЕНТ (движок на Web Audio API)
// Музыка рождается прямо в браузере и никогда не повторяется. Файлов не нужно.
// Движок — один на всё приложение, поэтому звук не прерывается при переходах между разделами.
import { useEffect, useState } from 'react';

// Таймер в отдельном потоке: в фоновой вкладке браузер не замедляет его,
// поэтому звук продолжает играть при переключении вкладок на ноутбуке.
export function createTicker(fn, ms) {
  let worker = null;
  try {
    const code = `let t=null;onmessage=(e)=>{if(e.data==='start'){if(!t)t=setInterval(()=>postMessage(0),${ms});}else{clearInterval(t);t=null;}}`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = () => fn();
    worker.postMessage('start');
    return { stop: () => { try { worker.postMessage('stop'); worker.terminate(); } catch (e) {} } };
  } catch (e) {
    const id = setInterval(fn, ms);
    return { stop: () => clearInterval(id) };
  }
}

export const MODE_META = {
  focus: { id: 'focus', title: 'Фокус', purpose: 'для работы', subtitle: 'Глухая бочка, низкий саб-дрон D, приглушённые пэды и мягкие акценты', primaryHex: '#F2C97D', secondaryHex: '#4A2F82', primaryRgb: [242, 201, 125], secondaryRgb: [74, 47, 130], hasBpm: true },
  sleep: { id: 'sleep', title: 'Сон', purpose: 'для засыпания', subtitle: 'Тихий ночной прибой, тёплое фетровое пианино и невесомые звёздные гармоники', primaryHex: '#C9B3F5', secondaryHex: '#2A2363', primaryRgb: [201, 179, 245], secondaryRgb: [42, 35, 99], hasBpm: false },
  meditation: { id: 'meditation', title: 'Медитация', purpose: 'для практики', subtitle: 'Дрон танпуры, дыхательный фильтр и тибетские поющие чаши', primaryHex: '#E5B887', secondaryHex: '#352A6E', primaryRgb: [229, 184, 135], secondaryRgb: [53, 42, 110], hasBpm: false },
  study: { id: 'study', title: 'Учёба', purpose: 'для занятий', subtitle: 'Сдержанный пульс, ясные арпеджио маримбы и мягкий виниловый воздух', primaryHex: '#9EC2F7', secondaryHex: '#312A6E', primaryRgb: [158, 194, 247], secondaryRgb: [49, 42, 110], hasBpm: true }
};
export const MODE_ORDER = ['focus', 'sleep', 'meditation', 'study'];

const FOCUS_PHASES = [
  { name: 'Ровный пульс (4/4)', bpm: 99, kickPattern: [1.0, 0, 0, 0, 0.86, 0, 0, 0, 1.0, 0, 0, 0, 0.86, 0, 0, 0], shakerProb: 0.34, pluckProb: 0.34, chimeProb: 0.14, kickLp: 185 },
  { name: 'Глубокий даб (синкопа)', bpm: 100, kickPattern: [1.0, 0, 0, 0.56, 0, 0, 0.84, 0, 1.0, 0, 0, 0, 0.78, 0, 0.5, 0], shakerProb: 0.5, pluckProb: 0.42, chimeProb: 0.18, kickLp: 202 },
  { name: 'Двойной шаг (пульсация)', bpm: 101, kickPattern: [1.0, 0, 0, 0, 0.84, 0, 0, 0.54, 1.0, 0, 0, 0, 0.84, 0, 0, 0.62], shakerProb: 0.56, pluckProb: 0.45, chimeProb: 0.19, kickLp: 210 },
  { name: 'Разреженный поток', bpm: 98, kickPattern: [1.0, 0, 0, 0, 0, 0, 0.74, 0, 0, 0, 0.88, 0, 0, 0, 0.48, 0], shakerProb: 0.38, pluckProb: 0.36, chimeProb: 0.24, kickLp: 182 },
  { name: 'Триольный кач (3-3-2)', bpm: 101, kickPattern: [1.0, 0, 0, 0.76, 0, 0, 0.86, 0, 0, 0.7, 0, 0, 0.9, 0, 0, 0.46], shakerProb: 0.6, pluckProb: 0.46, chimeProb: 0.2, kickLp: 214 }
];

class SharedAudioCore {
  constructor() {
    this.ctx = null; this.ready = false; this.masterVol = 0.9; this.isMuted = false;
  }

  init() {
    if (this.ready) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('Ваш браузер не поддерживает Web Audio API.');
    this.ctx = new AudioCtx();
    const now = this.ctx.currentTime;
    this.whiteNoise = this._makeWhiteNoise(2.0);
    this.pinkNoise = this._makePinkNoise(4.0);
    this.brownNoise = this._makeBrownNoise(5.0);
    this.warmCurve = this._makeSaturationCurve(1.65);

    this.masterInput = this.ctx.createGain();
    this.masterInput.gain.setValueAtTime(1.0, now);
    this.playEnv = this.ctx.createGain();
    this.playEnv.gain.setValueAtTime(0.0001, now);
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.setValueAtTime(-5, now);
    this.limiter.knee.setValueAtTime(12, now);
    this.limiter.ratio.setValueAtTime(6, now);
    this.limiter.attack.setValueAtTime(0.012, now);
    this.limiter.release.setValueAtTime(0.22, now);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.86;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0001 : this.masterVol * 1.3, now);
    this.masterInput.connect(this.playEnv);
    this.playEnv.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this._setupBackgroundBridge();

    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.setValueAtTime(0.75, now);
    const revHP = this.ctx.createBiquadFilter();
    revHP.type = 'highpass'; revHP.frequency.setValueAtTime(150, now);
    const revLP = this.ctx.createBiquadFilter();
    revLP.type = 'lowpass'; revLP.frequency.setValueAtTime(3400, now);
    const convolver = this.ctx.createConvolver();
    convolver.buffer = this._makeReverbIR(3.8, 2.55);
    this.reverbSend.connect(revHP); revHP.connect(convolver); convolver.connect(revLP); revLP.connect(this.playEnv);

    this.delaySend = this.ctx.createGain();
    this.delaySend.gain.setValueAtTime(0.55, now);
    const delLP = this.ctx.createBiquadFilter();
    delLP.type = 'lowpass'; delLP.frequency.setValueAtTime(2400, now);
    this.delayL = this.ctx.createDelay(2.0);
    this.delayR = this.ctx.createDelay(2.0);
    this.delayL.delayTime.setValueAtTime(0.45, now);
    this.delayR.delayTime.setValueAtTime(0.45, now);
    const fbL = this.ctx.createGain(); const fbR = this.ctx.createGain();
    fbL.gain.setValueAtTime(0.46, now); fbR.gain.setValueAtTime(0.46, now);
    const panL = this.ctx.createStereoPanner(); const panR = this.ctx.createStereoPanner();
    panL.pan.setValueAtTime(-0.68, now); panR.pan.setValueAtTime(0.68, now);
    this.delaySend.connect(delLP); delLP.connect(this.delayL);
    this.delayL.connect(panL); panL.connect(this.playEnv); panL.connect(this.reverbSend);
    this.delayL.connect(fbL); fbL.connect(this.delayR);
    this.delayR.connect(panR); panR.connect(this.playEnv); panR.connect(this.reverbSend);
    this.delayR.connect(fbR); fbR.connect(this.delayL);
    this.ready = true;
  }

  // iPhone: звук с выключенным экраном.
  // Web Audio выводится через обычный аудиоэлемент (как музыка), а сессия переводится в режим «воспроизведение»,
  // тогда iOS не глушит звук беззвучным режимом и не так охотно останавливает его при блокировке.
  _setupBackgroundBridge() {
    this.bridgeEl = null;
    this.bridgeOn = false;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) {}
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!isIOS || !this.ctx.createMediaStreamDestination) return;
    try {
      this.streamDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.streamDest);
      const el = document.createElement('audio');
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      el.srcObject = this.streamDest.stream;
      el.style.display = 'none';
      document.body.appendChild(el);
      this.bridgeEl = el;
    } catch (e) {
      this.bridgeEl = null;
    }
  }

  // Вызывается по нажатию пользователя (Play): включает вывод через аудиоэлемент
  startBridge() {
    const el = this.bridgeEl;
    if (!el) return;
    const p = el.play();
    const useBridge = () => {
      if (this.bridgeOn) return;
      this.bridgeOn = true;
      // чтобы звук не шёл дважды, прямой выход отключаем, пока работает элемент
      try { this.masterGain.disconnect(this.ctx.destination); } catch (e) {}
    };
    if (p && p.then) p.then(useBridge).catch(() => this.stopBridge());
    else useBridge();
  }

  stopBridge() {
    const el = this.bridgeEl;
    if (el) { try { el.pause(); } catch (e) {} }
    if (this.bridgeOn) {
      this.bridgeOn = false;
      try { this.masterGain.connect(this.ctx.destination); } catch (e) {}
    }
  }

  setDelayBpm(bpm) {
    if (!this.ready) return;
    const dottedEighth = (60 / bpm) * 0.75;
    const now = this.ctx.currentTime;
    this.delayL.delayTime.setTargetAtTime(dottedEighth, now, 0.5);
    this.delayR.delayTime.setTargetAtTime(dottedEighth, now, 0.5);
  }

  setMasterVolume(vol) {
    this.masterVol = Math.max(0, Math.min(1, vol));
    if (this.ready && !this.isMuted) this.masterGain.gain.setTargetAtTime(Math.max(0.0001, this.masterVol * 1.3), this.ctx.currentTime, 0.06);
  }

  setMuted(muted) {
    this.isMuted = muted;
    if (this.ready) this.masterGain.gain.setTargetAtTime(muted ? 0.0001 : Math.max(0.0001, this.masterVol * 1.3), this.ctx.currentTime, 0.06);
  }

  fadeMaster(target, durationSec) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.playEnv.gain.cancelScheduledValues(now);
    this.playEnv.gain.setValueAtTime(Math.max(0.0001, this.playEnv.gain.value), now);
    this.playEnv.gain.linearRampToValueAtTime(Math.max(0.0001, target), now + durationSec);
  }

  _makeSaturationCurve(drive) {
    const n = 1024; const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = Math.tanh(x * drive) / Math.tanh(drive); }
    return curve;
  }

  _makeReverbIR(duration, decay) {
    const sr = this.ctx.sampleRate; const len = Math.floor(sr * duration);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0; const fadeIn = Math.floor(sr * 0.045);
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1; lp = lp * 0.72 + w * 0.28;
        const env = Math.pow(1 - i / len, decay); const att = i < fadeIn ? i / fadeIn : 1;
        d[i] = lp * env * att * 0.72;
      }
    }
    return buf;
  }

  _makeWhiteNoise(sec) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _makePinkNoise(sec) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const out = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.045;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  _makeBrownNoise(sec) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const out = buf.getChannelData(ch); let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; out[i] = last * 3.2; }
    }
    return buf;
  }
}

class SoundscapeInstance {
  constructor(core, modeId, options = {}) {
    this.core = core; this.ctx = core.ctx; this.modeId = modeId; this.destroyed = false;
    this.params = options.params || { speed: 1.0, rhythm: 0.6, phaseFreq: 0.35 };
    this.elapsed = 0; this.currentBpm = options.initialBpm || 99; this.phaseName = 'Поток';
    this.breathPhase = 0; this.pulseEnergy = 0; this.rhythmWaveAngle = 0;
    this.stepIdx = 0; this.nextNoteTime = this.ctx.currentTime + 0.06; this.continuousNodes = [];
    const now = this.ctx.currentTime;
    this.fadeGain = this.ctx.createGain(); this.fadeGain.gain.setValueAtTime(0.0001, now); this.fadeGain.connect(this.core.masterInput);
    this.revSend = this.ctx.createGain(); this.revSend.gain.setValueAtTime(0.6, now); this.revSend.connect(this.core.reverbSend);
    this.delSend = this.ctx.createGain(); this.delSend.gain.setValueAtTime(0.5, now); this.delSend.connect(this.core.delaySend);
    this.revBus = this.ctx.createGain(); this.delBus = this.ctx.createGain();
    this.revBus.gain.setValueAtTime(0.0001, now); this.delBus.gain.setValueAtTime(0.0001, now);
    this.revBus.connect(this.revSend); this.delBus.connect(this.delSend);
    this._build();
  }

  _track(node) { this.continuousNodes.push(node); return node; }

  fadeIn(dur = 1.5) {
    const now = this.ctx.currentTime;
    [this.fadeGain, this.revBus, this.delBus].forEach((g) => {
      g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now); g.gain.linearRampToValueAtTime(1.0, now + dur);
    });
  }

  fadeOutAndDestroy(dur = 1.5) {
    if (this.destroyed) return;
    const now = this.ctx.currentTime;
    [this.fadeGain, this.revBus, this.delBus].forEach((g) => {
      g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now); g.gain.linearRampToValueAtTime(0.0001, now + dur);
    });
    setTimeout(() => this.destroy(), (dur + 0.25) * 1000);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.continuousNodes.forEach((n) => {
      try { if (typeof n.stop === 'function') n.stop(); } catch (_) {}
      try { n.disconnect(); } catch (_) {}
    });
    this.continuousNodes = [];
    try { this.fadeGain.disconnect(); this.revBus.disconnect(); this.delBus.disconnect(); this.revSend.disconnect(); this.delSend.disconnect(); } catch (_) {}
  }

  _build() {}
  scheduleStep() {}
  getStepDuration() { return 0.15; }
  getEffectiveRhythm() {
    const base = this.params.rhythm;
    if (base <= 0.005) return 0;
    return Math.max(0, Math.min(1, base + Math.sin(this.rhythmWaveAngle) * 0.1));
  }
  tick(dt) {
    this.elapsed += dt;
    this.pulseEnergy = Math.max(0, this.pulseEnergy - dt * 3.0);
    this.rhythmWaveAngle += dt * ((Math.PI * 2) / 48);
  }
  runScheduler() {
    if (this.destroyed) return;
    // если вкладка долго спала, не пытаемся «догнать» пропущенные ноты
    if (this.nextNoteTime < this.ctx.currentTime - 0.5) this.nextNoteTime = this.ctx.currentTime + 0.05;
    // в фоне (экран выключен) таймеры браузера редкие, поэтому планируем ноты с большим запасом
    const ahead = typeof document !== 'undefined' && document.hidden ? 1.2 : 0.13;
    while (this.nextNoteTime < this.ctx.currentTime + ahead) {
      this.scheduleStep(this.stepIdx, this.nextNoteTime);
      this.nextNoteTime += this.getStepDuration();
      this.stepIdx++;
    }
  }
}

/* 1. ФОКУС */
class FocusSoundscape extends SoundscapeInstance {
  constructor(core, opts = {}) {
    super(core, 'focus', { params: opts.params, initialBpm: 99 });
    this.INTRO_SEC = 30; this.phaseIdx = 0; this.prevPhaseIdx = 0; this.phaseBlend = 1.0; this.phaseStep = 0;
    this.pluckCursor = 2; this.padIdx = 0;
    this.padVoicings = [
      [146.83, 174.61, 220.0, 261.63, 329.63],
      [146.83, 196.0, 220.0, 261.63, 329.63],
      [146.83, 174.61, 220.0, 246.94, 329.63],
      [146.83, 164.81, 220.0, 293.66, 349.23]
    ];
    this.pluckScale = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 659.25, 698.46];
    this.chimeScale = [880.0, 1046.5, 1174.66, 1318.51, 1396.91];
    this.core.setDelayBpm(99 * this.params.speed);
    this._syncLevels(0.1);
  }

  _build() {
    const now = this.ctx.currentTime;
    this.subBus = this.ctx.createGain(); this.subBus.gain.setValueAtTime(0.0001, now); this.subBus.connect(this.fadeGain);
    const subSat = this.ctx.createWaveShaper(); subSat.curve = this.core.warmCurve;
    const subLP = this.ctx.createBiquadFilter(); subLP.type = 'lowpass'; subLP.frequency.setValueAtTime(90, now); subLP.Q.setValueAtTime(0.75, now);
    const subLfo = this._track(this.ctx.createOscillator()); subLfo.type = 'sine'; subLfo.frequency.setValueAtTime(0.06, now);
    const subLfoAmt = this.ctx.createGain(); subLfoAmt.gain.setValueAtTime(25, now);
    subLfo.connect(subLfoAmt); subLfoAmt.connect(subLP.frequency); subLfo.start(now);
    const sub1 = this._track(this.ctx.createOscillator()); sub1.type = 'sine'; sub1.frequency.setValueAtTime(36.71, now);
    const sub1G = this.ctx.createGain(); sub1G.gain.setValueAtTime(0.74, now);
    const sub2 = this._track(this.ctx.createOscillator()); sub2.type = 'triangle'; sub2.frequency.setValueAtTime(73.42, now);
    const sub2G = this.ctx.createGain(); sub2G.gain.setValueAtTime(0.22, now);
    sub1.connect(sub1G); sub2.connect(sub2G); sub1G.connect(subSat); sub2G.connect(subSat); subSat.connect(subLP); subLP.connect(this.subBus);
    sub1.start(now); sub2.start(now);

    this.kickBus = this.ctx.createGain(); this.kickBus.gain.setValueAtTime(0.0001, now); this.kickBus.connect(this.fadeGain);
    const kickSat = this.ctx.createWaveShaper(); kickSat.curve = this.core.warmCurve; kickSat.oversample = '2x';
    this.kickLP = this.ctx.createBiquadFilter(); this.kickLP.type = 'lowpass'; this.kickLP.frequency.setValueAtTime(165, now); this.kickLP.Q.setValueAtTime(0.9, now);
    this.kickIn = kickSat; kickSat.connect(this.kickLP); this.kickLP.connect(this.kickBus);

    this.padMasterCap = this.ctx.createGain(); this.padMasterCap.gain.setValueAtTime(0.22, now);
    this.padMasterCap.connect(this.fadeGain); this.padMasterCap.connect(this.revBus);
    const padBreathLfo = this._track(this.ctx.createOscillator()); padBreathLfo.type = 'sine'; padBreathLfo.frequency.setValueAtTime(0.025, now);
    const padBreathDepth = this.ctx.createGain(); padBreathDepth.gain.setValueAtTime(0.07, now);
    padBreathLfo.connect(padBreathDepth); padBreathDepth.connect(this.padMasterCap.gain); padBreathLfo.start(now);
    this.padLP = this.ctx.createBiquadFilter(); this.padLP.type = 'lowpass'; this.padLP.frequency.setValueAtTime(760, now); this.padLP.Q.setValueAtTime(0.95, now);
    const padFilterLfo = this._track(this.ctx.createOscillator()); padFilterLfo.type = 'sine'; padFilterLfo.frequency.setValueAtTime(0.045, now);
    const padFilterDepth = this.ctx.createGain(); padFilterDepth.gain.setValueAtTime(210, now);
    padFilterLfo.connect(padFilterDepth); padFilterDepth.connect(this.padLP.frequency); padFilterLfo.start(now);
    this.padLP.connect(this.padMasterCap);

    this.pluckBus = this.ctx.createGain(); this.pluckBus.gain.setValueAtTime(0.0001, now);
    this.pluckBus.connect(this.fadeGain); this.pluckBus.connect(this.delBus); this.pluckBus.connect(this.revBus);
    this.chimeBus = this.ctx.createGain(); this.chimeBus.gain.setValueAtTime(0.0001, now);
    this.chimeBus.connect(this.fadeGain); this.chimeBus.connect(this.revBus);
    this.shakerBus = this.ctx.createGain(); this.shakerBus.gain.setValueAtTime(0.0001, now); this.shakerBus.connect(this.fadeGain);
  }

  getStepDuration() { return 60 / this.currentBpm / 4; }

  _triggerKick(time, vel = 1.0, isGhost = false) {
    const oscSine = this.ctx.createOscillator(); const oscTri = this.ctx.createOscillator();
    const triG = this.ctx.createGain(); const env = this.ctx.createGain();
    oscSine.type = 'sine'; oscTri.type = 'triangle';
    const startHz = isGhost ? 88 : 105; const endHz = 42; const dur = isGhost ? 0.22 : 0.36;
    oscSine.frequency.setValueAtTime(startHz, time); oscSine.frequency.exponentialRampToValueAtTime(endHz, time + 0.068);
    oscTri.frequency.setValueAtTime(startHz * 0.96, time); oscTri.frequency.exponentialRampToValueAtTime(endHz, time + 0.055);
    triG.gain.setValueAtTime(0.26, time);
    const peak = Math.min(1.0, (isGhost ? 0.56 : 0.96) * vel);
    env.gain.setValueAtTime(0.0001, time); env.gain.linearRampToValueAtTime(peak, time + 0.006); env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    oscSine.connect(env); oscTri.connect(triG); triG.connect(env); env.connect(this.kickIn);
    oscSine.start(time); oscTri.start(time); oscSine.stop(time + dur + 0.04); oscTri.stop(time + dur + 0.04);
    this.pulseEnergy = Math.max(this.pulseEnergy, isGhost ? 0.45 : 1.0);
  }

  _triggerPad(time, freqs) {
    const dur = this.getStepDuration() * 64 + 3.8;
    const grp = this.ctx.createGain();
    grp.gain.setValueAtTime(0.0001, time); grp.gain.linearRampToValueAtTime(0.12, time + 3.0);
    grp.gain.setValueAtTime(0.12, time + dur - 3.2); grp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    grp.connect(this.padLP);
    freqs.forEach((f, idx) => {
      [{ type: 'triangle', detune: -0.65, g: 0.26, panSign: 1 }, { type: 'sawtooth', detune: 0.72, g: 0.1, panSign: -1 }].forEach((cfg) => {
        const osc = this.ctx.createOscillator(); const g = this.ctx.createGain(); const pan = this.ctx.createStereoPanner();
        osc.type = cfg.type; osc.frequency.setValueAtTime(f + cfg.detune, time); g.gain.setValueAtTime(cfg.g, time);
        pan.pan.setValueAtTime(((idx / (freqs.length - 1)) * 2 - 1) * 0.6 * cfg.panSign, time);
        osc.connect(g); g.connect(pan); pan.connect(grp); osc.start(time); osc.stop(time + dur + 0.15);
      });
    });
  }

  _triggerPluck(time, vel = 0.7) {
    const delta = Math.random() < 0.75 ? (Math.random() < 0.5 ? 1 : -1) : (Math.random() < 0.5 ? 2 : -2);
    this.pluckCursor = Math.max(0, Math.min(this.pluckScale.length - 1, this.pluckCursor + delta));
    const freq = this.pluckScale[this.pluckCursor];
    const car = this.ctx.createOscillator(); const mod = this.ctx.createOscillator(); const modG = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter(); const env = this.ctx.createGain(); const pan = this.ctx.createStereoPanner();
    car.type = 'sine'; car.frequency.setValueAtTime(freq, time);
    mod.type = 'sine'; mod.frequency.setValueAtTime(freq * 2.0, time);
    modG.gain.setValueAtTime(freq * 0.36, time); modG.gain.exponentialRampToValueAtTime(0.4, time + 0.08);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(1950, time);
    env.gain.setValueAtTime(0.0001, time); env.gain.linearRampToValueAtTime(0.18 * vel, time + 0.008); env.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
    pan.pan.setValueAtTime(Math.random() * 1.1 - 0.55, time);
    mod.connect(modG); modG.connect(car.frequency); car.connect(lp); lp.connect(env); env.connect(pan); pan.connect(this.pluckBus);
    car.start(time); mod.start(time); car.stop(time + 0.5); mod.stop(time + 0.5);
  }

  _triggerChime(time) {
    const freq = this.chimeScale[Math.floor(Math.random() * this.chimeScale.length)];
    const osc = this.ctx.createOscillator(); const env = this.ctx.createGain(); const pan = this.ctx.createStereoPanner();
    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, time);
    env.gain.setValueAtTime(0.0001, time); env.gain.linearRampToValueAtTime(0.085, time + 0.035); env.gain.exponentialRampToValueAtTime(0.0001, time + 1.8);
    pan.pan.setValueAtTime(Math.random() * 1.5 - 0.75, time);
    osc.connect(env); env.connect(pan); pan.connect(this.chimeBus); osc.start(time); osc.stop(time + 1.85);
  }

  _triggerShaker(time, vel = 0.5) {
    const src = this.ctx.createBufferSource(); src.buffer = this.core.whiteNoise;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(5400, time); bp.Q.setValueAtTime(1.6, time);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time); env.gain.linearRampToValueAtTime(0.055 * vel, time + 0.006); env.gain.exponentialRampToValueAtTime(0.0001, time + 0.042);
    const pan = this.ctx.createStereoPanner(); pan.pan.setValueAtTime(Math.random() * 0.6 - 0.3, time);
    src.connect(bp); bp.connect(env); env.connect(pan); pan.connect(this.shakerBus);
    src.start(time, Math.random() * 1.2, 0.05);
  }

  _syncLevels(smooth = 0.35) {
    if (this.destroyed) return;
    const now = this.ctx.currentTime; const t = this.elapsed;
    const prevP = FOCUS_PHASES[this.prevPhaseIdx]; const currP = FOCUS_PHASES[this.phaseIdx];
    const blendedKickLp = prevP.kickLp + (currP.kickLp - prevP.kickLp) * this.phaseBlend;
    const r = this.getEffectiveRhythm();
    const subLvl = Math.min(1.0, t / 8) * 0.5;
    const kickIntro = t < 5 ? 0.0001 : Math.min(1.0, (t - 5) / 19);
    const kickLvl = kickIntro * (0.28 + r * 1.05);
    const pluckLvl = (t < 12 ? 0.0001 : Math.min(1.0, (t - 12) / 14)) * (0.24 + r * 0.36);
    const chimeLvl = (t < 18 ? 0.0001 : Math.min(1.0, (t - 18) / 12)) * 0.42;
    const shakerLvl = (t < 18 ? 0.0001 : Math.min(1.0, (t - 18) / 12)) * (0.08 + r * 0.48);
    const targetKickLp = t < this.INTRO_SEC ? 155 + Math.max(0, (t - 5) / 25) * 35 : blendedKickLp + (r - 0.6) * 35;
    this.subBus.gain.setTargetAtTime(Math.max(0.0001, subLvl), now, smooth);
    this.kickBus.gain.setTargetAtTime(Math.max(0.0001, kickLvl), now, smooth);
    this.kickLP.frequency.setTargetAtTime(Math.max(120, targetKickLp), now, 0.7);
    this.pluckBus.gain.setTargetAtTime(Math.max(0.0001, pluckLvl), now, smooth);
    this.chimeBus.gain.setTargetAtTime(Math.max(0.0001, chimeLvl), now, smooth);
    this.shakerBus.gain.setTargetAtTime(Math.max(0.0001, shakerLvl), now, smooth);
  }

  scheduleStep(step, time) {
    const barStep = step % 16; const t = this.elapsed; const isIntro = t < this.INTRO_SEC; const r = this.getEffectiveRhythm();
    if (step % 64 === 0) {
      this.padIdx = Math.floor(step / 64) % this.padVoicings.length;
      this._triggerPad(time, this.padVoicings[this.padIdx]);
    }
    if (!isIntro) {
      const barsPerPhase = Math.max(6, Math.round(48 - this.params.phaseFreq * 42));
      this.phaseStep++;
      if (this.phaseStep >= barsPerPhase * 16) {
        this.phaseStep = 0; this.prevPhaseIdx = this.phaseIdx;
        this.phaseIdx = (this.phaseIdx + 1) % FOCUS_PHASES.length; this.phaseBlend = 0.0;
      }
    }
    const prevP = FOCUS_PHASES[this.prevPhaseIdx]; const currP = FOCUS_PHASES[this.phaseIdx]; const b = this.phaseBlend;
    const pluckProb = prevP.pluckProb + (currP.pluckProb - prevP.pluckProb) * b;
    const chimeProb = prevP.chimeProb + (currP.chimeProb - prevP.chimeProb) * b;
    const shakerProb = prevP.shakerProb + (currP.shakerProb - prevP.shakerProb) * b;
    const swing = barStep % 2 === 1 ? this.getStepDuration() * 0.07 : 0;

    if (t >= 5 && r > 0.02) {
      if (isIntro) {
        if (barStep === 0 || barStep === 8) this._triggerKick(time, 1.0, false);
        else if ((barStep === 4 || barStep === 12) && t >= 14 && r >= 0.22) this._triggerKick(time, 0.86 * Math.min(1.0, (t - 14) / 14), false);
      } else {
        const stepWeight = (prevP.kickPattern[barStep] || 0) * (1 - b) + (currP.kickPattern[barStep] || 0) * b;
        if (stepWeight > 0.08) {
          const isPrimaryBeat = barStep === 0 || barStep === 8; const isGhost = stepWeight < 0.72;
          if (isPrimaryBeat || r >= 0.2) {
            const velScale = isPrimaryBeat ? 1.0 : Math.min(1.0, 0.45 + r * 0.75);
            this._triggerKick(time + (isGhost ? swing : 0), stepWeight * velScale, isGhost);
          }
        }
      }
    }
    if (t >= 12) {
      const isSlot = barStep === 0 || barStep === 3 || barStep === 6 || barStep === 11 || barStep === 14;
      const prob = Math.min(0.9, (isIntro ? 0.26 : pluckProb) * (0.45 + r * 0.95));
      if (isSlot && Math.random() < prob) this._triggerPluck(time + swing, 0.65 + Math.random() * 0.3);
    }
    if (t >= 18) {
      if ((barStep === 2 || barStep === 10) && Math.random() < (isIntro ? 0.14 : chimeProb)) this._triggerChime(time + swing);
      if (r > 0.08) {
        const shProb = Math.min(0.95, (isIntro ? 0.3 : shakerProb) * (r * 1.35));
        if (barStep % 4 === 2 && Math.random() < shProb) this._triggerShaker(time, 0.65);
        else if (!isIntro && barStep % 2 === 1 && Math.random() < shProb * 0.45) this._triggerShaker(time + swing, 0.35);
      }
    }
  }

  tick(dt) {
    super.tick(dt);
    const isIntro = this.elapsed < this.INTRO_SEC;
    if (this.phaseBlend < 1.0) this.phaseBlend = Math.min(1.0, this.phaseBlend + dt / 7.0);
    const prevP = FOCUS_PHASES[this.prevPhaseIdx]; const currP = FOCUS_PHASES[this.phaseIdx];
    const blendedBpm = prevP.bpm + (currP.bpm - prevP.bpm) * this.phaseBlend;
    const baseBpm = isIntro ? 96 + (this.elapsed / this.INTRO_SEC) * 3.0 : blendedBpm;
    this.currentBpm += (baseBpm * this.params.speed - this.currentBpm) * Math.min(1, dt * 1.2);
    this.core.setDelayBpm(this.currentBpm);
    if (isIntro) this.phaseName = this.elapsed < 10 ? 'Мягкий вход' : this.elapsed < 22 ? 'Раскрытие пульса' : 'Выход в поток';
    else this.phaseName = this.phaseBlend < 0.85 ? `Переход → ${currP.name}` : currP.name;
    this._syncLevels(0.45);
  }
}

/* 2. СОН */
class SleepSoundscape extends SoundscapeInstance {
  constructor(core, opts = {}) {
    super(core, 'sleep', { params: opts.params });
    this.phaseName = 'Ночной прибой'; this.waveAngleA = 0; this.waveAngleB = 1.8; this.chordIdx = 0;
    this.cloudChords = [
      [155.56, 196.0, 233.08, 293.66],
      [130.81, 155.56, 196.0, 233.08],
      [174.61, 207.65, 261.63, 311.13],
      [116.54, 155.56, 196.0, 261.63]
    ];
    this.lullabyScale = [311.13, 349.23, 392.0, 466.16, 523.25, 622.25, 698.46, 783.99];
    this.lullabyCursor = 2;
  }

  _build() {
    const now = this.ctx.currentTime;
    this.surfGainA = this.ctx.createGain(); this.surfGainA.gain.setValueAtTime(0.15, now);
    const surfHpA = this.ctx.createBiquadFilter(); surfHpA.type = 'highpass'; surfHpA.frequency.setValueAtTime(170, now);
    this.surfFilterA = this.ctx.createBiquadFilter(); this.surfFilterA.type = 'lowpass'; this.surfFilterA.frequency.setValueAtTime(420, now); this.surfFilterA.Q.setValueAtTime(0.55, now);
    const surfPanA = this.ctx.createStereoPanner(); surfPanA.pan.setValueAtTime(-0.38, now);
    const surfSrcA = this._track(this.ctx.createBufferSource()); surfSrcA.buffer = this.core.pinkNoise; surfSrcA.loop = true;
    surfSrcA.connect(surfHpA); surfHpA.connect(this.surfFilterA); this.surfFilterA.connect(this.surfGainA); this.surfGainA.connect(surfPanA);
    surfPanA.connect(this.fadeGain); surfPanA.connect(this.revBus); surfSrcA.start(now);

    this.surfGainB = this.ctx.createGain(); this.surfGainB.gain.setValueAtTime(0.1, now);
    this.surfFilterB = this.ctx.createBiquadFilter(); this.surfFilterB.type = 'bandpass'; this.surfFilterB.frequency.setValueAtTime(560, now); this.surfFilterB.Q.setValueAtTime(0.6, now);
    const surfPanB = this.ctx.createStereoPanner(); surfPanB.pan.setValueAtTime(0.42, now);
    const surfSrcB = this._track(this.ctx.createBufferSource()); surfSrcB.buffer = this.core.pinkNoise; surfSrcB.loop = true;
    surfSrcB.connect(this.surfFilterB); this.surfFilterB.connect(this.surfGainB); this.surfGainB.connect(surfPanB);
    surfPanB.connect(this.fadeGain); surfPanB.connect(this.revBus); surfSrcB.start(now, 1.7);

    this.cloudLP = this.ctx.createBiquadFilter(); this.cloudLP.type = 'lowpass'; this.cloudLP.frequency.setValueAtTime(460, now); this.cloudLP.Q.setValueAtTime(0.5, now);
    const cloudGain = this.ctx.createGain(); cloudGain.gain.setValueAtTime(0.095, now);
    this.cloudLP.connect(cloudGain); cloudGain.connect(this.fadeGain); cloudGain.connect(this.revBus);

    this.lullabyBus = this.ctx.createGain(); this.lullabyBus.gain.setValueAtTime(0.46, now);
    this.lullabyBus.connect(this.fadeGain); this.lullabyBus.connect(this.revBus); this.lullabyBus.connect(this.delBus);
  }

  getStepDuration() { return 3.4 / this.params.speed; }

  _triggerCloudSwell(time, notes) {
    const dur = 18.0; const grp = this.ctx.createGain();
    grp.gain.setValueAtTime(0.0001, time); grp.gain.linearRampToValueAtTime(0.2, time + 5.5);
    grp.gain.setValueAtTime(0.2, time + dur - 6.5); grp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    grp.connect(this.cloudLP);
    notes.forEach((f, idx) => {
      const osc = this.ctx.createOscillator(); const pan = this.ctx.createStereoPanner();
      osc.type = 'sine'; osc.frequency.setValueAtTime(f, time);
      osc.frequency.linearRampToValueAtTime(f * (idx % 2 === 0 ? 1.0018 : 0.9982), time + dur);
      pan.pan.setValueAtTime(((idx / (notes.length - 1)) * 2 - 1) * 0.55, time);
      osc.connect(pan); pan.connect(grp); osc.start(time); osc.stop(time + dur + 0.2);
    });
  }

  _triggerFeltNote(time, vel = 0.7) {
    const move = Math.random() < 0.7 ? (Math.random() < 0.5 ? 1 : -1) : (Math.random() < 0.5 ? 2 : -2);
    this.lullabyCursor = Math.max(0, Math.min(this.lullabyScale.length - 1, this.lullabyCursor + move));
    const freq = this.lullabyScale[this.lullabyCursor];
    const osc1 = this.ctx.createOscillator(); const osc2 = this.ctx.createOscillator(); const g2 = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter(); const env = this.ctx.createGain(); const pan = this.ctx.createStereoPanner();
    osc1.type = 'sine'; osc1.frequency.setValueAtTime(freq, time);
    osc2.type = 'triangle'; osc2.frequency.setValueAtTime(freq * 2.0, time);
    g2.gain.setValueAtTime(0.09, time); g2.gain.exponentialRampToValueAtTime(0.002, time + 0.6);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(980, time); lp.frequency.exponentialRampToValueAtTime(420, time + 2.4);
    const dur = 4.2 + Math.random() * 1.6;
    env.gain.setValueAtTime(0.0001, time); env.gain.linearRampToValueAtTime(0.16 * vel, time + 0.09); env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    pan.pan.setValueAtTime(Math.random() * 1.2 - 0.6, time);
    osc1.connect(lp); osc2.connect(g2); g2.connect(lp); lp.connect(env); env.connect(pan); pan.connect(this.lullabyBus);
    osc1.start(time); osc2.start(time); osc1.stop(time + dur + 0.15); osc2.stop(time + dur + 0.15);
    this.pulseEnergy = Math.max(this.pulseEnergy, 0.32);
  }

  scheduleStep(step, time) {
    const r = this.getEffectiveRhythm();
    const chordSteps = Math.max(3, Math.round(7 - this.params.phaseFreq * 4));
    if (step % chordSteps === 0) {
      this._triggerCloudSwell(time, this.cloudChords[this.chordIdx]);
      this.chordIdx = (this.chordIdx + 1) % this.cloudChords.length;
    }
    if (Math.random() < 0.28 + r * 0.45) {
      this._triggerFeltNote(time + Math.random() * 0.6, 0.72);
      if (Math.random() < 0.38) this._triggerFeltNote(time + 0.95 + Math.random() * 0.5, 0.48);
    }
  }

  tick(dt) {
    super.tick(dt);
    const spd = this.params.speed;
    this.waveAngleA += dt * ((Math.PI * 2) / 11.5) * spd;
    this.waveAngleB += dt * ((Math.PI * 2) / 17.3) * spd;
    const wA = (Math.sin(this.waveAngleA) + 1) * 0.5; const wB = (Math.sin(this.waveAngleB) + 1) * 0.5;
    const now = this.ctx.currentTime;
    if (!this.destroyed && this.surfGainA && this.surfGainB) {
      this.surfGainA.gain.setTargetAtTime(0.07 + wA * 0.24, now, 0.4);
      this.surfFilterA.frequency.setTargetAtTime(380 + wA * 900, now, 0.4);
      this.surfGainB.gain.setTargetAtTime(0.05 + wB * 0.16, now, 0.45);
      this.surfFilterB.frequency.setTargetAtTime(520 + wB * 1000, now, 0.45);
    }
    this.phaseName = wA > 0.55 ? 'Прилив · тихие волны' : 'Отлив · глубокий сон';
  }
}

/* 3. МЕДИТАЦИЯ */
class MeditationSoundscape extends SoundscapeInstance {
  constructor(core, opts = {}) {
    super(core, 'meditation', { params: opts.params });
    this.phaseName = 'Вдох · выдох';
    this.bowlFundamentals = [146.83, 220.0, 293.66, 329.63, 440.0];
    this.breathAngle = -Math.PI / 2;
  }

  _build() {
    const now = this.ctx.currentTime;
    this.breathFilter = this.ctx.createBiquadFilter(); this.breathFilter.type = 'lowpass';
    this.breathFilter.frequency.setValueAtTime(520, now); this.breathFilter.Q.setValueAtTime(1.15, now);
    const droneGain = this.ctx.createGain(); droneGain.gain.setValueAtTime(0.28, now);
    this.breathFilter.connect(droneGain); droneGain.connect(this.fadeGain); droneGain.connect(this.revBus);
    [
      { f: 73.42, t: 'triangle', g: 0.42, pan: -0.15 },
      { f: 73.62, t: 'sine', g: 0.36, pan: 0.15 },
      { f: 110.0, t: 'triangle', g: 0.28, pan: -0.35 },
      { f: 146.83, t: 'sawtooth', g: 0.11, pan: 0.35 },
      { f: 147.25, t: 'triangle', g: 0.16, pan: -0.25 },
      { f: 220.0, t: 'sine', g: 0.14, pan: 0.25 }
    ].forEach((cfg) => {
      const osc = this._track(this.ctx.createOscillator()); const g = this.ctx.createGain(); const pan = this.ctx.createStereoPanner();
      osc.type = cfg.t; osc.frequency.setValueAtTime(cfg.f, now); g.gain.setValueAtTime(cfg.g, now); pan.pan.setValueAtTime(cfg.pan, now);
      osc.connect(g); g.connect(pan); pan.connect(this.breathFilter); osc.start(now);
    });
    const thetaGain = this.ctx.createGain(); thetaGain.gain.setValueAtTime(0.032, now); thetaGain.connect(this.revBus);
    [587.33, 591.83].forEach((f, idx) => {
      const o = this._track(this.ctx.createOscillator()); const pan = this.ctx.createStereoPanner();
      o.type = 'sine'; o.frequency.setValueAtTime(f, now); pan.pan.setValueAtTime(idx === 0 ? -0.45 : 0.45, now);
      o.connect(pan); pan.connect(thetaGain); o.start(now);
    });
    this.bowlBus = this.ctx.createGain(); this.bowlBus.gain.setValueAtTime(0.42, now);
    this.bowlBus.connect(this.fadeGain); this.bowlBus.connect(this.revBus);
  }

  getStepDuration() { return 5.55 / this.params.speed; }

  _triggerSingingBowl(time) {
    const f0 = this.bowlFundamentals[Math.floor(Math.random() * this.bowlFundamentals.length)];
    const dur = 8.5 + Math.random() * 3.5;
    const pan = this.ctx.createStereoPanner(); pan.pan.setValueAtTime(Math.random() * 1.2 - 0.6, time); pan.connect(this.bowlBus);
    [{ ratio: 1.0, amp: 0.24, decay: dur }, { ratio: 2.76, amp: 0.085, decay: dur * 0.72 }, { ratio: 5.4, amp: 0.032, decay: dur * 0.48 }].forEach((p) => {
      const osc = this.ctx.createOscillator(); const env = this.ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(f0 * p.ratio, time);
      env.gain.setValueAtTime(0.0001, time); env.gain.linearRampToValueAtTime(p.amp, time + 0.38); env.gain.exponentialRampToValueAtTime(0.0001, time + p.decay);
      osc.connect(env); env.connect(pan); osc.start(time); osc.stop(time + p.decay + 0.2);
    });
    this.pulseEnergy = 0.65;
  }

  scheduleStep(step, time) {
    const bowlInterval = Math.max(1, Math.round(3 - this.params.phaseFreq * 2));
    if (step === 0 || (step % bowlInterval === 0 && Math.random() < 0.3 + this.getEffectiveRhythm() * 0.65)) this._triggerSingingBowl(time + 0.4);
  }

  tick(dt) {
    super.tick(dt);
    this.breathAngle += dt * Math.PI * 2 * 0.09 * this.params.speed;
    const norm = (Math.sin(this.breathAngle) + 1) * 0.5;
    this.breathPhase = norm;
    this.phaseName = Math.cos(this.breathAngle) >= 0 ? 'Вдох · раскрытие' : 'Выдох · отпускание';
    if (!this.destroyed && this.breathFilter) this.breathFilter.frequency.setTargetAtTime(260 + norm * 620, this.ctx.currentTime, 0.18);
  }
}

/* 4. УЧЁБА */
class StudySoundscape extends SoundscapeInstance {
  constructor(core, opts = {}) {
    super(core, 'study', { params: opts.params, initialBpm: 92 });
    this.phaseName = 'Структурный фокус'; this.baseBpm = 92; this.patStep = 0; this.patIdx = 0;
    this.patterns = [[0, 2, 4, 6, 4, 2, 3, 5], [0, 4, 5, 7, 5, 4, 2, 3], [0, 3, 4, 6, 7, 6, 4, 2]];
    this.scale = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
    this.padChords = [
      [220.0, 261.63, 329.63, 392.0],
      [196.0, 246.94, 293.66, 329.63],
      [174.61, 220.0, 261.63, 329.63],
      [261.63, 329.63, 392.0, 493.88]
    ];
    this.core.setDelayBpm(92 * this.params.speed);
  }

  _build() {
    const now = this.ctx.currentTime;
    const air = this._track(this.ctx.createBufferSource()); air.buffer = this.core.pinkNoise; air.loop = true;
    const airBP = this.ctx.createBiquadFilter(); airBP.type = 'bandpass'; airBP.frequency.setValueAtTime(1100, now); airBP.Q.setValueAtTime(0.7, now);
    const airG = this.ctx.createGain(); airG.gain.setValueAtTime(0.14, now);
    air.connect(airBP); airBP.connect(airG); airG.connect(this.fadeGain); air.start(now);
    this.kickBus = this.ctx.createGain(); this.kickBus.gain.setValueAtTime(0.55, now); this.kickBus.connect(this.fadeGain);
    this.tickBus = this.ctx.createGain(); this.tickBus.gain.setValueAtTime(0.35, now); this.tickBus.connect(this.fadeGain);
    this.arpBus = this.ctx.createGain(); this.arpBus.gain.setValueAtTime(0.52, now);
    this.arpBus.connect(this.fadeGain); this.arpBus.connect(this.delBus); this.arpBus.connect(this.revBus);
    this.padLP = this.ctx.createBiquadFilter(); this.padLP.type = 'lowpass'; this.padLP.frequency.setValueAtTime(920, now);
    const padG = this.ctx.createGain(); padG.gain.setValueAtTime(0.16, now);
    this.padLP.connect(padG); padG.connect(this.fadeGain); padG.connect(this.revBus);
  }

  getStepDuration() { return 60 / this.currentBpm / 4; }

  _triggerSoftKick(time) {
    const osc = this.ctx.createOscillator(); const lp = this.ctx.createBiquadFilter(); const env = this.ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(92, time); osc.frequency.exponentialRampToValueAtTime(48, time + 0.05);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(170, time);
    env.gain.setValueAtTime(0.0001, time); env.gain.linearRampToValueAtTime(0.62, time + 0.006); env.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    osc.connect(lp); lp.connect(env); env.connect(this.kickBus); osc.start(time); osc.stop(time + 0.25);
    this.pulseEnergy = 0.65;
  }

  _triggerMicroTick(time, accent = false) {
    const src = this.ctx.createBufferSource(); src.buffer = this.core.whiteNoise;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(accent ? 6200 : 4800, time);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time); env.gain.linearRampToValueAtTime(accent ? 0.09 : 0.045, time + 0.002); env.gain.exponentialRampToValueAtTime(0.0001, time + 0.025);
    src.connect(hp); hp.connect(env); env.connect(this.tickBus); src.start(time, Math.random() * 1.2, 0.03);
  }

  _triggerMarimba(time, freq, vel = 0.8) {
    const osc = this.ctx.createOscillator(); const over = this.ctx.createOscillator(); const overG = this.ctx.createGain();
    const env = this.ctx.createGain(); const pan = this.ctx.createStereoPanner();
    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, time);
    over.type = 'triangle'; over.frequency.setValueAtTime(freq * 4, time);
    overG.gain.setValueAtTime(0.06, time); overG.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    env.gain.setValueAtTime(0.0001, time); env.gain.linearRampToValueAtTime(0.2 * vel, time + 0.006); env.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
    pan.pan.setValueAtTime(((freq - 220) / 360) * 0.7 - 0.35, time);
    osc.connect(env); over.connect(overG); overG.connect(env); env.connect(pan); pan.connect(this.arpBus);
    osc.start(time); over.start(time); osc.stop(time + 0.38); over.stop(time + 0.38);
  }

  _triggerPad(time, notes) {
    const dur = this.getStepDuration() * 64 + 2.5; const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time); env.gain.linearRampToValueAtTime(0.14, time + 2.0);
    env.gain.setValueAtTime(0.14, time + dur - 2.2); env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    env.connect(this.padLP);
    notes.forEach((f) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, time);
      o.connect(env); o.start(time); o.stop(time + dur + 0.1);
    });
  }

  scheduleStep(step, time) {
    const barStep = step % 16; const r = this.getEffectiveRhythm();
    const barsPerPat = Math.max(6, Math.round(28 - this.params.phaseFreq * 22));
    this.patStep++;
    if (this.patStep >= barsPerPat * 16) {
      this.patStep = 0; this.patIdx = (this.patIdx + 1) % this.patterns.length;
      this.phaseName = this.patIdx === 0 ? 'Структурный фокус' : this.patIdx === 1 ? 'Ясный ритм' : 'Концентрация';
    }
    if (step % 64 === 0) this._triggerPad(time, this.padChords[Math.floor(step / 64) % this.padChords.length]);
    if (r > 0.05) {
      if (barStep === 0 || barStep === 8) this._triggerSoftKick(time);
      else if (this.patIdx === 1 && barStep === 14 && r > 0.35) this._triggerSoftKick(time);
      else if (this.patIdx === 2 && (barStep === 6 || barStep === 12) && r > 0.45) this._triggerSoftKick(time);
      else if (r > 0.7 && (barStep === 4 || barStep === 12)) this._triggerSoftKick(time);
    }
    if (r > 0.1) {
      if (barStep % 4 === 2 && Math.random() < 0.35 + r * 0.65) this._triggerMicroTick(time, true);
      else if (barStep % 2 === 1 && Math.random() < r * 0.6) this._triggerMicroTick(time, false);
    }
    if (barStep % 2 === 0) {
      const pat = this.patterns[this.patIdx];
      const noteIdx = pat[(barStep / 2) % pat.length];
      if (Math.random() < 0.45 + r * 0.5) this._triggerMarimba(time, this.scale[noteIdx], barStep % 4 === 0 ? 0.9 : 0.62);
    }
  }

  tick(dt) {
    super.tick(dt);
    this.currentBpm += (this.baseBpm * this.params.speed - this.currentBpm) * Math.min(1, dt * 2.0);
    this.core.setDelayBpm(this.currentBpm);
  }
}

/* КОНТРОЛЛЕР — один на всё приложение */
class SoundscapeController {
  constructor() {
    this.core = new SharedAudioCore();
    this.activeModeId = 'focus';
    this.activeInstance = null;
    this.isPlaying = false;
    this.params = { speed: 1.0, rhythm: 0.6, phaseFreq: 0.35 };
    this.loopTimer = null;
    this.lastTs = null;
    this.listeners = new Set();
    this.timerMin = 0; this.timerEndsAt = null; this.timerId = null;
    this.beforeStart = null; // App выключает другую музыку перед стартом
    if (typeof document !== 'undefined') {
      // вернулись на страницу или iOS «прервал» звук — продолжаем играть
      const revive = () => {
        if (this.isPlaying && this.core.ctx && this.core.ctx.state !== 'running') this.core.ctx.resume().catch(() => {});
        if (this.isPlaying && this.core.bridgeOn && this.core.bridgeEl && this.core.bridgeEl.paused) this.core.bridgeEl.play().catch(() => {});
      };
      document.addEventListener('visibilitychange', revive);
      window.addEventListener('focus', revive);
      window.addEventListener('pageshow', revive);
    }
  }

  // Карточка на экране блокировки iPhone и кнопки наушников
  _syncMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      const ms = navigator.mediaSession;
      if (this.active) {
        const meta = MODE_META[this.activeModeId];
        if (typeof window.MediaMetadata === 'function') {
          ms.metadata = new window.MediaMetadata({ title: `Эмбиент · ${meta.title}`, artist: 'Магическое пространство · by.Flox', album: meta.purpose, artwork: [{ src: '/media/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/media/icon-512.png', sizes: '512x512', type: 'image/png' }] });
        }
        ms.playbackState = this.isPlaying ? 'playing' : 'paused';
        ms.setActionHandler('play', () => this.play());
        ms.setActionHandler('pause', () => this.pause());
        try { ms.setActionHandler('stop', () => this.stop()); } catch (e) {}
      } else {
        ms.playbackState = 'none';
      }
    } catch (e) {}
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { this._syncMediaSession(); this.listeners.forEach((fn) => { try { fn(); } catch (e) {} }); }

  get active() { return !!this.activeInstance && !this.activeInstance.destroyed; }

  _createInstance(modeId) {
    const opts = { params: this.params };
    switch (modeId) {
      case 'sleep': return new SleepSoundscape(this.core, opts);
      case 'meditation': return new MeditationSoundscape(this.core, opts);
      case 'study': return new StudySoundscape(this.core, opts);
      default: return new FocusSoundscape(this.core, opts);
    }
  }

  updateParam(key, value) {
    this.params[key] = value;
    if (this.active && typeof this.activeInstance._syncLevels === 'function') this.activeInstance._syncLevels(0.15);
  }

  _startLoop() {
    if (this.loopTimer) return;
    this.lastTs = performance.now();
    this.loopTimer = createTicker(() => {
      const ts = performance.now();
      const dt = Math.min(0.2, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      if (this.isPlaying && this.active) {
        this.activeInstance.tick(dt);
        this.activeInstance.runScheduler();
      }
    }, 25);
  }

  async play() {
    this._gen = (this._gen || 0) + 1; // отменяет отложенную остановку, если звук запустили сразу после стопа
    if (this.beforeStart) { try { this.beforeStart(); } catch (e) {} }
    if (!this.core.ready) this.core.init();
    this.core.startBridge(); // строго внутри нажатия пользователя
    if (this.core.ctx.state !== 'running') await this.core.ctx.resume();
    this.core.ctx.onstatechange = () => {
      if (this.isPlaying && this.core.ctx.state !== 'running' && this.core.ctx.state !== 'closed') this.core.ctx.resume().catch(() => {});
    };
    if (!this.active) {
      this.activeInstance = this._createInstance(this.activeModeId);
      this.activeInstance.fadeIn(1.2);
    } else {
      this.activeInstance.nextNoteTime = this.core.ctx.currentTime + 0.06;
    }
    this.isPlaying = true;
    if (this.timerPausedLeft) {
      const ms = this.timerPausedLeft; this.timerPausedLeft = 0;
      this.timerEndsAt = Date.now() + ms;
      this.timerId = setTimeout(() => { this.timerEndsAt = null; this.timerMin = 0; this.stop(); }, ms);
    }
    this.core.fadeMaster(1.0, 0.8);
    this._startLoop();
    this._emit();
    // Страховка от тишины: через секунду проверяем, что звук действительно идёт
    const gen = this._gen;
    const el = this.core.bridgeEl;
    const t0 = el ? el.currentTime : 0;
    setTimeout(() => {
      if (gen !== this._gen || !this.isPlaying) return;
      if (this.core.ctx.state !== 'running') this.core.ctx.resume().catch(() => {});
      if (this.core.bridgeOn && el && (el.paused || el.currentTime <= t0)) {
        this.core.bridgeOn = false;
        try { this.core.masterGain.connect(this.core.ctx.destination); } catch (err) {}
      }
      this.core.fadeMaster(1.0, 0.3);
    }, 1200);
  }

  pause() {
    if (!this.isPlaying) return;
    // таймер замирает вместе со звуком
    if (this.timerId) {
      clearTimeout(this.timerId); this.timerId = null;
      this.timerPausedLeft = Math.max(0, this.timerEndsAt - Date.now()); this.timerEndsAt = null;
    }
    this.isPlaying = false;
    this.core.fadeMaster(0.0001, 0.65);
    this._emit();
  }

  toggle() { return this.isPlaying ? this.pause() : this.play(); }

  // Таймер сна: через N минут звук плавно выключается
  setTimer(min) {
    this.timerMin = min;
    if (this.timerId) clearTimeout(this.timerId);
    this.timerId = null; this.timerEndsAt = null; this.timerPausedLeft = 0;
    if (min && !this.isPlaying) { this.timerPausedLeft = min * 60000; }
    else if (min) {
      this.timerEndsAt = Date.now() + min * 60000;
      this.timerId = setTimeout(() => { this.timerEndsAt = null; this.timerMin = 0; this.stop(); }, min * 60000);
    }
    this._emit();
  }

  // Полная остановка (кнопка ✕ в мини-плеере, таймер, запуск другой музыки)
  stop() {
    if (this.timerId) clearTimeout(this.timerId);
    this.timerId = null; this.timerEndsAt = null; this.timerMin = 0; this.timerPausedLeft = 0;
    const wasActive = this.active || this.isPlaying;
    this.isPlaying = false;
    if (this.core.ready) this.core.fadeMaster(0.0001, 0.5);
    const inst = this.activeInstance;
    this.activeInstance = null;
    const gen = (this._gen = (this._gen || 0) + 1);
    setTimeout(() => {
      if (inst) inst.destroy();
      if (gen !== this._gen) return; // звук уже запустили заново — не глушим его
      if (!this.isPlaying && this.loopTimer) { this.loopTimer.stop(); this.loopTimer = null; }
      if (!this.isPlaying) this.core.stopBridge();
      if (!this.isPlaying && this.core.ctx && this.core.ctx.state === 'running') this.core.ctx.suspend().catch(() => {});
    }, 650);
    if (wasActive) this._emit();
  }

  switchMode(newModeId) {
    if (newModeId === this.activeModeId) return;
    this.activeModeId = newModeId;
    if (this.core.ready && this.activeInstance) {
      const oldInst = this.activeInstance;
      if (this.isPlaying) oldInst.fadeOutAndDestroy(2.4); else oldInst.destroy();
      this.activeInstance = null;
    }
    if (this.isPlaying) {
      this.activeInstance = this._createInstance(newModeId);
      this.activeInstance.fadeIn(2.4);
    }
    this._emit();
  }
}

export const ambient = new SoundscapeController();

// Состояние для интерфейса: { isPlaying, active, modeId }
export function useAmbient() {
  const read = () => ({ isPlaying: ambient.isPlaying, active: ambient.active, modeId: ambient.activeModeId });
  const [state, setState] = useState(read);
  useEffect(() => ambient.subscribe(() => setState(read())), []);
  return state;
}
