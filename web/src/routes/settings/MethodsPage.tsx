import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { DEFAULT_METHODS, type LengthKey, type Method, type MethodMode } from '../../../../shared/schemas/method';

interface MethodDoc extends Method {
  id: string;
}

// Lookup map for defensive defaults on existing docs that predate the lengths field.
const DEFAULT_BY_SLUG = new Map(DEFAULT_METHODS.map((m) => [m.slug, m]));

const LENGTH_LABELS: Array<{ key: LengthKey; label: string }> = [
  { key: 'short', label: 'Kurz' },
  { key: 'medium', label: 'Mittel' },
  { key: 'long', label: 'Lang' },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[/\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const MODES: Array<{ value: MethodMode; label: string }> = [
  { value: 'create-demand', label: 'Create Demand' },
  { value: 'convert-demand', label: 'Convert Demand' },
];

export function MethodsPage() {
  const { uid, brandId } = useActiveBrand();
  const [methods, setMethods] = useState<MethodDoc[]>([]);
  const [activeTab, setActiveTab] = useState<MethodMode>('create-demand');
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    if (!uid || !brandId) return;
    const col = collection(db, 'users', uid, 'brands', brandId, 'methods');
    let alive = true;

    const unsub = onSnapshot(col, async (snap) => {
      if (!alive) return;

      // Idempotent seed: ensure all DEFAULT_METHODS slugs exist.
      const existingSlugs = new Set(snap.docs.map((d) => d.id));
      for (const m of DEFAULT_METHODS) {
        if (!existingSlugs.has(m.id)) {
          await setDoc(doc(col, m.id), {
            name: m.name,
            slug: m.slug,
            mode: m.mode,
            lengths: m.lengths,
          });
        }
      }

      // Repair-on-load: migrate old docs that have slideCount + description but no lengths.
      const repairs: Promise<void>[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (data.lengths !== undefined) continue; // already migrated
        const oldCount = typeof data.slideCount === 'number' ? data.slideCount : 7;
        const defaults = DEFAULT_BY_SLUG.get(d.id);
        repairs.push(
          updateDoc(doc(col, d.id), {
            'lengths.short.slideCount': Math.max(1, oldCount - 2),
            'lengths.short.description': '',
            'lengths.medium.slideCount': oldCount,
            'lengths.medium.description': defaults?.lengths.medium.description ?? (typeof data.description === 'string' ? data.description : ''),
            'lengths.long.slideCount': Math.min(10, oldCount + 2),
            'lengths.long.description': '',
            slideCount: deleteField(),
            description: deleteField(),
          }),
        );
      }
      if (repairs.length > 0) await Promise.all(repairs);

      if (!alive) return;
      setMethods(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const defaults = DEFAULT_BY_SLUG.get(d.id);
          const rawLengths = data.lengths as Partial<Method['lengths']> | undefined;
          return {
            id: d.id,
            name: typeof data.name === 'string' ? data.name : d.id,
            slug: typeof data.slug === 'string' ? data.slug : d.id,
            mode: (data.mode as MethodMode | undefined) ?? defaults?.mode ?? 'create-demand',
            lengths: {
              short: {
                description: rawLengths?.short?.description ?? defaults?.lengths.short.description ?? '',
                slideCount: rawLengths?.short?.slideCount ?? defaults?.lengths.short.slideCount ?? 5,
              },
              medium: {
                description: rawLengths?.medium?.description ?? defaults?.lengths.medium.description ?? '',
                slideCount: rawLengths?.medium?.slideCount ?? defaults?.lengths.medium.slideCount ?? 7,
              },
              long: {
                description: rawLengths?.long?.description ?? defaults?.lengths.long.description ?? '',
                slideCount: rawLengths?.long?.slideCount ?? defaults?.lengths.long.slideCount ?? 9,
              },
            },
          };
        }),
      );
    });

    return () => {
      alive = false;
      unsub();
    };
  }, [uid, brandId]);

  async function add() {
    if (!uid || !brandId || !draftName.trim()) return;
    const slug = slugify(draftName);
    if (!slug) return;
    await addDoc(collection(db, 'users', uid, 'brands', brandId, 'methods'), {
      name: draftName.trim(),
      slug,
      mode: activeTab,
      lengths: {
        short: { description: '', slideCount: 5 },
        medium: { description: '', slideCount: 7 },
        long: { description: '', slideCount: 9 },
      },
    });
    setDraftName('');
  }

  // Supports dot-path keys like 'lengths.short.description' for nested Firestore updates.
  async function patch(id: string, field: string, value: unknown) {
    if (!uid || !brandId) return;
    await updateDoc(doc(db, 'users', uid, 'brands', brandId, 'methods', id), { [field]: value });
  }

  async function remove(id: string) {
    if (!uid || !brandId) return;
    await deleteDoc(doc(db, 'users', uid, 'brands', brandId, 'methods', id));
  }

  if (!uid || !brandId) return <p className="text-gray-500">Brand wird geladen ...</p>;

  const visibleMethods = methods.filter((m) => m.mode === activeTab);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Methods</h1>
        <p className="text-sm text-gray-500">
          Methoden mit shipped Prompt-Templates (<code>story</code>, <code>liste</code>,{' '}
          <code>vorher-nachher</code>, <code>zitat</code>, <code>hormozi-ve</code>,{' '}
          <code>twist-the-knife</code>) nutzen die mitgelieferten Slide-Strukturen. Eigene Methoden
          fallen auf das generische Template zurück und werden vollständig durch deine Beschreibung
          gesteuert.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setActiveTab(m.value)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px ${
              activeTab === m.value
                ? 'border-gray-900 text-gray-900 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Add form */}
      <div className="border border-gray-200 rounded p-4 space-y-3">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Name (z. B. Anekdote)"
          className="w-full border border-gray-300 rounded p-2 text-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draftName.trim()}
          className="bg-gray-900 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
        >
          Hinzufügen
        </button>
      </div>

      {/* Method cards for active tab */}
      <div className="space-y-3">
        {visibleMethods.length === 0 && (
          <p className="text-sm text-gray-400">Noch keine Methode in diesem Tab.</p>
        )}
        {visibleMethods.map((m) => (
          <div key={m.id} className="border border-gray-200 rounded p-4 space-y-4">
            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={m.name}
                onChange={(e) => patch(m.id, 'name', e.target.value)}
                className="flex-1 border border-gray-300 rounded p-2 text-sm"
              />
              <code className="text-xs text-gray-500 shrink-0">{m.slug}</code>
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="text-sm text-red-600 hover:underline shrink-0"
              >
                Löschen
              </button>
            </div>
            {LENGTH_LABELS.map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <span className="block text-xs font-medium uppercase tracking-wider text-gray-500">{label}</span>
                <div className="flex gap-2 items-start">
                  <textarea
                    value={m.lengths[key].description}
                    onChange={(e) => patch(m.id, `lengths.${key}.description`, e.target.value)}
                    placeholder="Beschreibung (wird als Prompt-Definition verwendet)"
                    rows={3}
                    className="flex-1 border border-gray-300 rounded p-2 text-sm"
                  />
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <label className="text-xs text-gray-500 uppercase tracking-wider">Slides</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={m.lengths[key].slideCount}
                      onChange={(e) => patch(m.id, `lengths.${key}.slideCount`, Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
                      className="w-16 border border-gray-300 rounded p-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
