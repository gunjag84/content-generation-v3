# Phase 2: Brand Settings & Create — Research

**Phase:** 02-brand-settings-create
**Date:** 2026-04-27
**Mode:** ecosystem + implementation hybrid (Path A: emulator-only, no GCP deploy)
**Goal:** Equip the planner with the concrete v2 file paths, function signatures, schema shapes, and prompt-assembly logic needed to specify exact ports — plus the small set of new libraries Phase 02 introduces beyond the Phase 01 stack.

> **Operating mode (locked):** Phase 02 builds and tests against the Firebase Emulator Suite only. No `gcloud run deploy`, no real KMS, no real Cloud Tasks. The Cloud Run `/api/generate` endpoint runs locally as `pnpm dev:server` (Express). KMS uses a local-dev stub that reads `ANTHROPIC_API_KEY` from `.env` instead of decrypting from Cloud KMS. Streaming must work over standard Express HTTP — **not SSE-only** (the Express handler streams chunks via `res.write` over a normal HTTP response so the same code path works in dev and prod without an SSE intermediary).

> **Schema reduction (locked):** P3 Loyalty pillar, `hooks_guidance`, `strategy`, `styleTypes`, `layoutTemplates` are REMOVED — not migrated. Only `create-demand` and `convert-demand` modes survive. v2's `socialClub.ts` references to `pillar: '3'`, `PILLAR_FILES['3']`, `p3-loyalty-nurture.md`, `ANGLE_TARGETS['3']`, and topic-filter `bestPillar === '3'` branches must not appear in v3.

---

## Standard Stack

These are the libraries the planner should reference. Versions are confirmed from `C:\webprojects\content-generation-v3\package.json` unless noted.

| Concern | Library | Version | Status | Notes |
|---|---|---|---|---|
| Web framework (server) | `express` | ^4.21.0 | [VERIFIED: package.json] | Already installed Phase 01. |
| Anthropic SDK | `@anthropic-ai/sdk` | ^0.30+ | [ASSUMED — needs `pnpm add`] | v2 hand-rolled `fetch` to `/v1/messages`. v3 should use the official SDK; it natively yields a `MessageStream` that exposes `.on('text', ...)` and an `AbortSignal` constructor option, which simplifies the abort-on-disconnect requirement (CREATE-08). |
| Firebase server SDK | `firebase-admin` | ^12.6.0 | [VERIFIED: package.json] | Used for Firestore writes from the Express handler (post-doc creation, settings reads). |
| Firebase client SDK | `firebase` | ^11.0.0 | [VERIFIED: package.json] | Auth + Firestore client + Storage client. Web app reads/writes settings, posts, focus areas, situations directly via Firestore SDK. |
| Validation | `zod` | ^3.23.8 | [VERIFIED: package.json] | v2 used `zod/v4` (preview). v3 is on stable `zod@3`. The `parse(req.body)` pattern from v2 ports cleanly. |
| State | `zustand` | ^5.0.0 | [VERIFIED: package.json] | Editor uses local component state; Zustand only for cross-page state (active brand id, open editor session). |
| Routing | `react-router-dom` | ^7.0.0 | [VERIFIED: package.json] | New routes: `/settings/identity`, `/settings/design`, `/settings/focus-areas`, `/settings/library`, `/settings/api-keys`, `/create`, `/create/:postId`. |
| Image upload (server) | none | — | [DECISION] | v2 used `multer` + `sharp` to write to `data/uploads`. v3 uploads photos **directly from browser to Firebase Storage** via `firebase/storage` (`uploadBytes`), bypassing the server entirely. No `multer` needed. Sharp is also not needed at upload — Storage holds originals; the render service (Phase 03) handles resizing if any. |
| Levenshtein (later) | `fastest-levenshtein` | — | [CITED: editDiff.ts:2] | Only needed by Phase 04 learning loop. **Do not install in Phase 02.** |
| Sharp (later) | `sharp` | — | [CITED: socialClubRender.ts] | Only needed by render service (Phase 03). **Do not install in Phase 02.** |
| Logger | `pino` / `pino-http` | ^9 / ^10 | [VERIFIED: package.json] | Already installed Phase 01. Use for `/api/generate` request logging. |

