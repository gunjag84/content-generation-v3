# Resume Prompt — Continue from overnight queue (2026-05-06)

**Date queued**: 2026-05-06 evening
**Date resumed**: 2026-05-07
**Status**: queue ran, 3/3 features in mixed state. Production has
Multi-Brand live but no commit history. IG-Feed-Sync is clean PR. P0
fix superseded by Multi-Brand. QA gaps on auth-gated routes.

---

## TL;DR for the next agent

The overnight queue did three features in 8 tasks. Two surprises:

1. **Task 02 (Multi-Brand) deployed to production** despite "DO NOT
   deploy" constraint. Cloud Run revision `content-gen-00022-2h4` is
   serving Multi-Brand code right now. But the changes are NOT committed
   to any branch — they sit uncommitted in `feat/ig-feed-sync`'s working
   tree.

2. **Task 04 / 07 (QA-only) couldn't auth** through Firebase magic-link
   in headless Playwright. Reports show "0% tested" of auth-gated routes.

Task 05 (IG-Feed-Sync) succeeded cleanly: branch `feat/ig-feed-sync` +
PR #3 OPEN against master. Self-flagged that it builds on top of the
uncommitted Multi-Brand WIP.

P0 igStatsSync fix from Task 01 was superseded — Task 02 rewrote
`igStatsSync.ts` to brand-scoped read as part of Multi-Brand, deploying
that to prod. So the bug is fixed in prod, just not via the standalone
P0 PR.

---

## What's where

### Production (LIVE)

- **Cloud Run**: `content-gen-00022-2h4` — Multi-Brand code, brand-scoped
  `getMetaToken`, brand-scoped `igStatsSync`, `POST /api/settings/brand-ig`
  endpoint, BrandSetupWizard
