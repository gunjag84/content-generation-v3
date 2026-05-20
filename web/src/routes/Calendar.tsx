// /calendar — read-only month-view calendar.
// Shows posts for the active brand with state dots (draft/scheduled/published).
// Navigation: ‹ › chevrons + clickable month-year header opens a year picker.
// Click a post-dot navigates to /posts/<postId> (editor via posts list, simpler than popover).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useActiveBrand } from '../store/activeBrand';
import { MonthHeader } from '../components/calendar/MonthHeader';
import { MonthGrid, type CalPost } from '../components/calendar/MonthGrid';

// Extract a display title from a raw Firestore post doc.
function hookTitle(data: Record<string, unknown>): string {
  const slides = data['slides'] as Array<{ zones?: Array<{ text?: string }> }> | undefined;
  if (slides && slides.length > 0) {
    const zone = slides[0]?.zones?.find((z) => z.text);
    if (zone?.text) return zone.text.slice(0, 60);
  }
  return 'Kein Titel';
}

// Resolve the best date for calendar placement: scheduledAt > publishedAt > createdAt.
function resolveDate(data: Record<string, unknown>): Date | null {
  const fields = ['scheduledAt', 'publishedAt', 'createdAt'] as const;
  for (const f of fields) {
    const v = data[f];
    if (v instanceof Timestamp) return v.toDate();
  }
  return null;
}

function resolveStatus(data: Record<string, unknown>): string {
  const s = data['status'];
  if (typeof s === 'string') return s;
  return 'draft';
}

export default function Calendar() {
  const { uid, brandId } = useActiveBrand();
  const navigate = useNavigate();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const [posts, setPosts] = useState<CalPost[]>([]);

  // Query: all posts for the brand. We filter client-side to the visible month range.
  // Firestore doesn't support multi-field OR date queries well across three timestamp fields,
  // so we load all posts and filter in JS. At 2-user volume this is fine.
  useEffect(() => {
    if (!uid || !brandId) return;
    const q = query(
      collection(db, 'users', uid, 'brands', brandId, 'posts'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const mapped: CalPost[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const date = resolveDate(data);
        if (!date) continue;
        mapped.push({
          id: d.id,
          status: resolveStatus(data),
          date,
          title: hookTitle(data),
        });
      }
      setPosts(mapped);
    });
    return unsub;
  }, [uid, brandId]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  function selectYear(y: number) {
    setYear(y);
  }

  // Filter posts to the visible grid range (previous month partial + current + next partial).
  // MonthGrid's buildCells may show a few days from adjacent months; include those too.
  const visibleStart = new Date(year, month - 1, 20); // safe lower bound
  const visibleEnd = new Date(year, month + 1, 15);   // safe upper bound
  const visiblePosts = posts.filter(
    (p) => p.date >= visibleStart && p.date <= visibleEnd,
  );

  const isEmpty = posts.length === 0;

  return (
    <section className="flex flex-col h-full bg-zinc-900 text-zinc-100">
      <MonthHeader
        year={year}
        month={month}
        onPrev={prevMonth}
        onNext={nextMonth}
        onSelectYear={selectYear}
      />

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-4">
          <p className="text-zinc-400 text-sm">
            Noch keine Posts geplant. Erstelle deinen ersten Post.
          </p>
          <button
            onClick={() => navigate('/create')}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-900 font-semibold rounded transition-colors text-sm"
          >
            Post erstellen
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto border-t border-zinc-700">
          <MonthGrid year={year} month={month} posts={visiblePosts} />
        </div>
      )}
    </section>
  );
}
