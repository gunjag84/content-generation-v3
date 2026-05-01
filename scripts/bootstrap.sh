#!/usr/bin/env bash
# bootstrap.sh -- Idempotent provisioning of the Content-Generation v3 GCP/Firebase substrate.
#
# Prerequisites (Tim runs these once):
#   - gcloud auth login
#   - firebase login
#   - export PROJECT_ID=contentai-78bfb
#   - export REGION=europe-west1
#   - export BILLING_ACCOUNT_ID=<find via: gcloud beta billing accounts list>
#   - export BUDGET_EMAIL=<Tim's email; receives the $20 alert>
#   - (optional, set after first Cloud Run deploy in Plan 01-02)
#       export CLOUD_RUN_SERVICE_URL=https://content-gen-XXXXX-ew.a.run.app
#
# Usage:
#   bash scripts/bootstrap.sh
#
# Idempotency: every resource-create call tolerates "already exists" via
# `|| true` or `2>/dev/null || echo ...`. Re-runs are safe.

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID must be set}"
: "${REGION:?REGION must be set}"
: "${BILLING_ACCOUNT_ID:?BILLING_ACCOUNT_ID must be set}"
: "${BUDGET_EMAIL:?BUDGET_EMAIL must be set (e.g. tim@...). Email path for the \$20 alert.}"

PROJECT_ID="${PROJECT_ID:-contentai-78bfb}"
REGION="${REGION:-europe-west1}"

echo "==> Bootstrapping project '${PROJECT_ID}' in region '${REGION}'"

# ---------------------------------------------------------------------------
# 1. Project + Blaze + APIs (INFRA-01)
# ---------------------------------------------------------------------------
echo "==> [1/8] Project + Blaze + APIs"
gcloud projects create "$PROJECT_ID" --set-as-default 2>/dev/null \
  || gcloud config set project "$PROJECT_ID"

gcloud beta billing projects link "$PROJECT_ID" \
  --billing-account="$BILLING_ACCOUNT_ID" || true

gcloud services enable \
  run.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudkms.googleapis.com \
  pubsub.googleapis.com \
  firestore.googleapis.com \
  firebaserules.googleapis.com \
  firebasestorage.googleapis.com \
  firebasehosting.googleapis.com \
  identitytoolkit.googleapis.com \
  cloudbuild.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com

gcloud firestore databases create --location="$REGION" 2>/dev/null || true
gsutil mb -l "$REGION" "gs://${PROJECT_ID}.appspot.com" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 2. Service accounts (INFRA-03)
# ---------------------------------------------------------------------------
echo "==> [2/8] Service accounts"
gcloud iam service-accounts create content-gen-sa \
  --display-name="Cloud Run runtime SA" 2>/dev/null || true
gcloud iam service-accounts create internal-invoker \
  --display-name="Cloud Tasks + Scheduler invoker" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 3. IAM bindings -- content-gen-sa (INFRA-03)
# ---------------------------------------------------------------------------
echo "==> [3/8] IAM bindings: content-gen-sa"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:content-gen-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/datastore.user

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:content-gen-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/storage.objectAdmin

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:content-gen-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/cloudtasks.enqueuer

gcloud iam service-accounts add-iam-policy-binding \
  "internal-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:content-gen-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser

# ---------------------------------------------------------------------------
# 3b. IAM bindings -- Tasks/Scheduler service agents -> internal-invoker
#     token-creator + Run invoker on content-gen (INFRA-03, INFRA-05)
# ---------------------------------------------------------------------------
echo "==> [3b/8] IAM bindings: Tasks/Scheduler -> internal-invoker -> content-gen"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")

# Cloud Tasks service agent: token creator on internal-invoker
gcloud iam service-accounts add-iam-policy-binding \
  "internal-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator

# Cloud Scheduler service agent: token creator on internal-invoker
gcloud iam service-accounts add-iam-policy-binding \
  "internal-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator

# Cloud Run: allow internal-invoker to invoke content-gen.
# NOTE: succeeds only after Plan 01-02 deploys the service. First-run failure
# is tolerated; re-run after 01-02 makes this binding effective.
gcloud run services add-iam-policy-binding content-gen \
  --region="$REGION" \
  --member="serviceAccount:internal-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker 2>/dev/null \
  || echo "    content-gen Run service not yet deployed -- re-run bootstrap.sh after 01-02 to bind run.invoker"

