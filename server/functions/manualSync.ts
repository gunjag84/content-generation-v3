// manualIgSync (onCall, region eu-west1)
//
// Web-client-triggered manual IG sync for the requesting user's specified
// brand. Runs the same logic as the 6h-scheduled igFeedSync + igStatsSync,
// but scoped to one (uid, brandId) and with the stats-cutoff bypassed so
// pressing the button is always a real refresh.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { syncBrand as syncFeedForBrand } from './igFeedSync.js';
import { syncStatsForBrand } from './igStatsSync.js';

if (getApps().length === 0) initializeApp();

interface BrandData {
  name?: string;
  instagramUserId?: string | null;
  metaGraphCiphertext?: string | null;
  metaGraphSetAt?: unknown;
}

export const manualIgSync = onCall(
  {
    region: 'europe-west1',
    // Pin SA: KMS decrypt requires content-gen-sa.
    serviceAccount: 'content-gen-sa@contentai-78bfb.iam.gserviceaccount.com',
    // Stats sync hits Meta Graph 3x per post (insights, follows, comments).
    // ~100 posts × sequential round-trips easily exceeds the default 60s.
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'sign in required');
    }
    const data = (req.data ?? {}) as { brandId?: unknown };
    const brandId = data.brandId;
    if (typeof brandId !== 'string' || !brandId) {
      throw new HttpsError('invalid-argument', 'brandId required');
    }

    const db = getFirestore();
    const brandSnap = await db.doc(`users/${uid}/brands/${brandId}`).get();
    if (!brandSnap.exists) {
      throw new HttpsError('not-found', 'brand not found');
    }
    const brand = (brandSnap.data() as BrandData | undefined) ?? {};
    if (!brand.instagramUserId || !brand.metaGraphCiphertext) {
      throw new HttpsError(
        'failed-precondition',
        'brand not configured for instagram',
      );
    }

    await syncFeedForBrand(db, uid, brandId, brand);
    const stats = await syncStatsForBrand(uid, brandId);

    return {
      ok: true as const,
      stats,
    };
  },
);
