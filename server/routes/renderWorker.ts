// POST /internal/render
// Cloud Tasks worker: renders carousel slides to PNGs via Playwright + Chromium.
// Protected by OIDC middleware (requireOidc) — Cloud Tasks authenticates with
// internal-invoker service account.

import express, { type Request, type Response } from 'express';
import { chromium } from 'playwright';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { db } from '../lib/firebase.js';
import { buildSlideHtml } from '../lib/renderHtml.js';
import { RenderTaskPayloadSchema } from '../../shared/schemas/renderJob.js';
import type { SocialSlide } from '../../shared/types/slide.js';

const router = express.Router();

router.post('/render', async (req: Request, res: Response) => {
  let payload;
  try {
    payload = RenderTaskPayloadSchema.parse(req.body);
  } catch (err) {
    // Permanent failure — tell Cloud Tasks not to retry (400)
    res.status(400).json({ error: 'invalid_payload', detail: (err as Error).message });
    return;
  }

  const { uid, brandId, postId, jobId } = payload;

  const jobRef = db.doc(`users/${uid}/brands/${brandId}/renderJobs/${jobId}`);
  const postRef = db.doc(`users/${uid}/brands/${brandId}/posts/${postId}`);

  // Read post
  let postData: FirebaseFirestore.DocumentData;
  try {
    const snap = await postRef.get();
    if (!snap.exists) {
      await jobRef.update({
        status: 'error',
        error: 'post_not_found',
        updatedAt: FieldValue.serverTimestamp(),
      });
      res.status(400).json({ error: 'post_not_found' });
      return;
    }
    postData = snap.data()!;
  } catch (err) {
    res.status(500).json({ error: 'post_read_failed' });
    return;
  }

  const slides: SocialSlide[] = Array.isArray(postData.slides) ? postData.slides : [];
  const photoUrls: Record<string, string> =
    postData.photoUrls && typeof postData.photoUrls === 'object' ? postData.photoUrls : {};

  if (slides.length === 0) {
    await jobRef.update({
      status: 'error',
      error: 'no_slides',
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Permanent failure
    res.status(400).json({ error: 'no_slides' });
    return;
  }

  // Mark rendering
  try {
    await jobRef.update({
      status: 'rendering',
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (_) {
    // Non-fatal — continue
  }

  const bucket = getStorage().bucket();
  const slideUrls: string[] = [];
  let browser;

  try {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];

      // Resolve photo URL for this slide index (1-based label, then 'all' fallback)
      const photoUrl = photoUrls[String(i + 1)] ?? photoUrls['all'] ?? null;

      const html = buildSlideHtml(slide, photoUrl);

      const page = await browser.newPage();
      try {
        await page.setViewportSize({ width: 1080, height: 1080 });
        await page.setContent(html, { waitUntil: 'networkidle' });
        const buffer = await page.screenshot({ type: 'png', omitBackground: false });

        const storagePath = `renders/${uid}/${brandId}/${postId}/slide-${i}.png`;
        const file = bucket.file(storagePath);

        await file.save(buffer, {
          metadata: { contentType: 'image/png' },
        });

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: expiresAt,
        });

        slideUrls.push(signedUrl);

        await jobRef.update({
          completedSlides: FieldValue.increment(1),
          slideUrls,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } finally {
        await page.close();
      }
    }

    // All slides done — mark job complete + write URLs into post doc
    await jobRef.update({
      status: 'done',
      slideUrls,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await postRef.update({
      renderedSlideUrls: slideUrls,
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({ ok: true, slideCount: slides.length });
  } catch (err) {
    // Terminal error — let Cloud Tasks retry (500)
    const message = (err as Error).message ?? 'unknown_error';
    await jobRef.update({
      status: 'error',
      error: message,
      updatedAt: FieldValue.serverTimestamp(),
    }).catch(() => undefined);
    res.status(500).json({ error: message });
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
});

export default router;
