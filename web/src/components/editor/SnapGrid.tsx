interface SnapGridProps {
  visible: boolean;
  gridSize: number;    // px in canvas coords (e.g. 16)
  canvasWidth: number; // REF_W
  canvasHeight: number; // FORMAT_HEIGHTS[format]
  scale: number;       // editor scale for stroke-width adjustment
}

/**
 * Absolute-positioned SVG overlay that renders cyan dashed grid lines
 * at every gridSize interval. Visible only during drag (visible=true).
 * Pointer-events: none — never blocks mouse.
 */
export function SnapGrid({ visible, gridSize, canvasWidth, canvasHeight, scale }: SnapGridProps) {
  if (!visible) return null;

  const verticals: number[] = [];
  for (let x = gridSize; x < canvasWidth; x += gridSize) verticals.push(x);

  const horizontals: number[] = [];
  for (let y = gridSize; y < canvasHeight; y += gridSize) horizontals.push(y);

  const strokeWidth = Math.max(0.5, 1 / scale);

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: 'none',
        zIndex: 50,
        overflow: 'visible',
      }}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
    >
      {verticals.map(x => (
        <line
          key={`v${x}`}
          x1={x} y1={0} x2={x} y2={canvasHeight}
          stroke="#22d3ee"
          strokeWidth={strokeWidth}
          strokeDasharray="4 4"
          opacity={0.7}
        />
      ))}
      {horizontals.map(y => (
        <line
          key={`h${y}`}
          x1={0} y1={y} x2={canvasWidth} y2={y}
          stroke="#22d3ee"
          strokeWidth={strokeWidth}
          strokeDasharray="4 4"
          opacity={0.7}
        />
      ))}
    </svg>
  );
}
