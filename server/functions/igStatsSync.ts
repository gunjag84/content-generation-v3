import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp();

const GRAPH_VERSION = 'v21.0';
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_PER_RUN = 200;

// ── helpers ──────────────────────────────────────────────────────────────────

function parsePostPath(path: string): { uid: string; brandId: string } | null {
  const parts = path.split('/');
  // users/{uid}/brands/{brandId}/posts/{postId}
  if (parts.length !== 6 || parts[0] !== 'users' || parts[2] !== 'brands' || parts[4] !== 'posts') {
    return null;
  }
  return { uid: parts[1], brandId: parts[3] };
}

async function decryptCiphertext(ciphertext: string): Promise<string> {
  // Inline KMS decrypt (functions sub-package can't import server/lib/kms.ts;
  // see server/functions/index.ts header).
  const { KeyManagementServiceClient } = await import('@google-cloud/kms');
  const keyName = process.env.KMS_KEY_NAME;
  if (!keyName) throw new Error('KMS_KEY_NAME not set');
  const client = new KeyManagementServiceClient();
  const [r] = await client.decrypt({
    name: keyName,
    ciphertext: Buffer.from(ciphertext, 'base64'),
  });
  return Buffer.from(r.plaintext as Uint8Array).toString('utf8');
}

interface BrandCredentials {
  token: string;
  igUserId: string;
  igUsername: string | null; // resolved from /{igUserId}?fields=username; null on fetch fail
}

