/**
 * Regression test: aiSnapshot field must be immutable after post creation.
 *
 * The Firestore security rule on posts denies any update that changes aiSnapshot:
 *   allow update: if request.auth.uid == uid
 *                 && request.resource.data.aiSnapshot == resource.data.aiSnapshot;
 *
 * Requires the Firestore emulator running on localhost:8081.
 * Run: FIRESTORE_EMULATOR_HOST=localhost:8081 pnpm test:integration
 * Skipped when FIRESTORE_EMULATOR_HOST is not set.
 *
 * Uses firebase/firestore client SDK with connectFirestoreEmulator({ mockUserToken })
 * so rules ARE evaluated. Two instances are created:
 *  - ownerApp  (mockUserToken: 'owner') — emulator admin bypass, used for doc setup
 *  - clientApp (mockUserToken: { sub, user_id }) — authenticated as the post owner
 *
 * Does NOT use @firebase/rules-unit-testing (see STATE.md). Does NOT use
 * firebase-admin, avoiding ADC credential requirements in the test environment.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  updateDoc,
  type Firestore as ClientFirestore,
} from 'firebase/firestore';
import { TEST_PROJECT_ID } from './setup.js';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const run = EMULATOR_HOST ? it : it.skip;

const UID = 'test-uid-aisnap-deny';
const BRAND_ID = 'test-brand-aisnap-deny';
const POST_ID = 'test-post-aisnap-deny';
const POST_PATH = `users/${UID}/brands/${BRAND_ID}/posts/${POST_ID}`;

// ownerApp uses the emulator's 'owner' token — bypasses security rules (for setup only).
let ownerApp: FirebaseApp;
let ownerDb: ClientFirestore;

// clientApp simulates an authenticated user (UID = post owner) — rules ARE evaluated.
let clientApp: FirebaseApp;
let clientDb: ClientFirestore;

beforeAll(async () => {
  if (!EMULATOR_HOST) return;

  const [host, portStr] = EMULATOR_HOST.split(':');
  const port = parseInt(portStr, 10);
  const ts = Date.now();

  // Owner bypass instance (emulator 'owner' token = no-rules mode).
  ownerApp = initializeApp({ projectId: TEST_PROJECT_ID }, `aisnap-owner-${ts}`);
  ownerDb = getFirestore(ownerApp);
  connectFirestoreEmulator(ownerDb, host, port, { mockUserToken: 'owner' });

  // Authenticated-user instance — security rules apply.
  clientApp = initializeApp({ projectId: TEST_PROJECT_ID }, `aisnap-client-${ts}`);
  clientDb = getFirestore(clientApp);
  connectFirestoreEmulator(clientDb, host, port, {
    mockUserToken: { sub: UID, user_id: UID },
  });
});

beforeEach(async () => {
  if (!EMULATOR_HOST) return;
  // Seed a fresh post doc via the owner bypass (rules disabled — intentional setup).
  await setDoc(doc(ownerDb, POST_PATH), {
    aiSnapshot: { slides: [{ id: 's1', zones: [] }], caption: 'original caption' },
    caption: 'draft caption',
    status: 'draft',
    brandId: BRAND_ID,
    uid: UID,
    createdAt: null,
    updatedAt: null,
  });
});

afterAll(async () => {
  await Promise.all([
    ownerApp ? deleteApp(ownerApp) : Promise.resolve(),
    clientApp ? deleteApp(clientApp) : Promise.resolve(),
  ]);
});

describe('aiSnapshot deny rule (regression)', () => {
  run(
    'post owner cannot mutate aiSnapshot on update — rule must deny',
    async () => {
      const postRef = doc(clientDb, POST_PATH);

      await expect(
        updateDoc(postRef, {
          aiSnapshot: { slides: [], caption: 'mutated by client' },
        }),
      ).rejects.toMatchObject({ code: 'permission-denied' });
    },
  );

  run(
    'post owner CAN update non-aiSnapshot fields — sanity check',
    async () => {
      const postRef = doc(clientDb, POST_PATH);

      // Caption update must succeed — this verifies the rule only targets
      // aiSnapshot and doesn't accidentally lock the whole post.
      await expect(
        updateDoc(postRef, { caption: 'updated by owner' }),
      ).resolves.toBeUndefined();
    },
  );
});
