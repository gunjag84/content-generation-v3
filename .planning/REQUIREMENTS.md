# Requirements: Content-Generation v3

**Defined:** 2026-04-26
**Core Value:** A non-technical user can sign in, generate a carousel, edit it, and publish to Instagram from any browser - with first-shot quality silently improving over time.

## v1 Requirements

Requirements for initial release. Each maps to a roadmap phase.

### Infrastructure

- [ ] **INFRA-01**: Firebase project `content-gen-prod` exists in `europe-west1` with Auth + Firestore + Storage + Hosting enabled (Blaze plan)
- [ ] **INFRA-02**: Single Cloud Run service `content-gen` deployed (concurrency=1, mem=2Gi, cpu=2, min-instances=1, --allow-unauthenticated)
- [ ] **INFRA-03**: Service accounts `content-gen-sa` (runtime) and `internal-invoker` (Tasks + Scheduler) exist with required IAM bindings (Datastore, Storage, KMS, Tasks, Scheduler)
- [ ] **INFRA-04**: Cloud Tasks queues `render-queue` and `publish-queue` exist in `europe-west1`
- [ ] **INFRA-05**: Cloud Scheduler job `publish-tick` runs every 5min against `/internal/publish-worker` with OIDC token
- [ ] **INFRA-06**: GCP budget alert at $20 (email) and $40 (auto-flip kill switch) configured
- [ ] **INFRA-07**: Cloud KMS key ring `user-secrets` with key `api-keys` exists for API key encryption
- [ ] **INFRA-08**: Firestore doc `system/killSwitch` exists; both `/api/*` and `/internal/*` endpoints check `enabled` flag with 30s in-memory TTL cache

### Authentication

- [ ] **AUTH-01**: User can sign in with Google
- [ ] **AUTH-02**: User can sign in with email magic link
- [ ] **AUTH-03**: `requireAuth` middleware verifies Firebase ID-token and rejects emails not on hardcoded allowlist (Tim, Jule) with 403
- [ ] **AUTH-04**: `requireOidc` middleware on `/internal/*` verifies OIDC token audience + invoker email against allowed SAs
- [ ] **AUTH-05**: First-time user sees onboarding modal forcing brand name + Anthropic API key before app access
- [ ] **AUTH-06**: User session persists across browser refresh
- [ ] **AUTH-07**: Firestore security rules scope all reads/writes to `/users/{uid}/**`

### Brand Settings

- [ ] **BRAND-01**: User can edit Identity (voice, persona, product UVP, point of view, competitive landscape) and changes persist
- [ ] **BRAND-02**: User can edit Design (colors, logo, IG handle) and changes persist
- [ ] **BRAND-03**: User can create, edit, and delete Focus Areas (`{name, description}` list)
- [ ] **BRAND-04**: User can create Situations (text + optional images uploaded to Firebase Storage)
- [ ] **BRAND-05**: User can store Anthropic API key and Meta Graph token per user (encrypted via Cloud KMS)
- [ ] **BRAND-06**: User can switch between brands they own; active brand ID persists on user doc
- [ ] **BRAND-07**: Removed schema fields (hooks_guidance, strategy, styleTypes, layoutTemplates, library hooks/ctas/science) do not exist anywhere in codebase

### Create (Generate + Edit)

- [ ] **CREATE-01**: User selects mode (`create-demand` | `convert-demand`), method (story | liste | vorher-nachher | zitat), focus area, situation text, slide count (1-10), and photos
- [ ] **CREATE-02**: User can upload photos for a single generation OR pick from persistent brand photo pool stored in Firebase Storage
- [ ] **CREATE-03**: Generate streams from Cloud Run `/api/generate` (Claude SSE), parses slides via `parseSlidesMd`
- [ ] **CREATE-04**: On generate response, a Firestore post doc is auto-created with `status='draft'` and `aiSnapshot={slides, caption}` immutably set
- [ ] **CREATE-05**: User edits zones in editor; changes save to Firestore `slides`/`caption` while `aiSnapshot` stays untouched
- [ ] **CREATE-06**: Generation prompt injects brand identity, focus area description, situation, photo labels, and unsigned `learnedPatterns` block
- [ ] **CREATE-07**: P3 Loyalty pillar code path is fully removed (file, ANGLE_TARGETS, topic-filter branches)
- [ ] **CREATE-08**: Server aborts Anthropic stream when client disconnects (`req.on('close')` → AbortController)

