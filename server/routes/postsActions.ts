// POST /api/posts/:postId/schedule
// POST /api/posts/:postId/cancel-schedule
// POST /api/posts/:postId/publish-now
//
// All three require Firebase ID-token auth (req.uid set by requireAuth).
// brandId is read from request body and validated against user ownership.

import { Router, type Request, type Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.js';
import { publishClaimedPost } from '../lib/publishOnePost.js';

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
  // Fail-fast if no rendered slides — otherwise the worker would silently
  // mark this post as 'error' at scheduledAt, hours later, with no UI feedback.
  const rendered = Array.isArray(post.renderedSlideUrls) ? post.renderedSlideUrls : [];
  if (rendered.length === 0) {
    res.status(400).json({
      error: 'no_rendered_slides',
      message: 'Bitte zuerst im Editor "Rendern" klicken, bevor du den Beitrag einplanst.',
    });
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
//
// Synchronous publish: claims the post (draft|scheduled → publishing) inside a
// transaction, then calls publishClaimedPost which talks to Meta Graph API.
// Typical latency 10-30s for a 5-7 slide carousel; well within Cloud Run's
// 5-min request timeout. On failure the post is marked status='error' with the
// error message so the user can see + retry via the Drafts tab.

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
  // Fail-fast on missing renders — same reason as /schedule above.
  const rendered = Array.isArray(post.renderedSlideUrls) ? post.renderedSlideUrls : [];
  if (rendered.length === 0) {
    res.status(400).json({
      error: 'no_rendered_slides',
      message: 'Bitte zuerst im Editor "Rendern" klicken, bevor du veröffentlichst.',
    });
    return;
  }

  // Atomic claim: prevents a concurrent worker tick from double-publishing.
  let claimed = false;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(postSnap.ref);
      if (!fresh.exists) return;
      const d = fresh.data()!;
      if (d.status !== 'draft' && d.status !== 'scheduled') return;
      tx.update(postSnap.ref, {
        status: 'publishing',
        publishingStartedAt: FieldValue.serverTimestamp(),
        scheduledAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      claimed = true;
    });
  } catch (err) {
    res.status(500).json({ error: 'claim_failed', message: (err as Error).message });
    return;
  }
  if (!claimed) {
    res.status(409).json({ error: 'post_not_publishable', current: post.status });
    return;
  }

  try {
    const result = await publishClaimedPost(postSnap.ref, uid(req), brandId);
    res.json({ ok: true, igMediaId: result.igMediaId, igPermalink: result.igPermalink });
  } catch (err) {
    const message = (err as Error).message;
    try {
      await postSnap.ref.update({
        status: 'error',
        error: message,
        publishingStartedAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (updateErr) {
      console.error('[publish-now] error-update failed for', postSnap.ref.path, updateErr);
    }
    res.status(500).json({ error: 'publish_failed', message });
  }
});

export default router;
