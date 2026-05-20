// Cheatsheet modal — lists all editor keyboard shortcuts.
// Opens via Cmd+/ or the toolbar button; closes via Cmd+/, ESC, X, or backdrop click.
import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: { action: string; keys: string }[] = [
  { action: 'Rückgängig', keys: `${MOD}+Z` },
  { action: 'Wiederholen', keys: `${MOD}+Shift+Z` },
  { action: 'Speichern', keys: `${MOD}+S` },
  { action: 'Slide duplizieren', keys: `${MOD}+D` },
  { action: 'Zone 1 px bewegen', keys: '↑ ↓ ← →' },
  { action: 'Zone 10 px bewegen', keys: 'Shift + ↑ ↓ ← →' },
  { action: 'Zone löschen', keys: 'Delete / Backspace' },
  { action: 'Shortcuts anzeigen', keys: `${MOD}+/` },
];

export function KeyboardCheatsheet({ open, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); onClose(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={handleBackdrop}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-300">
            Tastatur-Shortcuts
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 text-lg leading-none"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        {/* Table */}
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-5 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500 font-normal">
                Aktion
              </th>
              <th className="text-right px-5 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500 font-normal">
                Shortcut
              </th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.action} className="border-b border-zinc-800/50 last:border-0">
                <td className="px-5 py-2 text-zinc-300">{s.action}</td>
                <td className="px-5 py-2 text-right">
                  <kbd className="font-mono text-[11px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                    {s.keys}
                  </kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="px-5 py-2 text-zinc-600 font-mono text-[10px]">
          ESC oder {MOD}+/ zum Schließen
        </div>
      </div>
    </div>
  );
}
