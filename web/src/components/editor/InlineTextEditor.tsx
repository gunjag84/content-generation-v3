import { useEffect, useRef } from 'react';
import type { Zone } from '../../../../shared/types/slide';

interface InlineTextEditorProps {
  zone: Zone;
  scale: number;
  onCommit: (text: string) => void;
}

/**
 * Absolute-positioned <textarea> overlay that mirrors the zone's font/size/color
 * exactly so "edit mode" is visually identical to the rendered text.
 *
 * Design choice: textarea grows with CSS (height: auto inside a flex wrapper
 * sized to zone.h min) and the zone height updates ONLY on commit — not live.
 * This avoids a re-render storm while typing. The existing useAutoGrow hook
 * corrects any overflow on the next render after commit.
 */
export function InlineTextEditor({ zone, scale, onCommit }: InlineTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-focus + select all on mount
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const commit = () => {
    if (ref.current) onCommit(ref.current.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      commit();
    }
    // Tab: prevent focus shift so user can type tabs if needed
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = ref.current;
      if (el) {
        const s = el.selectionStart;
        const v = el.value;
        el.value = v.slice(0, s) + '\t' + v.slice(el.selectionEnd);
        el.selectionStart = el.selectionEnd = s + 1;
      }
    }
  };

  // Plain-text paste: strip any HTML that might come through
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const v = el.value;
    el.value = v.slice(0, s) + text + v.slice(el.selectionEnd);
    el.selectionStart = el.selectionEnd = s + text.length;
  };

  const style: React.CSSProperties = {
    position: 'absolute',
    left: zone.x,
    top: zone.y,
    width: zone.w,
    minHeight: zone.h,
    zIndex: 50,
    // Mirror zone text styles exactly
    fontFamily: zone.fontFamily,
    fontSize: zone.fontSize,
    fontWeight: zone.fontWeight,
    color: zone.color,
    fontStyle: zone.italic ? 'italic' : 'normal',
    textAlign: zone.alignH,
    lineHeight: zone.lineHeight,
    letterSpacing: `${zone.letterSpacing}em`,
    // Textarea chrome reset
    background: 'rgba(0,0,0,0.35)',
    border: '1.5px solid #F59E0B',
    borderRadius: 2,
    padding: 8,
    boxSizing: 'border-box',
    resize: 'none',
    outline: 'none',
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    // Transform matches the zone rotation so overlay sits perfectly
    transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
    transformOrigin: 'center center',
  };

  return (
    <textarea
      ref={ref}
      defaultValue={zone.text}
      style={style}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      // Stop mousedown/click from bubbling to the canvas (which would exit edit
      // mode or re-trigger drag logic)
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      spellCheck={false}
    />
  );
}
