import { describe, it, expect } from 'vitest';
import { createUndoStack } from '../useUndoStack';

// Tests run against the pure createUndoStack factory (no React host needed).
// The useUndoStack hook is a thin React wrapper around the same logic.

type Snap = { slides: string[]; caption: string };

function snap(id: string): Snap {
  return { slides: [id], caption: id };
}

describe('createUndoStack', () => {
  it('push 50 actions — undo 50 times — canUndo is false', () => {
    const stack = createUndoStack<Snap>(50);
    for (let i = 0; i < 50; i++) {
      stack.push(snap(`s${i}`));
    }
    expect(stack.snapshot().past.length).toBe(50);
    for (let i = 0; i < 50; i++) {
      const result = stack.undo();
      expect(result).not.toBeNull();
    }
    expect(stack.snapshot().past.length).toBe(0);
    expect(stack.undo()).toBeNull();
  });

  it('push then undo then redo restores correct state', () => {
    const stack = createUndoStack<Snap>(50);
    const a = snap('a');
    const b = snap('b');
    stack.push(a);
    stack.push(b);

    const afterUndo = stack.undo();
    expect(afterUndo).toEqual(b);
    expect(stack.snapshot().past).toHaveLength(1);
    expect(stack.snapshot().future).toHaveLength(1);

    const afterRedo = stack.redo();
    expect(afterRedo).toEqual(b);
    expect(stack.snapshot().past).toHaveLength(2);
    expect(stack.snapshot().future).toHaveLength(0);
  });

  it('push then undo then push (new action) clears future stack', () => {
    const stack = createUndoStack<Snap>(50);
    stack.push(snap('a'));
    stack.push(snap('b'));
    stack.undo();
    expect(stack.snapshot().future).toHaveLength(1);

    stack.push(snap('c'));
    expect(stack.snapshot().future).toHaveLength(0);
  });

  it('cap-50: push 51 actions, first action is dropped', () => {
    const stack = createUndoStack<Snap>(50);
    for (let i = 0; i < 51; i++) {
      stack.push(snap(`s${i}`));
    }
    const { past } = stack.snapshot();
    expect(past.length).toBe(50);
    // The oldest remaining entry should be s1, not s0.
    expect(past[0]).toEqual(snap('s1'));
  });

  it('structuredClone: push state, mutate original, undo returns unmodified state', () => {
    const stack = createUndoStack<Snap>(50);
    const original = { slides: ['slide-1'], caption: 'hello' };
    stack.push(original);

    // Mutate original after pushing
    original.slides[0] = 'MUTATED';
    original.caption = 'MUTATED';

    const restored = stack.undo();
    expect(restored).toEqual({ slides: ['slide-1'], caption: 'hello' });
  });
});
