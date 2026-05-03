/**
 * Integration test: loadTopPatterns
 *
 * Requires the Firestore emulator running on localhost:8081.
 * Start with: pnpm emulators
 *
 * Skipped when FIRESTORE_EMULATOR_HOST is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const run = EMULATOR_HOST ? it : it.skip;

const UID = 'test-uid-loadtop';
const BRAND_ID = 'test-brand-loadtop';

let testEnv: RulesTestEnvironment;

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

describe('loadTopPatterns (integration)', () => {
  run('returns only active patterns, excludes dismissed', async () => {
    const adminCtx = testEnv.authenticatedContext(UID);
    const col = `users/${UID}/brands/${BRAND_ID}/learnedPatterns`;

    const base = {
      description: 'Pattern',
      confidence: 0.8,
      zone: 'hook',
      sourcePostId: 'post-3',
      sourceMethod: 'story',
      sourceMode: 'create-demand',
      idempotencyKey: 'post-3_xxx_hook',
      promotionCandidate: false,
      createdAt: null,
      lastUsedAt: null,
      useCount: 1,
    };

    // Write 3 patterns: 2 active, 1 dismissed
    await setDoc(doc(adminCtx.firestore(), col, 'pat-active-1'), {
      ...base,
      description: 'Active pattern one.',
      status: 'active',
    });
    await setDoc(doc(adminCtx.firestore(), col, 'pat-dismissed'), {
      ...base,
      description: 'Dismissed pattern.',
      status: 'dismissed',
    });
    await setDoc(doc(adminCtx.firestore(), col, 'pat-active-2'), {
      ...base,
      description: 'Active pattern two.',
      status: 'active',
    });

    const { loadTopPatterns } = await import('../../server/lib/learnedPatterns.js');
    const patterns = await loadTopPatterns(UID, BRAND_ID);

    expect(patterns).toHaveLength(2);
    const descriptions = patterns.map((p) => p.description);
    expect(descriptions).toContain('Active pattern one.');
    expect(descriptions).toContain('Active pattern two.');
    expect(descriptions).not.toContain('Dismissed pattern.');
  });
});