# ---------------------------------------------------------------------------
# 4. KMS keyring + key + binding (INFRA-07)
# ---------------------------------------------------------------------------
echo "==> [4/8] KMS keyring + key + binding"
gcloud kms keyrings create user-secrets --location="$REGION" 2>/dev/null || true

gcloud kms keys create api-keys \
  --keyring=user-secrets \
  --location="$REGION" \
  --purpose=encryption \
  --rotation-period=90d \
  --next-rotation-time="$(date -u -d '+90 days' +%Y-%m-%dT%H:%M:%SZ)" \
  2>/dev/null || true

gcloud kms keys add-iam-policy-binding api-keys \
  --keyring=user-secrets \
  --location="$REGION" \
  --member="serviceAccount:content-gen-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter

# ---------------------------------------------------------------------------
# 5. Cloud Tasks queues (INFRA-04)
# ---------------------------------------------------------------------------
echo "==> [5/8] Cloud Tasks queues"
gcloud tasks queues create render-queue --location="$REGION" 2>/dev/null || true
gcloud tasks queues create publish-queue --location="$REGION" 2>/dev/null || true

# ---------------------------------------------------------------------------
# 6. Cloud Scheduler job publish-tick (INFRA-05)
# Requires CLOUD_RUN_SERVICE_URL -- only known after Plan 01-02 deploys.
# ---------------------------------------------------------------------------
echo "==> [6/8] Cloud Scheduler publish-tick"
if [[ -z "${CLOUD_RUN_SERVICE_URL:-}" ]]; then
  echo "    CLOUD_RUN_SERVICE_URL not set -- skipping publish-tick."
  echo "    After Plan 01-02 deploys content-gen, re-run with:"
  echo "      export CLOUD_RUN_SERVICE_URL=<URL from gcloud run services describe>"
  echo "      bash scripts/bootstrap.sh"
else
  gcloud scheduler jobs create http publish-tick \
    --location="$REGION" \
    --schedule="*/5 * * * *" \
    --uri="${CLOUD_RUN_SERVICE_URL}/internal/publish-worker" \
    --oidc-service-account-email="internal-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
    --oidc-token-audience="${CLOUD_RUN_SERVICE_URL}" \
    --http-method=POST 2>/dev/null \
  || gcloud scheduler jobs update http publish-tick \
    --location="$REGION" \
    --schedule="*/5 * * * *" \
    --uri="${CLOUD_RUN_SERVICE_URL}/internal/publish-worker" \
    --oidc-service-account-email="internal-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
    --oidc-token-audience="${CLOUD_RUN_SERVICE_URL}"
fi

# ---------------------------------------------------------------------------
# 7. Pub/Sub topic + Budget alerts (INFRA-06)
# ---------------------------------------------------------------------------
echo "==> [7/8] Pub/Sub topic + Budget alerts"
gcloud pubsub topics create budget-alerts 2>/dev/null || true

gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT_ID" \
  --display-name="contentai-78bfb-budget" \
  --budget-amount=40USD \
  --threshold-rule=percent=0.5,basis=current-spend \
  --threshold-rule=percent=1.0,basis=current-spend \
  --notifications-rule-pubsub-topic="projects/${PROJECT_ID}/topics/budget-alerts" \
  --notifications-rule-email-addresses="$BUDGET_EMAIL" \
  --filter-projects="projects/${PROJECT_ID}" 2>/dev/null \
  || echo "    budget exists, update via console if amount changed"

# ---------------------------------------------------------------------------
# 8. Done
# ---------------------------------------------------------------------------
echo "==> [8/8] bootstrap.sh complete"
echo ""
echo "Next steps:"
echo "  1. Run scripts/seed-killswitch.sh to seed system/killSwitch=true"
echo "     (after Plan 01-03 deploys firestore.rules so the doc has a place to live)."
echo "  2. After Plan 01-02 deploys content-gen Cloud Run, re-run bootstrap.sh"
echo "     with CLOUD_RUN_SERVICE_URL set to wire the publish-tick scheduler job"
echo "     and complete the run.invoker binding."
