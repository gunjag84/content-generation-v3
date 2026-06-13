# Project Plan - Content-Generation v3

Single source of truth for **scope and direction**. Operational state (deploy anchors, locked patterns, deploy quirks, NDJSON shapes, requirements traceability) lives in `STATE.md`. Architecture/ADRs/full spec live in `~/.claude/plans/modular-tumbling-sunrise.md` (v6 ISSUES_CLOSED 2026-04-26, historical reference).

Last updated: 2026-05-20.

---

## MVP Finalization — LOCKED 2026-05-20 (CEO review complete)

Mode: SCOPE EXPANSION (Tim picked Envelope C: full editor revamp before cutover). 7 cherry-pick decisions locked in interactive CEO review. Ready for /plan-eng-review + /plan-design-review.

### A. Phase 5 Cutover (LOCKED)

| ID | Item |
|----|------|
| A1 | Tim + Jule fresh LEBEN.LIEBEN onboarding on prod |
| A2 | First real test-post E2E: Generate -> Edit -> Schedule now+5min -> verify on @leben.lieben |
| A3 | Old `content-generation` repo README points at v3; `v3-rewrite` branch retired |

### B. Preview Edit Logic Revamp (LOCKED — all 4)

| ID | Item | Notes |
|----|------|-------|
| B1 | In-canvas inline text editing | Click text in preview to edit; currently rail-only |
| B2 | Drag/resize/snap/guides (single-zone) | Snap-to-grid + alignment guides for single-zone select. Multi-select dropped per eng review D5 (defer to v1.1 if Jule asks). |
| B3 | Full undo/redo history | Action-replay or snapshot stack — eng review decides. Cmd+Z native |
| B4 | Photo default-fit + zoom/pan | Port verbatim from v2 pattern (`learnings/general.md` "CSS default-fit + user-zoom") |

### C. Day-1 Risk Fixes (LOCKED — all 3)

| ID | Item | Pri |
|----|------|-----|
| C1 | Automate SA-pin post `firebase deploy` (KMS invoker reset) | H |
| C2 | Wire `resignIfExpiring` into render-job completion handler | H |
| C3 | "Reset to AI version" button as failsafe alongside B3 full undo | H |

### D. Polish & Scope Expansions (LOCKED via cherry-picks)

| ID | Item | Pri | Decision |
|----|------|-----|----------|
| D1 | Calendar: basic read-only month view (NOT "hide nav") | M | EXPANDED (D2 cherry-pick: bring in basic month view) |
| D2 | Touch responsive: read-only on touch, edit on desktop only | M | LOCKED (D3 cherry-pick: capability boundary) |
| D3 | Phase 4c wedge (auto-perf from 94 v2 posts) | - | DEFERRED to N>=20 Jule posts (D4 cherry-pick) |
| D4 | Keyboard shortcuts pack (Cmd+Z/S/D, arrow nudge, Del) | M | LOCKED (D5 cherry-pick) |
| D5 | AI "rewrite this slide" button (Haiku variants) | - | DEFERRED to v1.1 (D6 cherry-pick: data-driven scope post-cutover) |
| D6 | Slide reorder DnD + schedule conflict detection | M | LOCKED (D7 cherry-pick: editor safety) |
| D7 | Posts tab bar dark-theme alignment | M | LOCKED (audit) |
| D8 | `STATE.md:112` traceability cleanup (POLISH-01..02 -> "Live") | M | LOCKED (audit) |
| D9 | Centralize `GRAPH_VERSION='v21.0'` (4 sites -> 1 const) | M | LOCKED (audit) |
| D10 | Extract `useAutoGrow` hook (ZoneCanvas + SlideThumbnail) | M | LOCKED (audit) |
| D11 | Remove stale `auth.ts:4-5` placeholder-email comment | M | LOCKED (audit) |
| D12 | Fix `Create.tsx:183` boolean-coercion JSX | L | LOCKED (audit) |
| D13 | Add deps array to `ZoneCanvas.tsx:183` `useLayoutEffect` | L | LOCKED (audit) |

