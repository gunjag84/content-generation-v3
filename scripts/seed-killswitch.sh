#!/usr/bin/env bash
# seed-killswitch.sh -- Seed system/killSwitch = { enabled: true } in production Firestore.
#
# Idempotent: re-running re-writes the same value (intended dev/post-trip recovery behavior).
#
# Prereqs:
#   - gcloud auth application-default login
#   - gcloud config set project contentai-78bfb
#
# This bypasses client-side firestore.rules legitimately because it uses the
# project owner's access token via the Firestore Admin REST API.

set -euo pipefail
PROJECT_ID="${PROJECT_ID:-contentai-78bfb}"

ACCESS_TOKEN="$(gcloud auth print-access-token)"
PARENT="projects/${PROJECT_ID}/databases/(default)/documents"
DOC_PATH="system/killSwitch"

# PATCH = upsert. Writes only the `enabled` field; sibling fields are preserved.
curl -fsS -X PATCH \
  "https://firestore.googleapis.com/v1/${PARENT}/${DOC_PATH}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"fields": {"enabled": {"booleanValue": true}}}' \
  | grep -q '"enabled"'

echo "system/killSwitch seeded with enabled=true in project ${PROJECT_ID}"
