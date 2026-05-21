# QA Audit — 2026-05-20 Cycle 3 (final)

**Branch:** master @ 389350a
**Auditor:** qa lens
**Prior audits:** R1 (74/100), R2 (fixes: drag-bracket, ESC cancel, photo-tier doc)

## Verdict
WITH-CONCERNS

## Health Score
81 / 100

---

## P1 List

### 1. `handleMutationStart` closes over `slidesRef2` before it is declared — temporal dead zone (confidence 9/10)
**File:** `web/src/routes/Editor.tsx:124-126` vs `140-141`

`handleMutationStart` is a `useCallback` created at line 124 whose body reads `slidesRef2.current`. `slidesRef2` is declared via `useRef` at line 140, AFTER the callback. In React's function-component execution, every `useRef` / `useCallback` call runs top-to-bottom on each render. On the very first render `slidesRef2` is `undefined` when `handleMutationStart`'s closure body is formed — the reference resolves at call-time (not definition-time for arrow functions in JS closures), so this is actually safe at runtime because `slidesRef2.current` is only read WHEN the callback fires (which is always after the first render). HOWEVER: `captionRef` has the same declaration-after-use pattern and is also fine for the same reason. The real risk: if a linter rule or TypeScript strict-mode ever enforces declaration order here, this will break. Low blast radius but misleading code order. Mark as P2 / code-smell.

**Revised confidence after analysis: 5/10 — runtime-safe, code-smell only. Downgrade to P2.**

### 1 (true P1). `SchedulePostModal` double-commit on conflict-override — STILL UNFIXED (confidence 8/10)
**File:** `web/src/components/SchedulePostModal.tsx:188-190`

Line 189: `onClick={() => { setConflictTs(null); void doSave(); }}`. The "Trotzdem speichern" button has `disabled={loading}`, which guards single rapid clicks. However `doSave` sets `loading=true` as its first action, and `setConflictTs(null)` is called synchronously BEFORE `doSave` begins — so the conflict dialog unmounts before `loading` flips. Between the `setConflictTs(null)` state flush and the re-render with `loading=true`, a second tap on the same button can fire (the button is briefly re-enabled in the gap). The `disabled` guard is on the wrong element — it guards the button that was just unmounted. Fix: use a separate `savingRef = useRef(false)` that is set synchronously before any state updates, and guard `doSave` on entry.

### 2. `Calendar.tsx` `isEmpty` based on all-time posts — STILL UNFIXED (confidence 8/10)
**File:** `web/src/routes/Calendar.tsx:105`

`const isEmpty = posts.length === 0` gates showing the "Noch keine Posts geplant" empty state. The intent is to show it only when there are zero posts ever (never scheduled anything), but a user who has scheduled posts in January, navigates to July, will see the month grid (correct) with no dots (correct) but `isEmpty` stays false — the empty-month message is never shown for empty future months. Conversely if Firestore returns 0 posts on a slow load, the empty state flashes. Actual bug: the gate uses `posts` (all-time Firestore load) not `visiblePosts` — the semantics are inconsistent. If the intent is "no posts ever" the name and behavior are fine; if intent is "nothing to show this month" the variable is wrong. The empty state text ("Noch keine Posts geplant. Erstelle deinen ersten Post.") reads as all-time, not month-specific — so the current implementation is defensible as designed. Downgrade confidence to 6/10, but note UX confusion risk when navigating to an empty future month.

### 3. `InlineTextEditor` slide-switch while editor mounted — `originalTextRef` leaks first slide's text (confidence 7/10)
**File:** `web/src/components/editor/InlineTextEditor.tsx:22` + `ZoneCanvas.tsx:349` + `Editor.tsx` slide-strip click handler

`originalTextRef` is captured on mount (`useRef(zone.text || '')`). `InlineTextEditor` is rendered conditionally when `editingZoneId !== null`. If the user double-clicks a zone to enter edit mode, then clicks a DIFFERENT SLIDE in the slide strip (changing `activeSlideIdx` in Editor), the parent's `activeSlide` changes, but `ZoneCanvas` is passed the new slide — which has no zone matching `editingZoneId`, so `editingZoneId && slide.zones.find(z => z.id === editingZoneId)` returns `null` and the editor correctly unmounts (line 346). The slide change does NOT leak `originalTextRef` to the next slide. **However:** if two zones on the SAME slide have the same `id` (degenerate case), the editor mounts for the first match, then a second double-click on the other zone with the same id would reuse the same `editingZoneId` state without remounting (key is `editingZoneId`, so the component would NOT remount). In practice zone IDs are UUIDs so this is theoretical. **Net verdict:** the originalTextRef concern from the audit spec does NOT materialize in practice. Downgrade to P3 / theoretical.

### 4. ZoneCanvas `onMouseDown` callback recreated when `slide.zones` changes — drag stale-closure window (confidence 7/10)
**File:** `web/src/components/editor/ZoneCanvas.tsx:184`

`useCallback([..., slide.zones, ...])` — the `onMove` closure inside captures `slide.zones` via the `computeAlignmentGuides` call. `slide.zones` is in the dep array, so the callback is recreated each time zones update. Between the `mousemove` listener attachment (line 182) and the next render triggered by `onZoneChange` (which calls `setSlides`), the stale `onMove` closure (captured on mousedown) correctly uses the zones snapshot from drag-start — this is intentional and correct for alignment-guide computation. No bug. **Withdraw.**

---

## Confirmed Regressions from R2

**None identified.** The drag-bracket pattern is correctly gated: `preDragRef.current !== null` check in `changeZone` routes to `transientUpdate` only during active drag (mousedown→mouseup). `handleMutationEnd` pushes to `undoStackRef.current` (stable ref), not the stale closure. `transientChangeZone` correctly bypasses undo for auto-grow. ESC cancel correctly uses `originalTextRef.current` (mount-time capture).

---

## Outstanding from R1 (unfixed across cycles)

- **SchedulePostModal double-commit (P1):** R2 did not touch this file. Still exploitable via rapid tap on conflict-override button. Fix is 3 lines: `savingRef` guard.
- **Calendar.tsx isEmpty logic (P2):** Not changed. Behavior is arguably correct-by-design (all-time empty state), but empty-month navigation shows a grid with no explanation. Consider changing to `visiblePosts.length === 0` with month-specific copy.

---

## Top 3 Recommendations

1. **(Recommended) Fix SchedulePostModal double-save guard** — Add `const savingRef = useRef(false)` to `doSave()`: check + set it synchronously before `setLoading(true)`, reset in `finally`. The `disabled={loading}` guard on the already-unmounted button is not sufficient. 3-line fix, prevents duplicate `schedulePost` Firestore writes which are hard to detect and harder to undo.

2. **Reorder `slidesRef2` / `captionRef` declarations above their first use** — Move lines 140-143 (the ref declarations) to just below `undoStackRef` (before `handleMutationStart`). Runtime-safe today, but declaration order is a maintenance trap and will confuse the next reader of this file.

3. **Calendar empty-month UX** — Change `isEmpty` to `visiblePosts.length === 0` and split the empty-state copy: all-time-empty ("Erstelle deinen ersten Post") vs. month-empty ("Keine Posts in diesem Monat"). One conditional, no new state, fixes a real UX gap a non-technical user (Jule) will hit navigating future months.