### CEO Review Decisions (audit trail)

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| D1 | Scope envelope (A/B/C) | **C: Full editor revamp** | Ship 12-month-ideal editor at v1, not v1.5 vapor |
| D2 | Calendar interactive view | **Basic read-only month view** | Replace dead "Coming soon" link with useful surface; DnD reschedule = v1.1 |
| D3 | Mobile/iPad editor | **Touch read-only, edit on desktop** | Honest capability boundary; matches Jule's actual workflow |
| D4 | Phase 4c wedge from 94 v2 posts | **Defer to N>=20** | Avoid teaching model Tim-voice; clean signal from Jule-authored posts |
| D5 | Keyboard shortcuts pack | **Add (Cmd+Z/S/D, arrows, Del)** | Cheapest delight in list; couples natively with B3 undo |
| D6 | AI "rewrite slide" button | **Defer to v1.1** | Data-driven: see what Jule actually rewrites before building the button |
| D7 | Slide reorder + schedule conflict | **Add both** | Day-1 safety nets (data integrity + workflow footgun) |

### Items explicitly NOT in scope (deferred / rejected)

- Photo-as-zone refactor (per-zone `photoTransform` override path live in render) — deferred to v1.1. Schema + helper + tests exist forward-compat; activation requires image-typed zones (currently zones are text-only and photos render at slide-level via PhotoEditModal). R2 architecture-drift audit acknowledged 2026-05-21; ZoneCanvas has inline comment explaining the deferral.
- AI rewrite-slide button (revisit after 5+ Jule posts)
- Phase 4c auto-perf learning seed from v2 posts (revisit at N>=20)
- Drag-and-drop calendar reschedule (revisit after 1 month real use)
- Full touch-editor (revisit if Jule actually buys iPad Pro for content work)
- Cmd+K command palette (Linear-class polish — out of cutover scope)
- Preview slideshow mode, auto alt-text, brand color extractor (delight, not MVP)
- Real-time multi-user collab (Posts are user-scoped per existing plan)
- Pattern visibility UI (learning is invisible by design)

### Architecture decisions LOCKED 2026-05-20 (/plan-eng-review)

1. **Undo data model** — Snapshot-array, cap 50. `structuredClone` per push. In-memory only.
2. **Inline text edit primitive** — Positioned `<textarea>` overlay. Mirror font/size/lineHeight/color exactly. Hide rendered text during edit.
3. **Photo pan/zoom persistence schema** — Hybrid: per-photo defaults (`brand.photoTransforms[photoId]`) + per-zone override (`slide.zones[i].photoTransform`). Zone override wins precedence. Missing fields default to `{x:50%, y:50%, scale:1, rotation:0}`.
4. **Undo vs. auto-save interaction** — In-memory undo, independent auto-save, last-write-wins. Multi-tab race documented as known limitation (already exists today).
5. **Multi-select drag semantics** — DROPPED from MVP. Single-zone select + drag only. Multi-select deferred to v1.1 if Jule asks. B2 scope reduced accordingly.

### Design decisions LOCKED 2026-05-20 (/plan-design-review)

| # | Feature | Decision |
|---|---------|----------|
| D1 | B1 inline text edit affordance | Text-cursor on hover; single-click selects zone; **double-click enters edit mode**. ESC or click-outside commits + exits. First-session tip in onboarding. **OVERRIDDEN 2026-06-13 (Tim):** single-click now enters edit mode directly (text editing is the primary action); a body press becomes a drag only past a 4px threshold, so press+drag still moves. Resize/rotate handles via ESC-then-handle. Persistent "Hilfsraster" grid + toggle removed — snap grid + alignment guides show only during an active drag. |
| D2 | B2 drag/resize/snap visuals | **Cyan dashed snap-grid + pink solid alignment guides**, DURING drag only. Both vanish on drop. Drag/resize handles: 4 corners + 4 edges, visible only when zone selected. |
| D3 | B3 undo/redo affordance | **Both keyboard (Cmd+Z / Cmd+Shift+Z) + visible toolbar buttons (↶ ↷)** with tooltips. Buttons disabled when stack empty/full. |
| D4 | B4 photo zoom/pan controls | **Modal photo-edit mode**. Click "Edit photo" in SlidePanel → enters mode with zoom slider + drag-to-pan + Done button. ESC or Done exits. Mode-state UI indicator visible. |
| D5 | Calendar (D1) layout | **7-col month grid** (Mon-Sun, 5-6 rows, zinc-800 cells, zinc-700 borders). State dots: zinc-400 (draft), cyan-400 (scheduled), green-500 (published). Empty: "Noch keine Posts geplant. Erstelle deinen ersten Post." + button → /create. Nav: ‹ › chevrons + click month-year header for picker. |
| D6 | Keyboard shortcut discoverability | **Tooltips on toolbar buttons** (showing shortcut, e.g., "Save (Cmd+S)") + **Cmd+/ opens cheatsheet modal** listing all shortcuts. No onboarding toast. |
| D7 | Slide reorder + conflict UX | **6-dot drag handle** (⋮⋮ grip-vertical icon) visible on hover in SlideStrip. **Conflict modal copy**: "Du hast bereits einen Post am [datetime] geplant. Trotzdem speichern?" + "Trotzdem speichern" (yellow) + "Abbrechen". |
| D8 | C3 "Reset to AI version" button | Lives in **right-rail SlidePanel** (with slide-level actions). **Yellow** button (matches conflict-override yellow, not red-destructive). **Modal copy**: "Auf KI-Version zurücksetzen? Deine manuellen Änderungen gehen verloren." + "Zurücksetzen" (yellow) + "Abbrechen". |

