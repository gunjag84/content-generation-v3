// Pure stats helpers shared between client dashboard widgets and future Phase 4c Cloud Function.

import type { Post, IgStats, IgMediaType } from '../schemas/post.js';
import { isToolPost } from './postTypeGuards.js';

// ---------------------------------------------------------------------------
// Timestamp narrowing helpers
// ---------------------------------------------------------------------------

// Firestore Timestamp shape we depend on (duck-typed to avoid import coupling
// between server/client Timestamp classes).
interface TimestampLike {
  toDate(): Date;
}

function isTimestampLike(v: unknown): v is TimestampLike {
  return (
    v !== null &&
    v !== undefined &&
    typeof (v as Record<string, unknown>)['toDate'] === 'function'
  );
}

export function safePublishedAt(post: Pick<Post, 'publishedAt'>): Date | null {
  const v = post.publishedAt;
  if (v == null) return null;
  if (!isTimestampLike(v)) return null;
  return v.toDate();
}

export function safeSyncedAt(stats: IgStats | null | undefined): Date | null {
  if (stats == null) return null;
  const v = stats.syncedAt;
  if (v == null) return null;
  if (!isTimestampLike(v)) return null;
  return v.toDate();
}

// ---------------------------------------------------------------------------
// engagementRate
// ---------------------------------------------------------------------------

// Media-type-aware. Reels-engagement uses plays in the denominator
// (Meta-recommended for video), the rest uses reach. Returns null when the
// denominator is missing/zero.
export function engagementRate(
  stats: IgStats | null | undefined,
  mediaType?: IgMediaType,
): number | null {
  if (stats == null) return null;
  const likes = stats.likes ?? 0;
  const comments = stats.comments ?? 0;
  const saves = stats.saves ?? 0;
  const shares = stats.shares ?? 0;

  if (mediaType === 'REELS') {
    const plays = stats.plays ?? stats.videoViews;
    if (plays == null || plays === 0) return null;
    return (likes + comments + saves + shares) / plays;
  }

  const reach = stats.reach;
  if (reach == null || reach === 0) return null;
  return (likes + comments + saves) / reach;
}

// Convenience wrapper that pulls mediaType off a Post.
export function engagementRateForPost(post: Post): number | null {
  return engagementRate(post.igStats ?? null, post.mediaType);
}

// ---------------------------------------------------------------------------
// aggregateBy
// ---------------------------------------------------------------------------

export interface AggregateBucket {
  avgEng: number | null;
  avgEditRatio: number | null;
  n: number;
}

export function aggregateBy<K>(
  posts: Post[],
  keyFn: (p: Post) => K,
  options?: { minCount?: number },
): Map<K, AggregateBucket> {
  // Intermediate accumulators
  const acc = new Map<
    K,
    { engSum: number; engCount: number; editSum: number; editCount: number; n: number }
  >();

  for (const post of posts) {
    const key = keyFn(post);
    if (!acc.has(key)) {
      acc.set(key, { engSum: 0, engCount: 0, editSum: 0, editCount: 0, n: 0 });
    }
    const bucket = acc.get(key)!;
    bucket.n += 1;

    const eng = engagementRate(post.igStats ?? null, post.mediaType);
    if (eng !== null) {
      bucket.engSum += eng;
      bucket.engCount += 1;
    }

    // edit-ratio is a tool-only signal (ig-native posts have no AI baseline
    // to diff against). aggregateBy callers that bucket by tool-only fields
    // like `method` should pre-filter via isToolPost; this guard keeps
    // ig-native posts from counting toward the editRatio average if they
    // ever sneak through.
    if (isToolPost(post) && post.editStats != null) {
      bucket.editSum += post.editStats.totalEditRatio;
      bucket.editCount += 1;
    }
  }

  const result = new Map<K, AggregateBucket>();
  const minCount = options?.minCount ?? 0;

  for (const [key, b] of acc) {
    if (b.n < minCount) continue;
    result.set(key, {
      avgEng: b.engCount > 0 ? b.engSum / b.engCount : null,
      avgEditRatio: b.editCount > 0 ? b.editSum / b.editCount : null,
      n: b.n,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// aggregateByDayOfWeek
// ---------------------------------------------------------------------------

export function aggregateByDayOfWeek(
  posts: Post[],
  options?: { minCount?: number },
): Map<number, AggregateBucket> {
  const withDate = posts.filter((p) => safePublishedAt(p) !== null);
  return aggregateBy(
    withDate,
    (p) => safePublishedAt(p)!.getUTCDay(),
    options,
  );
}

// ---------------------------------------------------------------------------
// hotspotZone
// ---------------------------------------------------------------------------

const ZONE_ORDER = ['hook', 'body', 'cta', 'caption'] as const;
type HotspotZone = (typeof ZONE_ORDER)[number];

export function hotspotZone(
  posts: Post[],
): { zone: HotspotZone; avg: number } | null {
  const sums: Record<HotspotZone, number> = { hook: 0, body: 0, cta: 0, caption: 0 };
  const counts: Record<HotspotZone, number> = { hook: 0, body: 0, cta: 0, caption: 0 };

  for (const post of posts) {
    if (post.editStats == null) continue;
    for (const zone of ZONE_ORDER) {
      sums[zone] += post.editStats.editRatioByZone[zone];
      counts[zone] += 1;
    }
  }

  // Check if any post had editStats
  if (counts.hook === 0 && counts.body === 0 && counts.cta === 0 && counts.caption === 0) {
    return null;
  }

  let best: HotspotZone = ZONE_ORDER[0];
  let bestAvg = counts[best] > 0 ? sums[best] / counts[best] : -Infinity;

  for (const zone of ZONE_ORDER) {
    const avg = counts[zone] > 0 ? sums[zone] / counts[zone] : -Infinity;
    // Strict > so tie keeps earlier zone (ZONE_ORDER tie-break: hook > body > cta > caption)
    if (avg > bestAvg) {
      best = zone;
      bestAvg = avg;
    }
  }

  return { zone: best, avg: bestAvg };
}

// ---------------------------------------------------------------------------
// freshestSyncedAt
// ---------------------------------------------------------------------------

export function freshestSyncedAt(posts: Post[]): Date | null {
  let max: Date | null = null;
  for (const post of posts) {
    const d = safeSyncedAt(post.igStats ?? null);
    if (d === null) continue;
    if (max === null || d.getTime() > max.getTime()) {
      max = d;
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// filterByPublishedSince
// ---------------------------------------------------------------------------

export function filterByPublishedSince(posts: Post[], days: number): Post[] {
  const cutoff = Date.now() - days * 86400000;
  return posts.filter((p) => {
    const d = safePublishedAt(p);
    if (d === null) return false;
    return d.getTime() >= cutoff;
  });
}