### Render

- [ ] **RENDER-01**: Frontend POSTs `/api/render-jobs` which creates `users/{uid}/renderJobs/{jobId}` with `status='pending'` and enqueues a Cloud Task
- [ ] **RENDER-02**: `/internal/render` worker renders slides sequentially via Playwright + Chromium (per-request launch, no pool), writes PNGs to `/renders/{uid}/{brandId}/{postId}/slide-{n}.png` in Firebase Storage
- [ ] **RENDER-03**: Worker updates `completedSlides` per slide and sets `status='done'` (or `'error'` on terminal failure after 3 retries)
- [ ] **RENDER-04**: Editor preview polls `renderJobs/{jobId}` every 2s and displays each slide PNG as it completes
- [ ] **RENDER-05**: Cold-start latency for first render under 10s

### Posts

- [ ] **POST-01**: `/posts` page has 3 tabs - History (published, sorted by `publishedAt desc`), Scheduled (with `scheduledAt`), Drafts (clickable → editor)
- [ ] **POST-02**: User can transition `draft → scheduled` via Schedule modal (datepicker sets `scheduledAt`)
- [ ] **POST-03**: User can transition `draft → published` via "Publish Now" button
- [ ] **POST-04**: Cloud Scheduler tick (every 5min) finds posts where `status='scheduled' AND scheduledAt <= now`, transitions via Firestore transaction (`scheduled → publishing`) to prevent double-publish, calls Meta Graph API, sets `publishedAt` + `publishedSnapshot` + `status='published'`
- [ ] **POST-05**: Stale `publishing` locks (>10min) auto-recover to `scheduled` via collection-group sweep
- [ ] **POST-06**: Published posts show `igMediaId` link to original IG post when available
- [ ] **POST-07**: Periodic Cloud Function syncs `igStats` (reach, likes, etc.) into post docs

### Learning

- [ ] **LEARN-01**: Successful publish triggers diff computation between `aiSnapshot` and `publishedSnapshot` per zone (hook/body/CTA) + caption using Levenshtein-based `computeEditDiff` (ported from v2 `editDiff.ts`)
- [ ] **LEARN-02**: When edit-diff ratio > 0.15, Claude Haiku extracts a 1-2 sentence structural pattern asynchronously and writes it to `brand.learnedPatterns`
- [ ] **LEARN-03**: Pattern extraction is idempotent (re-running on same post does not duplicate patterns)
- [ ] **LEARN-04**: Next generate request loads top N=20 `learnedPatterns` (weighted by recency × confidence) and injects them as unsigned `<learned_patterns>` block in the prompt
- [ ] **LEARN-05**: Learning runs without any UI visible to the user (optional `/learning` debug page reserved for Tim only)

### Dashboard + Calendar

- [ ] **POLISH-01**: Dashboard shows Recent Posts list, Scheduled count, brand switcher, and "Create New Post" CTA
- [ ] **POLISH-02**: Calendar route exists with "Coming Soon" placeholder

### Cutover

- [ ] **LAUNCH-01**: Frontend deployed to Firebase Hosting at the production URL
- [ ] **LAUNCH-02**: Cloud Run `content-gen` deployed; Cloud Tasks queues + Scheduler active
- [ ] **LAUNCH-03**: Final Firestore Security Rules deployed (read/write only `/users/{uid}/**`; `system/killSwitch` write blocked except admin)
- [ ] **LAUNCH-04**: Tim and Jule each create their account, complete onboarding, populate the LEBEN.LIEBEN brand from scratch
- [ ] **LAUNCH-05**: First real post generated, edited, scheduled, and published on @leben.lieben via v3
- [ ] **LAUNCH-06**: Old `content-generation` repo archived (README updated to point at v3)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Calendar

- **CAL-01**: Interactive calendar view of scheduled + published posts
- **CAL-02**: Drag-and-drop to reschedule

