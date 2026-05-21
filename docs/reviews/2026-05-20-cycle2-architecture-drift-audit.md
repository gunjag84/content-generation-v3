# Architecture Drift Audit — 2026-05-20 Cycle 2

**Branch:** master @ 4031114 (most recent commit)
**Auditor:** plan-eng-review-style lens
**Original arch decisions:** 5 (snapshot undo, textarea inline, hybrid photo, indep autosave, no multi-select)

## Verdict

**PARTIAL-DRIFT** (one decision partially drifted; all others locked-in)

---

## Drift table

| Decision | Locked spec | Implemented as | Match? |
|----------|-------------|----------------|--------|
| Undo data model: structuredClone, cap 50, in-memory | `structuredClone` on every push in `createUndoStack`; hard slice at `past.length > 50`; pure in-memory (`useRef` only, no Firestore write) | Matches exactly | YES |
| Inline text edit: `<textarea>` overlay | `InlineTextEditor.tsx` renders `<textarea>` with absolute positioning, mirrors font/size/lineHeight/color/rotation; no contentEditable anywhere | Matches exactly | YES |
| Photo pan/zoom: hybrid per-photo + per-zone, zone wins | `resolvePhotoTransform()` in `photoTransform.ts`: zone-level wins, falls back to brand map, then DEFAULT | Function exists and is correct | PARTIAL |
| Undo vs. auto-save: independent, last-write-wins | `useDebouncedAutoSave` watches `{slides,caption}` state independently; undo pops the in-memory stack, auto-save fires on next state change; no coupling | Matches. Multi-tab race documented in `CLAUDE.md` "known limitation" | YES — but warn-log absent |
| Multi-select: DROPPED | `selectedZoneId: string | null` in Editor state; `ZoneCanvas` prop `selectedId: string | null`; no Set, no group-select logic found | Single-zone only, multi-select not present | YES |

### The partial drift — `resolvePhotoTransform` not wired into ZoneCanvas render

The `resolvePhotoTransform` utility is correctly implemented and unit-tested. But `Editor.tsx` never calls it. The active render path in `ZoneCanvas` uses raw `slide.imageX / slide.imageY / slide.imageScale` (slide-level fields, not zone-level `photoTransform`). `SlidePanel.tsx` only uses `photoTransforms[photo.id]` for the thumbnail preview icon — not for applying zone overrides on the canvas. `resolvePhotoTransform` is imported only in `__tests__`.

Locked spec: zone-level `photoTransform` should win over brand default. Current behavior: zone-level `photoTransform` field is never read during render. The hybrid precedence logic exists but is dead code.

### Z-index stack

| Layer | z-index |
|-------|---------|
| Background / gradient overlay | 1 |
| Dev grid | 2 |
| Zones | 10 |
| Rotate handle | 20 |
| SnapGrid | 50 |
| InlineTextEditor textarea | 50 |
| AlignmentGuides | 51 |

**Collision:** SnapGrid and InlineTextEditor both sit at z-index 50. When a text zone is being edited AND snap is active (which it is during any drag), the snap grid renders on top of the textarea on the same layer. In practice they don't overlap (snap grid is pointer-events:none and the textarea is a different zone), but the identical z-index is fragile. AlignmentGuides at 51 correctly sit above both.

### Component / hook count

- New editor components: 9 (`AlignmentGuides`, `EditorPreview`, `InlineTextEditor`, `KeyboardCheatsheet`, `SlidePanel`, `SlideStrip`, `SnapGrid`, `ZoneCanvas`, `ZonePanel`) — projected 5-8, actual 9. One above the upper bound. No fragmentation concern — each has clear single responsibility.
- New hooks: 5 (`useAutoGrow`, `useDebouncedAutoSave`, `useKeyboardShortcuts`, `usePhotoPool`, `useUndoStack`) — projected 3-4, actual 5. One above the upper bound. `usePhotoPool` is pre-existing; `usePublishedPosts` is dashboard-level, not editor. Borderline but acceptable.

### Multi-tab warn-log

The `/plan-eng-review` recommended (did not mandate) a `console.warn` on stale-write detection. It is not present. Auto-save fires into Firestore without any concurrent-write detection. This is the documented known limitation but the guard is unimplemented.

---

## Top 3 Recommendations

1. **(Recommended) Wire `resolvePhotoTransform` into `ZoneCanvas` photo render** — The hybrid schema is implemented and tested but dead. The `imgStyle` in `ZoneCanvas` reads `slide.imageX/Y/Scale` directly; it should call `resolvePhotoTransform(zone, brandPhotoTransforms, photoId)` when a zone carries a photo. Until this is wired, the per-zone override path (the highest-priority tier of the locked spec) does nothing at runtime. One-line fix in `ZoneCanvas` photo zone render + pass `brandPhotoTransforms` as a prop from `Editor.tsx`.

2. **Resolve the z-index 50 collision between `SnapGrid` and `InlineTextEditor`** — Move `SnapGrid` to z-index 48 (below zones at 10 would lose it behind zones; 48 keeps it above the gradient at 1/2 but below inline edit). Or move `InlineTextEditor` to z-index 52 (above alignment guides). Current arrangement works by accident (no overlap in practice) but will silently break if the canvas layout changes.

3. **Add the multi-tab stale-write warn-log** — A single `console.warn('[auto-save] writing over possible concurrent edit — multi-tab race')` triggered on any save where `updatedAt` in Firestore is newer than the locally-loaded value would convert the "known limitation" into an observable signal. Low effort, high observability payoff for Jule's production use where she may have the editor open in two tabs.
