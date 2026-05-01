import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp();

const GRAPH_VERSION = 'v21.0';
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_PER_RUN = 50;

// ── helpers ──────────────────────────────────────────────────────────────────

function parsePostPath(path: string): { uid: string } | null {
  const parts = path.split('/');
  // users/{uid}/brands/{brandId}/posts/{postId}
  if (parts.length !== 6 || parts[0] !== 'users' || parts[4] !== 'posts') return null;
  return { uid: parts[1] };
}

async function getMetaTokenForUid(uid: string): Promise<string> {
  const db = getFirestore();
  const snap = await db.doc(`users/${uid}/secrets/apiKeys`).get();
  if (!snap.exists) throw new Error('No Meta access token on file.');
  const data = snap.data() as { meta_ciphertext?: string } | undefined;
  if (!data?.meta_ciphertext) throw new Error('No Meta access token on file.');

  // Import kmsDecrypt inline to avoid cross-package import issues inside the
  // functions sub-package (which has its own tsconfig / node_modules).
  const { KeyManagementServiceClient } = await import('@google-cloud/kms');
  const keyName = process.env.KMS_KEY_NAME;
  if (!keyName) throw new Error('KMS_KEY_NAME not set');
  const client = new KeyManagementServiceClient();
  const [r] = await client.decrypt({
    name: keyName,
    ciphertext: Buffer.from(data.meta_ciphertext, 'base64'),
  });
  return Buffer.from(r.plaintext as Uint8Array).toString('utf8');
}

interface IgInsights {
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  saves?: number;
}

async function fetchIgInsights(igMediaId: string, accessToken: string): Promise<IgInsights> {
  const metrics = 'reach,impressions,likes_count,comments_count,saved';
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
      case 'comments_count': out.comments = value; break;
      case 'saved': out.saves = value; break;
    }
  }
  return out;
}

// ── Cloud Function ────────────────────────────────────────────────────────────

export const igStatsSync = onSchedule(
  { schedule: 'every 6 hours', region: 'europe-west1' },
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
        const { uid } = parsed;
        const metaToken = await getMetaTokenForUid(uid);
        const insights = await fetchIgInsights(igMediaId, metaToken);

        await doc.ref.update({
          igStats: {
            ...insights,
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
