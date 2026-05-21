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
  backgroundColor?: string;
  onMutationStart?: () => void;
  onMutationEnd?: () => void;
  onTransientZoneChange?: (z: Zone) => void;
}

export function EditorPreview({
  slide, format, selectedZoneId, onSelectZone, onZoneChange, showGrid, backgroundColor,
  onMutationStart, onMutationEnd, onTransientZoneChange,
}: EditorPreviewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const compute = () => {
      // Leave a small inset so the slide has visible breathing room at the
      // bottom (matches the wrapper's pb-3 padding) and doesn't kiss the rails.
      const inset = 12;
      const w = el.clientWidth - inset;
      const h = el.clientHeight - inset;
      if (w <= 0 || h <= 0) return;
      const refH = FORMAT_HEIGHTS[format];
      setScale(Math.min(w / REF_W, h / refH));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [format]);

  if (!slide) {
    return (
      <div ref={wrapRef} className="h-full w-full flex items-center justify-center text-zinc-500 font-mono text-[11px] bg-zinc-900">
        No slide selected
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="h-full w-full overflow-hidden flex justify-center items-center bg-zinc-900 min-h-0 pb-3">
      <div
        style={{ width: REF_W * scale, height: FORMAT_HEIGHTS[format] * scale }}
        className="relative overflow-hidden ring-1 ring-zinc-700 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
      >
        <div
          style={{
            width: REF_W,
            height: FORMAT_HEIGHTS[format],
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <ZoneCanvas
            slide={slide}
            format={format}
            selectedId={selectedZoneId}
            onSelect={onSelectZone}
            scale={scale}
            showGrid={showGrid}
            onZoneChange={onZoneChange}
            backgroundColor={backgroundColor}
            onMutationStart={onMutationStart}
            onMutationEnd={onMutationEnd}
            onTransientZoneChange={onTransientZoneChange}
          />
        </div>
      </div>
    </div>
  );
}
