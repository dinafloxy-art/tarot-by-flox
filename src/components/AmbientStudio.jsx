import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Timer, ChevronDown } from 'lucide-react';
import { ambient, useAmbient, MODE_META, MODE_ORDER } from '../lib/ambientEngine';

// ЭМБИЕНТЫ: живой генеративный звук (Фокус / Сон / Медитация / Учёба)
const TIMERS = [0, 15, 30, 45, 60, 90, 120];

const css = `
  .amb-wrap { --acc: #F2C97D; --acc-rgb: 242,201,125; --sec-rgb: 74,47,130; color: #f6f1e7; }
  .amb-panel { background: linear-gradient(165deg, rgba(20,14,44,0.82), rgba(10,8,26,0.9)); border: 1.5px solid rgba(var(--acc-rgb),0.45);
    border-radius: 22px; box-shadow: 0 14px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,236,190,0.12), 0 0 30px rgba(var(--acc-rgb),0.12);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); transition: border-color 1s ease, box-shadow 1s ease; }
  .amb-modes { display: flex; gap: 8px; padding: 6px; border-radius: 999px; overflow-x: auto; scrollbar-width: none; margin: 0 auto 14px; width: fit-content; max-width: 100%; }
  .amb-modes::-webkit-scrollbar { display: none; }
  .amb-mode { flex-shrink: 0; padding: 9px 18px; border-radius: 999px; border: 1.5px solid transparent; background: transparent; color: #dcd0bd; cursor: pointer;
    font-size: 1.02rem; letter-spacing: .04em; transition: all .35s ease; line-height: 1.15; }
  .amb-mode small { display: block; font-size: .72rem; opacity: .7; letter-spacing: .02em; }
  .amb-mode.on { color: #fff7e4; border-color: var(--acc); background: linear-gradient(135deg, rgba(var(--acc-rgb),0.22), rgba(var(--sec-rgb),0.4));
    box-shadow: 0 0 22px rgba(var(--acc-rgb),0.35), inset 0 0 12px rgba(var(--acc-rgb),0.15); }
  .amb-stage { padding: 18px 16px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .amb-viz { width: 100%; max-width: 380px; aspect-ratio: 1 / 1; max-height: 340px; }
  .amb-viz canvas { width: 100%; height: 100%; display: block; }
  .amb-title { font-size: clamp(1.9rem, 5vw, 2.6rem); margin: 0; color: #fff6e3; letter-spacing: .1em; text-shadow: 0 0 22px rgba(var(--acc-rgb),0.6); }
  .amb-sub { color: #d9d0e8; opacity: .85; font-size: 1.02rem; text-align: center; max-width: 560px; margin: 0; }
  .amb-pill { display: inline-flex; flex-wrap: wrap; justify-content: center; gap: 4px 10px; padding: 6px 16px; border-radius: 999px; font-size: .92rem;
    background: rgba(8,6,22,0.75); border: 1px solid rgba(var(--acc-rgb),0.4); color: #f3e5c8; font-variant-numeric: tabular-nums; }
  .amb-pill .sep { color: rgba(var(--acc-rgb),0.6); }
  .amb-controls { margin-top: 14px; padding: 16px 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
  @media (max-width: 640px) { .amb-controls { grid-template-columns: 1fr; } }
  .amb-ctl-head { display: flex; justify-content: space-between; font-size: .85rem; letter-spacing: .12em; text-transform: uppercase; color: #e6d5b8; margin-bottom: 8px; }
  .amb-ctl-head b { color: #fff3d6; font-weight: 500; letter-spacing: 0; text-transform: none; }
  .amb-range { -webkit-appearance: none; appearance: none; width: 100%; height: 3px; border-radius: 999px; outline: none; cursor: pointer;
    background: linear-gradient(90deg, rgba(var(--acc-rgb),0.55), rgba(145,118,214,0.35)); }
  .amb-range::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid #12112b;
    background: radial-gradient(circle at 35% 35%, #fff8e6 0%, var(--acc) 75%); box-shadow: 0 0 14px rgba(var(--acc-rgb),0.7); }
  .amb-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid #12112b; background: var(--acc); }
  .amb-bottom { margin-top: 16px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px 22px; }
  .amb-play { position: relative; width: 78px; height: 78px; border-radius: 50%; cursor: pointer; color: #fff4dc; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at 50% 35%, rgba(var(--acc-rgb),0.3) 0%, rgba(18,17,46,0.92) 72%); border: 1.5px solid rgba(var(--acc-rgb),0.7);
    box-shadow: 0 0 28px rgba(var(--acc-rgb),0.3), inset 0 0 16px rgba(var(--acc-rgb),0.15); transition: transform .2s ease, box-shadow .4s ease; }
  .amb-play::before { content: ''; position: absolute; inset: -7px; border-radius: 50%; border: 1px solid rgba(var(--acc-rgb),0.3); }
  .amb-play:active { transform: scale(.95); }
  .amb-play.on { box-shadow: 0 0 46px rgba(var(--acc-rgb),0.55), inset 0 0 22px rgba(var(--acc-rgb),0.3); animation: ambBreath 4s ease-in-out infinite; }
  @keyframes ambBreath { 0%,100% { transform: scale(1) } 50% { transform: scale(1.04) } }
  .amb-chip { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 999px; background: rgba(8,6,22,0.8); border: 1px solid rgba(var(--acc-rgb),0.4); color: #f3e5c8; }
  .amb-chip button { background: none; border: none; color: var(--acc); cursor: pointer; display: flex; padding: 0; }
  .amb-chip select { background: #120d26; color: #f3e5c8; border: 1px solid rgba(var(--acc-rgb),0.6); border-radius: 10px; padding: 5px 8px; font-size: .95rem; }
  .amb-memo { margin-bottom: 14px; padding: 0; overflow: hidden; }
  .amb-memo-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 18px; background: none; border: none;
    color: #ffe3a8; cursor: pointer; font-size: 1.12rem; text-align: left; }
  .amb-memo-body { padding: 0 20px 18px; color: #e8dcf7; font-size: 1.06rem; line-height: 1.6; }
  .amb-memo-body h4 { color: #ffe3a8; margin: 14px 0 6px; font-size: 1.08rem; letter-spacing: .03em; }
  .amb-memo-body ul { margin: 4px 0; padding-left: 20px; }
  .amb-memo-body li { margin: 4px 0; }
  .amb-memo-body b { color: #ffe3a8; font-weight: 600; }
`;

