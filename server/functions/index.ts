// IMPORTANT: server/functions/ has its own tsconfig (rootDir='.', include:
// ['*.ts']). Files in this package CANNOT import from `shared/` or `server/lib/`
// because those live outside rootDir. If a function ever needs editDiff,
// learnedPatterns, or anything from shared, options are:
//   (a) inline the logic into the function file (see igStatsSync.ts which
//       inlines @google-cloud/kms via dynamic import for the same reason), or
//   (b) extend functions/tsconfig.json: rootDir='..', include adds shared/.
// Phase 4a's learning loop avoided this by living in Cloud Run (server/lib +
// server/routes/publishWorker.ts) where shared/ is importable. If learning
// ever moves to a Firestore trigger Cloud Function, revisit this.

export { budgetKillswitch } from './budget-killswitch.js';
export { igStatsSync } from './igStatsSync.js';
export { igFeedSync } from './igFeedSync.js';
export { manualIgSync } from './manualSync.js';
