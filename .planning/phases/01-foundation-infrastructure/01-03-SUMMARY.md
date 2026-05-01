# Plan 01-03 Summary

**Status:** Code-side complete. `pnpm install`, `pnpm build:web`, `firebase deploy --only firestore:rules,firestore:indexes,storage,hosting`, and end-to-end probes deferred to Tim (see `.planning/human_tasks.md` H-1, H-6).

## Files created
**Build / config:**
- `tsconfig.web.json` (root)
- `web/package.json` - minimal stub (no deps; root holds them per D-02)
- `web/index.html`
- `web/vite.config.ts` - port 5173, proxy `/api` + `/internal` -> `localhost:8080`, alias `@shared`/`@web`
- `web/tsconfig.json`, `web/tsconfig.node.json`
- `web/tailwind.config.js`, `web/postcss.config.js`
- `web/.env.example` - `VITE_USE_EMULATORS=true` and Firebase web config placeholders

**Client lib + state:**
- `web/src/styles/index.css` - Tailwind + base
- `web/src/lib/firebase.ts` - app/auth/db/storage init + emulator connect when `VITE_USE_EMULATORS=true` (firestore on 8081 to avoid server :8080 conflict)
- `web/src/lib/api.ts` - fetch wrapper attaching `Authorization: Bearer <ID-token>`
- `web/src/store/auth.ts` - Zustand store

**Auth + onboarding:**
- `web/src/auth/useUserDoc.ts` - `users/{uid}` snapshot listener
- `web/src/auth/SignInScreen.tsx` - Google + Email-Link (AUTH-01, AUTH-02)
- `web/src/auth/OnboardingModal.tsx` - non-dismissible, 2 fields German copy ("Markenname", "Anthropic API-Schlüssel", "Loslegen", console.anthropic.com link), 4-step write order per D-20 with retry-on-step-4-fail, no `onClose`
- `web/src/auth/AuthGuard.tsx` - gates children until `activeBrandId` AND `apiKeys.anthropic` both present (D-19)

**Shell:**
- `web/src/components/Sidebar.tsx` - 5 NavLinks (Dashboard/Create/Posts/Calendar/Settings, D-23)
- `web/src/components/Header.tsx` - BrandSwitcher + email + sign-out
- `web/src/components/BrandSwitcher.tsx` - lists `users/{uid}/brands`, writes `activeBrandId` (D-24)
- `web/src/routes/{Dashboard,Create,Posts,Calendar,Settings}.tsx` - Dashboard empty state, others placeholder
- `web/src/main.tsx`, `web/src/App.tsx` (full version with `<AuthGuard>` wrapper)

**Rules + emulator:**
- `firestore.rules` - exact D-28 block (`users/{uid}/{document=**}`, `system/{doc}` read-only, default-deny)
- `firestore.indexes.json` - empty
- `storage.rules` - `/photos/{uid}` and `/renders/{uid}` per-uid, default-deny
- `scripts/seed-emulator.sh` - emulator-side counterpart to seed-killswitch.sh (port 8081)

## Deviations from PLAN
- **`firebase.json` was already written by 01-02** with hosting + emulators blocks included. No edit needed here. Saves a second JSON merge pass.
- **`web/src/App.tsx` written as final version directly** (not stub then replace). Standard minimalism cleanup.
- **No `pnpm install` / no `pnpm build:web` invoked** (per execution boundaries). Tim runs in H-1.

## Cloud resources (pending H-6)
- Firestore rules deployed
- Storage rules deployed
- Frontend on Firebase Hosting at `https://content-gen-prod.web.app`
- `web/.env` populated with real Firebase config from `firebase apps:sdkconfig WEB`

## End-to-end verification status
All 10 probes (A-J) from PLAN Task 4 are pending Tim's interactive run.
