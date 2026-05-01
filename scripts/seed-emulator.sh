#!/usr/bin/env bash
# seed-emulator.sh -- Seed the local Firestore emulator with system/killSwitch = { enabled: true }.
# Run AFTER `firebase emulators:start` has booted and is listening on 127.0.0.1:8081.
set -euo pipefail
PROJECT_ID="${GCLOUD_PROJECT:-contentai-78bfb}"
EMU_HOST="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8081}"

# Emulator REST endpoint (no auth required)
URL="http://${EMU_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/system/killSwitch"

curl -fsS -X PATCH "${URL}" \
  -H "Content-Type: application/json" \
  --data '{"fields": {"enabled": {"booleanValue": true}}}' \
  | grep -q '"enabled"'

echo "emulator system/killSwitch seeded with enabled=true"
