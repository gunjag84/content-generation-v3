import { useState } from 'react';
import { DraftsTab } from './DraftsTab';
import { ScheduledTab } from './ScheduledTab';
import { HistoryTab } from './HistoryTab';

type Tab = 'history' | 'drafts' | 'scheduled';

const TABS: { id: Tab; label: string }[] = [
  { id: 'history', label: 'Verlauf' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'scheduled', label: 'Geplant' },
];

export default function PostsLayout() {
  const [active, setActive] = useState<Tab>('history');

  return (
    <section className="min-h-full">
      {/* Tab bar */}
      <div className="border-b border-zinc-700 bg-zinc-900 px-6">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                active === t.id
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:border-zinc-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-zinc-900">
        {active === 'drafts' && <DraftsTab />}
        {active === 'scheduled' && <ScheduledTab />}
        {active === 'history' && <HistoryTab />}
      </div>
    </section>
  );
}
