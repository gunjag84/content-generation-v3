# Editor v2 Port-Back Plan

Bring 5 v2 (`content-generation`) ergonomic wins back into v3 (`content-generation-v3`) editor (`/editor/:postId`). Decisions were walked through in session 2026-05-13 against v2 Social Club Step 2; this plan is execution-only.

## Scope (5 items)

1. **A2** Publish bar in editor bottom (Now / Schedule datetime + Publish IG / Publish IG+FB), wrapping the async render+publish flow.
2. **F** Tabbed right rail (Slide / Zones / Caption), one panel visible at a time.
3. **G5** Replace gradient "All" checkbox with a one-shot "Apply gradient color to all slides" button.
4. **I2** Grid toggle button in canvas toolbar (wire existing `showGrid` prop).
5. **J1** Auto-grow caption textarea (resize to scrollHeight, no internal scroll).

Out of scope: A1, A3, B*, C*, D, E*, G1–G4, H*, I1, K, L (all confirmed v3 in the walkthrough). Pillar badge, manual Zoom, captionPaid, `text` slide type — all explicitly dropped.

## Files touched

| File | Change | Items |
|---|---|---|
| `web/src/routes/Editor.tsx` | Top toolbar adds Grid button. Bottom bar adds publish controls. Right `<aside>` becomes tabbed. Gradient-sync handler simplified. Caption section moved into Caption tab. | A2, F, I2, J1, G5 |
| `web/src/components/editor/SlidePanel.tsx` | Drop `syncGradientColor` checkbox + `onSyncGradientColorChange` prop. Add `onApplyGradientToAll` prop + button. | G5 |
| `web/src/components/editor/ZoneCanvas.tsx` | No change — `showGrid` prop already supported. | I2 (verify only) |
| `web/src/components/editor/EditorPreview.tsx` | Forward `showGrid` from props (already present). | I2 (verify only) |
| (new file) `web/src/lib/publishOnePost.ts` | Existing helper — re-used. | A2 |

No shared types change. No Firestore schema change. No server change (the publish endpoint already exists, just call from a different surface).

## Item-by-item

### Item 1 (A2) — Publish bar in editor bottom (corrected per eng review)

**Scope corrections vs original draft (eng review D1–D3, 2026-05-13):**
- IG only. No "IG + FB" button — v3 backend doesn't wire FB.
- Reuse existing `SchedulePostModal` from `/posts`. No inline datetime input.
- Reactive render→publish chain via `pendingPublishMode` flag + `useEffect` watching `renderJob.status === 'done'`. No imperative await of a hook.

**UI (bottom row, full-width, below canvas):**

```
[Back]                                       [Einplanen]   [Jetzt veröffentlichen]
```

- "Back" navigates to `/posts`.
- "Einplanen" opens `SchedulePostModal` (same component as `DraftsTab.tsx`).
- "Jetzt veröffentlichen" triggers immediate publish.

**Mechanics:**
1. New state in `Editor.tsx`:
   - `publishing: boolean` — disables both buttons while in-flight.
   - `publishError: string | null` — inline red message above the bar.
   - `pendingPublishMode: 'now' | null` — flips to `'now'` when "Jetzt veröffentlichen" is clicked.
   - `scheduleModalOpen: boolean` — controls `SchedulePostModal`.
2. Handler `requestPublishNow()`:
   - If `renderJob.status === 'done'` already, call `publishNow(brandId, postId)` directly, then navigate to `/posts`.
   - Else: set `pendingPublishMode = 'now'`, call `startRender()` (existing function).
3. New `useEffect` watches `renderJob.status`:
   - When `'done'` AND `pendingPublishMode === 'now'` → call `publishNow`, clear pending flag, navigate.
   - When `'error'` AND `pendingPublishMode === 'now'` → set publishError, clear pending flag.
4. Scheduling: "Einplanen" button opens `SchedulePostModal` with `postId={postId}` `brandId={brandId}`. Modal handles its own datetime + `schedulePost` call. `onScheduled` callback → navigate to `/posts`.
   - One nuance: scheduling a not-yet-rendered post is OK — the scheduled publish-worker will render before publishing. So the schedule modal doesn't need to chain render. (Verify in `cancel-schedule` / scheduled worker behavior; if scheduled posts also need pre-render, treat like Publish Now and chain.)
5. Keep top-toolbar "Rendern" button — it stays the manual render trigger.

**Wiring:**
- Reuse `publishNow` and `SchedulePostModal` as-is. No new helper.
- `publishNow` signature: `(brandId: string, postId: string) => Promise<void>`. Throws on non-OK response with `error` body.

**Acceptance:**
- Click "Jetzt veröffentlichen" on an unrendered post → render runs → publish fires on `status === 'done'` → redirect to `/posts`.
- Click "Jetzt veröffentlichen" on an already-rendered post → publish fires immediately → redirect.
- Click "Einplanen" → modal opens → user picks datetime → schedule lands → modal closes → redirect.
- Render error → bottom-bar shows red error, no publish call, no redirect.
- Publish error (after render success) → red error inline, no redirect.
- Both buttons disabled while `publishing` or `renderJob.status === 'rendering'`.

### Item 2 (F) — Tabbed right rail

**Goal:** Replace v3's stacked `<aside>` (SlidePanel + ZonePanel + Caption all visible) with v2's tab interface.

**UI:**

