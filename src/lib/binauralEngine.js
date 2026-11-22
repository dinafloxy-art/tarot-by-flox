import { useEffect, useState } from 'react';
import { createTicker } from './ambientEngine';

// БИНАУРАЛЬНЫЙ ДВИЖОК: левое и правое ухо получают тоны с разной частотой,
// мозг «слышит» разницу как биение. Вся кривая частот планируется сразу при старте,
// поэтому звук не зависит от таймеров и играет в фоне и при заблокированном экране.
const MIN = 60;

class BinauralEngine {
  constructor() {
    this.ctx = null; this.nodes = null; this.session = null; this.step = null;
    this.isPlaying = false; this.startedAt = 0; this.pausedAt = 0; this.listeners = new Set();
    this.noiseLevel = 0.25; this.volume = 1.0; this.carrierChoice = 'auto';
    this.beforeStart = null; this.onFinish = null; this.ticker = null; this.bridgeEl = null;
  }

  _ensure() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    this.ctx = new C();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    this.master = this.ctx.createGain(); this.master.gain.value = 0.0001;
    this.out = this.ctx.createGain(); this.out.gain.value = this.volume;
    this.master.connect(this.out); this.out.connect(this.ctx.destination);
    // iPhone: выводим через аудиоэлемент, чтобы звук жил при блокировке экрана
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (isIOS && this.ctx.createMediaStreamDestination) {
      try {
        const dest = this.ctx.createMediaStreamDestination();
        this.out.connect(dest);
        const el = document.createElement('audio');
        el.setAttribute('playsinline', ''); el.srcObject = dest.stream; el.style.display = 'none';
        document.body.appendChild(el); this.bridgeEl = el;
      } catch (e) { this.bridgeEl = null; }
    }
    const revive = () => {
      if (this.isPlaying && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      if (this.isPlaying && this.bridgeEl && this.bridgeEl.paused) this.bridgeEl.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', revive);
    window.addEventListener('focus', revive);
  }

  _noiseBuffer() {
    const sr = this.ctx.sampleRate, len = sr * 6, buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const o = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
        o[i] = (b0 + b1 + b2 + w * 0.02) * 0.6;
      }
      // плавный стык петли
      const f = Math.floor(sr * 0.5);
      for (let i = 0; i < f; i++) { const k = i / f; o[i] = o[i] * k + o[len - f + i] * (1 - k); }
    }
    return buf;
  }

  carrierFor(step) { return this.carrierChoice === 'auto' ? step.carrier : Number(this.carrierChoice); }

  // кривая частоты биения: [{t (сек от начала), beat}]
  static curve(session) {
    const pts = []; let t = 0;
    session.segments.forEach(([m, a, b], i) => { if (i === 0) pts.push({ t, beat: a }); t += m * MIN; pts.push({ t, beat: b }); });
    return { pts, total: t };
  }

  _build(fromSec) {
    const ctx = this.ctx, now = ctx.currentTime + 0.05, step = this.step, s = this.session;
    const carrier = this.carrierFor(step);
    const { pts, total } = BinauralEngine.curve(s);
    const beatAt = (sec) => {
      for (let i = 1; i < pts.length; i++) if (sec <= pts[i].t) {
        const a = pts[i - 1], b = pts[i]; return a.beat + (b.beat - a.beat) * ((sec - a.t) / (b.t - a.t || 1));
      }
      return pts[pts.length - 1].beat;
    };
    const merger = ctx.createChannelMerger(2);
    const toneG = ctx.createGain(); toneG.gain.value = 0.36;
    merger.connect(toneG); toneG.connect(this.master);
    const L = ctx.createOscillator(), R = ctx.createOscillator();
    L.type = 'sine'; R.type = 'sine';
    L.frequency.setValueAtTime(carrier, now);
    // правое ухо = несущая + биение, плавно по всей кривой
    R.frequency.setValueAtTime(carrier + beatAt(fromSec), now);
    pts.forEach((p) => { if (p.t > fromSec) R.frequency.linearRampToValueAtTime(carrier + p.beat, now + (p.t - fromSec)); });
    L.connect(merger, 0, 0); R.connect(merger, 0, 1);
    const nodes = [L, R];
    // слой гаммы 40 Гц (вспышки ясности), медленно дышит
    if (step.gamma) {
      const gm = ctx.createChannelMerger(2), gG = ctx.createGain(); gG.gain.value = 0;
      const gL = ctx.createOscillator(), gR = ctx.createOscillator();
      const gc = carrier * 2; gL.frequency.value = gc; gR.frequency.value = gc + 40;
      gL.connect(gm, 0, 0); gR.connect(gm, 0, 1); gm.connect(gG); gG.connect(this.master);
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      lfo.frequency.value = 1 / 45; lfoG.gain.value = 0.05 * step.gamma;
      const base = ctx.createConstantSource ? ctx.createConstantSource() : null;
      if (base) { base.offset.value = 0.05 * step.gamma; base.connect(gG.gain); base.start(now); nodes.push(base); }
      lfo.connect(lfoG); lfoG.connect(gG.gain);
      [gL, gR, lfo].forEach((o) => { o.start(now); nodes.push(o); });
    }
    // мягкий розовый шум как фон
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(); n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
    this.noiseGain = ctx.createGain(); this.noiseGain.gain.value = this.noiseLevel * 0.5;
    n.connect(nf); nf.connect(this.noiseGain); this.noiseGain.connect(this.master);
    [L, R, n].forEach((o) => o.start(now));
    nodes.push(n);
    // общая громкость: вход 6 с; во сне — затухание в последние 5 минут
    const g = this.master.gain; const left = total - fromSec;
    g.cancelScheduledValues(now); g.setValueAtTime(0.0001, now); g.linearRampToValueAtTime(1, now + 6);
    if (s.wake === false) { g.setValueAtTime(1, now + Math.max(6, left - 300)); g.linearRampToValueAtTime(0.0001, now + left); }
    else { g.setValueAtTime(1, now + Math.max(6, left - 4)); g.linearRampToValueAtTime(0.0001, now + left); }
    nodes.forEach((o) => { try { o.stop(now + left + 0.3); } catch (e) {} });
    this.nodes = nodes; this.total = total;
  }

  _teardown() {
    (this.nodes || []).forEach((o) => { try { o.stop(); } catch (e) {} try { o.disconnect(); } catch (e) {} });
    this.nodes = null;
  }

  get elapsed() {
    if (!this.session) return 0;
    if (!this.isPlaying) return this.pausedAt;
    return Math.min(this.total, this.ctx.currentTime - this.startedAt);
  }

  async start(step, session) {
    if (this.beforeStart) { try { this.beforeStart(); } catch (e) {} }
    this._gen = (this._gen || 0) + 1;
    this._ensure();
    const bridge = this._bridgeOn();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    await bridge;
    this._teardown();
    this.step = step; this.session = session; this.pausedAt = 0;
    this._build(0); this.startedAt = this.ctx.currentTime + 0.05; this.isPlaying = true;
    this._watch(); this._emit(); this._guard();
  }

  pause() {
    if (!this.isPlaying) return;
    this.pausedAt = this.elapsed; this.isPlaying = false;
    const g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + 0.6);
    const pg = this._gen; setTimeout(() => { if (pg === this._gen && !this.isPlaying) this._teardown(); }, 700);
    this._emit();
  }

  async resume() {
    if (this.isPlaying || !this.session) return;
    if (this.beforeStart) { try { this.beforeStart(); } catch (e) {} }
    this._gen = (this._gen || 0) + 1;
    const bridge = this._bridgeOn();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    await bridge;
    this._teardown();
    this._build(this.pausedAt); this.startedAt = this.ctx.currentTime + 0.05 - this.pausedAt; this.isPlaying = true;
    this._watch(); this._emit(); this._guard();
  }

  // iPhone: звук идёт через аудиоэлемент (живёт при блокировке). Если элемент не заиграл —
  // оставляем прямой выход, чтобы звук не пропадал.
  _bridgeOn() {
    const el = this.bridgeEl;
    if (!el) return Promise.resolve();
    let p;
    try { p = el.play(); } catch (e) { p = null; }
    const on = () => {
      if (this.bridgeActive) return;
      this.bridgeActive = true;
      try { this.out.disconnect(this.ctx.destination); } catch (e) {}
    };
    if (p && p.then) return p.then(on).catch(() => this._bridgeOff());
    on();
    return Promise.resolve();
  }

  _bridgeOff() {
    if (this.bridgeEl) { try { this.bridgeEl.pause(); } catch (e) {} }
    if (this.bridgeActive) {
      this.bridgeActive = false;
      try { this.out.connect(this.ctx.destination); } catch (e) {}
    }
  }

  // Страховка от тишины: через секунду проверяем, что звук действительно идёт
  _guard() {
    const gen = this._gen;
    const el = this.bridgeEl;
    const t0 = el ? el.currentTime : 0;
    setTimeout(() => {
      if (gen !== this._gen || !this.isPlaying) return;
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      if (this.bridgeActive && el && (el.paused || el.currentTime <= t0)) {
        this.bridgeActive = false;
        try { this.out.connect(this.ctx.destination); } catch (e) {}
      }
    }, 1200);
  }

  toggle() { return this.isPlaying ? this.pause() : this.resume(); }

  stop() {
    if (!this.session) return;
    if (this.isPlaying) {
      const g = this.master.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + 0.6);
    }
    this.isPlaying = false;
    const gen = (this._gen = (this._gen || 0) + 1);
    // разбираем звук, только если за это время не запустили новый сеанс (иначе «плеер играет, а тишина»)
    setTimeout(() => { if (gen === this._gen && !this.isPlaying) this._teardown(); }, 700);
    if (this.ticker) { this.ticker.stop(); this.ticker = null; }
    this._bridgeOff();
    this.session = null; this.step = null; this._emit();
  }

  setVolume(v) { this.volume = v; if (this.out) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08); this._emit(); }
  setNoise(v) { this.noiseLevel = v; if (this.noiseGain) this.noiseGain.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.1); this._emit(); }
  setCarrier(c) { this.carrierChoice = c; if (this.isPlaying) { const at = this.elapsed; this._teardown(); this._build(at); } this._emit(); }

  _watch() {
    if (this.ticker) return;
    this.ticker = createTicker(() => {
      if (!this.session) return;
      if (this.isPlaying && this.elapsed >= this.total - 0.2) {
        const done = this.session; this.isPlaying = false;
        if (this.onFinish) { try { this.onFinish(done); } catch (e) {} }
        this.stop();
        return;
      }
      this._emit();
    }, 1000);
  }

  _media() {
    if (!('mediaSession' in navigator)) return;
    try {
      const ms = navigator.mediaSession;
      if (this.session) {
        if (typeof window.MediaMetadata === 'function')
          ms.metadata = new window.MediaMetadata({ title: `Ступень ${this.step.id} · ${this.session.title}`, artist: 'Бинауральные ритмы · by.Flox', album: this.step.title });
        ms.playbackState = this.isPlaying ? 'playing' : 'paused';
        ms.setActionHandler('play', () => this.resume());
        ms.setActionHandler('pause', () => this.pause());
      }
    } catch (e) {}
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { this._media(); this.listeners.forEach((fn) => { try { fn(); } catch (e) {} }); }

  beatNow() {
    if (!this.session) return null;
    const { pts } = BinauralEngine.curve(this.session); const sec = this.elapsed;
    for (let i = 1; i < pts.length; i++) if (sec <= pts[i].t) { const a = pts[i - 1], b = pts[i]; return a.beat + (b.beat - a.beat) * ((sec - a.t) / (b.t - a.t || 1)); }
    return pts[pts.length - 1].beat;
  }
}

export const binaural = new BinauralEngine();
export const curveOf = BinauralEngine.curve;

export function useBinaural() {
  const read = () => ({
    active: !!binaural.session, isPlaying: binaural.isPlaying, step: binaural.step, session: binaural.session,
    elapsed: binaural.elapsed, total: binaural.total || 0, beat: binaural.beatNow(),
    volume: binaural.volume, noise: binaural.noiseLevel, carrier: binaural.carrierChoice
  });
  const [s, set] = useState(read);
  useEffect(() => binaural.subscribe(() => set(read())), []);
  return s;
}
