# Roadmap: Content-Generation v3

## Overview

Five coarse phases consolidate the eight phases of the source plan into broader build chunks. The journey starts with cloud infrastructure + auth shell, lands the user-facing brand and create flows, adds the async render and posting backend, layers the invisible learning loop and dashboard polish, and finishes with a hard cutover where Tim and Jule onboard fresh on the LEBEN.LIEBEN brand and publish the first real post via v3.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation & Infrastructure** - GCP/Firebase project, Cloud Run + Tasks + Scheduler + KMS, Auth shell with allowlist + onboarding
- [ ] **Phase 2: Brand Settings & Create** - Reduced settings schema, Focus Areas, Generate flow with Cloud Run streaming, zone editor on Firestore
- [ ] **Phase 3: Render & Posts** - Async render service via Cloud Tasks, 3-tab Posts page, Schedule + Publish workers
- [ ] **Phase 4: Learning & Polish** - Invisible edit-diff/pattern extraction loop, dashboard widgets, calendar placeholder
- [ ] **Phase 5: Cutover** - Production deploy, final security rules, fresh-start onboarding for Tim + Jule, first real post on @leben.lieben

## Phase Details

### Phase 1: Foundation & Infrastructure
**Goal**: Cloud project and runtime are provisioned end-to-end, and any allowlisted user can sign in, complete onboarding, and reach an empty app shell.
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07
**Success Criteria** (what must be TRUE):
  1. A new email on the allowlist can sign in via Google and via email magic link
  2. After first sign-in, the user is forced through an onboarding modal that captures brand name + Anthropic API key before reaching the app
  3. A non-allowlisted email can sign up but receives 403 on every API call
  4. `/internal/*` endpoints reject requests without a valid OIDC token from `internal-invoker`
  5. Flipping `system/killSwitch.enabled = false` returns 503 on the next API call within 30 seconds
**Plans**: 3 plans

Plans:
- [ ] 01-01: Provision GCP/Firebase project, enable Blaze, configure budget alerts and kill switch doc
- [ ] 01-02: Stand up `content-gen` Cloud Run service with `requireAuth` (Firebase ID-token + allowlist) and `requireOidc` middleware; wire Cloud Tasks queues + Cloud Scheduler tick
- [ ] 01-03: Frontend foundation - Vite + React + Tailwind + Zustand shell, Firebase Auth hooks, onboarding modal, BrandSwitcher, Firestore security rules

### Phase 2: Brand Settings & Create
**Goal**: A signed-in user can configure their brand and generate + edit a carousel from prompt to draft entirely in Firestore.
**Depends on**: Phase 1
**Requirements**: BRAND-01, BRAND-02, BRAND-03, BRAND-04, BRAND-05, BRAND-06, BRAND-07, CREATE-01, CREATE-02, CREATE-03, CREATE-04, CREATE-05, CREATE-06, CREATE-07, CREATE-08
**Success Criteria** (what must be TRUE):
  1. User can fill out Identity, Design, Focus Areas, Situations, and API keys; reload page; all values persist
  2. User can launch a generate from `/create` with mode + method + focus + situation + photos and watch slides stream in
  3. After generation, a draft post doc exists in Firestore with immutable `aiSnapshot` and editable `slides`/`caption`
  4. Editing a zone in the editor saves to Firestore and survives a page reload
  5. P3 Loyalty pillar code, hooks_guidance, strategy, styleTypes, layoutTemplates, and removed library tabs do not exist anywhere in the codebase
**Plans**: 3 plans

Plans:
- [ ] 02-01: Settings schema reduction + Identity / Design / Focus Areas / Library (Situations only) / API Keys pages on Firestore
- [ ] 02-02: Cloud Run `/api/generate` endpoint - mode/method prompt assembly (Pillar→Mode refactor), focus-area injection, KMS-decrypted Anthropic key, abort-on-disconnect, photo upload to Storage
- [ ] 02-03: Frontend `/create` route (renamed from social-club), generate form, zone editor on Firestore post doc with auto-save and immutable `aiSnapshot`

