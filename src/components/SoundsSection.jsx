import React, { useEffect, useState } from 'react';
import { Headphones, Mic, Radio, Play, Square, Timer, Volume2 } from 'lucide-react';
import { MEDITATION_TRACKS, AMBIENT_PRESETS, BINAURAL_WAVES, SUBCONSCIOUS_GUIDE_STEPS, CARRIERS, SLEEP_TIMERS } from '../data/sounds';

// РАЗДЕЛ «ЗВУКИ» (шаг 5): три вкладки, общий таймер сна и громкость.
const TAB_KEY = 'flox_sounds_tab';

const css = `
  .snd-tabs { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
  .snd-tab { flex: 1 1 180px; padding: 13px 14px; border-radius: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
    background: rgba(10, 28, 34, 0.78); border: 1.5px solid rgba(94,234,212,0.35); color: #ccfbf1; font-size: 1.05rem; transition: all .25s ease; }
  .snd-tab.active { background: linear-gradient(135deg, rgba(15,80,82,0.95), rgba(20,48,70,0.95)); border-color: #5eead4; color: #fff; box-shadow: 0 0 22px rgba(94,234,212,0.35); }
  .snd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .snd-card { position: relative; padding: 18px; border-radius: 20px; background: rgba(8, 18, 26, 0.82); border: 1.5px solid rgba(94,234,212,0.25);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; flex-direction: column; gap: 8px; transition: border-color .25s, box-shadow .25s; }
  .snd-card.playing { border-color: var(--acc); box-shadow: 0 0 26px var(--acc); }
  .snd-card .cat { font-size: .85rem; letter-spacing: 1.5px; text-transform: uppercase; color: var(--acc); }
  .snd-card h3 { margin: 0; color: #f0fdfa; font-size: 1.2rem; line-height: 1.25; }
  .snd-card p { margin: 0; color: #c7d9dc; font-size: .98rem; line-height: 1.45; flex: 1; }
  .snd-play { align-self: flex-start; margin-top: 6px; display: flex; align-items: center; gap: 7px; padding: 9px 18px; border-radius: 24px; cursor: pointer;
    background: rgba(94,234,212,0.14); border: 1.5px solid var(--acc); color: #f0fdfa; font-size: 1rem; }
  .snd-play:hover { background: rgba(94,234,212,0.28); }
  .snd-bars { display: inline-flex; gap: 2px; align-items: flex-end; height: 14px; }
  .snd-bars i { width: 3px; background: var(--acc, #5eead4); animation: sndBar 1s ease-in-out infinite; }
  .snd-bars i:nth-child(2) { animation-delay: .2s } .snd-bars i:nth-child(3) { animation-delay: .4s }
  @keyframes sndBar { 0%,100% { height: 4px } 50% { height: 14px } }
  .snd-panel { padding: 16px 18px; border-radius: 20px; background: rgba(8, 18, 26, 0.82); border: 1.5px solid rgba(94,234,212,0.25); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); margin-bottom: 14px; }
  .snd-panel h4 { margin: 0 0 10px; color: #99f6e4; font-size: 1.1rem; }
  .snd-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .snd-chip { padding: 8px 14px; border-radius: 20px; cursor: pointer; background: rgba(10,28,34,0.85); border: 1px solid rgba(94,234,212,0.35); color: #ccfbf1; font-size: .98rem; }
  .snd-chip.active { background: rgba(45,212,191,0.28); border-color: #5eead4; color: #fff; }
  .snd-wave { text-align: left; padding: 12px 14px; border-radius: 16px; cursor: pointer; background: rgba(10,28,34,0.85); border: 1px solid rgba(94,234,212,0.3); color: #ccfbf1; }
  .snd-wave.active { border-color: #5eead4; background: rgba(45,212,191,0.2); box-shadow: 0 0 18px rgba(94,234,212,0.3); }
  .snd-wave b { display: block; color: #f0fdfa; font-size: 1.05rem; margin-bottom: 3px; }
  .snd-wave span { font-size: .9rem; color: #b6cfd2; line-height: 1.35; }
  .snd-switch { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; color: #e6fffa; font-size: 1rem; user-select: none; }
  .snd-switch .knob { width: 44px; height: 24px; border-radius: 12px; background: rgba(255,255,255,0.15); position: relative; transition: background .2s; flex-shrink: 0; }
  .snd-switch .knob::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left .2s; }
  .snd-switch.on .knob { background: #14b8a6; } .snd-switch.on .knob::after { left: 23px; }
  .snd-steps { margin-top: 12px; display: grid; gap: 8px; }
  .snd-step { padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(94,234,212,0.2); color: #c7d9dc; font-size: .95rem; line-height: 1.4; transition: all .4s; }
  .snd-step.now { border-color: #5eead4; background: rgba(45,212,191,0.14); color: #f0fdfa; }
  .snd-big { width: 100%; padding: 16px; font-size: 1.15rem; border-radius: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
    background: linear-gradient(135deg, #0f766e, #155e75); border: 1.5px solid #5eead4; color: #fff; box-shadow: 0 0 26px rgba(45,212,191,0.35); }
  .snd-note { color: #9fbfc3; font-size: .92rem; line-height: 1.45; margin-top: 10px; }
  .snd-common { display: flex; flex-wrap: wrap; gap: 12px 22px; align-items: center; }
  .snd-common input[type=range] { width: 150px; accent-color: #2dd4bf; }
`;

