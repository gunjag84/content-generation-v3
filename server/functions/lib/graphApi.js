"use strict";
// Shared Meta Graph API helpers for Cloud Functions in server/functions/.
//
// Lives HERE, not in server/lib/, because functions/ has its own tsconfig
// (rootDir='.', include:['*.ts']) and cannot import outside that scope.
// See server/functions/index.ts header for the rationale.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaApiException = exports.GRAPH_BASE = exports.GRAPH_VERSION = void 0;
exports.isTokenExpiredError = isTokenExpiredError;
exports.isRateLimitError = isRateLimitError;
exports.fetchMetaJson = fetchMetaJson;
exports.parseMediaType = parseMediaType;
exports.tokenExpiresInDays = tokenExpiresInDays;
exports.GRAPH_VERSION = 'v21.0';
exports.GRAPH_BASE = `https://graph.facebook.com/${exports.GRAPH_VERSION}`;
class MetaApiException extends Error {
    code;
    subcode;
    body;
    constructor(message, opts) {
        super(message);
        this.name = 'MetaApiException';
        this.code = opts?.code;
        this.subcode = opts?.subcode;
        this.body = opts?.body;
    }
}
exports.MetaApiException = MetaApiException;
// Token expired (re-auth required). Code 190 OR HTTP 401 with auth subtype.
function isTokenExpiredError(err) {
    if (!(err instanceof MetaApiException))
        return false;
    return err.code === 190;
}
// Application-level rate limit. Code 4 (app rate limit) or 17 (user rate limit).
function isRateLimitError(err) {
    if (!(err instanceof MetaApiException))
        return false;
    return err.code === 4 || err.code === 17 || err.code === 32 || err.code === 613;
}
// Generic JSON GET against Meta. Throws MetaApiException on non-2xx or
// `error` field in the response body. Caller decides what to do based on
// .code (190 = re-auth, 4 = backoff, etc.).
async function fetchMetaJson(url) {
    let res;
    try {
        res = await fetch(url);
    }
    catch (e) {
        throw new MetaApiException(`network error: ${e instanceof Error ? e.message : String(e)}`);
    }
    let body;
    try {
        body = await res.json();
    }
    catch {
        throw new MetaApiException(`non-JSON response (HTTP ${res.status})`, { body: undefined });
    }
    if (!res.ok || body?.error) {
        const err = body?.error;
        const msg = err?.message ?? `HTTP ${res.status}`;
        throw new MetaApiException(msg, {
            code: err?.code,
            subcode: err?.error_subcode,
            body,
        });
    }
    return body;
}
// Coerce the Graph API media_type string into our narrow union. STORY is
// valid IG media_type but is filtered out before this function is called
// (24h life - no historical value). Returns null for unrecognized values
// so the caller can decide skip-vs-fail.
function parseMediaType(raw) {
    if (raw === 'IMAGE')
        return 'IMAGE';
    if (raw === 'CAROUSEL_ALBUM')
        return 'CAROUSEL_ALBUM';
    if (raw === 'VIDEO' || raw === 'REELS')
        return 'REELS';
    return null;
}
// Approximate days until the long-lived token expires. Meta long-lived
// tokens are 60-day. We use brand.metaGraphSetAt as the issuance proxy
// since the token itself is opaque (NOT a JWT - the v2 plan note got that
// wrong; the /debug_token endpoint would be authoritative but adds a
// network call per sync). Returns null when `setAt` is missing/unparseable.
function tokenExpiresInDays(setAt) {
    const setAtMs = toMillis(setAt);
    if (setAtMs === null)
        return null;
    const ageDays = (Date.now() - setAtMs) / 86400000;
    return Math.max(0, Math.round(60 - ageDays));
}
function toMillis(v) {
    if (v == null)
        return null;
    if (typeof v === 'number')
        return v;
    if (typeof v === 'string') {
        const t = Date.parse(v);
        return Number.isFinite(t) ? t : null;
    }
    // Firestore Timestamp (admin SDK or duck-typed)
    if (typeof v.toDate === 'function') {
        return v.toDate().getTime();
    }
    if (typeof v._seconds === 'number') {
        return v._seconds * 1000;
    }
    return null;
}
