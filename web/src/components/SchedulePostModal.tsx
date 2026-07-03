import { useEffect, useRef, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { schedulePost } from '../lib/postActions';

interface Props {
  open: boolean;
  postId: string;
  brandId: string;
  onClose(): void;
  onScheduled(): void;
}

function defaultDatetimeLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000); // +1h
  // Format as yyyy-MM-ddTHH:mm in local time
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function minDatetimeLocal(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000); // +5min
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SchedulePostModal({ open, postId, brandId, onClose, onScheduled }: Props) {
  const [value, setValue] = useState(defaultDatetimeLocal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictTs, setConflictTs] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const uid = useAuthStore((s) => s.user?.uid);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setValue(defaultDatetimeLocal());
      setError(null);
      setLoading(false);
      setConflictTs(null);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function detectConflict(chosenMs: number): Promise<string | null> {
    if (!uid) return null;
    const windowMs = 30_000;
    const lo = Timestamp.fromMillis(chosenMs - windowMs);
    const hi = Timestamp.fromMillis(chosenMs + windowMs);
    const postsRef = collection(db, 'users', uid, 'brands', brandId, 'posts');
    const q = query(
      postsRef,
      where('status', '==', 'scheduled'),
      where('scheduledAt', '>=', lo),
      where('scheduledAt', '<=', hi),
    );
    const snap = await getDocs(q);
    const conflict = snap.docs.find((d) => d.id !== postId);
    if (!conflict) return null;
    const ts: Timestamp = conflict.data().scheduledAt;
    const d = ts.toDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function doSave() {
    if (savingRef.current) return;        // synchronous guard against double-tap
    savingRef.current = true;
    if (!value) { savingRef.current = false; return; }
    setLoading(true);
    setError(null);
    try {
      const iso = new Date(value).toISOString();
      await schedulePost(brandId, postId, iso);
      onScheduled();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
      savingRef.current = false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const chosenMs = new Date(value).getTime();
      const conflict = await detectConflict(chosenMs);
      if (conflict) {
        setConflictTs(conflict);
        return;
      }
    } catch {
      // On Firestore error, proceed without blocking the user
    } finally {
      setLoading(false);
    }
    await doSave();
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <>
      <div
        ref={backdropRef}
        className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
        onClick={handleBackdrop}
      >
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-sm p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Beitrag einplanen</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Veröffentlichungszeitpunkt
              </label>
              <input
                type="datetime-local"
                value={value}
                min={minDatetimeLocal()}
                onChange={(e) => setValue(e.target.value)}
                required
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? 'Wird geplant …' : 'Plan einplanen'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {conflictTs && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-zinc-100 mb-3">Zeitslot bereits belegt</h2>
            <p className="text-sm text-zinc-300 mb-6">
              Du hast bereits einen Post am <strong>{conflictTs}</strong> geplant. Trotzdem speichern?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConflictTs(null)}
                className="px-4 py-2 text-sm text-zinc-600 bg-zinc-100 rounded hover:bg-zinc-200"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => { setConflictTs(null); void doSave(); }}
                className="px-4 py-2 text-sm font-medium bg-yellow-500 text-zinc-900 rounded hover:bg-yellow-400 disabled:opacity-50"
              >
                Trotzdem speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
