# Phase 1: Foundation & Infrastructure - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Provision the GCP/Firebase project end-to-end and ship an auth shell so an allowlisted user can sign in (Google + email magic link), be forced through onboarding (brand name + Anthropic API key), and reach an empty app shell. Three plans cover this:

- **01-01:** GCP/Firebase project, Blaze, IAM, Tasks queues, Scheduler, KMS keyring, budget alerts, kill switch doc
- **01-02:** `content-gen` Cloud Run service with `requireAuth` (Firebase ID-token + email allowlist) and `requireOidc` (audience + invoker SA) middleware; kill switch check; Tasks/Scheduler wiring
- **01-03:** Frontend foundation (Vite + React + Tailwind + Zustand), Firebase Auth hooks, onboarding modal, BrandSwitcher, Firestore security rules

No business features (settings pages content, generate, render, posts, learning) — those are Phase 2+.

</domain>

<decisions>
## Implementation Decisions

User delegated all gray-area selections ("I trust your recommendation"). Decisions below are locked by Claude based on PROJECT.md, PLAN-SOURCE.md, and the minimalism rule. Flag any during planning if downstream constraints surface.

### Repo & Monorepo Layout
- **D-01: Single package.json at repo root.** Layout:
  ```
  /web/        → Vite app (React 19, Tailwind, Zustand, Firebase SDK client)
  /server/     → Express on Cloud Run (Firebase Admin, KMS, Tasks SDK)
  /shared/     → TS types, Zod schemas, prompt files (later phases)
  /scripts/    → bootstrap.sh, deploy scripts
  /firebase.json, /firestore.rules, /storage.rules
  /Dockerfile  → at repo root, builds /server (+ /shared)
  package.json → single, with TS path aliases @web/*, @server/*, @shared/*
  tsconfig.base.json + tsconfig.web.json + tsconfig.server.json
  ```
- **D-02: No pnpm/npm workspaces.** One lockfile, one node_modules. Workspaces add moving parts (multiple package.jsons, hoisting rules) for zero benefit at this scale.
- **D-03: Vite imports `shared/` via `resolve.alias`; server imports via `tsconfig.server.json` paths.** Dockerfile copies only `server/` + `shared/` + relevant deps to keep image lean.
- **D-04: TypeScript strict mode on, both tsconfigs.** No partial-strict opt-in.

