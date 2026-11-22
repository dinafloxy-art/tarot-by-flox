import React, { useEffect, useMemo, useState } from 'react';
import { Play, Pause, Square, Lock, Check, ChevronDown, Headphones, Volume2, Waves } from 'lucide-react';
import { STEPS, CARRIERS, readProgress, markDone, stepDone, sessionsDone, setMastered } from '../data/binaural';
import { binaural, useBinaural, curveOf } from '../lib/binauralEngine';

// ВКЛАДКА «БИНАУРАЛЬНЫЕ РИТМЫ»: лестница из 7 ступеней от расслабления до астрала
const css = `
  .bn-wrap { color: #e6ecff; }
  .bn-panel { padding: 18px 20px; border-radius: 20px; background: rgba(10, 12, 34, 0.84); border: 1.5px solid rgba(229,176,92,0.35);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); margin-bottom: 14px; }
  .bn-memo-btn { width: 100%; background: none; border: none; color: #ffe3a8; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; font-size: 1.12rem; }
  .bn-memo { margin-top: 12px; line-height: 1.6; color: #dcd6f3; font-size: 1.02rem; }
  .bn-memo h4 { color: #ffe3a8; margin: 12px 0 4px; font-size: 1.08rem; }
  .bn-memo ul { margin: 0; padding-left: 20px; }
  .bn-ladder { display: flex; flex-direction: column; gap: 10px; }
  .bn-step { border-radius: 18px; border: 1.5px solid rgba(167,139,250,0.3); background: rgba(14, 12, 40, 0.82); overflow: hidden; transition: border-color .25s ease, box-shadow .25s ease; }
  .bn-step.open { border-color: var(--c); box-shadow: 0 0 24px color-mix(in srgb, var(--c) 35%, transparent); }
  .bn-head { display: flex; align-items: center; gap: 14px; padding: 14px 16px; cursor: pointer; }
  .bn-num { width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    border: 1.5px solid var(--c); color: var(--c); font-size: 1.15rem; box-shadow: 0 0 14px color-mix(in srgb, var(--c) 40%, transparent); }
  .bn-num.done { background: var(--c); color: #120a26; }
  .bn-step.locked .bn-head { opacity: .55; }
  .bn-body { padding: 0 16px 16px; }
  .bn-sess { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; margin-top: 10px; }
  .bn-card { padding: 14px; border-radius: 16px; border: 1px solid rgba(229,176,92,0.35); background: rgba(6, 6, 22, 0.7); cursor: pointer; display: flex; gap: 12px; align-items: center; }
  .bn-card.on { border-color: var(--c); box-shadow: 0 0 20px color-mix(in srgb, var(--c) 40%, transparent); }
  .bn-play { width: 42px; height: 42px; border-radius: 50%; border: 1.5px solid var(--c); color: var(--c); background: rgba(255,255,255,0.04);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .bn-now { position: sticky; top: 8px; z-index: 5; }
  .bn-phases { margin: 10px 0 0; padding: 0; list-style: none; }
  .bn-phases li { padding: 7px 10px; border-radius: 10px; color: #a9a3c7; margin-bottom: 4px; transition: all .4s ease; }
  .bn-phases li.cur { color: #fff; background: rgba(229,176,92,0.14); border-left: 3px solid #ffe3a8; }
  .bn-ctrl { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin-top: 12px; color: #dcd6f3; }
  .bn-ctrl input { accent-color: #e5b05c; }
  .bn-ctrl select { background: #120d2a; color: #ffe3a8; border: 1px solid #e5b05c; border-radius: 10px; padding: 6px 10px; }
  .bn-bar { height: 4px; border-radius: 4px; background: rgba(229,176,92,.2); overflow: hidden; margin-top: 10px; }
  .bn-bar > div { height: 100%; background: linear-gradient(90deg, #b88a3c, #ffe3a8); }
  .bn-btn { padding: 9px 16px; border-radius: 22px; border: 1px solid #e5b05c; background: rgba(229,176,92,0.15); color: #ffe3a8; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .bn-link { background: none; border: none; color: #c4b5fd; text-decoration: underline; cursor: pointer; padding: 0; font-size: .95rem; }
`;

const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const band = (b) => (b == null ? '' : b >= 13 ? 'бета' : b >= 8 ? 'альфа' : b >= 4 ? 'тета' : 'дельта');

