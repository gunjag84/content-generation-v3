import { Link } from 'react-router-dom';
import { engagementRate, safePublishedAt } from '../../../../shared/lib/stats';
import { isIgNativePost } from '../../../../shared/lib/postTypeGuards';
import type { PublishedPostWithId } from '../../hooks/usePublishedPosts';

interface Props {
  posts: PublishedPostWithId[];
}

export function RecentPosts({ posts }: Props) {
  const recent = posts.slice(0, 5);

  if (recent.length === 0) {
    return (
      <div className="border border-gray-200 rounded p-4 bg-white">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Letzte Posts</h2>
        <p className="text-xs text-gray-400">Noch keine veröffentlichten Posts.</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Letzte Posts</h2>
      <ul>
        {recent.map((post) => {
          const rawCaption =
            post.publishedSnapshot?.caption ?? post.caption ?? null;
          const title = rawCaption
            ? rawCaption.slice(0, 60)
            : 'Kein Titel';

          const date =
            safePublishedAt(post)?.toLocaleDateString('de-DE') ?? '—';

          const er = engagementRate(post.igStats ?? null, post.mediaType);
          const engagement = er !== null ? `${(er * 100).toFixed(1)}%` : '—';

          const inner = (
            <>
              <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                {isIgNativePost(post) && (
                  <span
                    className="shrink-0 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-pink-100 text-pink-700 rounded"
                    title="Aus dem Instagram-Feed"
                  >
                    IG
                  </span>
                )}
                <span className="truncate">{title}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {date} &middot; {engagement}
              </p>
            </>
          );

          // ig-native posts: no editor; link to IG permalink (external).
          if (isIgNativePost(post)) {
            const href = post.igPermalink ?? null;
            return (
              <li key={post.id}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:bg-gray-50 px-3 py-2 rounded"
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="block px-3 py-2 rounded">{inner}</div>
                )}
              </li>
            );
          }

          return (
            <li key={post.id}>
              <Link
                to={`/editor/${post.id}`}
                className="block hover:bg-gray-50 px-3 py-2 rounded"
              >
                {inner}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
