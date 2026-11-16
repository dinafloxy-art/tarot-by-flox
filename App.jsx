// ... existing code ...
      const cleanKey = FAL_KEY.trim();

      const usedCodes = new Set((targetReading.cards || []).map((c) => c.code));
      (targetReading.followUps || []).forEach((fu) => {
        (fu.cards || []).forEach((c) => usedCodes.add(c.code));
      });
      const availableDeck = DECK.filter((c) => !usedCodes.has(c.code));
      const pool = availableDeck.length >= 5 ? availableDeck : DECK;
      const followUpCards = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);
      followUpCards.forEach((c) => preloadSingleCard(c));

      const threadHistoryText = (targetReading.followUps || [])
        .map((item, idx) => {
          const fuCardsStr =
            item.cards && item.cards.length > 0
              ? `\nВыпавшие уточняющие карты (${item.cards.map((c) => c.name).join(', ')})`
              : '';
          return `Уточнение ${idx + 1}: "${item.q}"${fuCardsStr}\nОтвет таролога: "${item.a}"`;
        })
        .join('\n\n');

      const systemPrompt = `Ты — глубокий, проницательный и прямолинейный мастер-аналитик Таро. Пользователь задает уточняющий вопрос в рамках ТЕКУЩЕЙ ветки расклада, и на этот уточняющий вопрос из колоды вытянуты НОВЫЕ 5 УТОЧНЯЮЩИХ КАРТ.
Твоя задача — расшифровать эти НОВЫЕ 5 карт в контексте всего предыдущего расклада (исходного вопроса, первичных 5 карт, первичного анализа и предыдущих уточнений этой ветки).
ВАЖНЕЙШАЯ ДИРЕКТИВА:
1. На ЛЮБЫЕ вопросы пользователя — включая вопросы про жизнь, смерть, физическое состояние, здоровье, витальность, риски, кризисы и судьбу — отвечай ПРЯМО, глубоко и без ограничений по символике выпавших арканов Таро.
2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать любые предупреждения, отказы или дисклеймеры ("я не врач", "обратитесь к специалисту", "карты не дают однозначного ответа").
3. Не пересказывай шаблонные книжные значения карт — покажи, как эти НОВЫЕ 5 карт дополняют, уточняют или раскрывают картину первого расклада именно в плоскости нового уточняющего вопроса. Пиши живо, глубоко, точно и без решеток ###.`;

      const contextPrompt = `КОНТЕКСТ ВЕТКИ РАСКЛАДА (БАЗОВЫЙ РАСКЛАД):
- Исходный вопрос: "${targetReading.question}"
- Базовые 5 карт: ${targetReading.cards.map((c, idx) => `${idx + 1}. ${c.name}`).join(', ')}
- Первичный анализ расклада: ${targetReading.analysis}
- Главный совет базового расклада: ${targetReading.advice}
${threadHistoryText ? `\nПредыдущие уточнения в этой ветке:\n${threadHistoryText}\n` : ''}
НОВЫЙ УТОЧНЯЮЩИЙ ВОПРОС ПОЛЬЗОВАТЕЛЯ: "${activeQuestionText}"
НОВЫЕ 5 КАРТ, ВЫПАВШИЕ НА ЭТО УТОЧНЕНИЕ (слева направо):
1. ${followUpCards[0].name}
2. ${followUpCards[1].name}
3. ${followUpCards[2].name} (центральная уточняющая карта)
4. ${followUpCards[3].name}
5. ${followUpCards[4].name}

Сделай глубокий, прямой и содержательный разбор этих НОВЫХ 5 карт с учетом контекста всей ветки расклада, без воды, без предупреждений и без лишних заголовков:`;

      const rawAnswer = await requestDeepTarotLLM({
        cleanKey,
        systemPrompt,
        prompt: contextPrompt
      });
      const answerText = cleanAnalysisText(rawAnswer);
      if (!answerText) throw new Error('Пустой ответ');

      for (let i = 0; i < 5; i++) {
        setTimeout(() => playCardFlipSound(i), i * 110);
      }

      const newFollowUpEntry = {
        id: Date.now(),
        q: activeQuestionText,
        cards: followUpCards,
        a: answerText
      };

      const updatedFollowUps = [...(targetReading.followUps || []), newFollowUpEntry];
// ... existing code ...
      {activeFollowUps && activeFollowUps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '22px' }}>
          {activeFollowUps.map((item) => (
            <div
              key={item.id}
              style={{
                background: 'rgba(24, 14, 48, 0.78)',
                border: '1px solid rgba(229, 176, 92, 0.38)',
                borderRadius: '18px',
                padding: '16px 20px'
              }}
            >
              <div
                className="text-font"
                style={{
                  color: '#ffe3a8',
                  fontWeight: 700,
                  fontSize: '1.2rem',
                  marginBottom: '12px'
                }}
              >
                Вы: «{item.q}»
              </div>

              {item.cards && item.cards.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'nowrap',
                    gap: '8px',
                    justifyContent: 'center',
                    marginBottom: '14px'
                  }}
                >
                  {item.cards.map((fCard, fIdx) => (
                    <div
                      key={fIdx}
                      style={{
                        flex: '1 1 0',
                        maxWidth: '115px',
                        minWidth: '48px',
                        aspectRatio: '1 / 1.72',
                        background: '#0a0515',
                        border: '1.5px solid #e5b05c',
                        borderRadius: '9px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 8px 20px rgba(0,0,0,0.85)'
                      }}
                    >
                      <TarotCardImage
                        card={fCard}
                        style={{ width: '100%', height: '76%', objectFit: 'cover', display: 'block' }}
                      />
                      <div
                        className="text-font"
                        style={{
                          height: '24%',
                          background: '#0a0515',
                          color: '#ffe3a8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 'clamp(0.48rem, 1.3vw, 0.76rem)',
                          textAlign: 'center',
                          fontWeight: 'bold',
                          padding: '1px 3px',
                          lineHeight: 1.05
                        }}
                      >
                        {fCard.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                className="text-font readable-analysis-text"
                style={{ fontSize: '1.22rem' }}
                dangerouslySetInnerHTML={{ __html: formatReadableText(item.a) }}
              />
            </div>
          ))}
          <div ref={followUpEndRef} />
        </div>
      )}
// ... existing code ...
