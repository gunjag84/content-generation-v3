# QA Audit — 2026-05-20 Cycle 1

**Branch:** master @ e83d317
**Auditor:** qa lens
**Prior audits:** none

## Verdict
WITH-CONCERNS

## Health Score
74 / 100

---

## P1 List

### 1. Stale-closure bug in `useKeyboardShortcuts` — handlers object regenerated every render, listener re-attaches on every render (confidence 9/10)
**File:** `web/src/hooks/useKeyboardShortcuts.ts:109` + `web/src/routes/Editor.tsx:184`

`useKeyboardShortcuts(shortcutHandlers(), true)` is called with a fresh `handlers` object on every render. The `useEffect` dependency array includes `handlers` (the object), so the `keydown` listener is torn down and re-attached on every render — including during active typing in the caption textarea and after every `commitEdit`. During the teardown window (microtask), a Cmd+Z keystroke silently drops.

Additionally, the hook uses `handlersRef` internally but the `onKeyDown` closure closes over `handlers` directly (not `handlersRef.current`). At line 43: `handlers.save()`, line 53: `handlers.undo()`, etc. — all direct calls to the prop, not the ref. The ref update at line 31 (`handlersRef.current = handlers`) is unused in the actual listener. This means every shortcut call uses the handlers snapshot from when the effect registered, not the latest render's handlers.

**Impact:** Undo via Cmd+Z may apply stale `slides`/`caption` refs. The `undoStackRef` pattern in Editor.tsx is correct, but the closure in the hook captures the old handlers object.

### 2. `SchedulePostModal` double-commit race on conflict-override (confidence 8/10)
**File:** `web/src/components/SchedulePostModal.tsx:111-119`

In `handleSubmit`, after `detectConflict` sets `conflictTs`, `setLoading(false)` runs in the `finally` block but `doSave()` is NOT awaited in the same try/catch. The user clicks "Trotzdem speichern" which calls `void doSave()`. However, `handleSubmit`'s `finally` already cleared `loading`, so the conflict confirm button has no disabled guard — rapid double-tap fires `doSave()` twice, creating two `schedulePost` calls for the same `postId`.

### 3. `deploy-functions.sh` has `manualIgsync` with wrong casing — not lowercase (confidence 9/10)
**File:** `scripts/deploy-functions.sh:21`

`SERVICES` array contains `"manualIgsync"` — mixed case. Cloud Run service names are all lowercase. Per the MEMORY.md operational note: "`igFeedSync` (function) → `igfeedsync` (Cloud Run service)". The correct name is `manualIgsync` → `manualigsync`. The script will `gcloud run services add-iam-policy-binding manualIgsync` which will fail silently (or error) leaving the SA NOT pinned on that service, which means KMS decrypt breaks for that function on next deploy.

### 4. `Calendar.tsx` `isEmpty` is based on ALL-TIME posts, not the visible month (confidence 8/10)
**File:** `web/src/routes/Calendar.tsx:105`

`const isEmpty = posts.length === 0` checks the full unfiltered `posts` array. A brand with posts in February but navigating to May will show the month grid (correct), but if the brand has zero posts ever, the empty state is shown. However the intent issue is the inverse: if all historical posts exist but `visiblePosts` for the current month is empty, the month grid renders with zero dots — which is correct UX — but `isEmpty` never shows the "no posts ever" empty state correctly because it depends on `posts` not `visiblePosts`. Minor logic mismatch, low breakage risk but confusing when navigating to a future empty month that still renders the grid wrapper.

### 5. `InlineTextEditor` ESC commits rather than cancels — data loss on accidental ESC (confidence 7/10)
**File:** `web/src/components/editor/InlineTextEditor.tsx:34-37`

ESC calls `commit()` (writes the current textarea value back). Standard UX expectation for ESC is "cancel edit, restore original text". If the user has partially typed bad text and hits ESC expecting to revert, the partial edit is persisted. The onBlur also calls `commit()`, so the escape path and the click-outside path both write. There is no "cancel" path at all — original text is never stored.

---

## Top 3 Recommendations

1. **(Recommended) Fix the stale-closure in `useKeyboardShortcuts`:** Change the `onKeyDown` closure to call `handlersRef.current.save()`, `handlersRef.current.undo()` etc. (already stored in the ref at line 31) — then remove `handlers` from the effect dependency array so the listener is attached once. This is a one-file, 10-line fix that eliminates the re-attach churn and the stale-capture bug simultaneously.

2. **Fix deploy-functions.sh service name `manualIgsync` → `manualigsync`:** One character change, prevents silent SA-pin failure on that Cloud Run service after every functions deploy. Verify with `gcloud run services list --region=europe-west1` before next deploy.

3. **Store original text in `InlineTextEditor` and restore on ESC:** Add `const originalText = useRef(zone.text)` at mount; on ESC call `onCommit(originalText.current)` instead of `commit()`. Restores standard editor UX without architectural changes.