const fmt = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

const phaseFreqLabel = (v) => (v <= 25 ? 'Очень редко' : v <= 48 ? 'Редко' : v <= 72 ? 'Умеренно' : 'Динамично');

// ---- Визуализатор: золотая астролябия, дышащая в такт звуку ----
function drawIcon(ctx, modeId, r, t, pulse, rgb) {
  const alpha = Math.min(1, 0.8 + pulse * 0.2);
  ctx.save();
  ctx.shadowColor = `rgba(${rgb.join(',')},0.8)`; ctx.shadowBlur = 18;
  ctx.strokeStyle = `rgba(255,244,214,${alpha})`; ctx.fillStyle = `rgba(255,244,214,${alpha})`;
  ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const star = (sx, sy, sr) => {
    ctx.beginPath(); ctx.moveTo(sx, sy - sr);
    ctx.quadraticCurveTo(sx, sy, sx + sr, sy); ctx.quadraticCurveTo(sx, sy, sx, sy + sr);
    ctx.quadraticCurveTo(sx, sy, sx - sr, sy); ctx.quadraticCurveTo(sx, sy, sx, sy - sr); ctx.fill();
  };
  if (modeId === 'focus') {
    const w = r * 1.32; const h = r * 0.72;
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(0, -h * 1.45, w, 0); ctx.quadraticCurveTo(0, h * 1.45, -w, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, Math.max(2, r * (0.19 + pulse * 0.05)), 0, Math.PI * 2); ctx.fill();
    for (let i = -2; i <= 2; i++) {
      const a = -Math.PI / 2 + i * 0.34; const r1 = r * 0.92; const r2 = r * (i === 0 ? 1.32 : 1.15);
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(Math.cos(-a) * r1, Math.sin(-a) * r1); ctx.lineTo(Math.cos(-a) * r2, Math.sin(-a) * r2); ctx.stroke();
    }
  } else if (modeId === 'sleep') {
    ctx.rotate(-0.28 + Math.sin(t * 0.35) * 0.08);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0.35 * Math.PI, 1.65 * Math.PI, false); ctx.arc(r * 0.4, 0, r * 0.78, 1.55 * Math.PI, 0.45 * Math.PI, true); ctx.closePath(); ctx.fill();
    star(r * 0.52, -r * 0.14, r * 0.28 * (0.75 + 0.25 * Math.sin(t * 2.1)));
  } else if (modeId === 'meditation') {
    const by = r * 0.56;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.92); ctx.quadraticCurveTo(r * 0.46, -r * 0.12, 0, by); ctx.quadraticCurveTo(-r * 0.46, -r * 0.12, 0, -r * 0.92); ctx.stroke();
    [-1, 1].forEach((d) => {
      ctx.beginPath(); ctx.moveTo(0, by); ctx.quadraticCurveTo(d * r * 0.32, -r * 0.35, d * r * 0.78, -r * 0.46); ctx.quadraticCurveTo(d * r * 0.72, r * 0.28, 0, by); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, by); ctx.quadraticCurveTo(d * r * 0.72, r * 0.04, d * r * 1.18, r * 0.16); ctx.quadraticCurveTo(d * r * 0.66, r * 0.66, 0, by); ctx.stroke();
    });
    star(0, -r * 1.18, r * 0.18);
  } else {
    const by = r * 0.46; const pw = r * 1.08; const ph = r * 0.72;
    [-1, 1].forEach((d) => {
      ctx.beginPath(); ctx.moveTo(0, by); ctx.quadraticCurveTo(d * pw * 0.48, by - ph * 0.26, d * pw, by - ph * 0.08);
      ctx.lineTo(d * pw * 0.88, by - ph); ctx.quadraticCurveTo(d * pw * 0.42, by - ph * 1.16, 0, by - ph * 0.82); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d * pw * 0.64, by - ph * 0.62); ctx.lineTo(d * pw * 0.22, by - ph * 0.55); ctx.stroke();
    });
    star(0, -r * 0.76, r * 0.34 * (0.85 + 0.15 * Math.sin(t * 1.8)));
  }
  ctx.restore();
}

