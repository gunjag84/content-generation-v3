import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { BrandIdentitySchema, type BrandIdentity } from '../../../../shared/schemas/brand';
import { PatternSuggestions } from '../../components/settings/PatternSuggestions';

const EMPTY: BrandIdentity = {
  voice: '',
  persona: '',
  product_uvp: '',
  point_of_view: '',
  competitive_landscape: '',
};

// `active` fields are wired into the system prompt at generate-time
// (Layer 3.5). `inactive` fields are dead code - kept in schema/UI for
// future use but not read by the server.
const ACTIVE_FIELDS: Array<{ key: keyof BrandIdentity; label: string; help: string }> = [
  {
    key: 'voice',
    label: 'Stimme',
    help: 'Tonfall und Schreibweise. Beispiel: "Klar, knapp, persönlich. Fragmente erlaubt. Nie mit Floskeln einleiten."',
  },
  {
    key: 'persona',
    label: 'Persona',
    help: 'Wer ist die Zielperson? Lebenssituation, Sprache, Anliegen. Fließt in jeden Generate-Prompt ein.',
  },
];

const INACTIVE_FIELDS: Array<{ key: keyof BrandIdentity; label: string }> = [
  { key: 'product_uvp', label: 'Produkt-UVP' },
  { key: 'point_of_view', label: 'Standpunkt' },
  { key: 'competitive_landscape', label: 'Wettbewerbslandschaft' },
];

export function IdentityPage() {
  const { uid, brandId } = useActiveBrand();
  const [identity, setIdentity] = useState<BrandIdentity>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uid || !brandId) return;
    let alive = true;
    getDoc(doc(db, 'users', uid, 'brands', brandId)).then((snap) => {
      if (!alive) return;
      const data = snap.data();
      setIdentity({ ...EMPTY, ...(data?.identity ?? {}) });
    });
    return () => {
      alive = false;
    };
  }, [uid, brandId]);

  async function save(next: BrandIdentity) {
    if (!uid || !brandId) return;
    const parsed = BrandIdentitySchema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(', '));
      return;
    }
    setError(null);
    await updateDoc(doc(db, 'users', uid, 'brands', brandId), {
      identity: parsed.data,
      updatedAt: serverTimestamp(),
    });
    setSavedAt(Date.now());
  }

  function update<K extends keyof BrandIdentity>(key: K, value: BrandIdentity[K]) {
    const next = { ...identity, [key]: value };
    setIdentity(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(next), 1500);
  }

  // Called by PatternSuggestions after a candidate is approved + the merged
  // text is written server-side. We mirror it locally so the textarea
  // reflects the new value without needing a re-fetch.
  function applyIdentityFromApproval(target: 'voice' | 'persona', value: string) {
    setIdentity((curr) => ({ ...curr, [target]: value }));
    setSavedAt(Date.now());
  }

  if (!uid || !brandId) return <p className="text-gray-500">Brand wird geladen ...</p>;

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Identity</h1>
        <p className="text-sm text-gray-500">Stimme und Persona der Marke.</p>
      </header>

      {ACTIVE_FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className="block text-sm font-medium mb-1">{f.label}</span>
          <span className="block text-xs text-gray-500 mb-2">{f.help}</span>
          <textarea
            value={identity[f.key]}
            onChange={(e) => update(f.key, e.target.value)}
            onBlur={() => save(identity)}
            rows={5}
            className="w-full border border-gray-300 rounded p-2 text-sm"
          />
        </label>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => save(identity)}
          className="bg-gray-900 text-white px-4 py-2 rounded text-sm"
        >
          Speichern
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
        {!error && savedAt && <span className="text-sm text-green-600">Gespeichert</span>}
      </div>

      <section className="border-t border-gray-200 pt-6 space-y-3">
        <header>
          <h2 className="text-lg font-semibold">Vorschläge aus deinen Edits</h2>
          <p className="text-sm text-gray-500">
            Wenn die KI ein wiederkehrendes Editier-Muster erkennt, erscheint es
            hier. Übernehmen schreibt es in Stimme oder Persona. Verwerfen
            schließt es aus weiteren Generates aus. Löschen entfernt es ganz.
          </p>
        </header>
        <PatternSuggestions
          brandId={brandId}
          voice={identity.voice}
          persona={identity.persona}
          onIdentityUpdated={applyIdentityFromApproval}
        />
      </section>

      <section className="border-t border-gray-200 pt-6 space-y-3 opacity-60">
        <header>
          <h2 className="text-base font-semibold">Aktuell ungenutzt</h2>
          <p className="text-xs text-gray-500">
            Diese Felder werden derzeit NICHT in den System-Prompt eingespeist
            (dead code). Sie sind weiter editierbar, falls sie später aktiviert
            werden, aber Eingaben hier beeinflussen aktuell keinen Generate.
          </p>
        </header>
        {INACTIVE_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block text-sm font-medium mb-1">
              {f.label}
              <span className="ml-2 text-xs uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                inactive
              </span>
            </span>
            <textarea
              value={identity[f.key]}
              onChange={(e) => update(f.key, e.target.value)}
              onBlur={() => save(identity)}
              rows={3}
              className="w-full border border-gray-300 rounded p-2 text-sm"
            />
          </label>
        ))}
      </section>
    </div>
  );
}
