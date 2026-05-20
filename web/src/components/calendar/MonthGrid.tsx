// MonthGrid — 7-col Mon-Sun grid for the Calendar route.
// Read-only: shows state dots per post (draft/scheduled/published).
// No drag-and-drop (deferred to v1.1).
import { useNavigate } from 'react-router-dom';
import type { Timestamp } from 'firebase/firestore';

export interface CalPost {
  id: string;
  status: 'draft' | 'scheduled' | 'published' | string;
  /** The date the post lives on (scheduledAt > publishedAt > createdAt) */
  date: Date;
  title: string;
}

interface MonthGridProps {
  year: number;
  month: number; // 0-indexed (JS Date convention)
  posts: CalPost[];
}

// Returns Mon=0 … Sun=6 index for a JS Date.
function weekdayMon(d: Date): number {
  return (d.getDay() + 6) % 7;
}

// Builds a flat array of cell dates for the calendar grid.
// First cell = Mon of the week containing the 1st; last cell = Sun of the week containing the last day.
function buildCells(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = weekdayMon(firstDay); // cells before the 1st
  const endOffset = (6 - weekdayMon(lastDay)); // cells after the last

  const cells: Date[] = [];
  for (let i = -startOffset; i <= lastDay.getDate() - 1 + endOffset; i++) {
    cells.push(new Date(year, month, 1 + i));
  }
  return cells;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

const DOT_CLASSES: Record<string, string> = {
  draft: 'bg-zinc-400',
  scheduled: 'bg-cyan-400',
  published: 'bg-green-500',
};

function dotClass(status: string): string {
  return DOT_CLASSES[status] ?? 'bg-zinc-400';
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function MonthGrid({ year, month, posts }: MonthGridProps) {
  const navigate = useNavigate();
  const cells = buildCells(year, month);
  const today = new Date();

  return (
    <div className="w-full">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-zinc-700 mb-0">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-zinc-400 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Cell grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const inMonth = cell.getMonth() === month;
          const isToday = isSameDay(cell, today);
          const dayPosts = posts.filter((p) => isSameDay(p.date, cell));

          return (
            <div
              key={idx}
              className={[
                'min-h-[90px] p-1.5 border-b border-r border-zinc-700 bg-zinc-800',
                !inMonth ? 'opacity-40' : '',
              ].join(' ')}
            >
              {/* Day number */}
              <div className={[
                'text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                isToday
                  ? 'bg-cyan-500 text-zinc-900'
                  : inMonth
                    ? 'text-zinc-200'
                    : 'text-zinc-500',
              ].join(' ')}>
                {cell.getDate()}
              </div>

              {/* Post dots */}
              <div className="flex flex-col gap-0.5">
                {dayPosts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/posts/${p.id}`)}
                    title={p.title}
                    className={[
                      'w-full text-left truncate text-[10px] leading-4 px-1 rounded flex items-center gap-1',
                      'hover:brightness-125 transition-all',
                    ].join(' ')}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotClass(p.status)}`} />
                    <span className="truncate text-zinc-300">{p.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
