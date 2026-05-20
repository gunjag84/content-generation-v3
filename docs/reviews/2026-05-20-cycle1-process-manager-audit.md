# Process-Manager Audit -- 2026-05-20 Cycle 1

**Branch:** master @ e83d317
**Auditor:** process-manager lens
**Prior audits:** none (first cycle)

---

## Verdict

PARTIAL -- 1 schema gap, 5 test surfaces missing, 1 convention violation in user-visible copy, 1 D9 partial fix.

---

## Findings

### 1. Test coverage gap -- B1, B2, B4, D1, D4, D6 have zero test files (9/10)

Plan (PROJECT-PLAN.md:141-154) mandates "each new feature: happy path + 1-2 failure paths + 1 boundary case" for B1 inline text edit, B2 drag/snap, B4 photo transform, Calendar (D1), Keyboard shortcuts (D4), and Reorder+conflict (D6). Only B3 (useUndoStack) has tests (`web/src/hooks/__tests__/useUndoStack.test.ts`, 5 cases including deep-clone reference safety). No test files exist for any other new feature. `snapMath.ts` (133 lines of snap math) has no unit tests despite being the most boundary-case-dense new module.

### 2. D9 partial fix -- GRAPH_VERSION still duplicated (7/10)

Plan: "new `server/lib/graphConstants.ts` exists; `grep -rE "v21\.0|v22\.0" server/ web/` shows only that one file." Reality: `server/functions/graphApi.ts:10` exports its own `GRAPH_VERSION = 'v22.0'`. Comment at line 7-8 acknowledges the duplicate and says "update both files" when bumping. This is a deliberate structural bypass documented inline, not a silently-drifting copy -- but the plan's acceptance criterion is unmet. Risk: version skew if bumped in one place only.

### 3. Em-dash in user-visible JSX copy (6/10)

`web/src/components/editor/SlidePanel.tsx:310`:
```
CTA slide — uploads add to the brand pool for use on photo/overlay slides.
```
This renders as visible UI text (tooltip/label div). All other em-dashes in the new files are in code comments (non-user-facing) and are low-risk. This one violates the hard "no em-dash" convention in user-facing copy.

### 4. D10 wiring mismatch vs. plan verify condition (5/10)

Plan Executable Task Table says verify: "both `ZoneCanvas.tsx` + `SlideStrip.tsx` import it [useAutoGrow]." `ZoneCanvas.tsx` imports and uses `useAutoGrow`. `SlideStrip.tsx` does NOT import `useAutoGrow` -- it imports `SlideThumbnail` from ZoneCanvas (which internally calls `useAutoGrow`). Commit message says "SlideThumbnail dedup" not "SlideStrip dedup." The dedup is real and correct; the plan verify condition was imprecise. Functional gap: zero. Documentation gap: plan criterion unmet as written.

### 5. D13 not verifiable in ZoneCanvas directly (4/10)

Plan verify: "`useLayoutEffect` line in ZoneCanvas.tsx has dependency array `[slide.zones]`." `useLayoutEffect` is now inside `useAutoGrow` hook, not ZoneCanvas directly. Grep on ZoneCanvas finds no `useLayoutEffect` call. The extract is correct per D10, but the D13 verify condition now needs re-targeting to `useAutoGrow.ts`.

### 6. No scope creep detected (pass)

No rewrite-slide button, no multi-select, no Cmd+K palette, no Phase 4c learning wedge found in new code.

### 7. Theme/color conventions: PASS

SnapGrid: `#22d3ee` = cyan-400. AlignmentGuides: `#ec4899` = pink-500. Calendar dots: zinc-400/cyan-400/green-500. SlidePanel Reset button: yellow (confirmed via plan spec D8). All match.

### 8. No new dependencies added (PASS)

`git diff` on `package.json` across both commits shows only two script additions (`test:integration`, `deploy:fns`). No new `dependencies` or `devDependencies`.

### 9. photoTransform schema: forward-compatible (PASS)

`shared/types/slide.ts` adds optional `photoTransform` field. `resolvePhotoTransform` in `photoTransform.ts` applies defaults for missing fields. Hybrid precedence (per-zone wins, falls back to brand defaults) matches ADR #3.

### 10. German copy: PASS (except finding #3)

All modal copy in German Du-form: "Auf KI-Version zurücksetzen?", "Zurücksetzen", "Abbrechen", "Fertig", "Noch keine Posts geplant. Erstelle deinen ersten Post." Conflict modal: "Du hast bereits einen Post...". Onboarding doc (161 lines) German throughout.

---

## Top 3 Recommendations

1. **(Recommended) Write missing tests for snapMath.ts + B4 photoTransform immediately, before cutover.** -- These are the two highest-risk new modules with zero test coverage. `snapMath.ts` has 133 lines of coordinate math (snap, edge-to-edge, center-to-center alignment) with exact pixel thresholds that are invisible until Jule hits an off-by-one in production. B4 photoTransform has a precedence chain (zone > brand > default) that is bug-prone and covers a real Jule workflow. B1/D1/D4/D6 tests can follow post-cutover; snapMath and photoTransform cannot wait.

2. Fix `SlidePanel.tsx:310` em-dash in user-visible copy before cutover. -- Single character swap: replace `—` with `-` or rewrite the sentence. Takes 30 seconds; violates a hard convention.

3. Either import `graphConstants.ts` from `functions/graphApi.ts` (requires tsconfig change to allow cross-boundary import) or add a comment with a machine-checkable `grep` pre-commit guard so version skew is caught automatically. -- Current state documents the divergence but provides no enforcement. Next API version bump will require a two-file edit that a solo dev under time pressure will miss.
