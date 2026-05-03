export type DateRange = '7d' | '30d' | '90d' | 'all';

export const DATE_RANGE_DAYS: Record<DateRange, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

const LABEL: Record<DateRange, string> = {
  '7d': '7 T',
  '30d': '30 T',
  '90d': '90 T',
  all: 'Alle',
};

interface Props {
  active: DateRange;
  counts: Record<DateRange, number>;
  onChange: (r: DateRange) => void;
}

export function DateRangeFilter({ active, counts, onChange }: Props) {
  const ranges: DateRange[] = ['7d', '30d', '90d', 'all'];
  return (
    <div className="flex items-center gap-1">
      {ranges.map((r) => {
        const isActive = active === r;
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              isActive
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {LABEL[r]} ({counts[r]})
          </button>
        );
      })}
    </div>
  );
}
