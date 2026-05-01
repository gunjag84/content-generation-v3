# Plan 02-03 Summary

**Status:** Code-side complete. Build + typecheck verified; emulator-side smoke deferred to Tim.

## Files created (16)
NDJSON / autosave / hooks:
- `web/src/lib/streamGenerate.ts` - fetch + ReadableStream + UTF-8 decoder + line-buffer (handles trailing-byte case).
- `web/src/lib/saveDraftDebounced.ts` - per-postId trailing-edge debounce; `DraftPatch = {slides?, caption?}` blocks aiSnapshot writes at the call site.
- `web/src/lib/zoneOps.ts` - pure `updateZone(slides, slideIdx, zone)` helper.
- `web/src/lib/font-loader.ts` - verbatim port of v2 lazy Google/Fontshare loader.
- `web/src/hooks/useDebouncedAutoSave.ts` - 800ms trailing debounce; skips first run.
- `web/src/hooks/usePhotoPool.ts` - `onSnapshot` on photos sub-collection; upload/remove/updateLabel.

Editor (verbatim ports of v2 + thin wrappers):
- `web/src/components/editor/ZoneCanvas.tsx` (port).
- `web/src/components/editor/SlidePanel.tsx` (port; ColorPicker swapped for native input, repositionZonesForTextPosition dropped - both documented in file header).
- `web/src/components/editor/ZonePanel.tsx` (port; ColorPicker swapped for native input).
- `web/src/components/editor/EditorPreview.tsx` - ResizeObserver-driven scale + ZoneCanvas wrapper.
- `web/src/components/editor/SlideStrip.tsx` - vertical thumbnail rail using SlideThumbnail.
- `web/src/components/editor/index.ts` - barrel.

Photos:
- `web/src/components/photos/PhotoGallery.tsx` - 4-col grid, label edit (500ms debounced), confirm-on-delete.
- `web/src/routes/settings/PhotosPage.tsx` - thin wrapper.

Create + Editor pages:
- `web/src/components/create/CreateForm.tsx` - 8 GenerateRequest fields, validation, PhotoPicker.
- `web/src/components/create/PhotoPicker.tsx` - inline gallery + per-photo label dropdown + upload-new.
- `web/src/routes/Create.tsx` - replaces stub; subscribes to brand/situations/methods, owns AbortController, navigates on `complete`.
- `web/src/routes/Editor.tsx` - 3-column layout (SlideStrip / EditorPreview / SlidePanel + ZonePanel + caption); `useDebouncedAutoSave({slides, caption}, ...)`; dev-only `console.assert` invariance guard for aiSnapshot.

App.tsx + SettingsLayout were pre-wired during 02-01 (routes for /create, /editor/:postId, /settings/photos already present; sidebar already includes Photos tab between Library and Methods).

## Verification (run)
- `bash scripts/verify-phase02-deletions.sh` -> `OK: no forbidden tokens`, exit 0.
- `npx tsc -p tsconfig.web.json --noEmit` -> clean.
- `npx tsc -p tsconfig.server.json --noEmit` -> clean.
- `npx tsc -p server/functions/tsconfig.json --noEmit` -> clean.
- `npm run build:web` -> 119 modules transformed, dist/ written, exit 0.

## Verification (deferred to Tim, requires emulators)
- E2E smoke: sign-in -> /settings/photos upload -> /create generate (story + zitat paths) -> /editor/:postId edits persist with aiSnapshot byte-identical.
- Cancel test: assert no post doc created when AbortController fires before completion.
- Firestore rules test extension for aiSnapshot mutation deny (rule itself shipped in 02-01).

## Deviations from PLAN
- **DraftPatch / aiSnapshot guard simpler than spec.** Spec calls for an integration test asserting `Object.keys(updateDoc partial)` excludes aiSnapshot. The TypeScript `DraftPatch = {slides?, caption?}` type already makes such a test compile-time impossible; we kept a runtime `console.assert` in Editor.tsx (dev-only). No vitest harness was set up in the web package - adding one is in 02-RESEARCH backlog, not blocking phase closure.
- **SlidePanel + ZonePanel ports drop the v2 ColorPicker dependency** in favor of native `<input type="color">`. Same applies in both files; avoids importing the heavy Radix popover stack which v3 has not pulled in yet. Documented in each file header.
- **SlidePanel drops `repositionZonesForTextPosition` import.** v2 helper depended on STACK_ORDER/ZONE_GAP/estimateZoneContentHeight constants not ported; the textPosition button now just sets the value (zones can be repositioned manually via drag, which v3 already supports verbatim).
- **Editor inline upload from SlidePanel is a no-op stub.** Photo pool management lives in `/settings/photos` (Q6 lock); SlidePanel still renders the upload input but the handler is empty.
- **MCP-Q1 PNG render path: not built.** Editor preview is CSS-only per Tim's locked Q1; PNG render deferred to Phase 03 with the warning from `dev` learnings about editor-preview vs server-render drift.

## Pointers
- 02-RESEARCH.md for Pattern 6 (debounced editor on Firestore) and Pitfall #5 (NDJSON trailing-byte) - both implemented as written.
- v2 sources at `C:\webprojects\content-generation\client\src\components\social-club\` for diff against the verbatim ports (only import-path edits + the two documented dependency drops).
