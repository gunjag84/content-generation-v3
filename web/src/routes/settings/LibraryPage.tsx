import { useEffect, useState } from 'react';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { uploadPhoto } from '../../lib/uploadPhoto';

interface SituationDoc {
  id: string;
  text: string;
  imageUrls: string[];
  createdAt: Timestamp | null;
}

export function LibraryPage() {
  const { uid, brandId } = useActiveBrand();
  const [situations, setSituations] = useState<SituationDoc[]>([]);
  const [draftText, setDraftText] = useState('');
  const [draftFiles, setDraftFiles] = useState<FileList | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    if (!uid || !brandId) return;
    const q = query(
      collection(db, 'users', uid, 'brands', brandId, 'situations'),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      setSituations(
        snap.docs.map((d) => {
          const data = d.data() as { text?: string; imageUrls?: string[]; createdAt?: Timestamp };
          return {
            id: d.id,
            text: data.text ?? '',
            imageUrls: data.imageUrls ?? [],
            createdAt: data.createdAt ?? null,
          };
        }),
      );
    });
  }, [uid, brandId]);

  async function add() {
    if (!uid || !brandId || !draftText.trim()) return;
    const sitRef = await addDoc(collection(db, 'users', uid, 'brands', brandId, 'situations'), {
      text: draftText.trim(),
      imageUrls: [],
      createdAt: serverTimestamp(),
    });
    if (draftFiles) {
      for (const file of Array.from(draftFiles)) {
        const { url } = await uploadPhoto(file, uid, brandId, `situations/${sitRef.id}`);
        await updateDoc(doc(db, 'users', uid, 'brands', brandId, 'situations', sitRef.id), {
          imageUrls: arrayUnion(url),
        });
      }
    }
    setDraftText('');
    setDraftFiles(null);
  }

  async function remove(s: SituationDoc) {
    if (!uid || !brandId) return;
    await deleteDoc(doc(db, 'users', uid, 'brands', brandId, 'situations', s.id));
    for (const url of s.imageUrls) {
      try {
        // Best-effort: extract Storage path from download URL.
        // Firebase Storage download URLs encode the path in the /o/<path>?... segment.
        const m = url.match(/\/o\/([^?]+)/);
        if (m) {
          const path = decodeURIComponent(m[1]);
          await deleteObject(ref(storage, path));
        }
      } catch (err) {
        console.warn('storage delete failed', err);
      }
    }
  }

  async function saveEdit(id: string) {
    if (!uid || !brandId) return;
    await updateDoc(doc(db, 'users', uid, 'brands', brandId, 'situations', id), {
      text: editingText,
    });
    setEditingId(null);
  }

  if (!uid || !brandId) return <p className="text-zinc-400">Brand wird geladen ...</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Library</h1>
        <p className="text-sm text-zinc-400">Situationen mit Bildern als Inspiration.</p>
      </header>

      <div className="border border-zinc-700 rounded p-4 space-y-3">
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Neue Situation"
          rows={3}
          className="w-full border border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded p-2 text-sm"
        />
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => setDraftFiles(e.target.files)}
        />
        <div>
          <button
            type="button"
            onClick={add}
            disabled={!draftText.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            Hinzufügen
          </button>
        </div>
      </div>

      {situations.length === 0 && (
        <p className="text-sm text-zinc-400">Noch keine Situation angelegt.</p>
      )}

      <div className="space-y-4">
        {situations.map((s) => (
          <div key={s.id} className="border border-zinc-700 rounded p-4 space-y-3">
            {editingId === s.id ? (
              <textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                rows={3}
                className="w-full border border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded p-2 text-sm"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap text-zinc-100">{s.text.slice(0, 240)}</p>
            )}
            {s.imageUrls.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {s.imageUrls.map((url) => (
                  <img key={url} src={url} alt="" className="h-16 w-16 object-cover rounded" />
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              {editingId === s.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => saveEdit(s.id)}
                    className="text-sm text-cyan-400 hover:underline"
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-sm text-zinc-400 hover:underline"
                  >
                    Abbrechen
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(s.id);
                    setEditingText(s.text);
                  }}
                  className="text-sm text-cyan-400 hover:underline"
                >
                  Bearbeiten
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(s)}
                className="text-sm text-red-400 hover:underline"
              >
                Löschen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
