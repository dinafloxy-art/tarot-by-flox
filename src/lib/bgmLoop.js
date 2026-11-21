// Фоновая музыка сайта без шва: файл заранее склеен в кольцо,
// а играет через Web Audio как бесконечная петля (у тега <audio loop> на стыке бывает пауза).
// Снаружи ведёт себя как обычный <audio>: play(), pause(), paused, volume.
const SILENCE = 0.0004;

const trimEdges = (ctx, buf) => {
  try {
    const chans = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
    const loud = (i) => chans.some((d) => Math.abs(d[i]) > SILENCE);
    const lim = Math.min(buf.length, Math.floor(buf.sampleRate * 0.3));
    let s = 0;
    while (s < lim && !loud(s)) s++;
    let e = buf.length - 1;
    while (e > buf.length - lim && !loud(e)) e--;
    if (s === 0 && e === buf.length - 1) return buf;
    const len = Math.max(1, e - s + 1);
    const out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(chans[c].subarray(s, s + len));
    return out;
  } catch (err) {
    return buf;
  }
};

class BgmLoop {
  constructor(url) {
    this.url = url;
    this.ctx = null;
    this.gain = null;
    this.buf = null;
    this.src = null;
    this._vol = 1;
    this._offset = 0;
    this._startedAt = 0;
    this._loading = null;
    this.paused = true;
    this.fallback = null;
  }

  _ensureCtx() {
    if (this.ctx) return true;
    const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!C) return false;
    this.ctx = new C();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this._vol;
    this.gain.connect(this.ctx.destination);
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) {}
    return true;
  }

  load() {
    if (this._loading) return this._loading;
    if (!this._ensureCtx()) return Promise.reject(new Error('no audio'));
    this._loading = fetch(this.url)
      .then((r) => r.arrayBuffer())
      .then(
        (ab) =>
          new Promise((res, rej) => {
            const p = this.ctx.decodeAudioData(ab, res, rej);
            if (p && p.then) p.then(res, rej);
          })
      )
      .then((b) => {
        this.buf = trimEdges(this.ctx, b);
        return this.buf;
      })
      .catch((e) => {
        this._loading = null;
        throw e;
      });
    return this._loading;
  }

  _useFallback() {
    if (!this.fallback) {
      this.fallback = new Audio(this.url);
      this.fallback.loop = true;
    }
    this.fallback.volume = this._vol;
    return this.fallback.play();
  }

  play() {
    this.paused = false;
    if (!this._ensureCtx()) return this._useFallback();
    const resume = this.ctx.state !== 'running' ? this.ctx.resume() : Promise.resolve();
    return Promise.all([resume, this.load()])
      .then(() => {
        if (!this.paused) this._start();
      })
      .catch((e) => {
        if (this.paused) return;
        return this._useFallback();
      });
  }

  _start() {
    this._stopSource();
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf;
    s.loop = true;
    s.connect(this.gain);
    const dur = this.buf.duration;
    const off = ((this._offset % dur) + dur) % dur;
    s.start(0, off);
    this._startedAt = this.ctx.currentTime - off;
    this.src = s;
  }

  _stopSource() {
    if (!this.src) return;
    try {
      this.src.stop();
    } catch (e) {}
    try {
      this.src.disconnect();
    } catch (e) {}
    this.src = null;
  }

  pause() {
    this.paused = true;
    if (this.fallback) this.fallback.pause();
    if (this.src && this.buf) this._offset = (this.ctx.currentTime - this._startedAt) % this.buf.duration;
    this._stopSource();
  }

  // следующий запуск начнётся с самого начала трека
  rewind() {
    this._offset = 0;
    if (this.fallback) {
      try { this.fallback.currentTime = 0; } catch (e) {}
    }
  }

  get volume() {
    return this._vol;
  }

  set volume(v) {
    this._vol = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.gain) this.gain.gain.setTargetAtTime(this._vol, this.ctx.currentTime, 0.05);
    if (this.fallback) this.fallback.volume = this._vol;
  }
}

export const createBgmLoop = (url) => new BgmLoop(url);
