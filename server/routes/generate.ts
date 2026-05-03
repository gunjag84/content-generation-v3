// POST /api/generate
// Streams an Anthropic carousel generation as NDJSON over plain HTTP.
// One JSON object per line. Event types:
//   { type: 'token', text: string }
//   { type: 'complete', postId: string, slides: SocialSlide[], caption: string }
//   { type: 'error', error: string }
//
// On the happy path the server writes many `token` events, then exactly one
// `complete` event, then closes the stream.

import express, { type Request, type Response } from 'express';
import { GenerateRequestSchema } from '../../shared/schemas/generateRequest.js';
import { parseSlidesMd } from '../../shared/lib/parseSlidesMd.js';
import { assembleSystemPrompt } from '../lib/assembleSystemPrompt.js';
import { ANTHROPIC_MODEL, makeAnthropicClient } from '../lib/anthropic.js';
import { getAnthropicKey } from '../lib/getAnthropicKey.js';
import { createDraftPost } from '../lib/createDraftPost.js';
import { buildZitatCarousel } from '../lib/zitatShortcircuit.js';
import type { MethodSlug } from '../lib/methodResolution.js';
import { loadTopPatterns, renderPatternsBlock, markPatternsUsed } from '../lib/learnedPatterns.js';
import { auditAndPersistPatternMatch } from '../lib/patternAudit.js';
import { db } from '../lib/firebase.js';
import type { BrandIdentity } from '../../shared/schemas/brand.js';

const router = express.Router();

function writeLine(res: Response, obj: unknown): void {
  res.write(JSON.stringify(obj) + '\n');
}