// Multi-brand migration (2026-05-06): primary read is brand-scoped. Falls back
// to legacy users/{uid}.apiKeys.metaGraph during the 1-week observation window.
// Mirror of server/lib/getMetaToken.ts.
async function getBrandCredentials(uid: string, brandId: string): Promise<BrandCredentials> {
  const db = getFirestore();

  const brandSnap = await db.doc(`users/${uid}/brands/${brandId}`).get();
  const brandData = brandSnap.data() as
    | { metaGraphCiphertext?: string | null; instagramUserId?: string | null }
    | undefined;
  const igUserId = brandData?.instagramUserId ?? null;
  const brandCt = brandData?.metaGraphCiphertext ?? null;

  if (!igUserId) {
    throw new Error(`No instagramUserId configured for brand ${brandId} (uid=${uid}).`);
  }

  let token: string;
  if (brandCt) {
    token = await decryptCiphertext(brandCt);
  } else {
    // Legacy fallback (remove after cleanup deploy).
    const userSnap = await db.doc(`users/${uid}`).get();
    const userData = userSnap.data() as { apiKeys?: { metaGraph?: string } } | undefined;
    const userCt = userData?.apiKeys?.metaGraph;
    if (!userCt) throw new Error(`No Meta token configured for brand ${brandId} (uid=${uid}).`);
    console.warn(`[igStatsSync] legacy fallback used for uid=${uid} brandId=${brandId}`);
    token = await decryptCiphertext(userCt);
  }

  // Resolve the IG username (handle, e.g. "leben.lieben") for v22+ self-comment
  // detection. Meta v22 removed the `from` field on comments; the new pattern
  // matches `comment.username === igUsername` OR `!!comment.user`.
  let igUsername: string | null = null;
  try {
    const url = `${BASE}/${igUserId}?fields=username&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const body = (await res.json()) as { username?: string; error?: { message?: string } };
    if (res.ok && !body?.error && typeof body.username === 'string') {
      igUsername = body.username;
    } else {
      console.warn('[igStatsSync] username fetch failed:', body?.error?.message ?? 'unknown');
    }
  } catch (err) {
    console.warn('[igStatsSync] username fetch threw:', err);
  }

  return { token, igUserId, igUsername };
}

// Followers GAINED through this specific post (Meta `follows` insight metric).
// Not all media types support it; on unsupported / failed returns null silently.
async function fetchPostFollows(mediaId: string, token: string): Promise<number | null> {
  try {
    const url = `${BASE}/${mediaId}/insights?metric=follows&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const body = (await res.json()) as {
      data?: Array<{ values?: Array<{ value?: number }> }>;
      error?: { message?: string };
    };
    if (!res.ok || body?.error) return null;
    const value = body.data?.[0]?.values?.[0]?.value;
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

// Count comments authored by the brand's own IG account (replies count too).
//
// Meta Graph API v22+ removed the `from` field on comments. The reliable
// v22+ pattern (mirrors content-generation v2):
//   - Request `?fields=username,user,replies.limit(50){username,user}`
//   - Self-detect: `username === igUsername` OR `!!user`. The `user` field
//     is only returned when the commenter IS the authenticated account
//     (a redundant signal that's reliable when usernames change).
//
// Returns null on fetch failure so callers leave igStats.ownComments unset
// rather than writing a wrong 0.
async function fetchOwnCommentsCount(
  mediaId: string,
  token: string,
  igUsername: string | null,
): Promise<number | null> {
  try {
    const url =
      `${BASE}/${mediaId}/comments` +
      `?fields=username,user,replies.limit(50){username,user}` +
      `&limit=50&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const body = (await res.json()) as {
      data?: Array<{
        username?: string;
        user?: unknown;
        replies?: { data?: Array<{ username?: string; user?: unknown }> };
      }>;
      error?: { message?: string };
    };
    if (!res.ok || body?.error) {
      console.warn('[igStatsSync] comments fetch failed for', mediaId, body?.error?.message);
      return null;
    }
    const isSelf = (c: { username?: string; user?: unknown }): boolean =>
      (igUsername !== null && c.username === igUsername) || !!c.user;
    let count = 0;
    for (const c of body.data ?? []) {
      if (isSelf(c)) count++;
      for (const r of c.replies?.data ?? []) {
        if (isSelf(r)) count++;
      }
    }
    return count;
  } catch (err) {
    console.warn('[igStatsSync] comments fetch threw for', mediaId, err);
    return null;
  }
}

interface IgInsights {
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  // Reels-only
  plays?: number;
  videoViews?: number;
  shares?: number;
}

type IgMediaType = 'IMAGE' | 'CAROUSEL_ALBUM' | 'REELS';

// Meta exposes a different metric set for video (Reels) vs photo. Asking
// for the wrong set returns an error per metric and skews aggregate stats.
// v22+ API drift (2026-05-07): `likes_count`/`comments_count` no longer
// accepted (use `likes`/`comments`); `impressions` and `plays` deprecated
// across IMAGE/CAROUSEL/REELS, replaced by unified `views`. Parser maps
// `views` -> out.impressions AND out.plays so HistoryTab columns and
// engagement-rate fallback (stats.plays ?? stats.videoViews) keep working.
function metricsForType(mediaType: IgMediaType | null): string {
  if (mediaType === 'REELS') {
    return 'views,reach,likes,comments,saved,shares,total_interactions';
  }
  // IMAGE + CAROUSEL_ALBUM (and legacy unset) - default photo metric set.
  return 'reach,views,likes,comments,saved';
}

async function fetchIgInsights(
  igMediaId: string,
  accessToken: string,
  mediaType: IgMediaType | null,
): Promise<IgInsights> {
  const metrics = metricsForType(mediaType);
  const url = `${BASE}/${igMediaId}/insights?metric=${metrics}&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const body = (await res.json()) as any;
  if (!res.ok || body?.error) {
    const code = body?.error?.code;
    const msg = body?.error?.message ?? JSON.stringify(body);
    throw new Error(`Meta insights error code=${code ?? 'unknown'}: ${msg}`);
  }

  // Meta returns { data: [{ name, values: [{ value }] }] }
  const out: IgInsights = {};
  for (const item of body?.data ?? []) {
    const value = item?.values?.[0]?.value ?? item?.value;
    switch (item.name) {
      case 'reach': out.reach = value; break;
      case 'impressions': out.impressions = value; break;
      case 'likes_count': out.likes = value; break;
      case 'likes': out.likes = value; break;
      case 'comments_count': out.comments = value; break;
      case 'comments': out.comments = value; break;
      case 'saved': out.saves = value; break;
      case 'plays': out.plays = value; break;
      case 'views':
        // v22+ unified metric: replaces both `impressions` (photo) and `plays` (Reels).
        // Map to both fields so HistoryTab column and engagement-rate fallback keep working.
        out.impressions = value;
        out.plays = value;
        break;
      case 'video_views': out.videoViews = value; break;
      case 'shares': out.shares = value; break;
    }
  }
  return out;
}

// ── Cloud Function ────────────────────────────────────────────────────────────

export const igStatsSync = onSchedule(
  {
    schedule: 'every 6 hours',
    region: 'europe-west1',
    // Pin SA: firebase deploy resets to compute SA otherwise, breaking KMS decrypt
    // (only content-gen-sa has roles/cloudkms.cryptoKeyEncrypterDecrypter on the
    // user-secrets/api-keys key).
    serviceAccount: 'content-gen-sa@contentai-78bfb.iam.gserviceaccount.com',
  },
  async () => {
    const db = getFirestore();
    const syncCutoff = new Date(Date.now() - SYNC_INTERVAL_MS);

    // Find published posts that need a stats refresh.
    // Two cohorts combined via separate queries (Firestore doesn't support OR):
    //   a) igStats == null (never synced)
    //   b) igStats.syncedAt < now - 6h
    // We query (a) with igStats == null and (b) by ordering on igStats.syncedAt.
    // Simplest approach: query status=published + igMediaId != null, then
    // filter stale in-process (avoids composite index on nested field).
    let snap: FirebaseFirestore.QuerySnapshot;
    try {
      snap = await db
        .collectionGroup('posts')
        .where('status', '==', 'published')
        .where('igMediaId', '!=', null)
        .limit(MAX_PER_RUN)
        .get();
    } catch (err) {
      console.error('[igStatsSync] query failed:', err);
      return;
    }

    let synced = 0;
    let skipped = 0;
    let errCount = 0;

    // Per-brand cache: credentials (token + igUserId + igUsername).
    // Avoids re-fetching credentials and re-resolving username per post.
    const brandCache = new Map<string, BrandCredentials>();

    for (const doc of snap.docs) {
      try {
        const data = doc.data();
        const igMediaId: string = data.igMediaId;

        // Filter stale in-process
        const igStats = data.igStats ?? null;
        if (igStats !== null) {
          const syncedAt: Date | null = igStats.syncedAt?.toDate?.() ?? null;
          if (syncedAt && syncedAt >= syncCutoff) {
            skipped++;
            continue;
          }
        }

        const parsed = parsePostPath(doc.ref.path);
        if (!parsed) {
          console.warn('[igStatsSync] unexpected path:', doc.ref.path);
          skipped++;
          continue;
        }
        const { uid, brandId } = parsed;

        const cacheKey = `${uid}/${brandId}`;
        let cached = brandCache.get(cacheKey);
        if (!cached) {
          cached = await getBrandCredentials(uid, brandId);
          brandCache.set(cacheKey, cached);
        }

        const mediaType: IgMediaType | null = (() => {
          const t = data.mediaType;
          if (t === 'IMAGE' || t === 'CAROUSEL_ALBUM' || t === 'REELS') return t;
          return null;
        })();
        const insights = await fetchIgInsights(igMediaId, cached.token, mediaType);
        const follows = await fetchPostFollows(igMediaId, cached.token);
        const ownComments = await fetchOwnCommentsCount(
          igMediaId,
          cached.token,
          cached.igUsername,
        );

        await doc.ref.update({
          igStats: {
            ...insights,
            follows,
            ownComments,
            syncedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        });
        synced++;
      } catch (err) {
        console.error('[igStatsSync] failed for', doc.ref.path, err);
        errCount++;
      }
    }

    console.log(`[igStatsSync] done: synced=${synced} skipped=${skipped} errors=${errCount}`);
  },
);
