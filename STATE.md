# Project State - Content-Generation v3

Single source of truth for **operational state** (what is deployed, locked deploy patterns, runtime contracts, requirements traceability). Scope/phases/open decisions/out-of-scope live in `PROJECT-PLAN.md`. Architecture/ADRs/full spec live in `~/.claude/plans/modular-tumbling-sunrise.md` (v6 ISSUES_CLOSED 2026-04-26, historical reference).

Last updated: 2026-05-08 (added `manualIgSync` callable Cloud Function for user-triggered IG feed+stats refresh; `KMS_KEY_NAME` env var set on the new Cloud Run service; timeout bumped to 540s + 512MiB).

---

## Live Deploy Anchors

- **Project:** `contentai-78bfb` (europe-west1)
- **Hosting:** https://contentai-78bfb.web.app
- **Cloud Run:** https://content-gen-23953893533.europe-west1.run.app
- **Live revisions:** `content-gen-00022-2h4` (Multi-Brand Migration, deployed 2026-05-06) + Cloud Functions `budgetKillswitch`, `igStatsSync`, `igFeedSync`, `manualIgSync` (last deployed 2026-05-08)

> Note: source-of-truth plan references `content-gen-prod` as the planned project ID; actual prod project is `contentai-78bfb`.

---

## Locked-In Patterns (Phase 1-3 deploy quirks)

Discovered during deploy, must not regress:

- `tsconfig.server.json` outDir `dist/server` -> `dist` (Dockerfile CMD path alignment, double-`server` bug)
- `web/postcss.config.js` + `web/tailwind.config.js` need explicit absolute paths (cwd vs config-dir mismatch with vite-from-root)
- `/healthz` is GFE-intercepted; external probes must use `/healthz/`
- OIDC tokens via `gcloud print-identity-token` need `--include-email` flag
- Cloud Run image ~600MB due to Playwright Chromium + system deps (~5-10min build on Cloud Build)
- 5 Firestore composite indexes deployed for posts collection-group + per-collection queries
- IAM: `content-gen-sa` granted `roles/iam.serviceAccountTokenCreator` on itself for `getSignedUrl` blob signing
- Render output: 7-day signed Storage URLs (re-sign helper deferred)
- Anthropic SDK 0.32.1 stable: `system` is plain string, no `cache_control` (lives on beta types only)
- Tim's `tim.gansczyk@gmail.com` granted `roles/iam.serviceAccountTokenCreator` on `internal-invoker` SA for OIDC manual probes
- KMS bypass active when `FIRESTORE_EMULATOR_HOST` is set (base64 dev stub)
- `min-instances=1` accepted (~$5-15/mo) for stability + cleanness; no cold-starts

### Phase 4a deploy quirks (locked in 2026-05-03)

- Brand identity (voice + persona only) wired as Layer 3.5 in `assembleSystemPrompt`. UVP / point_of_view / competitive_landscape are explicit dead code, marked `inactive` in IdentityPage UI.
- All LEBEN.LIEBEN references stripped from code paths (prompts, UI defaults, hardcoded strings). Brand context flows from `brand.identity` only. Operational mentions (deploy anchors, portfolio context) in STATE.md + CLAUDE.md are intentional and stay.
- `server/lib/learningConfig.ts` centralizes all tunables (EDIT_RATIO_THRESHOLD=0.15, TOP_N=20, RECENCY_HALF_LIFE_DAYS=30, PROMOTION_USE_COUNT=3, PROMOTION_CONFIDENCE=0.7, AUDIT_MAX_TOKENS=1500, APPROVAL_BASELINE_WINDOW=5, APPROVAL_LEDGER_WINDOW=5, APPROVAL_HURTFUL_DELTA=0.05). Single PR to retune.
- `server/functions/` cannot import from `shared/` (own tsconfig with rootDir='.', include only `*.ts`). Phase 4a's learning loop avoided this by living in Cloud Run. Documented in `server/functions/index.ts`.
- Vitest test config sets `GCLOUD_PROJECT=contentai-test` in `test.env` so `firebase-admin`'s `applicationDefault()` initApp picks the right project ID at module load. Integration tests use admin SDK throughout (NOT `@firebase/rules-unit-testing` which causes a project-ID split + grpc errors against the emulator).

### IG analytics deploy quirks (locked in 2026-05-07, after Phase 5 cutover start)

