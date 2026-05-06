import { Link } from 'react-router-dom';
import {
  engagementRate,
  filterByPublishedSince,
  safePublishedAt,
} from '../../../../shared/lib/stats';
import { isIgNativePost } from '../../../../shared/lib/postTypeGuards';
import type { PublishedPostWithId } from '../../hooks/usePublishedPosts';

interface Props {
  posts: PublishedPostWithId[];
}

export function TopPerformer({ posts }: Props) {
  const last30d = filterByPublishedSince(posts, 30) as PublishedPostWithId[];

  const withEr = last30d
    .map((post) => ({ post, er: engagementRate(post.igStats ?? null, post.mediaType) }))
    .filter((item): item is { post: PublishedPostWithId; er: number } => item.er !== null);

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Top Post (30 Tage)</h2>

      {withEr.length === 0 ? (
        <p className="text-sm text-gray-400">Noch keine Stats für die letzten 30 Tage.</p>
      ) : (
        (() => {
          const { post, er } = withEr.reduce((best, cur) =>
            cur.er > best.er ? cur : best,
          );

          const caption = post.publishedSnapshot?.caption ?? post.caption ?? '';
          const title = caption.length > 80 ? caption.slice(0, 80) + '…' : caption;
          const publishedDate = safePublishedAt(post);
          const dateStr = publishedDate
            ? publishedDate.toLocaleDateString('de-DE')
            : '–';
          const erPct = (er * 100).toFixed(1) + '%';
          const methodLabel = post.method ?? (isIgNativePost(post) ? 'IG-Feed' : '–');

          // ig-native posts have no editor entry (no aiSnapshot, no slides
          // to edit). Link out to IG instead.
          const inner = (
            <>
              <p className="text-sm text-gray-800 font-medium leading-snug">
                {title || 'Kein Titel'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {dateStr} · {erPct} Engagement · {methodLabel}
              </p>
            </>
          );

          if (isIgNativePost(post)) {
            const href = post.igPermalink ?? null;
            if (!href) {
              return <div className="-mx-2 px-2 py-1">{inner}</div>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded"
              >
                {inner}
              </a>
            );
          }

          return (
            <Link
              to={`/editor/${post.id}`}
              className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded"
            >
              {inner}
            </Link>
          );
        })()
      )}
    </div>
  );
}
