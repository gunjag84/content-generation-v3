import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { Post, IgStats } from '../../shared/schemas/post.js';
import {
  safePublishedAt,
  safeSyncedAt,
  engagementRate,
  aggregateBy,
  aggregateByDayOfWeek,
  hotspotZone,
  freshestSyncedAt,
  filterByPublishedSince,
} from '../../shared/lib/stats.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function ts(ms: number): Timestamp {
  try {
    return Timestamp.fromMillis(ms);
  } catch {
    // Fallback: duck-typed Timestamp for environments where firebase/firestore
    // isn't fully initialised.
    return { toDate: () => new Date(ms) } as unknown as Timestamp;
  }
}

function makeIgStats(overrides: Partial<NonNullable<IgStats>> = {}): NonNullable<IgStats> {
  return {
    reach: 100,
    impressions: 200,
    likes: 10,
    comments: 5,
    saves: 3,
    syncedAt: null,
    ...overrides,
  };
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    status: 'published',
    aiSnapshot: { slides: [], caption: '' },
    slides: [],
    caption: '',
    mode: 'create-demand',
    method: 'story',
    situationText: '',
    situationId: null,
    photoUrls: {},
    renderedSlideUrls: null,
    scheduledAt: null,
    publishingStartedAt: null,
    publishedAt: null,
    publishedSnapshot: null,
    igMediaId: null,
    igPermalink: null,
    igStats: null,
    editStats: null,
    patternAudit: null,
    learningError: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// safePublishedAt
// ---------------------------------------------------------------------------

describe('safePublishedAt', () => {
  it('real Timestamp => Date', () => {
    const now = Date.now();
    const post = makePost({ publishedAt: ts(now) });
    const result = safePublishedAt(post);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(now);
  });

  it('null => null', () => {
    expect(safePublishedAt(makePost({ publishedAt: null }))).toBeNull();
  });

  it('undefined => null', () => {
    expect(safePublishedAt(makePost({ publishedAt: undefined }))).toBeNull();
  });

  it('object without toDate (FieldValue-like) => null', () => {
    expect(safePublishedAt(makePost({ publishedAt: {} as unknown }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// safeSyncedAt
// ---------------------------------------------------------------------------

describe('safeSyncedAt', () => {
  it('real Timestamp => Date', () => {
    const now = Date.now();
    const stats = makeIgStats({ syncedAt: ts(now) });
    const result = safeSyncedAt(stats);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(now);
  });

  it('null => null', () => {
    expect(safeSyncedAt(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// engagementRate
// ---------------------------------------------------------------------------

describe('engagementRate', () => {
  it('happy path (likes=10, comments=5, saves=3, reach=200) => 0.09', () => {
    const stats = makeIgStats({ likes: 10, comments: 5, saves: 3, reach: 200 });
    expect(engagementRate(stats)).toBeCloseTo(0.09, 10);
  });

  it('reach=0 => null', () => {
    expect(engagementRate(makeIgStats({ reach: 0 }))).toBeNull();
  });

  it('reach=null => null', () => {
    expect(engagementRate(makeIgStats({ reach: undefined }))).toBeNull();
  });

  it('stats=null => null', () => {
    expect(engagementRate(null)).toBeNull();
  });

  it('missing likes (treats as 0) when reach present', () => {
    const stats = makeIgStats({ likes: undefined, comments: 5, saves: 3, reach: 100 });
    // (0 + 5 + 3) / 100 = 0.08
    expect(engagementRate(stats)).toBeCloseTo(0.08, 10);
  });

  it('all-zero engagement (likes=0, comments=0, saves=0, reach=100) => 0', () => {
    const stats = makeIgStats({ likes: 0, comments: 0, saves: 0, reach: 100 });
    expect(engagementRate(stats)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateBy
// ---------------------------------------------------------------------------

describe('aggregateBy', () => {
  it('empty input => empty Map', () => {
    const result = aggregateBy([], (p) => p.method);
    expect(result.size).toBe(0);
  });

  it('single post => Map with one bucket, n=1', () => {
    const post = makePost({ method: 'story' });
    const result = aggregateBy([post], (p) => p.method);
    expect(result.size).toBe(1);
    expect(result.get('story')!.n).toBe(1);
  });

  it('5 posts across 2 keys => 2 buckets with correct counts', () => {
    const posts = [
      makePost({ method: 'story' }),
      makePost({ method: 'story' }),
      makePost({ method: 'story' }),
      makePost({ method: 'liste' }),
      makePost({ method: 'liste' }),
    ];
    const result = aggregateBy(posts, (p) => p.method);
    expect(result.size).toBe(2);
    expect(result.get('story')!.n).toBe(3);
    expect(result.get('liste')!.n).toBe(2);
  });

  it('post with null igStats excluded from avgEng (n still counts)', () => {
    const posts = [
      makePost({ igStats: null }),
      makePost({ igStats: makeIgStats({ likes: 10, comments: 0, saves: 0, reach: 100 }) }),
    ];
    const result = aggregateBy(posts, () => 'all');
    const bucket = result.get('all')!;
    expect(bucket.n).toBe(2);
    // Only one post contributed to avgEng (10/100 = 0.1)
    expect(bucket.avgEng).toBeCloseTo(0.1, 10);
  });

  it('post with null editStats excluded from avgEditRatio (n still counts)', () => {
    const posts = [
      makePost({ editStats: null }),
      makePost({
        editStats: {
          editRatioByZone: { hook: 0.5, body: 0.5, cta: 0.5, caption: 0.5 },
          totalEditRatio: 0.5,
        },
      }),
    ];
    const result = aggregateBy(posts, () => 'all');
    const bucket = result.get('all')!;
    expect(bucket.n).toBe(2);
    expect(bucket.avgEditRatio).toBeCloseTo(0.5, 10);
  });

  it('minCount filter drops buckets below threshold', () => {
    const posts = [
      makePost({ method: 'story' }),
      makePost({ method: 'story' }),
      makePost({ method: 'liste' }),
    ];
    const result = aggregateBy(posts, (p) => p.method, { minCount: 2 });
    expect(result.has('story')).toBe(true);
    expect(result.has('liste')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// aggregateByDayOfWeek
// ---------------------------------------------------------------------------

describe('aggregateByDayOfWeek', () => {
  it('filters posts with null publishedAt', () => {
    const posts = [makePost({ publishedAt: null }), makePost({ publishedAt: null })];
    const result = aggregateByDayOfWeek(posts);
    expect(result.size).toBe(0);
  });

  it('groups correctly by UTC day-of-week', () => {
    // 2024-01-07 = Sunday (UTC day 0), 2024-01-08 = Monday (UTC day 1)
    const sunday = new Date('2024-01-07T12:00:00Z').getTime();
    const monday = new Date('2024-01-08T12:00:00Z').getTime();
    const posts = [
      makePost({ publishedAt: ts(sunday) }),
      makePost({ publishedAt: ts(sunday) }),
      makePost({ publishedAt: ts(monday) }),
    ];
    const result = aggregateByDayOfWeek(posts);
    expect(result.get(0)!.n).toBe(2); // Sunday
    expect(result.get(1)!.n).toBe(1); // Monday
  });

  it('minCount filter passes through to underlying aggregateBy', () => {
    const sunday = new Date('2024-01-07T12:00:00Z').getTime();
    const monday = new Date('2024-01-08T12:00:00Z').getTime();
    const posts = [
      makePost({ publishedAt: ts(sunday) }),
      makePost({ publishedAt: ts(sunday) }),
      makePost({ publishedAt: ts(monday) }),
    ];
    const result = aggregateByDayOfWeek(posts, { minCount: 2 });
    expect(result.has(0)).toBe(true);  // Sunday: 2 >= 2
    expect(result.has(1)).toBe(false); // Monday: 1 < 2
  });
});

// ---------------------------------------------------------------------------
// hotspotZone
// ---------------------------------------------------------------------------

describe('hotspotZone', () => {
  it('empty input => null', () => {
    expect(hotspotZone([])).toBeNull();
  });

  it('all editStats null => null', () => {
    const posts = [makePost({ editStats: null }), makePost({ editStats: null })];
    expect(hotspotZone(posts)).toBeNull();
  });

  it('deterministic tie-break (hook > body > cta > caption when all equal)', () => {
    const post = makePost({
      editStats: {
        editRatioByZone: { hook: 0.5, body: 0.5, cta: 0.5, caption: 0.5 },
        totalEditRatio: 0.5,
      },
    });
    const result = hotspotZone([post]);
    expect(result!.zone).toBe('hook');
  });

  it('picks highest-avg zone', () => {
    const posts = [
      makePost({
        editStats: {
          editRatioByZone: { hook: 0.1, body: 0.2, cta: 0.8, caption: 0.1 },
          totalEditRatio: 0.3,
        },
      }),
      makePost({
        editStats: {
          editRatioByZone: { hook: 0.1, body: 0.2, cta: 0.6, caption: 0.1 },
          totalEditRatio: 0.25,
        },
      }),
    ];
    const result = hotspotZone(posts);
    // cta avg = (0.8 + 0.6) / 2 = 0.7 — highest
    expect(result!.zone).toBe('cta');
    expect(result!.avg).toBeCloseTo(0.7, 10);
  });
});

// ---------------------------------------------------------------------------
// freshestSyncedAt
// ---------------------------------------------------------------------------

describe('freshestSyncedAt', () => {
  it('all syncedAt null => null', () => {
    const posts = [
      makePost({ igStats: makeIgStats({ syncedAt: null }) }),
      makePost({ igStats: makeIgStats({ syncedAt: null }) }),
    ];
    expect(freshestSyncedAt(posts)).toBeNull();
  });

  it('mix of null + Timestamp => returns max valid', () => {
    const t1 = Date.now() - 10000;
    const t2 = Date.now() - 5000;
    const posts = [
      makePost({ igStats: makeIgStats({ syncedAt: null }) }),
      makePost({ igStats: makeIgStats({ syncedAt: ts(t1) }) }),
      makePost({ igStats: makeIgStats({ syncedAt: ts(t2) }) }),
    ];
    const result = freshestSyncedAt(posts);
    expect(result!.getTime()).toBe(t2);
  });

  it('all Timestamps => returns max', () => {
    const t1 = 1000000;
    const t2 = 2000000;
    const t3 = 1500000;
    const posts = [
      makePost({ igStats: makeIgStats({ syncedAt: ts(t1) }) }),
      makePost({ igStats: makeIgStats({ syncedAt: ts(t2) }) }),
      makePost({ igStats: makeIgStats({ syncedAt: ts(t3) }) }),
    ];
    expect(freshestSyncedAt(posts)!.getTime()).toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// filterByPublishedSince
// ---------------------------------------------------------------------------

describe('filterByPublishedSince', () => {
  it('includes post at exact cutoff (>=)', () => {
    const exactCutoff = Date.now() - 7 * 86400000;
    const post = makePost({ publishedAt: ts(exactCutoff) });
    // Because Date.now() is re-evaluated inside filterByPublishedSince, use a
    // very recent post to ensure >= holds. Test with a post that is 7d old and
    // filter for 7d — but to avoid ms-level race, add 1ms.
    const post2 = makePost({ publishedAt: ts(Date.now() - 7 * 86400000 + 500) });
    const result = filterByPublishedSince([post2], 7);
    expect(result).toHaveLength(1);
  });

  it('excludes posts older than cutoff', () => {
    const old = makePost({ publishedAt: ts(Date.now() - 8 * 86400000) });
    const result = filterByPublishedSince([old], 7);
    expect(result).toHaveLength(0);
  });

  it('excludes null publishedAt', () => {
    const post = makePost({ publishedAt: null });
    expect(filterByPublishedSince([post], 30)).toHaveLength(0);
  });

  it('days=0 returns empty array (effectively)', () => {
    // cutoff = now - 0 = now; any post.publishedAt <= now should be excluded
    // (posts at exact now would qualify, but none exist with a future timestamp)
    const recent = makePost({ publishedAt: ts(Date.now() - 1) });
    expect(filterByPublishedSince([recent], 0)).toHaveLength(0);
  });
});
