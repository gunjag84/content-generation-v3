import { useEffect, useState } from 'react';
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
import { cancelSchedule, deletePost, publishNow } from '../../lib/postActions';
import { ConfirmModal } from '../../components/ConfirmModal';
import { extractPlainText } from '../../../../shared/types/slide';

interface PostRow {
  id: string;
  title: string;
  thumb: string | null;
  scheduledAt: Timestamp | null;
  status: string;
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

export function ScheduledTab() {
  const { uid, brandId } = useActiveBrand();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!uid || !brandId) return;
    const q = query(
      collection(db, 'users', uid, 'brands', brandId, 'posts'),
      where('status', 'in', ['scheduled', 'publishing']),
      orderBy('scheduledAt', 'asc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setPosts(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: hookTitle(data),
            thumb: thumb(data),
            scheduledAt: (data['scheduledAt'] as Timestamp | null) ?? null,
            status: (data['status'] as string) ?? '',
          };
        }),
      );
    });
    return unsub;
  }, [uid, brandId]);

  async function handleCancel(postId: string) {
    if (!brandId) return;
    setActionId(postId);
    setErrors((prev) => ({ ...prev, [postId]: '' }));
    try {
      await cancelSchedule(brandId, postId);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [postId]: err instanceof Error ? err.message : 'Fehler',
      }));
    } finally {
      setActionId(null);
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
    setActionId(postId);
    setErrors((prev) => ({ ...prev, [postId]: '' }));
    try {
      await publishNow(brandId, postId);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [postId]: err instanceof Error ? err.message : 'Fehler',
      }));
    } finally {
      setActionId(null);
    }
  }

  if (!uid || !brandId) return null;

  if (posts.length === 0) {
    return (
      <>
        <p className="p-8 text-gray-500 text-sm">Noch keine geplanten Beiträge.</p>
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

  return (
    <>
    <ul className="divide-y divide-gray-200">
      {posts.map((p) => (
        <li key={p.id} className="flex items-center gap-4 px-6 py-4">
          {/* Thumbnail */}
          <div className="shrink-0 w-12 h-12 rounded overflow-hidden bg-gray-100">
            {p.thumb ? (
              <img src={p.thumb} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="flex items-center justify-center w-full h-full text-gray-400 text-xs">?</span>
            )}
          </div>

          {/* Title + scheduled time */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {p.status === 'publishing' ? (
                <span className="text-amber-600">Wird veröffentlicht …</span>
              ) : (
                <>Geplant: {formatTs(p.scheduledAt)}</>
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {errors[p.id] && (
              <span className="text-xs text-red-600">{errors[p.id]}</span>
            )}
            {p.status === 'scheduled' && (
              <>
                <button
                  onClick={() => handleCancel(p.id)}
                  disabled={actionId === p.id}
                  className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50 underline"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => handlePublishNow(p.id)}
                  disabled={actionId === p.id}
                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  Jetzt veröffentlichen
                </button>
                <button
                  onClick={() => setDeletePostId(p.id)}
                  className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                  title="Beitrag löschen"
                >
                  Löschen
                </button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>

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
