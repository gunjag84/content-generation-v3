/**
 * Integration test: markPatternsUsed
 *
 * Requires the Firestore emulator running on localhost:8081.
 * Start with: pnpm emulators
 *
 * Run: FIRESTORE_EMULATOR_HOST=localhost:8081 pnpm test:integration
 * Skipped when FIRESTORE_EMULATOR_HOST is not set.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getTestDb, clearCollection, TEST_PROJECT_ID } from './setup.js';
import type { LoadedPattern } from '../../server/lib/learnedPatterns.js';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const run = EMULATOR_HOST ? it : it.skip;

const UID = 'test-uid-markused';
const BRAND_ID = 'test-brand-markused';
const COL = `users/${UID}/brands/${BRAND_ID}/learnedPatterns`;

let db: FirebaseFirestore.Firestore;

beforeAll(async () => {
  if (!EMULATOR_HOST) return;
  process.env.GCLOUD_PROJECT = TEST_PROJECT_ID;
  db = await getTestDb();
});

beforeEach(async () => {
  if (!EMULATOR_HOST) return;
  await clearCollection(db, COL);
});

describe('markPatternsUsed (integration)', () => {
  run(
    'increments useCount and sets promotionCandidate=true when thresholds are crossed',
    async () => {
      // PROMOTION_USE_COUNT=3, PROMOTION_CONFIDENCE=0.7
      // useCount=2, next=3 → crosses threshold. confidence=0.8 ≥ 0.7 → candidate=true.
      const patternId = 'pat-threshold-cross';
      const patternData = {
        description: 'Threshold test pattern.',
        confidence: 0.8,
        zone: 'hook',
        sourcePostId: 'post-1',
        sourceMethod: 'story',
        sourceMode: 'create-demand',
        sourceLength: 'medium',
        idempotencyKey: 'post-1_abc_hook',
        status: 'active',
        promotionCandidate: false,
        createdAt: null,
        lastUsedAt: null,
        useCount: 2,
      };

      const ref = db.doc(`${COL}/${patternId}`);
      await ref.set(patternData);

      const { markPatternsUsed } = await import('../../server/lib/learnedPatterns.js');
      const pattern: LoadedPattern = {
        id: patternId,
        ...(patternData as Omit<LoadedPattern, 'id'>),
      };
      await markPatternsUsed(UID, BRAND_ID, [pattern]);

      const snap = await ref.get();
      expect(snap.exists).toBe(true);
      const data = snap.data()!;
      expect(data.useCount).toBe(3);
      expect(data.promotionCandidate).toBe(true);
    },
  );

  run(
    'increments useCount but leaves promotionCandidate=false when below confidence threshold',
    async () => {
      // useCount=0, next=1 → below PROMOTION_USE_COUNT=3. Also confidence=0.5 < 0.7.
      const patternId = 'pat-below-threshold';
      const patternData = {
        description: 'Below threshold pattern.',
        confidence: 0.5,
        zone: 'body',
        sourcePostId: 'post-2',
        sourceMethod: 'liste',
        sourceMode: 'convert-demand',
        sourceLength: 'medium',
        idempotencyKey: 'post-2_def_body',
        status: 'active',
        promotionCandidate: false,
        createdAt: null,
        lastUsedAt: null,
        useCount: 0,
      };

      const ref = db.doc(`${COL}/${patternId}`);
      await ref.set(patternData);

      const { markPatternsUsed } = await import('../../server/lib/learnedPatterns.js');
      const pattern: LoadedPattern = {
        id: patternId,
        ...(patternData as Omit<LoadedPattern, 'id'>),
      };
      await markPatternsUsed(UID, BRAND_ID, [pattern]);

      const snap = await ref.get();
      const data = snap.data()!;
      expect(data.useCount).toBe(1);
      expect(data.promotionCandidate).toBe(false);
    },
  );
});
