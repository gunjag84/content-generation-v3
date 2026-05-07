/**
 * Integration test: approve pattern → zone-wide cleanup (F1)
 *
 * Requires the Firestore emulator running on localhost:8081.
 * Run: FIRESTORE_EMULATOR_HOST=localhost:8081 pnpm test:integration
 *
 * Tests the F1 zone-wide cleanup logic in isolation by replaying the same
 * batch operations the route handler performs. When a pattern is approved,
 * ALL active patterns in the same zone are deleted (zone-wide cleanup).
 * brand.identity[target] is updated with the merged text.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FieldValue } from 'firebase-admin/firestore';
import { getTestDb, clearCollection, TEST_PROJECT_ID } from './setup.js';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const run = EMULATOR_HOST ? it : it.skip;

const UID = 'test-uid-approve';
const BRAND_ID = 'test-brand-approve';
const COL = `users/${UID}/brands/${BRAND_ID}/learnedPatterns`;
const BRAND_DOC = `users/${UID}/brands/${BRAND_ID}`;

let db: FirebaseFirestore.Firestore;

beforeAll(async () => {
  if (!EMULATOR_HOST) return;
  process.env.GCLOUD_PROJECT = TEST_PROJECT_ID;
  db = await getTestDb();
});

beforeEach(async () => {
  if (!EMULATOR_HOST) return;
  await clearCollection(db, COL);
  // Reset brand doc to a known state.
  await db.doc(BRAND_DOC).set(
    { name: 'Test Brand', identity: { voice: '', persona: '' } },
    { merge: false },
  );
});

describe('approve pattern - zone-wide cleanup (F1)', () => {
  run(
    'deletes approved pattern + all active zone siblings; updates brand.identity.voice',
    async () => {
      const hookBase = {
        confidence: 0.8,
        zone: 'hook',
        sourcePostId: 'post-4',
        sourceMethod: 'story',
        sourceMode: 'create-demand',
        sourceLength: 'medium',
        promotionCandidate: true,
        status: 'active',
        createdAt: null,
        lastUsedAt: null,
        useCount: 3,
      };

      // 4 active hook patterns
      const approvedId = 'pat-to-approve';
      await db.doc(`${COL}/${approvedId}`).set({
        ...hookBase,
        description: 'Use short punchy sentences.',
        idempotencyKey: 'post-4_aaa_hook',
      });
      await db.doc(`${COL}/pat-sibling-1`).set({
        ...hookBase,
        description: 'Start with a bold claim.',
        idempotencyKey: 'post-4_bbb_hook',
      });
      await db.doc(`${COL}/pat-sibling-2`).set({
        ...hookBase,
        description: 'Ask a provocative question.',
        idempotencyKey: 'post-4_ccc_hook',
      });
      await db.doc(`${COL}/pat-sibling-3`).set({
        ...hookBase,
        description: 'Lead with the outcome.',
        idempotencyKey: 'post-4_ddd_hook',
      });

      // Replay the route's two-batch sequence:
      // Step 1: update brand identity + delete approved
      const mergedText = 'Use short punchy sentences. Start with a bold claim.';
      const batch1 = db.batch();
      batch1.update(db.doc(BRAND_DOC), {
        'identity.voice': mergedText,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch1.delete(db.doc(`${COL}/${approvedId}`));
      await batch1.commit();

      // Step 2: F1 zone-wide cleanup
      const zoneSnap = await db
        .collection(COL)
        .where('status', '==', 'active')
        .where('zone', '==', 'hook')
        .limit(100)
        .get();
      const batch2 = db.batch();
      let deleted = 0;
      for (const d of zoneSnap.docs) {
        if (d.id !== approvedId) {
          batch2.delete(d.ref);
          deleted++;
        }
      }
      if (deleted > 0) await batch2.commit();

      // Assertions
      const brandSnap = await db.doc(BRAND_DOC).get();
      expect(brandSnap.data()?.identity?.voice).toBe(mergedText);

      const remainingSnap = await db.collection(COL).get();
      const remainingHookPatterns = remainingSnap.docs.filter(
        (d) => d.data().zone === 'hook',
      );
      expect(remainingHookPatterns).toHaveLength(0);
    },
  );
});
