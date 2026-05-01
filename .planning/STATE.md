---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 1 deployed live to contentai-78bfb; Phase 2 prod smoke pending Tim
last_updated: "2026-05-01T20:00:00.000Z"
last_activity: 2026-05-01 - Phase 1 deployed end-to-end (Cloud Run, Tasks, KMS, Scheduler, Functions, Hosting). Auth + Allowlist + Magic-Link verified live.
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-26)

**Core value:** A non-technical user can sign in, generate a carousel, edit it, and publish to Instagram from any browser - with first-shot quality silently improving over time.
**Current focus:** Phase 1 deployed live (project contentai-78bfb). Phase 2 prod smoke (sign-in → /create → /editor with aiSnapshot persistence) pending Tim. Phase 3 (server PNG render + publish) next.

## Current Position

Phase: 1 deployed live; 2 of 5 complete code-side (Brand Settings + Create + Editor)
Plan: 6 of 6 written; Phase 1 verified end-to-end against contentai-78bfb
Status: Phase 1 live deploy verified (auth, OIDC, kill-switch trip, magic-link, hosting rewrite). Phase 2 prod smoke pending.
Last activity: 2026-05-01 - Live deploy session: Cloud Run + bootstrap.sh + Functions + Rules + Hosting deployed to contentai-78bfb; 8/10 user-facing probes A-J green.

Progress: [████░░░░░░] 40%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1: Single Cloud Run service (collapsed from 2) - 2-user concurrency tolerated
- Phase 1: Firebase Hosting over Vercel - Hobby ToS + 10s timeout
- Phase 1: Email allowlist in `requireAuth` middleware (no `onCreate` Cloud Function)
- Phase 1: Single kill switch (`system/killSwitch.enabled`) - one tripwire, auto-flip at $40

### Pending Todos

- Tim: emulator smoke for phase 02 (sign-in -> /settings/photos upload -> /create generate -> /editor edits persist with aiSnapshot byte-identical; cancel-before-complete = no post doc).
- Tim: optional vitest harness for web package (streamGenerate trailing-byte test + saveDraftDebounced no-aiSnapshot test).
- aiSnapshot mutation rules-deny test (rule itself shipped in 02-01).

### Blockers/Concerns

- ~~Blaze plan~~ resolved 2026-05-01 (active on `contentai-78bfb`)
- SDK 0.32.1: prompt caching (`cache_control`) deferred until SDK exposes the type on stable `TextBlockParam` - currently sending `system` as plain string
- Tim's `tim.gansczyk@gmail.com` granted `roles/iam.serviceAccountTokenCreator` on `internal-invoker` SA for OIDC manual probes

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Editor | Server-side PNG render of slides | Phase 03 (per Tim Q1 lock) | Phase 02 plan |
| Editor | Inline photo upload from SlidePanel side rail | Stubbed; pool management lives in /settings/photos | Phase 02 plan 02-03 |
| Tests | Vitest harness for web package | Backlog | Phase 02 plan 02-03 |
| Prompt caching | `cache_control: ephemeral` on system message | SDK 0.32.1 stable doesn't expose it | Phase 02 plan 02-02 |

## Session Continuity

Last session: 2026-05-01T20:00:00.000Z
Stopped at: Phase 1 deployed live to contentai-78bfb; Phase 2 prod smoke pending Tim
Resume file: .planning/phases/02-brand-settings-create/02-03-SUMMARY.md

## Live Deploy Anchors (Phase 1)

- Project: `contentai-78bfb` (europe-west1)
- Hosting: https://contentai-78bfb.web.app
- Cloud Run: https://content-gen-23953893533.europe-west1.run.app
- Quirks fixed during deploy:
  - `tsconfig.server.json` outDir `dist/server` → `dist` (Dockerfile CMD path alignment)
  - `web/postcss.config.js` + `web/tailwind.config.js` need explicit absolute paths (cwd vs config-dir mismatch with vite-from-root)
  - `/healthz` GFE-intercepted; use `/healthz/` for external probes
  - OIDC tokens via `gcloud print-identity-token` need `--include-email` flag
