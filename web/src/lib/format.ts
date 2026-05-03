// Number / date formatting helpers shared by the Posts history table and any
// future analytics surface. Localized to de-DE to match the rest of v3.

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '–';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function formatDate(d: Date | null): string {
  if (!d) return '–';
  return dateFmt.format(d);
}

export function timeAgo(d: Date | null): string {
  if (!d) return '–';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `vor ${hr}h`;
  const days = Math.floor(hr / 24);
  return `vor ${days}d`;
}
