<!-- GSD:project-start source:PROJECT.md -->
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
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
