// Verbatim port of v2 client/src/components/social-club/ZoneCanvas.tsx (297 lines).
// Only mechanical change: imports rewritten to point at shared/types/slide.
import { useRef, useCallback, useEffect } from 'react';
import type { Zone, SocialSlide, Format } from '../../../../shared/types/slide';
import { FORMAT_HEIGHTS, REF_W } from '../../../../shared/types/slide';

type DragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'rotate' | null;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function RotateIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

interface ZoneCanvasProps {
  slide: SocialSlide;
  format: Format;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showGrid?: boolean;
  scale: number;
  onZoneChange: (z: Zone) => void;
}

export function ZoneCanvas({
  slide, format, selectedId, onSelect, showGrid = false, scale, onZoneChange,
}: ZoneCanvasProps) {
  const refH = FORMAT_HEIGHTS[format];

  const dragState = useRef<{
    mode: DragMode; zoneId: string; startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number; origRot: number;
    centerX: number; centerY: number;
    zone: Zone;
  } | null>(null);

  const bgStyle: React.CSSProperties = {
    position: 'absolute', inset: 0,
    backgroundImage: slide.imageUrl ? `url(${slide.imageUrl})` : undefined,
    backgroundSize: `${(slide.imageScale ?? 1) * 100}%`,
    backgroundPosition: `${slide.imageX ?? 50}% ${slide.imageY ?? 50}%`,
    backgroundRepeat: 'no-repeat',
    backgroundColor: slide.type === 'cta' ? '#0f1f16' : '#1c1c2e',
  };

  const gradDir = (slide.textPosition ?? 'bottom') === 'top' ? 'to top' : 'to bottom';
  const gradAlpha = (slide.overlayOpacity ?? 75) / 100;
  const { r: gr, g: gg, b: gb } = hexToRgb(slide.gradientColor ?? '#000000');
  const gradOverlay: React.CSSProperties = {
    position: 'absolute', inset: 0, zIndex: 1,
    background: slide.type === 'photo'
      ? `linear-gradient(${gradDir}, rgba(${gr},${gg},${gb},0) 0%, rgba(${gr},${gg},${gb},${gradAlpha}) ${100 - (slide.gradientStart ?? 25)}%, rgba(${gr},${gg},${gb},${gradAlpha}) 100%)`
      : slide.type === 'overlay'
      ? `rgba(${gr},${gg},${gb},${(slide.overlayOpacity ?? 0) / 100})`
      : undefined,
  };

  const onMouseDown = useCallback((e: React.MouseEvent, zone: Zone, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    const centerX = zone.x + zone.w / 2;
    const centerY = zone.y + zone.h / 2;
    dragState.current = {
      mode, zoneId: zone.id,
      startX: e.clientX, startY: e.clientY,
      origX: zone.x, origY: zone.y, origW: zone.w, origH: zone.h,
      origRot: zone.rotation, centerX, centerY,
      zone,
    };
    onSelect(zone.id);

    const onMove = (me: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      const dx = (me.clientX - ds.startX) / scale;
      const dy = (me.clientY - ds.startY) / scale;

      if (ds.mode === 'move') {
        onZoneChange({ ...ds.zone, x: ds.origX + dx, y: ds.origY + dy });
      } else if (ds.mode === 'rotate') {
        const angle = Math.atan2(
          me.clientY / scale - ds.centerY,
          me.clientX / scale - ds.centerX,
        );
        const startAngle = Math.atan2(
          ds.startY / scale - ds.centerY,
          ds.startX / scale - ds.centerX,
        );
        const rot = ds.origRot + (angle - startAngle) * (180 / Math.PI);
        onZoneChange({ ...ds.zone, rotation: Math.round(rot) });
      } else {
        let { x, y, w, h } = { x: ds.origX, y: ds.origY, w: ds.origW, h: ds.origH };
        if (ds.mode === 'resize-nw') { x += dx; y += dy; w -= dx; h -= dy; }
        else if (ds.mode === 'resize-ne') { y += dy; w += dx; h -= dy; }
        else if (ds.mode === 'resize-sw') { x += dx; w -= dx; h += dy; }
        else if (ds.mode === 'resize-se') { w += dx; h += dy; }
        onZoneChange({ ...ds.zone, x, y, w: Math.max(60, w), h: Math.max(40, h) });
      }
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [scale, onZoneChange, onSelect]);

  const zoneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    const zones = slide.zones;
    if (!zones) return;
    for (const zone of zones) {
      if (zone.isLogo) continue;
      const el = zoneRefs.current[zone.id];
      if (!el) continue;
      const needed = el.scrollHeight;
      const padding = 16;
      const minH = needed + padding;
      if (minH > zone.h + 2) {
        onZoneChange({ ...zone, h: Math.ceil(minH) });
      }
    }
  });

  const corners: { mode: Exclude<DragMode, 'move' | 'rotate' | null>; style: React.CSSProperties }[] = [
    { mode: 'resize-nw', style: { top: -5, left: -5, cursor: 'nw-resize' } },
    { mode: 'resize-ne', style: { top: -5, right: -5, cursor: 'ne-resize' } },
    { mode: 'resize-sw', style: { bottom: -5, left: -5, cursor: 'sw-resize' } },
    { mode: 'resize-se', style: { bottom: -5, right: -5, cursor: 'se-resize' } },
  ];

  return (
    <div
      style={{ width: REF_W, height: refH, position: 'relative', overflow: 'hidden', userSelect: 'none' }}
      onClick={() => onSelect(null)}
    >
      <div style={bgStyle} />
      {(slide.type === 'photo' || slide.type === 'overlay') && <div style={gradOverlay} />}
      {showGrid && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '108px 108px',
        }} />
      )}
      {slide.zones.map(zone => {
        const sel = selectedId === zone.id;
        const zStyle: React.CSSProperties = {
          position: 'absolute',
          left: zone.x, top: zone.y, width: zone.w, height: zone.h,
          zIndex: 10,
          transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
          transformOrigin: 'center center',
          cursor: 'move',
          outline: sel ? '1.5px solid #F59E0B' : '1px dashed rgba(255,255,255,0.15)',
          outlineOffset: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: zone.alignV === 'top' ? 'flex-start' : zone.alignV === 'bottom' ? 'flex-end' : 'center',
          padding: 8,
          boxSizing: 'border-box',
        };

        const txtStyle: React.CSSProperties = {
          fontFamily: zone.fontFamily,
          fontSize: zone.fontSize,
          fontWeight: zone.fontWeight,
          color: zone.color,
          fontStyle: zone.italic ? 'italic' : 'normal',
          textAlign: zone.alignH,
          lineHeight: zone.lineHeight,
          letterSpacing: `${zone.letterSpacing}em`,
          whiteSpace: 'pre-wrap',
          width: '100%',
          pointerEvents: 'none',
        };

        return (
          <div
            key={zone.id}
            style={zStyle}
            onMouseDown={e => onMouseDown(e, zone, 'move')}
            onClick={e => { e.stopPropagation(); onSelect(zone.id); }}
          >
            {zone.isLogo ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', pointerEvents: 'none',
              }}>
                <div style={{
                  background: 'rgba(255,255,255,0.12)', borderRadius: 4,
                  padding: '8px 20px', fontFamily: 'Josefin Sans', fontSize: 24,
                  fontWeight: 700, color: '#fff', letterSpacing: '0.12em',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}>
                  LEBEN.LIEBEN
                </div>
              </div>
            ) : (
              <div ref={el => { zoneRefs.current[zone.id] = el; }} style={txtStyle}>{zone.text}</div>
            )}

            {sel && corners.map(c => (
              <div
                key={c.mode}
                onMouseDown={e => onMouseDown(e, zone, c.mode)}
                style={{
                  position: 'absolute', width: 10, height: 10,
                  background: '#F59E0B', borderRadius: 2,
                  ...c.style,
                }}
              />
            ))}

            {sel && (
              <div
                onMouseDown={e => onMouseDown(e, zone, 'rotate')}
                title="Rotate"
                style={{
                  position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
                  width: 20, height: 20, background: '#F59E0B', borderRadius: '50%',
                  cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 20,
                }}
              >
                <RotateIcon />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface SlideThumbnailProps {
  slide: SocialSlide;
  format: Format;
  active: boolean;
  index: number;
  onClick: () => void;
}

export function SlideThumbnail({ slide, format, active, index, onClick }: SlideThumbnailProps) {
  const refH = FORMAT_HEIGHTS[format];
  const thumbW = 56;
  const thumbH = Math.round(thumbW * refH / REF_W);

  const bgStyle: React.CSSProperties = {
    width: thumbW, height: thumbH, position: 'relative', overflow: 'hidden', flexShrink: 0,
    backgroundImage: slide.imageUrl ? `url(${slide.imageUrl})` : undefined,
    backgroundSize: `${(slide.imageScale ?? 1) * 100}%`,
    backgroundPosition: `${slide.imageX ?? 50}% ${slide.imageY ?? 50}%`,
    backgroundColor: slide.type === 'cta' ? '#0f1f16' : '#1c1c2e',
    cursor: 'pointer',
  };

  return (
    <div
      onClick={onClick}
      style={{ width: thumbW, height: thumbH }}
      className={`relative transition-all ${active ? 'ring-2 ring-amber-500' : 'ring-1 ring-zinc-700 opacity-55 hover:opacity-90'}`}
    >
      <div style={bgStyle}>
        {slide.type === 'photo' && slide.imageUrl && (
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(${(slide.textPosition ?? 'bottom') === 'top' ? 'to top' : 'to bottom'}, transparent ${slide.gradientStart ?? 25}%, rgba(0,0,0,${(slide.overlayOpacity ?? 75) / 100}) 100%)`,
          }} />
        )}
      </div>
      <div className="absolute bottom-0.5 right-0.5 font-mono text-[8px] text-zinc-400 bg-zinc-900/80 px-0.5 leading-tight">
        {index + 1}
      </div>
    </div>
  );
}
