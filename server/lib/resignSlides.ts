// Re-sign helper for 7-day signed Storage URLs.
//
// Render outputs are stored as signed URLs that expire after 7 days.
// This helper detects imminent expiry (within `thresholdDays`, default 1)
// and re-signs all slides for another 7 days.
//
// Wiring (call sites) is intentionally deferred to a separate task per
// STATE.md: "re-sign helper deferred". This file only provides the helper
// and its unit tests.

import { getStorage } from 'firebase-admin/storage';

const SIGNED_URL_DAYS = 7;
const DEFAULT_THRESHOLD_DAYS = 1;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResignParams {
  uid: string;
  brandId: string;
  postId: string;
  /** The current array stored as post.renderedSlideUrls. */
  renderedSlideUrls: string[];
}

export interface ResignResult {
  newUrls: string[];
  newExpiresAt: Date;
}

/** Minimal file interface — real Storage files and mocks both satisfy this. */
export type StorageFileLike = {
  getSignedUrl(opts: { action: 'read'; expires: Date }): Promise<[string, ...unknown[]]>;
};

/** Factory that resolves a storage path to a file-like object. */
export type GetFileFn = (path: string) => StorageFileLike;

// ── URL expiry parsing ────────────────────────────────────────────────────────

/**
 * Parse the expiry date out of a GCS signed URL.
 *
 * Handles both signature versions:
 * - V4: `X-Goog-Date=YYYYMMDDTHHMMSSZ` + `X-Goog-Expires=<seconds>`
 * - V2: `Expires=<unix-timestamp-seconds>`
 *
 * Returns `null` when the URL is not a recognisable signed URL.
 */
export function parseSignedUrlExpiry(url: string): Date | null {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return null;
  }

  // V4 signed URL
  const v4Date = params.get('X-Goog-Date');
  const v4Expires = params.get('X-Goog-Expires');
  if (v4Date && v4Expires) {
    // X-Goog-Date format: YYYYMMDDTHHMMSSZ → reformat to ISO 8601
    const iso = v4Date.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      '$1-$2-$3T$4:$5:$6Z',
    );
    const created = new Date(iso);
    if (isNaN(created.getTime())) return null;
    const durationSec = Number(v4Expires);
    if (isNaN(durationSec)) return null;
    return new Date(created.getTime() + durationSec * 1000);
  }

  // V2 signed URL
  const v2Expires = params.get('Expires');
  if (v2Expires) {
    const ts = Number(v2Expires);
    if (isNaN(ts)) return null;
    return new Date(ts * 1000);
  }

  return null;
}

// ── Main helper ──────────────────────────────────────────────────────────────

/**
 * Re-sign all slides if any URL expires within `thresholdDays`.
 *
 * Returns `null` when no re-sign is needed.
 *
 * `nowMs` and `getFileFn` are injectable for testing. Production callers
 * omit both and get the real Storage client + `Date.now()`.
 */
export async function resignIfExpiring(
  params: ResignParams,
  thresholdDays = DEFAULT_THRESHOLD_DAYS,
  nowMs = Date.now(),
  getFileFn: GetFileFn = defaultGetFile,
): Promise<ResignResult | null> {
  const { uid, brandId, postId, renderedSlideUrls } = params;

  if (renderedSlideUrls.length === 0) return null;

  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const deadline = nowMs + thresholdMs;

  const needsResign = renderedSlideUrls.some((url) => {
    const expiry = parseSignedUrlExpiry(url);
    // Unparseable URL → re-sign defensively
    if (expiry === null) return true;
    return expiry.getTime() <= deadline;
  });

  if (!needsResign) return null;

  const newExpiresAt = new Date(nowMs + SIGNED_URL_DAYS * 24 * 60 * 60 * 1000);

  const newUrls = await Promise.all(
    renderedSlideUrls.map(async (_, i) => {
      const path = `renders/${uid}/${brandId}/${postId}/slide-${i}.png`;
      const [url] = await getFileFn(path).getSignedUrl({
        action: 'read',
        expires: newExpiresAt,
      });
      return url;
    }),
  );

  return { newUrls, newExpiresAt };
}

// ── Internal default (not exported — callers never touch Storage directly) ───

function defaultGetFile(path: string): StorageFileLike {
  return getStorage().bucket().file(path);
}
