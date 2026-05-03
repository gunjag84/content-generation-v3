// Phase 4a learning extractor.
// Called fire-and-forget from the publish-worker after a successful publish.
// Computes editDiff(aiSnapshot, publishedSnapshot), writes editStats to the
// post, then for each zone with edit ratio > THRESHOLD invokes Claude Haiku
// to extract a 1-2 sentence structural pattern. Idempotency-keyed by
// {postId}_{diffHash}_{zone}.

import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import { getAnthropicKey } from './getAnthropicKey.js';
import { makeAnthropicClient } from './anthropic.js';
import { computeEditDiff, type DiffZone, type EditDiff } from '../../shared/lib/editDiff.js';
import {
  PatternExtractionSchema,
  type LearnedPattern,
} from '../../shared/schemas/learnedPattern.js';
import type { SocialSlide } from '../../shared/types/slide.js';

// Below this ratio the edit is treated as noise (typo, single-word swap).
// 0.15 = ~15% Levenshtein distance over max(original, edited) length.
const EDIT_RATIO_THRESHOLD = 0.15;
const HAIKU_MODEL = 'claude-haiku-4-5';
const HAIKU_MAX_TOKENS = 400;

interface PublishedPostShape {
  uid: string;
  brandId: string;
  postId: string;
  mode: 'create-demand' | 'convert-demand';
  method: 'story' | 'liste' | 'vorher-nachher' | 'zitat';
  aiSnapshot: { slides: SocialSlide[]; caption: string };
  publishedSnapshot: { slides: SocialSlide[]; caption: string };
}

function buildExtractionPrompt(
  zone: DiffZone,
  examples: { original: string; edited: string }[],
): string {
  const examplesBlock = examples
    .map((e, i) => `Example ${i + 1}:\nAI baseline: ${e.original}\nPublished: ${e.edited}`)
    .join('\n\n');

  return `You are analyzing how an AI-generated Instagram carousel was edited before publishing. The author kept the post structure but rewrote specific parts. Identify ONE structural rule the next AI first-shot for this brand should follow to land closer to what the author actually wants.

Zone analyzed: ${zone}

${examplesBlock}

Output a single JSON object with no surrounding text:
{ "description": string, "confidence": number }

- description: 1-2 sentences, focus on STRUCTURAL or STYLISTIC pattern (length, sentence shape, voice, formality, punctuation), NOT content specifics. Write it as a directive future prompts can use.
- confidence: 0.0-1.0. 1.0 = clearly evident pattern, 0.3 = guess, below 0.3 = drop the rule.

Return ONLY the JSON. No markdown fences, no commentary.`;
}

async function extractPattern(
  apiKey: string,
  zone: DiffZone,
  examples: { original: string; edited: string }[],
): Promise<{ description: string; confidence: number } | null> {
  const client = makeAnthropicClient(apiKey);
  const prompt = buildExtractionPrompt(zone, examples);

  const tryParse = (text: string): { description: string; confidence: number } | null => {
    // Strip optional markdown fence
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    try {
      const obj = JSON.parse(cleaned);
      const parsed = PatternExtractionSchema.safeParse(obj);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const finalPrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\nIMPORTANT: previous attempt did not return valid JSON. Return ONLY the JSON object, nothing else.`;
    let text = '';
    try {
      const resp = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: HAIKU_MAX_TOKENS,
        messages: [{ role: 'user', content: finalPrompt }],
      });
      for (const block of resp.content) {
        if (block.type === 'text') text += block.text;
      }
    } catch (err) {
      console.error('[learningExtractor] anthropic call failed:', (err as Error).message);
      return null;
    }
    const parsed = tryParse(text);
    if (parsed && parsed.confidence >= 0.3) return parsed;
    if (parsed && parsed.confidence < 0.3) return null; // model itself flagged low confidence
  }
  return null;
}

export async function runLearningExtraction(input: PublishedPostShape): Promise<void> {
  const { uid, brandId, postId, aiSnapshot, publishedSnapshot, mode, method } = input;

  let diff: EditDiff;
  try {
    diff = computeEditDiff(aiSnapshot, publishedSnapshot);
  } catch (err) {
    console.error('[learningExtractor] diff failed:', (err as Error).message);
    return;
  }

  // Always write editStats - drives Phase 4b dashboard even when no patterns extracted.
  try {
    await db.doc(`users/${uid}/brands/${brandId}/posts/${postId}`).update({
      editStats: {
        editRatioByZone: {
          hook: diff.byZone.hook.ratio,
          body: diff.byZone.body.ratio,
          cta: diff.byZone.cta.ratio,
          caption: diff.byZone.caption.ratio,
        },
        totalEditRatio: diff.totalRatio,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[learningExtractor] editStats write failed:', (err as Error).message);
    // continue - pattern extraction still useful
  }

  // Group edited zone instances by DiffZone for pattern extraction
  const grouped: Record<DiffZone, { original: string; edited: string }[]> = {
    hook: [],
    body: [],
    cta: [],
    caption: [],
  };
  for (const z of diff.zones) {
    if (z.ratio < EDIT_RATIO_THRESHOLD) continue;
    grouped[z.zone].push({ original: z.original, edited: z.edited });
  }

  // No meaningful edits to learn from
  const meaningfulZones = (Object.keys(grouped) as DiffZone[]).filter(
    (z) => grouped[z].length > 0,
  );
  if (meaningfulZones.length === 0) {
    console.log('[learningExtractor] no zones above threshold for', postId);
    return;
  }

  // Resolve user's Anthropic key
  let apiKey: string;
  try {
    apiKey = await getAnthropicKey(uid);
  } catch (err) {
    console.error('[learningExtractor] no anthropic key for', uid, (err as Error).message);
    return;
  }

  // Per-zone extraction with idempotency check
  for (const zone of meaningfulZones) {
    const idempotencyKey = `${postId}_${diff.diffHash}_${zone}`;
    try {
      const existing = await db
        .collection(`users/${uid}/brands/${brandId}/learnedPatterns`)
        .where('idempotencyKey', '==', idempotencyKey)
        .limit(1)
        .get();
      if (!existing.empty) {
        console.log('[learningExtractor] idempotent skip', idempotencyKey);
        continue;
      }
    } catch (err) {
      console.error(
        '[learningExtractor] idempotency check failed:',
        (err as Error).message,
      );
      continue;
    }

    const extracted = await extractPattern(apiKey, zone, grouped[zone]);
    if (!extracted) {
      console.log('[learningExtractor] no pattern extracted for', zone, postId);
      continue;
    }

    const pattern: Omit<LearnedPattern, 'createdAt' | 'lastUsedAt'> & {
      createdAt: FirebaseFirestore.FieldValue;
      lastUsedAt: null;
    } = {
      description: extracted.description,
      confidence: extracted.confidence,
      zone,
      sourcePostId: postId,
      sourceMethod: method,
      sourceMode: mode,
      idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
      lastUsedAt: null,
      useCount: 0,
    };

    try {
      await db.collection(`users/${uid}/brands/${brandId}/learnedPatterns`).add(pattern);
      console.log(
        '[learningExtractor] pattern saved:',
        zone,
        `confidence=${extracted.confidence}`,
        postId,
      );
    } catch (err) {
      console.error(
        '[learningExtractor] pattern save failed:',
        (err as Error).message,
      );
    }
  }
}