- **Cloud Functions runtime SA must be pinned in `onSchedule({ serviceAccount: ... })`.** `firebase deploy` resets the runtime SA to the default `<project-number>-compute@developer.gserviceaccount.com`, which lacks `roles/cloudkms.cryptoKeyEncrypterDecrypter` on `user-secrets/api-keys`. Symptom: `error: token decrypt failed` on `igFeedSyncStatus/current` doc. Pin via `serviceAccount: 'content-gen-sa@contentai-78bfb.iam.gserviceaccount.com'` in the options object.
- **`@google-cloud/kms` must be in `server/functions/package.json` deps.** The functions sub-package has its own node_modules; dynamic `await import('@google-cloud/kms')` throws `ERR_MODULE_NOT_FOUND` if the dep lives only in root package.json. Symptom: same `token decrypt failed` status doc, but Cloud Run logs show the real cause.
- **`KMS_KEY_NAME` env var survives `firebase deploy`** (set once via `gcloud run services update --update-env-vars`), but the SA reset strips invoker permission so scheduler triggers fail with "IAM principal lacks {run.routes.invoke}". Fix: `gcloud run services add-iam-policy-binding <fn> --member=serviceAccount:content-gen-sa@... --role=roles/run.invoker` after every SA pin change.
- **Firestore composite indexes in `firestore.indexes.json` are not auto-deployed by hosting/functions deploys.** Run `firebase deploy --only firestore:indexes` explicitly. Symptom: `9 FAILED_PRECONDITION: The query requires an index` from a Cloud Function. Build takes 30-90s for the first time, then READY.
- **Force-resync helper (no code change required):** bulk `PATCH ?updateMask.fieldPaths=igStats.syncedAt` with `nullValue` body via Firestore REST resets `syncCutoff` skip filter for all matched docs. Pattern in last session's bash log; idempotent.

### Meta Graph API v22+ drift (locked in 2026-05-07)

The Meta v22+ API removed/renamed several insight + comment fields that v21 still accepts. Reference v2 implementation: `C:\webprojects\content-generation\server\services\instagramSync.ts`.

- **Comments**: `from` field removed entirely. Self-detect via `?fields=username,user,replies.limit(50){username,user}` and match `username === igUsername` OR `!!user` (the `user` field is only populated when commenter IS the authenticated account). Resolve `igUsername` via `/{igUserId}?fields=username` once per brand.
- **Insights metrics**: `likes_count`/`comments_count` rejected (use `likes`/`comments`). `impressions` and `plays` deprecated for IMAGE/CAROUSEL/REELS, replaced by unified `views`. Parser must map `views` → both `out.impressions` and `out.plays` to keep downstream HistoryTab columns + Reels engagement-rate fallback working.
- **Per-post follower attribution**: `/{mediaId}/insights?metric=follows` returns followers GAINED through this specific post. NOT the same as `/{igUserId}?fields=followers_count` (brand-total, no per-post attribution). Some media types return error 100 ("metric not supported"); silent null is correct.
- **Own-likes cannot be filtered**: Meta Graph API does not expose individual likers. Toggle UX must document this as a fundamental limitation, not a TODO.

### Phase 4b deploy quirks (locked in 2026-05-03)

- **IG Graph API container polling**: ALWAYS poll `GET /{container-id}?fields=status_code` until `FINISHED` before `/media_publish`. Code 9007 ("media ID is not available") = container still processing. Required for both single-image AND carousel flows, including children of a carousel. See `server/lib/instagram.ts:waitForContainer` (60s timeout, 2s poll). Race only surfaced once portrait/story formats grew the container's processing time beyond what 1080x1080 squares took.
- **Format-aware Playwright render**: viewport + body/container CSS use `FORMAT_HEIGHTS[format]` (post=1350 / story=1920). Hardcoded 1080x1080 letterboxed portrait/story.
- **Brand-font loading in headless Chromium**: server-side render must inject `<link rel="stylesheet">` for every unique zone fontFamily (Fontshare for Satoshi, cdnfonts for Daniel, Google Fonts for the rest, mirroring `web/src/lib/font-loader.ts`) AND `await page.evaluate(() => document.fonts.ready)` BEFORE screenshot. `waitUntil: 'networkidle'` waits for fetches NOT for paint-readiness.
- **Pass-through render-job payload > Post-schema migration**: render-time fields like `format` flow through the render job, not via Firestore Post schema migration. Avoids rules + DraftPatch + backward-compat shims; legacy posts default `format='post'` via Zod.
- **Slide-thumbnail measurement effect**: DOM-measurement layout corrections (auto-grow `useLayoutEffect`) must run for every visible consumer, not just the active mount site. `SlideThumbnail` replicates `ZoneCanvas`'s measurement pass with `onZoneChange` callback wired to slide-index-aware state mutation. Without this, non-active thumbnails show pre-grow positions until clicked.

