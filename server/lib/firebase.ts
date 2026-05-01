import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}

export const auth = getAuth();
export const db = getFirestore();
// Allow undefined fields to pass through as missing (matches client SDK semantics
// and avoids fatal "Cannot use undefined" errors on optional slide/zone fields).
db.settings({ ignoreUndefinedProperties: true });
