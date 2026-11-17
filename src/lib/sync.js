import { findDeckCard } from '../data/deck';

// Код синхронизации и облачное хранение истории (будет доработано на шаге 4)
export const getOrCreateSyncCode = () => {
  try {
    const existing = localStorage.getItem('tarot_flox_sync_code');
    if (existing && existing.trim().length >= 4) return existing.trim().toUpperCase();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let generated = 'FX';
    for (let i = 0; i < 6; i++) generated += chars.charAt(Math.floor(Math.random() * chars.length));
    localStorage.setItem('tarot_flox_sync_code', generated);
    return generated;
  } catch (e) {
    return 'FX777888';
  }
};

const CLOUD_KV_BASE = 'https://keyvalue.immanuel.co/api/KeyVal';
const CLOUD_APP_TOKEN = '4f9b2c8e';
const keyFor = (code) => `tarot_flox_${code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
const slimCards = (cards) => (cards || []).map((c) => ({ code: c.code, name: c.name }));

export const pushHistoryToCloudKV = async (code, list) => {
  if (!code) return;
  try {
    const slim = (list || []).slice(0, 25).map((item) => ({
      id: item.id,
      date: item.date,
      question: item.question,
      mode: item.mode || 'standard',
      verdict: item.verdict || '',
      cards: slimCards(item.cards),
      analysis: item.analysis,
      advice: item.advice,
      followUps: (item.followUps || []).map((fu) => ({ id: fu.id, q: fu.q, a: fu.a, cards: slimCards(fu.cards) }))
    }));
    const encoded = encodeURIComponent(JSON.stringify(slim));
    await fetch(`${CLOUD_KV_BASE}/UpdateValue/${CLOUD_APP_TOKEN}/${keyFor(code)}/${encoded}`, { method: 'POST' });
  } catch (e) {}
};

export const pullHistoryFromCloudKV = async (code) => {
  if (!code) return null;
  try {
    const res = await fetch(`${CLOUD_KV_BASE}/GetValue/${CLOUD_APP_TOKEN}/${keyFor(code)}`);
    if (!res.ok) return null;
    const raw = await res.json();
    if (!raw) return null;
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => ({
      ...item,
      cards: (item.cards || []).map(findDeckCard),
      followUps: (item.followUps || []).map((fu) => ({ ...fu, cards: (fu.cards || []).map(findDeckCard) }))
    }));
  } catch (e) {
    return null;
  }
};
