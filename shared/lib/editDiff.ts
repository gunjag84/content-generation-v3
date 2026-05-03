// Per-zone Levenshtein-based edit diff between aiSnapshot and publishedSnapshot.
// Adapted from v2 server/services/editDiff.ts; bucketed into hook/body/cta/caption
// for v3's learning loop.
//
// Zone classification:
//   slide.type === 'cta'           -> all text zones on slide = 'cta'
//   else zone.label === 'Hook'     -> 'hook'
//   else zone.label in {Body,Subtle} -> 'body'
//   else (Brand=logo, Divider)     -> excluded from learning
// Caption is treated as a separate zone bucket (slideIndex = null).

import type { SocialSlide } from '../types/slide.js';

export type DiffZone = 'hook' | 'body' | 'cta' | 'caption';

export interface ZoneEdit {
  zone: DiffZone;
  original: string;
  edited: string;
  ratio: number; // 0-1 normalized Levenshtein distance
  slideIndex: number | null; // null for caption
}

export interface ZoneAggregate {
  totalChars: number;
  totalDistance: number;
  ratio: number;
}

export interface EditDiff {
  zones: ZoneEdit[];
  byZone: Record<DiffZone, ZoneAggregate>;
  totalRatio: number;
  diffHash: string;
}

// Standard Levenshtein with two-row optimization. ~0(n*m) worst case.
// Adequate for typical zone text (<500 chars) and caption (<2200 chars).
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev: number[] = new Array(b.length + 1);
  let curr: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function classifyZone(slide: SocialSlide, label: string): DiffZone | null {
  if (slide.type === 'cta') return 'cta';
  if (label === 'Hook') return 'hook';
  if (label === 'Body' || label === 'Subtle') return 'body';
  return null;
}

// djb2-xor hash. Stable across runs, used only for idempotency keying.
function diffHashOf(zones: ZoneEdit[]): string {
  let h = 5381;
  for (const z of zones) {
    const s = `${z.zone}|${z.slideIndex}|${z.original}|${z.edited}`;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
      h = h | 0;
    }
  }
  return Math.abs(h).toString(36);
}

function emptyAggregate(): ZoneAggregate {
  return { totalChars: 0, totalDistance: 0, ratio: 0 };
}

export function computeEditDiff(
  before: { slides: SocialSlide[]; caption: string },
  after: { slides: SocialSlide[]; caption: string },
): EditDiff {
  const zones: ZoneEdit[] = [];
  const byZone: Record<DiffZone, ZoneAggregate> = {
    hook: emptyAggregate(),
    body: emptyAggregate(),
    cta: emptyAggregate(),
    caption: emptyAggregate(),
  };

  const slideCount = Math.max(before.slides.length, after.slides.length);
  for (let i = 0; i < slideCount; i++) {
    const beforeSlide = before.slides[i];
    const afterSlide = after.slides[i];
    if (!beforeSlide || !afterSlide) continue;

    const beforeZones = beforeSlide.zones ?? [];
    const afterZones = afterSlide.zones ?? [];

    for (let j = 0; j < afterZones.length; j++) {
      const aZone = afterZones[j];
      const cls = classifyZone(afterSlide, aZone.label);
      if (!cls) continue;
      // Match by id, fall back to positional index
      const bZone = beforeZones.find((z) => z.id === aZone.id) ?? beforeZones[j];
      if (!bZone) continue;
      const original = bZone.text ?? '';
      const edited = aZone.text ?? '';
      if (original === edited) continue;
      const dist = levenshtein(original, edited);
      const maxLen = Math.max(original.length, edited.length);
      const ratio = maxLen > 0 ? dist / maxLen : 0;
      zones.push({
        zone: cls,
        original,
        edited,
        ratio: Math.round(ratio * 1000) / 1000,
        slideIndex: i,
      });
      byZone[cls].totalChars += maxLen;
      byZone[cls].totalDistance += dist;
    }
  }

  // Caption (single string, not zone-list)
  if (before.caption !== after.caption) {
    const dist = levenshtein(before.caption, after.caption);
    const maxLen = Math.max(before.caption.length, after.caption.length);
    const ratio = maxLen > 0 ? dist / maxLen : 0;
    zones.push({
      zone: 'caption',
      original: before.caption,
      edited: after.caption,
      ratio: Math.round(ratio * 1000) / 1000,
      slideIndex: null,
    });
    byZone.caption.totalChars += maxLen;
    byZone.caption.totalDistance += dist;
  }

  let totalChars = 0;
  let totalDistance = 0;
  for (const k of ['hook', 'body', 'cta', 'caption'] as DiffZone[]) {
    const b = byZone[k];
    b.ratio = b.totalChars > 0 ? Math.round((b.totalDistance / b.totalChars) * 1000) / 1000 : 0;
    totalChars += b.totalChars;
    totalDistance += b.totalDistance;
  }
  const totalRatio =
    totalChars > 0 ? Math.round((totalDistance / totalChars) * 1000) / 1000 : 0;

  return { zones, byZone, totalRatio, diffHash: diffHashOf(zones) };
}