### Phase 3: Render & Posts
**Goal**: A draft can be rendered to PNGs asynchronously, scheduled, and published to Instagram - reliably and at most once.
**Depends on**: Phase 2
**Requirements**: RENDER-01, RENDER-02, RENDER-03, RENDER-04, RENDER-05, POST-01, POST-02, POST-03, POST-04, POST-05, POST-06, POST-07
**Success Criteria** (what must be TRUE):
  1. Clicking render in the editor enqueues a Cloud Task; PNGs appear in the editor preview as each slide completes (2s poll)
  2. `/posts` page shows three tabs - History, Scheduled, Drafts - each populated correctly from Firestore
  3. A post scheduled for `now+5min` is auto-published on @leben.lieben within ~5 minutes via Cloud Scheduler tick
  4. Double-clicking Publish Now or two parallel Scheduler ticks never produces two IG posts (Firestore transaction guarantees idempotency)
  5. A post stuck in `status='publishing'` for >10 minutes is recovered to `scheduled` by the sweep job
**Plans**: 3 plans

Plans:
- [ ] 03-01: `/internal/render` worker (Playwright per-request, no pool) + `/api/render-jobs` enqueuer + `renderJobs` sub-collection + 2s client polling
- [ ] 03-02: 3-tab Posts page (History / Scheduled / Drafts) with Schedule modal and Publish Now button wired to Firestore transitions
- [ ] 03-03: `/internal/publish-worker` (Cloud Scheduler-driven) with Firestore transaction, stale-lock sweep, Meta Graph publish, IG-stats sync Cloud Function

### Phase 4: Learning & Polish
**Goal**: Each publish silently teaches the prompt, dashboard surfaces useful state, and calendar is parked behind a placeholder.
**Depends on**: Phase 3
**Requirements**: LEARN-01, LEARN-02, LEARN-03, LEARN-04, LEARN-05, POLISH-01, POLISH-02
**Success Criteria** (what must be TRUE):
  1. After publishing 5 posts with edits, `brand.learnedPatterns` contains extracted patterns and the next generate prompt includes a `<learned_patterns>` block (verifiable in network trace)
  2. Replaying pattern extraction on the same publish does not create duplicate patterns
  3. No learning UI is visible in normal navigation (optional `/learning` debug route only)
  4. Dashboard shows Recent Posts, Scheduled count, brand switcher, and Create CTA
  5. `/calendar` route loads with a "Coming Soon" placeholder
**Plans**: 2 plans

Plans:
- [ ] 04-01: `/internal/learning-worker` triggered post-publish - port `computeEditDiff`, async pattern extraction via Claude Haiku with idempotency guard, `learnedPatterns` injection in `/api/generate`
- [ ] 04-02: Dashboard widgets (Recent Posts, Scheduled count, BrandSwitcher, Create CTA) + Calendar placeholder route

### Phase 5: Cutover
**Goal**: v3 is live in production, both users are onboarded fresh, the first real post is published on @leben.lieben, and v2 is archived.
**Depends on**: Phase 4
**Requirements**: LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04, LAUNCH-05, LAUNCH-06
**Success Criteria** (what must be TRUE):
  1. Frontend at the production Firebase Hosting URL serves the v3 app with Firebase Auth wired
  2. Final Firestore security rules block any cross-user read/write attempt
  3. Tim and Jule each complete onboarding for the LEBEN.LIEBEN brand from scratch
  4. A post is generated, edited, scheduled, and published on @leben.lieben via v3
  5. The old `content-generation` repo README points at v3 and the v3-rewrite branch is retired
**Plans**: 1 plan

Plans:
- [ ] 05-01: Production deploy (Firebase Hosting + `gcloud run deploy`), final security rules, fresh-start onboarding session with Tim + Jule, first real publish, archive v2

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Infrastructure | 0/3 | Not started | - |
| 2. Brand Settings & Create | 0/3 | Not started | - |
| 3. Render & Posts | 0/3 | Not started | - |
| 4. Learning & Polish | 0/2 | Not started | - |
| 5. Cutover | 0/1 | Not started | - |