const fmtLeft = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function useTimerLeft(endsAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return endsAt ? fmtLeft(endsAt - now) : null;
}

export default function SoundsSection({ sound }) {
  const [tab, setTab] = useState(() => {
    try {
      return sessionStorage.getItem(TAB_KEY) || 'meditations';
    } catch (e) {
      return 'meditations';
    }
  });
  const pick = (t) => {
    setTab(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch (e) {}
  };
  const active = sound.activeAudioTrack;
  const left = useTimerLeft(sound.timerEndsAt);
  const isOn = (type, id) => Boolean(active && active.type === type && active.id === id);

  const playBtn = (on, onPlay) => (
    <button className="snd-play text-font" onClick={on ? sound.stopSoundEngine : onPlay}>
      {on ? (
        <>
          <span className="snd-bars"><i /><i /><i /></span> Остановить
        </>
      ) : (
        <>
          <Play size={16} /> Слушать
        </>
      )}
    </button>
  );

  return (
    <div>
      <style>{css}</style>
      <div className="snd-tabs mystic-font">
        {[
          { id: 'meditations', label: 'Медитации и ASMR', icon: <Mic size={17} /> },
          { id: 'ambients', label: 'Эмбиенты', icon: <Radio size={17} /> },
          { id: 'binaural', label: 'Бинауральные ритмы', icon: <Headphones size={17} /> }
        ].map((t) => (
          <button key={t.id} className={`snd-tab ${tab === t.id ? 'active' : ''}`} onClick={() => pick(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="snd-panel text-font">
        <div className="snd-common">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Timer size={18} color="#99f6e4" />
            <span style={{ color: '#ccfbf1' }}>Таймер сна:</span>
            <div className="snd-chips">
              {SLEEP_TIMERS.map((m) => (
                <button key={m} className={`snd-chip ${sound.sleepTimerMin === m ? 'active' : ''}`} onClick={() => sound.setSleepTimerMin(m)}>
                  {m === 0 ? 'выкл' : `${m} мин`}
                </button>
              ))}
            </div>
            {left && <span style={{ color: '#5eead4', marginLeft: 6 }}>выключится через {left}</span>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ccfbf1' }}>
            <Volume2 size={18} color="#99f6e4" />
            <input type="range" min="0.05" max="1" step="0.05" value={sound.volume} onChange={(e) => sound.setVolume(Number(e.target.value))} />
          </label>
        </div>
      </div>

      {tab === 'meditations' && (
        <>
          <div className="snd-grid">
            {MEDITATION_TRACKS.map((t) => (
              <div key={t.id} className={`snd-card ${isOn('meditation', t.id) ? 'playing' : ''}`} style={{ '--acc': t.accent }}>
                <div className="cat text-font">{t.category} • {t.duration}</div>
                <h3 className="mystic-font">{t.title}</h3>
                <p className="text-font">{t.desc}</p>
                {playBtn(isOn('meditation', t.id), () => sound.startMeditationTrack(t))}
              </div>
            ))}
          </div>
          <div className="snd-note text-font">
            Пока текст медитаций читает встроенный голос вашего браузера. Записанные живые голоса (низкий женский, глубокий мужской, шёпот) добавим отдельным шагом.
          </div>
        </>
      )}

      {tab === 'ambients' && (
        <div className="snd-grid">
          {AMBIENT_PRESETS.map((p) => (
            <div key={p.id} className={`snd-card ${isOn('ambient', p.id) ? 'playing' : ''}`} style={{ '--acc': p.color }}>
              <div className="cat text-font">{p.tag}</div>
              <h3 className="mystic-font">{p.title}</h3>
              <p className="text-font">{p.desc}</p>
              {playBtn(isOn('ambient', p.id), () => sound.startAmbientEngine(p))}
            </div>
          ))}
        </div>
      )}

      {tab === 'binaural' && (
        <>
          <div className="snd-panel text-font" style={{ borderColor: 'rgba(250,204,21,0.45)', color: '#fde68a' }}>
            <Headphones size={18} style={{ verticalAlign: '-3px', marginRight: 8 }} />
            Бинауральные ритмы работают только в наушниках: в левое и правое ухо идут разные частоты, а разницу между ними улавливает мозг.
          </div>
          <div className="snd-panel text-font">
            <h4 className="mystic-font">1. Ритм мозга</h4>
            <div className="snd-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {BINAURAL_WAVES.map((w) => (
                <button key={w.id} className={`snd-wave ${sound.selectedWave.id === w.id ? 'active' : ''}`} onClick={() => sound.setSelectedWave(w)}>
                  <b>{w.name} • Δ {w.hz} Гц</b>
                  <span>{w.purpose}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="snd-panel text-font">
            <h4 className="mystic-font">2. Несущая частота</h4>
            <div className="snd-chips">
              {CARRIERS.map((c) => (
                <button key={c.hz} className={`snd-chip ${sound.carrierFreq === c.hz ? 'active' : ''}`} onClick={() => sound.setCarrierFreq(c.hz)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="snd-note">{(CARRIERS.find((c) => c.hz === sound.carrierFreq) || {}).note}</div>
          </div>
          <div className="snd-panel text-font">
            <h4 className="mystic-font">3. Голос-путеводитель в подсознание</h4>
            <div className={`snd-switch ${sound.voiceGuideEnabled ? 'on' : ''}`} onClick={() => sound.setVoiceGuideEnabled(!sound.voiceGuideEnabled)}>
              <span className="knob" /> {sound.voiceGuideEnabled ? 'Включён' : 'Выключен'}
            </div>
            {sound.voiceGuideEnabled && (
              <div className="snd-steps">
                {SUBCONSCIOUS_GUIDE_STEPS.map((s, i) => (
                  <div key={s.step} className={`snd-step ${active && active.type === 'binaural' && active.guideActive && sound.activeGuideStepIdx === i ? 'now' : ''}`}>
                    <b style={{ color: '#99f6e4' }}>{s.title}.</b> {s.text}
                  </div>
                ))}
              </div>
            )}
          </div>
          {active && active.type === 'binaural' ? (
            <button className="snd-big mystic-font" onClick={sound.stopSoundEngine}>
              <Square size={20} /> Остановить сеанс
            </button>
          ) : (
            <button className="snd-big mystic-font" onClick={() => sound.startBinauralEngine(sound.selectedWave, sound.carrierFreq, sound.voiceGuideEnabled)}>
              <Play size={20} /> Начать сеанс: {sound.selectedWave.name}, {sound.carrierFreq} Гц
            </button>
          )}
          <div className="snd-note text-font">Чтобы сменить ритм или частоту во время сеанса, выберите новые и снова нажмите «Начать».</div>
        </>
      )}
    </div>
  );
}
