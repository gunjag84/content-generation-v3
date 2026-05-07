// Local Node migration: copy users/{uid}.apiKeys.metaGraph (ciphertext) to
// users/{uid}/brands/{activeBrandId}.metaGraphCiphertext. Same KMS key — no
// decrypt, no re-encrypt.
//
// Usage:
//   tsx migration/migrateMetaToken.ts [--dry-run]
//
// Requires GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key
// with read-write access to the Firestore database.

import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({
      credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      projectId: process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID,
    });
  } else {
    initializeApp({ credential: applicationDefault() });
  }
}

const DRY_RUN = process.argv.includes('--dry-run');

interface UserDoc {
  apiKeys?: { metaGraph?: string };
  activeBrandId?: string;
}

interface BrandDoc {
  metaGraphCiphertext?: string | null;
}

interface LogEntry {
  uid: string;
  brandId?: string;
  status:
    | 'no_token'
    | 'no_brand'
    | 'already_migrated'
    | 'dry_run_would_migrate'
    | 'migrated'
    | 'write_failed';
  error?: string;
}

async function main(): Promise<void> {
  const db = getFirestore();
  const usersSnap = await db.collection('users').get();

  const log: LogEntry[] = [];
  let total = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const userDoc of usersSnap.docs) {
    total++;
    const uid = userDoc.id;
    const user = userDoc.data() as UserDoc;
    const ciphertext = user.apiKeys?.metaGraph;

    if (!ciphertext) {
      log.push({ uid, status: 'no_token' });
      skipped++;
      continue;
    }

    const brandId = user.activeBrandId;
    if (!brandId) {
      log.push({ uid, status: 'no_brand' });
      skipped++;
      continue;
    }

    const brandRef = db.doc(`users/${uid}/brands/${brandId}`);
    const brandSnap = await brandRef.get();
    const existing = (brandSnap.data() as BrandDoc | undefined)?.metaGraphCiphertext ?? null;
    if (existing) {
      log.push({ uid, brandId, status: 'already_migrated' });
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      log.push({ uid, brandId, status: 'dry_run_would_migrate' });
      continue;
    }

    try {
      // Ciphertext copy — same KMS key, so the ciphertext stays valid.
      await brandRef.set(
        {
          metaGraphCiphertext: ciphertext,
          metaGraphSetAt: Timestamp.now(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      log.push({ uid, brandId, status: 'migrated' });
      migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push({ uid, brandId, status: 'write_failed', error: msg });
      failed++;
    }
  }

  console.log(JSON.stringify({ dry_run: DRY_RUN, total, migrated, skipped, failed, log }, null, 2));
}

main().catch((err) => {
  console.error('[migrateMetaToken] fatal:', err);
  process.exit(1);
});
