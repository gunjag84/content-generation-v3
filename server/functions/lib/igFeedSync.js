"use strict";
// igFeedSync (Cloud Function, scheduled every 6h, region eu-west1)
//
// Pulls organic IG-Feed posts for every (uid, brandId) with a configured
// Meta token + instagramUserId, writes them as `source: 'ig-native'` docs
// into the SAME users/{uid}/brands/{brandId}/posts subcollection that
// tool-published posts live in. The existing igStatsSync (which queries
// `WHERE status==published AND igMediaId != null`) picks up the new docs
// on its own next tick - no coupling beyond the shared schema.
//
// Per-brand concurrency model:
//   - One status doc at users/{uid}/brands/{brandId}/igFeedSyncStatus/current
//     drives the Settings-Instagram-page banner (see
//     IgFeedSyncStatusDocSchema in shared/schemas/post.ts for shape).
//   - Source-collision protection: if a doc with source==='tool' already
//     exists at posts/{igMediaId}, we leave it alone (tool wins). Posts
//     with source==='ig-native' are overwritten so caption/permalink edits
//     in IG flow back into our system.
//   - Initial-sync cap: 200 items per brand on first run. Subsequent runs
//     traverse new items only via the 6h cron + paginate-until-known.
Object.defineProperty(exports, "__esModule", { value: true });
exports.__test = exports.igFeedSync = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const graphApi_js_1 = require("./graphApi.js");
if ((0, app_1.getApps)().length === 0)
    (0, app_1.initializeApp)();
