# Plan 01-01 Summary

**Status:** Code-side complete. Cloud-resource provisioning deferred to Tim (see `.planning/human_tasks.md` H-2, H-3).

## Files created
- `scripts/bootstrap.sh` - idempotent gcloud + firebase provisioning, all 8 sections per PLAN
- `scripts/seed-killswitch.sh` - Firestore REST PATCH upsert of `system/killSwitch.enabled=true`
- `.firebaserc` - default project alias `content-gen-prod`
- `.gitignore` - node_modules, dist, .env*, .firebase, logs, .DS_Store

## Verification (local)
- `bash -n scripts/bootstrap.sh` -> OK
- `bash -n scripts/seed-killswitch.sh` -> OK
- `.firebaserc` parses; `projects.default == "content-gen-prod"`

## Cloud resources (pending H-2 / H-3)
- GCP project `content-gen-prod` + Blaze
- Service accounts `content-gen-sa`, `internal-invoker` with all IAM bindings
  (incl. service-agents -> token-creator + run.invoker for /internal/* OIDC dispatch)
- Cloud Tasks queues `render-queue`, `publish-queue` in europe-west1
- KMS keyring `user-secrets`, key `api-keys` (90d rotation) in europe-west1
- Pub/Sub topic `budget-alerts`
- Billing budget `content-gen-prod-budget` $40 with 50% (email) and 100% (pubsub)
- Firestore doc `system/killSwitch { enabled: true }`

## Deferred / partial
- Cloud Scheduler `publish-tick` job: created on bootstrap re-run after Plan 01-02
  deploys content-gen and `CLOUD_RUN_SERVICE_URL` is set (script handles this).
- `gcloud run services add-iam-policy-binding content-gen ... roles/run.invoker`
  for internal-invoker: same re-run path.

## Deviations from PLAN
None.
