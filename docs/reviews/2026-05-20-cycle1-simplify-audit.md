# Simplify Audit — 2026-05-20 Cycle 1

**Branch:** master @ e83d317
**Auditor:** simplify lens
**Prior audits:** none

## Verdict
MIXED

---

## Findings

### 1. Stale-closure bug in `useKeyboardShortcuts` — calls `handlers.*` not `handlersRef.current.*`
`web/src/hooks/useKeyboardShortcuts.ts:43-102` — confidence 9/10

`handlersRef` is updated every render so closures stay fresh, but the `onKeyDown` body still calls `handlers.save()`, `handlers.undo()`, etc. (the param, not the ref). The dep array is `[isEnabled, handlers]`, which means the listener re-attaches whenever `handlers` changes identity — and because `shortcutHandlers()` is called inline at `Editor.tsx:184` (`useKeyboardShortcuts(shortcutHandlers(), true)`), the handlers object is recreated on every render. The `handlersRef` machinery is dead weight. Fix: either drop `handlersRef` and use `handlers` directly with `[isEnabled, handlers]` dep (current behavior, correct), OR switch all body callsites to `handlersRef.current.*` and drop `handlers` from the dep array (one attach, zero re-attaches). As written it does neither cleanly.

### 2. `resolvePhotoTransform` in `photoTransform.ts` — unused single-call helper
`web/src/lib/photoTransform.ts:1-35` — confidence 8/10

`resolvePhotoTransform` is defined but never imported anywhere in the codebase (only `DEFAULT_PHOTO_TRANSFORM` is indirectly present via the type). `SlidePanel.tsx:255` does the same three-level fallback inline: `photoTransforms[photo.id] || { rotation: 0, scale: 1 }`. Extract-too-early antipattern: the abstraction was built for a `zone.photoTransform` per-zone override path that doesn't yet exist in any consumer. 35 LoC of dead abstraction.

### 3. `SnapGrid` and `AlignmentGuides` are near-identical SVG overlay components — merge candidate
`web/src/components/editor/SnapGrid.tsx:1-60` + `AlignmentGuides.tsx:1-52` — confidence 7/10

Both: absolute SVG, `position:absolute inset:0`, identical `strokeWidth = Math.max(0.5, 1/scale)`, identical `viewBox`, identical `pointerEvents:none`, same sizing props. They differ only in what lines they draw and their `zIndex` (50 vs 51). A single `<CanvasOverlay>` component with a `lines` prop array (each `{x1,y1,x2,y2,stroke,dash?}`) would cut ~60 LoC to ~30 and remove the duplicate math. Both are already only consumed by `ZoneCanvas`.

### 4. `SlideThumbnail` inlines the full logo-zone and text-zone render trees verbatim from `ZoneCanvas`
`web/src/components/editor/ZoneCanvas.tsx:447-483` — confidence 8/10

The logo `<div>` block (lines 449-465) and the text zone `<div>` with `ref` + `txtStyle` (lines 466-482) are copy-pasted from the `ZoneCanvas` zone loop (lines 268-284). When styling changes (e.g. logo padding, text whiteSpace), both sites need updating. A `<ZoneRenderer zones={zones} zoneRefs={zoneRefs} />` helper or even a shared `renderZone(zone, ref?)` function would collapse this.

### 5. `hexToRgb` defined in both `ZoneCanvas.tsx:19` and `SlidePanel.tsx:14`
Confidence 9/10 — pure copy-paste. Neither imports from the other. Should live in `web/src/lib/colorUtils.ts` and be imported by both. 8 LoC duplicated.

### 6. `useUndoStack` — `_initialState` param is unused
`web/src/hooks/useUndoStack.ts:68` — confidence 9/10

The `_initialState: T` parameter is accepted but never used (underscore prefix signals this). The stack starts empty; `initialState` is not pushed as the first entry. This is not a bug — the Editor pushes before each mutation — but the API surface is misleading and should just be dropped.

### 7. Caption auto-grow in `Editor.tsx` reimplements `useAutoGrow` inline
`web/src/routes/Editor.tsx:718-722` — confidence 6/10

The caption `<textarea>` does manual inline auto-grow via `onChange` + `ref` callbacks. `useAutoGrow` exists for exactly this pattern (DOM-measure → height correction). The caption case is simpler (no y-shift cascade), so the inline is justified, but it's worth noting as mild drift from the established hook.

---

## Top 3 Simplification Candidates (LoC-now → LoC-after)

1. **(Recommended)** Fix `useKeyboardShortcuts` stale-closure + drop dead `handlersRef` machinery AND fix the inline `shortcutHandlers()` call in Editor.tsx — current=~15 LoC machinery, after=~5 LoC, savings=~10 LoC + eliminates a real correctness risk (handlers re-attach every render).

2. Delete `resolvePhotoTransform` (dead code) and inline the `DEFAULT_PHOTO_TRANSFORM` constant where needed — current=35 LoC in `photoTransform.ts`, after=0 LoC (file deleted; constant moved inline or to `slide.ts`), savings=35 LoC.

3. Extract `hexToRgb` to `lib/colorUtils.ts` and remove both copies in `ZoneCanvas.tsx` and `SlidePanel.tsx` — current=8+8=16 LoC duplicated, after=8 LoC shared, savings=8 LoC + no future drift risk when color handling changes.