### Theme conventions (LOCKED)

- Existing zinc-dark theme is the source-of-truth. New components inherit `bg-zinc-900` / `border-zinc-700` / `text-zinc-100`.
- Accent colors:
  - **Primary (Save, Publish)**: blue-500 (existing)
  - **Caution (Reset to AI, Override conflict)**: yellow-500
  - **Snap-grid lines**: cyan-400 dashed
  - **Alignment guides**: pink-500 solid
  - **State dots**: zinc-400 (draft), cyan-400 (scheduled), green-500 (published)
- All new copy in German (Du-form, no Predigerton, no em dashes).
- D7 (Posts tab dark-theme alignment): replace `bg-white / text-indigo-600` with `bg-zinc-900 / text-cyan-400` to match.
- Post-MVP: extract DESIGN.md from these patterns via `/design-consultation` (added to backlog).

### Executable Task Table (for /dev-engineer)

Status legend: `pending` | `in-progress` | `done` | `failed` | `blocked`

| ID  | Title | Deps | Model | Verify | Status |
|-----|-------|------|-------|--------|--------|
| D7  | Posts tab dark-theme alignment | - | sonnet | `grep -E "bg-white\|text-indigo-600" web/src/routes/posts/PostsLayout.tsx` exits 1 | done |
| D8  | STATE.md POLISH-01..02 -> Live | - | sonnet | `grep -E "POLISH-01\.\.02.*Pending" STATE.md` exits 1 | done |
| D9  | GRAPH_VERSION centralize to graphConstants.ts | - | sonnet | new `server/lib/graphConstants.ts` exists; `grep -rE "v21\.0\|v22\.0" server/ web/` shows only that one file | done |
| D10 | useAutoGrow hook extract | - | sonnet | `web/src/hooks/useAutoGrow.ts` exists; both `ZoneCanvas.tsx` + `SlideStrip.tsx` import it | done |
| D11 | auth.ts stale placeholder comment | - | sonnet | `grep "Replace placeholder emails" server/middleware/auth.ts` exits 1 | done |
| D12 | Create.tsx JSX boolean-coercion fix | - | sonnet | `grep "streamText.length > 0" web/src/routes/Create.tsx` exits 0 | done |
| D13 | ZoneCanvas useLayoutEffect deps | - | sonnet | `useLayoutEffect` line in ZoneCanvas.tsx has dependency array `[slide.zones]` | done |
| C1  | SA-pin deploy automation script | - | sonnet | `scripts/deploy-functions.sh` exists, `bash -n` passes; package.json has `deploy:fns` script | done |
| C2  | Wire resignIfExpiring into publish path | - | opus | `grep resignIfExpiring server/lib/publishOnePost.ts` exits 0 | done |
| D1  | Calendar basic month view | - | opus | `web/src/routes/Calendar.tsx` + `web/src/components/calendar/MonthGrid.tsx` exist; `pnpm tsc --noEmit` clean | done |
| D6  | Slide reorder DnD + schedule-conflict modal | - | opus | reorder handler in SlideStrip.tsx; ConflictModal component exists | done |
| B3  | Undo/redo hook (snapshot, cap 50) | - | opus | `web/src/hooks/useUndoStack.ts` exists; unit test push-50 + undo-50 passes | done |
| B4  | Photo transform schema + modal UI | D10 | opus | `photoTransform` field in shared/types/slide.ts; photo-edit modal in SlidePanel | done |
| B1  | Inline text edit (textarea overlay) | D10 | opus | `web/src/components/editor/InlineTextEditor.tsx` exists; double-click + ESC + blur paths covered | done |
| B2  | Single-zone snap-grid + alignment guides | D10, D13 | opus | `SnapGrid.tsx` + `AlignmentGuides.tsx` exist; render during drag only | done |
| D4  | Keyboard shortcuts + Cmd+/ cheatsheet | B3 | opus | `useKeyboardShortcuts.ts` + `KeyboardCheatsheet.tsx` exist; Cmd+Z + Cmd+/ wired | done |
| C3  | Reset-to-AI button + confirm modal | B3 | opus | yellow button in SlidePanel.tsx with German confirm modal | done |
| A1  | Onboarding doc + Tim/Jule fresh setup | B*, C*, D1, D4, D6 | sonnet | `docs/ONBOARDING.md` exists; manual Tim+Jule verification | doc done; manual gate pending |
| A2  | E2E test-post on @leben.lieben | A1 | manual | post live + verified visually on IG | pending (Tim manual; brand publish-ready — IG sync live, Meta token + instagramUserId valid) |
| A3  | Repo README repoint + branch retire | A2 | sonnet | old repo README points at v3 | **done** 2026-06-13 (README on old repo `main` commit 279b0ab; v3-rewrite branch left in place per Tim — carries 1 unique commit + WIP, not worth deleting) |
| B1+ | Rich-text per-span formatting (B1 expansion) | B1 | opus | select text -> color/font/size/weight/italic applies to that run only | **done** 2026-06-13 (commit 682e9cc, rev content-gen-00030-4h2, live-verified end-to-end) |

