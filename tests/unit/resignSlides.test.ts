// Unit tests for server/lib/resignSlides.ts
//
// Storage is mocked via the optional getFileFn parameter — no vi.mock needed.
// Time is injected via the optional nowMs parameter.

import { describe, it, expect, vi } from 'vitest';
import {
  parseSignedUrlExpiry,
  resignIfExpiring,
  type GetFileFn,
  type ResignParams,
} from '../../server/lib/resignSlides.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEC = 1000;
const MIN = 60 * SEC;
const DAY = 24 * 60 * MIN;

/** Build a V4-style GCS signed URL that expires `expiresInMs` ms from `baseMs`. */
function makeV4Url(baseMs: number, expiresInMs: number): string {
  const created = new Date(baseMs);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const dateStr =
    `${created.getUTCFullYear()}` +
    `${pad(created.getUTCMonth() + 1)}` +
    `${pad(created.getUTCDate())}T` +
    `${pad(created.getUTCHours())}` +
    `${pad(created.getUTCMinutes())}` +
    `${pad(created.getUTCSeconds())}Z`;
  const durationSec = Math.round(expiresInMs / 1000);
  return (
    `https://storage.googleapis.com/bucket/renders/uid/brand/post/slide-0.png` +
    `?X-Goog-Algorithm=GOOG4-RSA-SHA256` +
    `&X-Goog-Date=${dateStr}` +
    `&X-Goog-Expires=${durationSec}` +
    `&X-Goog-Credential=sa%40proj.iam.gserviceaccount.com` +
    `&X-Goog-Signature=abc123`
  );
}

/** Build a V2-style GCS signed URL that expires at `expiresMs` (epoch ms). */
function makeV2Url(expiresMs: number): string {
  return (
    `https://storage.googleapis.com/bucket/renders/uid/brand/post/slide-0.png` +
    `?GoogleAccessId=sa%40proj.iam.gserviceaccount.com` +
    `&Expires=${Math.floor(expiresMs / 1000)}` +
    `&Signature=xyz`
  );
}

/** Mock GetFileFn that returns a deterministic fake URL. */
function makeMockGetFile(
  label = 'resigned',
): { getFileFn: GetFileFn; callPaths: string[] } {
  const callPaths: string[] = [];
  const getFileFn: GetFileFn = (path) => ({
    getSignedUrl: vi.fn(async ({ expires }: { action: string; expires: Date }) => {
      callPaths.push(path);
      return [`https://new.signed.url/${path}?mock=${label}&exp=${expires.getTime()}`];
    }),
  });
  return { getFileFn, callPaths };
}

// ── parseSignedUrlExpiry ──────────────────────────────────────────────────────

describe('parseSignedUrlExpiry', () => {
  const base = new Date('2026-05-01T12:00:00Z').getTime();

  it('V4: parses creation date + duration correctly', () => {
    const url = makeV4Url(base, 7 * DAY);
    const expiry = parseSignedUrlExpiry(url);
    expect(expiry).not.toBeNull();
    // Should be ~7 days after base (within 1s rounding)
    expect(Math.abs(expiry!.getTime() - (base + 7 * DAY))).toBeLessThan(SEC);
  });

  it('V2: parses unix timestamp correctly', () => {
    const expiresMs = base + 7 * DAY;
    const url = makeV2Url(expiresMs);
    const expiry = parseSignedUrlExpiry(url);
    expect(expiry).not.toBeNull();
    // V2 truncates to seconds, allow 1s delta
    expect(Math.abs(expiry!.getTime() - expiresMs)).toBeLessThan(SEC);
  });

  it('returns null for a plain (unsigned) URL', () => {
    expect(parseSignedUrlExpiry('https://example.com/image.png')).toBeNull();
  });

  it('returns null for a completely invalid string', () => {
    expect(parseSignedUrlExpiry('not-a-url')).toBeNull();
  });
});

// ── resignIfExpiring ──────────────────────────────────────────────────────────