```
| Slide | Zones | Caption |    <- tab strip, one active
|-------------------------|
|   active panel content  |
```

**Mechanics:**
1. Add state: `rightTab: 'slide' | 'zones' | 'caption'`, default `'slide'`.
2. Tab strip header: 3 buttons, amber underline on active. Vocabulary matches v2 lines 1492–1501.
3. Body conditionally renders `<SlidePanel/>`, `<ZonePanel/>`, or the Caption textarea.
4. Caption textarea moves OUT of the bottom of `<aside>` into the Caption tab.

**Acceptance:**
- Each tab swaps content cleanly.
- Active tab visually distinct (amber underline like v2).
- Switching tabs preserves all edit state (no remount-induced data loss).
- Default tab on editor load is "Slide".

### Item 3 (G5) — Gradient color "Apply to all" — one-shot button

**Goal:** Replace the checkbox-that-fires-once with a button. Affordance matches behavior.

**Mechanics:**
1. In `SlidePanel.tsx`:
   - Remove props `syncGradientColor`, `onSyncGradientColorChange`.
   - Add prop `onApplyGradientToAll: () => void`.
   - Remove the `<label><input type="checkbox">All` JSX block.
   - Below the `<ColorInput>`, add a small button: `Apply to all slides`. Style matches the existing "Apply to All Slides" Image Transform button (mono, uppercase, amber-hover).
2. In `Editor.tsx`:
   - Remove state `syncGradient`, remove `syncGradientChange` handler.
   - Add handler `applyGradientToAll()`:
     ```
     if (!activeSlide?.gradientColor) return;
     setSlides((prev) => prev.map((s) => ({ ...s, gradientColor: activeSlide.gradientColor })));
     ```
   - Pass to SlidePanel as `onApplyGradientToAll`.

**Acceptance:**
- Clicking the button writes the active slide's `gradientColor` to every slide. One-shot. No persistent state.
- Subsequent color changes on the active slide DO NOT propagate.
- Button is only visible on `photo` and `overlay` slide types (matches the gradient section's existing visibility).

### Item 4 (I2) — Grid toggle in canvas toolbar

**Goal:** Restore the v2 "Grid" button. `ZoneCanvas` already supports the prop; only UI + state wiring is needed.

**Mechanics:**
1. In `Editor.tsx`:
   - Add state `showGrid: boolean`, default `false`.
   - In the top toolbar (where Format buttons live), add a Grid toggle button between Format and the right-aligned render group.
   - Visual: same mono-uppercase style as Format buttons. Active state: `text-amber-400 bg-amber-500/10`.
   - Pass `showGrid={showGrid}` to `<EditorPreview>`.
2. `EditorPreview.tsx` already forwards `showGrid` to `ZoneCanvas` — verify.

**Acceptance:**
- Click "Grid" → 108×108px overlay grid visible on canvas (matches v2 visual). Click again → hidden.
- Grid does NOT appear in thumbnails (thumbnails ignore the prop).
- State is in-memory only (not persisted, not synced to other components).

### Item 5 (J1) — Auto-grow caption textarea

**Goal:** Caption textarea height equals content height; no internal scroll.

**Mechanics:**

In Caption tab (per Item 2), the caption textarea sets its height on every change:

```tsx
<textarea
  value={caption}
  onChange={(e) => {
    setCaption(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }}
  ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
  className="… resize-none overflow-hidden"
/>
```

This is the exact v2 pattern at SocialClubPage lines 1539–1548.

**Acceptance:**
- Long captions render at full height without internal scroll.
- Editing grows/shrinks the box live.
- `resize-none` + `overflow-hidden` prevent the native handle and stray scrollbars.

## Risk + verification

- **Item 1 (publish bar)** is the only one that hits the server. Risk: scheduling endpoint contract drift. Mitigation: read `web/src/lib/publishOnePost.ts` first; if it doesn't take `scheduledAt`, extend the body once and verify against the existing scheduled-publish flow in `/posts`. Live-verify by publishing one test post end-to-end (IG-only, "Now") and one scheduled post (IG+FB, +15min).
- **Item 2 (tabs)** has remount risk for the SlidePanel/ZonePanel state. Both panels are stateless — props-driven. Tab switch = unmount+mount of the inactive panel's React tree, which is fine because slides/zones live in `Editor.tsx`.
- **Items 3/4/5** are purely local state + JSX.

## Pre-commit verification

1. `pnpm tsc -b` clean.
2. `pnpm build:web` clean (catches strict-mode TS that `--noEmit` misses, per the v3 learning).
3. Open `/editor/<some-post-id>` in browser: tab-switch all 3 tabs, toggle Grid, click "Apply gradient to all", trigger publish (Now, IG) on a throwaway draft.
4. `firebase deploy --only hosting` after green.

No backend deploy needed (no server changes).

## Out-of-scope reminders

- A1 dedicated route — already in v3.
- B/C/D/E/H/K/L — confirmed v3 wins in the walkthrough.
- Pillar badge (E1b) — explicitly skipped, awaits pillars feature in v3.
- captionPaid (J2) — skipped, pre-ads phase.
- `text` slide type (D) — explicitly dropped in v3 commit `6d32111`.

## Done definition

All 5 items merged to `master`, frontend deployed to `contentai-78bfb.web.app`, smoke-tested with one full publish round-trip. STATE.md gets a 1-line update noting the editor port-back.