### Test scope (LOCKED, /plan-eng-review)

Comprehensive on behavior + critical edges per feature. Each new feature: happy path + 1-2 failure paths + 1 boundary case. Test file layout mirrors `web/src/`. ~+1-1.5 days of test-writing alongside implementation. Approved test surfaces:

| Feature | Test surfaces |
|---------|---------------|
| B1 inline text edit | Enter to commit + Esc to cancel + blur-to-commit + font matching + multi-line auto-grow |
| B2 drag/snap (single-zone) | Snap-to-grid math + alignment guide visibility + zone-near-edge boundary |
| B3 undo (snapshot model) | Push + undo + redo + cap-at-50 + undo-after-redo edge + deep-clone reference safety |
| B4 photo transform | Default fit + pan + zoom + per-photo default applied + per-zone override wins + missing-fields default |
| Calendar (D1) | Month grid layout + post markers at correct date + click-to-open + empty month |
| Keyboard shortcuts (D4) | Cmd+Z fires undo + Cmd+S fires save + arrows nudge selected + Del removes selected + no-fire when input focused |
| Reorder + conflict (D6) | Reorder updates slide order + conflict detects same-minute booking + override path |
| C2 resignIfExpiring | Expiry detected within 7 days + signed-URL renewed + idempotent re-call |
| C1 SA-pin deploy | Post-deploy script binds invoker + verify command returns clean |

---

## Goal / North-Star

A non-technical user (Tim or Jule) signs in, manages their own brands, generates Instagram carousels via Claude, edits in a zone editor, schedules/publishes to IG, and lets the app silently learn from their edits to improve future first-shots — all from any browser, with first-shot quality measurably improving over time.

Tier-0 (Handover-Critical): Jule must be able to operate LEBEN.LIEBEN cloud-only without a local dev install. Until v3 cutover lands, Tier-2 handover of LEBEN.LIEBEN is blocked.