describe('resignIfExpiring', () => {
  const now = new Date('2026-05-08T10:00:00Z').getTime();

  const baseParams = (urls: string[]): ResignParams => ({
    uid: 'u1',
    brandId: 'b1',
    postId: 'p1',
    renderedSlideUrls: urls,
  });

  // ── Case 1: URL expires very soon → re-sign ─────────────────────────────

  it('re-signs when URL expires within threshold (30 seconds)', async () => {
    // Created 7 days ago, expires in 30s from now
    const url = makeV4Url(now - 7 * DAY, 7 * DAY + 30 * SEC);
    const { getFileFn, callPaths } = makeMockGetFile('fresh');

    const result = await resignIfExpiring(baseParams([url]), 1, now, getFileFn);

    expect(result).not.toBeNull();
    expect(result!.newUrls).toHaveLength(1);
    expect(callPaths).toContain('renders/u1/b1/p1/slide-0.png');
    // New expiry should be ~7 days from now
    const expectedExpiry = now + 7 * DAY;
    expect(Math.abs(result!.newExpiresAt.getTime() - expectedExpiry)).toBeLessThan(SEC);
  });

  // ── Case 2: URL expires in 30 days → no-op ──────────────────────────────

  it('returns null when URL expires in 30 days (well beyond threshold)', async () => {
    // Created now, expires in 30 days
    const url = makeV4Url(now, 30 * DAY);
    const { getFileFn } = makeMockGetFile();

    const result = await resignIfExpiring(baseParams([url]), 1, now, getFileFn);

    expect(result).toBeNull();
  });

  // ── Case 3: URL already expired → re-sign ───────────────────────────────

  it('re-signs when URL is already expired', async () => {
    // Expired 1 hour ago
    const url = makeV4Url(now - 7 * DAY - 60 * MIN, 7 * DAY);
    const { getFileFn, callPaths } = makeMockGetFile('reissued');

    const result = await resignIfExpiring(baseParams([url]), 1, now, getFileFn);

    expect(result).not.toBeNull();
    expect(result!.newUrls).toHaveLength(1);
    expect(callPaths[0]).toBe('renders/u1/b1/p1/slide-0.png');
  });

  // ── Case 4: Unparseable URL → re-sign defensively ───────────────────────

  it('re-signs defensively when URL is not a recognisable signed URL', async () => {
    const { getFileFn } = makeMockGetFile('defensive');

    const result = await resignIfExpiring(
      baseParams(['https://example.com/not-a-signed-url.png']),
      1,
      now,
      getFileFn,
    );

    expect(result).not.toBeNull();
    expect(result!.newUrls).toHaveLength(1);
  });

  // ── Case 5: Empty array → null ───────────────────────────────────────────

  it('returns null for an empty renderedSlideUrls array', async () => {
    const { getFileFn } = makeMockGetFile();
    const result = await resignIfExpiring(baseParams([]), 1, now, getFileFn);
    expect(result).toBeNull();
  });

  // ── Case 6: Multi-slide post → all paths re-signed ──────────────────────

  it('re-signs all slides and generates correct storage paths', async () => {
    // 3-slide post where the first slide expires soon
    const expiringUrl = makeV4Url(now - 7 * DAY, 7 * DAY + 30 * SEC);
    const safeUrl1 = makeV4Url(now - 7 * DAY, 7 * DAY + 30 * SEC); // same expiry
    const safeUrl2 = makeV4Url(now - 7 * DAY, 7 * DAY + 30 * SEC);
    const { getFileFn, callPaths } = makeMockGetFile('multi');

    const result = await resignIfExpiring(
      baseParams([expiringUrl, safeUrl1, safeUrl2]),
      1,
      now,
      getFileFn,
    );

    expect(result).not.toBeNull();
    expect(result!.newUrls).toHaveLength(3);
    expect(callPaths).toEqual([
      'renders/u1/b1/p1/slide-0.png',
      'renders/u1/b1/p1/slide-1.png',
      'renders/u1/b1/p1/slide-2.png',
    ]);
  });

  // ── Case 7: Mixed batch — one expiring, one not → re-sign all ───────────

  it('re-signs all slides when only one expires soon (all-or-nothing batch)', async () => {
    const expiringUrl = makeV4Url(now - 7 * DAY, 7 * DAY + 5 * MIN); // expires in 5 min
    const freshUrl = makeV4Url(now, 7 * DAY); // freshly signed, 7 days left
    const { getFileFn, callPaths } = makeMockGetFile('mixed');

    const result = await resignIfExpiring(
      baseParams([freshUrl, expiringUrl]),
      1, // 1-day threshold
      now,
      getFileFn,
    );

    expect(result).not.toBeNull();
    expect(result!.newUrls).toHaveLength(2);
    // Both paths re-signed, not just the expiring one
    expect(callPaths).toHaveLength(2);
  });
});
