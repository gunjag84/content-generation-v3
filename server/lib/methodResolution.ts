// Resolve user-requested slideCount to nearest available method template count.

export const TEMPLATE_COUNTS: Record<string, number[]> = {
  story: [5, 7, 9, 10],
  liste: [5, 7, 9, 10],
  'vorher-nachher': [5, 7, 9, 10],
  zitat: [], // shortcircuit, no template
};

export const METHOD_SLUGS = ['story', 'liste', 'vorher-nachher', 'zitat'] as const;
export type MethodSlug = (typeof METHOD_SLUGS)[number];

export function closestTemplateCount(method: MethodSlug, requested: number): number {
  const counts = TEMPLATE_COUNTS[method];
  if (!counts || counts.length === 0) return requested;
  let best = counts[0];
  let bestDist = Math.abs(requested - best);
  for (const c of counts) {
    const d = Math.abs(requested - c);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
