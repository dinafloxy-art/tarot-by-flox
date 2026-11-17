import React, { useState, useEffect } from 'react';
import { findDeckCard, createFallbackCardDataUri, RESOLVED_CARD_CACHE } from '../data/deck';

// Картинка карты: сначала из кэша/папки public, потом зеркала, в конце — нарисованная заглушка
export default function TarotCardImage({ card, style = {} }) {
  const full = findDeckCard(card) || {};
  const candidates = full.urls || (card?.img ? [card.img] : []);
  const fallbackUri = full.fallbackSvg || createFallbackCardDataUri(card?.name || 'Аркан Таро', '✦');

  const initial = () =>
    full.code && RESOLVED_CARD_CACHE.has(full.code) ? RESOLVED_CARD_CACHE.get(full.code) : candidates[0] || fallbackUri;

  const [srcIndex, setSrcIndex] = useState(0);
  const [src, setSrc] = useState(initial);

  useEffect(() => {
    setSrcIndex(0);
    setSrc(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.name, card?.code]);

  const handleError = () => {
    const next = srcIndex + 1;
    if (next < candidates.length) {
      setSrcIndex(next);
      setSrc(candidates[next]);
    } else {
      setSrc(fallbackUri);
    }
  };

  const handleLoad = () => {
    if (full.code && src) RESOLVED_CARD_CACHE.set(full.code, src);
  };

  return (
    <img
      src={src || fallbackUri}
      alt={card?.name || 'Карта Таро'}
      decoding="async"
      onError={handleError}
      onLoad={handleLoad}
      style={style}
    />
  );
}
