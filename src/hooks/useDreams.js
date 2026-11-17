import { useState } from 'react';
import { drawCards, preloadSingleCard } from '../data/deck';
import { LUCID_COURSE_STEPS } from '../data/course';
import { requestDeepTarotLLM } from '../lib/llm';
import { cleanAnalysisText, nowRuDate } from '../lib/text';
import { playCardFlipSound } from '../lib/audio';

const readLS = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
};
const writeLS = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
};

// Дневник снов, недельный психоанализ, курс ОС и ИИ-Наставник (экраны строятся на шагах 6–7)
export function useDreams({ onError } = {}) {
  const [dreamInput, setDreamInput] = useState('');
  const [dreamAnalyzing, setDreamAnalyzing] = useState(false);
  const [dreamsList, setDreamsList] = useState(() => {
    try {
      return JSON.parse(readLS('tarot_flox_dreams_v1', '[]'));
    } catch (e) {
      return [];
    }
  });
  const [weeklyPsychoReport, setWeeklyPsychoReport] = useState(() => readLS('tarot_flox_weekly_psycho_v1', ''));
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const [unlockedStep, setUnlockedStep] = useState(() => {
    const n = Number(readLS('tarot_flox_lucid_step_v1', '1'));
    return n >= 1 && n <= 7 ? n : 1;
  });
  const [activeCourseStep, setActiveCourseStep] = useState(1);
  const [stepExperienceNote, setStepExperienceNote] = useState('');
  const [mentorMessages, setMentorMessages] = useState([
    {
      id: 'welcome',
      role: 'mentor',
      text: 'Приветствую в лаборатории осознанных снов. Сейчас для тебя открыта Ступень 1. Выполни практику запоминания снов, запиши сон в «Дневник снов» и подтверди свой первый успех, чтобы открыть следующую дверь.'
    }
  ]);
  const [mentorInput, setMentorInput] = useState('');
  const [mentorLoading, setMentorLoading] = useState(false);

  const saveDreamsList = (list) => {
    setDreamsList(list);
    writeLS('tarot_flox_dreams_v1', JSON.stringify(list));
  };

  const runWeeklyDreamPsychoanalysis = async (seven = dreamsList.slice(0, 7)) => {
    if (seven.length < 7 || weeklyLoading) return;
    setWeeklyLoading(true);
    try {
      const digest = seven
        .map((d, i) => `Сон ${i + 1} (${d.date}): "${d.text}" | Карты: ${d.cards.map((c) => c.name).join(', ')}`)
        .join('\n\n');
      const report = await requestDeepTarotLLM({
        systemPrompt: `Ты — глубокий психоаналитик и исследователь сновидений. Перед тобой 7 снов пользователя за неделю и выпавшие к ним арканы Таро.
Проведи целостный еженедельный психоанализ характера сновидений. Пиши глубоко, бережно и точно, без решеток ###.`,
        prompt: `7 СНОВ ЗА НЕДЕЛЮ:\n\n${digest}`
      });
      const cleaned = cleanAnalysisText(report);
      setWeeklyPsychoReport(cleaned);
      writeLS('tarot_flox_weekly_psycho_v1', cleaned);
    } catch (err) {
      if (onError) onError(`Ошибка недельного психоанализа: ${err.message}`);
    }
    setWeeklyLoading(false);
  };

  const analyzeAndSaveDream = async () => {
    const text = dreamInput.trim();
    if (!text || dreamAnalyzing) return;
    setDreamAnalyzing(true);
    const dreamCards = drawCards(3);
    dreamCards.forEach(preloadSingleCard);
    for (let i = 0; i < 3; i++) setTimeout(() => playCardFlipSound(i), i * 130);
    try {
      const raw = await requestDeepTarotLLM({
        systemPrompt: `Ты — глубокий юнгианский психоаналитик сновидений и мастер символики Таро. Пользователь записал свой сон, и подсознание вытянуло 3 карты Таро.
Расшифруй образы сна через эти 3 карты живым, точным, глубоким языком без шаблонов и без решеток ###. В конце выдели 2–3 личных «Якоря осознанности» из этого сна.`,
        prompt: `ОПИСАНИЕ СНА ПОЛЬЗОВАТЕЛЯ:
"${text}"

ВЫПАВШИЕ 3 КАРТЫ ТАРО ДЛЯ ЭТОГО СНА:
1. ${dreamCards[0].name} (Скрытый смысл)
2. ${dreamCards[1].name} (Эмоциональный корень)
3. ${dreamCards[2].name} (Послание подсознания)

Сделай глубокий разбор сна через эти 3 аркана Таро:`
      });
      const newDream = { id: Date.now(), date: nowRuDate(), text, cards: dreamCards, interpretation: cleanAnalysisText(raw) };
      const updated = [newDream, ...dreamsList];
      saveDreamsList(updated);
      setDreamInput('');
      if (updated.length % 7 === 0) await runWeeklyDreamPsychoanalysis(updated.slice(0, 7));
    } catch (err) {
      if (onError) onError(`Ошибка анализа сна: ${err.message}`);
    }
    setDreamAnalyzing(false);
  };

  const deleteDreamEntry = (id) => saveDreamsList(dreamsList.filter((d) => d.id !== id));

  const confirmCourseStepSuccess = (stepNumber) => {
    playCardFlipSound(stepNumber % 5);
    const next = Math.min(7, Math.max(unlockedStep, stepNumber + 1));
    setUnlockedStep(next);
    writeLS('tarot_flox_lucid_step_v1', String(next));
    const note = stepExperienceNote.trim();
    const text =
      stepNumber < 7
        ? `Поздравляю! Ступень ${stepNumber} освоена${note ? ` («${note}»)` : ''}. Дверь в Ступень ${stepNumber + 1}: «${LUCID_COURSE_STEPS[stepNumber].title}» теперь открыта!`
        : 'Великолепно! Ты прошёл(ла) все 7 ступеней курса и освоил(а) навигацию в осознанных снах и астральных пространствах. Продолжай фиксировать путешествия в Дневнике снов.';
    if (stepNumber < 7) setActiveCourseStep(stepNumber + 1);
    setMentorMessages((prev) => [...prev, { id: Date.now(), role: 'mentor', text }]);
    setStepExperienceNote('');
  };

  const sendMentorQuestion = async () => {
    const qText = mentorInput.trim();
    if (!qText || mentorLoading) return;
    setMentorMessages((prev) => [...prev, { id: Date.now(), role: 'user', text: qText }]);
    setMentorInput('');
    setMentorLoading(true);
    try {
      const stepObj = LUCID_COURSE_STEPS[activeCourseStep - 1];
      const recent = dreamsList.slice(0, 3).map((d) => `- "${d.text.slice(0, 140)}..."`).join('\n');
      const reply = await requestDeepTarotLLM({
        systemPrompt: `Ты — опытный наставник по осознанным сновидениям (ОС), фазе и астральным путешествиям в пространстве by.Flox.
Ученик сейчас изучает Ступень ${activeCourseStep} из 7. Отвечай чётко, поддерживающе, без воды и без решеток ###.`,
        prompt: `ТЕКУЩАЯ СТУПЕНЬ УЧЕНИКА: Ступень ${activeCourseStep} — ${stepObj.title}.
${recent ? `ПОСЛЕДНИЕ СНЫ УЧЕНИКА ИЗ ДНЕВНИКА:\n${recent}\n` : ''}
ВОПРОС УЧЕНИКА: "${qText}"`
      });
      setMentorMessages((prev) => [...prev, { id: Date.now() + 1, role: 'mentor', text: cleanAnalysisText(reply) }]);
    } catch (err) {
      setMentorMessages((prev) => [...prev, { id: Date.now() + 1, role: 'mentor', text: `Связь прервалась: ${err.message}` }]);
    }
    setMentorLoading(false);
  };

  return {
    dreamInput, setDreamInput, dreamAnalyzing, dreamsList,
    weeklyPsychoReport, weeklyLoading,
    analyzeAndSaveDream, runWeeklyDreamPsychoanalysis, deleteDreamEntry,
    unlockedStep, activeCourseStep, setActiveCourseStep,
    stepExperienceNote, setStepExperienceNote, confirmCourseStepSuccess,
    mentorMessages, mentorInput, setMentorInput, mentorLoading, sendMentorQuestion
  };
}