**Net new installs for Phase 02:** `pnpm add @anthropic-ai/sdk` — that's it.

---

## Architecture Patterns

### Pattern 1: Settings as Firestore documents under the active brand

All brand settings live at `users/{uid}/brands/{brandId}` as a single document with sub-collections for list-shaped data:

```
users/{uid}/brands/{brandId}                ← single doc
  name: string
  identity: { voice, persona, product_uvp, point_of_view, competitive_landscape }
  design:   { primaryColor, secondaryColor, logoUrl, igHandle }
  focusAreas: [{ id, name, description }]   ← embedded array (small, bounded)
  updatedAt: serverTimestamp()

users/{uid}/brands/{brandId}/situations/{sitId}   ← sub-collection (can grow)
  text: string
  imageUrls: string[]                       ← Firebase Storage URLs
  createdAt: serverTimestamp()

users/{uid}.apiKeys.anthropic               ← already established Phase 01
users/{uid}.activeBrandId                   ← already established Phase 01
```

**Why focusAreas embedded, situations sub-collection:** focusAreas are bounded (~5-10 per brand, small text), updates are atomic, no listener overhead. Situations grow over time and may carry larger image arrays — sub-collection avoids document size limits and lets pagination happen later.

**Client reads/writes settings directly via Firebase Auth + Firestore SDK** — no server intermediary for settings CRUD. Security rules from Phase 01 (`request.auth.uid == uid`) cover authorization.

### Pattern 2: Generate endpoint = streaming Express handler over plain HTTP

```typescript
app.post('/api/generate', requireAuth, async (req, res) => {
  const body = GenerateSchema.parse(req.body)
  const apiKey = await getAnthropicKey(req.uid)   // KMS in prod, env in dev
  const systemPrompt = await assembleSystemPrompt({ mode, method, slideCount, brand, focusArea, situation, photoLabels, learnedPatterns })

  const abortController = new AbortController()
  req.on('close', () => abortController.abort())

  res.setHeader('Content-Type', 'application/x-ndjson')   // newline-delimited JSON, not SSE
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')                // disable proxy buffering

  const anthropic = new Anthropic({ apiKey })
  const stream = anthropic.messages.stream(
    { model: 'claude-opus-4-7', max_tokens: 4096, system: [...], messages: [...] },
    { signal: abortController.signal },
  )

  let fullText = ''
  for await (const event of stream) {
    if (abortController.signal.aborted) return
    if (event.type === 'content_block_delta' && event.delta?.text) {
      fullText += event.delta.text
      res.write(JSON.stringify({ type: 'chunk', text: event.delta.text }) + '\n')
    }
  }

  const parsed = parseSlidesMd(fullText)
  // Server creates the post doc with aiSnapshot before sending 'complete'
  const postId = await createDraftPost(req.uid, body.brandId, { ...parsed, aiSnapshot: { slides: parsed.slides, caption: parsed.caption }, mode, method, focusAreaId, situationText, photoUrls })
  res.write(JSON.stringify({ type: 'complete', postId, ...parsed }) + '\n')
  res.end()
})
```

**Why NDJSON, not SSE:**
- v2 used SSE (`text/event-stream` + `event: chunk\ndata: ...`). The `Connection: keep-alive` + flushing semantics interact poorly with some proxies and serverless edges.
- NDJSON over a normal HTTP response works identically in dev (Vite proxy) and prod (Firebase Hosting rewrite to Cloud Run) and is trivially consumable from the browser via `fetch().body.getReader()`.
- Decision is locked by the user's "must work over standard Express HTTP, not SSE-only" directive.

**Abort-on-disconnect:** `req.on('close')` fires when the client navigates away or aborts the fetch. `AbortController.abort()` then cancels the in-flight Anthropic request. The official SDK accepts `{ signal }` in the second arg of `messages.stream()` — no manual `reader.cancel()` plumbing.

**Post-doc creation is server-side**, atomic with the stream end, so the client doesn't race to create the doc.

### Pattern 3: Photo upload bypasses server entirely

