// Phase 4b dashboard: surfaces igStats + edit hot-spots from published posts.
// Single Firestore listener (last 100 published, brand-scoped) drives all widgets.
// Pure frontend; aggregation helpers live in shared/lib/stats.ts so a future
// Phase 4c Cloud Function can reuse them server-side.
import { useActiveBrand } from '../store/activeBrand';
import { usePublishedPosts } from '../hooks/usePublishedPosts';
import { StalenessHeader } from '../components/dashboard/StalenessHeader';
import { RecentPosts } from '../components/dashboard/RecentPosts';
import { TopPerformer } from '../components/dashboard/TopPerformer';
import { EditHotspots } from '../components/dashboard/EditHotspots';
import { MethodAggregate } from '../components/dashboard/MethodAggregate';
import { DayOfWeekAggregate } from '../components/dashboard/DayOfWeekAggregate';

export default function Dashboard() {
  const { uid, brandId } = useActiveBrand();
  const { posts, loading, error } = usePublishedPosts(brandId);

  if (!uid || !brandId) {
    return (
      <section className="p-8">
        <p className="text-zinc-400">Brand wird geladen ...</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col text-zinc-100">
      <StalenessHeader posts={posts} />
      {error && (
        <div className="px-8 pt-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-6 text-zinc-100">Dashboard</h1>
        {loading && posts.length === 0 ? (
          <p className="text-sm text-zinc-400">Lade ...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RecentPosts posts={posts} />
            <TopPerformer posts={posts} />
            <EditHotspots posts={posts} />
            <MethodAggregate posts={posts} />
            <DayOfWeekAggregate posts={posts} />
          </div>
        )}
      </div>
    </section>
  );
}
