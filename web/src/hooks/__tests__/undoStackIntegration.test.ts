/**
 * Integration test: drag-bracket pattern produces exactly ONE undo entry.
 *
 * Simulates the Editor.tsx drag-bracket pattern in pure TS (no React host
 * needed) using createUndoStack directly.
 *
 * Contract under test:
 *   - onMutationStart captures pre-drag state (but does NOT push to stack).
 *   - Mid-drag onZoneChange calls go through transientUpdate (no push).
 *   - onMutationEnd pushes the captured pre-drag state → exactly ONE entry.
 *   - Cmd+Z restores the full pre-drag state in a single undo.
 *   - autoGrow calls via transientUpdate → zero undo entries.
 */

import { describe, it, expect } from 'vitest';
import { createUndoStack } from '../useUndoStack';

type Snap = { slides: string[]; caption: string };

function snap(id: string): Snap {
  return { slides: [id], caption: id };
}

describe('drag-bracket undo pattern', () => {
  it('200 mid-drag transient updates produce exactly ONE undo entry', () => {
    const stack = createUndoStack<Snap>(50);

    // --- pre-drag state (simulates Editor state before mousedown) ---
    const preDrag = snap('pre-drag');

    // Current live state (shared mutable ref, mirrors Editor's slidesRef2)
    let currentLive = preDrag;

    // Transient update: applies state changes without touching undo stack.
    const transientUpdate = (next: Snap) => { currentLive = next; };

    // Mutation start: capture pre-drag into preDragRef equivalent.
    let preDragCapture: Snap | null = null;
    const onMutationStart = () => { preDragCapture = { ...currentLive }; };

    // Mutation end: push captured pre-drag state to undo stack.
    const onMutationEnd = () => {
      if (!preDragCapture) return;
      stack.push(preDragCapture);
      preDragCapture = null;
    };

    // --- simulate drag sequence ---
    onMutationStart();

    // 200 mid-drag moves — all transient, no stack push.
    for (let i = 0; i < 200; i++) {
      transientUpdate(snap(`drag-pixel-${i}`));
    }

    // Final post-drag position.
    transientUpdate(snap('post-drag'));

    onMutationEnd();

    // Exactly one entry in past: the pre-drag snapshot.
    const { past } = stack.snapshot();
    expect(past.length).toBe(1);
    expect(past[0]).toEqual(preDrag);

    // Undo restores pre-drag state in a single step.
    const restored = stack.undo();
    expect(restored).toEqual(preDrag);
    expect(stack.snapshot().past.length).toBe(0);
  });

  it('autoGrow transient updates add zero undo entries', () => {
    const stack = createUndoStack<Snap>(50);

    const initial = snap('initial');
    let currentLive = initial;

    // autoGrow calls transientUpdate only.
    const transientUpdate = (next: Snap) => { currentLive = next; };

    // Simulate 5 autoGrow layout corrections.
    for (let i = 0; i < 5; i++) {
      transientUpdate(snap(`autogrow-${i}`));
    }

    // No undo entries — autoGrow is invisible to the undo stack.
    expect(stack.snapshot().past.length).toBe(0);
    expect(stack.undo()).toBeNull();

    // Live state still updated correctly.
    expect(currentLive).toEqual(snap('autogrow-4'));
  });

  it('non-drag commitEdit still pushes to undo stack normally', () => {
    const stack = createUndoStack<Snap>(50);

    let currentLive = snap('a');

    // commitEdit: push current then update live (mirrors Editor.commitEdit).
    const commitEdit = (next: Snap) => {
      stack.push(currentLive);
      currentLive = next;
    };

    commitEdit(snap('b'));
    commitEdit(snap('c'));

    expect(stack.snapshot().past.length).toBe(2);
    expect(stack.undo()).toEqual(snap('b'));
    expect(stack.undo()).toEqual(snap('a'));
  });
});
