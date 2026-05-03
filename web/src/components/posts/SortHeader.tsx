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
          ? 'text-indigo-600 font-medium'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
      {isActive && <span className="ml-1">{order === 'desc' ? '↓' : '↑'}</span>}
    </button>
  );
}
