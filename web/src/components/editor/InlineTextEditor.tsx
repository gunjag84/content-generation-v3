import { useEffect, useRef } from 'react';
import type { Zone, TextSpan } from '../../../../shared/types/slide';
import { getZoneSpans } from '../../../../shared/types/slide';
import { spansToInlineHtml, domToSpans, clearSavedSelection } from '../../lib/spanFormat';

interface InlineTextEditorProps {
  zone: Zone;
  scale: number;
  /** Commits the edit. Receives the new text representation — either a plain
   *  string (when no per-span formatting is present) or a TextSpan[] (when it
   *  is). Storing the simpler shape when possible keeps Firestore docs small
   *  and backward-compatible with consumers that still expect string text. */
  onCommit: (text: string | TextSpan[]) => void;
}

/**
 * Absolute-positioned `contentEditable` overlay that mirrors the zone's
 * font/size/color exactly so "edit mode" is visually identical to the rendered
 * text — plus supports per-word formatting via the canvas selection + the
 * right-rail format buttons (color, font, weight, italic, size).
 *
 * Design choices:
 *  - innerHTML is set ONCE on mount via ref. React never touches the DOM after
 *    that. This is the canonical fix for the "React + contentEditable" cursor-
 *    jumping problem.
 *  - On blur, parse the DOM back to TextSpan[]. If every span has no overrides
 *    we collapse back to a plain string so older docs don't grow new shape.
 *  - ESC reverts to the original spans (industry convention: Figma/Notion/Excel
 *    all revert on ESC; blur/Enter commits).
 *  - Cursor lands at END of content on mount, no select-all, so users can edit
 *    a single word (double-click word inside the editor selects just that word
 *    via native browser behavior).
 */
export function InlineTextEditor({ zone, scale, onCommit }: InlineTextEditorProps) {
  void scale; // accepted for API parity; positioning matches zone coords directly
  const ref = useRef<HTMLDivElement>(null);
  const originalRef = useRef<string | TextSpan[]>(zone.text);
  // Track whether a commit already happened so the auto-commit on unmount
  // never double-commits if the user pressed ESC or Enter first.
  const committedRef = useRef(false);

  // Seed the contentEditable DOM exactly once. After this, React must not
  // touch innerHTML — otherwise the cursor jumps to the start of the field
  // on every state update upstream.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = getZoneSpans(zone);
    el.innerHTML = spansToInlineHtml(spans);
    el.focus();
    // Place caret at end (no select-all → user can edit a single word).
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // On unmount, drop any saved selection so subsequent zone-level format
    // clicks don't try to apply against a detached DOM node.
    return () => clearSavedSelection();
    // Component is intentionally mounted exactly once per editingZoneId via
    // the `key` prop in the parent. We don't want to re-seed when the zone
    // prop changes from a different render — the contentEditable IS the
    // source of truth during edit mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    const el = ref.current;
    if (!el) return;
    const spans = domToSpans(el);
    // Collapse to plain string when no span has any override — keeps the
    // simpler storage shape for unformatted edits.
    const allPlain = spans.every(
      (s) =>
        s.color === undefined &&
        s.fontFamily === undefined &&
        s.fontSize === undefined &&
        s.fontWeight === undefined &&
        s.italic === undefined,
    );
    if (allPlain) {
      onCommit(spans.map((s) => s.text).join(''));
    } else {
      onCommit(spans);
    }
  }

  function revert() {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(originalRef.current);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      revert();
      return;
    }
    // Enter (without Shift) commits. Shift+Enter inserts a line break — let
    // the browser handle that natively.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
      return;
    }
  }

  // Force plain-text paste so external rich-text styles don't sneak in.
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    // insertText is the modern equivalent of execCommand('insertText') for
    // contentEditable. Available in all current browsers.
    document.execCommand('insertText', false, text);
  }

  const style: React.CSSProperties = {
    position: 'absolute',
    left: zone.x,
    top: zone.y,
    width: zone.w,
    minHeight: zone.h,
    zIndex: 50,
    // Mirror zone text styles exactly so edit mode = rendered text.
    fontFamily: zone.fontFamily,
    fontSize: zone.fontSize,
    fontWeight: zone.fontWeight,
    color: zone.color,
    fontStyle: zone.italic ? 'italic' : 'normal',
    textAlign: zone.alignH,
    lineHeight: zone.lineHeight,
    letterSpacing: `${zone.letterSpacing}em`,
    // Editor chrome
    background: 'rgba(0,0,0,0.35)',
    border: '1.5px solid #F59E0B',
    borderRadius: 2,
    padding: 8,
    boxSizing: 'border-box',
    outline: 'none',
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
    transformOrigin: 'center center',
    // contentEditable needs a cursor hint.
    cursor: 'text',
  };

  // Don't commit when focus moves to a "format control" — those need the
  // contentEditable to stay mounted so applyFormatToSelection can target the
  // saved selection. The data-keep-inline-edit attribute marks the right-rail
  // format buttons + ColorInput popover.
  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as HTMLElement | null;
    if (next && next.closest?.('[data-keep-inline-edit]')) return;
    // Quirk: clicking an <input type="number"> (the font-size control) fires
    // this blur with relatedTarget === null even though focus moved to a format
    // control inside [data-keep-inline-edit]. Without this, edit mode would
    // commit+exit and the size would hit the whole zone instead of the
    // selection. When relatedTarget is null, defer and check where focus
    // actually landed before deciding to commit.
    if (!next) {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active && active.closest?.('[data-keep-inline-edit]')) return;
        commit();
      }, 0);
      return;
    }
    commit();
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      style={style}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      // Don't let mouse events bubble to the canvas (which would re-select
      // the zone or start a drag).
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      spellCheck={false}
    />
  );
}
