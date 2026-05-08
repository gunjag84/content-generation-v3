# Project Plan - Content-Generation v3

Single source of truth for **scope and direction**. Operational state (deploy anchors, locked patterns, deploy quirks, NDJSON shapes, requirements traceability) lives in `STATE.md`. Architecture/ADRs/full spec live in `~/.claude/plans/modular-tumbling-sunrise.md` (v6 ISSUES_CLOSED 2026-04-26, historical reference).

Last updated: 2026-05-08.

---

## Goal / North-Star

A non-technical user (Tim or Jule) signs in, manages their own brands, generates Instagram carousels via Claude, edits in a zone editor, schedules/publishes to IG, and lets the app silently learn from their edits to improve future first-shots — all from any browser, with first-shot quality measurably improving over time.

Tier-0 (Handover-Critical): Jule must be able to operate LEBEN.LIEBEN cloud-only without a local dev install. Until v3 cutover lands, Tier-2 handover of LEBEN.LIEBEN is blocked.

---

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1. Foundation & Infrastructure | GCP/Firebase project, Cloud Run + Tasks + Scheduler + KMS, Auth shell | Live |
| 2. Brand Settings & Create | Settings schema, Focus Areas, generate streaming, zone editor on Firestore | Live |
| 3. Render & Posts | Async render via Cloud Tasks, 3-tab Posts page, Schedule + Publish workers | Live |
| 4a. Silent Edit-Diff Learning Loop | Edit-diff -> learnedPatterns -> prompt injection, Haiku audit, promotion approval UI, brand.identity wiring | Live (deployed `content-gen-00013-ctz`) |
| 4b. Performance Dashboard + Polish | Read-only igStats display, edit hot-spots widget, dashboard widgets, per-post IG analytics in History, format-aware Playwright render with brand fonts, IG container polling against code 9007 | Live (deployed `content-gen-00021-9r9`) |
| 4c. Automated Performance Learning | Auto-extract patterns from top-performing posts | Deferred (revisit at N>=20 publishes) |
| 5. Cutover | Final security rules, fresh-start onboarding for Tim + Jule, first real post on @leben.lieben | In progress |

---

## Current Phase + Next Step

**Phase 5 - Cutover.** Kill-switch trip-test passed E2E (2026-05-07); igFeedSync deployed; LEBEN.LIEBEN brand fresh-onboarded with 94 organic IG posts synced.

**Next steps to close Phase 5:**
1. Tim + Jule each complete fresh onboarding for LEBEN.LIEBEN brand on prod.
2. First real test-post end-to-end: Generate -> Edit -> Schedule `now+5min` -> verify on @leben.lieben.
3. Old `content-generation` repo README points at v3; `v3-rewrite` branch retired.

After Phase 5 closes, Tier-2 handover of LEBEN.LIEBEN to Jule unblocks.

---

## Open Decisions

None right now. Architectural decisions are locked (see `STATE.md` "Locked Architectural Decisions").

---

## Out-of-Scope

| Item | Reason |
|------|--------|
| `cache_control: ephemeral` on system message | SDK 0.32.1 stable doesn't expose it; revisit when SDK adds the type or move to beta endpoint |
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

## Remaining Work (Phase 4c + 5 detail)

### Phase 4c: Automated Performance Learning (DEFERRED)

**Trigger to revisit:** when N>=20 published posts exist with igStats, OR Tim explicitly requests earlier.

**Sketch (not built):** Cloud Function reads top-N posts by engagement_rate, Claude Haiku extracts qualitative themes (high-performing hook patterns, CTA patterns), writes to a separate `performancePatterns` sub-collection, injected into prompt as `<performance_patterns>` block alongside `<learned_patterns>`. Same injection mechanism, different signal source.

### Phase 5: Cutover

**Plan:**
- Final-build + deploy: `pnpm build:web` -> `firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting` + `gcloud run deploy content-gen --source=.`
- Pub/Sub trip-test: `gcloud pubsub topics publish budget-alerts --message='{"costAmount":40,"budgetAmount":40}'` -> killSwitch flips -> 503 on `/api/*` -> re-seed via `seed-killswitch.sh`. (Done 2026-05-07.)
- Tim: sign-in on prod URL, Anthropic key, real LEBEN.LIEBEN brand + identity fields.
- Jule sign-in ceremony, her brand setup.
- First real test-post: Generate -> Edit -> Schedule for `now+5min` -> wait -> IG post live on @leben.lieben.

**Success criteria:**
1. Final Firestore security rules block any cross-user read/write attempt.
2. Tim and Jule each complete onboarding for the LEBEN.LIEBEN brand from scratch.
3. Post generated, edited, scheduled, published on @leben.lieben via v3.
4. Old `content-generation` repo README points at v3; `v3-rewrite` branch retired.

---

## Pending TODOs (Tim, manual)

- Phase 2 prod smoke: sign-in -> /settings/photos upload -> /create generate (story + zitat paths) -> /editor edits persist with `aiSnapshot` byte-identical; cancel-before-complete = no post doc.
- Phase 3 user-facing prod smoke: /create -> /editor render -> /posts schedule + publish.
- Meta Graph token + `instagramUserId` per Brand: UI exists; manual Firestore-Console fallback also possible.
- LEBEN.LIEBEN-Brand fresh setup für Cutover.

## Pending TODOs (backlog)

- Vitest harness for web package (streamGenerate trailing-byte test + saveDraftDebounced no-aiSnapshot test).
- aiSnapshot mutation rules-deny test (rule itself is live since 02-01).
- Re-sign helper for >7-day signed Storage URLs.

---

## Risks (Phase 4 + 5)

| Risk | Mitigation |
|------|------------|
| Learning-loop pattern extract returns invalid JSON | Zod schema validation; on failure 1 retry with explicit JSON-only re-prompt; then store with `parse_failed` flag |
| Anthropic spend during E2E tests | E2E doc uses 1-2 generates total, no volume tests |
| Token theft in worst-case window before $40 budget alert | 2FA on Tim's Google account (out-of-scope for plan, hard-recommended) |
| Stale `publishing` lock from worker crash | Collection-group sweep recovers >10min locks to `scheduled` |

## Recent Runs

- 2026-05-08 20:28 T1-web-vitest-harness [success] 7m55s $0.920 — Done. Here's what was built:  **Installation** — `pnpm install --ignore-workspace` from `web/` installed vitest 2.1.9...
- 2026-05-08 20:38 T2-aisnapshot-rules-deny-test [success] 17m54s $2.881 — Marker created. Here is the full summary:  ---  ## T2 outcome: test written, security rules bug discovered  ### What ...
- 2026-05-08 20:43 T3-resign-storage-helper [success] 3m19s $0.668 — Done. Two files produced:  **`server/lib/resignSlides.ts`** - `parseSignedUrlExpiry(url)` — extracts expiry from a GC...