function Curve({ session, color, elapsed }) {
  const { pts, total } = useMemo(() => curveOf(session), [session]);
  const W = 300, H = 70, y = (b) => H - 6 - ((b - 2) / 11) * (H - 12);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((p.t / total) * W).toFixed(1)},${y(p.beat).toFixed(1)}`).join(' ');
  const x = elapsed != null ? (elapsed / total) * W : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 70, marginTop: 8 }}>
      {[10, 8, 4].map((b) => <line key={b} x1="0" x2={W} y1={y(b)} y2={y(b)} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 5" />)}
      <path d={d} fill="none" stroke={color} strokeWidth="2" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      {x != null && <line x1={x} x2={x} y1="0" y2={H} stroke="#ffe3a8" strokeWidth="1.5" />}
    </svg>
  );
}

export default function BinauralLadder() {
  const st = useBinaural();
  const [progress, setProgress] = useState(readProgress);
  const [open, setOpen] = useState(() => (st.step ? st.step.id : 1));
  const [memo, setMemo] = useState(false);
  const [unlockAll, setUnlockAll] = useState(() => { try { return localStorage.getItem('flox_bn_unlock') === '1'; } catch (e) { return false; } });

  useEffect(() => {
    binaural.onFinish = (s) => setProgress(markDone(s.id));
    return () => { binaural.onFinish = (s) => markDone(s.id); };
  }, []);

  const unlocked = (i) => unlockAll || i === 0 || stepDone(progress, STEPS[i - 1]);
  const curPhase = st.session ? (() => {
    const segs = st.session.segments; let t = 0;
    for (let i = 0; i < segs.length; i++) { t += segs[i][0] * 60; if (st.elapsed < t) return i; }
    return segs.length - 1;
  })() : -1;

  const startOrToggle = (step, s) => {
    if (st.session && st.session.id === s.id) binaural.toggle();
    else binaural.start(step, s);
  };

  return (
    <div className="bn-wrap text-font">
      <style>{css}</style>

      <div className="bn-panel">
        <button className="bn-memo-btn mystic-font" onClick={() => setMemo(!memo)}>
          <Headphones size={18} /> Что это и как заниматься <ChevronDown size={18} style={{ transform: memo ? 'rotate(180deg)' : 'none', transition: '.3s' }} />
        </button>
        {memo && (
          <div className="bn-memo">
            <p>В каждое ухо подаётся чистый тон немного разной частоты. Мозг слышит разницу между ними как мягкое биение и постепенно подстраивает под него свой ритм. Так можно плавно перевести себя из бодрствования в расслабление, на грань сна и дальше, сохраняя сознание.</p>
            <h4>Ритмы мозга</h4>
            <ul>
              <li><b>Бета 13–30 Гц</b> — обычное бодрствование.</li>
              <li><b>Альфа 8–12 Гц</b> — спокойное расслабление.</li>
              <li><b>Тета 4–8 Гц</b> — граница сна, образы, видения, вибрации перед выходом.</li>
              <li><b>Дельта 0.5–4 Гц</b> — глубокий сон, глубина астральных практик.</li>
              <li><b>Гамма ~40 Гц</b> — вспышки ясности, помогает осознать себя во сне.</li>
            </ul>
            <h4>Как проходить лестницу</h4>
            <ul>
              <li>Ступени идут строго по порядку, от простого к сложному: каждая держится на навыке предыдущей, перепрыгивать не нужно.</li>
              <li>У каждой ступени указан срок и признак освоения. Занимайся 4–5 раз в неделю, лучше в одно и то же время.</li>
              <li>Отметку «Состояние достигается легко» ставь, только когда нужное состояние начинает приходить само и стабильно, а не после одного удачного раза. После этой отметки откроется следующая ступень.</li>
              <li>Если на ступени прошло больше срока, а состояния нет, вернись на ступень назад на 2–3 практики, потом продолжай.</li>
              <li>Перед сеансом прочитай, как проходит практика. Во время сеанса глаза закрыты, звук ведёт сам, от привычного ритма плавно вниз.</li>
              <li>После каждой практики записывай образы и ощущения в Дневник снов. По этим записям раз в неделю делается таро-разбор.</li>
            </ul>
            <h4>Важно</h4>
            <ul>
              <li>Нужны наушники: без них биения не будет.</li>
              <li>Громкость тихая, комфортная. Несущую частоту можно сменить, если звук утомляет.</li>
              <li>Не слушай за рулём и во время дел, требующих внимания. При эпилепсии сначала посоветуйся с врачом.</li>
              <li>На iPhone звук продолжает играть при блокировке экрана, если начать сеанс до блокировки.</li>
            </ul>
          </div>
        )}
      </div>

      {st.session && (
        <div className="bn-panel bn-now" style={{ '--c': st.step.color, borderColor: st.step.color }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="bn-play" onClick={() => binaural.toggle()}>{st.isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mystic-font" style={{ color: st.step.color, fontSize: '1.1rem' }}>Ступень {st.step.id} · {st.session.title}</div>
              <div style={{ color: '#b9b3d8', fontSize: '.95rem' }}>
                {fmt(st.elapsed)} / {fmt(st.total)} · {st.beat ? st.beat.toFixed(1) : ''} Гц · {band(st.beat)}
              </div>
            </div>
            <button className="bn-play" title="Завершить" onClick={() => binaural.stop()}><Square size={15} /></button>
          </div>
          <div className="bn-bar"><div style={{ width: `${(st.elapsed / (st.total || 1)) * 100}%` }} /></div>
          <div className="bn-ctrl">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Volume2 size={17} />
              <input type="range" min="0" max="1" step="0.05" value={st.volume} onChange={(e) => binaural.setVolume(Number(e.target.value))} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Waves size={17} /> Шум
              <input type="range" min="0" max="1" step="0.05" value={st.noise} onChange={(e) => binaural.setNoise(Number(e.target.value))} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Тон
              <select value={st.carrier} onChange={(e) => binaural.setCarrier(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
                {CARRIERS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select></label>
            <button className="bn-btn" onClick={() => { setProgress(markDone(st.session.id)); binaural.stop(); }}><Check size={16} /> Засчитать практику</button>
          </div>
        </div>
      )}

      <div className="bn-ladder">
        {STEPS.map((step, i) => {
          const isOpen = open === step.id, ok = unlocked(i), done = stepDone(progress, step);
          return (
            <div key={step.id} className={`bn-step ${isOpen ? 'open' : ''} ${ok ? '' : 'locked'}`} style={{ '--c': step.color }}>
              <div className="bn-head" onClick={() => setOpen(isOpen ? 0 : step.id)}>
                <div className={`bn-num mystic-font ${done ? 'done' : ''}`}>{done ? <Check size={18} /> : ok ? step.id : <Lock size={16} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mystic-font" style={{ fontSize: '1.15rem', color: '#fff6e3' }}>{step.title}</div>
                  <div style={{ color: '#a9a3c7', fontSize: '.95rem' }}>{step.sub}{step.sleep ? ' · перед сном' : ''}</div>
                </div>
                <ChevronDown size={18} color="#a9a3c7" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: '.3s' }} />
              </div>
              {isOpen && (
                <div className="bn-body">
                  <div style={{ color: '#dcd6f3', lineHeight: 1.55 }}>{step.goal}</div>
                  {step.period && (
                    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(229,176,92,0.25)', lineHeight: 1.5 }}>
                      <div><span style={{ color: '#ffe3a8' }}>Срок:</span> {step.period}, 4–5 практик в неделю</div>
                      <div style={{ marginTop: 4 }}><span style={{ color: '#ffe3a8' }}>Ступень освоена, когда:</span> {step.sign}</div>
                      {ok && <div style={{ marginTop: 4, color: '#a9a3c7' }}>Практик пройдено: {sessionsDone(progress, step)}</div>}
                      {ok && (
                        <button className="bn-btn" style={{ marginTop: 8 }}
                          onClick={() => setProgress(setMastered(step.id, !done))}>
                          <Check size={16} /> {done ? 'Освоено · снять отметку' : 'Состояние достигается легко'}
                        </button>
                      )}
                    </div>
                  )}
                  {ok && step.sessions[0] && (
                    <details style={{ marginTop: 10, color: '#cfc8ea' }}>
                      <summary style={{ cursor: 'pointer', color: '#ffe3a8' }}>Как проходит практика (прочитай до начала)</summary>
                      <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.55 }}>
                        {step.sessions[0].phases.filter(Boolean).map((p, j) => <li key={j} style={{ marginBottom: 4 }}>{p}</li>)}
                      </ol>
                      <div style={{ marginTop: 6, color: '#a9a3c7' }}>Во время сеанса глаза закрыты, звук ведёт сам: вход и глубокая часть идут одним потоком.</div>
                    </details>
                  )}
                  {!ok && (
                    <div style={{ marginTop: 10, color: '#c4b5fd' }}>
                      Откроется, когда ступень {step.id - 1} будет отмечена как освоенная.{' '}
                      <button className="bn-link" onClick={() => { setUnlockAll(true); try { localStorage.setItem('flox_bn_unlock', '1'); } catch (e) {} }}>Открыть все ступени</button>
                    </div>
                  )}
                  {ok && (
                    <div className="bn-sess">
                      {step.sessions.map((s) => {
                        const on = st.session && st.session.id === s.id;
                        return (
                          <div key={s.id} className={`bn-card ${on ? 'on' : ''}`} onClick={() => startOrToggle(step, s)}>
                            <div className="bn-play">{on && st.isPlaying ? <Pause size={18} /> : <Play size={18} />}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="mystic-font" style={{ fontSize: '1.05rem' }}>{s.title}</div>
                              <div style={{ color: '#a9a3c7', fontSize: '.92rem' }}>{s.min} мин</div>
                              <Curve session={s} color={step.color} elapsed={on ? st.elapsed : null} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
