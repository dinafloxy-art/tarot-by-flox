import React, { useEffect, useState } from 'react';
import { Headphones, Mic, Radio, Play, Pause, Timer, Volume2, Clock } from 'lucide-react';
import { SOUND_TABS, SOUND_TRACKS, SLEEP_TIMERS } from '../data/sounds';
import AmbientStudio from './AmbientStudio.jsx';
import BinauralLadder from './BinauralLadder.jsx';

// РАЗДЕЛ «ЗВУКИ»: только готовые записи из каталога src/data/sounds.js
const TAB_KEY = 'flox_sounds_tab';
const ICONS = { meditations: <Mic size={17} />, ambients: <Radio size={17} />, binaural: <Headphones size={17} /> };

const css = `
  .snd-tabs { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
  .snd-tab { flex: 1 1 180px; padding: 13px 14px; border-radius: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
    background: rgba(10, 28, 34, 0.78); border: 1.5px solid rgba(94,234,212,0.35); color: #ccfbf1; font-size: 1.05rem; transition: all .25s ease; }
  .snd-tab.active { background: linear-gradient(135deg, rgba(15,80,82,0.95), rgba(20,48,70,0.95)); border-color: #5eead4; color: #fff; box-shadow: 0 0 22px rgba(94,234,212,0.35); }
  .snd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .snd-card { padding: 18px; border-radius: 20px; background: rgba(8, 18, 26, 0.82); border: 1.5px solid rgba(94,234,212,0.25);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; gap: 14px; cursor: pointer; color: #e6fffb; transition: all .2s ease; }
  .snd-card:hover:not(.soon) { border-color: rgba(94,234,212,0.55); transform: translateY(-1px); }
  .snd-card.playing { border-color: #5eead4; box-shadow: 0 0 26px rgba(94,234,212,0.45); }
  .snd-card.soon { opacity: 0.58; cursor: default; border-style: dashed; }
  .snd-play { width: 44px; height: 44px; border-radius: 50%; border: 1.5px solid #5eead4; background: rgba(94,234,212,0.15); color: #ccfbf1;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .snd-card.soon .snd-play { border-color: rgba(94,234,212,0.35); background: rgba(94,234,212,0.06); color: #8ab4b7; }
  .snd-badge { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 999px; font-size: .78rem;
    background: rgba(94,234,212,0.12); border: 1px solid rgba(94,234,212,0.3); color: #99f6e4; }
  .snd-empty { padding: 26px; border-radius: 20px; text-align: center; background: rgba(8, 18, 26, 0.78); border: 1.5px dashed rgba(94,234,212,0.35); color: #b6cfd2; font-size: 1.15rem; }
  .snd-player { margin-top: 18px; padding: 14px 18px; border-radius: 18px; background: rgba(8, 18, 26, 0.84); border: 1px solid rgba(94,234,212,0.32); color: #ccfbf1; display: flex; flex-direction: column; gap: 12px; }
  .snd-seek-row { display: flex; align-items: center; gap: 10px; }
  .snd-seek-range { flex: 1; accent-color: #5eead4; cursor: pointer; height: 6px; }
  .snd-time { font-variant-numeric: tabular-nums; font-size: .88rem; color: #9fc3c6; min-width: 40px; text-align: center; }
  .snd-controls { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }
  .snd-controls select, .snd-controls input { accent-color: #5eead4; }
  .snd-controls select { background: #0b1d24; color: #ccfbf1; border: 1px solid #5eead4; border-radius: 10px; padding: 6px 10px; }
`;

const fmtLeft = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const fmtSec = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
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
  const left = useTimerLeft(sound.timerEndsAt);
  const tracks = SOUND_TRACKS.filter((t) => t.tab === tab);
  const active = sound.activeAudioTrack;
  const activeInTab = active && active.tab === 'meditations';

  return (
    <div className="text-font">
      <style>{css}</style>
      <div className="snd-tabs">
        {SOUND_TABS.map((t) => (
          <button key={t.id} className={`snd-tab mystic-font ${tab === t.id ? 'active' : ''}`} onClick={() => pick(t.id)}>
            {ICONS[t.id]} {t.label}
          </button>
        ))}
      </div>

      {tab === 'ambients' ? (
        <AmbientStudio />
      ) : tab === 'binaural' ? (
        <BinauralLadder />
      ) : tracks.length === 0 ? (
        <div className="snd-empty">Скоро здесь появятся новые записи.</div>
      ) : (
        <div className="snd-grid">
          {tracks.map((t) => {
            const on = active && active.id === t.id;
            const soon = Boolean(t.comingSoon || !t.src);
            return (
              <div
                key={t.id}
                className={`snd-card ${on ? 'playing' : ''} ${soon ? 'soon' : ''}`}
                onClick={() => {
                  if (soon) return;
                  if (on) sound.togglePause();
                  else sound.playTrack(t);
                }}
              >
                <div className="snd-play">
                  {soon ? <Clock size={18} /> : on && !sound.paused ? <Pause size={18} /> : <Play size={18} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="mystic-font" style={{ fontSize: '1.1rem' }}>{t.title}</div>
                  {t.subtitle && <div style={{ color: '#9fc3c6', fontSize: '.95rem' }}>{t.subtitle}</div>}
                  {soon && <span className="snd-badge">Скоро</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'meditations' && tracks.some((t) => !t.comingSoon && t.src) && (
        <div className="snd-player">
          {activeInTab && (
            <div className="snd-seek-row">
              <span className="snd-time">{fmtSec(sound.currentTime)}</span>
              <input
                className="snd-seek-range"
                type="range"
                min="0"
                max={sound.duration || 600}
                step="1"
                value={Math.min(sound.currentTime || 0, sound.duration || 600)}
                onChange={(e) => sound.seek(Number(e.target.value))}
              />
              <span className="snd-time">{fmtSec(sound.duration)}</span>
            </div>
          )}
          <div className="snd-controls">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Volume2 size={18} />
              <input type="range" min="0" max="1" step="0.05" value={sound.volume} onChange={(e) => sound.setVolume(Number(e.target.value))} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Timer size={18} /> Таймер сна
              <select value={sound.sleepTimerMin} onChange={(e) => sound.setSleepTimerMin(Number(e.target.value))}>
                {SLEEP_TIMERS.map((m) => (
                  <option key={m} value={m}>{m ? `${m} мин` : 'выкл'}</option>
                ))}
              </select>
              {left && <span>⏾ {left}</span>}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
