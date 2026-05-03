// POST /api/render-jobs
// Creates a renderJob Firestore doc + enqueues a Cloud Task for async rendering.

import express, { type Request, type Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.js';
import { enqueueRender } from '../lib/cloudTasksClient.js';
import { RenderJobRequestSchema } from '../../shared/schemas/renderJob.js';

const router = express.Router();

router.post('/render-jobs', async (req: Request, res: Response) => {
  const uid = (req as any).uid as string | undefined;
  if (!uid) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  let body;
  try {
    body = RenderJobRequestSchema.parse(req.body);
  } catch (err) {
    res.status(400).json({ error: 'invalid_request', detail: (err as Error).message });
    return;
  }

  const { brandId, postId, format } = body;

  // Read post to get slide count
  const postRef = db.doc(`users/${uid}/brands/${brandId}/posts/${postId}`);
  let postSnap;
  try {
    postSnap = await postRef.get();
  } catch (err) {
    res.status(500).json({ error: 'post_read_failed' });
    return;
  }

  if (!postSnap.exists) {
    res.status(404).json({ error: 'post_not_found' });
    return;
  }

  const postData = postSnap.data()!;
  const slides: unknown[] = Array.isArray(postData.slides) ? postData.slides : [];
  const slideCount = slides.length;

  if (slideCount === 0) {
    res.status(422).json({ error: 'post_has_no_slides' });
    return;
  }

  // Create renderJob doc
  const jobRef = db.collection(`users/${uid}/brands/${brandId}/renderJobs`).doc();
  const jobId = jobRef.id;

  try {
    await jobRef.set({
      postId,
      brandId,
      format,
      status: 'pending',
      slideCount,
      completedSlides: 0,
      slideUrls: [],
      error: null,
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    res.status(500).json({ error: 'job_create_failed' });
    return;
  }

  // Enqueue Cloud Task
  try {
    await enqueueRender({ uid, brandId, postId, jobId, format });
  } catch (err) {
    // Mark job as error so client is not left polling forever
    await jobRef.update({
      status: 'error',
      error: `enqueue_failed: ${(err as Error).message}`,
      updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => undefined);
    res.status(500).json({ error: 'enqueue_failed', detail: (err as Error).message });
    return;
  }

  res.status(201).json({ jobId });
});

export default router;
