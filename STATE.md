# Project State - Content-Generation v3

Single source of truth for **operational state** (what is deployed, what works, what is pending). Architecture and decisions live in `~/.claude/plans/modular-tumbling-sunrise.md` (source-of-truth plan, v6 ISSUES_CLOSED 2026-04-26).

Last updated: 2026-05-07 (Phase 5 Cutover started: kill-switch trip-test passed E2E; igFeedSync deployed; LEBEN.LIEBEN brand fresh-onboarded with 94 organic IG posts synced; igStatsSync now also fetches per-post `follows` (acquisitions) + `ownComments` (self-replies, v22+ self-detection via username/user); HistoryTab gained Foll. column + own-comments toggle + engagement-rate tooltip).

---

## Live Deploy Anchors

- **Project:** `contentai-78bfb` (europe-west1)
- **Hosting:** https://contentai-78bfb.web.app
- **Cloud Run:** https://content-gen-23953893533.europe-west1.run.app
- **Live revisions:** `content-gen-00022-2h4` (Multi-Brand Migration, deployed 2026-05-06) + Cloud Functions `budgetKillswitch`, `igStatsSync`, `igFeedSync` (last deployed 2026-05-07)

> Note: source-of-truth plan references `content-gen-prod` as the planned project ID; actual prod project is `contentai-78bfb`.

---

## Phase Status

