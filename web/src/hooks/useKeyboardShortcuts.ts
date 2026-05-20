// Keyboard shortcuts for the Editor. Attaches a document-level keydown
// listener. Guards against firing when an input/textarea/contentEditable
// has focus (except Cmd+S which saves regardless).
import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  undo: () => void;
  redo: () => void;
  save: () => void;
  duplicateSlide: () => void;
  nudgeSelectedZone: (dx: number, dy: number) => void;
  removeSelectedZone: () => void;
  toggleCheatsheet: () => void;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof Element)) return false;
  const tag = (el as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  isEnabled: boolean,
): void {
  // Stable ref so the keydown listener never needs to be re-attached when
  // handler identity changes (they capture refs internally anyway).
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!isEnabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const cmd = e.metaKey || e.ctrlKey;
      const inEditable = isEditableTarget(e.target);

      // Cmd+S: save always (even from text inputs)
      if (cmd && e.key === 's') {
        e.preventDefault();
        handlers.save();
        return;
      }

      // Skip all other shortcuts when a text input has focus
      if (inEditable) return;

      // Cmd+Z (undo) / Cmd+Shift+Z (redo)
      if (cmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handlers.undo();
        return;
      }
      if (cmd && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handlers.redo();
        return;
      }

      // Cmd+D — duplicate active slide
      if (cmd && e.key === 'd') {
        e.preventDefault();
        handlers.duplicateSlide();
        return;
      }

      // Cmd+/ — toggle cheatsheet
      if (cmd && e.key === '/') {
        e.preventDefault();
        handlers.toggleCheatsheet();
        return;
      }

      // Arrow keys — nudge selected zone (1px; +Shift = 10px)
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlers.nudgeSelectedZone(0, -step);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handlers.nudgeSelectedZone(0, step);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlers.nudgeSelectedZone(-step, 0);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handlers.nudgeSelectedZone(step, 0);
        return;
      }

      // Delete/Backspace — remove selected zone
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handlers.removeSelectedZone();
        return;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isEnabled, handlers]);
}
