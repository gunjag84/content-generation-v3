# Plan 02-01 Summary

**Status:** Complete (Path A, emulators only).

## Files created
- `firestore.rules` extended: `/users/{uid}/brands/{brandId}/{situations|methods|photos|posts}/**` scoped to owner; aiSnapshot immutability rule on posts.
- `storage.rules`: `/users/{uid}/{allPaths=**}` scoped to owner.
- `shared/schemas/{brand,focusArea,situation,method,apiKeys}.ts` (zod v3) - canonical doc shapes.
- `web/src/store/activeBrand.ts` - `useActiveBrand()` thin wrapper over useUserDoc.
- `web/src/lib/{resizeImage,uploadPhoto}.ts` - image-resize + upload helpers.
- Settings UI:
  - `web/src/routes/settings/SettingsLayout.tsx` (7-tab sidebar; Photos slot reserved here for 02-03).
  - `web/src/routes/settings/{IdentityPage,DesignPage,FocusAreasPage,LibraryPage,MethodsPage,ApiKeysPage}.tsx`.
- Auto-seed of DEFAULT_METHODS into the methods sub-collection on first brand load.

## Verification
- `pnpm typecheck` (server) + `pnpm build:web` clean.
- `firestore.rules` unit tests cover owner read/write + aiSnapshot deny.

## Deviations from PLAN
None.
