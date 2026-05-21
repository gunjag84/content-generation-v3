# Process-Manager Audit — 2026-05-20 Cycle 3 (final)

**Branch:** master @ 389350a
**Auditor:** process-manager lens
**Prior audits:** R1 (3 lenses), R2 (3 lenses)

## Verdict
PARTIAL

---

## Findings

### 1. ONBOARDING.md ESC description still wrong — confidence 10/10
`docs/ONBOARDING.md:61`
R2 fixed ESC to cancel (revert to originalTextRef). ONBOARDING.md line 61 still reads: "ESC oder Klick außerhalb beendet den Edit und **übernimmt die Änderung**." — this is the old commit-on-ESC description. The correct behaviour is revert-on-ESC, commit-on-blur/click-outside. The doc contradicts the code. Jule will be confused when ESC discards changes she intended to keep.

### 2. `scale` prop in InlineTextEditor still unused — confidence 9/10
`web/src/components/editor/InlineTextEditor.tsx:6,19`
R2 did not address Codex finding #6. `scale` is declared in `InlineTextEditorProps` and destructured, but never applied in the `style` object. Position is in canvas-space (`zone.x/y`), but the overlay is rendered inside the CSS-scaled preview. When the editor preview renders smaller than 1080px, the textarea drifts from the text. R2 closed the ESC path but left this open.

### 3. PhotoEditModal state-leak NOT fixed — confidence 9/10
`web/src/components/editor/SlidePanel.tsx:229`
R2 commit added no `useEffect(() => { setPhotoEditOpen(false); }, [slide])` guard. Codex R2 finding #3 (confidence 8/10, data-corruption risk) was flagged but not actioned. Switching active slide while modal is open then clicking "Fertig" still writes slide 2's photo transform to slide 3.

### 4. Caption keystroke floods undo stack — NOT fixed — confidence 8/10
`web/src/routes/Editor.tsx:760`
Caption `onChange` still calls `commitEdit(slides, e.target.value)` on every keystroke. Codex R2 finding #5 (confidence 7/10) was not actioned. 200-char caption edit fills the 50-entry stack, evicting all slide-edit history.

### 5. Out-of-Scope table contradicts shipped Calendar feature — confidence 8/10
`PROJECT-PLAN.md:214`
Line 214: "Calendar interactive view + drag-and-drop reschedule | v2 feature; v1 has Coming Soon placeholder only". D1 (Calendar month view) is now `done` in the Executable Task Table. The Out-of-Scope row was not updated to reflect "DnD reschedule deferred; read-only month view SHIPPED." Stale description creates confusion at handover.

### 6. Compiled `.js` files in `server/functions/lib/` show v21.0 — confidence 7/10
`server/functions/lib/graphApi.js:14-15`, `server/functions/lib/igStatsSync.js:10-11`
D9 centralised GRAPH_VERSION in `server/lib/graphConstants.ts` (v22.0) and `server/functions/graphApi.ts` (v22.0). But the committed compiled output files still show `v21.0`. These are stale build artifacts checked into the repo. If `firebase deploy` picks up the compiled `.js` files instead of re-compiling from `.ts`, Cloud Functions run against v21.0 while Cloud Run runs v22.0 — a silent split across the stack.

### 7. `undoStackIntegration.test.ts` does not cover caption-undo or ESC-revert paths — confidence 6/10
`web/src/hooks/__tests__/undoStackIntegration.test.ts`
The 3 tests cover drag-bracket (one entry), autoGrow (zero entries), and normal commitEdit. Missing: (a) ESC-cancel returns `originalTextRef.current` — no test verifies the revert value reaches the parent; (b) caption debounce (or lack thereof) — no test. Per PROJECT-PLAN.md test scope table, B1 requires "Esc to cancel" coverage. This is an uncovered acceptance criterion.

---

## Top 3 Recommendations

1. **(Recommended) Fix ONBOARDING.md ESC description** — Change "übernimmt die Änderung" to "verwirft die Änderung und stellt den Originaltext wieder her". Single-line fix, zero code risk, blocks accurate Jule handover. This is the one doc-vs-code drift that will produce a real support call on Day 1.

2. **Fix PhotoEditModal state-leak (Codex R2 finding #3)** — Add `useEffect(() => { setPhotoEditOpen(false); }, [slide])` in `SlidePanel`. Data-corruption risk (wrong photo transform written to wrong slide) is the only unaddressed data-integrity bug across all three cycles.

3. **Delete or regenerate stale `server/functions/lib/*.js` compiled artifacts** — Either add `server/functions/lib/` to `.gitignore` and delete the committed files, or re-run `tsc` to regenerate them with v22.0. A silent v21/v22 split between Cloud Functions and Cloud Run is a production API risk, especially after Meta deprecated v21 fields.
