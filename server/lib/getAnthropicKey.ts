import { db } from './firebase.js';
import { kmsDecrypt } from './kms.js';

// Resolve the active Anthropic API key for a user.
// Order:
//   1. Emulator/dev fallback: process.env.ANTHROPIC_API_KEY (when FIRESTORE_EMULATOR_HOST set)
//   2. users/{uid}.apiKeys.anthropic (ciphertext, written by POST /api/settings/api-keys) -> kmsDecrypt
export async function getAnthropicKey(uid: string): Promise<string> {
  if (process.env.FIRESTORE_EMULATOR_HOST && process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.data() as { apiKeys?: { anthropic?: string } } | undefined;
  const ct = data?.apiKeys?.anthropic;
  if (!ct) {
    throw new Error('No Anthropic API key on file. Add one in Settings > API Keys.');
  }
  return await kmsDecrypt(ct);
}
