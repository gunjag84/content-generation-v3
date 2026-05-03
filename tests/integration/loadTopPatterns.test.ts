/**
 * Integration test: loadTopPatterns
 *
 * Requires the Firestore emulator running on localhost:8081.
 * Run: FIRESTORE_EMULATOR_HOST=localhost:8081 pnpm test:integration
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getTestDb, clearCollection, TEST_PROJECT_ID } from './setup.js';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const run = EMULATOR_HOST ? it : it.skip;

const UID = 'test-uid-loadtop';
const BRAND_ID = 'test-brand-loadtop';
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

describe('loadTopPatterns (integration)', () => {
  run('returns only active patterns, excludes dismissed', async () => {
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

    await db.doc(`${COL}/pat-active-1`).set({
      ...base,
      description: 'Active pattern one.',
      status: 'active',
    });
    await db.doc(`${COL}/pat-dismissed`).set({
      ...base,
      description: 'Dismissed pattern.',
      status: 'dismissed',
    });
    await db.doc(`${COL}/pat-active-2`).set({
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
