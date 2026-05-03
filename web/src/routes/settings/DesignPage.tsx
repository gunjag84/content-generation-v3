import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { uploadPhoto } from '../../lib/uploadPhoto';
import { BrandDesignSchema, type BrandDesign, type ZoneRole, type ZoneDefault } from '../../../../shared/schemas/brand';
import { FONT_FAMILIES, ensureFontLoaded } from '../../lib/font-loader';
import { ColorInput } from '../../components/ColorInput';

const ZONE_ROLES: { key: ZoneRole; label: string; description: string; fallback: ZoneDefault }[] = [
  { key: 'ACCENT', label: 'Hook', description: 'Größte Headline (Aufmerksamkeit)', fallback: { color: 'secondary', fontFamily: 'Inter', fontSize: 88 } },
  { key: 'BASE', label: 'Body', description: 'Standard-Fließtext', fallback: { color: 'secondary', fontFamily: 'Inter', fontSize: 56 } },
  { key: 'SUBTLE', label: 'Subtle', description: 'Subline / Detail', fallback: { color: 'secondary', fontFamily: 'Inter', fontSize: 36 } },
  { key: 'BRAND', label: 'Brand', description: 'Logo / Marken-Stempel', fallback: { color: 'secondary', fontFamily: 'Josefin Sans', fontSize: 80 } },
];

const EMPTY: BrandDesign = {
  primaryColor: '#000000',
  secondaryColor: '#ffffff',
  logoUrl: null,
  igHandle: '',
  zoneDefaults: {},
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

  function updateZoneDefault(role: ZoneRole, patch: Partial<ZoneDefault>) {
    const fallback = ZONE_ROLES.find((r) => r.key === role)!.fallback;
    const current = design.zoneDefaults?.[role] ?? fallback;
    const merged: ZoneDefault = { ...current, ...patch };
    if (patch.fontFamily) ensureFontLoaded(patch.fontFamily);
    update('zoneDefaults', { ...design.zoneDefaults, [role]: merged });
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
        <div>
          <span className="block text-sm font-medium mb-1">Primärfarbe</span>
          <ColorInput
            variant="light"
            value={design.primaryColor}
            onChange={(v) => update('primaryColor', v)}
          />
        </div>
        <div>
          <span className="block text-sm font-medium mb-1">Sekundärfarbe</span>
          <ColorInput
            variant="light"
            value={design.secondaryColor}
            onChange={(v) => update('secondaryColor', v)}
          />
        </div>
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

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Text-Defaults pro Zone</h2>
          <p className="text-sm text-gray-500">Standardwerte für neu generierte Slides. Im Editor pro Zone überschreibbar.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pr-3">Zone</th>
                <th className="pr-3">Farbe</th>
                <th className="pr-3">Font</th>
                <th className="pr-3">Größe (px)</th>
              </tr>
            </thead>
            <tbody>
              {ZONE_ROLES.map((row) => {
                const current = design.zoneDefaults?.[row.key] ?? row.fallback;
                return (
                  <tr key={row.key} className="align-top">
                    <td className="pr-3 pt-1.5">
                      <div className="font-medium">{row.label}</div>
                      <div className="text-xs text-gray-500">{row.description}</div>
                    </td>
                    <td className="pr-3">
                      <div className="flex gap-1">
                        {(['primary', 'secondary'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => updateZoneDefault(row.key, { color: opt })}
                            className={`px-2 py-1 text-xs border rounded ${
                              current.color === opt
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {opt === 'primary' ? 'Primär' : 'Sekundär'}
                            <span
                              className="inline-block w-3 h-3 ml-1.5 rounded-sm border border-black/20 align-middle"
                              style={{ backgroundColor: opt === 'primary' ? design.primaryColor : design.secondaryColor }}
                            />
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="pr-3">
                      <select
                        value={current.fontFamily}
                        onChange={(e) => updateZoneDefault(row.key, { fontFamily: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                      >
                        {FONT_FAMILIES.map((f) => (
                          <option key={f} value={f} style={{ fontFamily: f }}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="pr-3">
                      <input
                        type="number"
                        min={12}
                        max={400}
                        value={current.fontSize}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (Number.isFinite(v) && v > 0) updateZoneDefault(row.key, { fontSize: v });
                        }}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm tabular-nums"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

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