const MAX_PER_BRAND = 200;
const MAX_PAGES = 10; // safety cap against runaway paging
const FEED_FIELDS = 'id,media_type,media_product_type,caption,permalink,media_url,thumbnail_url,timestamp';
// ── KMS decrypt (inlined; functions/ can't import server/lib/kms.ts) ──────────
async function decryptCiphertext(ciphertext) {
    const { KeyManagementServiceClient } = await import('@google-cloud/kms');
    const keyName = process.env.KMS_KEY_NAME;
    if (!keyName)
        throw new Error('KMS_KEY_NAME not set');
    const client = new KeyManagementServiceClient();
    const [r] = await client.decrypt({
        name: keyName,
        ciphertext: Buffer.from(ciphertext, 'base64'),
    });
    return Buffer.from(r.plaintext).toString('utf8');
}
async function writeStatus(db, uid, brandId, patch) {
    const ref = db.doc(`users/${uid}/brands/${brandId}/igFeedSyncStatus/current`);
    await ref.set({
        ...patch,
        lastSync: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
}
// ── feed paging ───────────────────────────────────────────────────────────────
async function fetchFeed(igUserId, accessToken) {
    const items = [];
    let url = `${graphApi_js_1.GRAPH_BASE}/${igUserId}/media` +
        `?fields=${encodeURIComponent(FEED_FIELDS)}&limit=50` +
        `&access_token=${encodeURIComponent(accessToken)}`;
    for (let page = 0; page < MAX_PAGES && url && items.length < MAX_PER_BRAND; page++) {
        const body = await (0, graphApi_js_1.fetchMetaJson)(url);
        const batch = Array.isArray(body?.data) ? body.data : [];
        items.push(...batch);
        const next = body?.paging?.next;
        url = typeof next === 'string' ? next : null;
    }
    return items.slice(0, MAX_PER_BRAND);
}
async function upsertFeedItems(db, uid, brandId, items) {
    const result = {
        written: 0,
        skippedTool: 0,
        skippedStory: 0,
        skippedUnknown: 0,
    };
    for (const item of items) {
        if (!item?.id) {
            result.skippedUnknown++;
            continue;
        }
        // STORY skip: check media_product_type, since media_type='IMAGE' for
        // both stories and feed posts. STORY = 24h-life, no historical value.
        if (item.media_product_type === 'STORY') {
            result.skippedStory++;
            continue;
        }
        const mediaType = (0, graphApi_js_1.parseMediaType)(item.media_type);
        if (mediaType === null) {
            result.skippedUnknown++;
            continue;
        }
        const ref = db.doc(`users/${uid}/brands/${brandId}/posts/${item.id}`);
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const existing = snap.exists ? snap.data() : null;
                if (existing?.source === 'tool') {
                    // tool wins; do not overwrite a post we published from the editor
                    result.skippedTool++;
                    return;
                }
                const publishedAt = item.timestamp ? new Date(item.timestamp) : null;
                const payload = {
                    source: 'ig-native',
                    status: 'published', // REQUIRED: igStatsSync queries WHERE status==='published'
                    igMediaId: item.id,
                    igPermalink: item.permalink ?? null,
                    mediaType,
                    mediaUrl: item.media_url ?? null,
                    thumbnailUrl: item.thumbnail_url ?? null,
                    caption: typeof item.caption === 'string' ? item.caption : '',
                    publishedAt: publishedAt ?? firestore_1.FieldValue.serverTimestamp(),
                    syncedAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    // createdAt only on first write
                    ...(snap.exists ? {} : { createdAt: firestore_1.FieldValue.serverTimestamp() }),
                };
                tx.set(ref, payload, { merge: true });
                result.written++;
            });
        }
        catch (err) {
            console.error('[igFeedSync] upsert failed', ref.path, err);
            result.skippedUnknown++;
        }
    }
    return result;
}
// ── per-brand orchestration ───────────────────────────────────────────────────
async function syncBrand(db, uid, brandId, brand) {
    const igUserId = brand.instagramUserId ?? null;
    const ct = brand.metaGraphCiphertext ?? null;
    if (!igUserId || !ct) {
        await writeStatus(db, uid, brandId, { status: 'not_configured' });
        return;
    }
    await writeStatus(db, uid, brandId, { status: 'syncing' });
    let token;
    try {
        token = await decryptCiphertext(ct);
    }
    catch (err) {
        console.error('[igFeedSync] kms decrypt failed', uid, brandId, err);
        await writeStatus(db, uid, brandId, {
            status: 'error',
            error: 'token decrypt failed',
        });
        return;
    }
    let items;
    try {
        items = await fetchFeed(igUserId, token);
    }
    catch (err) {
        if ((0, graphApi_js_1.isTokenExpiredError)(err)) {
            await writeStatus(db, uid, brandId, {
                status: 'token_expired',
                error: err instanceof Error ? err.message : String(err),
            });
            return;
        }
        if ((0, graphApi_js_1.isRateLimitError)(err)) {
            await writeStatus(db, uid, brandId, {
                status: 'rate_limited',
                error: err instanceof Error ? err.message : String(err),
            });
            return;
        }
        if (err instanceof graphApi_js_1.MetaApiException) {
            await writeStatus(db, uid, brandId, {
                status: 'parse_error',
                error: err.message,
            });
            return;
        }
        console.error('[igFeedSync] fetch failed', uid, brandId, err);
        await writeStatus(db, uid, brandId, {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
        });
        return;
    }
    let written = 0;
    try {
        const r = await upsertFeedItems(db, uid, brandId, items);
        written = r.written;
        console.log(`[igFeedSync] brand=${brandId} fetched=${items.length} written=${r.written} skippedTool=${r.skippedTool} skippedStory=${r.skippedStory} skippedUnknown=${r.skippedUnknown}`);
    }
    catch (err) {
        console.error('[igFeedSync] upsert phase failed', uid, brandId, err);
        await writeStatus(db, uid, brandId, {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
        });
        return;
    }
    await writeStatus(db, uid, brandId, {
        status: 'ok',
        itemCount: written,
        tokenExpiresInDays: (0, graphApi_js_1.tokenExpiresInDays)(brand.metaGraphSetAt),
    });
}
// ── Cloud Function ────────────────────────────────────────────────────────────
exports.igFeedSync = (0, scheduler_1.onSchedule)({ schedule: 'every 6 hours', region: 'europe-west1' }, async () => {
    const db = (0, firestore_1.getFirestore)();
    let userCount = 0;
    let brandCount = 0;
    const usersSnap = await db.collection('users').get();
    for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        userCount++;
        const brandsSnap = await db.collection(`users/${uid}/brands`).get();
        for (const brandDoc of brandsSnap.docs) {
            const brandId = brandDoc.id;
            brandCount++;
            const brand = brandDoc.data();
            try {
                await syncBrand(db, uid, brandId, brand);
            }
            catch (err) {
                console.error('[igFeedSync] brand-level error', uid, brandId, err);
            }
        }
    }
    console.log(`[igFeedSync] done: users=${userCount} brands=${brandCount}`);
});
// Exported for tests.
exports.__test = {
    fetchFeed,
    upsertFeedItems,
    syncBrand,
    writeStatus,
};
