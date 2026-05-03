import { Link } from 'react-router-dom';
import { engagementRate, safePublishedAt } from '../../../../shared/lib/stats';
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

          const er = engagementRate(post.igStats ?? null);
          const engagement = er !== null ? `${(er * 100).toFixed(1)}%` : '—';

          return (
            <li key={post.id}>
              <Link
                to={`/editor/${post.id}`}
                className="block hover:bg-gray-50 px-3 py-2 rounded"
              >
                <p className="text-sm font-medium text-gray-900 truncate">
                  {title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {date} &middot; {engagement}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