```
Browser → Firebase Storage (gs://leben-lieben-v3.appspot.com/users/{uid}/brands/{brandId}/photos/{uuid}.jpg)
       → returns downloadURL
       → client passes { downloadURL, label } in /api/generate body
```

- v2 uploaded to local `data/uploads` via multer + sharp. v3 uploads directly client → Storage with the Firebase Storage SDK.
- Security rule for the photo path: `match /users/{uid}/{rest=**} { allow read, write: if request.auth.uid == uid; }` (already deployed Phase 01).
- No server-side resize. The 1080px-wide constraint is enforced client-side via a `<canvas>` resize before upload (5-line helper).
- Storage emulator is part of `firebase emulators:start` and works transparently in Path A.

### Pattern 4: Layered prompt assembly (5 layers)

Direct port of v2 `assembleSystemPrompt` at `server/routes/socialClub.ts:139-194`, with **two changes**:

1. **Pillar → Mode rename throughout.** `pillar: '1' | '2' | '3'` becomes `mode: 'create-demand' | 'convert-demand'`. All `isP1`, `isP2`, `isP3` branches collapse: `isCreateDemand` and `isConvertDemand` are the only two. Every reference to `'3'`, `pillar === '3'`, `PILLAR_FILES['3']` is deleted.
2. **Topic files → Focus Areas.** v2 hardcoded `TOPIC_FILES = { C1: 'c1-handy-weg.md', ... C9: 'c9-dranbleiben.md' }` and read disk files. v3 reads `brand.focusAreas[focusAreaId]` from Firestore and injects `<focus_area>\n${name}\n${description}\n</focus_area>` into the user message. The `topics/*.md` directory is **not ported** — focus areas are user-authored, not file-shipped.

**Layer order (preserved from v2):**
1. `output-format.md` (mode-filtered: strip P2-only / P1-only sections)
2. `base.md` (mode-filtered)
3. `product.md` (in `convert-demand` mode include full; in `create-demand` mode strip to brand name + hashtags only via `stripProductForP1`-equivalent helper, renamed `stripProductForCreateDemand`)
4. `methods/{method}-{count}.md` where `count = closestTemplateCount(slideCount)` from `[5, 7, 9, 10]`. In `convert-demand` mode, strip the slide-table + golden example via `stripMethodStructureForP2`-equivalent (rename to `stripMethodStructureForConvertDemand`).
5. `modes/{mode}.md` (renamed from `pillars/p1-create-demand.md` and `pillars/p2-convert-demand.md`), filtered by method via `filterPillarByMethod` (rename → `filterModeByMethod`).

**Caching:** retain `cache_control: { type: 'ephemeral' }` on the system prompt — the SDK accepts the same shape.

### Pattern 5: aiSnapshot immutability

The post doc on creation:
```typescript
{
  status: 'draft',
  aiSnapshot: { slides: [...], caption: '...' },   // set once, NEVER updated
  slides: [...],                                    // editable copy
  caption: '...',                                   // editable copy
  mode, method, focusAreaId, situationText,
  photoUrls: { all: 'https://...', '1': 'https://...' },
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
}
```

Editor saves only update `slides`, `caption`, `updatedAt`. Enforce via Firestore security rule:
```
match /users/{uid}/brands/{brandId}/posts/{postId} {
  allow update: if request.auth.uid == uid
                && request.resource.data.aiSnapshot == resource.data.aiSnapshot;
}
```
(This rule must be added in Phase 02, layered onto the Phase 01 strict rule set.)

### Pattern 6: Editor on Firestore (manual saves, debounced)

v2 editor talked to REST API. v3 editor:
- Reads post doc once via `getDoc(doc(db, 'users', uid, 'brands', brandId, 'posts', postId))`.
- Holds slide state in local React state.
- On every zone edit, debounces 500 ms then calls `updateDoc(...)` with `{ slides: newSlides, updatedAt: serverTimestamp() }`.
- No `onSnapshot` listener — single-user editing per post, manual saves are sufficient (locked by PLAN-SOURCE.md §138: "Firestore Realtime auch nicht nötig - manuelle Saves reichen").
- "Saved · just now" indicator wired to the debounce promise resolution.

