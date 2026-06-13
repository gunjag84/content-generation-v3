import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { deletePost, publishNow, resetPostToDraft } from '../../lib/postActions';
import { SchedulePostModal } from '../../components/SchedulePostModal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { extractPlainText } from '../../../../shared/types/slide';

interface PostRow {
  id: string;
  title: string;
  thumb: string | null;
  updatedAt: Timestamp | null;
  status: 'draft' | 'error';
  errorMsg: string | null;
}

const fmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function formatTs(ts: Timestamp | null): string {
  if (!ts) return '';
  return fmt.format(ts.toDate());
}

function thumb(data: Record<string, unknown>): string | null {
  const urls = data['renderedSlideUrls'];
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === 'string') return urls[0];
  const photoUrls = data['photoUrls'] as Record<string, string> | undefined;
  if (photoUrls) return photoUrls['all'] ?? photoUrls['1'] ?? null;
  return null;
}

function hookTitle(data: Record<string, unknown>): string {
  const slides = data['slides'] as Array<{ zones?: Array<{ text?: unknown }> }> | undefined;
  if (slides && slides.length > 0) {
    const zones = slides[0]?.zones ?? [];
    for (const z of zones) {
      const t = extractPlainText(z.text);
      if (t) return t.slice(0, 80);
    }
  }
  return 'Kein Titel';
}

export function DraftsTab() {
  const { uid, brandId } = useActiveBrand();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [schedulePostId, setSchedulePostId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!uid || !brandId) return;
    // Include 'error' so failed publishes don't silently disappear from every tab.
    const q = query(
      collection(db, 'users', uid, 'brands', brandId, 'posts'),
      where('status', 'in', ['draft', 'error']),
      orderBy('updatedAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setPosts(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const status = (data['status'] as 'draft' | 'error') ?? 'draft';
          return {
            id: d.id,
            title: hookTitle(data),
            thumb: thumb(data),
            updatedAt: (data['updatedAt'] as Timestamp | null) ?? null,
            status,
            errorMsg: status === 'error' ? ((data['error'] as string) ?? 'Unbekannter Fehler') : null,
          };
        }),
      );
    });
    return unsub;
  }, [uid, brandId]);

  async function handleReset(postId: string) {
    if (!uid || !brandId) return;
    setResettingId(postId);
    setErrors((prev) => ({ ...prev, [postId]: '' }));
    try {
      await resetPostToDraft(uid, brandId, postId);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [postId]: err instanceof Error ? err.message : 'Fehler',
      }));
    } finally {
      setResettingId(null);
    }
  }

  async function handleDelete() {
    if (!uid || !brandId || !deletePostId) return;
    setDeleting(true);
    setErrors((prev) => ({ ...prev, [deletePostId]: '' }));
    try {
      await deletePost(uid, brandId, deletePostId);
      setDeletePostId(null);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [deletePostId]: err instanceof Error ? err.message : 'Fehler',
      }));
    } finally {
      setDeleting(false);
    }
  }

  async function handlePublishNow(postId: string) {
    if (!brandId) return;
    setPublishingId(postId);
    setErrors((prev) => ({ ...prev, [postId]: '' }));
    try {
      await publishNow(brandId, postId);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [postId]: err instanceof Error ? err.message : 'Fehler',
      }));
    } finally {
      setPublishingId(null);
    }
  }

  if (!uid || !brandId) return null;

  if (posts.length === 0) {
    return (
      <p className="p-8 text-gray-500 text-sm">
        Noch keine Drafts oder fehlgeschlagene Beiträge. <a href="/create" className="text-indigo-600 hover:underline">/create starten.</a>
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-gray-200">
        {posts.map((p) => (
          <li key={p.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
            {/* Thumbnail */}
            <button
              className="shrink-0 w-12 h-12 rounded overflow-hidden bg-gray-100 focus:outline-none"
              onClick={() => navigate(`/editor/${p.id}`)}
              title="Im Editor öffnen"
            >
              {p.thumb ? (
                <img src={p.thumb} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-gray-400 text-xs">?</span>
              )}
            </button>

            {/* Title + date */}
            <button
              className="flex-1 text-left min-w-0"
              onClick={() => navigate(`/editor/${p.id}`)}
            >
              <div className="flex items-center gap-2">
                {p.status === 'error' && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700 rounded">
                    Fehler
                  </span>
                )}
                <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {p.status === 'error' && p.errorMsg
                  ? <span className="text-red-600">{p.errorMsg}</span>
                  : formatTs(p.updatedAt)}
              </p>
            </button>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {errors[p.id] && (
                <span className="text-xs text-red-600">{errors[p.id]}</span>
              )}
              {p.status === 'error' ? (
                <button
                  onClick={() => handleReset(p.id)}
                  disabled={resettingId === p.id}
                  className="px-3 py-1.5 text-xs border border-amber-400 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
                  title="Auf Draft zurücksetzen, um neu zu veröffentlichen"
                >
                  {resettingId === p.id ? 'Wird zurückgesetzt …' : 'Zurücksetzen'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setSchedulePostId(p.id)}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
                  >
                    Einplanen
                  </button>
                  <button
                    onClick={() => handlePublishNow(p.id)}
                    disabled={publishingId === p.id}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {publishingId === p.id ? 'Wird veröffentlicht …' : 'Jetzt veröffentlichen'}
                  </button>
                </>
              )}
              <button
                onClick={() => setDeletePostId(p.id)}
                className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                title="Beitrag löschen"
              >
                Löschen
              </button>
            </div>
          </li>
        ))}
      </ul>

      {schedulePostId && brandId && (
        <SchedulePostModal
          open={true}
          postId={schedulePostId}
          brandId={brandId}
          onClose={() => setSchedulePostId(null)}
          onScheduled={() => setSchedulePostId(null)}
        />
      )}

      <ConfirmModal
        open={deletePostId !== null}
        title="Beitrag löschen?"
        message="Dieser Beitrag wird endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => { if (!deleting) setDeletePostId(null); }}
      />
    </>
  );
}
