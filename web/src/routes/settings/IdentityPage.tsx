import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { BrandIdentitySchema, type BrandIdentity } from '../../../../shared/schemas/brand';

const EMPTY: BrandIdentity = {
  voice: '',
  persona: '',
  product_uvp: '',
  point_of_view: '',
  competitive_landscape: '',
};

const FIELDS: Array<{ key: keyof BrandIdentity; label: string }> = [
  { key: 'voice', label: 'Stimme' },
  { key: 'persona', label: 'Persona' },
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

  if (!uid || !brandId) return <p className="text-gray-500">Brand wird geladen ...</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Identity</h1>
        <p className="text-sm text-gray-500">Stimme, Persona und Positionierung der Marke.</p>
      </header>
      {FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className="block text-sm font-medium mb-1">{f.label}</span>
          <textarea
            value={identity[f.key]}
            onChange={(e) => update(f.key, e.target.value)}
            onBlur={() => save(identity)}
            rows={4}
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
    </div>
  );
}
