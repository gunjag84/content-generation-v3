import { db } from './firebase.js';
import { kmsDecrypt } from './kms.js';

// Resolve the Meta Graph API access token for a user/brand combo.
//
// Multi-brand migration (2026-05-06): brandId is REQUIRED. Token is now
// brand-scoped (one Instagram account per Brand workspace). Legacy
// user-scoped storage stays readable during a 1-week fallback window so
// pre-migration writes don't break. Cleanup deploy removes the fallback.
//
// Order:
//   1. Emulator/dev fallback: process.env.META_ACCESS_TOKEN
//   2. brands/{brandId}.metaGraphCiphertext  (PRIMARY)
//   3. users/{uid}.apiKeys.metaGraph          (FALLBACK, transition window)
export async function getMetaToken(uid: string, brandId: string): Promise<string> {
  if (process.env.FIRESTORE_EMULATOR_HOST && process.env.META_ACCESS_TOKEN) {
    return process.env.META_ACCESS_TOKEN;
  }

  const brandSnap = await db.doc(`users/${uid}/brands/${brandId}`).get();
  const brandCt = (brandSnap.data() as { metaGraphCiphertext?: string | null } | undefined)
    ?.metaGraphCiphertext ?? null;
  if (brandCt) {
    return await kmsDecrypt(brandCt);
  }

  // Legacy fallback: remove after cleanup deploy.
  const userSnap = await db.doc(`users/${uid}`).get();
  const userCt = (userSnap.data() as { apiKeys?: { metaGraph?: string } } | undefined)
    ?.apiKeys?.metaGraph;
  if (!userCt) {
    throw new Error('No Meta access token on file. Configure it in Settings > Instagram.');
  }
  console.warn(`[getMetaToken] legacy user-scoped fallback used for uid=${uid} brandId=${brandId}`);
  return await kmsDecrypt(userCt);
}
