# Content-Generation v3

## What This Is

Multi-user web app for AI-assisted Instagram carousel creation. Tim and Jule each sign in, manage their own brands, generate slides via Claude, edit in a zone editor, schedule/publish to Instagram, and let the app silently learn from their edits to improve future first-shots. Replaces the local single-user Express + SQLite v2 with a Firebase + Cloud Run cloud stack so Jule can operate LEBEN.LIEBEN without a local dev install.

## Core Value

A non-technical user can sign in, generate a carousel, edit it, and publish to Instagram from any browser - with first-shot quality silently improving over time.

## Requirements

### Validated

(None yet - ship to validate)

### Active

See `.planning/REQUIREMENTS.md` for the full v1 list.

### Out of Scope

- Data migration from v2 SQLite - fresh start in Firestore (Tim and Jule re-create their LEBEN.LIEBEN brand manually)
- Staging environment - prod-only, internal-use; cost risk covered by $20 budget cap + kill switch
- Vercel hosting - dropped (10s function timeout on Hobby, $20/mo Pro). Firebase Hosting + Cloud Run instead
- Public sign-up funnel - email allowlist hardcoded in `requireAuth` (Tim + Jule only); ghost-user accounts in Firebase Auth list are cosmetic
- v2-cloud rollback - rollback path = local v2 (each user clones old repo, `npm run dev`)
- LearningDashboardPage - learning runs invisibly; optional `/learning` debug page only
- Pillar P3 (Loyalty/Nurture) - removed from prompt set; only `create-demand` and `convert-demand` modes remain
- Style Types, Layout Templates, Strategy, Hooks Guidance - removed entirely from settings schema
- Real-time multi-user collaboration on a single post - posts are user-scoped, no shared editing

## Context

- Replaces v2 at `C:\webprojects\content-generation\` (Tier 3 parked, remains runnable for fallback)
- Both users on @leben.lieben Instagram - the only live brand at launch
- Tim runs the Anthropic API spend on his own key per user (no proxy)
- Plan was peer-reviewed: CEO + Eng review, verdict ISSUES_CLOSED 2026-04-26 (v6 simplification pass)
- Source plan: `PLAN-SOURCE.md` (1014 lines, full architectural spec + IAM + failure modes)
- Driving constraint for handover: Jule needs a working web app, no local setup

## Constraints

- **Tech stack**: React 19 + Vite + Zustand + React Router v7 (frontend); Firebase Auth + Firestore + Storage + Hosting; Single Cloud Run service `content-gen` (concurrency=1, mem=2Gi, cpu=2, min-instances=1) - all backend in one container
- **Region**: `europe-west1` (Firebase + Cloud Run)
- **Budget**: $20 soft alert / $40 hard kill switch on GCP billing. Expected fixed cost $0, variable ~$0-$2/mo at 2-user volume
- **Security**: Firestore rules scope all data to `/users/{uid}/**`. API keys encrypted via Cloud KMS. `/api/*` requires Firebase ID-token + email-allowlist; `/internal/*` requires OIDC verify (audience + invoker SA)
- **Compliance**: Tim's Nebentätigkeitsanzeige covers commercial use - no Vercel Hobby ToS issue
- **Dependencies**: Blaze plan required (Cloud Run, Tasks, KMS, Scheduler all need it)
- **Performance**: Render is async via Cloud Tasks (`renderJobs` sub-collection, 2s client poll). Generate streams via Cloud Run 5min default timeout (no SSE workaround needed)
- **Reuse**: Zone editor (`ZoneCanvas`, `SlidePanel`, `ZonePanel`), `parseSlidesMd`, `editDiff.ts`, `assembleSystemPrompt`, prompt files (`base.md`, `methods/*.md`) ported from v2

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single Cloud Run service (collapsed from 2) | 2-user × ~5 generates/day = concurrent-overlap probability ≈ 0; worst-case 30s queue is acceptable | - Pending |
| Firebase Hosting over Vercel | Vercel-Hobby 10s timeout + commercial-use ToS issue; Firebase free-tier covers 2 users with same-project Auth integration | - Pending |
| Cloud KMS direct (no envelope encryption) | Simpler than self-built AES layer; sufficient at 2-user scale | - Pending |
| `min-instances=1`, `concurrency=1`, no browser pool | Pool gives no benefit at concurrency=1; per-request Chromium launch is honest behavior | - Pending |
| Email allowlist in middleware (no `onCreate` Cloud Function) | Same security property, -1 deploy target; ghost users in Firebase Auth list are cosmetic | - Pending |
| Single kill switch (`system/killSwitch.enabled`) | One tripwire instead of 3 separate flags; auto-flip at $40 budget alert | - Pending |
| `renderJobs` as `users/{uid}/renderJobs/{jobId}` | Nested under user so existing security rule applies; no top-level path | - Pending |
| Pattern extraction via Claude Haiku | Short prompt, no need for Sonnet; cheap async LLM call | - Pending |
| Fresh start in Firestore (no v2 migration) | Both users re-onboard the LEBEN.LIEBEN brand; eliminates migration tooling | - Pending |
| v3 lives in parallel directory `content-generation-v3` | Old v2 repo stays runnable as fallback; `v3-rewrite` branch in old repo retired | - Pending |

---
*Last updated: 2026-04-26 after initial project setup*
