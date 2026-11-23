// КАТАЛОГ ЗВУКОВ
// Синтезированные звуки убраны. Сюда добавляются только готовые записи, сгенерированные в хороших звуковых моделях.
// Файлы кладутся в папку media/sounds/ в корне репозитория.
export const SOUND_TABS = [
  { id: 'meditations', label: 'Медитации и ASMR' },
  { id: 'ambients', label: 'Эмбиенты' },
  { id: 'binaural', label: 'Бинауральные ритмы' }
];

export const SOUND_TRACKS = [
  {
    id: 'morning-golden-light',
    tab: 'meditations',
    title: 'Золотой свет дня',
    subtitle: 'Утренняя медитация • 10 мин',
    src: '/media/sounds/morning-golden-light.mp3?v=2',
    loop: false
  },
  {
    id: 'brain-spa',
    tab: 'meditations',
    title: 'Спа для мозга',
    subtitle: 'Перезагрузка и очищение ума • 10 мин',
    src: '/media/sounds/brain-spa.mp3?v=2',
    loop: false
  },
  {
    id: 'night-shore',
    tab: 'meditations',
    title: 'Ночной берег',
    subtitle: 'Для засыпания • 30 мин',
    comingSoon: true
  },
  {
    id: 'inner-temple',
    tab: 'meditations',
    title: 'Внутренний храм',
    subtitle: 'Глубокая практика • 60 мин',
    comingSoon: true
  },
  {
    id: 'inner-ground',
    tab: 'meditations',
    title: 'Возвращение внутренней опоры',
    subtitle: 'Глубокая практика • 60 мин',
    comingSoon: true
  }
];

export const SLEEP_TIMERS = [0, 15, 30, 45, 60, 90];
