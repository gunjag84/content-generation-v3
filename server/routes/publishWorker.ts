// POST /internal/publish-worker
// Called by Cloud Scheduler every 5 minutes (via OIDC — see middleware/oidc.ts).
//
// Each tick does two things:
//   1. Recover stale 'publishing' locks (>10 min) back to 'scheduled'.
//   2. Claim up to 20 'scheduled' posts whose scheduledAt <= now, transition
//      them to 'publishing' (via transaction), then call Meta Graph to publish.

import { Router, type Request, type Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.js';
import { publishClaimedPost } from '../lib/publishOnePost.js';

const router = Router();

const STALE_LOCK_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PER_TICK = 20;

// Parse uid + brandId from a collection-group post path.
// Expected shape: users/{uid}/brands/{brandId}/posts/{postId}
function parsePostPath(ref: FirebaseFirestore.DocumentReference): { uid: string; brandId: string } | null {
  const parts = ref.path.split('/');
  // ['users', uid, 'brands', brandId, 'posts', postId]
  if (parts.length !== 6 || parts[0] !== 'users' || parts[2] !== 'brands' || parts[4] !== 'posts') {
    return null;
  }
  return { uid: parts[1], brandId: parts[3] };
}

router.post('/publish-worker', async (_req: Request, res: Response) => {
  let recoveredStale = 0;
  let processed = 0;
  let errors = 0;

  // ── Step 1: recover stale publishing locks ────────────────────────────────
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS);
  let staleSnap: FirebaseFirestore.QuerySnapshot;
  try {
    staleSnap = await db
      .collectionGroup('posts')
      .where('status', '==', 'publishing')
      .where('publishingStartedAt', '<', staleCutoff)
      .get();
  } catch (err) {
    console.error('[publish-worker] stale-sweep query failed:', err);
    staleSnap = { docs: [] } as unknown as FirebaseFirestore.QuerySnapshot;
  }

  for (const doc of staleSnap.docs) {
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists) return;
        const d = fresh.data()!;
        // Re-check inside transaction: must still be stale publishing
        const startedAt: Date | null = d.publishingStartedAt?.toDate?.() ?? null;
        if (d.status !== 'publishing' || !startedAt || startedAt >= staleCutoff) return;
        tx.update(doc.ref, {
          status: 'scheduled',
          publishingStartedAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      recoveredStale++;
    } catch (err) {
      console.error('[publish-worker] stale-recovery failed for', doc.ref.path, err);
    }
  }

  // ── Step 2: find ready posts ──────────────────────────────────────────────
  const now = new Date();
  let readySnap: FirebaseFirestore.QuerySnapshot;
  try {
    readySnap = await db
      .collectionGroup('posts')
      .where('status', '==', 'scheduled')
      .where('scheduledAt', '<=', now)
      .limit(MAX_PER_TICK)
      .get();
  } catch (err) {
    console.error('[publish-worker] ready-query failed:', err);
    res.status(500).json({ ok: false, error: 'ready_query_failed' });
    return;
  }

  // ── Step 3: claim + publish each ready post ───────────────────────────────
  for (const doc of readySnap.docs) {
    let claimed = false;

    // Claim via transaction (prevent double-publish)
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists) return;
        const d = fresh.data()!;
        const scheduledAt: Date | null = d.scheduledAt?.toDate?.() ?? null;
        if (d.status !== 'scheduled' || !scheduledAt || scheduledAt > now) return;
        tx.update(doc.ref, {
          status: 'publishing',
          publishingStartedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        claimed = true;
      });
    } catch (err) {
      console.error('[publish-worker] claim transaction failed for', doc.ref.path, err);
      errors++;
      continue;
    }

    if (!claimed) continue;

    const parsed = parsePostPath(doc.ref);
    if (!parsed) {
      console.error('[publish-worker] unexpected post path shape:', doc.ref.path);
      errors++;
      continue;
    }

    try {
      await publishClaimedPost(doc.ref, parsed.uid, parsed.brandId);
      processed++;
    } catch (err) {
      console.error('[publish-worker] publish failed for', doc.ref.path, err);
      try {
        await doc.ref.update({
          status: 'error',
          error: (err as Error).message,
          publishingStartedAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (updateErr) {
        console.error('[publish-worker] error-update failed for', doc.ref.path, updateErr);
      }
      errors++;
    }
  }

  res.json({ ok: true, processed, recoveredStale, errors });
});

export default router;
