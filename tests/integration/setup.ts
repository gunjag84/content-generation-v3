// Shared admin Firestore setup for integration tests.
//
// Re-uses the same firebase-admin instance the server lib initializes. This
// avoids the double-settings() error you hit when the test creates its own
// admin instance AND then imports server/lib/firebase.js (which also calls
// settings()).
//
// vitest.config.ts sets GCLOUD_PROJECT=contentai-test in test env so
// server/lib/firebase.ts's `applicationDefault()` initApp picks up the
// emulator-friendly project ID at module load time.

export const TEST_PROJECT_ID = 'contentai-test';

export async function getTestDb(): Promise<FirebaseFirestore.Firestore> {
  // Dynamic import keeps server/lib/firebase.ts from loading before
  // FIRESTORE_EMULATOR_HOST is set in tests that gate on it.
  const { db } = await import('../../server/lib/firebase.js');
  return db;
}

export async function clearCollection(
  db: FirebaseFirestore.Firestore,
  path: string,
): Promise<void> {
  const snap = await db.collection(path).get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
}
