interface Props<F extends string> {
  field: F;
  label: string;
  active: F;
  order: 'asc' | 'desc';
  align?: 'left' | 'right';
  onSort: (field: F) => void;
}

export function SortHeader<F extends string>({
  field,
  label,
  active,
  order,
  align = 'left',
  onSort,
}: Props<F>) {
  const isActive = active === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={`text-[11px] uppercase tracking-wider transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${
        isActive
          ? 'text-cyan-400 font-medium'
          : 'text-zinc-400 hover:text-zinc-300'
      }`}
    >
      {label}
      {isActive && <span className="ml-1">{order === 'desc' ? '↓' : '↑'}</span>}
    </button>
  );
}
