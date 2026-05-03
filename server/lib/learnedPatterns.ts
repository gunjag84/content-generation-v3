// Loads top-N learned patterns for a brand and renders them as an XML block
// for injection into the system prompt. Patterns are scored by
// confidence × recency (exp-decay over days since lastUsedAt or createdAt).
//
// Filters out 'dismissed' patterns - the user has explicitly rejected those.

import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import type { LearnedPattern, PatternZone } from '../../shared/schemas/learnedPattern.js';
import {
  TOP_N,
  RECENCY_HALF_LIFE_DAYS,
  MAX_FETCH,
  PROMOTION_USE_COUNT,
  PROMOTION_CONFIDENCE,
} from './learningConfig.js';

export interface LoadedPattern extends LearnedPattern {
  id: string;
}

function recencyWeight(referenceMs: number): number {
  const ageDays = (Date.now() - referenceMs) / 86400000;
  return Math.exp((-Math.LN2 * ageDays) / RECENCY_HALF_LIFE_DAYS);
}

export async function loadTopPatterns(
  uid: string,
  brandId: string,
): Promise<LoadedPattern[]> {
  const snap = await db
    .collection(`users/${uid}/brands/${brandId}/learnedPatterns`)
    .limit(MAX_FETCH)
    .get();

  if (snap.empty) return [];

  const scored = snap.docs
    .map((d) => ({ id: d.id, data: d.data() as LearnedPattern }))
    .filter((p) => (p.data.status ?? 'active') === 'active')
    .map(({ id, data }) => {
      const lastUsed = (data.lastUsedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? null;
      const created =
        (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now();
      const reference = lastUsed ?? created;
      const score = data.confidence * recencyWeight(reference);
      return { id, data, score };
    });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, TOP_N).map((s) => ({ id: s.id, ...s.data }));
}

// Reads ALL dismissed patterns for the brand. Used by the extractor to tell
// Haiku "user has rejected these rules; do not propose similar". Returns
// description strings only (the rest is irrelevant for anti-dup).
export async function loadDismissedPatternDescriptions(
  uid: string,
  brandId: string,
): Promise<string[]> {
  const snap = await db
    .collection(`users/${uid}/brands/${brandId}/learnedPatterns`)
    .where('status', '==', 'dismissed')
    .limit(MAX_FETCH)
    .get();
  return snap.docs.map((d) => (d.data().description as string) ?? '').filter(Boolean);
}

export function renderPatternsBlock(patterns: LoadedPattern[]): string {
  if (patterns.length === 0) return '';

  const grouped: Record<PatternZone, string[]> = {
    hook: [],
    body: [],
    cta: [],
    caption: [],
  };
  for (const p of patterns) {
    grouped[p.zone].push(p.description);
  }

  const lines: string[] = ['<learned_patterns>'];
  const order: PatternZone[] = ['hook', 'body', 'cta', 'caption'];
  for (const zone of order) {
    const items = grouped[zone];
    if (items.length === 0) continue;
    lines.push(`  <${zone}>`);
    for (const desc of items) lines.push(`    - ${desc}`);
    lines.push(`  </${zone}>`);
  }
  lines.push('</learned_patterns>');
  return lines.join('\n');
}

// Mark a set of patterns as used after a successful generate. Bumps useCount
// + lastUsedAt so the recency-weighted score reflects active usage. Also
// flips promotionCandidate=true on patterns that cross the threshold this run.
export async function markPatternsUsed(
  uid: string,
  brandId: string,
  patterns: LoadedPattern[],
): Promise<void> {
  if (patterns.length === 0) return;
  const batch = db.batch();
  for (const p of patterns) {
    const ref = db.doc(`users/${uid}/brands/${brandId}/learnedPatterns/${p.id}`);
    const update: Record<string, unknown> = {
      lastUsedAt: FieldValue.serverTimestamp(),
      useCount: FieldValue.increment(1),
    };
    // Threshold check: useCount AFTER this increment is p.useCount + 1.
    // If we cross the bar AND the pattern's confidence already meets the
    // bar AND we haven't already flagged it, set the flag.
    const nextUseCount = (p.useCount ?? 0) + 1;
    if (
      !p.promotionCandidate &&
      nextUseCount >= PROMOTION_USE_COUNT &&
      p.confidence >= PROMOTION_CONFIDENCE
    ) {
      update.promotionCandidate = true;
    }
    batch.update(ref, update);
  }
  await batch.commit();
}

// List active promotion candidates for the brand (Settings UI).
export async function loadPromotionCandidates(
  uid: string,
  brandId: string,
): Promise<LoadedPattern[]> {
  const snap = await db
    .collection(`users/${uid}/brands/${brandId}/learnedPatterns`)
    .where('status', '==', 'active')
    .where('promotionCandidate', '==', true)
    .limit(50)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as LearnedPattern) }));
}
