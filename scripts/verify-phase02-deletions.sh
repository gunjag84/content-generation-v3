#!/usr/bin/env bash
# verify-phase02-deletions.sh
# Greps for forbidden tokens that must NOT exist in v3 source.
# Excludes node_modules/, dist/, .planning/ (planning docs may legitimately mention removed tokens),
# PLAN-SOURCE.md (history), and the script itself.
set -uo pipefail

# Paths to scan (whitelist - keeps planning docs out of the search).
SCAN_PATHS=(
  "web/"
  "server/"
  "shared/"
  "scripts/"
  "firestore.rules"
  "storage.rules"
)

# Forbidden tokens. Each entry is a single ripgrep -E pattern.
FORBIDDEN=(
  'hooks_guidance'
  'styleTypes'
  'layoutTemplates'
  'ContentStrategySchema'
  'PillarSchema'
  'ScenarioSchema'
  'ThemeSchema'
  'p3-loyalty-nurture'
  'loyalty-nurture'
  'topics/.*\.md'
  'MAPPING\.md'
  '/api/social-club/'
  'social-club/pillars'
)

EXCLUDES=(
  '--glob=!node_modules'
  '--glob=!dist'
  '--glob=!.planning'
  '--glob=!PLAN-SOURCE.md'
  '--glob=!verify-phase02-deletions.sh'
  '--glob=!firebase-debug.log'
  '--glob=!firestore-debug.log'
  '--glob=!*-debug.log'
)

fail=0
for token in "${FORBIDDEN[@]}"; do
  hits=$(rg -n --no-heading -E "$token" "${EXCLUDES[@]}" "${SCAN_PATHS[@]}" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "FORBIDDEN: $token"
    echo "$hits"
    echo "---"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "FAIL: forbidden tokens present"
  exit 1
fi

echo "OK: no forbidden tokens"
exit 0
