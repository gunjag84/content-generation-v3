import { useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Core stack logic — pure, no React deps. Exported for unit tests.
// ---------------------------------------------------------------------------

export interface UndoStackState<T> {
  past: T[];
  future: T[];
}

export interface UndoStack<T> {
  push: (state: T) => void;
  undo: () => T | null;
  redo: () => T | null;
  canUndo: boolean;
  canRedo: boolean;
  reset: () => void;
}

export function createUndoStack<T>(capacity = 50): {
  push: (state: T) => void;
  undo: () => T | null;
  redo: () => T | null;
  snapshot: () => UndoStackState<T>;
  reset: () => void;
} {
  let past: T[] = [];
  let future: T[] = [];

  return {
    push(state: T) {
      past = [...past, structuredClone(state)];
      if (past.length > capacity) {
        past = past.slice(past.length - capacity);
      }
      future = [];
    },
    undo(): T | null {
      if (past.length === 0) return null;
      const next = [...past];
      const restored = next.pop()!;
      past = next;
      future = [structuredClone(restored), ...future];
      return restored;
    },
    redo(): T | null {
      if (future.length === 0) return null;
      const [next, ...rest] = future;
      future = rest;
      past = [...past, structuredClone(next)];
      return next;
    },
    snapshot(): UndoStackState<T> {
      return { past, future };
    },
    reset() {
      past = [];
      future = [];
    },
  };
}

// ---------------------------------------------------------------------------
// React hook — wraps createUndoStack and drives re-renders via useState.
// ---------------------------------------------------------------------------

export function useUndoStack<T>(
  _initialState: T,
  capacity = 50,
): {
  push: (state: T) => void;
  undo: () => T | null;
  redo: () => T | null;
  canUndo: boolean;
  canRedo: boolean;
  reset: () => void;
} {
  // Stable stack instance across renders.
  const stackRef = useRef(createUndoStack<T>(capacity));

  // Tracked only to trigger re-renders when canUndo/canRedo changes.
  const [, forceUpdate] = useState(0);

  function push(state: T) {
    stackRef.current.push(state);
    forceUpdate((n) => n + 1);
  }

  function undo(): T | null {
    const result = stackRef.current.undo();
    if (result !== null) forceUpdate((n) => n + 1);
    return result;
  }

  function redo(): T | null {
    const result = stackRef.current.redo();
    if (result !== null) forceUpdate((n) => n + 1);
    return result;
  }

  function reset() {
    stackRef.current.reset();
    forceUpdate((n) => n + 1);
  }

  const { past, future } = stackRef.current.snapshot();

  return {
    push,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    reset,
  };
}
