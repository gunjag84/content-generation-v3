// /api/patterns/* - manage promotion candidates from the learning loop.
//
// Endpoints:
//   GET    /brand/:brandId/candidates                  list active candidates
//   POST   /:patternId/approve                         merge into brand.identity, delete sources
//   POST   /:patternId/dismiss                         status -> 'dismissed' (excluded from injection)
//   DELETE /:patternId                                 hard-delete the doc

import { Router, type Request, type Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.js';
import { loadPromotionCandidates } from '../lib/learnedPatterns.js';
import { recordApproval } from '../lib/approvalLedger.js';
import type { LearnedPattern } from '../../shared/schemas/learnedPattern.js';

const router = Router();

function uid(req: Request): string {
  return (req as any).uid as string;
}

async function assertBrandOwnership(
  req: Request,
  res: Response,
  brandId: unknown,
): Promise<boolean> {
  if (typeof brandId !== 'string' || !brandId) {
    res.status(400).json({ error: 'brandId required' });
    return false;
  }
  const snap = await db.doc(`users/${uid(req)}/brands/${brandId}`).get();
  if (!snap.exists) {
    res.status(404).json({ error: 'brand_not_found' });
    return false;
  }
  return true;
}

// ── GET /patterns/brand/:brandId/candidates ─────────────────────────────────
router.get('/patterns/brand/:brandId/candidates', async (req: Request, res: Response) => {
  const brandId = req.params.brandId;
  if (!(await assertBrandOwnership(req, res, brandId))) return;
  const candidates = await loadPromotionCandidates(uid(req), brandId);
  res.json({ candidates });
});

// ── POST /patterns/:patternId/approve ───────────────────────────────────────
//
// Body: { brandId, target: 'voice' | 'persona', mergedText: string }
//
// `mergedText` is the user-confirmed value to write to brand.identity[target].
// The frontend builds it (current text + suggested addition, user-editable).
// On success: brand.identity[target] = mergedText, source pattern doc is
// deleted along with any siblings sharing the same description (cleanup).
router.post('/patterns/:patternId/approve', async (req: Request, res: Response) => {
  const { brandId, target, mergedText } = req.body ?? {};
  if (!(await assertBrandOwnership(req, res, brandId))) return;
  if (target !== 'voice' && target !== 'persona') {
    res.status(400).json({ error: 'target must be "voice" or "persona"' });
    return;
  }
  if (typeof mergedText !== 'string' || mergedText.length > 4000) {
    res.status(400).json({ error: 'mergedText required (string, <=4000 chars)' });
    return;
  }

  const patternId = req.params.patternId;
  const patternRef = db.doc(
    `users/${uid(req)}/brands/${brandId}/learnedPatterns/${patternId}`,
  );
  const patternSnap = await patternRef.get();
  if (!patternSnap.exists) {
    res.status(404).json({ error: 'pattern_not_found' });
    return;
  }
  const pattern = patternSnap.data() as LearnedPattern;

  const brandRef = db.doc(`users/${uid(req)}/brands/${brandId}`);

  // Update brand identity + delete the approved pattern in one batch.
  const batch = db.batch();
  batch.update(brandRef, {
    [`identity.${target}`]: mergedText,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.delete(patternRef);

  await batch.commit();

  // F2: record approval event for ledger tracking (fire-and-forget).
  recordApproval({
    uid: uid(req),
    brandId,
    patternId,
    patternDescription: pattern.description,
    zone: pattern.zone,
    target,
    mergedText,
  }).catch(console.error);

  // F1 + F4: zone-wide cleanup of all active siblings in the same zone.
  // Runs as a second batch so a cleanup failure never rolls back the approval.
  let deletedSiblingCount = 0;
  let cleanupError: string | undefined;
  try {
    const zoneSnap = await db
      .collection(`users/${uid(req)}/brands/${brandId}/learnedPatterns`)
      .where('status', '==', 'active')
      .where('zone', '==', pattern.zone)
      .limit(100)
      .get();
    const cleanupBatch = db.batch();
    for (const d of zoneSnap.docs) {
      if (d.id !== patternId) {
        cleanupBatch.delete(d.ref);
        deletedSiblingCount++;
      }
    }
    if (deletedSiblingCount > 0) await cleanupBatch.commit();
  } catch (err) {
    console.error('[patterns] zone-wide cleanup failed:', (err as Error).message, { brandId, zone: pattern.zone });
    cleanupError = (err as Error).message;
  }

  const response: { ok: true; deletedSiblingCount: number; cleanupError?: string } = {
    ok: true,
    deletedSiblingCount,
  };
  if (cleanupError !== undefined) response.cleanupError = cleanupError;
  res.json(response);
});

// ── POST /patterns/:patternId/dismiss ───────────────────────────────────────
router.post('/patterns/:patternId/dismiss', async (req: Request, res: Response) => {
  const { brandId } = req.body ?? {};
  if (!(await assertBrandOwnership(req, res, brandId))) return;
  const patternId = req.params.patternId;
  const ref = db.doc(`users/${uid(req)}/brands/${brandId}/learnedPatterns/${patternId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'pattern_not_found' });
    return;
  }
  await ref.update({
    status: 'dismissed',
    promotionCandidate: false,
  });
  res.json({ ok: true });
});

// ── DELETE /patterns/:patternId ─────────────────────────────────────────────
router.delete('/patterns/:patternId', async (req: Request, res: Response) => {
  // brandId via query string for DELETE (no body convention).
  const brandId = req.query.brandId;
  if (!(await assertBrandOwnership(req, res, brandId))) return;
  const patternId = req.params.patternId;
  const ref = db.doc(`users/${uid(req)}/brands/${brandId}/learnedPatterns/${patternId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'pattern_not_found' });
    return;
  }
  await ref.delete();
  res.json({ ok: true });
});

export default router;
