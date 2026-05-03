## Project

**Content-Generation v3**

Multi-user web app for AI-assisted Instagram carousel creation. Tim and Jule each sign in, manage their own brands, generate slides via Claude, edit in a zone editor, schedule/publish to Instagram, and let the app silently learn from their edits to improve future first-shots. Replaces the local single-user Express + SQLite v2 with a Firebase + Cloud Run cloud stack so Jule can operate LEBEN.LIEBEN without a local dev install.

**Core Value:** A non-technical user can sign in, generate a carousel, edit it, and publish to Instagram from any browser - with first-shot quality silently improving over time.

### Constraints

- **Tech stack**: React 19 + Vite + Zustand + React Router v7 (frontend); Firebase Auth + Firestore + Storage + Hosting; Single Cloud Run service `content-gen` (concurrency=1, mem=2Gi, cpu=2, min-instances=1) - all backend in one container
- **Region**: `europe-west1` (Firebase + Cloud Run)
- **Budget**: $20 soft alert / $40 hard kill switch on GCP billing. Expected fixed cost $0, variable ~$0-$2/mo at 2-user volume
- **Security**: Firestore rules scope all data to `/users/{uid}/**`. API keys encrypted via Cloud KMS. `/api/*` requires Firebase ID-token + email-allowlist; `/internal/*` requires OIDC verify (audience + invoker SA)
- **Compliance**: Tim's Nebentätigkeitsanzeige covers commercial use - no Vercel Hobby ToS issue
- **Dependencies**: Blaze plan required (Cloud Run, Tasks, KMS, Scheduler all need it)
- **Performance**: Render is async via Cloud Tasks (`renderJobs` sub-collection, 2s client poll). Generate streams via Cloud Run 5min default timeout (no SSE workaround needed)
- **Reuse**: Zone editor (`ZoneCanvas`, `SlidePanel`, `ZonePanel`), `parseSlidesMd`, `editDiff.ts`, `assembleSystemPrompt`, prompt files (`base.md`, `methods/*.md`) ported from v2

## Source-of-Truth References

- **Architecture / ADRs / scope:** `~/.claude/plans/modular-tumbling-sunrise.md` (v6 ISSUES_CLOSED 2026-04-26)
- **Operational state, deploy anchors, locked patterns, remaining work, requirements traceability:** `STATE.md` (root)
- **v2 source for verbatim ports:** `C:\webprojects\content-generation\client\src\components\social-club\`

## Conventions

- **No GSD ceremony.** Direct execution: dispatch parallel sub-agents -> integrate -> deploy -> commit. Surface decisions only when ambiguous.
- **Package manager: pnpm** (root + `server/functions/`). Dockerfile uses `npm ci` for Cloud Build remote (no local conflict).
- **No em dashes.** Use `-` or rewrite.
- **German Umlaute** as proper characters (ä, ö, ü, ß), not ae/oe/ue substitutions.
- **Feature-branch + PR + Vercel/Firebase preview** is the safer default; direct-to-main only for docs-only commits.
- **Verify after deploy via gh CLI:** `gh api repos/<owner>/<repo>/commits/<ref>/status` returns Vercel/CI state.
- **Sub-agent fan-out pattern:** orchestrator pre-scaffolds shared types + installs deps, gives each agent a strict file-allowlist + read-only on `shared/*`, integrates router mounts + IAM bindings + schema additions after agents return.
- **Live-verify any RLS / routing / build-config change in browser** before declaring done; type-check + unit tests do not exercise RLS, edge rewrites, or runtime asset paths.
