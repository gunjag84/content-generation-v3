import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import type { FocusArea } from '../../../../shared/schemas/focusArea';

export function FocusAreasPage() {
  const { uid, brandId } = useActiveBrand();
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uid || !brandId) return;
    let alive = true;
    getDoc(doc(db, 'users', uid, 'brands', brandId)).then((snap) => {
      if (!alive) return;
      const data = snap.data();
      setFocusAreas((data?.focusAreas as FocusArea[]) ?? []);
    });
    return () => {
      alive = false;
    };
  }, [uid, brandId]);

  async function save(next: FocusArea[]) {
    if (!uid || !brandId) return;
    await updateDoc(doc(db, 'users', uid, 'brands', brandId), {
      focusAreas: next,
      updatedAt: serverTimestamp(),
    });
    setSavedAt(Date.now());
  }

  function update(next: FocusArea[]) {
    setFocusAreas(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(next), 1500);
  }

  function add() {
    update([...focusAreas, { id: crypto.randomUUID(), name: '', description: '' }]);
  }

  function remove(id: string) {
    update(focusAreas.filter((f) => f.id !== id));
  }

  function patch(id: string, patch: Partial<FocusArea>) {
    update(focusAreas.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  if (!uid || !brandId) return <p className="text-gray-500">Brand wird geladen ...</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Focus Areas</h1>
          <p className="text-sm text-gray-500">Themen-Schwerpunkte der Marke.</p>
        </div>
        <button
          type="button"
          onClick={add}
          className="bg-gray-900 text-white px-3 py-1.5 rounded text-sm"
        >
          Hinzufügen
        </button>
      </header>

      {focusAreas.length === 0 && (
        <p className="text-sm text-gray-500">Noch keine Focus Area angelegt.</p>
      )}

      <div className="space-y-4">
        {focusAreas.map((f) => (
          <div key={f.id} className="border border-gray-200 rounded p-4 space-y-3">
            <input
              type="text"
              value={f.name}
              onChange={(e) => patch(f.id, { name: e.target.value })}
              placeholder="Name"
              className="w-full border border-gray-300 rounded p-2 text-sm"
            />
            <textarea
              value={f.description}
              onChange={(e) => patch(f.id, { description: e.target.value })}
              placeholder="Beschreibung"
              rows={3}
              className="w-full border border-gray-300 rounded p-2 text-sm"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => remove(f.id)}
                className="text-sm text-red-600 hover:underline"
              >
                Löschen
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => save(focusAreas)}
          className="bg-gray-900 text-white px-4 py-2 rounded text-sm"
        >
          Speichern
        </button>
        {savedAt && <span className="text-sm text-green-600">Gespeichert</span>}
      </div>
    </div>
  );
}
