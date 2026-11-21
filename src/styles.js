// Общие стили приложения
export const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Philosopher:wght@400;700&family=Cormorant+Unicase:wght@600;700&display=swap');
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: #160c28; color: #f8f1e5; overflow-x: hidden; }
  h1, h2, h3, .mystic-font { font-family: 'Philosopher', sans-serif; }
  p, .text-font, input, textarea, button { font-family: 'Cormorant Garamond', serif; }
  video::-webkit-media-controls { display: none !important; }

  #musicBtn {
    position: fixed; right: 18px; bottom: 18px; z-index: 50; width: 52px; height: 52px; border-radius: 50%;
    background: linear-gradient(135deg, rgba(42, 18, 76, 0.92), rgba(145, 104, 32, 0.92));
    border: 2px solid #e5b05c; color: #ffe6b3; font-size: 1.5rem; display: flex; align-items: center;
    justify-content: center; cursor: pointer; box-shadow: 0 0 25px rgba(229, 176, 92, 0.55); transition: all 0.3s ease;
  }
  #musicBtn:hover { transform: scale(1.08); box-shadow: 0 0 35px rgba(229, 176, 92, 0.9); }
  .music-hint-badge {
    position: fixed; right: 78px; bottom: 22px; z-index: 50; display: flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, rgba(32, 14, 62, 0.94), rgba(92, 60, 20, 0.94));
    border: 1.5px solid #e5b05c; color: #ffe3a8; padding: 8px 16px; border-radius: 30px; font-size: 1.1rem;
    font-weight: 700; cursor: pointer; box-shadow: 0 0 22px rgba(229, 176, 92, 0.55);
    animation: musicHintBob 1.8s ease-in-out infinite;
  }
  @keyframes musicHintBob { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-7px); } }

  /* ДВЕРИ */
  .doors-hall-grid {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(16px, 2.5vw, 30px);
    width: 100%; max-width: 1060px; margin: 0 auto; perspective: 1400px;
  }
  @media (max-width: 860px) { .doors-hall-grid { grid-template-columns: 1fr; max-width: 400px; } }
  .magic-door-portal {
    position: relative; height: clamp(320px, 46vh, 430px); border-radius: 150px 150px 22px 22px; cursor: pointer;
    perspective: 1200px; transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s ease; overflow: hidden;
  }
  .magic-door-portal:hover { transform: translateY(-8px) scale(1.02); }
  .magic-door-portal.entering { animation: doorEnterZoom 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards; z-index: 30; }
  .door-leaf-left, .door-leaf-right {
    position: absolute; top: 0; bottom: 0; width: 50%; transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
    z-index: 2; backface-visibility: hidden; background-size: 200% 100%;
  }
  .door-leaf-left { left: 0; background-position: left center; transform-origin: left center; border-right: 1px solid rgba(255, 227, 168, 0.35); }
  .door-leaf-right { right: 0; background-position: right center; transform-origin: right center; border-left: 1px solid rgba(255, 227, 168, 0.35); }
  .magic-door-portal:hover .door-leaf-left { transform: rotateY(-24deg); }
  .magic-door-portal:hover .door-leaf-right { transform: rotateY(24deg); }
  .magic-door-portal.entering .door-leaf-left { transform: rotateY(-105deg); }
  .magic-door-portal.entering .door-leaf-right { transform: rotateY(105deg); }
  @keyframes doorEnterZoom {
    0% { transform: scale(1); opacity: 1; filter: brightness(1); }
    60% { transform: scale(1.22); opacity: 1; filter: brightness(1.45); }
    100% { transform: scale(2.1); opacity: 0; filter: brightness(2.2); }
  }

  /* СТОЛ СУДЬБЫ */
  .tarot-stage {
    position: relative; width: 100%; max-width: 1120px; aspect-ratio: 1920 / 1098; margin: 0 auto;
    user-select: none; display: flex; align-items: center; justify-content: center; scroll-margin-top: 20px;
  }
  .tarot-stage video, .tarot-stage img.fallback {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; transform: translateX(1.3%);
  }
  .tarot-stage img.fallback { display: none; animation: tarot-sway 6s ease-in-out infinite; }
  .tarot-stage.no-alpha video { display: none; }
  .tarot-stage.no-alpha img.fallback { display: block; }
  @keyframes tarot-sway {
    0%, 100% { transform: translateY(0.6%) rotate(0deg); }
    25% { transform: translateY(0) rotate(0.4deg); }
    50% { transform: translateY(-0.6%) rotate(0deg); }
    75% { transform: translateY(0) rotate(-0.4deg); }
  }
  .tarot-spread { position: absolute; left: 50%; top: 49%; width: 46%; transform: translate(-50%, -50%); display: flex; gap: 1.8%; z-index: 5; justify-content: center; }
  .spread-card-slot { flex: 1 1 0; max-width: 19%; aspect-ratio: 1 / 1.72; perspective: 1100px; }

  @keyframes pulse-gold {
    0%, 100% { box-shadow: 0 0 25px rgba(229,176,92,0.5); transform: scale(1); }
    50% { box-shadow: 0 0 50px rgba(229,176,92,0.9); transform: scale(1.025); }
  }
  @keyframes disperse {
    0% { opacity: 1; transform: scale(1); filter: blur(0px); }
    100% { opacity: 0; transform: scale(1.75); filter: blur(24px); pointer-events: none; }
  }

  /* «Расшифровываю…» под картами */
  .decoding-label {
    text-align: center; color: #ffe3a8; font-size: clamp(1.15rem, 2.6vw, 1.5rem); letter-spacing: 2px;
    margin: 0.6rem auto 1rem; text-shadow: 0 0 18px rgba(229,176,92,0.85); animation: decodeGlow 1.6s ease-in-out infinite;
  }
  .decoding-label .dots::after { content: ''; animation: dotsAnim 1.4s steps(4, end) infinite; }
  @keyframes dotsAnim { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
  @keyframes decodeGlow { 0%, 100% { opacity: 0.65; } 50% { opacity: 1; } }

  /* Карты уточнения: переворот по очереди */
  .fu-cards-row { display: flex; gap: 8px; justify-content: center; margin: 6px 0 14px; }
  .fu-card { flex: 1 1 0; max-width: 92px; text-align: center; opacity: 0; animation: fuCardIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  .fu-card img { width: 100%; aspect-ratio: 1 / 1.6; object-fit: cover; border-radius: 7px; border: 1.5px solid #e5b05c; display: block; box-shadow: 0 6px 16px rgba(0,0,0,0.8); }
  .fu-card span { display: block; color: #ffe3a8; font-size: clamp(0.62rem, 1.6vw, 0.82rem); line-height: 1.1; margin-top: 5px; font-weight: 700; }
  @keyframes fuCardIn { 0% { opacity: 0; transform: rotateY(90deg) translateY(10px); } 100% { opacity: 1; transform: rotateY(0) translateY(0); } }

  /* Золотые названия карт в расшифровке */
  .card-name-gold { color: #ffd27a; font-weight: 700; text-shadow: 0 0 12px rgba(229,176,92,0.75); }

  .btn-magical {
    background: linear-gradient(135deg, rgba(48, 18, 88, 0.94), rgba(152, 110, 34, 0.94)); border: 1.5px solid #e5b05c;
    border-radius: 40px; color: #fff8eb; text-transform: uppercase; letter-spacing: 2.2px; transition: all 0.3s ease;
    cursor: pointer; text-shadow: 0 2px 5px rgba(0,0,0,0.85);
  }
  .btn-magical:hover:not(:disabled) { background: linear-gradient(135deg, #471e82, #c49029); transform: translateY(-2px); box-shadow: 0 10px 28px rgba(229,176,92,0.65); }
  .btn-magical:disabled { opacity: 0.65; cursor: wait; }

  .glass-panel {
    background: rgba(14, 8, 30, 0.86); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(229,176,92,0.52); border-radius: 26px;
    box-shadow: 0 25px 65px rgba(0,0,0,0.9), inset 0 0 28px rgba(229,176,92,0.14);
    padding: clamp(1.3rem, 3.5vw, 2.4rem); color: #f8f1e5; scroll-margin-top: 20px;
  }
  .advice-cloud-box {
    position: relative; background: linear-gradient(145deg, rgba(46, 20, 84, 0.92), rgba(96, 62, 28, 0.9));
    border: 2px solid #e5b05c; padding: clamp(1.6rem, 4vw, 2.6rem); border-radius: 36px;
    font-size: clamp(1.2rem, 2.5vw, 1.42rem); line-height: 1.7; color: #fff9f0; margin-top: 2.6rem;
    box-shadow: 0 0 50px rgba(229,176,92,0.4), inset 0 0 30px rgba(229,176,92,0.18);
  }
  .readable-analysis-text {
    color: #f8f1e5 !important; font-size: clamp(1.2rem, 2.4vw, 1.4rem); line-height: 1.85; letter-spacing: 0.2px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85); scroll-margin-top: 20px;
  }
  .trash-btn {
    background: rgba(140, 28, 38, 0.25); border: 1px solid rgba(255, 110, 110, 0.45); color: #ff9999; width: 42px; height: 42px;
    border-radius: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.25s ease; flex-shrink: 0;
  }
  .trash-btn:hover { background: rgba(200, 35, 50, 0.85); color: #ffffff; border-color: #ffcccc; transform: scale(1.06); }
  .history-item { cursor: pointer; transition: transform 0.25s ease, border-color 0.25s ease; }
  .history-item:hover { transform: translateY(-2px); border-color: #ffe3a8; }
`;
