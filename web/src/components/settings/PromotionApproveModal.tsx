// Approval modal: pick voice or persona, see current text, see suggested
// addition, edit the merged result before saving. Default merge mode is
// append - safest, preserves any text the user already wrote.

import { useState } from 'react';
import { api } from '../../lib/api';

interface Pattern {
  id: string;
  description: string;
  zone: string;
}

interface Props {
  brandId: string;
  pattern: Pattern;
  currentVoice: string;
  currentPersona: string;
  onClose: () => void;
  onApproved: (target: 'voice' | 'persona', mergedText: string) => void;
}

function appendMerge(current: string, addition: string): string {
  if (!current.trim()) return addition.trim();
  return `${current.trim()}\n\n${addition.trim()}`;
}

export function PromotionApproveModal({
  brandId,
  pattern,
  currentVoice,
  currentPersona,
  onClose,
  onApproved,
}: Props) {
  // Hook-zone patterns most often refine voice; persona patterns are rare.
  // Default target = voice, user can switch.
  const [target, setTarget] = useState<'voice' | 'persona'>('voice');
  const initialMerged = appendMerge(currentVoice, pattern.description);
  const [mergedText, setMergedText] = useState<string>(initialMerged);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchTarget(t: 'voice' | 'persona') {
    setTarget(t);
    const current = t === 'voice' ? currentVoice : currentPersona;
    setMergedText(appendMerge(current, pattern.description));
  }

  async function approve() {
    setSaving(true);
    setError(null);
    try {
      const r = await api(`/api/patterns/${pattern.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ brandId, target, mergedText }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${r.status}`);
        setSaving(false);
        return;
      }
      onApproved(target, mergedText);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const currentText = target === 'voice' ? currentVoice : currentPersona;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <header>
          <h2 className="text-lg font-semibold">Vorschlag übernehmen</h2>
          <p className="text-sm text-gray-500 mt-1">
            Der Vorschlag wird in die gewählte Identity-Kategorie übernommen.
            Das Pattern wird danach gelöscht.
          </p>
        </header>

        <section className="space-y-2">
          <label className="block text-sm font-medium">Vorschlag</label>
          <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm">
            {pattern.description}
            <span className="block text-xs text-gray-500 mt-1">
              Zone: {pattern.zone}
            </span>
          </div>
        </section>

        <section className="space-y-2">
          <label className="block text-sm font-medium">Übernehmen in</label>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="target"
                value="voice"
                checked={target === 'voice'}
                onChange={() => switchTarget('voice')}
              />
              Stimme (Voice)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="target"
                value="persona"
                checked={target === 'persona'}
                onChange={() => switchTarget('persona')}
              />
              Persona
            </label>
          </div>
        </section>

        <section className="space-y-2">
          <label className="block text-sm font-medium">
            Aktueller Wert ({target})
          </label>
          <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs whitespace-pre-wrap min-h-[60px]">
            {currentText || <span className="text-gray-400">(leer)</span>}
          </pre>
        </section>

        <section className="space-y-2">
          <label className="block text-sm font-medium">
            Neuer Wert (frei editierbar)
          </label>
          <textarea
            value={mergedText}
            onChange={(e) => setMergedText(e.target.value)}
            rows={6}
            className="w-full border border-gray-300 rounded p-2 text-sm"
          />
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <footer className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="border border-gray-300 text-sm px-4 py-2 rounded disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={saving || mergedText.trim().length === 0}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
          >
            {saving ? 'Speichern ...' : 'Übernehmen'}
          </button>
        </footer>
      </div>
    </div>
  );
}