| Phase | Scope | Status |
|-------|-------|--------|
| 1. Foundation & Infrastructure | GCP/Firebase project, Cloud Run + Tasks + Scheduler + KMS, Auth shell | **Live** |
| 2. Brand Settings & Create | Settings schema, Focus Areas, generate streaming, zone editor on Firestore | **Live** |
| 3. Render & Posts | Async render via Cloud Tasks, 3-tab Posts page, Schedule + Publish workers | **Live** |
| 4a. Silent Edit-Diff Learning Loop | Edit-diff -> learnedPatterns -> prompt injection, Haiku audit, promotion approval UI, brand.identity wiring | **Live** (PR #1 merged, deployed `content-gen-00013-ctz`) |
| 4b. Performance Dashboard + Polish | Read-only igStats display, edit hot-spots widget, dashboard widgets, per-post IG analytics in History, format-aware Playwright render with brand fonts, IG container polling against code 9007, calendar placeholder | **Live** (deployed `content-gen-00021-9r9`) |
| 4c. Automated Performance Learning | Auto-extract patterns from top-performing posts | Deferred (revisit at N>=20 publishes) |
| 5. Cutover | Final security rules, fresh-start onboarding for Tim + Jule, first real post on @leben.lieben | **In progress** (rules verified final, kill-switch trip-test passed 2026-05-07; pending: Tim + Jule fresh onboarding, first real post, v2 README archive) |

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

## Pending TODOs

**Tim (manual):**
- Phase 2 prod smoke: sign-in -> /settings/photos upload -> /create generate (story + zitat paths) -> /editor edits persist with `aiSnapshot` byte-identical; cancel-before-complete = no post doc.
- Phase 3 user-facing prod smoke: /create -> /editor render -> /posts schedule + publish.
- Meta Graph token + `instagramUserId` per Brand: UI fehlt, manuell per Firestore-Console möglich.
- LEBEN.LIEBEN-Brand fresh setup für Cutover.

**Backlog:**
- Vitest harness for web package (streamGenerate trailing-byte test + saveDraftDebounced no-aiSnapshot test).
- aiSnapshot mutation rules-deny test (rule itself is live since 02-01).
- Re-sign helper for >7-day signed Storage URLs.

---

## Deferred / Out-of-Scope

| Item | Reason |
|------|--------|
| `cache_control: ephemeral` on system message | SDK 0.32.1 stable doesn't expose it on `TextBlockParam`; revisit when SDK adds the type or move to beta endpoint |
| Inline photo upload from SlidePanel side rail | Pool management lives in `/settings/photos` (Q6 lock) |
| Browser pool in render service | `concurrency=1` makes pooling pointless; per-request Chromium launch |
| v2 SQLite data migration | Fresh start in Firestore; both users re-onboard the LEBEN.LIEBEN brand |
| Staging environment | 2-user internal use; $20/$40 budget cap + kill switch covers cost risk |
| Public sign-up funnel | Hardcoded allowlist in `requireAuth` (Tim + Jule only) |
| LearningDashboardPage | Learning runs invisibly; optional `/learning` debug page only (Tim-only) |
| Pillar P3 (Loyalty/Nurture) | Removed; only `create-demand` + `convert-demand` remain |
| Style Types / Layout Templates / Strategy / Hooks Guidance pages | Removed entirely from settings schema |
| Real-time multi-user collab on a single post | Posts are user-scoped; no shared editing |
| Calendar interactive view + drag-and-drop reschedule | v2 feature; v1 has Coming Soon placeholder only |
| Pattern visibility UI | Learning is invisible by design (LEARN-V2-* future) |

---

## Remaining Work (Phase 4 + 5)

Phase 4 split into 4a (Layer 1 silent learning), 4b (Layer 2 read-only dashboard + polish), 4c (deferred auto-analysis). Confirmed 2026-05-03.

### Phase 4a: Silent Edit-Diff Learning Loop (Layer 1)

**Goal:** Every publish silently teaches the next generate prompt by diffing AI-baseline vs published-output and extracting structural patterns. Brand identity is NEVER auto-mutated.

**Schema** - new sub-collection `users/{uid}/brands/{brandId}/learnedPatterns/{patternId}`:

```ts
{
  description: string,        // 1-2 sentences, structural pattern
  confidence: number,         // 0-1, from extractor
  zone: 'hook' | 'body' | 'cta' | 'caption',
  sourcePostId: string,
  sourceMethod: 'story' | 'liste' | 'vorher-nachher' | 'zitat',
  sourceMode: 'create-demand' | 'convert-demand',
  idempotencyKey: string,     // `{postId}_{diffHash}` - prevents dup writes
  createdAt: Timestamp,
  lastUsedAt: Timestamp | null,
  useCount: number
}
```

Also add to post doc on publish: `editStats: { editRatioByZone: {hook, body, cta, caption}, totalEditRatio }` (cheap, drives 4b dashboard).

**Implementation:**
- Port `editDiff.ts` from v2 (Levenshtein-based per-zone diff, threshold 0.15 to skip noise).
- Cloud Function `onPostPublished` - Firestore `onDocumentUpdated` trigger, filter `before.status != 'published' && after.status == 'published'`.
- Worker computes diff, writes `editStats` to post, then for each zone with diff > 0.15 calls Claude Haiku (~1200 in / 300 out tokens) with JSON-schema-validated output.
- Idempotency-keyed write to `learnedPatterns` sub-collection. On 2nd trigger same `{postId}_{diffHash}`: no-op.
- `server/lib/assembleSystemPrompt.ts` - inject `<learned_patterns>` XML block, top N=20 ordered by `recency × confidence` (recency = exp decay over days since `lastUsedAt`).

**Success criteria:**
1. After 3 publishes with meaningful edits, `learnedPatterns` sub-collection contains extracted patterns; next generate request shows the XML block in network trace.
2. Re-running pattern extraction on the same publish (manual re-trigger) writes zero new docs.
3. No learning UI visible in normal navigation. Optional `/learning` debug route Tim-only.
4. Brand identity fields (`voice`, `persona`, etc.) untouched by the worker.

### Phase 4b: Performance Dashboard + Polish (Layer 2 read-only)

**Goal:** Surface igStats + edit hot-spots so humans can spot patterns. No LLM calls. No auto-learning until enough data exists.

**Implementation:**
- Posts page enrichment - each published post card displays `{reach, impressions, likes, comments, saves, engagement_rate}` from existing `igStats`. `engagement_rate = (likes + comments + saves) / reach`.
- Dashboard widgets:
  - Recent Posts list (last 5)
  - Scheduled count
  - Top-performing post (last 30d, by engagement_rate)
  - Per-method aggregate (avg engagement, avg edit ratio, post count) - only show buckets with N>=3
  - Per-day-of-week aggregate - only show buckets with N>=3
  - Edit hot-spots widget (which zone gets edited most across last 10 posts)
  - BrandSwitcher highlight + Create CTA
- `/calendar` route - "Coming Soon" placeholder card.
- All aggregations are pure Firestore queries + frontend math. No Cloud Function, no Claude calls.

**Success criteria:**
1. Each published post card shows the 5 igStats + engagement_rate.
2. Dashboard renders all widgets; aggregates respect N>=3 floor (no widget with 1-2 datapoints).
3. Edit hot-spots widget surfaces zone with highest avg edit ratio.
4. `/calendar` loads with Coming Soon card.
5. Zero new Cloud Functions, zero Claude calls in this phase.

### Phase 4c: Automated Performance Learning (DEFERRED)

**Trigger to revisit:** when N>=20 published posts exist with igStats, OR Tim explicitly requests earlier.

**Sketch (not built):** Cloud Function reads top-N posts by engagement_rate, Claude Haiku extracts qualitative themes (high-performing hook patterns, CTA patterns), writes to a separate `performancePatterns` sub-collection, injected into prompt as `<performance_patterns>` block alongside `<learned_patterns>`. Same injection mechanism, different signal source.

### Phase 5: Cutover

**Goal:** v3 is live in production, both users onboarded fresh, first real post published on @leben.lieben, v2 archived.

**Plan:**
- Final-build + deploy: `pnpm build:web` -> `firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting` + `gcloud run deploy content-gen --source=.`
- Pub/Sub trip-test: `gcloud pubsub topics publish budget-alerts --message='{"costAmount":40,"budgetAmount":40}'` -> killSwitch flips -> 503 on `/api/*` -> re-seed via `seed-killswitch.sh`.
- Tim: sign-in on prod URL, Anthropic key, real LEBEN.LIEBEN brand + identity fields.
- Jule sign-in ceremony, her brand setup.
- First real test-post: Generate -> Edit -> Schedule for `now+5min` -> wait -> IG post live on @leben.lieben.

**Success criteria:**
1. Final Firestore security rules block any cross-user read/write attempt.
2. Tim and Jule each complete onboarding for the LEBEN.LIEBEN brand from scratch.
3. Post generated, edited, scheduled, published on @leben.lieben via v3.
4. Old `content-generation` repo README points at v3; `v3-rewrite` branch retired.

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
| POLISH-01..02 + igStats display + edit hot-spots | Dashboard widgets, Calendar placeholder, per-post igStats, per-method/day-of-week aggregates (N>=3 floor) | 4b | Pending |
| LEARN-V2-* (auto-perf-learning) | Defer until N>=20 published posts | 4c | Deferred |
| LAUNCH-01..06 | Hosting deployed, Cloud Run + Tasks + Scheduler active, final security rules, fresh onboarding, first real post, v2 README archive | 5 | Pending |

---

## Risks (Phase 4 + 5)

| Risk | Mitigation |
|------|------------|
| Learning-loop pattern extract returns invalid JSON | Zod schema validation; on failure 1 retry with explicit JSON-only re-prompt; then store with `parse_failed` flag |
| Anthropic spend during E2E tests | E2E doc uses 1-2 generates total, no volume tests |
| Token theft in worst-case window before $40 budget alert | 2FA on Tim's Google account (out-of-scope for plan, hard-recommended) |
| Stale `publishing` lock from worker crash | Collection-group sweep recovers >10min locks to `scheduled` |

---

## Source-of-Truth References

- Architecture, ADRs, scope, full spec: `~/.claude/plans/modular-tumbling-sunrise.md`
- v2 source for verbatim ports (editor, parseSlidesMd, editDiff, prompts): `C:\webprojects\content-generation\client\src\components\social-club\`
- Project rules + conventions: `CLAUDE.md`
