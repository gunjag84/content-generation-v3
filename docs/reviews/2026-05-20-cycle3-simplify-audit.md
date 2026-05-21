# Simplify Audit — 2026-05-20 Cycle 3 (final)

**Branch:** master @ 389350a
**Auditor:** simplify lens
**Prior audits:** R1, R2

## Verdict
MIXED

## New complexity from R1+R2 fixes (worth-it?)

The drag-bracket machinery (`transientUpdate`, `preDragRef`, `handleMutationStart`,
`handleMutationEnd`, `transientChangeZone`) is conceptually sound and solves a real
P0 bug. However it introduced one structural defect and one redundancy:

**Structural defect — ref ordering bug (Editor.tsx L100 vs L140):**
`handleMutationStart` is declared at L124 and reads `slidesRef2.current` (declared
at L140). The ref is used inside a `useCallback` body, so it only executes at
call-time, not declaration-time — meaning this works today. But it violates the
"declare before use" rule that the existing ref block already follows, and it will
silently break if the ref block is moved. The drag-bracket ref block should live
*after* the slidesRef2/captionRef block, not before it.

**Redundancy — `transientChangeZone` duplicates `changeZoneAt` body:**
`transientChangeZone(z)` = `transientUpdate(updateZone(slides, activeSlideIdx, z))`.
`changeZoneAt(slideIdx, z)` = `transientUpdate(updateZone(slides, slideIdx, z))`.
These are the same function with `activeSlideIdx` hardcoded. A single
`changeZoneAt(activeSlideIdx, z)` call in `onTransientZoneChange` eliminates the
named function entirely — saving 5 LoC and one named concept.

**`changeZone` branching on `preDragRef.current`:**
Acceptable. The branch is explicit and directly readable; it documents exactly when
the undo-stack bypass fires. No simplification needed.

## Test overlap analysis

`undoStackIntegration.test.ts` (112 LoC) vs `useUndoStack.test.ts` (80 LoC):

- Test 3 of integration (`non-drag commitEdit still pushes normally`) fully
  re-implements push+undo mechanics already covered by useUndoStack tests 1-3.
  It adds zero new coverage; it only uses local `commitEdit` re-impl rather than
  `createUndoStack` directly.
- Tests 1-2 (drag-bracket and autoGrow transient paths) are genuinely new
  integration scenarios not in useUndoStack.test.ts. Keep those.
- Removing test 3 brings integrations.test.ts to ~80 LoC and eliminates the
  duplicated `commitEdit` reimplementation block.

## Top 3 Simplification Candidates (LoC-now → LoC-after)

1. **(Recommended)** Delete `transientChangeZone` function; inline as `changeZoneAt(activeSlideIdx, z)` in the `onTransientZoneChange` prop — current=5 LoC (function decl + comment + wire-up), after=0 LoC (replaced by existing function call), savings=5 LoC + 1 named concept.

2. Move drag-bracket ref block (L122-L135) to after slidesRef2/captionRef declarations (L140-L143) to fix silent ordering dependency — current=same LoC, after=same LoC, savings=0 LoC but eliminates a latent ordering bug before someone moves the ref block.

3. Drop `undoStackIntegration.test.ts` test 3 (`non-drag commitEdit still pushes normally`) — current=18 LoC, after=0 LoC, savings=18 LoC of duplicate coverage. The two genuine drag-bracket tests (tests 1-2) remain.