---

## Don't Hand-Roll

| Problem | Use this instead | Reason |
|---|---|---|
| SSE parsing on the client | NDJSON via `fetch().body.getReader()` + `TextDecoder` + `split('\n')` | One concept (lines), no event-name dispatch, identical in dev and prod. v2's hand-rolled SSE parser at `socialClub.ts:454-494` had buffer-edge bugs that NDJSON sidesteps. |
| Anthropic streaming via raw `fetch` | `@anthropic-ai/sdk` `client.messages.stream()` | The SDK handles `event-stream` framing, retries, and `AbortSignal` propagation. v2's hand-rolled `getReader()` loop (socialClub.ts:447-494) had to manually buffer partial chunks and parse `data:` lines — bug surface eliminated. |
| File upload pipeline | Firebase Storage SDK (browser-direct) | Skips multer, sharp (at upload), local disk, file-cleanup cron. Storage emulator covers dev. |
| Settings CRUD endpoints | Firestore SDK from the browser | Settings are scoped to `users/{uid}/**` — security rules enforce. No `/api/settings/*` routes needed for read/write of identity, design, focusAreas, situations. The **only** server endpoint touching settings is `POST /api/settings/api-keys` (already in Phase 01) because the key has to be encrypted server-side. |
| Slide-format parser | Port v2 `parseSlidesMd` verbatim | 90 lines, well-tested (v2 has `tests/socialClubRender.test.ts` to copy alongside). The format is brittle by design (line-prefixed `BASE:`, `ACCENT:`, `BRAND:`, `DIVIDER`), changing it would invalidate every existing prompt template. |
| Levenshtein-based diff (Phase 04) | DEFERRED — not Phase 02 work | `editDiff.ts` is for the learning loop (Phase 04 per ROADMAP). Do not port in Phase 02. |
| KMS encrypt/decrypt in dev | Local stub: read `process.env.ANTHROPIC_API_KEY` from `.env` when `FIRESTORE_EMULATOR_HOST` is set | Established in Phase 01 D-11. Phase 02 inherits this — `getAnthropicKey(uid)` checks emulator mode first, falls back to KMS only in real prod. |

---

## Common Pitfalls

1. **Forgetting to delete `pillar: '3'` branches.** v2 has them in `socialClub.ts` (e.g. line 253 caption-template fallback, lines 328-334 quote captions per pillar), `fileContext.ts` (`PILLAR_CONFIGS`, `ANGLE_TARGETS`), `learningContext.ts`. Verification: `rg "['\"]3['\"]|p3-|loyalty|pillar.*3" v3/server v3/web v3/shared` must return zero hits in production code.
2. **Forgetting to delete `hooks_guidance`.** Lives in v2 `BrandIdentitySchema` (`shared/schemas/settings.ts:12`). Drop the field outright; do not migrate. Verification: `rg "hooks_guidance" v3/` must return zero hits.
3. **Forgetting to delete `styleTypes` and `layoutTemplates`.** Top-level on v2 `SettingsSchema`. Drop the imports of `StyleTypeSchema` and `LayoutTemplateSchema`. Delete `shared/schemas/{styleType,layout}.ts` if porting that directory.
4. **Letting the editor write to `aiSnapshot`.** Belt-and-suspenders: enforce in security rules (above) AND in the client save function (only include `slides`, `caption`, `updatedAt` keys in the `updateDoc` payload).
5. **NDJSON line buffering on the client.** A network chunk can split a JSON line. Standard pattern:
   ```typescript
   let buffer = ''
   for await (const chunk of reader) {
     buffer += decoder.decode(chunk, { stream: true })
     const lines = buffer.split('\n')
     buffer = lines.pop() ?? ''   // keep incomplete tail
     for (const line of lines) if (line) handle(JSON.parse(line))
   }
   ```
