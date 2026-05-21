# Pre-Landing Review — 2026-05-20 Cycle 2

**Branch:** master @ e9be8d4
**Auditor:** review-style lens (structural, not bug-hunting)
**Prior audits:** R1 (3 lenses — QA, simplify, process-manager)

---

## Verdict

**CONCERNS** — no blocking issues, but 2 structural items need a decision before landing.

---

## Findings

### F1 — SchedulePostModal: `setLoading(false)` in `finally` before `doSave()` sets it again (cosmetic race, not data-loss)
`web/src/components/SchedulePostModal.tsx:116-118`
`handleSubmit` sets `loading=true` (line 104), runs `detectConflict`, then `finally { setLoading(false) }`, then immediately calls `await doSave()` which sets `loading=true` again. On fast networks there is a visible spinner flicker (off→on within a single event loop tick). The data path is correct — no double-commit. **Confidence 8/10.**

### F2 — Calendar `isEmpty` checks against *all loaded posts*, not the visible month
`web/src/routes/Calendar.tsx:113`
`isEmpty = posts.length === 0` triggers the "Noch keine Posts" empty state when the brand has *any* post at all. If a user created posts in prior months but none in the current view, they see the grid (correct). If they have zero posts ever, they see the empty state (correct). No bug — but the comment intent ("Noch keine Posts geplant") mismatches: a user with posts all in prior months will never see the empty-state CTA even if the *visible month* is empty. Minor UX, **not a data issue. Confidence 7/10.**

### F3 — `publishing_failed` / `failed` status has no dot color in MonthGrid
`web/src/components/calendar/MonthGrid.tsx:49`
`DOT_CLASSES` maps `draft`, `scheduled`, `published`. `publishOnePost.ts` sets `status: 'published'` on success but no explicit failure status string was found in the diff. If any post ever reaches a `failed` or `publishing_failed` state (e.g. from a prior code path or future extension), `dotClass()` falls through to `bg-zinc-400` (same as draft). Not a crash, but a silent mis-coloring. **Confidence 6/10** — depends on whether a failed status string is actually written anywhere currently.

### F4 — `InlineTextEditor` ESC commits instead of cancelling
`web/src/components/editor/InlineTextEditor.tsx:36-39`
ESC calls `commit()` which fires `onCommit(ref.current.value)`. This is the same path as blur/Fertig — ESC does NOT cancel, it saves. R1 flagged this as an open P1. Confirming: the issue is still present in this diff. The expected UX for ESC is discard-and-close. **Confidence 10/10.**

### F5 — `PhotoEditModal` ESC also exits-without-commit (correct), but the `onClose` prop fires unconditionally
`web/src/components/editor/SlidePanel.tsx:52-55`
ESC in `PhotoEditModal` calls `onClose()` which is `() => setPhotoEditOpen(false)` — correct, discards local state. No issue.

### F6 — LLM trust boundary: `resetToAi` writes `aiSnapshotAtLoad.current.slides` directly into `commitEdit`
`web/src/routes/Editor.tsx:373-379`
The snapshot is loaded at mount from Firestore (`data.aiSnapshot`) and held in `aiSnapshotAtLoad.current`. `resetToAi` calls `commitEdit(snap.slides, snap.caption)` which routes through `setSlides`/`setCaption` and then auto-saves via debounce. This writes LLM-originated data back to the `slides` field — which is the intended, user-visible working copy. The invariance guard on line 241-245 (DEV-only assert) confirms `aiSnapshot` itself is never written. **No violation — architecture is correct.** Confidence 9/10.

### F7 — `changeZoneAt` (called from SlideStrip auto-grow) now pushes to undo stack on every auto-grow correction
`web/src/routes/Editor.tsx:139-141`
`changeZoneAt` now calls `commitEdit(...)` which pushes the *current* state to the undo stack before applying. Auto-grow fires this on scroll/render passes (not just user interaction), meaning automatic height corrections generate undo entries. A user hitting Ctrl+Z repeatedly will cycle through auto-grow snapshots. Intentional per the `/plan-eng-review` note? The comment in Editor.tsx says "Used by SlideStrip thumbnails so the auto-grow pass can persist y/h corrections" — this is a programmatic call, not user intent. **Confidence 8/10 — worth a decision.**

### F8 — No `console.log` bloat; one intentional `console.error` in `publishOnePost.ts` (signed URL resign path — acceptable production telemetry)
`server/lib/publishOnePost.ts` — single `console.error` on resign failure, proceeds. Correct pattern.

### F9 — No `any` types introduced in the diff (Calendar uses `Record<string, unknown>` correctly)
Clean.

---

## Top 3 Recommendations

1. **(Recommended) Fix F4 — InlineTextEditor ESC must discard, not commit.** Store `zone.text` as a const at mount and call `onCommit(originalText)` (no-op functionally) or expose a separate `onCancel` prop that skips `onCommit`. This is the open R1 P1; one-line fix.

2. **Decide on F7 — gate `commitEdit` in `changeZoneAt` behind a flag or split into `commitEdit` vs `applyEdit` (no undo push).** Auto-grow corrections should use a silent setter that bypasses the undo stack. Pattern: add `setSlides`/`setCaption` direct calls for programmatic mutations, keep `commitEdit` for user gestures only. Prevents undo-stack pollution from layout passes.

3. **Add `failed` / `publishing_failed` to `DOT_CLASSES` in MonthGrid (F3)** — even if no path currently writes it, the fallback is silent mis-coloring. A one-liner: `'failed': 'bg-red-500', 'publishing_failed': 'bg-red-500'` as defensive coverage.
