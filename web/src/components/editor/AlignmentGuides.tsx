import type { AlignmentGuide } from '../../lib/snapMath';

interface AlignmentGuidesProps {
  guides: AlignmentGuide[];
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Absolute-positioned SVG overlay that renders pink solid alignment guides.
 * Each guide spans the full canvas dimension.
 * Pointer-events: none — never blocks mouse.
 */
export function AlignmentGuides({ guides, scale, canvasWidth, canvasHeight }: AlignmentGuidesProps) {
  if (guides.length === 0) return null;

  const strokeWidth = Math.max(0.5, 1 / scale);

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none',
        zIndex: 51,
        overflow: 'visible',
      }}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
    >
      {guides.map((g, i) =>
        g.orientation === 'vertical' ? (
          <line
            key={i}
            x1={g.position} y1={0} x2={g.position} y2={canvasHeight}
            stroke="#ec4899"
            strokeWidth={strokeWidth}
          />
        ) : (
          <line
            key={i}
            x1={0} y1={g.position} x2={canvasWidth} y2={g.position}
            stroke="#ec4899"
            strokeWidth={strokeWidth}
          />
        )
      )}
    </svg>
  );
}
