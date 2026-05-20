import type { Zone } from '../../../shared/types/slide';

export interface AlignmentGuide {
  orientation: 'horizontal' | 'vertical';
  position: number; // canvas coords (x for vertical, y for horizontal)
}

/** Returns the snapped value if within threshold of a grid line, else the original. */
export function snapToGrid(value: number, gridSize: number, threshold: number): number {
  const snapped = Math.round(value / gridSize) * gridSize;
  return Math.abs(value - snapped) <= threshold ? snapped : value;
}

export interface SnapResult {
  snappedX: number;
  snappedY: number;
  guides: AlignmentGuide[];
}

/**
 * Checks edge-to-edge (left, right, top, bottom) and center-to-center
 * alignments between the dragged zone and all other zones.
 * Returns snapped x/y coordinates and the guides to render.
 */
export function computeAlignmentGuides(
  draggedZone: Zone,
  otherZones: Zone[],
  threshold: number,
): SnapResult {
  const guides: AlignmentGuide[] = [];
  let snappedX = draggedZone.x;
  let snappedY = draggedZone.y;

  // Edges of the dragged zone
  const dLeft = draggedZone.x;
  const dRight = draggedZone.x + draggedZone.w;
  const dCX = draggedZone.x + draggedZone.w / 2;
  const dTop = draggedZone.y;
  const dBottom = draggedZone.y + draggedZone.h;
  const dCY = draggedZone.y + draggedZone.h / 2;

  let bestDX = threshold + 1;
  let bestDY = threshold + 1;

  for (const oz of otherZones) {
    if (oz.id === draggedZone.id) continue;

    const oLeft = oz.x;
    const oRight = oz.x + oz.w;
    const oCX = oz.x + oz.w / 2;
    const oTop = oz.y;
    const oBottom = oz.y + oz.h;
    const oCY = oz.y + oz.h / 2;

    // Vertical guides (x-axis snapping): left/center/right of dragged vs other
    const xCandidates: Array<{ delta: number; dragEdge: number; snapTo: number }> = [
      { delta: Math.abs(dLeft - oLeft),   dragEdge: dLeft,   snapTo: oLeft },
      { delta: Math.abs(dLeft - oRight),  dragEdge: dLeft,   snapTo: oRight },
      { delta: Math.abs(dLeft - oCX),     dragEdge: dLeft,   snapTo: oCX },
      { delta: Math.abs(dRight - oLeft),  dragEdge: dRight,  snapTo: oLeft },
      { delta: Math.abs(dRight - oRight), dragEdge: dRight,  snapTo: oRight },
      { delta: Math.abs(dRight - oCX),    dragEdge: dRight,  snapTo: oCX },
      { delta: Math.abs(dCX - oLeft),     dragEdge: dCX,     snapTo: oLeft },
      { delta: Math.abs(dCX - oRight),    dragEdge: dCX,     snapTo: oRight },
      { delta: Math.abs(dCX - oCX),       dragEdge: dCX,     snapTo: oCX },
    ];

    for (const c of xCandidates) {
      if (c.delta < threshold && c.delta < bestDX) {
        bestDX = c.delta;
        snappedX = draggedZone.x + (c.snapTo - c.dragEdge);
      }
    }

    // Horizontal guides (y-axis snapping)
    const yCandidates: Array<{ delta: number; dragEdge: number; snapTo: number }> = [
      { delta: Math.abs(dTop - oTop),       dragEdge: dTop,    snapTo: oTop },
      { delta: Math.abs(dTop - oBottom),    dragEdge: dTop,    snapTo: oBottom },
      { delta: Math.abs(dTop - oCY),        dragEdge: dTop,    snapTo: oCY },
      { delta: Math.abs(dBottom - oTop),    dragEdge: dBottom, snapTo: oTop },
      { delta: Math.abs(dBottom - oBottom), dragEdge: dBottom, snapTo: oBottom },
      { delta: Math.abs(dBottom - oCY),     dragEdge: dBottom, snapTo: oCY },
      { delta: Math.abs(dCY - oTop),        dragEdge: dCY,     snapTo: oTop },
      { delta: Math.abs(dCY - oBottom),     dragEdge: dCY,     snapTo: oBottom },
      { delta: Math.abs(dCY - oCY),         dragEdge: dCY,     snapTo: oCY },
    ];

    for (const c of yCandidates) {
      if (c.delta < threshold && c.delta < bestDY) {
        bestDY = c.delta;
        snappedY = draggedZone.y + (c.snapTo - c.dragEdge);
      }
    }
  }

  // Collect guides for the winning snaps
  if (bestDX <= threshold) {
    // Which x position did we snap to?
    const finalLeft = snappedX;
    const finalRight = snappedX + draggedZone.w;
    const finalCX = snappedX + draggedZone.w / 2;
    for (const oz of otherZones) {
      if (oz.id === draggedZone.id) continue;
      const xs = [oz.x, oz.x + oz.w, oz.x + oz.w / 2];
      for (const ox of xs) {
        if (Math.abs(finalLeft - ox) < 1 || Math.abs(finalRight - ox) < 1 || Math.abs(finalCX - ox) < 1) {
          if (!guides.find(g => g.orientation === 'vertical' && Math.abs(g.position - ox) < 1)) {
            guides.push({ orientation: 'vertical', position: ox });
          }
        }
      }
    }
  }

  if (bestDY <= threshold) {
    const finalTop = snappedY;
    const finalBottom = snappedY + draggedZone.h;
    const finalCY = snappedY + draggedZone.h / 2;
    for (const oz of otherZones) {
      if (oz.id === draggedZone.id) continue;
      const ys = [oz.y, oz.y + oz.h, oz.y + oz.h / 2];
      for (const oy of ys) {
        if (Math.abs(finalTop - oy) < 1 || Math.abs(finalBottom - oy) < 1 || Math.abs(finalCY - oy) < 1) {
          if (!guides.find(g => g.orientation === 'horizontal' && Math.abs(g.position - oy) < 1)) {
            guides.push({ orientation: 'horizontal', position: oy });
          }
        }
      }
    }
  }

  return { snappedX, snappedY, guides };
}