---

## NDJSON Event Shapes (`/api/generate`)

Content-Type: `application/x-ndjson; charset=utf-8`

- `{type:'chunk',text:string}`
- `{type:'complete',postId:string,slides:SocialSlide[],caption:string}`
- `{type:'error',error:string}`

AbortController wired to `req.on('close')`. Frontend stream parser: fetch + ReadableStream + UTF-8 decoder + line-buffer (handles trailing-byte case).

---

## Locked Architectural Decisions (post-plan)

Decisions locked during execution that override or extend the source-of-truth plan:

- Single Cloud Run service (collapsed from 2). 2-user concurrency tolerated.
- Firebase Hosting over Vercel (Hobby ToS + 10s timeout).
- Email allowlist in `requireAuth` middleware (no `onCreate` Cloud Function).
- Single kill switch `system/killSwitch.enabled`, auto-flip at $40 budget alert.
- DraftPatch `{slides?, caption?}` TypeScript type makes aiSnapshot mutation a compile-time impossibility (no runtime test needed).
- SlidePanel + ZonePanel use native `<input type="color">` (drops v2 ColorPicker / Radix popover dep).
- SlidePanel drops `repositionZonesForTextPosition` (v2 helper depended on un-ported constants; manual drag covers it).
- Editor preview is CSS-only (Tim Q1 lock); server-side PNG render deferred to Phase 03 / built.
- Inline upload from SlidePanel is a no-op stub; photo pool lives in `/settings/photos`.
- Pattern extraction via Claude Haiku (short prompt, no Sonnet needed, cheap async).

---

## Requirements Traceability (53 v1)

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| INFRA-01..08 | GCP/Firebase project, Cloud Run, SAs, Tasks, Scheduler, Budget, KMS, killSwitch | 1 | Live |
| AUTH-01..07 | Google + Email link, requireAuth/requireOidc, allowlist, onboarding modal, session, Firestore rules | 1 | Live |
| BRAND-01..07 | Identity, Design, Focus Areas, Situations, API keys (KMS), brand switching, schema reduction | 2 | Live |
| CREATE-01..08 | Mode/method/focus/situation/photo selection, photo pool, NDJSON streaming, post auto-create with immutable aiSnapshot, prompt assembly with learnedPatterns block, abort-on-disconnect | 2 | Live |
| RENDER-01..05 | render-jobs enqueue, Playwright per-request, sub-collection updates, 2s polling, <10s cold-start | 3 | Live |
| POST-01..07 | 3-tab Posts page, draft->scheduled->published transitions, Cloud Scheduler tick, transaction lock, stale-lock sweep, igMediaId link, igStats sync | 3 | Live |
| LEARN-01..05 | computeEditDiff, Claude Haiku pattern extract, idempotency, learnedPatterns injection, invisible UI | 4a | **Live** (deployed 2026-05-03) |
| POLISH-01..02 + igStats display + edit hot-spots | Dashboard widgets, Calendar placeholder, per-post igStats, per-method/day-of-week aggregates (N>=3 floor) | 4b | **Live** (deployed `content-gen-00021-9r9`) |
| LEARN-V2-* (auto-perf-learning) | Defer until N>=20 published posts | 4c | Deferred |
| LAUNCH-01..06 | Hosting deployed, Cloud Run + Tasks + Scheduler active, final security rules, fresh onboarding, first real post, v2 README archive | 5 | Pending |

---

## Source-of-Truth References

- Goal, phases, current/next, open decisions, out-of-scope, risks, pending TODOs: `PROJECT-PLAN.md`
- Architecture, ADRs, full spec: `~/.claude/plans/modular-tumbling-sunrise.md` (historical, ISSUES_CLOSED 2026-04-26)
- v2 source for verbatim ports (editor, parseSlidesMd, editDiff, prompts): `C:\webprojects\content-generation\client\src\components\social-club\`
- Project rules + conventions: `CLAUDE.md`
