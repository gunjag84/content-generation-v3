import { useEffect, useRef, useState } from 'react';
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
  const backdropRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setValue(defaultDatetimeLocal());
      setError(null);
      setLoading(false);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return;
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
    }
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Beitrag einplanen</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Veröffentlichungszeitpunkt
            </label>
            <input
              type="datetime-local"
              value={value}
              min={minDatetimeLocal()}
              onChange={(e) => setValue(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Wird geplant …' : 'Plan einplanen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
