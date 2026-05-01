import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { DEFAULT_METHODS, type Method } from '../../../../shared/schemas/method';

interface MethodDoc extends Method {
  id: string;
}

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

export function MethodsPage() {
  const { uid, brandId } = useActiveBrand();
  const [methods, setMethods] = useState<MethodDoc[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');

  useEffect(() => {
    if (!uid || !brandId) return;
    const col = collection(db, 'users', uid, 'brands', brandId, 'methods');
    let alive = true;
    (async () => {
      const initial = await getDocs(col);
      if (!alive) return;
      if (initial.empty) {
        for (const m of DEFAULT_METHODS) {
          await setDoc(doc(col, m.id), {
            name: m.name,
            slug: m.slug,
            description: m.description,
          });
        }
      }
    })();
    const unsub = onSnapshot(col, (snap) => {
      setMethods(
        snap.docs.map((d) => {
          const data = d.data() as Method;
          return { id: d.id, ...data };
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
    });
    setDraftName('');
    setDraftDesc('');
  }

  async function patch(id: string, p: Partial<Method>) {
    if (!uid || !brandId) return;
    await updateDoc(doc(db, 'users', uid, 'brands', brandId, 'methods', id), p);
  }

  async function remove(id: string) {
    if (!uid || !brandId) return;
    await deleteDoc(doc(db, 'users', uid, 'brands', brandId, 'methods', id));
  }

  if (!uid || !brandId) return <p className="text-gray-500">Brand wird geladen ...</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Methods</h1>
        <p className="text-sm text-gray-500">
          Methoden mit Slugs <code>story</code>, <code>liste</code>, <code>vorher-nachher</code>,{' '}
          <code>zitat</code> nutzen die mitgelieferten Prompt-Templates. Neue Methoden fallen auf
          ein generisches Template zurück, bis Prompt-Dateien ergänzt werden.
        </p>
      </header>

      <div className="border border-gray-200 rounded p-4 space-y-3">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Name (z. B. Anekdote)"
          className="w-full border border-gray-300 rounded p-2 text-sm"
        />
        <input
          type="text"
          value={draftDesc}
          onChange={(e) => setDraftDesc(e.target.value)}
          placeholder="Beschreibung (optional)"
          className="w-full border border-gray-300 rounded p-2 text-sm"
        />
        <div>
          <button
            type="button"
            onClick={add}
            disabled={!draftName.trim()}
            className="bg-gray-900 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            Hinzufügen
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {methods.map((m) => (
          <div key={m.id} className="border border-gray-200 rounded p-4 space-y-2">
            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={m.name}
                onChange={(e) => patch(m.id, { name: e.target.value })}
                className="flex-1 border border-gray-300 rounded p-2 text-sm"
              />
              <code className="text-xs text-gray-500">{m.slug}</code>
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="text-sm text-red-600 hover:underline"
              >
                Löschen
              </button>
            </div>
            <input
              type="text"
              value={m.description ?? ''}
              onChange={(e) => patch(m.id, { description: e.target.value })}
              placeholder="Beschreibung"
              className="w-full border border-gray-300 rounded p-2 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