### Local Dev Workflow
- **D-05: Firebase Emulator Suite for Auth + Firestore + Storage.** Default dev mode hits emulators, never prod. One command: `firebase emulators:start`.
- **D-06: Cloud Run service runs locally as `npm run dev:server` (tsx watch + Express on `localhost:8080`).** Reads `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` env vars to auto-route through emulators.
- **D-07: Vite dev server on `localhost:5173` proxies `/api/*` and `/internal/*` to `localhost:8080` via `vite.config.ts` `server.proxy`.** No CORS in dev. Same routing model as prod (Hosting rewrites).
- **D-08: Kill switch in dev:** emulator seed script writes `system/killSwitch = { enabled: true }` on `firebase emulators:start`. Test the kill-switch by manually flipping in the Emulator UI.
- **D-09: Allowlist in dev:** the same hardcoded const applies. Tim signs in with his real allowlisted email. No dev-only bypass — keeps dev/prod parity.
- **D-10: Anthropic API key in dev:** real key (Tim's), entered through the onboarding modal once and persisted in the local emulator's Firestore. Re-emulator-reset = re-onboard. Acceptable for 2-user dev.
- **D-11: KMS in dev:** no emulator exists for KMS. Server-side detect emulator mode and skip encrypt/decrypt — store Anthropic key as plaintext in `users/{uid}.apiKeys.anthropic` when `FIRESTORE_EMULATOR_HOST` is set. Production code path unchanged.

### Frontend ↔ Cloud Run Routing (Prod)
- **D-12: Same-origin via Firebase Hosting rewrites.** `firebase.json`:
  ```json
  {
    "hosting": {
      "rewrites": [
        { "source": "/api/**", "run": { "serviceId": "content-gen", "region": "europe-west1" } },
        { "source": "**", "destination": "/index.html" }
      ]
    }
  }
  ```
- **D-13: `/internal/*` is NOT exposed via Hosting rewrites.** It is invoked only by Cloud Tasks and Cloud Scheduler against the direct `*.run.app` URL with OIDC tokens. The browser never calls `/internal/*`.
- **D-14: No `VITE_BACKEND_URL` env var.** Client uses relative `/api/...` paths in both dev (proxy) and prod (Hosting rewrite).
- **D-15: ID-token attached to every `/api/*` request via fetch interceptor** (`firebase.auth().currentUser.getIdToken()`), header `Authorization: Bearer <token>`. Token refresh handled by Firebase SDK auto-refresh.

### Onboarding Modal Flow + Gate
- **D-16: Single screen, two required fields.** Brand name + Anthropic API key. Matches PLAN-SOURCE.md verbatim ("Modal mit zwei Pflichtfeldern").
- **D-17: No live API-key validation call** during onboarding. The first generate attempt surfaces a bad key with a clear error. Rationale: avoid a pre-value API call, avoid coupling onboarding to Anthropic uptime, fewer code paths.
- **D-18: Modal is non-dismissible.** No close button, no escape, no backdrop dismiss. User completes or signs out.
- **D-19: Gate enforcement = server-authoritative + client UX layer.**
  - **Server:** `requireAuth` middleware additionally fetches the user doc and rejects with 412 Precondition Required if `users/{uid}.apiKeys.anthropic` is missing.
  - **Client:** after Firebase Auth resolves, fetch `users/{uid}` doc; if `apiKeys.anthropic` is missing OR `activeBrandId` is missing, render onboarding modal and block route navigation. Pure UX.
- **D-20: Onboarding write order (atomic-ish):**
  1. Client creates `users/{uid}` doc (`email, displayName, createdAt`) — basic write.
  2. Client creates `users/{uid}/brands/{autoId}` doc (`name, createdAt`) — Firestore auto-id.
  3. Client sets `users/{uid}.activeBrandId = autoId`.
  4. Client calls `POST /api/settings/api-keys { anthropic: "<plaintext>" }` over HTTPS. Server KMS-encrypts and writes ciphertext to `users/{uid}.apiKeys.anthropic`.
  - If step 4 fails, modal stays open with retry button. User has a brand but the gate (D-19) keeps them blocked until the key write succeeds. Acceptable: retry is one click.
- **D-21: Brand ID generation:** Firestore auto-id (`doc(collection).id`). User-typed name is `brand.name` only — no slugification, no derivation.
- **D-22: API key never returned to client.** `GET /api/settings/api-keys` returns `{ anthropic: { configured: true|false } }`. Client renders "Anthropic key: configured ✓ / [Replace]". Replacing means re-entering plaintext — server overwrites the ciphertext.

### App Shell Scope (Phase 1)
- **D-23: Sidebar shows all 5 future routes** (Dashboard, Create, Posts, Calendar, Settings) — but only Dashboard renders a real empty state ("No posts yet — Create your first"). Create / Posts / Calendar / Settings render placeholder pages with route heading only. Phase 2+ fills them in.
- **D-24: Header has BrandSwitcher** reading `users/{uid}.activeBrandId` and listing `users/{uid}/brands`. At Phase 1 end, only one brand exists (the one created in onboarding). Brand creation/deletion UI is deferred to Phase 2 (Brand Settings).
- **D-25: No dark mode, no theme switcher.** Out of scope.

### Day-1 Ops Posture
- **D-26: Bootstrap as `scripts/bootstrap.sh`** — captures every gcloud/firebase command from PLAN-SOURCE.md `IAM-Bindings` section. Idempotent (re-runs ignore "already exists" errors). Header comment lists prerequisites (gcloud auth login, firebase login, project ID env var).
- **D-27: Allowlist hardcoded as const in `server/middleware/auth.ts`.** Adding an email = redeploy. At 2 users + Jule handover, redeploy is rare enough to accept. Matches PLAN-SOURCE.md verbatim.
- **D-28: Firestore security rules strict from day 1.**
  ```
  match /users/{uid}/{document=**} {
    allow read, write: if request.auth.uid == uid;
  }
  match /system/{doc} {
    allow read: if request.auth != null;
    allow write: if false;  // only Tim via Admin SDK or console
  }
  ```
  LAUNCH-03 ("final security rules deployed") is interpreted as "final audit", not "first time strict". Tightening later is bug-prone; ship strict.
- **D-29: Kill switch implementation.** Single in-memory `{ value, fetchedAt }` cache per Cloud Run instance, 30s TTL. Refresh on next request after TTL expiry. No Pub/Sub listener — request-driven refresh is sufficient at concurrency=1.
- **D-30: Budget alerts:** $20 email-only, $40 triggers Pub/Sub → tiny Cloud Function that sets `system/killSwitch.enabled = false` via Admin SDK. Cloud Function lives in `server/functions/budget-killswitch.ts` and deploys with `firebase deploy --only functions`. (One Cloud Function added — needed for the auto-flip semantics in INFRA-06 / killSwitch.)

### Claude's Discretion
- Naming of internal modules (`server/middleware/auth.ts`, `server/lib/killSwitch.ts`, etc.) — keep flat, no premature directory nesting.
- Logger choice (pino recommended; structured JSON to stdout for Cloud Run log routing) — researcher to confirm vs. console.log if simpler.
- Error response shape (suggest `{ error: "<code>", message: "<human>" }`) — researcher to align with v2 if a pattern existed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source plan and architectural decisions
- `PLAN-SOURCE.md` §223-361 (Phase 0 Repo + Phase 1 Foundation) — authoritative IAM bindings, middleware code samples, kill switch schema. Researcher and planner should treat the code blocks here as the spec for `requireAuth`, `requireOidc`, and the kill switch check.
- `PLAN-SOURCE.md` §687-728 (Auth & Security gap closures A3, Q3) — single-service auth handshake, KMS direct (no envelope) reasoning.
- `PLAN-SOURCE.md` §3-99 (Context, Tech Stack, Firestore-Datenmodell, Auth-Flow) — locked architecture.
- `PLAN-SOURCE.md` §444-481 (Verification per phase) — Phase 1 acceptance scenarios.

### Project-level context
- `.planning/PROJECT.md` — constraints, key decisions, out-of-scope list.
- `.planning/REQUIREMENTS.md` §INFRA-01..INFRA-08, §AUTH-01..AUTH-07 — the 15 requirements this phase must satisfy.
- `.planning/ROADMAP.md` §Phase 1 — Goal + Success Criteria + plan list.
- `CLAUDE.md` — tech stack, region, security, performance, reuse constraints.

### v2 reference (read-only, for porting)
- `C:\webprojects\content-generation\` — v2 codebase. **No automated migration**. Phase 1 specifically does NOT port any v2 code (foundation only). Later phases will port `ZoneCanvas`, `parseSlidesMd`, `editDiff.ts`, prompt files. Phase 1 researcher may peek at v2 `vite.config.ts`, `tailwind.config.js`, `tsconfig.json` for working patterns to mirror.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None in v3 repo yet** — repo contains only `CLAUDE.md`, `PLAN-SOURCE.md`, `.planning/`. Phase 1 is bootstrapping from zero.
- v2 repo at `C:\webprojects\content-generation\` is a *reference*, not a base. Phase 1 ports zero code from v2 — auth, repo layout, middleware are all greenfield. (Later phases port specific files; see Canonical References.)

### Established Patterns
- **Firebase SDK conventions:** client uses modular Firebase v9+ (`firebase/auth`, `firebase/firestore`); server uses `firebase-admin`.
- **Express middleware order:** `app.use('/api', requireAuth)` and `app.use('/internal', requireOidc)` per PLAN-SOURCE.md §342-345.
- **OIDC middleware:** `google-auth-library` `OAuth2Client.verifyIdToken({ audience: SERVICE_URL })` — pattern locked in PLAN-SOURCE.md §324-340.

### Integration Points
- **Cloud Tasks → `/internal/render`:** Task payload includes OIDC token signed for `internal-invoker@`; `requireOidc` verifies. Phase 3 uses this; Phase 1 only stands up the queues + middleware.
- **Cloud Scheduler → `/internal/publish-worker`:** same OIDC pattern. Phase 3 implements the worker; Phase 1 creates the scheduler job pointing at the deployed URL (job will 404 until the worker route exists, which is fine).
- **Frontend → `/api/*`:** via Firebase Hosting rewrite, ID-token in Authorization header.
- **Budget alert → kill switch:** Pub/Sub topic `budget-alerts` triggers a Cloud Function that flips the Firestore doc.

</code_context>

<specifics>
## Specific Ideas

- **Onboarding modal copy:** German for the LEBEN.LIEBEN-target audience. Two labels: "Markenname" + "Anthropic API-Schlüssel". Help-text under the API key field: short instruction with a link to console.anthropic.com (open in new tab). One CTA button: "Loslegen". (Final copy can be tuned during execution; this is a starting point.)
- **No copy for Meta Graph token in Phase 1** — that's collected later when posting is wired up (Phase 3).

</specifics>

<deferred>
## Deferred Ideas

- **Meta Graph token onboarding:** Phase 3 (Render & Posts) when publishing comes online. Add a second tile to Settings/API Keys page then.
- **Public sign-up funnel + per-user spend caps:** v2 requirements (`MB-01`, `MB-02`) — out of scope for v1.
- **Optional `/learning` debug page:** Phase 4 (gated behind Tim's UID check, not a route in the sidebar).
- **Brand creation/deletion UI in BrandSwitcher:** Phase 2 (Brand Settings).
- **Live Anthropic key validation during onboarding:** rejected for v1 (D-17). Could be reconsidered if first-generate-fails becomes a recurring complaint after launch.
- **KMS envelope encryption layer:** explicitly rejected by Q3 in PLAN-SOURCE.md. Cloud KMS direct is sufficient.
- **Staging environment:** out of scope (PROJECT.md). Kill switch + budget cap covers risk.

</deferred>

---

*Phase: 01-foundation-infrastructure*
*Context gathered: 2026-04-26*
