import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { uploadPhoto } from '../../lib/uploadPhoto';
import { BrandDesignSchema, type BrandDesign } from '../../../../shared/schemas/brand';

const EMPTY: BrandDesign = {
  primaryColor: '#000000',
  secondaryColor: '#ffffff',
  logoUrl: null,
  igHandle: '',
};

export function DesignPage() {
  const { uid, brandId } = useActiveBrand();
  const [design, setDesign] = useState<BrandDesign>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uid || !brandId) return;
    let alive = true;
    getDoc(doc(db, 'users', uid, 'brands', brandId)).then((snap) => {
      if (!alive) return;
      const data = snap.data();
      setDesign({ ...EMPTY, ...(data?.design ?? {}) });
    });
    return () => {
      alive = false;
    };
  }, [uid, brandId]);

  async function save(next: BrandDesign) {
    if (!uid || !brandId) return;
    const parsed = BrandDesignSchema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(', '));
      return;
    }
    setError(null);
    await updateDoc(doc(db, 'users', uid, 'brands', brandId), {
      design: parsed.data,
      updatedAt: serverTimestamp(),
    });
    setSavedAt(Date.now());
  }

  function update<K extends keyof BrandDesign>(key: K, value: BrandDesign[K]) {
    const next = { ...design, [key]: value };
    setDesign(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(next), 1500);
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid || !brandId) return;
    const { url } = await uploadPhoto(file, uid, brandId, '', { resize: true, maxWidth: 512 });
    const next = { ...design, logoUrl: url };
    setDesign(next);
    await save(next);
  }

  if (!uid || !brandId) return <p className="text-gray-500">Brand wird geladen ...</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Design</h1>
        <p className="text-sm text-gray-500">Farben, Logo und Instagram-Handle der Marke.</p>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-sm font-medium mb-1">Primärfarbe</span>
          <input
            type="color"
            value={design.primaryColor}
            onChange={(e) => update('primaryColor', e.target.value)}
            className="h-10 w-full"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1">Sekundärfarbe</span>
          <input
            type="color"
            value={design.secondaryColor}
            onChange={(e) => update('secondaryColor', e.target.value)}
            className="h-10 w-full"
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-sm font-medium mb-1">Logo</span>
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onLogoChange} />
        {design.logoUrl && (
          <img src={design.logoUrl} alt="Logo" className="mt-2 h-16 object-contain" />
        )}
      </label>

      <label className="block">
        <span className="block text-sm font-medium mb-1">Instagram-Handle</span>
        <input
          type="text"
          value={design.igHandle}
          onChange={(e) => update('igHandle', e.target.value)}
          onBlur={() => save(design)}
          placeholder="ohne @"
          className="w-full border border-gray-300 rounded p-2 text-sm"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => save(design)}
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
