// /create page - subscribes to brand + situations + methods, renders CreateForm,
// streams /api/generate over NDJSON, navigates to /editor/:postId on complete.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useActiveBrand } from '../store/activeBrand';
import { streamGenerate } from '../lib/streamGenerate';
import { CreateForm, type MethodOption, type SituationOption } from '../components/create/CreateForm';
import type { GenerateRequest } from '../../../shared/schemas/generateRequest';
import type { FocusArea } from '../../../shared/schemas/focusArea';

interface BrandDocShape {
  focusAreas?: FocusArea[];
}

export default function Create() {
  const { uid, brandId } = useActiveBrand();
  const navigate = useNavigate();

  const [brand, setBrand] = useState<BrandDocShape | null>(null);
  const [situations, setSituations] = useState<SituationOption[]>([]);
  const [methods, setMethods] = useState<MethodOption[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Brand doc.
  useEffect(() => {
    if (!uid || !brandId) return;
    return onSnapshot(doc(db, 'users', uid, 'brands', brandId), (snap) => {
      setBrand((snap.data() as BrandDocShape) ?? null);
    });
  }, [uid, brandId]);

  // Situations sub-collection.
  useEffect(() => {
    if (!uid || !brandId) return;
    const q = query(
      collection(db, 'users', uid, 'brands', brandId, 'situations'),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      setSituations(
        snap.docs.map((d) => {
          const data = d.data() as { text?: string; createdAt?: Timestamp };
          return { id: d.id, text: data.text ?? '' };
        }),
      );
    });
  }, [uid, brandId]);

  // Methods sub-collection.
  useEffect(() => {
    if (!uid || !brandId) return;
    return onSnapshot(collection(db, 'users', uid, 'brands', brandId, 'methods'), (snap) => {
      setMethods(
        snap.docs.map((d) => {
          const data = d.data() as { name?: string; slug?: MethodOption['slug'] };
          return {
            id: d.id,
            name: data.name ?? d.id,
            slug: (data.slug ?? (d.id as MethodOption['slug'])) as MethodOption['slug'],
          };
        }),
      );
    });
  }, [uid, brandId]);

  const focusAreas = useMemo(() => brand?.focusAreas ?? [], [brand]);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function onSubmit(req: GenerateRequest) {
    if (!auth.currentUser) {
      setErrorMsg('Nicht eingeloggt.');
      return;
    }
    setSubmitting(true);
    setStreamText('');
    setErrorMsg(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const token = await auth.currentUser.getIdToken();

    await streamGenerate({
      token,
      body: req,
      signal: abortRef.current.signal,
      onChunk: (text) => setStreamText((prev) => prev + text),
      onComplete: ({ postId }) => {
        setSubmitting(false);
        navigate(`/editor/${postId}`);
      },
      onError: (err) => {
        setErrorMsg(err.message);
        setSubmitting(false);
      },
    });
  }

  function onCancel() {
    abortRef.current?.abort();
    setSubmitting(false);
  }

  if (!uid || !brandId) {
    return <section className="p-8"><p className="text-gray-500">Brand wird geladen ...</p></section>;
  }

  return (
    <section className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <h1 className="text-2xl font-semibold mb-4">Create</h1>
        <CreateForm
          brandId={brandId}
          focusAreas={focusAreas}
          situations={situations}
          methods={methods.length > 0 ? methods : DEFAULT_METHODS_FALLBACK}
          submitting={submitting}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
        {errorMsg && <p className="text-sm text-red-600 mt-3">{errorMsg}</p>}
      </div>
      <div className="bg-zinc-950 text-zinc-200 rounded p-4 overflow-auto max-h-[80vh] font-mono text-xs whitespace-pre-wrap">
        {submitting && !streamText && <span className="text-zinc-500">Warte auf Stream …</span>}
        {streamText || (!submitting && <span className="text-zinc-600">Live-Vorschau erscheint hier.</span>)}
      </div>
    </section>
  );
}

// Defensive fallback if the methods sub-collection hasn't been seeded yet.
const DEFAULT_METHODS_FALLBACK: MethodOption[] = [
  { id: 'story', slug: 'story', name: 'Story' },
  { id: 'liste', slug: 'liste', name: 'Liste' },
  { id: 'vorher-nachher', slug: 'vorher-nachher', name: 'Vorher/Nachher' },
  { id: 'zitat', slug: 'zitat', name: 'Zitat' },
];
