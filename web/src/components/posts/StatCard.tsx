import { formatNumber } from '../../lib/format';

interface Props {
  label: string;
  value: number | null;
  avg?: number | null;
  suffix?: string;
}

export function StatCard({ label, value, avg, suffix }: Props) {
  const display = value == null ? '–' : formatNumber(value) + (suffix ?? '');
  const avgDisplay =
    avg == null ? null : formatNumber(Math.round(avg)) + (suffix ?? '');
  return (
    <div className="border border-gray-200 rounded p-3 bg-white">
      <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </div>
      <div className="text-xl font-semibold text-gray-900 tabular-nums">
        {display}
      </div>
      {avgDisplay !== null && (
        <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">
          ø {avgDisplay}
        </div>
      )}
    </div>
  );
}
