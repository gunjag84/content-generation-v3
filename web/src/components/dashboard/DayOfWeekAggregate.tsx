import { aggregateByDayOfWeek } from '../../../../shared/lib/stats';
import type { PublishedPostWithId } from '../../hooks/usePublishedPosts';

interface Props {
  posts: PublishedPostWithId[];
}

const DAY_LABELS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function fmtEng(v: number | null): string {
  if (v === null) return '—';
  return (v * 100).toFixed(1) + '%';
}

function fmtEditRatio(v: number | null): string {
  if (v === null) return '—';
  return (v * 100).toFixed(0) + '%';
}

export function DayOfWeekAggregate({ posts }: Props) {
  const buckets = aggregateByDayOfWeek(posts, { minCount: 3 });

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Performance pro Wochentag</h2>

      {buckets.size === 0 ? (
        <p className="text-xs text-gray-400">Mindestens 3 Posts pro Wochentag nötig für Trends.</p>
      ) : (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-1 font-medium">Tag</th>
                <th className="pb-1 font-medium text-right">N</th>
                <th className="pb-1 font-medium text-right">Engagement</th>
                <th className="pb-1 font-medium text-right">Edit-Ratio</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(buckets.entries())
                .sort((a, b) => {
                  const aEng = a[1].avgEng ?? -Infinity;
                  const bEng = b[1].avgEng ?? -Infinity;
                  return bEng - aEng;
                })
                .map(([day, bucket]) => (
                  <tr key={day} className="border-b border-gray-50 last:border-0">
                    <td className="py-1 text-gray-700">{DAY_LABELS_DE[day]}</td>
                    <td className="py-1 text-right text-gray-500">{bucket.n}</td>
                    <td className="py-1 text-right text-gray-700">{fmtEng(bucket.avgEng)}</td>
                    <td className="py-1 text-right text-gray-500">{fmtEditRatio(bucket.avgEditRatio)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="text-[10px] text-gray-400 mt-2">Tag in UTC.</p>
        </>
      )}
    </div>
  );
}
