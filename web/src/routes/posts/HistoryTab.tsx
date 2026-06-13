import { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useActiveBrand } from '../../store/activeBrand';
import { usePublishedPosts, type PublishedPostWithId } from '../../hooks/usePublishedPosts';
import {
  engagementRate,
  freshestSyncedAt,
  safePublishedAt,
} from '../../../../shared/lib/stats';
import { isIgNativePost } from '../../../../shared/lib/postTypeGuards';
import { extractPlainText } from '../../../../shared/types/slide';
import { formatDate, formatNumber, timeAgo } from '../../lib/format';
import { StatCard } from '../../components/posts/StatCard';
import { SortHeader } from '../../components/posts/SortHeader';
import {
  DateRangeFilter,
  DATE_RANGE_DAYS,
  type DateRange,
} from '../../components/posts/DateRangeFilter';

type SortField =
  | 'publishedAt'
  | 'reach'
  | 'impressions'
  | 'likes'
  | 'comments'
  | 'saves'
  | 'follows'
  | 'engagement';

interface Row {
  post: PublishedPostWithId;
  publishedDate: Date | null;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null; // displayed value (raw OR raw - ownComments depending on toggle)
  rawComments: number | null;
  ownComments: number | null;
  saves: number | null;
  follows: number | null;
  engagement: number | null;
}

const ENGAGEMENT_TOOLTIP =
  'Engagement Rate = Summe aller Interaktionen geteilt durch die Reichweite.\n\n' +
  'Bei Reels: (Likes + Kommentare + Saves + Shares) / Plays\n' +
  'Sonst: (Likes + Kommentare + Saves) / Reach\n\n' +
  'Toggle "Eigene Kommentare ausblenden" zieht eigene Replies vom Kommentar-Zähler ab. ' +
  'Eigene Likes können nicht herausgefiltert werden (Meta API gibt keine Liker-Identitäten frei).';

function thumb(post: PublishedPostWithId): string | null {
  // ig-native: no rendered slides, no photoUrls. Use the IG-supplied
  // thumbnailUrl (preferred for video) or mediaUrl.
  if (isIgNativePost(post)) {
    return post.thumbnailUrl ?? post.mediaUrl ?? null;
  }
  if (Array.isArray(post.renderedSlideUrls) && post.renderedSlideUrls.length > 0) {
    const first = post.renderedSlideUrls[0];
    if (typeof first === 'string') return first;
  }
  const photoUrls = post.photoUrls;
  if (photoUrls) return photoUrls['all'] ?? photoUrls['1'] ?? null;
  return null;
}

function hookTitle(post: PublishedPostWithId): string {
  // ig-native posts have no slides/zones; derive the title from caption only.
  if (!isIgNativePost(post)) {
    const slides = post.slides as Array<{ zones?: Array<{ text?: unknown }> }> | undefined;
    if (slides && slides.length > 0) {
      const zones = slides[0]?.zones ?? [];
      for (const z of zones) {
        const t = extractPlainText(z.text);
        if (t) return t;
      }
    }
  }
  const cap = post.publishedSnapshot?.caption ?? post.caption ?? '';
  return cap || 'Kein Titel';
}

function igLink(post: PublishedPostWithId): string | null {
  if (post.igPermalink) return post.igPermalink;
  if (post.igMediaId) return `https://www.instagram.com/p/${post.igMediaId}/`;
  return null;
}

function buildRow(post: PublishedPostWithId, excludeOwnComments: boolean): Row {
  const stats = post.igStats ?? null;
  const rawComments = stats?.comments ?? null;
  const ownComments = stats?.ownComments ?? null;
  const displayedComments =
    excludeOwnComments && rawComments !== null
      ? Math.max(0, rawComments - (ownComments ?? 0))
      : rawComments;
  return {
    post,
    publishedDate: safePublishedAt(post),
    reach: stats?.reach ?? null,
    impressions: stats?.impressions ?? null,
    likes: stats?.likes ?? null,
    comments: displayedComments,
    rawComments,
    ownComments,
    saves: stats?.saves ?? null,
    follows: stats?.follows ?? null,
    engagement: engagementRate(stats, post.mediaType, { excludeOwnComments }),
  };
}

function sortRows(rows: Row[], field: SortField, order: 'asc' | 'desc'): Row[] {
  const dir = order === 'desc' ? -1 : 1;
  const out = [...rows];
  out.sort((a, b) => {
    const av = field === 'publishedAt' ? (a.publishedDate?.getTime() ?? 0) : (a[field] ?? -Infinity);
    const bv = field === 'publishedAt' ? (b.publishedDate?.getTime() ?? 0) : (b[field] ?? -Infinity);
    if (av === bv) return 0;
    return av < bv ? -1 * dir : 1 * dir;
  });
  return out;
}

