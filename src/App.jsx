import React, { useState, useEffect, useRef } from 'react';
import { VolumeX, BookOpen, Send, Trash2, Headphones, DoorOpen, Mic, Radio, Waves, X, ChevronLeft, ChevronDown, Play, Pause } from 'lucide-react';

import { DECK, computeYesNoVerdictFromCards, drawCards, preloadSingleCard } from './data/deck';
import { requestDeepTarotLLM } from './lib/llm';
import { cleanAnalysisText, formatReadableText, nowRuDate, scrollToEl } from './lib/text';
import { playCardFlipSound } from './lib/audio';
import { globalStyles } from './styles';
import TarotCardImage from './components/TarotCardImage';
import RealCloudBackdrop from './components/RealCloudBackdrop';
import { useSoundEngine } from './hooks/useSoundEngine';
import { useTarotHistory } from './hooks/useTarotHistory';
import { useDreams } from './hooks/useDreams';
import DoorHall from './DoorHall.jsx';
import SoundsSection, { useTimerLeft } from './components/SoundsSection.jsx';

// Пути к медиа
const mediaUrls = {
  phoneMp4: '/media/phone-loop-muted.mp4',
  desktopMp4: '/media/desktop-loop-muted.mp4',
  phonePoster: '/media/phone-poster.webp',
  desktopPoster: '/media/desktop-poster.webp',
  bgmMp3: '/media/tarot-ambient-loop.mp3',
  tableWebm: '/media/table-cloud-loop.webm',
  tableWebp: '/media/table-on-cloud.webp',
  adviceCloudWebm: '/media/cloud-loop-alpha.webm'
};

// ИНСТРУКЦИЯ ТАРОЛОГА (утверждена по тесту «Жив ли ещё Лёша?»)
const TAROT_CORE = `Ты — опытный таролог, работающий по классической системе Райдера–Уэйта. Ты читаешь расклад как эзотерическое послание карт о том, о ком или о чём задан вопрос.

Как ты работаешь:
- Все позиции расклада относятся к тому человеку или к той ситуации, о которых спросили. Ты описываешь его судьбу, жизненную силу, обстоятельства и путь так, как их показывают карты.
- Каждую карту толкуешь по её классическому значению Райдера–Уэйта, учитываешь символы, стихию масти, нумерологию и связки соседних карт.
- Язык эзотерический: арканы, энергии, стихии, повороты судьбы.
- В начале ответа даёшь прямой вывод карт по заданному вопросу, затем обосновываешь его.`;

const TAROT_DEEP_SYSTEM = `${TAROT_CORE}

Структура ответа:
1. Прямой ответ карт на вопрос.
2. Разбор каждой из пяти карт в её позиции.
3. Ключевые связки карт.
4. Итог расклада.
В самом конце строка «ГЛАВНЫЙ СОВЕТ:» и 2–3 конкретных действия, которые подсказывают карты.

Пиши живым, образным, точным русским языком, называй карты полными названиями, без воды.`;

const TAROT_FOLLOWUP_SYSTEM = `${TAROT_CORE}

Сейчас задан уточняющий вопрос в рамках уже сделанного расклада, и на него вытянуты 5 новых карт. Начни с прямого ответа карт на уточняющий вопрос, затем разбери каждую новую карту в её позиции и свяжи их с базовым раскладом. Пиши живым, образным, точным русским языком, называй карты полными названиями, без воды. Строку «ГЛАВНЫЙ СОВЕТ» в уточнении не добавляй.`;

const DEEP_POSITIONS = [
  'Прошлое, что привело к нынешнему положению',
  'Настоящее, что происходит сейчас',
  'Центр, суть ответа на вопрос',
  'Скрытое, что влияет незримо',
  'Куда ведёт путь'
];
const positionsList = (cards) => cards.map((c, i) => `${i + 1}. ${DEEP_POSITIONS[i]} — ${c.name}`).join('\n');

// Исправление для iPhone: страница не должна сдвигаться влево-вправо
const layoutFixStyles = `
  html, body { max-width: 100%; overflow-x: hidden; overflow-x: clip; overscroll-behavior-x: none; }
  #root { width: 100%; max-width: 100%; overflow-x: hidden; overflow-x: clip; }
  .app-root { position: relative; width: 100%; max-width: 100vw; overflow-x: hidden; overflow-x: clip; touch-action: pan-y pinch-zoom; }
  .tarot-memo-toggle { width: 100%; background: none; border: none; color: #ffe3a8; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; font-size: 1.15rem; padding: 0; }
  .tarot-memo-body { text-align: left; margin-top: 14px; line-height: 1.6; color: #e8dcf7; }
  .tarot-memo-body h4 { color: #ffe3a8; margin: 14px 0 6px; font-size: 1.15rem; }
  .tarot-memo-body ul { margin: 0; padding-left: 20px; }
  .tarot-memo-body li { margin-bottom: 4px; }
  .yn-count { display: flex; gap: 6px; justify-content: center; margin-top: 10px; flex-wrap: wrap; }
  .yn-count button { background: rgba(18, 12, 38, 0.85); border: 1px solid rgba(196,181,253,0.6); color: #e8dcf7; border-radius: 20px; padding: 6px 14px; cursor: pointer; font-size: 1rem; }
  .yn-count button.active { background: linear-gradient(135deg, rgba(64, 22, 110, 0.95), rgba(118, 72, 165, 0.95)); color: #fff; border-color: #c4b5fd; }
`;

