// Shared Meta Graph API helpers for Cloud Functions in server/functions/.
//
// Lives HERE, not in server/lib/, because functions/ has its own tsconfig
// (rootDir='.', include:['*.ts']) and cannot import outside that scope.
// See server/functions/index.ts header for the rationale.

export const GRAPH_VERSION = 'v21.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type IgMediaType = 'IMAGE' | 'CAROUSEL_ALBUM' | 'REELS';

export interface MetaApiError {
  code?: number;
  type?: string;
  message?: string;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class MetaApiException extends Error {
  code?: number;
  subcode?: number;
  body?: unknown;
  constructor(message: string, opts?: { code?: number; subcode?: number; body?: unknown }) {
    super(message);
    this.name = 'MetaApiException';
    this.code = opts?.code;
    this.subcode = opts?.subcode;
    this.body = opts?.body;
  }
}

// Token expired (re-auth required). Code 190 OR HTTP 401 with auth subtype.
export function isTokenExpiredError(err: unknown): boolean {
  if (!(err instanceof MetaApiException)) return false;
  return err.code === 190;
}

// Application-level rate limit. Code 4 (app rate limit) or 17 (user rate limit).
export function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof MetaApiException)) return false;
  return err.code === 4 || err.code === 17 || err.code === 32 || err.code === 613;
}

// Generic JSON GET against Meta. Throws MetaApiException on non-2xx or
// `error` field in the response body. Caller decides what to do based on
// .code (190 = re-auth, 4 = backoff, etc.).
export async function fetchMetaJson<T = unknown>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new MetaApiException(
      `network error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  let body: any;
  try {
    body = await res.json();
  } catch {
    throw new MetaApiException(`non-JSON response (HTTP ${res.status})`, { body: undefined });
  }
  if (!res.ok || body?.error) {
    const err = body?.error as MetaApiError | undefined;
    const msg = err?.message ?? `HTTP ${res.status}`;
    throw new MetaApiException(msg, {
      code: err?.code,
      subcode: err?.error_subcode,
      body,
    });
  }
  return body as T;
}

// Coerce the Graph API media_type string into our narrow union. STORY is
// valid IG media_type but is filtered out before this function is called
// (24h life - no historical value). Returns null for unrecognized values
// so the caller can decide skip-vs-fail.
export function parseMediaType(raw: unknown): IgMediaType | null {
  if (raw === 'IMAGE') return 'IMAGE';
  if (raw === 'CAROUSEL_ALBUM') return 'CAROUSEL_ALBUM';
  if (raw === 'VIDEO' || raw === 'REELS') return 'REELS';
  return null;
}

// Approximate days until the long-lived token expires. Meta long-lived
// tokens are 60-day. We use brand.metaGraphSetAt as the issuance proxy
// since the token itself is opaque (NOT a JWT - the v2 plan note got that
// wrong; the /debug_token endpoint would be authoritative but adds a
// network call per sync). Returns null when `setAt` is missing/unparseable.
export function tokenExpiresInDays(setAt: unknown): number | null {
  const setAtMs = toMillis(setAt);
  if (setAtMs === null) return null;
  const ageDays = (Date.now() - setAtMs) / 86400000;
  return Math.max(0, Math.round(60 - ageDays));
}

function toMillis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  // Firestore Timestamp (admin SDK or duck-typed)
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate(): Date }).toDate().getTime();
  }
  if (typeof (v as { _seconds?: number })._seconds === 'number') {
    return (v as { _seconds: number })._seconds * 1000;
  }
  return null;
}
