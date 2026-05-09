// POST /api/generate-manual
// User-typed verbatim slide path. Same auth/killswitch/method-resolution as
// /api/generate, but no streaming and no learned-pattern enforcement: the
// slide text is the user's own, only emphasis spans are AI-marked.

import express, { type Request, type Response } from 'express';
import { GenerateRequestSchema } from '../../shared/schemas/generateRequest.js';
import { getAnthropicKey } from '../lib/getAnthropicKey.js';
import { createDraftPost } from '../lib/createDraftPost.js';
import { buildManualCarousel } from '../lib/buildManualCarousel.js';
import { db } from '../lib/firebase.js';
import { MethodSchema } from '../../shared/schemas/method.js';

const router = express.Router();

router.post('/generate-manual', async (req: Request, res: Response) => {
  const uid = (req as any).uid as string | undefined;
  if (!uid) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  let body;
  try {
    body = GenerateRequestSchema.parse(req.body);
  } catch (err) {
    res.status(400).json({ error: 'invalid_request', detail: (err as Error).message });
    return;
  }

  // Resolve method doc — same shape check as /api/generate. slideCount is
  // overridden by the parsed input count, but mode/method consistency still
  // matters (analytics, learning loop).
  let methodDoc: import('../../shared/schemas/method.js').Method | null = null;
  try {
    const methodsCol = db.collection(`users/${uid}/brands/${body.brandId}/methods`);
    const snap = await methodsCol.where('slug', '==', body.method).limit(1).get();
    if (!snap.empty) {
      const parsed = MethodSchema.safeParse(snap.docs[0].data());
      if (parsed.success) methodDoc = parsed.data;
    }
  } catch (err) {
    console.error('[generate-manual] method doc load failed:', (err as Error).message);
  }
  if (!methodDoc) {
    res.status(400).json({ error: `unknown_method: '${body.method}' nicht in den Brand-Methoden gefunden.` });
    return;
  }
  if (methodDoc.mode !== body.mode) {
    res.status(400).json({ error: `mode_mismatch: Methode '${body.method}' geh\u00f6rt zu mode '${methodDoc.mode}', request war '${body.mode}'.` });
    return;
  }

  const photoUrls: Record<string, string> = {};
  for (const p of body.photos) photoUrls[p.label] = p.url;

  let apiKey: string;
  try {
    apiKey = await getAnthropicKey(uid);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  let carousel;
  try {
    carousel = await buildManualCarousel({
      apiKey,
      situationText: body.situationText,
      methodSlug: body.method,
    });
  } catch (err) {
    if ((err as Error).message === 'no_slides') {
      res.status(400).json({ error: 'no_slides: Format "Slide 1: ..." wurde nicht erkannt.' });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
    return;
  }

  let postId: string;
  try {
    postId = await createDraftPost({
      uid,
      brandId: body.brandId,
      mode: body.mode,
      method: body.method,
      length: body.length,
      situationText: body.situationText,
      situationId: body.situationId,
      photoUrls,
      slides: carousel.slides,
      caption: carousel.caption,
    });
  } catch (err) {
    res.status(500).json({ error: `persist_failed: ${(err as Error).message}` });
    return;
  }

  res.json({ postId, slides: carousel.slides, caption: carousel.caption });
});

export default router;