function Visualizer() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0; let alive = true;
    const cur = { p: [...MODE_META[ambient.activeModeId].primaryRgb], s: [...MODE_META[ambient.activeModeId].secondaryRgb] };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth; const h = canvas.clientHeight;
      if (w > 0 && h > 0) { canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    };
    resize();
    window.addEventListener('resize', resize);
    let freq = null;
    const draw = (ts) => {
      if (!alive) return;
      const meta = MODE_META[ambient.activeModeId];
      for (let i = 0; i < 3; i++) { cur.p[i] += (meta.primaryRgb[i] - cur.p[i]) * 0.04; cur.s[i] += (meta.secondaryRgb[i] - cur.s[i]) * 0.04; }
      const P = cur.p.map(Math.round); const S = cur.s.map(Math.round);
      const w = canvas.clientWidth; const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) { raf = requestAnimationFrame(draw); return; }
      const t = ts * 0.001; const cx = w / 2; const cy = h / 2; const m = Math.min(w, h);
      ctx.clearRect(0, 0, w, h);
      let low = 0; let mid = 0; freq = null;
      const an = ambient.core.analyser;
      if (an && ambient.isPlaying) {
        freq = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(freq);
        for (let i = 0; i < 8; i++) low += freq[i] / 255; low /= 8;
        for (let i = 10; i < 42; i++) mid += freq[i] / 255; mid /= 32;
      }
      const inst = ambient.activeInstance;
      const pulse = inst && ambient.isPlaying ? inst.pulseEnergy : 0;
      const breath = ambient.activeModeId === 'meditation' && inst ? (inst.breathPhase - 0.5) * 24 : Math.sin(t * 0.55) * 6;
      const baseR = Math.max(10, m * 0.17 + breath * 0.42 + pulse * 5.5);
      const auraR = Math.max(baseR * 0.18 + 1, m * 0.47 + low * 22 + pulse * 10);
      const g = ctx.createRadialGradient(cx, cy, baseR * 0.18, cx, cy, auraR);
      g.addColorStop(0, `rgba(${P.join(',')},${0.22 + pulse * 0.14 + low * 0.12})`);
      g.addColorStop(0.48, `rgba(${S.join(',')},${0.2 + mid * 0.1})`);
      g.addColorStop(1, 'rgba(6,7,22,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, auraR, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 4; i++) {
        const rr = Math.max(14, baseR + i * (m * 0.068) + breath * (0.3 + i * 0.14) + pulse * (7 - i * 1.2));
        const a = Math.max(0.08, 0.44 - i * 0.085 + pulse * 0.14);
        ctx.save(); if (i === 2) ctx.setLineDash([2, 6]);
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = i % 2 === 0 ? `rgba(${P.join(',')},${a})` : `rgba(218,198,255,${a * 0.65})`;
        ctx.lineWidth = i === 0 ? 1.4 : 0.9; ctx.stroke(); ctx.restore();
      }
      for (let i = 0; i < 42; i++) {
        const f = i / 42; const ang = f * Math.PI * 3.4 - t * 0.24;
        const rd = Math.max(6, baseR * 0.55 + f * (m * 0.28) + breath * 0.5);
        const size = Math.max(0.5, (1 - Math.abs(f - 0.5)) * 2.3 + mid * 1.4);
        const ad = Math.max(0.05, (1 - f * 0.65) * (0.35 + 0.45 * Math.sin(t * 2.2 + i)));
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * rd, cy + Math.sin(ang) * rd, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,236,190,${ad})`; ctx.fill();
      }
      const waveR = Math.max(12, baseR + m * 0.105 + breath * 0.55 + pulse * 6.5);
      ctx.beginPath();
      for (let i = 0; i <= 108; i++) {
        const ang = (i / 108) * Math.PI * 2; const bin = freq ? freq[i % 48] / 255 : 0;
        const rr = Math.max(8, waveR + Math.sin(ang * 3 + t * 0.72) * 3.6 + Math.cos(ang * 5 - t * 0.48) * 2.2 + bin * 19);
        const x = cx + Math.cos(ang) * rr; const y = cy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.strokeStyle = `rgba(${P.join(',')},${0.42 + mid * 0.46})`; ctx.lineWidth = 1.35; ctx.stroke();
      const nodes = [];
      [{ r: baseR + m * 0.085, sp: 0.19, n: 4, sz: 2.3 }, { r: baseR + m * 0.19, sp: -0.12, n: 5, sz: 1.9 }].forEach((o) => {
        for (let k = 0; k < o.n; k++) {
          const ang = t * o.sp + (k * Math.PI * 2) / o.n; const orr = Math.max(6, o.r + breath * 0.5);
          nodes.push({ x: cx + Math.cos(ang) * orr, y: cy + Math.sin(ang) * orr, sz: o.sz });
        }
      });
      ctx.strokeStyle = `rgba(${P.join(',')},${0.14 + mid * 0.18})`; ctx.lineWidth = 0.75; ctx.beginPath();
      nodes.forEach((a, i) => { const b = nodes[(i + 1) % nodes.length]; if (Math.hypot(a.x - b.x, a.y - b.y) < m * 0.34) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } });
      ctx.stroke();
      nodes.forEach((n) => { ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(0.8, n.sz + pulse * 1.5), 0, Math.PI * 2); ctx.fillStyle = `rgba(255,245,220,${0.55 + mid * 0.4})`; ctx.fill(); });
      ctx.save(); ctx.translate(cx, cy);
      drawIcon(ctx, ambient.activeModeId, Math.max(12, m * 0.064 + breath * 0.22 + pulse * 4), t, pulse, P);
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <div className="amb-viz"><canvas ref={ref} aria-hidden="true" /></div>;
}

// ---- Строка статуса обновляется сама, без перерисовки всего раздела ----
function StatusPill() {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 500); return () => clearInterval(t); }, []);
  const meta = MODE_META[ambient.activeModeId];
  const inst = ambient.activeInstance;
  const el = inst ? inst.elapsed : 0;
  const intro = ambient.activeModeId === 'focus';
  const stage = !inst ? 'Готово к запуску' : intro && el < 30 ? `Вступление · ${fmt(el)} / 00:30` : `Бесконечный поток ∞ · ${fmt(el)}`;
  const bpm = inst ? Math.round(inst.currentBpm) : Math.round((meta.id === 'study' ? 92 : 99) * ambient.params.speed);
  return (
    <div className="amb-pill text-font">
      <span>{stage}</span>
      {inst && <><span className="sep">✦</span><span style={{ color: '#fff6e3' }}>{inst.phaseName}</span></>}
      {meta.hasBpm && <><span className="sep">✦</span><span style={{ color: 'var(--acc)' }}>{bpm} BPM</span></>}
    </div>
  );
}

function Memo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="amb-panel amb-memo">
      <button className="amb-memo-head mystic-font" onClick={() => setOpen((v) => !v)}>
        <span>✦ Что это и как работает</span>
        <ChevronDown size={20} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .3s ease' }} />
      </button>
      {open && (
        <div className="amb-memo-body text-font">
          <div>
            Это <b>живой генеративный звук</b>. Он не записан заранее: каждая нота рождается прямо сейчас у вас на устройстве по
            заданным правилам, поэтому поток никогда не повторяется и может звучать сколько угодно, пока вы сами его не выключите.
            В нём нет слов и цепляющих мелодий, которые отвлекают внимание: только ровная, медленно меняющаяся звуковая среда.
          </div>
          <h4>Для чего каждый режим</h4>
          <ul>
            <li><b>Фокус</b> — для работы. Мягкая глухая бочка около 100 ударов в минуту, как пульс собранного, бодрого человека. Ритм задаёт темп,
              низкий гул и пэды закрывают посторонние шумы, а рисунок бочки плавно меняется, чтобы мозг не «привыкал» и не засыпал.</li>
            <li><b>Учёба</b> — для чтения и запоминания. Ритм тише и проще, чем в «Фокусе», звук светлее и прозрачнее, чтобы не мешать думать словами.</li>
            <li><b>Медитация</b> — для практики и расслабления. Ритма нет, звук открывается и закрывается волной примерно раз в 11 секунд:
              под эту волну удобно дышать медленно, около 5–6 вдохов в минуту. Подсказка «Вдох / Выдох» показывает фазу.</li>
            <li><b>Сон</b> — для засыпания. Тихий прибой, низкие тёплые тона и редкие мягкие ноты без чёткого ритма, медленнее спокойного пульса.
              Поставьте таймер, и звук сам выключится.</li>
          </ul>
          <h4>Как пользоваться</h4>
          <ul>
            <li>Выберите режим и нажмите круглую кнопку или сам символ в центре (глаз, луну, лотос, книгу). В «Фокусе» первые 30 секунд идёт мягкое вступление, потом начинается бесконечный поток.</li>
            <li><b>Скорость</b> — общий темп звука. <b>Ритмика</b> (только в «Фокусе» и «Учёбе», где есть ритм) — сколько в звуке ритма и движения, она сама слегка «дышит» вверх и вниз.
              <b> Смена фаз</b> — как часто меняется рисунок бочки или аккорды.</li>
            <li>Громкость держите тихой или средней: звук должен быть фоном, а не главным событием.</li>
            <li>Лучше всего звучит в наушниках или на хороших колонках. Звук не прерывается, когда вы переходите в Таро или в Зал Дверей, им можно управлять из мини-плеера внизу.</li>
            <li>На iPhone звук должен играть и при выключенном экране, а управлять им можно с экрана блокировки. Если на вашей версии iOS он всё же остановился, разблокируйте телефон и нажмите Play.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AmbientStudio() {
  const st = useAmbient();
  const meta = MODE_META[st.modeId];
  const [speed, setSpeed] = useState(Math.round(ambient.params.speed * 100));
  const [rhythm, setRhythm] = useState(Math.round(ambient.params.rhythm * 100));
  const [phaseFreq, setPhaseFreq] = useState(Math.round(ambient.params.phaseFreq * 100));
  const [vol, setVol] = useState(Math.round(ambient.core.masterVol * 100));
  const [muted, setMuted] = useState(ambient.core.isMuted);
  const [timerMin, setTimerMin] = useState(ambient.timerMin || 0);
  const [, tickLeft] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => { const t = setInterval(() => tickLeft((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  const wrapStyle = { '--acc': meta.primaryHex, '--acc-rgb': meta.primaryRgb.join(','), '--sec-rgb': meta.secondaryRgb.join(',') };

  const onPlay = async () => {
    setErr('');
    try { await ambient.toggle(); } catch (e) { setErr('Не удалось запустить звук: ' + e.message); }
  };
  const left = ambient.timerEndsAt ? Math.max(0, (ambient.timerEndsAt - Date.now()) / 1000) : 0;

  return (
    <div className="amb-wrap text-font" style={wrapStyle}>
      <style>{css}</style>
      <Memo />
      <div className="amb-panel">
        <div style={{ padding: '14px 10px 0' }}>
          <div className="amb-modes amb-panel" role="tablist" style={{ borderRadius: 999 }}>
            {MODE_ORDER.map((id) => (
              <button key={id} role="tab" aria-selected={st.modeId === id} className={`amb-mode mystic-font ${st.modeId === id ? 'on' : ''}`} onClick={() => ambient.switchMode(id)}>
                {MODE_META[id].title}
                <small className="text-font">{MODE_META[id].purpose}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="amb-stage">
          <div onClick={onPlay} role="button" aria-label={st.isPlaying ? 'Пауза' : 'Играть'} title={st.isPlaying ? 'Пауза' : 'Играть'} style={{ cursor: 'pointer', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Visualizer />
          </div>
          <h2 className="amb-title mystic-font">{meta.title}</h2>
          <p className="amb-sub">{meta.subtitle}</p>
          <StatusPill />
        </div>
      </div>

      <div className="amb-panel amb-controls">
        <div>
          <div className="amb-ctl-head"><span>Скорость</span><b>{(speed / 100).toFixed(2)}×</b></div>
          <input className="amb-range" type="range" min="75" max="130" value={speed} aria-label="Скорость"
            onChange={(e) => { const v = Number(e.target.value); setSpeed(v); ambient.updateParam('speed', v / 100); }} />
        </div>
        {meta.hasBpm && <div>
          <div className="amb-ctl-head"><span>Ритмика</span><b>{rhythm}%</b></div>
          <input className="amb-range" type="range" min="0" max="100" value={rhythm} aria-label="Ритмика"
            onChange={(e) => { const v = Number(e.target.value); setRhythm(v); ambient.updateParam('rhythm', v / 100); }} />
        </div>}
        <div>
          <div className="amb-ctl-head"><span>Смена фаз</span><b>{phaseFreqLabel(phaseFreq)}</b></div>
          <input className="amb-range" type="range" min="10" max="100" value={phaseFreq} aria-label="Смена фаз"
            onChange={(e) => { const v = Number(e.target.value); setPhaseFreq(v); ambient.updateParam('phaseFreq', v / 100); }} />
        </div>
      </div>

      <div className="amb-bottom">
        <button className={`amb-play ${st.isPlaying ? 'on' : ''}`} onClick={onPlay} aria-label={st.isPlaying ? 'Пауза' : 'Играть'}>
          {st.isPlaying ? <Pause size={30} /> : <Play size={30} style={{ marginLeft: 4 }} />}
        </button>
        <div className="amb-chip" style={{ minWidth: 220 }}>
          <button onClick={() => { const m = !muted; setMuted(m); ambient.core.setMuted(m); }} aria-label="Звук">
            {muted ? <VolumeX size={18} color="#fda4af" /> : <Volume2 size={18} />}
          </button>
          <input className="amb-range" type="range" min="0" max="100" value={vol} aria-label="Громкость" style={{ flex: 1 }}
            onChange={(e) => { const v = Number(e.target.value); setVol(v); ambient.core.setMasterVolume(v / 100); if (v > 0 && muted) { setMuted(false); ambient.core.setMuted(false); } }} />
          <span style={{ width: 38, textAlign: 'right', fontSize: '.9rem' }}>{vol}%</span>
        </div>
        <div className="amb-chip">
          <Timer size={18} color="var(--acc)" />
          <span>Таймер</span>
          <select value={timerMin} onChange={(e) => { const m = Number(e.target.value); setTimerMin(m); ambient.setTimer(m); }}>
            {TIMERS.map((m) => <option key={m} value={m}>{m ? `${m} мин` : 'выкл'}</option>)}
          </select>
          {left > 0 && <span style={{ fontVariantNumeric: 'tabular-nums' }}>⏾ {fmt(left)}</span>}
        </div>
      </div>
      {err && <div style={{ marginTop: 12, textAlign: 'center', color: '#fecaca' }}>{err}</div>}
    </div>
  );
}
