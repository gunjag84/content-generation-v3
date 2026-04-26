# Phase 1: Foundation & Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 01-foundation-infrastructure
**Areas presented:** Repo & monorepo layout, Local dev workflow, Frontend ↔ Cloud Run routing in prod, Onboarding modal flow + gate
**Discussion mode:** User delegated all selections — "I trust your recommendation."

---

## Repo & Monorepo Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Single package.json | Root package.json with web/, server/, shared/ subdirs; TS path aliases | ✓ |
| pnpm/npm workspaces | Multiple package.jsons under workspaces config | |

**Claude's choice:** Single package.json. Workspaces add multiple package.jsons + hoisting rules for zero benefit at 2-user scale (Tim's minimalism rule).

---

## Local Dev Workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Firebase Emulator Suite | Auth/Firestore/Storage emulators locally; Vite proxies /api to local Express | ✓ |
| Hit prod Firebase from localhost | Single env, no emulator complexity, but pollutes prod data | |

**Claude's choice:** Emulator Suite. Cleaner separation; Vite proxy mirrors prod's Hosting-rewrite routing. KMS has no emulator → server detects emulator mode and skips encrypt/decrypt (plaintext key in dev Firestore).

---

## Frontend ↔ Cloud Run Routing (Prod)

| Option | Description | Selected |
|--------|-------------|----------|
| Firebase Hosting rewrites | Same-origin /api/** routed to Cloud Run; no CORS, clean cookies, +50-200ms latency | ✓ |
| Direct CORS to *.run.app | env-var backend URL; CORS preflight; saves a hop | |

**Claude's choice:** Hosting rewrites. Latency cost is irrelevant at this scale; same-origin avoids env-var sprawl and CORS plumbing. `/internal/*` is NOT rewritten — Tasks/Scheduler hit `*.run.app` directly with OIDC.

---

## Onboarding Modal Flow + Gate

| Option | Description | Selected |
|--------|-------------|----------|
| Single screen, no key validation | Brand + key fields; trust input; first-generate surfaces bad keys | ✓ |
| Two-step wizard with live key validation | Validate Anthropic key with test call before saving | |

**Claude's choice:** Single screen, no live validation. Avoids pre-value API call, decouples onboarding from Anthropic uptime. Modal non-dismissible. Gate enforced server-authoritative (412 on `/api/*` if `apiKeys.anthropic` missing) + client UX layer. Onboarding write order: user doc → brand doc → activeBrandId → POST /api/settings/api-keys (server KMS-encrypts).

---

## Claude's Discretion

User explicitly delegated all gray-area choices ("I trust your recommendation"). All 30 decisions in CONTEXT.md were Claude-locked under that delegation, including bonus areas not in the original AskUserQuestion list:

- App shell scope for Phase 1 (sidebar with all 5 routes, only Dashboard rendering empty state)
- Bootstrap as `scripts/bootstrap.sh` (idempotent) vs. markdown runbook
- Allowlist hardcoded const (matches PLAN-SOURCE.md)
- Firestore rules strict from day 1 (resolved LAUNCH-03 ambiguity in favor of strict-from-start)
- Kill switch as in-memory 30s TTL cache, request-driven refresh
- Budget alert auto-flip via Pub/Sub → tiny Cloud Function (one Cloud Function added)
- TypeScript strict mode on both tsconfigs

Tim should flag any of these during planning if downstream constraints surface.

---

## Deferred Ideas

- **Meta Graph token onboarding** — added in Phase 3 when publishing wires up.
- **Public sign-up funnel, per-user spend caps** — v2 requirements, out of scope.
- **Optional `/learning` debug page** — Phase 4, Tim-UID-gated.
- **Brand creation/deletion UI** — Phase 2.
- **Live Anthropic key validation during onboarding** — reconsider post-launch if recurring complaint.
- **KMS envelope encryption** — explicitly rejected by Q3 in PLAN-SOURCE.md.
- **Staging environment** — out of scope; kill switch + budget cap covers risk.
