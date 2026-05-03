// Loads top-N learned patterns for a brand and renders them as an XML block
// for injection into the system prompt. Patterns are scored by
// confidence × recency (exp-decay over days since lastUsedAt or createdAt).

import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import type { LearnedPattern, PatternZone } from '../../shared/schemas/learnedPattern.js';

const TOP_N = 20;
// Pattern weight halves every 30 days since last use. Keeps fresh signal
// dominant; aged patterns fade rather than disappearing abruptly.
const RECENCY_HALF_LIFE_DAYS = 30;
// Hard read cap to keep loadTopPatterns cheap; brands won't exceed this in practice.
const MAX_FETCH = 200;

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

  const scored = snap.docs.map((d) => {
    const data = d.data() as LearnedPattern;
    const lastUsed = (data.lastUsedAt as { toMillis?: () => number } | null)?.toMillis?.() ?? null;
    const created =
      (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Date.now();
    const reference = lastUsed ?? created;
    const score = data.confidence * recencyWeight(reference);
    return { id: d.id, data, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, TOP_N).map((s) => ({ id: s.id, ...s.data }));
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
// + lastUsedAt so the recency-weighted score reflects active usage.
export async function markPatternsUsed(
  uid: string,
  brandId: string,
  patternIds: string[],
): Promise<void> {
  if (patternIds.length === 0) return;
  const batch = db.batch();
  for (const id of patternIds) {
    const ref = db.doc(`users/${uid}/brands/${brandId}/learnedPatterns/${id}`);
    batch.update(ref, {
      lastUsedAt: FieldValue.serverTimestamp(),
      useCount: FieldValue.increment(1),
    });
  }
  await batch.commit();
}
