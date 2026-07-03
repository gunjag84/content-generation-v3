// Surfaces promotion-candidate patterns extracted from past edits.
// User Approves -> opens the Approve modal which writes the merged voice
// or persona text back to brand.identity. Dismiss / Hard-Delete are
// inline.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PromotionApproveModal } from './PromotionApproveModal';

interface CandidatePattern {
  id: string;
  description: string;
  zone: 'hook' | 'body' | 'cta' | 'caption';
  confidence: number;
  useCount: number;
  sourceMethod: string;
  sourceMode: string;
}

interface Props {
  brandId: string;
  voice: string;
  persona: string;
  // Refresh of identity after approval. Page passes its own setter.
  onIdentityUpdated: (target: 'voice' | 'persona', value: string) => void;
}

export function PatternSuggestions({ brandId, voice, persona, onIdentityUpdated }: Props) {
  const [candidates, setCandidates] = useState<CandidatePattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<CandidatePattern | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api(`/api/patterns/brand/${brandId}/candidates`);
      const j = (await r.json()) as { candidates: CandidatePattern[] };
      setCandidates(j.candidates ?? []);
    } catch (err) {
      console.error('[PatternSuggestions] load failed', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!brandId) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  async function dismiss(p: CandidatePattern) {
    setBusyId(p.id);
    try {
      await api(`/api/patterns/${p.id}/dismiss`, {
        method: 'POST',
        body: JSON.stringify({ brandId }),
      });
      setCandidates((curr) => curr.filter((c) => c.id !== p.id));
    } finally {
      setBusyId(null);
    }
  }

  async function hardDelete(p: CandidatePattern) {
    if (!confirm(`Diesen Vorschlag dauerhaft löschen?\n\n"${p.description}"`)) return;
    setBusyId(p.id);
    try {
      await api(`/api/patterns/${p.id}?brandId=${encodeURIComponent(brandId)}`, {
        method: 'DELETE',
      });
      setCandidates((curr) => curr.filter((c) => c.id !== p.id));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-400">Vorschläge werden geladen ...</p>;
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Keine Vorschläge. Sobald die KI ein wiederkehrendes Editier-Muster erkennt
        (mindestens 3-mal verwendet, hohe Konfidenz), erscheint es hier.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {candidates.map((p) => (
          <li
            key={p.id}
            className="border border-zinc-700 rounded p-3 text-sm space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-zinc-100">{p.description}</div>
                <div className="text-xs text-zinc-400 mt-1">
                  Zone: {p.zone} · Konfidenz: {(p.confidence * 100).toFixed(0)}% ·
                  {' '}genutzt: {p.useCount}× · {p.sourceMethod} / {p.sourceMode}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => setApproveTarget(p)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
              >
                Übernehmen
              </button>
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => dismiss(p)}
                className="border border-zinc-700 text-zinc-300 text-xs px-3 py-1 rounded disabled:opacity-50"
              >
                Verwerfen
              </button>
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => hardDelete(p)}
                className="text-xs text-red-400 px-3 py-1 disabled:opacity-50"
              >
                Löschen
              </button>
            </div>
          </li>
        ))}
      </ul>
      {approveTarget && (
        <PromotionApproveModal
          brandId={brandId}
          pattern={approveTarget}
          currentVoice={voice}
          currentPersona={persona}
          onClose={() => setApproveTarget(null)}
          onApproved={(target, mergedText) => {
            onIdentityUpdated(target, mergedText);
            setCandidates((curr) => curr.filter((c) => c.id !== approveTarget.id));
            setApproveTarget(null);
          }}
        />
      )}
    </>
  );
}