### Multi-Brand Productization

- **MB-01**: Public sign-up funnel (remove email allowlist)
- **MB-02**: Per-user spend caps + billing dashboard
- **MB-03**: Onboarding wizard with brand templates

### Learning Visibility

- **LEARN-V2-01**: Optional UI surfacing extracted patterns to user
- **LEARN-V2-02**: User can flag patterns as wrong / dismiss

## Out of Scope

| Feature | Reason |
|---------|--------|
| v2 SQLite data migration | Fresh start in Firestore is simpler; both users re-onboard the LEBEN.LIEBEN brand |
| Staging environment | 2-user internal use; $20/$40 budget cap + kill switch covers cost risk |
| Vercel hosting (Hobby or Pro) | Hobby 10s timeout + commercial ToS conflict; Pro $20/mo unjustified at this scale |
| Pillar P3 (Loyalty/Nurture) | Plan deliberately reduces to 2 modes (`create-demand`, `convert-demand`) |
| LearningDashboardPage | Learning runs invisibly; complex dashboard adds no value |
| Style Types page | Removed as part of radical scope reduction |
| Layout Templates page | Same |
| Content Strategy page | Same |
| Hooks Guidance field | Removed from identity schema |
| Library hooks/ctas/science tabs | Reduced to Situations only |
| Real-time multi-user collab on single post | All data scoped per user; no shared posts |
| OnCreate Cloud Function for sign-up gating | Replaced by hardcoded allowlist in `requireAuth` (same security, -1 deploy target) |
| Browser pool in render service | `concurrency=1` makes pooling pointless; per-request Chromium launch instead |
| Mobile native app | Web-first |
| 2FA on app sign-in | Out of scope; Tim runs 2FA on Google account separately |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| INFRA-07 | Phase 1 | Pending |
| INFRA-08 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Pending |
| AUTH-07 | Phase 1 | Pending |
| BRAND-01 | Phase 2 | Pending |
| BRAND-02 | Phase 2 | Pending |
| BRAND-03 | Phase 2 | Pending |
| BRAND-04 | Phase 2 | Pending |
| BRAND-05 | Phase 2 | Pending |
| BRAND-06 | Phase 2 | Pending |
| BRAND-07 | Phase 2 | Pending |
| CREATE-01 | Phase 2 | Pending |
| CREATE-02 | Phase 2 | Pending |
| CREATE-03 | Phase 2 | Pending |
| CREATE-04 | Phase 2 | Pending |
| CREATE-05 | Phase 2 | Pending |
| CREATE-06 | Phase 2 | Pending |
| CREATE-07 | Phase 2 | Pending |
| CREATE-08 | Phase 2 | Pending |
| RENDER-01 | Phase 3 | Pending |
| RENDER-02 | Phase 3 | Pending |
| RENDER-03 | Phase 3 | Pending |
| RENDER-04 | Phase 3 | Pending |
| RENDER-05 | Phase 3 | Pending |
| POST-01 | Phase 3 | Pending |
| POST-02 | Phase 3 | Pending |
| POST-03 | Phase 3 | Pending |
| POST-04 | Phase 3 | Pending |
| POST-05 | Phase 3 | Pending |
| POST-06 | Phase 3 | Pending |
| POST-07 | Phase 3 | Pending |
| LEARN-01 | Phase 4 | Pending |
| LEARN-02 | Phase 4 | Pending |
| LEARN-03 | Phase 4 | Pending |
| LEARN-04 | Phase 4 | Pending |
| LEARN-05 | Phase 4 | Pending |
| POLISH-01 | Phase 4 | Pending |
| POLISH-02 | Phase 4 | Pending |
| LAUNCH-01 | Phase 5 | Pending |
| LAUNCH-02 | Phase 5 | Pending |
| LAUNCH-03 | Phase 5 | Pending |
| LAUNCH-04 | Phase 5 | Pending |
| LAUNCH-05 | Phase 5 | Pending |
| LAUNCH-06 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 53 total
- Mapped to phases: 53
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-26*
*Last updated: 2026-04-26 after initial definition*