const splitAdvice = (rawText, fallbackAdvice) => {
  const parts = rawText.split(/(?:###\s*|##\s*|\*\*)?ГЛАВНЫЙ СОВЕТ\s*:?\s*(?:\*\*)?/i);
  return {
    main: cleanAnalysisText(parts[0]),
    advice: parts[1] ? cleanAnalysisText(parts[1]) : fallbackAdvice
  };
};

const DAILY_POSITIONS = ['Фокус дня', 'Чего остерегаться', 'Ключ к удаче дня'];


// Бесшовная фоновая заставка: два видео по очереди, перед концом одного
// второе плавно проявляется с начала, поэтому стыка и «замирания» нет.
const BG_FADE = 1.2;
function BackgroundLoop({ desktop, phone, desktopPoster, phonePoster }) {
  const refs = [useRef(null), useRef(null)];
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  useEffect(() => {
    const onR = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  const src = portrait ? phone : desktop;
  const poster = portrait ? phonePoster : desktopPoster;
  useEffect(() => {
    let raf = 0;
    let switching = false;
    const tick = () => {
      const cur = refs[activeRef.current].current;
      const nextIdx = activeRef.current === 0 ? 1 : 0;
      const nxt = refs[nextIdx].current;
      if (cur && nxt && cur.duration && !switching && cur.currentTime >= cur.duration - BG_FADE) {
        switching = true;
        try { nxt.currentTime = 0; } catch (e) {}
        const p = nxt.play();
        const go = () => {
          activeRef.current = nextIdx;
          setActive(nextIdx);
          setTimeout(() => { switching = false; }, BG_FADE * 1000 + 200);
        };
        if (p && p.then) p.then(go).catch(() => { switching = false; });
        else go();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  const st = (i) => ({
    position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -1,
    opacity: active === i ? 1 : 0, transition: `opacity ${BG_FADE}s linear`, pointerEvents: 'none'
  });
  return (
    <>
      <video id="bgVideoEl" ref={refs[0]} key={`a-${src}`} src={src} poster={poster} autoPlay muted playsInline preload="auto" style={st(0)} />
      <video ref={refs[1]} key={`b-${src}`} src={src} poster={poster} muted playsInline preload="metadata" style={st(1)} />
    </>
  );
}

export default function App() {
  const [view, setView] = useState('landing');
  const [arriveKey, setArriveKey] = useState(0); // мягкий выход из белой вспышки после двери
  const [errorMsg, setErrorMsg] = useState('');
  const [tableNoAlpha, setTableNoAlpha] = useState(false);

  // Расклад
  const [cards, setCards] = useState([]);
  const [revealed, setRevealed] = useState([]);
  const [question, setQuestion] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [mainAdvice, setMainAdvice] = useState('');
  const [yesNoVerdict, setYesNoVerdict] = useState('');
  const [readingMode, setReadingMode] = useState('standard');
  const [loading, setLoading] = useState(false);
  const [currentReading, setCurrentReading] = useState(null);
  const yesNoCount = 1; // «Да или Нет» — всегда 1 карта
  const [memoOpen, setMemoOpen] = useState(false);

  // Уточнения
  const [followUps, setFollowUps] = useState([]);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [pendingFollowUp, setPendingFollowUp] = useState(null);
  const [followUpError, setFollowUpError] = useState('');

  // История
  const { history, saveReading, deleteReading } = useTarotHistory();
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  // Музыка (плеер теперь живёт всё время и не пересоздаётся при смене раздела)
  const [musicPlaying, setMusicPlaying] = useState(false);
  const bgmRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const wasPlayingBeforeHideRef = useRef(false);

  const tableVideoRef = useRef(null);
  const stageRef = useRef(null);
  const analysisSectionRef = useRef(null);

  const pauseAllMusic = () => {
    wasPlayingBeforeHideRef.current = false;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    if (bgmRef.current && !bgmRef.current.paused) bgmRef.current.pause();
    setMusicPlaying(false);
  };

  const sound = useSoundEngine({ beforeStart: pauseAllMusic });
  const sleepLeft = useTimerLeft(sound.timerEndsAt);
  // eslint-disable-next-line no-unused-vars
  const dreams = useDreams({ onError: setErrorMsg }); // экраны «Снов» подключаются на шагах 6–7

  // Предзагрузка: сначала кадры зала (вход без мигания), карты — потом, понемногу,
  // чтобы не мешать загрузке первого экрана
  useEffect(() => {
    let cancelled = false;
    const dev = window.innerHeight > window.innerWidth ? 'ph' : 'pc';
    const t1 = setTimeout(() => {
      ['tarot', 'sounds', 'dreams'].forEach((k) => {
        const img = new Image();
        img.src = `/hall/${dev}-hall-${k}.webp?v=7`;
      });
    }, 1200);
    const t2 = setTimeout(async () => {
      for (let i = 0; i < DECK.length; i += 6) {
        if (cancelled) break;
        await Promise.all(DECK.slice(i, i + 6).map(preloadSingleCard));
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Safari/iPhone не умеют прозрачное видео — показываем картинку
  useEffect(() => {
    const ua = navigator.userAgent || '';
    const webkitOnly =
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ||
      (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua));
    const v = document.createElement('video');
    const canVp9 = v.canPlayType && v.canPlayType('video/webm; codecs="vp9"');
    if (webkitOnly || !canVp9) setTableNoAlpha(true);
  }, []);

  // Запускаем только фоновые видео (видео Зала Дверей управляются самим залом)
  const startAllBackgroundVideos = () => {
    try {
      const list = [document.getElementById('bgVideoEl'), tableVideoRef.current, ...document.querySelectorAll('.tarot-stage video, .cloud-backdrop video')];
      list.forEach((v) => {
        if (!v) return;
        v.muted = true;
        v.defaultMuted = true;
        v.playsInline = true;
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        if (v.paused) v.play().catch(() => {});
      });
    } catch (e) {}
  };

  useEffect(() => {
    startAllBackgroundVideos();
    const t = setTimeout(startAllBackgroundVideos, 250);
    const onTouch = () => startAllBackgroundVideos();
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('click', onTouch, { passive: true });
    window.scrollTo(0, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('click', onTouch);
    };
  }, [view]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (bgmRef.current && !bgmRef.current.paused) {
          wasPlayingBeforeHideRef.current = true;
          if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          bgmRef.current.pause();
        }
      } else {
        if (wasPlayingBeforeHideRef.current && musicPlaying && bgmRef.current) {
          wasPlayingBeforeHideRef.current = false;
          bgmRef.current.play().catch(() => {});
        }
        startAllBackgroundVideos();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [musicPlaying]);

  const startMusicWithFade = () => {
    startAllBackgroundVideos();
    const a = bgmRef.current;
    if (!a) return;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    a.volume = 0;
    a.play()
      .then(() => {
        setMusicPlaying(true);
        let v = 0;
        fadeIntervalRef.current = setInterval(() => {
          v = Math.min(0.6, +(v + 0.03).toFixed(2));
          if (bgmRef.current) bgmRef.current.volume = v;
          if (v >= 0.6) clearInterval(fadeIntervalRef.current);
        }, 100);
      })
      .catch(() => setMusicPlaying(false));
  };

  const toggleMusic = () => {
    startAllBackgroundVideos();
    if (!musicPlaying) startMusicWithFade();
    else pauseAllMusic();
  };

  const enterSpace = () => {
    startAllBackgroundVideos();
    playCardFlipSound(0);
    startMusicWithFade();
    setView('transition');
    setTimeout(() => setView('doors'), 950);
  };

  // --- РАСКЛАД ---
  const performReading = async (currentQuestion, mode = 'standard') => {
    if (loading) return;
    setErrorMsg('');
    setReadingMode(mode);
    setYesNoVerdict('');

    let actualQuestion;
    if (mode === 'yesno') actualQuestion = currentQuestion.trim() || 'Сбудется ли задуманное мной в ближайшее время?';
    else if (mode === 'daily') actualQuestion = 'Совет карт на сегодняшний день';
    else actualQuestion = currentQuestion.trim() || 'Сделай общий анализ моей ситуации на сегодня.';

    const cardCount = mode === 'yesno' ? yesNoCount : mode === 'daily' ? 3 : 5;
    const selected = drawCards(cardCount);
    const newId = Date.now();

    setCurrentReading({ id: newId, question: actualQuestion, mode });
    setCards(selected);
    setRevealed(new Array(cardCount).fill(false));
    setAnalysis('');
    setMainAdvice('');
    setFollowUps([]);
    setFollowUpInput('');
    setPendingFollowUp(null);
    setFollowUpError('');
    setLoading(true);
    selected.forEach(preloadSingleCard);

    // Автоскролл к картам
    scrollToEl(stageRef, 'center', 60);

    const step = mode === 'standard' ? 190 : 140;
    for (let i = 0; i < cardCount; i++) {
      setTimeout(() => {
        playCardFlipSound(i);
        setRevealed((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, 450 + i * step);
    }

    try {
      let main;
      let advice;
      let verdict = '';
      if (mode === 'yesno') {
        const { finalVerdict, breakdown } = computeYesNoVerdictFromCards(selected);
        verdict = finalVerdict;
        const cardsList = selected
          .map((c, i) => `${i + 1}. ${c.name}${cardCount === 3 && i === 1 ? ' (центр)' : ''} — [${breakdown[i].label}]`)
          .join('\n');
        const raw = await requestDeepTarotLLM({
          fastMode: true,
          systemPrompt: `Ты — точный таролог-эзотерик по системе Райдера–Уэйта. Отвечаешь о том, о ком или о чём задан вопрос, без оговорок, нравоучений и психологии. Дай БЫСТРЫЙ, ЧЁТКИЙ И КРАТКИЙ разбор расклада «ДА / НЕТ / НЕЯСНО» на ${cardCount === 1 ? '1 карте' : '3 картах'}.
ПРАВИЛА:
- Максимум 3–4 коротких, ёмких предложения (без воды, без длинных вступлений, без решеток ###).
- Опирайся строго на классическую таблицу значений «Да / Нет / Неясно» и суть вопроса.
- Если ответ не однозначный, кратко объясни скрытое условие через символику аркана («да, если…», «пока не время, потому что…»).
- Называй карты их полными названиями.
- В конце добавь строку "ГЛАВНЫЙ СОВЕТ:" и напиши 1–2 коротких конкретных действия.`,
          prompt: `ВОПРОС: "${actualQuestion}"
ИТОГОВЫЙ ВЕРДИКТ ПО ТАБЛИЦЕ: ${finalVerdict}
ВЫПАВШИЕ КАРТЫ И ИХ ЗНАЧЕНИЯ ПО ТАБЛИЦЕ:
${cardsList}

Напиши чёткое, краткое объяснение по сути вопроса (3-4 предложения) и в конце "ГЛАВНЫЙ СОВЕТ:".`
        });
        ({ main, advice } = splitAdvice(raw, '1. Опирайся на ключевой знак карты.\n2. Действуй без лишних сомнений.'));
      } else if (mode === 'daily') {
        const raw = await requestDeepTarotLLM({
          fastMode: true,
          systemPrompt: `Ты — точный таролог-эзотерик по системе Райдера–Уэйта, без оговорок, нравоучений и психологии. Сделай быстрый расклад «Совет на сегодня» на 3 картах.
ПРАВИЛА:
- По 1–2 живых предложения на каждую позицию, без воды и без решеток ###.
- Называй карты их полными названиями.
- В конце добавь строку "ГЛАВНЫЙ СОВЕТ:" и напиши 1–2 конкретных действия на сегодня.`,
          prompt: `РАСКЛАД «СОВЕТ НА СЕГОДНЯ»:
1. ${DAILY_POSITIONS[0]}: ${selected[0].name}
2. ${DAILY_POSITIONS[1]}: ${selected[1].name}
3. ${DAILY_POSITIONS[2]}: ${selected[2].name}

Расскажи, на чём сосредоточиться сегодня, чего остерегаться и что принесёт удачу. В конце "ГЛАВНЫЙ СОВЕТ:".`
        });
        ({ main, advice } = splitAdvice(raw, '1. Начни день с самого важного дела.\n2. Вечером подведи итог: что сегодня получилось.'));
      } else {
        const raw = await requestDeepTarotLLM({
          systemPrompt: TAROT_DEEP_SYSTEM,
          prompt: `ВОПРОС: «${actualQuestion}»

Расклад на 5 карт (слева направо), все позиции относятся к тому, о ком или о чём задан вопрос:
${positionsList(selected)}

Прочитай, что карты говорят по этому вопросу, и сделай глубокий профессиональный разбор.`
        });
        ({ main, advice } = splitAdvice(raw, '1. Составь четкий план действий на ближайшие 3 дня.\n2. Заверши одно важное начатое дело сегодня вечером.'));
      }

      setYesNoVerdict(verdict);
      setAnalysis(main);
      setMainAdvice(advice);
      setRevealed(new Array(cardCount).fill(true));

      const readingObj = {
        id: newId,
        date: nowRuDate(),
        question:
          mode === 'yesno' ? `[Да / Нет] ${actualQuestion}` : mode === 'daily' ? '[Совет на сегодня]' : actualQuestion,
        mode,
        verdict,
        cards: selected,
        analysis: main,
        advice,
        followUps: []
      };
      setCurrentReading(readingObj);
      saveReading(readingObj);

      // Автоскролл к готовому ответу
      scrollToEl(analysisSectionRef, 'start', 250);
    } catch (err) {
      setErrorMsg(`Преграда сети: ${err.message}`);
      scrollToEl('errorBox', 'center', 100);
    }
    setLoading(false);
  };

  // --- УТОЧНЯЮЩИЙ ВОПРОС ---
  const askFollowUpQuestion = async (isHistoryView = false) => {
    const qText = followUpInput.trim();
    if (!qText || followUpLoading) return;

    const target = isHistoryView ? selectedHistoryItem : { ...currentReading, followUps };
    if (!target || !target.cards || !target.cards.length) return;

    const usedCodes = new Set(target.cards.map((c) => c.code));
    (target.followUps || []).forEach((fu) => (fu.cards || []).forEach((c) => usedCodes.add(c.code)));
    const available = DECK.filter((c) => !usedCodes.has(c.code));
    const fuCards = drawCards(5, available.length >= 5 ? available : DECK);
    fuCards.forEach(preloadSingleCard);

    const entryId = Date.now();
    setFollowUpLoading(true);
    setFollowUpError('');
    setFollowUpInput('');
    setPendingFollowUp({ id: entryId, q: qText, cards: fuCards });
    for (let i = 0; i < 5; i++) setTimeout(() => playCardFlipSound(i), 300 + i * 120);

    scrollToEl('fu-pending', 'center', 120);

    try {
      const thread = (target.followUps || [])
        .map((it, idx) => {
          const cs = it.cards && it.cards.length ? `\nВыпавшие карты уточнения: ${it.cards.map((c) => c.name).join(', ')}` : '';
          return `Уточнение ${idx + 1}: "${it.q}"${cs}\nОтвет таролога: "${it.a}"`;
        })
        .join('\n\n');

      const raw = await requestDeepTarotLLM({
        systemPrompt: TAROT_FOLLOWUP_SYSTEM,
        prompt: `КОНТЕКСТ ВЕТКИ РАСКЛАДА (БАЗОВЫЙ РАСКЛАД):
- Исходный вопрос: "${target.question}"
- Базовые карты: ${target.cards.map((c, i) => `${i + 1}. ${c.name}`).join(', ')}
- Первичный анализ расклада: ${target.analysis}
- Главный совет базового расклада: ${target.advice}
${thread ? `\nПредыдущие уточнения в этой ветке:\n${thread}\n` : ''}
НОВЫЙ УТОЧНЯЮЩИЙ ВОПРОС ПОЛЬЗОВАТЕЛЯ: "${qText}"
НОВЫЕ 5 КАРТ, ВЫПАВШИЕ НА ЭТО УТОЧНЕНИЕ (слева направо):
1. ${fuCards[0].name}
2. ${fuCards[1].name}
3. ${fuCards[2].name} (центр, суть ответа)
4. ${fuCards[3].name}
5. ${fuCards[4].name}

Прочитай, что новые карты отвечают на уточняющий вопрос, с учётом всей ветки расклада.`
      });
      const answer = cleanAnalysisText(raw);
      if (!answer) throw new Error('Пустой ответ');

      const updatedFollowUps = [...(target.followUps || []), { id: entryId, q: qText, cards: fuCards, a: answer }];
      const updatedItem = { ...target, followUps: updatedFollowUps };
      if (isHistoryView) {
        setSelectedHistoryItem(updatedItem);
      } else {
        setFollowUps(updatedFollowUps);
        setCurrentReading(updatedItem);
      }
      setPendingFollowUp(null);
      saveReading(updatedItem);

      scrollToEl(`fu-ans-${entryId}`, 'start', 200);
    } catch (err) {
      setPendingFollowUp(null);
      setFollowUpInput(qText);
      setFollowUpError(`Не удалось получить ответ: ${err.message}`);
    }
    setFollowUpLoading(false);
  };

  const renderFollowUpSection = (items, isHistoryView, baseCards) => (
    <div className="glass-panel text-font" style={{ marginTop: '2rem' }}>
      <h3 className="mystic-font" style={{ color: '#ffe3a8', margin: '0 0 14px', textAlign: 'center' }}>
        Уточняющий вопрос
      </h3>
      {(items || []).map((fu) => (
        <div key={fu.id} style={{ marginBottom: '22px', paddingBottom: '18px', borderBottom: '1px solid rgba(229,176,92,0.3)' }}>
          <div className="mystic-font" style={{ color: '#e5b05c', marginBottom: '10px', fontSize: '1.15rem', textAlign: 'center' }}>✦ {fu.q}</div>
          <div className="fu-cards-row">
            {(fu.cards || []).map((c, i) => (
              <div key={i} className="fu-card" style={{ animationDelay: `${i * 0.08}s` }}>
                <TarotCardImage card={c} />
                <span>{c.name}</span>
              </div>
            ))}
          </div>
          <div
            id={`fu-ans-${fu.id}`}
            className="readable-analysis-text"
            dangerouslySetInnerHTML={{ __html: formatReadableText(fu.a, [...(baseCards || []), ...(fu.cards || [])]) }}
          />
        </div>
      ))}

      {pendingFollowUp && (
        <div id="fu-pending" style={{ marginBottom: '22px', scrollMarginTop: '20px' }}>
          <div className="mystic-font" style={{ color: '#e5b05c', marginBottom: '10px', fontSize: '1.15rem', textAlign: 'center' }}>✦ {pendingFollowUp.q}</div>
          <div className="fu-cards-row">
            {pendingFollowUp.cards.map((c, i) => (
              <div key={c.code} className="fu-card" style={{ animationDelay: `${0.3 + i * 0.12}s` }}>
                <TarotCardImage card={c} />
                <span>{c.name}</span>
              </div>
            ))}
          </div>
          <div className="decoding-label mystic-font">
            Расшифровываю<span className="dots" />
          </div>
        </div>
      )}

      {followUpError && (
        <div style={{ background: 'rgba(110, 24, 24, 0.85)', color: '#fff', padding: '12px 16px', borderRadius: '12px', marginBottom: '14px', border: '1px solid #ff6b6b', textAlign: 'center' }}>
          {followUpError}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          className="text-font"
          type="text"
          placeholder="Задай уточняющий вопрос картам"
          value={followUpInput}
          onChange={(e) => setFollowUpInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') askFollowUpQuestion(isHistoryView);
          }}
          style={{ flex: 1, minWidth: 0, padding: '14px 18px', borderRadius: '14px', border: '1px solid rgba(229,176,92,0.75)', background: 'rgba(6,3,18,0.82)', color: '#f8f1e5', fontSize: '1.15rem', outline: 'none' }}
        />
        <button onClick={() => askFollowUpQuestion(isHistoryView)} disabled={followUpLoading} className="btn-magical" style={{ padding: '0 20px', display: 'flex', alignItems: 'center' }}>
          {followUpLoading ? '…' : <Send size={18} />}
        </button>
      </div>
    </div>
  );

  const readingTitle = (mode) =>
    mode === 'yesno' ? 'Краткий ответ карт' : mode === 'daily' ? 'Совет на сегодня' : 'Анализ расклада';

  const renderVerdictAnalysisAdvice = (item, title) => (
    <>
      {item.verdict && (
        <div className="glass-panel" style={{ marginBottom: '20px', textAlign: 'center', border: '2px solid #ffe3a8', background: 'linear-gradient(135deg, rgba(44, 18, 86, 0.94), rgba(112, 76, 24, 0.94))' }}>
          <div className="mystic-font" style={{ fontSize: '1rem', color: '#e5b05c', letterSpacing: '3px', marginBottom: '6px' }}>ОТВЕТ АРКАНОВ «ДА ИЛИ НЕТ»</div>
          <div className="mystic-font" style={{ fontSize: 'clamp(1.8rem, 4.5vw, 2.7rem)', color: '#ffe3a8', textShadow: '0 0 25px rgba(229,176,92,0.9)' }}>{item.verdict}</div>
        </div>
      )}
      <div className="glass-panel text-font">
        <h3 className="mystic-font" style={{ color: '#ffe3a8', margin: '0 0 18px 0', fontSize: 'clamp(1.65rem, 3.8vw, 2.2rem)', borderBottom: '1px solid rgba(229,176,92,0.45)', paddingBottom: '12px', textAlign: 'center' }}>
          {title}
        </h3>
        <div className="readable-analysis-text" dangerouslySetInnerHTML={{ __html: formatReadableText(item.analysis, item.cards) }} />
      </div>
      {item.advice && (
        <div className="advice-cloud-box text-font">
          <div className="mystic-font" style={{ fontSize: 'clamp(1.45rem, 3.2vw, 1.85rem)', color: '#ffe3a8', marginBottom: '14px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px' }}>Главный совет</div>
          <div className="readable-analysis-text" style={{ textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: formatReadableText(item.advice, item.cards) }} />
        </div>
      )}
    </>
  );

  const backBtn = (label, onClick, icon = <DoorOpen size={18} />) => (
    <button onClick={onClick} className="btn-magical text-font" style={{ padding: '10px 16px', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.98rem', flexShrink: 0 }}>
      {icon}
      <span>{label}</span>
    </button>
  );

  // Общий слой: фон, музыка, плеер. Рисуется ОДИН раз и не пересоздаётся при смене раздела.
  const renderBackgroundLayer = () => (
    <>
      <style>{globalStyles}</style>
      <style>{layoutFixStyles}</style>
      <div
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: -1, pointerEvents: 'none', background: 'radial-gradient(circle at 50% 40%, #241445 0%, #120924 60%, #070312 100%)' }}
        >
        <BackgroundLoop desktop={mediaUrls.desktopMp4} phone={mediaUrls.phoneMp4} desktopPoster={mediaUrls.desktopPoster} phonePoster={mediaUrls.phonePoster} />
      </div>
      <audio ref={bgmRef} src={mediaUrls.bgmMp3} loop preload="none" />
      <audio ref={sound.customSoundAudioRef} preload="none" />
      <audio ref={sound.guideAudioRef} preload="none" />

      {sound.activeAudioTrack && (
        <div style={{ position: 'fixed', left: '12px', bottom: '16px', zIndex: 55, background: 'linear-gradient(135deg, rgba(10, 34, 40, 0.95), rgba(40, 30, 80, 0.95))', border: '1.5px solid #5eead4', borderRadius: '26px', padding: '8px 10px 8px 14px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.85), 0 0 18px rgba(94,234,212,0.3)', maxWidth: 'calc(100vw - 90px)' }}>
          <div onClick={() => view !== 'sounds' && setView('sounds')} title="Открыть Звуки" style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, cursor: view !== 'sounds' ? 'pointer' : 'default' }}>
            <Waves size={20} color="#99f6e4" style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div className="mystic-font" style={{ color: '#ccfbf1', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sound.activeAudioTrack.title}</div>
              <div className="text-font" style={{ color: '#b6cfd2', fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {sound.paused ? 'пауза' : sound.activeAudioTrack.subtitle}{sleepLeft ? ` • ⏾ ${sleepLeft}` : ''}
              </div>
            </div>
          </div>
          <button onClick={sound.togglePause} title={sound.paused ? 'Продолжить' : 'Пауза'} style={{ background: 'rgba(94,234,212,0.18)', border: '1px solid #5eead4', color: '#ccfbf1', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            {sound.paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <button onClick={sound.stopSoundEngine} title="Выключить" style={{ background: 'rgba(229,176,92,0.2)', border: '1px solid #e5b05c', color: '#ffe3a8', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {!musicPlaying && !sound.activeAudioTrack && (
        <div onClick={toggleMusic} className="music-hint-badge mystic-font">
          <span>Нажми</span>
          <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>➔</span>
        </div>
      )}
      <button id="musicBtn" onClick={toggleMusic}>{musicPlaying ? '♪' : <VolumeX size={20} />}</button>
    </>
  );

  const renderTarotMemo = () => (
    <div className="glass-panel text-font" style={{ maxWidth: '880px', margin: '0 auto 1.1rem auto', padding: '14px 20px', fontSize: '1.12rem', color: '#e8dcf7', textAlign: 'center' }}>
      <div>
        Сформулируй чёткий запрос: выбери глубокий <strong style={{ color: '#ffe3a8' }}>расклад на 5 карт</strong>, <strong style={{ color: '#ffe3a8' }}>Совет на сегодня</strong> или быстрый вердикт <strong style={{ color: '#ffe3a8' }}>Да или Нет</strong>.
      </div>
      <button className="tarot-memo-toggle mystic-font" style={{ marginTop: '10px' }} onClick={() => setMemoOpen((o) => !o)}>
        Памятка: как спрашивать и читать карты
        <ChevronDown size={18} style={{ transition: 'transform 0.3s', transform: memoOpen ? 'rotate(180deg)' : 'none' }} />
      </button>
      {memoOpen && (
        <div className="tarot-memo-body">
          <h4 className="mystic-font">Как сформулировать намерение</h4>
          <ul>
            <li>Спрашивай о себе и своих действиях, а не о мыслях другого человека: «Что мне важно понять в отношениях с N?»</li>
            <li>Для глубокого расклада лучше открытые вопросы: «как», «что», «в чём причина».</li>
            <li>Для «Да или Нет» — один закрытый вопрос и срок: «Получу ли я это предложение до конца месяца?»</li>
            <li>Перед раскладом сделай вдох, удержи вопрос в голове несколько секунд и только потом нажимай кнопку.</li>
          </ul>
          <h4 className="mystic-font">Как читать связки арканов</h4>
          <ul>
            <li>Центральная карта — ядро ситуации, остальные раскрывают её с разных сторон.</li>
            <li>Много Старших арканов — дело судьбоносное, многое решается не только тобой.</li>
            <li>Масти подсказывают сферу: Жезлы — действие и воля, Кубки — чувства, Мечи — мысли и конфликты, Пентакли — деньги, тело, быт.</li>
            <li>Соседние карты усиливают или смягчают друг друга: светлая рядом с тяжёлой показывает выход.</li>
            <li>Повторяющиеся числа и масти — главный акцент расклада.</li>
          </ul>
        </div>
      )}
    </div>
  );

  // --- ЭКРАНЫ ---
  const renderScreen = () => {
    // ЭКРАН 1: ВХОД
    if (view === 'landing' || view === 'transition') {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', width: 'min(98vw, 900px)', minHeight: '340px', aspectRatio: '16 / 10', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'clamp(1.4rem, 4vw, 3.5rem)', animation: view === 'transition' ? 'disperse 0.95s forwards' : 'tarot-sway 6s ease-in-out infinite' }}>
            <RealCloudBackdrop tableNoAlpha={tableNoAlpha} cloudWebmUrl={mediaUrls.adviceCloudWebm} cloudWebpUrl={mediaUrls.tableWebp} />
            <h1 className="mystic-font" style={{ fontSize: 'clamp(1.85rem, 5.2vw, 3.6rem)', color: '#ffe3a8', margin: '0 0 10px 0', lineHeight: 1.15, textShadow: '0 4px 18px rgba(18, 8, 38, 0.98), 0 0 30px rgba(229, 176, 92, 0.9)' }}>
              Магическое пространство ответов
            </h1>
            <p className="text-font" style={{ fontSize: 'clamp(1.15rem, 2.8vw, 1.6rem)', color: '#f5ecff', margin: '0 0 26px 0', letterSpacing: '2.5px' }}>by.Flox</p>
            <button onClick={enterSpace} className="text-font btn-magical" style={{ padding: '16px 42px', fontSize: 'clamp(1.05rem, 2.8vw, 1.38rem)', animation: 'pulse-gold 3.2s infinite' }}>
              Войти в пространство
            </button>
          </div>
        </div>
      );
    }

    // ЭКРАН 2: ЗАЛ ДВЕРЕЙ
    if (view === 'doors') {
      return (
        <DoorHall
          onEnter={(id) => {
            setArriveKey(Date.now());
            setView(id);
          }}
        />
      );
    }

    // ЭКРАН 3: ЗВУКИ (шаг 5)
    if (view === 'sounds') {
      return (
        <div style={{ minHeight: '100vh', padding: '55px 16px 110px', position: 'relative' }}>
          <div style={{ maxWidth: '1020px', margin: '0 auto', zIndex: 2, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }}>
              {backBtn('В Зал Дверей', () => setView('doors'))}
              <h1 className="mystic-font" style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.7rem)', color: '#99f6e4', margin: 0, textShadow: '0 0 24px rgba(94, 234, 212, 0.65)' }}>Святилище Звука</h1>
              <div style={{ width: '120px' }} />
            </div>
            <SoundsSection sound={sound} />
          </div>
        </div>
      );
    }

    // ЭКРАН 4: СНЫ (строится на шагах 6–7)
    if (view === 'dreams') {
      return (
        <div style={{ minHeight: '100vh', padding: '55px 16px 95px', position: 'relative' }}>
          <div style={{ maxWidth: '1020px', margin: '0 auto', zIndex: 2, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', gap: '10px', flexWrap: 'wrap' }}>
              {backBtn('В Зал Дверей', () => setView('doors'))}
              <h1 className="mystic-font" style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.7rem)', color: '#c4b5fd', margin: 0, textShadow: '0 0 24px rgba(167, 139, 250, 0.7)' }}>Обитель Снов и Астрала</h1>
              <div style={{ width: '120px' }} />
            </div>
            <div className="glass-panel text-font">Раздел в разработке: Дневник снов и Курс осознанных сновидений появятся на шагах 6–7.</div>
          </div>
        </div>
      );
    }

    // ЭКРАН 5: ИСТОРИЯ
    if (view === 'history') {
      return (
        <div style={{ minHeight: '100vh', padding: '55px 16px 95px', position: 'relative' }}>
          <div style={{ maxWidth: '880px', margin: '0 auto', zIndex: 2, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', gap: '10px' }}>
              {backBtn('К столу', () => setView('table'), <ChevronLeft size={18} />)}
              <h1 className="mystic-font" style={{ fontSize: 'clamp(1.5rem, 4.5vw, 2.6rem)', color: '#ffe3a8', margin: 0, textAlign: 'center', minWidth: 0, textShadow: '0 0 24px rgba(229,176,92,0.8)' }}>История раскладов</h1>
              <div style={{ width: '40px' }} />
            </div>
            {history.length === 0 && <div className="glass-panel text-font" style={{ textAlign: 'center', fontSize: '1.2rem' }}>Здесь пока пусто. Сделай первый расклад на Столе судьбы.</div>}
            {history.map((item) => (
              <div
                key={item.id}
                className="glass-panel text-font history-item"
                onClick={() => {
                  setSelectedHistoryItem(item);
                  setFollowUpInput('');
                  setFollowUpError('');
                  setPendingFollowUp(null);
                  setView('historyItem');
                }}
                style={{ marginBottom: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#e5b05c', fontSize: '0.95rem' }}>{item.date}{item.verdict ? ` • ${item.verdict}` : ''}</div>
                  <div className="mystic-font" style={{ color: '#fff8eb', fontSize: '1.15rem', margin: '4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.question}</div>
                  <div style={{ color: '#d8c8eb', fontSize: '0.95rem' }}>
                    {(item.cards || []).map((c) => c.name).join(' • ')}
                    {item.followUps && item.followUps.length ? ` • уточнений: ${item.followUps.length}` : ''}
                  </div>
                </div>
                <button
                  className="trash-btn"
                  title="Удалить"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteReading(item.id);
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ЭКРАН 6: ОДИН РАСКЛАД ИЗ ИСТОРИИ
    if (view === 'historyItem' && selectedHistoryItem) {
      const item = selectedHistoryItem;
      return (
        <div style={{ minHeight: '100vh', padding: '55px 16px 95px', position: 'relative' }}>
          <div style={{ maxWidth: '880px', margin: '0 auto', zIndex: 2, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '10px' }}>
              {backBtn('История', () => setView('history'), <ChevronLeft size={18} />)}
              <button
                className="trash-btn"
                title="Удалить"
                onClick={() => {
                  deleteReading(item.id);
                  setSelectedHistoryItem(null);
                  setView('history');
                }}
              >
                <Trash2 size={18} />
              </button>
            </div>
            <div className="glass-panel text-font" style={{ marginBottom: '18px', textAlign: 'center' }}>
              <div style={{ color: '#e5b05c' }}>{item.date}</div>
              <h2 className="mystic-font" style={{ color: '#ffe3a8', margin: '6px 0 14px' }}>{item.question}</h2>
              <div className="fu-cards-row">
                {(item.cards || []).map((c, i) => (
                  <div key={i} className="fu-card" style={{ animationDelay: `${i * 0.08}s`, maxWidth: '110px' }}>
                    <TarotCardImage card={c} />
                    <span>{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
            {renderVerdictAnalysisAdvice(item, readingTitle(item.mode))}
            {renderFollowUpSection(item.followUps, true, item.cards)}
          </div>
        </div>
      );
    }

    // ЭКРАН 7: СТОЛ СУДЬБЫ
    return (
      <div style={{ minHeight: '100vh', position: 'relative', padding: '58px 14px 85px' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto', zIndex: 2, position: 'relative' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '1.4rem' }}>
            {backBtn('Двери', () => setView('doors'))}
            <h1 className="mystic-font" style={{ fontSize: 'clamp(1.5rem, 4.8vw, 3rem)', color: '#ffe3a8', margin: 0, textAlign: 'center', minWidth: 0, letterSpacing: '2px', textShadow: '0 0 28px rgba(229,176,92,0.85)' }}>Стол судьбы</h1>
            {backBtn('История', () => setView('history'), <BookOpen size={19} />)}
          </header>

          {renderTarotMemo()}

          {errorMsg && (
            <div id="errorBox" style={{ background: 'rgba(110, 24, 24, 0.92)', color: '#fff', padding: '15px 20px', borderRadius: '14px', marginBottom: '20px', border: '1px solid #ff6b6b', textAlign: 'center' }}>
              {errorMsg}
            </div>
          )}

          <div className="glass-panel" style={{ maxWidth: '880px', margin: '0 auto 1.2rem auto' }}>
            <input
              className="text-font"
              type="text"
              placeholder="Задай сокровенный вопрос"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') performReading(question, 'standard');
              }}
              style={{ width: '100%', padding: '18px 20px', marginBottom: '18px', borderRadius: '16px', border: '1px solid rgba(229,176,92,0.75)', background: 'rgba(6, 3, 18, 0.82)', color: '#f8f1e5', fontSize: 'clamp(1.15rem, 2.5vw, 1.35rem)', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={() => performReading(question, 'standard')} disabled={loading} className="mystic-font btn-magical" style={{ flex: 2, minWidth: '200px', padding: '17px', fontSize: 'clamp(1.05rem, 2.4vw, 1.28rem)' }}>
                {loading && readingMode === 'standard' ? 'Расшифровываю...' : 'РАСКИНУТЬ КАРТЫ'}
              </button>
              <button onClick={() => performReading('', 'daily')} disabled={loading} className="text-font btn-magical" style={{ flex: 1, minWidth: '140px', padding: '17px', fontSize: 'clamp(1rem, 2.2vw, 1.18rem)', background: 'rgba(229,176,92,0.22)' }}>
                {loading && readingMode === 'daily' ? 'Расшифровываю...' : 'Совет на сегодня'}
              </button>
              <button onClick={() => performReading(question, 'yesno')} disabled={loading} className="mystic-font btn-magical" style={{ flex: 1, minWidth: '140px', padding: '17px', fontSize: 'clamp(1rem, 2.2vw, 1.18rem)', background: 'linear-gradient(135deg, rgba(64, 22, 110, 0.92), rgba(118, 72, 165, 0.92))', borderColor: '#c4b5fd' }}>
                {loading && readingMode === 'yesno' ? 'Спрашиваю...' : 'Да или Нет'}
              </button>
            </div>
          </div>

          <div ref={stageRef} className={`tarot-stage ${tableNoAlpha ? 'no-alpha' : ''}`}>
            <video ref={tableVideoRef} autoPlay muted loop playsInline preload="auto" onError={() => setTableNoAlpha(true)}>
              <source src={mediaUrls.tableWebm} type='video/webm; codecs="vp9"' />
            </video>
            <img className="fallback" src={mediaUrls.tableWebp} alt="Стол судьбы" />
            <div className="tarot-spread">
              {cards.map((card, index) => (
                <div key={`${card.code}-${index}`} className="spread-card-slot">
                  <div style={{ width: '100%', height: '100%', position: 'relative', transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)', transformStyle: 'preserve-3d', transform: revealed[index] ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                    <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', background: 'radial-gradient(circle at 50% 50%, #2c1d52, #120929)', border: '2px solid #e5b05c', borderRadius: '8px', boxShadow: '0 8px 20px rgba(0,0,0,0.85)' }} />
                    <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: '#0a0515', border: '2px solid #e5b05c', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 25px rgba(0,0,0,0.92)' }}>
                      <TarotCardImage card={card} style={{ width: '100%', height: '78%', objectFit: 'cover', display: 'block' }} />
                      <div className="text-font" style={{ height: '22%', background: 'rgba(10, 5, 21, 0.96)', color: '#ffe3a8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(0.5rem, 1.15vw, 0.82rem)', textAlign: 'center', fontWeight: 'bold', padding: '1px 3px', lineHeight: 1.05 }}>
                        {readingMode === 'daily' && currentReading?.mode === 'daily' ? `${DAILY_POSITIONS[index] || ''}: ${card.name}` : card.name}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {loading && (
            <div className="decoding-label mystic-font">
              Расшифровываю послание карт<span className="dots" />
            </div>
          )}

          <div ref={analysisSectionRef} style={{ maxWidth: '880px', margin: '0.5rem auto 0 auto', scrollMarginTop: '24px' }}>
            {analysis && currentReading && (
              <div>
                {renderVerdictAnalysisAdvice({ verdict: yesNoVerdict, analysis, advice: mainAdvice, cards }, readingTitle(readingMode))}
                {renderFollowUpSection(followUps, false, cards)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app-root">
      {renderBackgroundLayer()}
      {renderScreen()}
      {arriveKey > 0 && (
        <div
          key={arriveKey}
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none',
            background: 'radial-gradient(circle at 50% 45%, #ffffff 0%, #fffaf0 55%, #f3ecff 100%)',
            animation: 'arriveFade 0.6s ease-out forwards'
          }}
        />
      )}
      <style>{`@keyframes arriveFade { from { opacity: 1 } to { opacity: 0; visibility: hidden } }`}</style>
    </div>
  );
}
