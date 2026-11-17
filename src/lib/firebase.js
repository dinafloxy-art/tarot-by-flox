import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/* global __app_id, __firebase_config */
export let auth = null;
export let db = null;
export const appId = typeof __app_id !== 'undefined' ? __app_id : 'tarot-by-flox-app';

try {
  const rawConfig =
    typeof __firebase_config !== 'undefined' && __firebase_config ? __firebase_config : null;
  if (rawConfig) {
    const firebaseConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.warn('Firebase init fallback:', e);
}
