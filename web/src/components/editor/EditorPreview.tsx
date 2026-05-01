// Wraps ZoneCanvas with an auto-scaling container so the canvas always fits the
// available width while preserving the format's aspect ratio. Pure UI, no I/O.
import { useEffect, useRef, useState } from 'react';
import { ZoneCanvas } from './ZoneCanvas';
import { REF_W, FORMAT_HEIGHTS, type Format, type SocialSlide, type Zone } from '../../../../shared/types/slide';

interface EditorPreviewProps {
  slide: SocialSlide | undefined;
  format: Format;
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
  onZoneChange: (z: Zone) => void;
  showGrid?: boolean;
}

export function EditorPreview({
  slide, format, selectedZoneId, onSelectZone, onZoneChange, showGrid,
}: EditorPreviewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const compute = () => {
      const padding = 32;
      const w = Math.max(120, el.clientWidth - padding);
      const h = Math.max(120, el.clientHeight - padding);
      const refH = FORMAT_HEIGHTS[format];
      // Fit canvas inside both width and height of the cell.
      setScale(Math.min(w / REF_W, h / refH));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [format]);

  if (!slide) {
    return (
      <div ref={wrapRef} className="h-full w-full flex items-center justify-center text-zinc-500 font-mono text-[11px]">
        No slide selected
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="h-full w-full overflow-auto p-4 flex justify-center items-start bg-zinc-900">
      <div style={{ width: REF_W * scale, height: FORMAT_HEIGHTS[format] * scale }} className="relative">
        <ZoneCanvas
          slide={slide}
          format={format}
          selectedId={selectedZoneId}
          onSelect={onSelectZone}
          scale={scale}
          showGrid={showGrid}
          onZoneChange={onZoneChange}
        />
      </div>
    </div>
  );
}
