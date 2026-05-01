# Plan 01-02 Summary

**Status:** Code-side complete. `pnpm install`, `pnpm typecheck`, `gcloud run deploy`, and `firebase deploy --only functions` deferred to Tim (see `.planning/human_tasks.md` H-1, H-4, H-5).

## Files created
**Repo / build:**
- `package.json` (root, single-package per D-02) - server + web + functions-internal deps merged
- `tsconfig.base.json`, `tsconfig.server.json`
- `Dockerfile` (multi-stage node:20-slim, port 8080)
- `.dockerignore`
- `.env.example`

**Server runtime:**
- `server/index.ts` - Express bootstrap; mount order `killSwitchGate -> requireAuth/requireOidc -> routes`
- `server/lib/firebase.ts` - Admin SDK init
- `server/lib/killSwitchCache.ts` - 30s TTL in-memory cache (D-29)
- `server/lib/kms.ts` - KMS encrypt/decrypt with `FIRESTORE_EMULATOR_HOST` bypass (D-11)
- `server/middleware/auth.ts` - `requireAuth` + `ALLOWED_EMAILS` (placeholder); 401/403/412 + onboarding gate exempting `/settings/api-keys` (D-19, D-27)
- `server/middleware/oidc.ts` - `requireOidc` audience + invoker SA verify
- `server/middleware/killSwitch.ts` - `killSwitchGate` 503 on `enabled === false`
- `server/routes/health.ts` - `GET /health` (mounted twice: `/api/health`, `/internal/health`)
- `server/routes/settings.ts` - `POST/GET /api/settings/api-keys`; never returns raw key (no `kmsDecrypt` import)

**Shared:**
- `shared/types/user.ts` - `UserDoc` interface
- `shared/schemas/apiKeys.ts` - Zod schemas

**Cloud Function (separate toolchain):**
- `server/functions/package.json` (firebase-functions ^6, node 20)
- `server/functions/tsconfig.json`
- `server/functions/budget-killswitch.ts` - Pub/Sub `budget-alerts` -> `system/killSwitch.enabled=false` when `costAmount >= budgetAmount` (D-30)
- `server/functions/index.ts` - re-export

**Firebase config:**
- `firebase.json` - functions + firestore + storage + hosting + emulators (final shape; merged 01-03 hosting/emulators in advance to keep file edits minimal)

## Deviations from PLAN
- **firebase.json written once with all blocks** including hosting + emulators (which 01-03 Task 3 was supposed to add via merge). Reason: minimalism rule + avoid two-pass JSON edit risk. End state matches `<firebase_json_target>` in 01-03 exactly.
- **Skipped server/index.ts stub from Task 1**, wrote final wired version directly. Same reason: stub is immediately overwritten in Task 2.
- **Web deps merged into root package.json now** (instead of waiting for 01-03 Task 1). Same reason: D-02 single package.json, one edit beats two.
- **No `pnpm install` invoked** (per execution boundaries). Tim runs in H-1.

## Outstanding placeholder
- `ALLOWED_EMAILS` in `server/middleware/auth.ts` still has `tim@example.com` and `jule@example.com`. **Must be replaced before Cloud Run deploy** (H-4).

## Cloud resources (pending H-5)
- Cloud Run service `content-gen` (concurrency=1, mem=2Gi, cpu=2, min-instances=1, --allow-unauthenticated, SA=content-gen-sa)
- `CLOUD_RUN_SERVICE_URL` env var on the service (post-deploy update)
- Cloud Function `budgetKillswitch` europe-west1, Pub/Sub trigger on `budget-alerts`
- Re-run of bootstrap.sh wires `publish-tick` scheduler + `roles/run.invoker` binding