router.post('/generate', async (req: Request, res: Response) => {
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

  // NDJSON headers
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Map photo array to map: { all: '...', '1': '...', '2': '...' }
  const photoUrls: Record<string, string> = {};
  for (const p of body.photos) photoUrls[p.label] = p.url;

  // ─── Zitat shortcircuit ─────────────────────────────────────────
  if (body.method === 'zitat') {
    try {
      const carousel = buildZitatCarousel(body.situationText);
      const postId = await createDraftPost({
        uid,
        brandId: body.brandId,
        mode: body.mode,
        method: 'zitat',
        focusAreaId: body.focusAreaId,
        situationText: body.situationText,
        situationId: body.situationId,
        photoUrls,
        slides: carousel.slides,
        caption: carousel.caption,
      });
      writeLine(res, { type: 'complete', postId, slides: carousel.slides, caption: carousel.caption });
      res.end();
    } catch (err) {
      writeLine(res, { type: 'error', error:(err as Error).message });
      res.end();
    }
    return;
  }

  // ─── Anthropic generate ─────────────────────────────────────────
  let apiKey: string;
  try {
    apiKey = await getAnthropicKey(uid);
  } catch (err) {
    writeLine(res, { type: 'error', error:(err as Error).message });
    res.end();
    return;
  }

  const client = makeAnthropicClient(apiKey);

  // Phase 4a: load brand identity (voice + persona only - UVP/POV/competitor
  // are dead code) and learned patterns. Both feed assembleSystemPrompt.
  // Both failures are non-fatal (cold-start brands have neither).
  let identity: Pick<BrandIdentity, 'voice' | 'persona'> = { voice: '', persona: '' };
  try {
    const brandSnap = await db.doc(`users/${uid}/brands/${body.brandId}`).get();
    const id = (brandSnap.data()?.identity ?? {}) as Partial<BrandIdentity>;
    identity = {
      voice: typeof id.voice === 'string' ? id.voice : '',
      persona: typeof id.persona === 'string' ? id.persona : '',
    };
  } catch (err) {
    console.error('[generate] brand identity load failed:', (err as Error).message);
  }

  let topPatterns: Awaited<ReturnType<typeof loadTopPatterns>> = [];
  let patternsBlock = '';
  try {
    topPatterns = await loadTopPatterns(uid, body.brandId);
    patternsBlock = renderPatternsBlock(topPatterns);
  } catch (err) {
    console.error('[generate] pattern load failed:', (err as Error).message);
  }

  const systemPrompt = assembleSystemPrompt(
    body.method as MethodSlug,
    body.slideCount,
    body.mode,
    patternsBlock,
    identity,
  );

  const countInstruction =
    body.slideCount === 1
      ? 'Erstelle genau 1 Slide (Single Post, kein Carousel).'
      : `Erstelle genau ${body.slideCount} Slides.`;

  const userParts: string[] = [
    `<situation>\n${body.situationText}\n</situation>`,
    '\nErzähle DIESE Geschichte. Bleib nah an der Szene. Erfinde nichts dazu.',
    `\nMODE: ${body.mode}`,
    `METHOD: ${body.method}`,
  ];
  if (body.focusAreaId) userParts.push(`FOCUS: ${body.focusAreaId}`);
  if (body.author) userParts.push(`AUTHOR: ${body.author}`);
  userParts.push(`\n${countInstruction}`);
  userParts.push('Erstelle jetzt das Carousel im exakten Slide-Definition-Format.');
  const userMessage = userParts.join('\n');

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  let fullText = '';
  try {
    const stream = client.messages.stream(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal },
    );

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta &&
        'text' in event.delta &&
        typeof event.delta.text === 'string'
      ) {
        fullText += event.delta.text;
        writeLine(res, { type: 'chunk', text: event.delta.text });
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      // Client disconnected — just stop. Connection already closing.
      return;
    }
    writeLine(res, { type: 'error', error:(err as Error).message });
    res.end();
    return;
  }

  // Parse + persist
  let parsed;
  try {
    parsed = parseSlidesMd(fullText);
  } catch (err) {
    writeLine(res, { type: 'error', error:`parse_failed: ${(err as Error).message}` });
    res.end();
    return;
  }

  // Guard: parseSlidesMd never throws but can return slides:[] for any output
  // that doesn't contain `SLIDE N` markers (e.g. Claude went conversational,
  // or the stream truncated before the first slide). Persisting slides:[] is
  // the original B2 bug -- the editor then shows "Kein Post gefunden." on a
  // post that exists but is unusable. Surface it as a hard error instead so
  // the user sees an actionable message in the Create UI.
  if (parsed.slides.length === 0) {
    writeLine(res, {
      type: 'error',
      error:
        'parse_failed: Claude-Antwort enthielt keine SLIDE-Marker. ' +
        'Bitte erneut generieren. (Rohtext-Anfang: ' +
        JSON.stringify(fullText.slice(0, 200)) +
        ')',
    });
    res.end();
    return;
  }

  let postId: string;
  try {
    postId = await createDraftPost({
      uid,
      brandId: body.brandId,
      mode: body.mode,
      method: body.method,
      focusAreaId: body.focusAreaId,
      situationText: body.situationText,
      situationId: body.situationId,
      photoUrls,
      slides: parsed.slides,
      caption: parsed.caption,
    });
  } catch (err) {
    writeLine(res, { type: 'error', error:`persist_failed: ${(err as Error).message}` });
    res.end();
    return;
  }

  writeLine(res, {
    type: 'complete',
    postId,
    slides: parsed.slides,
    caption: parsed.caption,
  });
  res.end();

  // Mark patterns as used (recency + useCount bump; flips promotionCandidate
  // when threshold crossed). Fire-and-forget; never blocks the response.
  if (topPatterns.length > 0) {
    void markPatternsUsed(uid, body.brandId, topPatterns).catch((err) => {
      console.error('[generate] markPatternsUsed failed:', (err as Error).message);
    });

    // Post-generate Haiku audit: did the model actually follow the patterns?
    // Fire-and-forget; persists patternAudit on the post doc for editor
    // advisory warnings (Phase 4b) and as enforcement-quality signal.
    void auditAndPersistPatternMatch({
      uid,
      brandId: body.brandId,
      postId,
      apiKey,
      patterns: topPatterns,
      output: { slides: parsed.slides, caption: parsed.caption },
    }).catch((err) => {
      console.error('[generate] patternAudit failed:', (err as Error).message);
    });
  }
});

export default router;