---

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1. Foundation & Infrastructure | GCP/Firebase project, Cloud Run + Tasks + Scheduler + KMS, Auth shell | Live |
| 2. Brand Settings & Create | Settings schema, Focus Areas, generate streaming, zone editor on Firestore | Live |
| 3. Render & Posts | Async render via Cloud Tasks, 3-tab Posts page, Schedule + Publish workers | Live |
| 4a. Silent Edit-Diff Learning Loop | Edit-diff -> learnedPatterns -> prompt injection, Haiku audit, promotion approval UI, brand.identity wiring | Live (deployed `content-gen-00013-ctz`) |
| 4b. Performance Dashboard + Polish | Read-only igStats display, edit hot-spots widget, dashboard widgets, per-post IG analytics in History, format-aware Playwright render with brand fonts, IG container polling against code 9007 | Live (deployed `content-gen-00021-9r9`) |
| 4c. Automated Performance Learning | Auto-extract patterns from top-performing posts | Deferred (revisit at N>=20 publishes) |
| 5. Cutover | Final security rules, fresh-start onboarding for Tim + Jule, first real post on @leben.lieben | In progress |

---

## Current Phase + Next Step

**Phase 5 - Cutover.** Kill-switch trip-test passed E2E (2026-05-07); igFeedSync deployed; LEBEN.LIEBEN brand fresh-onboarded with 94 organic IG posts synced.

**Next steps to close Phase 5:**
1. Tim + Jule each complete fresh onboarding for LEBEN.LIEBEN brand on prod. (Brand is live with 100 synced IG posts; onboarding largely done.)
2. **A2 (only remaining gate):** First real test-post end-to-end: Generate -> Edit -> Schedule `now+5min` -> verify on @leben.lieben. Brand is publish-ready (IG sync runs, Meta token + instagramUserId valid). Tim drives generate+publish (content judgment on the real public account).
3. ~~Old `content-generation` repo README points at v3; `v3-rewrite` branch retired.~~ **A3 done 2026-06-13** (README on old repo `main`; v3-rewrite branch left in place per Tim).

After A2 passes, Phase 5 closes and Tier-2 handover of LEBEN.LIEBEN to Jule unblocks.

**Post-MVP shipped 2026-06-13** (all live-verified in browser, Cloud Run rev `content-gen-00031-89b`):
1. Rich-text per-span formatting (B1 expansion) — `Zone.text` is `string | TextSpan[]`; select text in the inline editor and apply color/font/size/weight/italic to that run only. Editor + server render + learning-diff paths all union-safe.
2. Color picker applies to the active selection, not the whole zone (non-destructive `captureSelection` so the 2-step popover keeps the word selection).
3. Editor interaction: single-click a text zone enters inline edit (was double-click); body press becomes a drag only past a 4px threshold; persistent grid + toggle removed, snap grid + alignment guides show only during drag; resize via ESC-then-handle. (Overrides locked design D1.)
4. Default slide appearance ported from v2 (`parsedSlidesToZones.ts`) to match the live @leben.lieben IG carousels: Josefin Sans weight 100 white body, Daniel handwritten #f59e0b accent, per-type lineHeight/letterSpacing, photo/overlay slides default 70% black legibility gradient. `linesToZones.ts` + `parseSlidesMd.ts` + `buildManualCarousel.ts`.
5. Per-word font-size: replaced the fiddly `<input type=number>` with a clean ▲/▼ stepper (`SizeStepper`). The arrow `<button>`s `preventDefault` on mousedown so the inline editor keeps focus (no commit/exit); each step reads the selection's current rendered size (`getActiveSelectionFontSizePx`) and applies it to the selection (cumulative), falling back to the zone with no selection. Also hardened `handleBlur` for the `relatedTarget=null` number-input case.
6. Auto-switch the right rail to Zones on any non-collapsed text selection inside the inline editor (document `selectionchange` listener in `Editor.tsx`), so per-selection format controls are reachable.

---

## Open Decisions

None right now. Architectural decisions are locked (see `STATE.md` "Locked Architectural Decisions").

---

## Out-of-Scope

| Item | Reason |
|------|--------|
| `cache_control: ephemeral` on system message | SDK 0.32.1 stable doesn't expose it; revisit when SDK adds the type or move to beta endpoint |
| Inline photo upload from SlidePanel side rail | Pool management lives in `/settings/photos` (Q6 lock) |
| Browser pool in render service | `concurrency=1` makes pooling pointless; per-request Chromium launch |
| v2 SQLite data migration | Fresh start in Firestore; both users re-onboard the LEBEN.LIEBEN brand |
| Staging environment | 2-user internal use; $20/$40 budget cap + kill switch covers cost risk |
| Public sign-up funnel | Hardcoded allowlist in `requireAuth` (Tim + Jule only) |
| LearningDashboardPage | Learning runs invisibly; optional `/learning` debug page only (Tim-only) |
| Pillar P3 (Loyalty/Nurture) | Removed; only `create-demand` + `convert-demand` remain |
| Style Types / Layout Templates / Strategy / Hooks Guidance pages | Removed entirely from settings schema |
| Real-time multi-user collab on a single post | Posts are user-scoped; no shared editing |
| Drag-and-drop reschedule | Calendar basic month view is shipped (D1); only drag-and-drop reschedule remains out-of-scope |
| Pattern visibility UI | Learning is invisible by design (LEARN-V2-* future) |

