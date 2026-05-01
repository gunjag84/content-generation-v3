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
import { publishNow } from '../../lib/postActions';
import { SchedulePostModal } from '../../components/SchedulePostModal';

interface PostRow {
  id: string;
  title: string;
  thumb: string | null;
  updatedAt: Timestamp | null;
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
  const slides = data['slides'] as Array<{ zones?: Array<{ text?: string }> }> | undefined;
  if (slides && slides.length > 0) {
    const first = slides[0];
    const zone = first?.zones?.find((z) => z.text);
    if (zone?.text) return zone.text.slice(0, 80);
  }
  return 'Kein Titel';
}

export function DraftsTab() {
  const { uid, brandId } = useActiveBrand();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [schedulePostId, setSchedulePostId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!uid || !brandId) return;
    const q = query(
      collection(db, 'users', uid, 'brands', brandId, 'posts'),
      where('status', '==', 'draft'),
      orderBy('updatedAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setPosts(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: hookTitle(data),
            thumb: thumb(data),
            updatedAt: (data['updatedAt'] as Timestamp | null) ?? null,
          };
        }),
      );
    });
    return unsub;
  }, [uid, brandId]);

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
        Noch keine Drafts. <a href="/create" className="text-indigo-600 hover:underline">/create starten.</a>
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
              <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatTs(p.updatedAt)}</p>
            </button>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {errors[p.id] && (
                <span className="text-xs text-red-600">{errors[p.id]}</span>
              )}
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
    </>
  );
}
