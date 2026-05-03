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
import { loadDismissedPatternDescriptions } from './learnedPatterns.js';
import {
  EDIT_RATIO_THRESHOLD,
  HAIKU_MODEL,
  HAIKU_EXTRACT_MAX_TOKENS,
} from './learningConfig.js';
import { updateApprovalLedgerForPublish } from './approvalLedger.js';

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
  rejectedRules: string[],
): string {
  const examplesBlock = examples
    .map((e, i) => `Example ${i + 1}:\nAI baseline: ${e.original}\nPublished: ${e.edited}`)
    .join('\n\n');

  const rejectedBlock =
    rejectedRules.length > 0
      ? `\n\nThe user has previously REJECTED the following rules. Do NOT propose anything semantically similar (rephrasing the same idea counts as similar):\n${rejectedRules.map((r) => `- ${r}`).join('\n')}`
      : '';

  return `You are analyzing how an AI-generated Instagram carousel was edited before publishing. The author kept the post structure but rewrote specific parts. Identify ONE structural rule the next AI first-shot for this brand should follow to land closer to what the author actually wants.

Zone analyzed: ${zone}

${examplesBlock}${rejectedBlock}

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
  rejectedRules: string[],
): Promise<{ description: string; confidence: number } | null> {
  const client = makeAnthropicClient(apiKey);
  const prompt = buildExtractionPrompt(zone, examples, rejectedRules);

  const tryParse = (text: string): { description: string; confidence: number } | null => {
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
        max_tokens: HAIKU_EXTRACT_MAX_TOKENS,
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

  const postRef = db.doc(`users/${uid}/brands/${brandId}/posts/${postId}`);

  const writeLearningError = (
    step: 'diff' | 'editStats' | 'apiKey' | 'extract' | 'audit' | 'persist' | 'ledger',
    err: Error,
  ): void => {
    postRef
      .update({
        learningError: { step, message: err.message, at: FieldValue.serverTimestamp() },
      })
      .catch((writeErr: Error) =>
        console.error('[learningExtractor] learningError write failed:', writeErr.message),
      );
  };

  let diff: EditDiff;
  try {
    diff = computeEditDiff(aiSnapshot, publishedSnapshot);
  } catch (err) {
    console.error('[learningExtractor] diff failed:', (err as Error).message);
    writeLearningError('diff', err as Error);
    return;
  }

  // Always write editStats - drives Phase 4b dashboard even when no patterns extracted.
  try {
    await postRef.update({
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
    writeLearningError('editStats', err as Error);
  }

  // F2: update approval ledger with this publish's edit ratio (fire-and-forget).
  updateApprovalLedgerForPublish({ uid, brandId, postEditRatio: diff.totalRatio }).catch(
    (err: Error) => {
      console.error('[learningExtractor] ledger update failed:', err.message);
      writeLearningError('ledger', err);
    },
  );

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

  const meaningfulZones = (Object.keys(grouped) as DiffZone[]).filter(
    (z) => grouped[z].length > 0,
  );
  if (meaningfulZones.length === 0) {
    console.log('[learningExtractor] no zones above threshold for', postId);
    return;
  }

  let apiKey: string;
  try {
    apiKey = await getAnthropicKey(uid);
  } catch (err) {
    console.error('[learningExtractor] no anthropic key for', uid, (err as Error).message);
    writeLearningError('apiKey', err as Error);
    return;
  }

  // Anti-duplication: feed dismissed patterns into Haiku as "do not propose
  // similar". Single read for the whole extraction (re-used across zones).
  let dismissedRules: string[] = [];
  try {
    dismissedRules = await loadDismissedPatternDescriptions(uid, brandId);
  } catch (err) {
    console.error(
      '[learningExtractor] failed to load dismissed patterns:',
      (err as Error).message,
    );
  }

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
      writeLearningError('persist', err as Error);
      continue;
    }

    const extracted = await extractPattern(apiKey, zone, grouped[zone], dismissedRules);
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
      status: 'active',
      promotionCandidate: false,
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
      writeLearningError('persist', err as Error);
    }
  }
}
