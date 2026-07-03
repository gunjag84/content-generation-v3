// /create page - subscribes to situations + methods, renders CreateForm,
// streams /api/generate over NDJSON, navigates to /editor/:postId on complete.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useActiveBrand } from '../store/activeBrand';
import { streamGenerate } from '../lib/streamGenerate';
import { submitManual } from '../lib/submitManual';
import { CreateForm, type MethodOption, type SituationOption } from '../components/create/CreateForm';
import type { GenerateRequest } from '../../../shared/schemas/generateRequest';
import type { MethodMode } from '../../../shared/schemas/method';

// Default lengths for old brand docs that predate the lengths field.
const DEFAULT_LENGTHS = {
  short: { slideCount: 5 },
  medium: { slideCount: 7 },
  long: { slideCount: 9 },
} as const;

const DEFAULT_LENGTHS_ZITAT = {
  short: { slideCount: 1 },
  medium: { slideCount: 1 },
  long: { slideCount: 1 },
} as const;

export default function Create() {
  const { uid, brandId } = useActiveBrand();
  const navigate = useNavigate();

  const [situations, setSituations] = useState<SituationOption[]>([]);
  const [methods, setMethods] = useState<MethodOption[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
          const data = d.data() as {
            name?: string;
            slug?: string;
            mode?: MethodMode;
            lengths?: { short?: { slideCount?: number }; medium?: { slideCount?: number }; long?: { slideCount?: number } };
          };
          const slug = data.slug ?? d.id;
          const fallback = slug === 'zitat' ? DEFAULT_LENGTHS_ZITAT : DEFAULT_LENGTHS;
          const raw = data.lengths;
          return {
            id: d.id,
            name: data.name ?? d.id,
            slug,
            mode: data.mode ?? 'create-demand',
            lengths: {
              short: { slideCount: raw?.short?.slideCount ?? fallback.short.slideCount },
              medium: { slideCount: raw?.medium?.slideCount ?? fallback.medium.slideCount },
              long: { slideCount: raw?.long?.slideCount ?? fallback.long.slideCount },
            },
          };
        }),
      );
    });
  }, [uid, brandId]);

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

  async function onSubmitManual(req: GenerateRequest) {
    if (!auth.currentUser) {
      setErrorMsg('Nicht eingeloggt.');
      return;
    }
    setSubmitting(true);
    setManualSubmitting(true);
    setStreamText('');
    setErrorMsg(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const token = await auth.currentUser.getIdToken();

    await submitManual({
      token,
      body: req,
      signal: abortRef.current.signal,
      onComplete: ({ postId }) => {
        setSubmitting(false);
        setManualSubmitting(false);
        navigate(`/editor/${postId}`);
      },
      onError: (err) => {
        setErrorMsg(err.message);
        setSubmitting(false);
        setManualSubmitting(false);
      },
    });
  }

  function onCancel() {
    abortRef.current?.abort();
    setSubmitting(false);
    setManualSubmitting(false);
  }

  if (!uid || !brandId) {
    return <section className="p-8"><p className="text-zinc-400">Brand wird geladen ...</p></section>;
  }

  return (
    <section className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <h1 className="text-2xl font-semibold mb-4 text-zinc-100">Create</h1>
        <CreateForm
          brandId={brandId}
          situations={situations}
          methods={methods}
          submitting={submitting}
          onSubmit={onSubmit}
          onSubmitManual={onSubmitManual}
          onCancel={onCancel}
        />
        {errorMsg && <p className="text-sm text-red-400 mt-3">{errorMsg}</p>}
      </div>
      <div className="bg-zinc-950 text-zinc-200 rounded p-4 overflow-auto max-h-[80vh] font-mono text-xs whitespace-pre-wrap">
        {manualSubmitting && <span className="text-zinc-500">Erstelle Draft …</span>}
        {!manualSubmitting && submitting && !streamText && <span className="text-zinc-500">Warte auf Stream …</span>}
        {!manualSubmitting && (streamText.length > 0 ? streamText : (!submitting && <span className="text-zinc-600">Live-Vorschau erscheint hier.</span>))}
      </div>
    </section>
  );
}