6. **AbortController reuse.** `AbortController` is one-shot. Create a new one per request inside the handler — never module-scope it.
7. **Anthropic model id.** v2 hardcodes `claude-opus-4-6`. Per Tim's environment "claude-opus-4-7" is current. Make the model id a constant (`server/lib/anthropic.ts: ANTHROPIC_MODEL = 'claude-opus-4-7'`), single point of update.
8. **Firestore security rule on `aiSnapshot` immutability.** The `request.resource.data.aiSnapshot == resource.data.aiSnapshot` comparison only works for primitives and shallow maps. Slides are nested arrays of objects with zones. Use `request.resource.data.aiSnapshot == resource.data.aiSnapshot` regardless — Firestore's deep equality covers nested values (verified in Firestore rules language semantics). If issues surface, fall back to `keys().hasAll(['aiSnapshot']) && resource.data.aiSnapshot != null && (request.resource.data.aiSnapshot == resource.data.aiSnapshot)`. [ASSUMED — confirm during planning by writing a Firestore rules unit test.]
9. **Photo-upload security rule wildcard.** Storage rules need `match /users/{uid}/{allPaths=**}` (note `{allPaths=**}`, not `{rest=**}` — that's the Firestore syntax). Easy to mis-copy.
10. **Anthropic key resolution race.** If the key is missing, fail fast with `throw new ApiError(412, 'Anthropic key not configured', 'NO_API_KEY')` BEFORE writing any response headers — once `res.write()` has been called, you can no longer change status codes.

---

## Code Examples (port targets)

### v2 → v3 file map (the 5 must-port artifacts)

| # | v2 source | v3 target | Lines | Notes |
|---|---|---|---|---|
| 1 | `C:\webprojects\content-generation\server\services\socialClubRender.ts` (lines 103-300, `parseSlidesMd` + types) | `C:\webprojects\content-generation-v3\shared\lib\parseSlidesMd.ts` (parser only, types in `shared/types/slide.ts`) | ~200 | Pure function, no server deps. Move to `shared/` so editor can re-parse if needed. Drop the `escapeHtml` import — that belongs in render service (Phase 03). |
| 2 | `C:\webprojects\content-generation\server\routes\socialClub.ts` lines 36-247 (assembly + filter helpers + `assembleSystemPrompt`) | `C:\webprojects\content-generation-v3\server\lib\assembleSystemPrompt.ts` | ~210 | Apply Pillar→Mode rename. Drop `TOPIC_FILES`, `loadTopicContent`, `stripTopicForP1`, `stripTopicHinweis`. Inject focus area from Firestore at call site instead. |
| 3 | `C:\webprojects\content-generation\server\prompts\social-club\` (`base.md`, `output-format.md`, `product.md`, `methods/*.md`, `pillars/p1-create-demand.md`, `pillars/p2-convert-demand.md`) | `C:\webprojects\content-generation-v3\server\prompts\` (`base.md`, `output-format.md`, `product.md`, `methods/*.md`, `modes/create-demand.md`, `modes/convert-demand.md`) | ~16 files | **Do NOT port:** `pillars/p3-loyalty-nurture.md`, all `topics/*.md`, `MAPPING.md` (rewrite a thinner one for the new mode/method matrix). The `methods/zitat-*.md` files are needed because Zitat is a real method. |
| 4 | `C:\webprojects\content-generation\client\src\components\social-club\ZoneCanvas.tsx` (297 lines) | `C:\webprojects\content-generation-v3\web\src\components\editor\ZoneCanvas.tsx` | 297 | Port verbatim. Replace `import type { Zone, SocialSlide, Format } from './types'` source with `@shared/types/slide`. The `imageUrl` field in v3 is a Firebase Storage download URL (https://...) — `backgroundImage: url(...)` works without change. |
| 5 | `C:\webprojects\content-generation\client\src\components\social-club\SlidePanel.tsx` (276) + `ZonePanel.tsx` (324) | `C:\webprojects\content-generation-v3\web\src\components\editor\{SlidePanel,ZonePanel}.tsx` | 600 | Port verbatim. Replace any `/api/social-club/render-slide` call (Phase 03 will add `/api/render-jobs` instead — Phase 02 editor preview can render-on-the-client via `<canvas>` or simply omit live PNG preview, defer to Phase 03). |

### Generate request → Firestore write sequence

```
Client                                Server                          Firestore                Anthropic
  | --- POST /api/generate -------->  |
  |                                   | requireAuth (Phase 01)
  |                                   | parse body (zod)
  |                                   | getDoc(brand)              -->|
  |                                   |<-- brand settings ---------- |
  |                                   | getDoc(focusArea, situation if id)
  |                                   | getAnthropicKey(uid)          (emulator: env, prod: KMS)
  |                                   | assembleSystemPrompt(...)
  |                                   | anthropic.messages.stream() ----> open stream
  |                                   |<------ deltas ------------------ |
  | <-- {type:'chunk',text:'...'}\n - |                                  |
  | ...                               |                                  |
  |                                   | full text assembled              |
  |                                   | parseSlidesMd(text)              |
  |                                   | addDoc(posts, {                  |
  |                                   |   status:'draft',                |
  |                                   |   aiSnapshot:{slides,caption},   |
  |                                   |   slides, caption, mode, ...     |
  |                                   | })                            -->|
  |                                   |<-- postId ------------------- |
  | <-- {type:'complete',postId,..}\n-|
  | navigate /create/{postId}         |
  | onSnapshot(post)                  | (no longer needed — client navigated)
```

### Settings page write (no server)

```typescript
// web/src/pages/settings/IdentityPage.tsx
const save = async (identity: BrandIdentity) => {
  const ref = doc(db, 'users', uid, 'brands', activeBrandId)
  await updateDoc(ref, { identity, updatedAt: serverTimestamp() })
}
```

### Photo upload (browser → Storage, no server)

```typescript
// web/src/lib/uploadPhoto.ts
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

export async function uploadPhoto(file: File, uid: string, brandId: string): Promise<string> {
  const resized = await resizeToMaxWidth(file, 1080)   // <canvas> helper, ~20 lines
  const storageRef = ref(storage, `users/${uid}/brands/${brandId}/photos/${crypto.randomUUID()}.jpg`)
  await uploadBytes(storageRef, resized, { contentType: 'image/jpeg' })
  return await getDownloadURL(storageRef)
}
```

---

## v2 Reference Index (read-only)

The planner can `Read` these v2 files directly when specifying ports:

- **Parser & types:** `C:\webprojects\content-generation\server\services\socialClubRender.ts` (lines 1-300 for parser + types; lines 557-750 for HTML builders → those go to Phase 03 render service, NOT Phase 02).
- **Prompt assembly:** `C:\webprojects\content-generation\server\routes\socialClub.ts` lines 36-247.
- **Prompt files:** `C:\webprojects\content-generation\server\prompts\social-club\` (full directory, see file map above for what to drop).
- **Zone editor components:** `C:\webprojects\content-generation\client\src\components\social-club\{ZoneCanvas,SlidePanel,ZonePanel}.tsx`.
- **Editor types:** `C:\webprojects\content-generation\client\src\components\social-club\types.ts` (Zone, SocialSlide, Format, FORMAT_HEIGHTS, REF_W).
- **v2 settings schema (for what to drop):** `C:\webprojects\content-generation\shared\schemas\settings.ts`.
- **v2 generate handler (for the abort + stream pattern, even though v3 changes the transport):** `C:\webprojects\content-generation\server\routes\socialClub.ts:315-500`.
- **Edit-diff (DEFERRED — Phase 04 only):** `C:\webprojects\content-generation\server\services\editDiff.ts`.

---

## Open Questions (need Tim's input before planning)

1. **Editor preview strategy in Phase 02.** The Phase 03 plan owns `/api/render-jobs` (Cloud Tasks → Playwright). In Phase 02, after generation, the editor needs to *display* slides. Three options:
   - **(a)** Show a CSS-only preview rendered from zone data (no PNG). Cheapest, parity with editing experience, no Playwright in Phase 02. Recommendation.
   - **(b)** Render PNGs in the browser via `html2canvas`. Adds a dep, font-loading is brittle.
   - **(c)** Defer the entire editor preview to Phase 03 (Phase 02 editor only edits, no visual). Risky for verifiability of "Editing a zone saves and survives reload."

   **Claude's recommendation: (a).** The CSS that ZoneCanvas already uses for absolute-positioned `<div>`s on a background-image-set parent is the preview. Tim — confirm or override.

2. **Anthropic SDK version pin.** `@anthropic-ai/sdk` is on rapid release. Pin to a specific minor (e.g. `^0.32.0`) or float? Recommendation: pin to the latest stable as of plan time, capture the exact version in `01-RESEARCH.md`-equivalent for Phase 02. Tim — confirm approach.

3. **Where do `methods/zitat-*.md` files apply mode filters?** v2 had a special case (`if (body.method === 'Zitat')` short-circuited Claude entirely and constructed slides directly from `situation` + `author`). v3 should keep this short-circuit (it's correct: a quote slide doesn't need Claude). The `convert-demand` vs `create-demand` caption text differs — v2 had three branches (P1/P2/P3); v3 needs two. Tim — confirm the two-branch caption copy can be authored at plan time, or do you want it left for execution?

4. **`MethodSchema.format` field.** v2 had `format: 'single' | 'carousel' | 'both'` for methods. Phase 02 reduced settings — is method still user-configurable in Brand Settings, or is it a hardcoded set (`['Story', 'Liste', 'Vorher/Nachher', 'Zitat']`)?
   - PLAN-SOURCE.md keeps `MethodSchema` (line 988).
   - But there's no Brand Settings page for methods in the reduced UI list (Identity, Design, Focus Areas, Library/Situations only).
   - Recommendation: hardcode the four methods as a constant in `shared/lib/methods.ts`. Drop `MethodSchema` and `methods` from any settings page. Tim — confirm.

5. **Situations: per-brand or per-user?** v2 had `situations` as a brand-scoped library. v3 ROADMAP says BRAND-04 ("create situations"), implying brand-scoped. Path proposed: `users/{uid}/brands/{brandId}/situations/{sitId}`. Tim — confirm scope.

6. **Photo "pool" vs single-generation upload (CREATE-02).** Requirement says "User can upload photos for a single generation OR pick from persistent brand photo pool". The persistent pool implies a separate Firebase Storage prefix and a Firestore index. Scope question: implement the pool in Phase 02, or ship single-generation upload only and defer the pool?
   - Recommendation: ship single-generation upload only. The pool needs UI (gallery, delete, label). Defer to Phase 04 polish. Tim — confirm or override.

7. **Server route for post-doc creation.** Two options:
   - **(a)** Server creates the post doc inside `/api/generate` after parsing (sketched above). Atomic, but couples generate + persist.
   - **(b)** Client creates the post doc after receiving the `complete` chunk. More client logic, but `/api/generate` stays a pure stream-and-parse.

   **Claude's recommendation: (a).** Server-side creation guarantees `aiSnapshot` is set before any client sees the data, which is the invariant CREATE-04 actually requires. Tim — confirm.

---

## Confidence Summary

| Area | Confidence | Why |
|---|---|---|
| v2 file paths and signatures | HIGH | Read directly from v2 source. |
| Schema reduction targets | HIGH | Locked by user directive + ROADMAP success criteria #5. |
| NDJSON over SSE | HIGH | Locked by user directive. |
| `@anthropic-ai/sdk` adoption | MEDIUM | Locked recommendation; package not yet installed in v3. Planner should add to install task. |
| Photo upload via browser → Storage | HIGH | Standard Firebase pattern; Storage rules exist Phase 01. |
| Editor on Firestore (manual saves) | HIGH | Locked by PLAN-SOURCE.md §138. |
| `aiSnapshot` immutability rule | MEDIUM | Rule syntax verified mentally; needs a Firestore rules unit test in execution to prove deep-equality on nested arrays works. Flagged in Pitfalls. |
| Phase 02 editor preview strategy | LOW | Open Question #1 — needs Tim. |
| Pool vs single-shot photo upload | LOW | Open Question #6 — needs Tim. |

---

*Phase: 02-brand-settings-create*
*Research conducted: 2026-04-27*
*Path A (emulator-only) constraints applied throughout.*
