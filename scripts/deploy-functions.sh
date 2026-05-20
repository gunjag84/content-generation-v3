#!/usr/bin/env bash
set -euo pipefail

# Deploy Firebase Cloud Functions then pin the runtime SA on each underlying
# Cloud Run service. firebase deploy resets the runtime SA to the default
# compute SA on every deploy, which strips KMS decrypt access.
#
# Cloud Run service names are lowercase versions of the function names.
# SA: content-gen-sa@contentai-78bfb.iam.gserviceaccount.com
#
# Re-runs are safe: gcloud add-iam-policy-binding is idempotent.

REGION="europe-west1"
SA="content-gen-sa@contentai-78bfb.iam.gserviceaccount.com"

# Lowercase Cloud Run service names for each deployed function
SERVICES=(
  "budgetkillswitch"
  "igstatssync"
  "igfeedsync"
  "manualIgsync"
)

echo "==> Deploying Firebase Cloud Functions..."
firebase deploy --only functions

echo ""
echo "==> Pinning runtime SA on Cloud Run services..."
for svc in "${SERVICES[@]}"; do
  echo "    Binding ${svc}..."
  gcloud run services add-iam-policy-binding "${svc}" \
    --region="${REGION}" \
    --member="serviceAccount:${SA}" \
    --role="roles/run.invoker" \
    --quiet
done

echo ""
echo "==> Done. SA pinned on all 4 services:"
for svc in "${SERVICES[@]}"; do
  echo "    - ${svc}"
done
