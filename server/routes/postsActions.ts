// POST /api/posts/:postId/schedule
// POST /api/posts/:postId/cancel-schedule
// POST /api/posts/:postId/publish-now
//
// All three require Firebase ID-token auth (req.uid set by requireAuth).
// brandId is read from request body and validated against user ownership.

import { Router, type Request, type Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.js';

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

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

async function getPost(uidVal: string, brandId: string, postId: string) {
  return db.doc(`users/${uidVal}/brands/${brandId}/posts/${postId}`).get();
}

// ── POST /posts/:postId/schedule ─────────────────────────────────────────────

router.post('/posts/:postId/schedule', async (req: Request, res: Response) => {
  const { brandId, scheduledAt } = req.body ?? {};

  if (!(await assertBrandOwnership(req, res, brandId))) return;

  // Validate scheduledAt
  if (!scheduledAt || typeof scheduledAt !== 'string') {
    res.status(400).json({ error: 'scheduledAt (ISO string) required' });
    return;
  }
  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime())) {
    res.status(400).json({ error: 'scheduledAt is not a valid date' });
    return;
  }
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (scheduledDate < fiveMinFromNow) {
    res.status(400).json({ error: 'scheduledAt must be at least 5 minutes in the future' });
    return;
  }

  const postId = req.params.postId;
  const postSnap = await getPost(uid(req), brandId, postId);
  if (!postSnap.exists) {
    res.status(404).json({ error: 'post_not_found' });
    return;
  }
  const post = postSnap.data()!;
  if (post.status !== 'draft') {
    res.status(409).json({ error: 'post_not_draft', current: post.status });
    return;
  }

  await postSnap.ref.update({
    status: 'scheduled',
    scheduledAt: Timestamp.fromDate(scheduledDate),
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.json({ ok: true });
});

// ── POST /posts/:postId/cancel-schedule ──────────────────────────────────────

router.post('/posts/:postId/cancel-schedule', async (req: Request, res: Response) => {
  const { brandId } = req.body ?? {};

  if (!(await assertBrandOwnership(req, res, brandId))) return;

  const postId = req.params.postId;
  const postSnap = await getPost(uid(req), brandId, postId);
  if (!postSnap.exists) {
    res.status(404).json({ error: 'post_not_found' });
    return;
  }
  const post = postSnap.data()!;
  if (post.status !== 'scheduled') {
    res.status(409).json({ error: 'post_not_scheduled', current: post.status });
    return;
  }

  await postSnap.ref.update({
    status: 'draft',
    scheduledAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.json({ ok: true });
});

// ── POST /posts/:postId/publish-now ──────────────────────────────────────────

router.post('/posts/:postId/publish-now', async (req: Request, res: Response) => {
  const { brandId } = req.body ?? {};

  if (!(await assertBrandOwnership(req, res, brandId))) return;

  const postId = req.params.postId;
  const postSnap = await getPost(uid(req), brandId, postId);
  if (!postSnap.exists) {
    res.status(404).json({ error: 'post_not_found' });
    return;
  }
  const post = postSnap.data()!;
  if (post.status !== 'draft' && post.status !== 'scheduled') {
    res.status(409).json({ error: 'post_not_publishable', current: post.status });
    return;
  }

  // Set scheduledAt = now so the next publish-worker tick (<=5 min) picks it up.
  // This is the safe path; a synchronous publish path can be wired later if
  // sub-5-min latency becomes a requirement.
  await postSnap.ref.update({
    status: 'scheduled',
    scheduledAt: Timestamp.fromDate(new Date()),
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.json({ ok: true, note: 'queued_for_next_worker_tick' });
});

export default router;
