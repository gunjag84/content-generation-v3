# Codex-Style Adversarial Audit — 2026-05-20 Cycle 2

**Branch:** master @ e9be8d4
**Auditor:** claude-subagent-adversarial (codex CLI unavailable)
**Prior audits:** R1 process-manager + qa + simplify

## Verdict
NEW-CONCERNS

## What R1 missed (new findings, file:line, confidence N/10)

### 1. Drag-every-pixel floods undo stack — confidence 9/10
**File:** `web/src/components/editor/ZoneCanvas.tsx:126,137,149` + `web/src/routes/Editor.tsx:253-255`

`onZoneChange` is wired to `changeZone` in Editor.tsx, which calls `commitEdit`, which pushes to the undo stack. `onMouseMove` in ZoneCanvas calls `onZoneChange` on every pixel of drag movement. Result: a 200px zone drag pushes ~200 undo entries. Cmd+Z after a drag rewinds one pixel at a time. The stack cap of 50 means a single drag operation can exhaust the entire history. This is a correctness bug, not just UX friction.

**Fix:** Record the pre-drag snapshot on `mousedown` (outside onMove), then call `commitEdit` once on `mouseup`. During drag, call a raw `setSlides` (no undo push) or expose a `setSlides` bypass in ZoneCanvas.

### 2. `useAutoGrow` floods undo stack via commitEdit — confidence 8/10
**File:** `web/src/hooks/useAutoGrow.ts:52` + `web/src/components/editor/ZoneCanvas.tsx:175`

`useAutoGrow` calls `onZoneChange` (= `changeZone` = `commitEdit`) inside a `useLayoutEffect` with no dependency array — runs after every render. Every auto-grow correction creates an undo entry. After typing text in InlineTextEditor, the commit triggers a render, which triggers useAutoGrow, which pushes another undo entry — so one user action yields two undo entries, making undo asymmetric with the user's intent.

**Fix:** useAutoGrow must bypass the undo stack. Pass a separate `onAutoZoneChange` prop that calls raw `setSlides` without pushing.

### 3. PhotoEditModal state-leak on active-slide switch — confidence 8/10
**File:** `web/src/components/editor/SlidePanel.tsx:229`

`photoEditOpen` is local state inside `SlidePanel`. `SlidePanel` renders conditionally (`rightTab === 'slide' && activeSlide`), so switching the right tab unmounts and resets it. But switching the active slide index via SlideStrip does NOT unmount SlidePanel — `activeSlide` changes but the component stays mounted with `photoEditOpen = true`. The modal then shows, opens against the OLD slide's `imageUrl` prop passed at modal open time, but `onChange` now writes to the NEW active slide. A user who: (1) opens photo-edit modal on slide 2, (2) clicks slide 3 in SlideStrip, (3) clicks "Fertig" — corrupts slide 3's image transform with slide 2's photo parameters.

**Fix:** Close modal on slide change. Add `useEffect(() => { setPhotoEditOpen(false); }, [slide])` in SlidePanel, keyed to `slide.number` or `slide` identity.

### 4. `autoFitSlide` and format-change refit bypass undo stack — confidence 7/10
**File:** `web/src/routes/Editor.tsx:326,494`

`autoFitSlide` (called after `assignPhoto`) and the format-change `useEffect` both call raw `setSlides` without going through `commitEdit`. This means the auto-fit scale/position is applied silently outside the undo stack. User assigns photo → undo → photo is unassigned but the scale reset (imageX:50, imageY:50, imageScale:auto) is NOT undone. Undo leaves the slide in a partially inconsistent state (old photo, new scale). Comment in code says "no second push" as justification, but that only avoids double-history for the user action — it doesn't account for the scale being part of the visual state the user sees.

**Impact:** Low severity for most flows, but notable for Jule's use pattern where she adjusts zoom first, then re-assigns — undo will leave mismatched scale.

### 5. Caption `commitEdit` on every keystroke — confidence 7/10
**File:** `web/src/routes/Editor.tsx:715`

The caption `textarea` `onChange` calls `commitEdit(slides, e.target.value)`. Every keystroke pushes a new undo entry. Typing a 200-char caption fills the 50-entry stack, evicting all previous slide-edit history. Cmd+Z in the caption walks back one character at a time and also re-renders the full slide array each time.

**Fix:** Debounce the undo push for text inputs (flush on blur), or use a separate caption undo track.

### 6. InlineTextEditor scale prop is passed but never applied to the overlay position — confidence 6/10
**File:** `web/src/components/editor/InlineTextEditor.tsx:64-94`

`scale` is accepted as a prop but never used in the style object. The overlay position uses raw `zone.x / zone.y` coordinates (canvas-space), but `ZoneCanvas` renders at CSS-scaled dimensions (editor preview is scaled to fit the viewport). If `scale !== 1`, the textarea overlay will not align with the rendered text zone. Only safe when the editor preview happens to render at exactly the reference resolution (1080px wide canvas). On smaller screens the overlay drifts.

## Top 3 Recommendations

1. **(Recommended)** Fix drag-flood + autoGrow-flood on undo stack — two-part fix: (a) in ZoneCanvas, push undo snapshot on `mousedown`, use raw `setSlides` during drag, call `commitEdit` once on `mouseup`; (b) pass a separate `onAutoZoneChange` prop to `useAutoGrow` that skips the stack. This is the highest-impact fix — the undo feature is the UX centerpiece of B3 and currently broken for the most common editing action.

2. Close `PhotoEditModal` when active slide changes — add one `useEffect` in SlidePanel keyed to `slide` identity. Prevents silent image-transform corruption during multi-slide workflows.

3. Debounce caption undo pushes — flush on textarea blur instead of on every keystroke. Prevents the 50-entry stack from being consumed by a single caption edit, preserving slide-edit history for the session.
