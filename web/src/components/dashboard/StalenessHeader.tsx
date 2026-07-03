import { freshestSyncedAt } from '../../../../shared/lib/stats';
import type { PublishedPostWithId } from '../../hooks/usePublishedPosts';

interface Props {
  posts: PublishedPostWithId[];
}

function formatHoursAgo(hoursAgo: number): string {
  if (hoursAgo < 1) return '<1h';
  if (hoursAgo >= 24) return `${Math.floor(hoursAgo / 24)}d`;
  return `${Math.floor(hoursAgo)}h`;
}

export function StalenessHeader({ posts }: Props) {
  if (posts.length === 0) return null;

  const fresh = freshestSyncedAt(posts);

  if (fresh === null) {
    return (
      <div className="px-4 py-2 text-xs border-b bg-amber-500/10 text-amber-400 border-amber-500/30">
        Stats wurden noch nie synchronisiert.
      </div>
    );
  }

  const hoursAgo = (Date.now() - fresh.getTime()) / 3.6e6;
  const isStale = hoursAgo > 12;
  const label = formatHoursAgo(hoursAgo);

  return (
    <div
      className={`px-4 py-2 text-xs border-b ${
        isStale
          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          : 'bg-zinc-900 text-zinc-400 border-zinc-700'
      }`}
    >
      {isStale
        ? `Stats können veraltet sein - letzte Synchronisation vor ${label}.`
        : `Letzte Synchronisation vor ${label}.`}
    </div>
  );
}
