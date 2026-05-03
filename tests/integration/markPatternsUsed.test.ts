/**
 * Integration test: markPatternsUsed
 *
 * Requires the Firestore emulator running on localhost:8081.
 * Start with: pnpm emulators
 *
 * These tests are skipped when FIRESTORE_EMULATOR_HOST is not set so they
 * do not fail in CI without the emulator. To run locally:
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 pnpm test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import type { LoadedPattern } from '../../server/lib/learnedPatterns.js';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const run = EMULATOR_HOST ? it : it.skip;

const UID = 'test-uid-markused';
const BRAND_ID = 'test-brand-markused';

let testEnv: RulesTestEnvironment;
// We use the admin firestore (bypasses rules) for test setup and assertion.
// For the actual call under test we import markPatternsUsed which uses
// firebase-admin pointed at the emulator via FIRESTORE_EMULATOR_HOST env var.

beforeAll(async () => {
  if (!EMULATOR_HOST) return;
  testEnv = await initializeTestEnvironment({
    projectId: 'contentai-test',
    firestore: {
      host: 'localhost',
      port: 8081,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
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
        idempotencyKey: 'post-1_abc_hook',
        status: 'active',
        promotionCandidate: false,
        createdAt: null,
        lastUsedAt: null,
        useCount: 2,
      };

      // Write via admin context (rules-bypassing)
      const adminCtx = testEnv.authenticatedContext(UID);
      const patternRef = doc(
        adminCtx.firestore(),
        `users/${UID}/brands/${BRAND_ID}/learnedPatterns/${patternId}`,
      );
      await setDoc(patternRef, patternData);

      // Call the function under test via the server lib.
      // firebase-admin must be pointed at the emulator (FIRESTORE_EMULATOR_HOST is set).
      const { markPatternsUsed } = await import('../../server/lib/learnedPatterns.js');
      const pattern: LoadedPattern = {
        id: patternId,
        ...(patternData as Omit<LoadedPattern, 'id'>),
      };
      await markPatternsUsed(UID, BRAND_ID, [pattern]);

      // Assert via admin read
      const snap = await getDoc(patternRef);
      expect(snap.exists()).toBe(true);
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
        idempotencyKey: 'post-2_def_body',
        status: 'active',
        promotionCandidate: false,
        createdAt: null,
        lastUsedAt: null,
        useCount: 0,
      };

      const adminCtx = testEnv.authenticatedContext(UID);
      const patternRef = doc(
        adminCtx.firestore(),
        `users/${UID}/brands/${BRAND_ID}/learnedPatterns/${patternId}`,
      );
      await setDoc(patternRef, patternData);

      const { markPatternsUsed } = await import('../../server/lib/learnedPatterns.js');
      const pattern: LoadedPattern = {
        id: patternId,
        ...(patternData as Omit<LoadedPattern, 'id'>),
      };
      await markPatternsUsed(UID, BRAND_ID, [pattern]);

      const snap = await getDoc(patternRef);
      const data = snap.data()!;
      expect(data.useCount).toBe(1);
      expect(data.promotionCandidate).toBe(false);
    },
  );
});
