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
      <div className="border-b border-gray-200 bg-white px-6">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                active === t.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white">
        {active === 'drafts' && <DraftsTab />}
        {active === 'scheduled' && <ScheduledTab />}
        {active === 'history' && <HistoryTab />}
      </div>
    </section>
  );
}
