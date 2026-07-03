import { aggregateBy } from '../../../../shared/lib/stats';
import { isToolPost } from '../../../../shared/lib/postTypeGuards';
import type { PublishedPostWithId } from '../../hooks/usePublishedPosts';
import type { Post } from '../../../../shared/schemas/post';

interface Props {
  posts: PublishedPostWithId[];
}

type MethodKey = NonNullable<Post['method']> | 'unknown';

const METHOD_LABELS: Record<MethodKey, string> = {
  story: 'Story',
  liste: 'Liste',
  'vorher-nachher': 'Vorher/Nachher',
  zitat: 'Zitat',
  unknown: 'Unbekannt',
};

function fmtEng(v: number | null): string {
  if (v === null) return '—';
  return (v * 100).toFixed(1) + '%';
}

function fmtEdit(v: number | null): string {
  if (v === null) return '—';
  return (v * 100).toFixed(0) + '%';
}

export function MethodAggregate({ posts }: Props) {
  // ig-native posts have no `method` (no creation flow); they would all
  // collapse into 'unknown' and dilute the per-method signal. Filter them
  // out before bucketing.
  const toolPosts = posts.filter(isToolPost);
  const buckets = aggregateBy<MethodKey>(
    toolPosts,
    (p) => (p.method ?? 'unknown') as MethodKey,
    { minCount: 3 },
  );

  return (
    <div className="border border-zinc-700 rounded p-4 bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-300 mb-3">Performance pro Methode</h2>
      {buckets.size === 0 ? (
        <p className="text-xs text-zinc-500">Mindestens 3 Posts pro Methode nötig für Trends.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-zinc-800">
              <th className="pb-1 pr-3 font-medium">Methode</th>
              <th className="pb-1 pr-3 font-medium text-right">N</th>
              <th className="pb-1 pr-3 font-medium text-right">Engagement</th>
              <th className="pb-1 font-medium text-right">Edit-Ratio</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(buckets.entries())
              .sort(([, a], [, b]) => {
                if (a.avgEng === null && b.avgEng === null) return 0;
                if (a.avgEng === null) return 1;
                if (b.avgEng === null) return -1;
                return b.avgEng - a.avgEng;
              })
              .map(([method, bucket]) => (
                <tr key={method} className="border-b border-zinc-800 last:border-0">
                  <td className="py-1 pr-3 text-zinc-300">{METHOD_LABELS[method]}</td>
                  <td className="py-1 pr-3 text-right text-zinc-400">{bucket.n}</td>
                  <td className="py-1 pr-3 text-right text-zinc-400">{fmtEng(bucket.avgEng)}</td>
                  <td className="py-1 text-right text-zinc-400">{fmtEdit(bucket.avgEditRatio)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
