import { useLayoutEffect } from 'react';
import type { Zone } from '../../../shared/types/slide';

/**
 * Measures rendered zone heights via DOM refs and calls onZoneChange to push
 * grown heights back to slide state, then pushes later items down by the delta.
 *
 * Extracted from the verbatim-duplicate useLayoutEffect blocks that lived in
 * both ZoneCanvas and SlideThumbnail.
 *
 * When onZoneChange is undefined (SlideThumbnail with no correction callback),
 * the effect is a no-op.
 */
export function useAutoGrow(
  zones: Zone[],
  zoneRefs: React.MutableRefObject<Record<string, HTMLElement | null>>,
  onZoneChange: ((z: Zone) => void) | undefined,
): void {
  useLayoutEffect(() => {
    if (!onZoneChange) return;
    if (!zones || zones.length === 0) return;
    const padding = 16;
    // Snapshot computed heights up front so subsequent loop math doesn't depend
    // on dirty DOM measurements after we mutate state.
    const ordered = zones.map((z) => ({ z, top: z.y })).sort((a, b) => a.top - b.top);
    const yShift: Record<string, number> = {};
    const newH: Record<string, number> = {};
    for (let i = 0; i < ordered.length; i++) {
      const { z } = ordered[i];
      if (z.isLogo) continue;
      const el = zoneRefs.current[z.id];
      if (!el) continue;
      const minH = Math.ceil(el.scrollHeight + padding);
      const effectiveH = newH[z.id] ?? z.h;
      if (minH > effectiveH + 2) {
        const delta = minH - effectiveH;
        newH[z.id] = minH;
        const zoneBottom = z.y + effectiveH;
        for (let j = i + 1; j < ordered.length; j++) {
          const other = ordered[j].z;
          if (other.y + (yShift[other.id] ?? 0) >= zoneBottom - 2) {
            yShift[other.id] = (yShift[other.id] ?? 0) + delta;
          }
        }
      }
    }
    if (Object.keys(newH).length === 0 && Object.keys(yShift).length === 0) return;
    for (const z of zones) {
      const grew = newH[z.id];
      const shifted = yShift[z.id];
      if (grew !== undefined || shifted !== undefined) {
        onZoneChange({
          ...z,
          h: grew ?? z.h,
          y: shifted !== undefined ? z.y + shifted : z.y,
        });
      }
    }
  });
}
