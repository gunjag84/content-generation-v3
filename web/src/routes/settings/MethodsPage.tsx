import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { DEFAULT_METHODS, type Method, type MethodMode } from '../../../../shared/schemas/method';

interface MethodDoc extends Method {
  id: string;
}

// Lookup map for defensive defaults on existing docs that predate mode/slideCount.
const DEFAULT_BY_SLUG = new Map(DEFAULT_METHODS.map((m) => [m.slug, m]));

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
  const [draftDesc, setDraftDesc] = useState('');

  useEffect(() => {
    if (!uid || !brandId) return;
    const col = collection(db, 'users', uid, 'brands', brandId, 'methods');
    let alive = true;

    const unsub = onSnapshot(col, async (snap) => {
      if (!alive) return;

      // Idempotent seed: ensure all 6 DEFAULT_METHODS slugs exist.
      const existingSlugs = new Set(snap.docs.map((d) => d.id));
      for (const m of DEFAULT_METHODS) {
        if (!existingSlugs.has(m.id)) {
          await setDoc(doc(col, m.id), {
            name: m.name,
            slug: m.slug,
            description: m.description,
            mode: m.mode,
            slideCount: m.slideCount,
          });
        }
      }

      // Repair-on-load: patch existing docs missing mode or slideCount.
      const repairs: Promise<void>[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Partial<Method>;
        const missing = data.mode === undefined || data.slideCount === undefined;
        if (missing) {
          const defaults = DEFAULT_BY_SLUG.get(d.id);
          repairs.push(
            updateDoc(doc(col, d.id), {
              mode: data.mode ?? defaults?.mode ?? 'create-demand',
              slideCount: data.slideCount ?? defaults?.slideCount ?? 7,
            }),
          );
        }
      }
      if (repairs.length > 0) await Promise.all(repairs);

      if (!alive) return;
      setMethods(
        snap.docs.map((d) => {
          const data = d.data() as Partial<Method>;
          const defaults = DEFAULT_BY_SLUG.get(d.id);
          return {
            id: d.id,
            name: data.name ?? d.id,
            slug: data.slug ?? d.id,
            description: data.description ?? '',
            mode: data.mode ?? defaults?.mode ?? 'create-demand',
            slideCount: data.slideCount ?? defaults?.slideCount ?? 7,
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
      description: draftDesc,
      mode: activeTab,
      slideCount: 7,
    });
    setDraftName('');
    setDraftDesc('');
  }

  async function patch(id: string, p: Partial<Method>) {
    if (!uid || !brandId) return;
    await updateDoc(doc(db, 'users', uid, 'brands', brandId, 'methods', id), p as Record<string, unknown>);
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
        <textarea
          value={draftDesc}
          onChange={(e) => setDraftDesc(e.target.value)}
          placeholder="Beschreibung (optional) - wird als Prompt-Definition verwendet"
          rows={3}
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
          <div key={m.id} className="border border-gray-200 rounded p-4 space-y-3">
            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={m.name}
                onChange={(e) => patch(m.id, { name: e.target.value })}
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
            <textarea
              value={m.description ?? ''}
              onChange={(e) => patch(m.id, { description: e.target.value })}
              placeholder="Beschreibung"
              rows={3}
              className="w-full border border-gray-300 rounded p-2 text-sm"
            />
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 uppercase tracking-wider">Slides</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={m.slideCount}
                  onChange={(e) => patch(m.id, { slideCount: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)) })}
                  className="w-16 border border-gray-300 rounded p-1.5 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 uppercase tracking-wider">Mode</label>
                <select
                  value={m.mode}
                  onChange={(e) => patch(m.id, { mode: e.target.value as MethodMode })}
                  className="border border-gray-300 rounded p-1.5 text-sm"
                >
                  {MODES.map((mo) => (
                    <option key={mo.value} value={mo.value}>{mo.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
