import { useState, useEffect } from 'react';
import { signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, appId } from '../lib/firebase';
import { getOrCreateSyncCode, pushHistoryToCloudKV, pullHistoryFromCloudKV } from '../lib/sync';

/* global __initial_auth_token */
const LS_KEY = 'tarotHistory_flox_v2';

const mergeById = (a, b) => {
  const map = new Map();
  [...a, ...b].forEach((it) => {
    if (it && it.id) map.set(it.id, it);
  });
  return Array.from(map.values()).sort((x, y) => y.id - x.id);
};

const saveLocal = (list) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch (e) {}
};

// История раскладов: localStorage + облачный код синхронизации (+ Firebase, если настроен)
export function useTarotHistory() {
  const [user, setUser] = useState(null);
  const [syncCode, setSyncCode] = useState(() => getOrCreateSyncCode());
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    if (!auth) return undefined;
    (async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {}
    })();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!syncCode) return undefined;
    let active = true;
    pullHistoryFromCloudKV(syncCode).then((cloudItems) => {
      if (!active || !cloudItems || !cloudItems.length) return;
      setHistory((prev) => {
        const merged = mergeById(cloudItems, prev);
        saveLocal(merged);
        return merged;
      });
    });
    return () => {
      active = false;
    };
  }, [syncCode]);

  useEffect(() => {
    if (!user || !db) return undefined;
    const ref = collection(db, 'artifacts', appId, 'users', user.uid, 'readings');
    return onSnapshot(
      ref,
      (snap) => {
        const items = [];
        snap.forEach((d) => items.push(d.data()));
        if (items.length) {
          setHistory((prev) => {
            const merged = mergeById(items, prev);
            saveLocal(merged);
            return merged;
          });
        }
      },
      () => {}
    );
  }, [user]);

  const saveReading = async (reading) => {
    const code = (syncCode || getOrCreateSyncCode()).trim().toUpperCase();
    const item = { ...reading, syncCode: code };
    setHistory((prev) => {
      const updated = [item, ...prev.filter((h) => h.id !== item.id)].sort((a, b) => b.id - a.id);
      saveLocal(updated);
      pushHistoryToCloudKV(code, updated);
      return updated;
    });
    if (user && db) {
      try {
        const docId = String(item.id);
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'readings', docId), item);
      } catch (e) {}
    }
  };

  const deleteReading = async (id) => {
    const code = (syncCode || getOrCreateSyncCode()).trim().toUpperCase();
    setHistory((prev) => {
      const updated = prev.filter((h) => h.id !== id);
      saveLocal(updated);
      pushHistoryToCloudKV(code, updated);
      return updated;
    });
    if (user && db) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'readings', String(id)));
      } catch (e) {}
    }
  };

  return { history, syncCode, setSyncCode, saveReading, deleteReading };
}
