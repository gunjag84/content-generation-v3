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
import { engagementRate } from '../../../../shared/lib/stats';
import type { IgStats } from '../../../../shared/schemas/post';

interface PostRow {
  id: string;
  title: string;
  thumb: string | null;
  publishedAt: Timestamp | null;
  igPermalink: string | null;
  igMediaId: string | null;
  igStats: IgStats | null;
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

function igLink(row: PostRow): string | null {
  if (row.igPermalink) return row.igPermalink;
  if (row.igMediaId) return `https://www.instagram.com/p/${row.igMediaId}/`;
  return null;
}

function PostStatsLine({ stats }: { stats: IgStats | null }) {
  if (!stats) return null;
  const er = engagementRate(stats);
  const cells: string[] = [];
  if (typeof stats.reach === 'number') cells.push(`${stats.reach.toLocaleString('de-DE')} Reach`);
  if (typeof stats.likes === 'number') cells.push(`${stats.likes.toLocaleString('de-DE')} Likes`);
  if (typeof stats.comments === 'number') cells.push(`${stats.comments.toLocaleString('de-DE')} Kommentare`);
  if (typeof stats.saves === 'number') cells.push(`${stats.saves.toLocaleString('de-DE')} Saves`);
  if (er !== null) cells.push(`${(er * 100).toFixed(1)}% Engagement`);
  if (cells.length === 0) return null;
  return <p className="text-[11px] text-gray-400 mt-0.5">{cells.join(' · ')}</p>;
}

export function HistoryTab() {
  const { uid, brandId } = useActiveBrand();
  const [posts, setPosts] = useState<PostRow[]>([]);

  useEffect(() => {
    if (!uid || !brandId) return;
    const q = query(
      collection(db, 'users', uid, 'brands', brandId, 'posts'),
      where('status', '==', 'published'),
      orderBy('publishedAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setPosts(
        snap.docs.slice(0, 50).map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: hookTitle(data),
            thumb: thumb(data),
            publishedAt: (data['publishedAt'] as Timestamp | null) ?? null,
            igPermalink: (data['igPermalink'] as string | null) ?? null,
            igMediaId: (data['igMediaId'] as string | null) ?? null,
            igStats: (data['igStats'] as IgStats | undefined) ?? null,
          };
        }),
      );
    });
    return unsub;
  }, [uid, brandId]);

  if (!uid || !brandId) return null;

  if (posts.length === 0) {
    return (
      <p className="p-8 text-gray-500 text-sm">Noch nichts veröffentlicht.</p>
    );
  }

  return (
    <ul className="divide-y divide-gray-200">
      {posts.map((p) => {
        const link = igLink(p);
        return (
          <li key={p.id} className="flex items-center gap-4 px-6 py-4">
            {/* Thumbnail */}
            <div className="shrink-0 w-12 h-12 rounded overflow-hidden bg-gray-100">
              {p.thumb ? (
                <img src={p.thumb} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-gray-400 text-xs">?</span>
              )}
            </div>

            {/* Title + date + stats */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Veröffentlicht: {formatTs(p.publishedAt)}
              </p>
              <PostStatsLine stats={p.igStats} />
            </div>

            {/* IG link */}
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-gray-400 hover:text-indigo-600"
                title="Auf Instagram ansehen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
