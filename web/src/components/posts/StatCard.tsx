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
    <div className="border border-zinc-700 rounded p-3 bg-zinc-900">
      <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
        {label}
      </div>
      <div className="text-xl font-semibold text-zinc-100 tabular-nums">
        {display}
      </div>
      {avgDisplay !== null && (
        <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
          ø {avgDisplay}
        </div>
      )}
    </div>
  );
}