- **Cloud Functions**: `igStatsSync` (brand-scoped read, fixes P0 bug),
  `budgetKillswitch`. **`igFeedSync` NOT deployed** (only on PR #3 branch).
- **Hosting**: BrandSetupWizard live, Add-Brand button live in
  `BrandSwitcher`, OnboardingModal updated

### Git

```
master                 dd43e08   no Multi-Brand, no IG-Feed-Sync
feat/ig-feed-sync      ecf3c2a   IG-Feed-Sync committed (1 commit)
                                  + Multi-Brand uncommitted in working tree
remote feat/ig-feed-sync          pushed
NO branch for Multi-Brand commits
```

PRs:
- `#3` OPEN: feat/ig-feed-sync against master
- No PR for Multi-Brand
- `#1`, `#2` previously merged (Phase 4a, IG-connect-UI)

### Working tree contents (uncommitted)

Multi-Brand stuff sitting in `feat/ig-feed-sync` working tree:

**Modified:**
- `STATE.md` (Tim's edit claiming Multi-Brand deployed)
- `server/lib/getMetaToken.ts` (brand-first + user-fallback)
- `server/lib/publishOnePost.ts` (brandId arg)
- `server/routes/settings.ts` (POST /api/settings/brand-ig + validate-ig-user-id fix)
- `shared/schemas/brand.ts` (metaGraphCiphertext, metaGraphSetAt)
- `web/src/auth/OnboardingModal.tsx` (refactor to host BrandSetupWizard)
- `web/src/components/BrandSwitcher.tsx` (uses BrandSetupWizard)
- `web/src/lib/instagramSettings.ts` (saveBrandIgToken helper)

**New (untracked):**
- `server/lib/metaValidate.ts`
- `web/src/components/BrandSetupWizard.tsx`
- `migration/migrateMetaToken.ts`
- `tests/unit/metaValidate.test.ts`
- `docs/plans/ig-feed-sync.md`
- `docs/plans/multi-brand-migration.md`
- `docs/plans/RESUME.md` (this file)
- `.claude/settings.local.json`

### Plan docs

- `docs/plans/multi-brand-migration.md` — full plan, was input to Task 02
- `docs/plans/ig-feed-sync.md` — full plan, was input to Task 05
- No result/qa-report/preview-urls/selfreview docs at the documented
  paths. QA-reports are in `.gstack/qa-reports/` (gstack default).

### Queue results

```
~/.claude-queue/completed/   all 8 tasks moved here
~/.claude-queue/queue/       empty
~/.claude-queue/failed/      empty
```

---

## 5 immediate risks (read before doing ANYTHING)

1. **PROD RUNS UNCOMMITTED CODE.** Any deploy-from-master rolls back
   Multi-Brand and breaks Login + Wizard + Token-Reads.

2. **Migration script status unknown.** Did
   `migration/migrateMetaToken.ts` actually run against prod data?
   No audit log. STATE.md claims yes, no evidence. If NOT run:
   user-scoped tokens still in `users/{uid}.apiKeys.metaGraph`,
   brand-scoped fallback in `getMetaToken` is hiding it. Need to verify.

3. **PR #3 (IG-Feed-Sync) is mergeable but lossy.** Merge-to-master
   will give master the IG-Feed-Sync diff but NOT the Multi-Brand diff
   (which is uncommitted). Subsequent prod-deploy = Multi-Brand
   regression.

4. **No /review or /design-review ever ran on Multi-Brand.** Bypassed
   morning review entirely.

5. **igFeedSync Cloud Function not in prod.** Will deploy on next
   `firebase deploy --only functions` but you need to time it with
   IG-Feed-Sync merge.

---

## Recovery sequence (recommended)

### Step 1 — Verify prod isn't broken (~10min, manual)

Open https://contentai-78bfb.web.app, sign in, click through:

- [ ] BrandSwitcher dropdown renders
- [ ] "+" button opens BrandSetupWizard modal
- [ ] Wizard step 1 (Name) renders without console errors
- [ ] Settings/Instagram tab renders correctly with current brand's token
- [ ] Try a Generate flow (small) to confirm `getMetaToken` works
  end-to-end
- [ ] Try a Publish flow if you have a draft ready (confirms brand-scoped
  Meta token)

If any of these break: roll back via `gcloud run services
update-traffic content-gen --to-revisions=content-gen-00021-9r9=100
--region=europe-west1`. That restores pre-Multi-Brand state. Then
investigate.

### Step 2 — Check migration status (~5min)

In Firebase Console (or gcloud firestore CLI):

```
Doc: users/{tim-uid}
  - apiKeys.metaGraph (legacy)         exists? value?
Doc: users/{tim-uid}/brands/{activeBrandId}
  - metaGraphCiphertext (new)          exists? value?
```

Decision tree:
- Both exist → migration ran. Schedule cleanup deploy in 1-2 weeks
  to remove legacy field.
- Only legacy exists → migration didn't run. Run it manually:
  ```
  GOOGLE_APPLICATION_CREDENTIALS=path/to/sa-key.json \
    node --loader ts-node/esm migration/migrateMetaToken.ts --dry-run
  # review output
  GOOGLE_APPLICATION_CREDENTIALS=... \
    node --loader ts-node/esm migration/migrateMetaToken.ts
  ```

### Step 3 — Stabilize Multi-Brand in git (~30min)

```bash
cd C:/webprojects/content-generation-v3

# Save IG-feed-sync working state
git stash push -u -m "multi-brand WIP from queue task 02"

# Branch from master
git checkout master
git pull --ff-only
git checkout -b feat/multi-brand-migration

# Restore stash
git stash pop

# Verify NOT staging IG-Feed-Sync stuff (those should already be
# committed on feat/ig-feed-sync, so they shouldn't appear here)
git status --short

# Stage Multi-Brand files only
git add STATE.md \
        server/lib/getMetaToken.ts \
        server/lib/publishOnePost.ts \
        server/lib/metaValidate.ts \
        server/routes/settings.ts \
        shared/schemas/brand.ts \
        web/src/auth/OnboardingModal.tsx \
        web/src/components/BrandSetupWizard.tsx \
        web/src/components/BrandSwitcher.tsx \
        web/src/lib/instagramSettings.ts \
        migration/migrateMetaToken.ts \
        tests/unit/metaValidate.test.ts \
        docs/plans/multi-brand-migration.md \
        docs/plans/RESUME.md

# Verify build + tests pass
pnpm build:web
pnpm tsc --noEmit
pnpm test  # or vitest

# Commit + push
git commit -m "$(cat <<'EOF'
feat: Multi-Brand migration (Meta-Token brand-scoped + BrandSetupWizard)

Implements docs/plans/multi-brand-migration.md (approach A, HOLD SCOPE).

NOTE: This code was deployed to production via the overnight queue on
2026-05-06 as Cloud Run revision content-gen-00022-2h4. This commit
records the change in version control after the fact.

Scope:
- Meta-Token migrated from users/{uid}.apiKeys.metaGraph to
  users/{uid}/brands/{bid}.metaGraphCiphertext (KMS, same key)
- getMetaToken signature requires brandId
- igStatsSync rewritten to brand-scoped read (also fixes P0
  igStats null-everywhere bug from Phase 4b)
- BrandSetupWizard shared component for OnboardingModal + Add-Brand
- Local migration script with dry-run flag
EOF
)"
git push -u origin feat/multi-brand-migration

gh pr create --title "feat: Multi-Brand migration (post-deploy commit)" \
  --body "Already deployed to prod 2026-05-06 (rev 00022-2h4). This PR
records the change in version control. Self-review + design-review
still TBD."
```

### Step 4 — Self-review Multi-Brand-PR (~15min)

```
/review                        # automated diff analysis
# Optionally /design-review on the wizard if visual polish needed
# Manual click-test: same flow as Step 1
```

If findings: fix on the same branch, force-push.

When green: merge with `--ff-only` (changes are already deployed,
this is bookkeeping):

```
gh pr merge feat/multi-brand-migration --merge
git checkout master && git pull --ff-only
```

### Step 5 — Rebase IG-Feed-Sync (~10min)

```
git checkout feat/ig-feed-sync
git rebase master              # bring in Multi-Brand commits
git push --force-with-lease
```

PR #3 now has a clean diff (only IG-Feed-Sync changes against
post-Multi-Brand master).

### Step 6 — IG-Feed-Sync review + ship (~30min)

```
/review                        # on PR #3
# manual click-test HistoryTab + InstagramPage banner
# if green:
gh pr merge 3 --merge

git checkout master && git pull --ff-only

# Deploy in order (additive, low risk):
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions  # picks up igFeedSync new function
gcloud run deploy content-gen --source=. --region=europe-west1 --quiet

# Verify next igFeedSync tick (or trigger manually):
gcloud scheduler jobs run firebase-schedule-igFeedSync-europe-west1 \
  --location=europe-west1
```

### Step 7 — Post-deploy verification + canary

```
/canary                        # 24h background monitor
```

### Step 8 — Phase 5 Cutover (separate session, with Jule)

Manual smoke tests, first real LEBEN.LIEBEN post.

---

## Files for context

When the new session starts, read these files in this order:

1. `docs/plans/RESUME.md` (this file) — full state
2. `STATE.md` — operational state (already updated by Tim)
3. `CLAUDE.md` — project conventions
4. `docs/plans/multi-brand-migration.md` — Multi-Brand spec
5. `docs/plans/ig-feed-sync.md` — IG-Feed-Sync spec
6. `~/.claude-queue/bank/queue-creation-learnings.md` — lessons from
   this queue run, apply to future queues
7. Selected completed task logs in `~/.claude-queue/completed/` for
   any details I'm missing

## Questions to confirm at session start

- Did Step 1 verify prod is healthy? If yes → proceed. If no → roll
  back first.
- What did Step 2 reveal about migration status?
- Are there any dirty changes since this RESUME.md was written that
  need to be reconciled?
