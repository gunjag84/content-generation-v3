// Hex-text color input. Recents are gated behind a popover that opens when the
// user clicks the color swatch — keeps the inline UI minimal.
//
// Behavior:
//   - Inline shows ONLY the current color (clickable swatch + read-only hex).
//   - Click swatch → popover opens with: hex input + last 10 picked swatches.
//   - Typing a valid 6-char hex propagates onChange immediately (live preview).
//   - Invalid intermediate input does not propagate; on blur/Enter we either
//     commit (if valid) or revert to the prop value.
//   - Committing a valid color pushes it to the persistent recent list (max 10,
//     MRU, deduped case-insensitive) and closes the popover.
//   - Clicking a recent swatch picks it, pushes to MRU, closes the popover.
//   - Popover closes on outside-click and Escape.
import { useEffect, useRef, useState } from 'react';
import {
  getRecentColors,
  normalizeHex,
  pushRecentColor,
  subscribeRecentColors,
} from '../lib/recentColors';

// Both call sites (Settings > Design, editor Slide/Zone panels) now render
// against the locked zinc-dark theme, so this component no longer needs a
// light variant - it was the last surviving v2 light-theme remnant here.
export type ColorInputVariant = 'dark';

interface ColorInputProps {
  value: string;
  onChange: (v: string) => void;
  variant?: ColorInputVariant;
  /** Optional class on the outer wrapper (e.g. width override). */
  className?: string;
}

export function ColorInput({
  value,
  onChange,
  className,
}: ColorInputProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [recents, setRecents] = useState<string[]>(() => getRecentColors());
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // External value change → resync the editable text buffer.
  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => subscribeRecentColors(setRecents), []);

  // Outside-click + Escape close the popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus the hex input when the popover opens for fast keyboard entry.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function handleChange(s: string) {
    setText(s);
    const norm = normalizeHex(s);
    if (norm) onChange(norm);
  }

  function commit(s: string, closeOnCommit = false) {
    const norm = normalizeHex(s);
    if (norm) {
      onChange(norm);
      setRecents(pushRecentColor(norm));
      setText(norm);
      if (closeOnCommit) setOpen(false);
    } else {
      setText(value);
    }
  }

  function pickSwatch(c: string) {
    onChange(c);
    setText(c);
    setRecents(pushRecentColor(c));
    setOpen(false);
  }

  const inputCls = 'bg-zinc-800 border border-zinc-700 text-zinc-200 focus:border-amber-500/50';
  const swatchBorder = 'border-zinc-600';
  const popoverCls = 'bg-zinc-900 border border-zinc-700 shadow-xl';
  const hexLabelCls = 'text-zinc-400';

  const swatchPreview = normalizeHex(text) ?? value;

  return (
    <div ref={wrapRef} className={`relative inline-flex flex-col ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Open color picker"
          aria-expanded={open}
          className={`inline-block w-7 h-7 flex-shrink-0 border ${swatchBorder} cursor-pointer hover:border-amber-500 transition-colors`}
          style={{ backgroundColor: swatchPreview }}
        />
        <span className={`font-mono text-[12px] ${hexLabelCls} tabular-nums select-all`}>
          {normalizeHex(text) ?? value}
        </span>
      </div>

      {open && (
        <div
          className={`absolute left-0 top-9 z-50 p-3 ${popoverCls} flex flex-col gap-2`}
          style={{ minWidth: 200 }}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-6 h-6 flex-shrink-0 border ${swatchBorder}`}
              style={{ backgroundColor: swatchPreview }}
              aria-hidden
            />
            <input
              ref={inputRef}
              type="text"
              value={text}
              spellCheck={false}
              maxLength={7}
              placeholder="#000000"
              onChange={(e) => handleChange(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit((e.target as HTMLInputElement).value, true);
              }}
              className={`px-2 py-1 font-mono text-[12px] w-24 focus:outline-none ${inputCls}`}
            />
          </div>
          {recents.length > 0 ? (
            <div className="flex gap-1 flex-wrap" style={{ maxWidth: 180 }}>
              {recents.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickSwatch(c)}
                  title={c}
                  className={`w-6 h-6 border ${swatchBorder} hover:border-amber-500 transition-colors`}
                  style={{ backgroundColor: c }}
                  aria-label={`Pick ${c}`}
                />
              ))}
            </div>
          ) : (
            <div className={`font-mono text-[10px] ${hexLabelCls}`}>
              No recent colors yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
