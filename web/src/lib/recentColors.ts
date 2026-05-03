// Persistent MRU list of the last 10 picked colors. Used by ColorInput.
// Survives across reloads via localStorage; a custom window event is
// dispatched on update so multiple ColorInput instances on one page stay
// in sync without needing a global store.

const KEY = 'cg.recentColors';
const MAX = 10;
const EVENT = 'cg:recentColorsChanged';

export function normalizeHex(s: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(s.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

export function getRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === 'string').slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentColor(hex: string): string[] {
  const norm = normalizeHex(hex);
  if (!norm) return getRecentColors();
  const cur = getRecentColors();
  const filtered = cur.filter((c) => c.toLowerCase() !== norm.toLowerCase());
  const next = [norm, ...filtered].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private-mode failures
  }
  window.dispatchEvent(new CustomEvent(EVENT));
  return next;
}

export function subscribeRecentColors(cb: (colors: string[]) => void): () => void {
  const handler = () => cb(getRecentColors());
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
