// Phase 4a enforcement layer (post-generate audit).
// Fire-and-forget after a successful /api/generate. Asks Claude Haiku to
// judge whether each active brand pattern was followed in the AI output.
// Persists `patternAudit` on the post doc so:
//   - we can measure if prompt injection actually works (signal for whether
//     to escalate to constrained regeneration)
//   - the editor (Phase 4b) can surface advisory violation warnings.
//
// Never blocks the generate response. Never throws into the stream.

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import { makeAnthropicClient } from './anthropic.js';
import type { LoadedPattern } from './learnedPatterns.js';
import type { SocialSlide } from '../../shared/types/slide.js';
import { getZonePlainText } from '../../shared/types/slide.js';
import { HAIKU_MODEL, AUDIT_MAX_TOKENS } from './learningConfig.js';

const AuditResultSchema = z.object({
  results: z.array(
    z.object({
      patternId: z.string(),
      followed: z.boolean(),
      evidence: z.string().max(300),
    }),
  ),
});

interface AuditInput {
  uid: string;
  brandId: string;
  postId: string;
  apiKey: string;
  patterns: LoadedPattern[];
  output: { slides: SocialSlide[]; caption: string };
}

function renderPatternsForAudit(patterns: LoadedPattern[]): string {
  return patterns
    .map(
      (p) =>
        `id=${p.id} | zone=${p.zone} | ${p.description}`,
    )
    .join('\n');
}

function renderOutputForAudit(output: { slides: SocialSlide[]; caption: string }): string {
  const lines: string[] = [];
  for (let i = 0; i < output.slides.length; i++) {
    const s = output.slides[i];
    lines.push(`[Slide ${i + 1}, type=${s.type}]`);
    for (const z of s.zones ?? []) {
      lines.push(`  ${z.label}: ${getZonePlainText(z)}`);
    }
  }
  lines.push('');
  lines.push(`Caption: ${output.caption}`);
  return lines.join('\n');
}

function buildAuditPrompt(patterns: LoadedPattern[], output: { slides: SocialSlide[]; caption: string }): string {
  return `You are auditing whether an AI-generated Instagram carousel followed the brand's learned style patterns. Each pattern is a directive the model was meant to apply to a specific zone (hook, body, cta, caption).

Active patterns (one per line):
${renderPatternsForAudit(patterns)}

Generated output:
${renderOutputForAudit(output)}

For each pattern listed above, decide if it was followed in the corresponding zone of the output. Be strict: partial compliance counts as not followed unless the directive is clearly visible.

Output a single JSON object, no surrounding text or markdown fences:
{
  "results": [
    { "patternId": "<id from above>", "followed": true|false, "evidence": "<<=200 char quote or reason>" }
  ]
}

Include exactly one result per pattern in the same order. Return ONLY the JSON.`;
}

export async function auditAndPersistPatternMatch(input: AuditInput): Promise<void> {
  const { uid, brandId, postId, apiKey, patterns, output } = input;
  if (patterns.length === 0) return;

  const postRef = db.doc(`users/${uid}/brands/${brandId}/posts/${postId}`);

  const writeLearningError = (err: Error): void => {
    postRef
      .update({
        learningError: { step: 'audit', message: err.message, at: FieldValue.serverTimestamp() },
      })
      .catch((writeErr: Error) =>
        console.error('[patternAudit] learningError write failed:', writeErr.message),
      );
  };

  const client = makeAnthropicClient(apiKey);
  const prompt = buildAuditPrompt(patterns, output);

  let text = '';
  try {
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: AUDIT_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });
    for (const block of resp.content) {
      if (block.type === 'text') text += block.text;
    }
  } catch (err) {
    console.error('[patternAudit] anthropic call failed:', (err as Error).message);
    writeLearningError(err as Error);
    return;
  }

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed;
  try {
    parsed = AuditResultSchema.parse(JSON.parse(cleaned));
  } catch (err) {
    console.error('[patternAudit] invalid JSON from haiku:', (err as Error).message);
    writeLearningError(err as Error);
    return;
  }

  // Map patternId -> zone via the input patterns list (model only confirms followed/evidence).
  const zoneById = new Map(patterns.map((p) => [p.id, p.zone]));
  const augmented = parsed.results
    .filter((r) => zoneById.has(r.patternId))
    .map((r) => ({
      patternId: r.patternId,
      zone: zoneById.get(r.patternId)!,
      followed: r.followed,
      evidence: r.evidence,
    }));

  if (augmented.length === 0) {
    console.warn('[patternAudit] no recognized patternIds in audit output for', postId);
    return;
  }

  const followedCount = augmented.filter((r) => r.followed).length;
  const total = augmented.length;
  const score = total > 0 ? Math.round((followedCount / total) * 1000) / 1000 : 0;

  try {
    await postRef.update({
      patternAudit: {
        score,
        totalPatterns: total,
        followedCount,
        results: augmented,
        auditedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(
      `[patternAudit] postId=${postId} score=${score} (${followedCount}/${total} patterns followed)`,
    );
  } catch (err) {
    console.error('[patternAudit] write failed:', (err as Error).message);
    writeLearningError(err as Error);
  }
}
