"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.igFeedSync = exports.igStatsSync = exports.budgetKillswitch = void 0;
var budget_killswitch_js_1 = require("./budget-killswitch.js");
Object.defineProperty(exports, "budgetKillswitch", { enumerable: true, get: function () { return budget_killswitch_js_1.budgetKillswitch; } });
var igStatsSync_js_1 = require("./igStatsSync.js");
Object.defineProperty(exports, "igStatsSync", { enumerable: true, get: function () { return igStatsSync_js_1.igStatsSync; } });
var igFeedSync_js_1 = require("./igFeedSync.js");
Object.defineProperty(exports, "igFeedSync", { enumerable: true, get: function () { return igFeedSync_js_1.igFeedSync; } });
