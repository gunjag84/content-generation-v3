import { hotspotZone } from '../../../../shared/lib/stats';
import type { PublishedPostWithId } from '../../hooks/usePublishedPosts';

interface Props {
  posts: PublishedPostWithId[];
}

const ZONE_LABELS_DE = {
  hook: 'Hook',
  body: 'Body',
  cta: 'CTA',
  caption: 'Caption',
} as const;

export function EditHotspots({ posts }: Props) {
  const last10 = posts.slice(0, 10);
  const hot = hotspotZone(last10);

  return (
    <div className="border border-zinc-700 rounded p-4 bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-300 mb-3">Edit-Hot-Spot</h2>
      {hot === null ? (
        <p className="text-xs text-zinc-500">Noch keine Edit-Daten verfügbar.</p>
      ) : (
        <>
          <div className="text-2xl font-semibold text-zinc-100">
            {ZONE_LABELS_DE[hot.zone]}
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            {(hot.avg * 100).toFixed(0)}% Änderung im Schnitt
          </div>
          <div className="text-[10px] text-zinc-500 mt-2">
            Über die letzten {last10.length} Posts
          </div>
        </>
      )}
    </div>
  );
}
