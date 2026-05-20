import { describe, it, expect } from 'vitest';
import { snapToGrid, computeAlignmentGuides } from '../snapMath';
import type { Zone } from '../../../../shared/types/slide';

// Minimal Zone factory — only fields used by computeAlignmentGuides
function zone(overrides: Partial<Zone> & { id: string; x: number; y: number; w: number; h: number }): Zone {
  return {
    type: 'text',
    text: '',
    fontSize: 16,
    fontWeight: 400,
    fontFamily: 'sans-serif',
    color: '#000',
    lineHeight: 1.2,
    textAlign: 'left',
    overlayOpacity: 0,
    ...overrides,
  } as Zone;
}

describe('snapToGrid', () => {
  it('returns the grid line when value is exactly on it', () => {
    expect(snapToGrid(16, 8, 4)).toBe(16);
  });

  it('snaps to nearest grid line when within threshold', () => {
    // nearest grid line to 14 with gridSize=8 is 16; delta=2, threshold=4
    expect(snapToGrid(14, 8, 4)).toBe(16);
  });

  it('returns original value when outside threshold', () => {
    // nearest grid line to 11 with gridSize=8 is 8; delta=3, threshold=2
    expect(snapToGrid(11, 8, 2)).toBe(11);
  });

  it('handles value=0, gridSize=8, threshold=4 → returns 0', () => {
    expect(snapToGrid(0, 8, 4)).toBe(0);
  });

  it('handles negative values — snaps toward closest grid line', () => {
    // nearest to -1 with gridSize=8 is 0; delta=1, threshold=4
    // Math.round(-1/8)*8 = Math.round(-0.125)*8 = 0*8 = 0 (but JS returns -0)
    expect(snapToGrid(-1, 8, 4)).toBe(-0);
  });

  it('threshold exactly equal to delta → snaps (boundary inclusive)', () => {
    // value=12, gridSize=8 → Math.round(12/8)=Math.round(1.5)=2 → nearest=16, delta=4, threshold=4
    expect(snapToGrid(12, 8, 4)).toBe(16);
  });

  it('does not crash with zero threshold — only exact hits snap', () => {
    expect(snapToGrid(16, 8, 0)).toBe(16); // exact
    expect(snapToGrid(15, 8, 0)).toBe(15); // not exact
  });
});

describe('computeAlignmentGuides', () => {
  const dragged = zone({ id: 'd', x: 100, y: 100, w: 80, h: 40 });

  it('returns no guides and no snapping when otherZones is empty', () => {
    const result = computeAlignmentGuides(dragged, [], 8);
    expect(result.snappedX).toBe(dragged.x);
    expect(result.snappedY).toBe(dragged.y);
    expect(result.guides).toHaveLength(0);
  });

  it('ignores a zone with the same id as the dragged zone', () => {
    const same = zone({ id: 'd', x: 103, y: 100, w: 80, h: 40 }); // left-left delta=3
    const result = computeAlignmentGuides(dragged, [same], 8);
    expect(result.snappedX).toBe(dragged.x); // no snap because same id skipped
    expect(result.guides).toHaveLength(0);
  });

  it('snaps left-to-left when within threshold and emits a vertical guide', () => {
    // dragged.x=100, other.x=103 → left-left delta=3, threshold=8 → snap
    const other = zone({ id: 'a', x: 103, y: 200, w: 60, h: 30 });
    const result = computeAlignmentGuides(dragged, [other], 8);
    expect(result.snappedX).toBe(103);
    expect(result.guides.some(g => g.orientation === 'vertical' && g.position === 103)).toBe(true);
  });

  it('snaps right-to-right when within threshold', () => {
    // dragged right=180, other right=184 → delta=4, threshold=8 → snap
    // snappedX = dragged.x + (184 - 180) = 104
    const other = zone({ id: 'b', x: 124, y: 200, w: 60, h: 30 }); // right=184
    const result = computeAlignmentGuides(dragged, [other], 8);
    expect(result.snappedX).toBe(104);
    expect(result.guides.some(g => g.orientation === 'vertical' && g.position === 184)).toBe(true);
  });

  it('snaps center-to-center horizontally when within threshold', () => {
    // dragged cx = 140. other cx: x=135+w=10 → cx=140 → delta=0
    const other = zone({ id: 'c', x: 135, y: 200, w: 10, h: 30 }); // cx=140
    const result = computeAlignmentGuides(dragged, [other], 8);
    expect(result.snappedX).toBe(100); // already aligned, no shift
    expect(result.guides.some(g => g.orientation === 'vertical' && g.position === 140)).toBe(true);
  });

  it('snaps top-to-top vertically and emits a horizontal guide', () => {
    // dragged.y=100, other.y=103 → top-top delta=3, threshold=8
    const other = zone({ id: 'e', x: 300, y: 103, w: 60, h: 40 });
    const result = computeAlignmentGuides(dragged, [other], 8);
    expect(result.snappedY).toBe(103);
    expect(result.guides.some(g => g.orientation === 'horizontal' && g.position === 103)).toBe(true);
  });

  it('does not snap when best delta exceeds threshold', () => {
    // dragged: x=100, w=80 → left=100, right=180, cx=140
    // other: x=500, w=13 → left=500, right=513, cx=506.5
    // All x-deltas >> threshold=8 → no snap
    const other = zone({ id: 'f', x: 500, y: 400, w: 13, h: 30 });
    const result = computeAlignmentGuides(dragged, [other], 8);
    expect(result.snappedX).toBe(100);
    expect(result.guides.filter(g => g.orientation === 'vertical')).toHaveLength(0);
  });

  it('picks the closer snap when multiple zones are candidates', () => {
    // dragged.x=100
    // zone1: left=102 → delta=2
    // zone2: left=107 → delta=7 (both < threshold=8, but zone1 is closer)
    const zone1 = zone({ id: 'g1', x: 102, y: 200, w: 60, h: 30 });
    const zone2 = zone({ id: 'g2', x: 107, y: 300, w: 60, h: 30 });
    const result = computeAlignmentGuides(dragged, [zone1, zone2], 8);
    expect(result.snappedX).toBe(102); // snapped to closer zone1
  });

  it('can emit both a vertical and horizontal guide simultaneously', () => {
    const other = zone({ id: 'h', x: 103, y: 103, w: 60, h: 30 });
    const result = computeAlignmentGuides(dragged, [other], 8);
    expect(result.guides.some(g => g.orientation === 'vertical')).toBe(true);
    expect(result.guides.some(g => g.orientation === 'horizontal')).toBe(true);
  });
});
