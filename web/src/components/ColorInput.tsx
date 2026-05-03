// Hex-text color input + recent-color swatches. Replaces native <input type="color">
// across the app so users can paste/type hex codes directly and re-pick from history.
//
// Behavior:
//   - Typing a valid 6-char hex propagates onChange immediately (live preview).
//   - Invalid intermediate input does not propagate; on blur/Enter we either
//     commit (if valid) or revert to the prop value.
//   - Committing a valid color pushes it to the persistent recent list (max 10,
//     MRU, deduped case-insensitive).
//   - Clicking a swatch is an immediate commit + pushes to MRU.
import { useEffect, useState } from 'react';
import {
  getRecentColors,
  normalizeHex,
  pushRecentColor,
  subscribeRecentColors,
} from '../lib/recentColors';

export type ColorInputVariant = 'dark' | 'light';

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
  variant = 'dark',
  className,
}: ColorInputProps) {
  const [text, setText] = useState(value);
  const [recents, setRecents] = useState<string[]>(() => getRecentColors());

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => subscribeRecentColors(setRecents), []);

  function handleChange(s: string) {
    setText(s);
    const norm = normalizeHex(s);
    if (norm) onChange(norm);
  }

  function commit(s: string) {
    const norm = normalizeHex(s);
    if (norm) {
      onChange(norm);
      setRecents(pushRecentColor(norm));
      setText(norm);
    } else {
      // revert to last valid value
      setText(value);
    }
  }

  function pickSwatch(c: string) {
    onChange(c);
    setText(c);
    setRecents(pushRecentColor(c));
  }

  const isDark = variant === 'dark';
  const inputCls = isDark
    ? 'bg-zinc-800 border border-zinc-700 text-zinc-200 focus:border-amber-500/50'
    : 'bg-white border border-gray-300 text-gray-900 focus:border-gray-900';
  const swatchBorder = isDark ? 'border-zinc-600' : 'border-gray-300';

  const swatchPreview = normalizeHex(text) ?? value;

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-7 h-7 flex-shrink-0 border ${swatchBorder}`}
          style={{ backgroundColor: swatchPreview }}
          aria-hidden
        />
        <input
          type="text"
          value={text}
          spellCheck={false}
          maxLength={7}
          placeholder="#000000"
          onChange={(e) => handleChange(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          }}
          className={`px-2 py-1 font-mono text-[12px] w-24 focus:outline-none ${inputCls}`}
        />
      </div>
      {recents.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {recents.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pickSwatch(c)}
              title={c}
              className={`w-5 h-5 border ${swatchBorder} hover:border-amber-500 transition-colors`}
              style={{ backgroundColor: c }}
              aria-label={`Pick ${c}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
