import { db } from './firebase.js';
import { kmsDecrypt } from './kms.js';

// Resolve the Meta Graph API access token for a user.
// Order:
//   1. Emulator/dev fallback: process.env.META_ACCESS_TOKEN (when FIRESTORE_EMULATOR_HOST set)
//   2. users/{uid}/secrets/apiKeys.meta_ciphertext -> kmsDecrypt
export async function getMetaToken(uid: string): Promise<string> {
  if (process.env.FIRESTORE_EMULATOR_HOST && process.env.META_ACCESS_TOKEN) {
    return process.env.META_ACCESS_TOKEN;
  }

  const snap = await db.doc(`users/${uid}/secrets/apiKeys`).get();
  if (!snap.exists) {
    throw new Error('No Meta access token on file. Add one in Settings > API Keys.');
  }
  const data = snap.data() as { meta_ciphertext?: string } | undefined;
  const ct = data?.meta_ciphertext;
  if (!ct) {
    throw new Error('No Meta access token on file. Add one in Settings > API Keys.');
  }
  return await kmsDecrypt(ct);
}
