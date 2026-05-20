// MonthHeader — nav bar with ‹ › chevrons and clickable month-year that opens a year picker.
import { useState } from 'react';

interface MonthHeaderProps {
  year: number;
  month: number; // 0-indexed
  onPrev: () => void;
  onNext: () => void;
  onSelectYear: (year: number) => void;
}

const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export function MonthHeader({ year, month, onPrev, onNext, onSelectYear }: MonthHeaderProps) {
  const [showYearPicker, setShowYearPicker] = useState(false);

  // Show a range of ±6 years around the current year.
  const rangeStart = year - 6;
  const years = Array.from({ length: 13 }, (_, i) => rangeStart + i);

  return (
    <div className="relative flex items-center justify-between px-4 py-3 border-b border-zinc-700 bg-zinc-900">
      <button
        onClick={onPrev}
        aria-label="Vorheriger Monat"
        className="text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-700 transition-colors text-lg leading-none"
      >
        ‹
      </button>

      <button
        onClick={() => setShowYearPicker((v) => !v)}
        className="text-zinc-100 font-semibold text-base hover:text-cyan-400 transition-colors"
      >
        {MONTH_NAMES_DE[month]} {year}
      </button>

      <button
        onClick={onNext}
        aria-label="Nächster Monat"
        className="text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-700 transition-colors text-lg leading-none"
      >
        ›
      </button>

      {/* Year picker dropdown */}
      {showYearPicker && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-zinc-800 border border-zinc-600 rounded shadow-lg p-2 grid grid-cols-3 gap-1 w-48">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => { onSelectYear(y); setShowYearPicker(false); }}
              className={[
                'px-2 py-1 rounded text-sm transition-colors',
                y === year
                  ? 'bg-cyan-500 text-zinc-900 font-semibold'
                  : 'text-zinc-200 hover:bg-zinc-700',
              ].join(' ')}
            >
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