---

## Remaining Work (Phase 4c + 5 detail)

### Phase 4c: Automated Performance Learning (DEFERRED)

**Trigger to revisit:** when N>=20 published posts exist with igStats, OR Tim explicitly requests earlier.

**Sketch (not built):** Cloud Function reads top-N posts by engagement_rate, Claude Haiku extracts qualitative themes (high-performing hook patterns, CTA patterns), writes to a separate `performancePatterns` sub-collection, injected into prompt as `<performance_patterns>` block alongside `<learned_patterns>`. Same injection mechanism, different signal source.

### Phase 5: Cutover

**Plan:**
- Final-build + deploy: `pnpm build:web` -> `firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting` + `gcloud run deploy content-gen --source=.`
- Pub/Sub trip-test: `gcloud pubsub topics publish budget-alerts --message='{"costAmount":40,"budgetAmount":40}'` -> killSwitch flips -> 503 on `/api/*` -> re-seed via `seed-killswitch.sh`. (Done 2026-05-07.)
- Tim: sign-in on prod URL, Anthropic key, real LEBEN.LIEBEN brand + identity fields.
- Jule sign-in ceremony, her brand setup.
- First real test-post: Generate -> Edit -> Schedule for `now+5min` -> wait -> IG post live on @leben.lieben.

**Success criteria:**
1. Final Firestore security rules block any cross-user read/write attempt.
2. Tim and Jule each complete onboarding for the LEBEN.LIEBEN brand from scratch.
3. Post generated, edited, scheduled, published on @leben.lieben via v3.
4. Old `content-generation` repo README points at v3; `v3-rewrite` branch retired.

---

## Pending TODOs (Tim, manual)

- Phase 2 prod smoke: sign-in -> /settings/photos upload -> /create generate (story + zitat paths) -> /editor edits persist with `aiSnapshot` byte-identical; cancel-before-complete = no post doc.
- Phase 3 user-facing prod smoke: /create -> /editor render -> /posts schedule + publish.
- Meta Graph token + `instagramUserId` per Brand: UI exists; manual Firestore-Console fallback also possible.
- LEBEN.LIEBEN-Brand fresh setup für Cutover.

## Pending TODOs (backlog)

- Vitest harness for web package (streamGenerate trailing-byte test + saveDraftDebounced no-aiSnapshot test).
- aiSnapshot mutation rules-deny test (rule itself is live since 02-01).
- Re-sign helper for >7-day signed Storage URLs.

---

## Risks (Phase 4 + 5)

| Risk | Mitigation |
|------|------------|
| Learning-loop pattern extract returns invalid JSON | Zod schema validation; on failure 1 retry with explicit JSON-only re-prompt; then store with `parse_failed` flag |
| Anthropic spend during E2E tests | E2E doc uses 1-2 generates total, no volume tests |
| Token theft in worst-case window before $40 budget alert | 2FA on Tim's Google account (out-of-scope for plan, hard-recommended) |
| Stale `publishing` lock from worker crash | Collection-group sweep recovers >10min locks to `scheduled` |

## Recent Runs

- 2026-05-08 20:28 T1-web-vitest-harness [success] 7m55s $0.920 — Done. Here's what was built:  **Installation** — `pnpm install --ignore-workspace` from `web/` installed vitest 2.1.9...
- 2026-05-08 20:38 T2-aisnapshot-rules-deny-test [success] 17m54s $2.881 — Marker created. Here is the full summary:  ---  ## T2 outcome: test written, security rules bug discovered  ### What ...
- 2026-05-08 20:43 T3-resign-storage-helper [success] 3m19s $0.668 — Done. Two files produced:  **`server/lib/resignSlides.ts`** - `parseSignedUrlExpiry(url)` — extracts expiry from a GC...