function inRange(row: Row, range: DateRange): boolean {
  const days = DATE_RANGE_DAYS[range];
  if (days === null) return true;
  if (!row.publishedDate) return false;
  const cutoff = Date.now() - days * 86400000;
  return row.publishedDate.getTime() >= cutoff;
}

export function HistoryTab() {
  const { uid, brandId } = useActiveBrand();
  const { posts, loading, error } = usePublishedPosts(brandId);

  const [range, setRange] = useState<DateRange>('all');
  const [sort, setSort] = useState<SortField>('publishedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [excludeOwnComments, setExcludeOwnComments] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSync() {
    if (!brandId || syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const fn = httpsCallable<{ brandId: string }, unknown>(functions, 'manualIgSync');
      await fn({ brandId });
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  }

  const allRows = useMemo(
    () => posts.map((p) => buildRow(p, excludeOwnComments)),
    [posts, excludeOwnComments],
  );

  const counts: Record<DateRange, number> = useMemo(
    () => ({
      '7d': allRows.filter((r) => inRange(r, '7d')).length,
      '30d': allRows.filter((r) => inRange(r, '30d')).length,
      '90d': allRows.filter((r) => inRange(r, '90d')).length,
      all: allRows.length,
    }),
    [allRows],
  );

  const filteredRows = useMemo(
    () => allRows.filter((r) => inRange(r, range)),
    [allRows, range],
  );

  const sortedRows = useMemo(
    () => sortRows(filteredRows, sort, order),
    [filteredRows, sort, order],
  );

  const totals = useMemo(() => {
    let count = 0;
    let reach = 0;
    let reachN = 0;
    let impressions = 0;
    let impressionsN = 0;
    let likes = 0;
    let likesN = 0;
    let comments = 0;
    let commentsN = 0;
    let saves = 0;
    let savesN = 0;
    for (const r of filteredRows) {
      count += 1;
      if (r.reach != null) { reach += r.reach; reachN += 1; }
      if (r.impressions != null) { impressions += r.impressions; impressionsN += 1; }
      if (r.likes != null) { likes += r.likes; likesN += 1; }
      if (r.comments != null) { comments += r.comments; commentsN += 1; }
      if (r.saves != null) { saves += r.saves; savesN += 1; }
    }
    return {
      count,
      reach: reachN > 0 ? reach : null,
      reachAvg: reachN > 0 ? reach / reachN : null,
      impressions: impressionsN > 0 ? impressions : null,
      impressionsAvg: impressionsN > 0 ? impressions / impressionsN : null,
      likes: likesN > 0 ? likes : null,
      likesAvg: likesN > 0 ? likes / likesN : null,
      comments: commentsN > 0 ? comments : null,
      commentsAvg: commentsN > 0 ? comments / commentsN : null,
      saves: savesN > 0 ? saves : null,
      savesAvg: savesN > 0 ? saves / savesN : null,
    };
  }, [filteredRows]);

  const lastSync = useMemo(() => freshestSyncedAt(posts), [posts]);

  const handleSort = (field: SortField) => {
    if (sort === field) {
      setOrder(order === 'desc' ? 'asc' : 'desc');
    } else {
      setSort(field);
      setOrder('desc');
    }
  };

  if (!uid || !brandId) return null;

  if (loading && posts.length === 0) {
    return <p className="p-8 text-sm text-gray-500">Lade ...</p>;
  }

  if (error) {
    return <p className="p-8 text-sm text-red-600">{error}</p>;
  }

  if (posts.length === 0) {
    return (
      <p className="p-8 text-sm text-gray-500">Noch nichts veröffentlicht.</p>
    );
  }

  const gridCols =
    'grid-cols-[minmax(0,1fr)_72px_72px_72px_72px_72px_72px_72px_24px]';

  return (
    <div className="p-6 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            {lastSync ? <>Stats {timeAgo(lastSync)} synchronisiert</> : 'Stats noch nicht synchronisiert'}
          </span>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="Feed + Stats von Instagram nachladen"
          >
            {syncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
          </button>
          {syncError && <span className="text-red-600">{syncError}</span>}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <label
            className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none"
            title="Zieht Kommentare ab, die der eigene IG-Account verfasst hat (Replies). Wirkt auf die Kommentar-Spalte und die Engagement-Rate. Eigene Likes können nicht ausgefiltert werden (Meta API gibt keine Liker-Identitäten frei)."
          >
            <input
              type="checkbox"
              checked={excludeOwnComments}
              onChange={(e) => setExcludeOwnComments(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            Eigene Kommentare ausblenden
          </label>
          <DateRangeFilter active={range} counts={counts} onChange={setRange} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatCard label="Posts" value={totals.count} />
        <StatCard label="Reach" value={totals.reach} avg={totals.reachAvg} />
        <StatCard label="Impressions" value={totals.impressions} avg={totals.impressionsAvg} />
        <StatCard label="Likes" value={totals.likes} avg={totals.likesAvg} />
        <StatCard label="Kommentare" value={totals.comments} avg={totals.commentsAvg} />
        <StatCard label="Saves" value={totals.saves} avg={totals.savesAvg} />
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded bg-white overflow-x-auto">
        <div className="min-w-[820px]">
          {/* Header row */}
          <div className={`grid ${gridCols} gap-3 px-4 py-3 border-b border-gray-200`}>
            <SortHeader field="publishedAt" label="Datum" active={sort} order={order} onSort={handleSort} />
            <SortHeader field="reach" label="Reach" active={sort} order={order} onSort={handleSort} align="right" />
            <SortHeader field="impressions" label="Impr." active={sort} order={order} onSort={handleSort} align="right" />
            <SortHeader field="likes" label="Likes" active={sort} order={order} onSort={handleSort} align="right" />
            <SortHeader field="comments" label="Komm." active={sort} order={order} onSort={handleSort} align="right" />
            <SortHeader field="saves" label="Saves" active={sort} order={order} onSort={handleSort} align="right" />
            <div className="text-right" title="Followers, die durch diesen Post gewonnen wurden (Meta-Insight `follows`). Nicht jeder Media-Typ liefert die Metric — leer = nicht verfügbar.">
              <SortHeader field="follows" label="Foll." active={sort} order={order} onSort={handleSort} align="right" />
            </div>
            <div className="text-right" title={ENGAGEMENT_TOOLTIP}>
              <SortHeader field="engagement" label="Eng. %" active={sort} order={order} onSort={handleSort} align="right" />
            </div>
            <span />
          </div>

          {/* Rows */}
          {sortedRows.map((r) => {
            const link = igLink(r.post);
            const hook = hookTitle(r.post);
            const cap = r.post.publishedSnapshot?.caption ?? r.post.caption ?? '';
            const t = thumb(r.post);
            return (
              <div
                key={r.post.id}
                className={`grid ${gridCols} gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 items-center`}
              >
                {/* Thumb + title + caption preview */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-100">
                    {t ? (
                      <img src={t} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="flex items-center justify-center w-full h-full text-gray-400 text-xs">?</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900 truncate flex items-center gap-1.5">
                      {isIgNativePost(r.post) && (
                        <span
                          className="shrink-0 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-pink-100 text-pink-700 rounded"
                          title="Aus dem Instagram-Feed sync'd"
                        >
                          IG
                        </span>
                      )}
                      <span className="truncate">
                        {hook.length > 70 ? hook.slice(0, 70) + '…' : hook}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      <span className="tabular-nums">{formatDate(r.publishedDate)}</span>
                      {cap && (
                        <span className="ml-2 truncate">
                          · {cap.length > 60 ? cap.slice(0, 60) + '…' : cap}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right text-sm text-gray-700 tabular-nums">
                  {formatNumber(r.reach)}
                </div>
                <div className="text-right text-sm text-gray-700 tabular-nums">
                  {formatNumber(r.impressions)}
                </div>
                <div className="text-right text-sm text-gray-700 tabular-nums">
                  {formatNumber(r.likes)}
                </div>
                <div
                  className="text-right text-sm text-gray-700 tabular-nums"
                  title={
                    excludeOwnComments && r.rawComments != null
                      ? `Brutto ${formatNumber(r.rawComments)} − eigene ${formatNumber(r.ownComments ?? 0)}`
                      : undefined
                  }
                >
                  {formatNumber(r.comments)}
                </div>
                <div className="text-right text-sm text-gray-700 tabular-nums">
                  {formatNumber(r.saves)}
                </div>
                <div className="text-right text-sm text-gray-700 tabular-nums">
                  {formatNumber(r.follows)}
                </div>
                <div className="text-right text-sm text-gray-700 tabular-nums">
                  {r.engagement != null ? (r.engagement * 100).toFixed(1) + '%' : '–'}
                </div>

                {/* IG link icon */}
                <div className="text-right">
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex text-gray-400 hover:text-indigo-600"
                      title="Auf Instagram ansehen"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}

          <div className="px-4 py-3 text-[11px] text-gray-500">
            {sortedRows.length} {sortedRows.length === 1 ? 'Post' : 'Posts'}
          </div>
        </div>
      </div>
    </div>
  );
}
