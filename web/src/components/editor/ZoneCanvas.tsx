// Verbatim port of v2 client/src/components/social-club/ZoneCanvas.tsx (297 lines).
// Only mechanical change: imports rewritten to point at shared/types/slide.
import { Fragment, useRef, useCallback, useEffect, useState } from 'react';
import type { Zone, SocialSlide, Format } from '../../../../shared/types/slide';
import { FORMAT_HEIGHTS, REF_W, getZonePlainText } from '../../../../shared/types/slide';
import { ensureFontLoaded } from '../../lib/font-loader';
import { useAutoGrow } from '../../hooks/useAutoGrow';
import { InlineTextEditor } from './InlineTextEditor';
import { SnapGrid } from './SnapGrid';
import { AlignmentGuides } from './AlignmentGuides';
import { snapToGrid, computeAlignmentGuides } from '../../lib/snapMath';
import type { AlignmentGuide } from '../../lib/snapMath';

const SNAP_GRID_SIZE = 16;   // canvas px
const SNAP_THRESHOLD = 5;    // canvas px — snap triggers within this distance
const DRAG_THRESHOLD = 4;    // client px — below this a body press is a click (enter edit), not a drag

type DragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'rotate' | null;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

/** Renders zone.text honoring per-span overrides when text is a TextSpan[].
 *  Plain string text falls through as-is (the parent div's style covers it). */
function SpanText({ zone }: { zone: Zone }) {
  if (typeof zone.text === 'string') return <>{zone.text}</>;
  return (
    <>
      {zone.text.map((s, i) => {
        const hasOverride =
          s.color !== undefined ||
          s.fontFamily !== undefined ||
          s.fontSize !== undefined ||
          s.fontWeight !== undefined ||
          s.italic !== undefined;
        if (!hasOverride) return <Fragment key={i}>{s.text}</Fragment>;
        const style: React.CSSProperties = {
          color: s.color,
          fontFamily: s.fontFamily,
          fontSize: s.fontSize !== undefined ? `${s.fontSize}px` : undefined,
          fontWeight: s.fontWeight,
          fontStyle:
            s.italic === true ? 'italic' : s.italic === false ? 'normal' : undefined,
        };
        return (
          <span key={i} style={style}>
            {s.text}
          </span>
        );
      })}
    </>
  );
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
  scale: number;
  onZoneChange: (z: Zone) => void;
  /** Brand-configured background color for non-CTA slides. */
  backgroundColor?: string;
  /** Called on mousedown to signal drag start (for undo-stack bracketing). */
  onMutationStart?: () => void;
  /** Called on mouseup to signal drag end (for undo-stack bracketing). */
  onMutationEnd?: () => void;
  /**
   * Called by useAutoGrow for layout corrections that must NOT push to the
   * undo stack. When omitted, falls back to onZoneChange (SlideThumbnail usage
   * where there is no undo stack to protect).
   */
  onTransientZoneChange?: (z: Zone) => void;
}

export function ZoneCanvas({
  slide, format, selectedId, onSelect, scale, onZoneChange, backgroundColor,
  onMutationStart, onMutationEnd, onTransientZoneChange,
}: ZoneCanvasProps) {
  const refH = FORMAT_HEIGHTS[format];
  // editingZoneId tracks which text zone is in inline-edit mode (single-click a
  // text zone to enter; press+drag past DRAG_THRESHOLD moves instead).
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [snapActive, setSnapActive] = useState(false);
  const [alignGuides, setAlignGuides] = useState<AlignmentGuide[]>([]);

  const dragState = useRef<{
    mode: DragMode; zoneId: string; startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number; origRot: number;
    centerX: number; centerY: number;
    zone: Zone;
  } | null>(null);

  const bgStyle: React.CSSProperties = {
    position: 'absolute', inset: 0,
    backgroundColor: slide.type === 'cta' ? '#0f1f16' : (backgroundColor ?? '#1c1c2e'),
  };
  // Photo as <img> with object-fit:contain (whole photo fits at scale 1)
  // and CSS transform:scale() so the Zoom slider works relative to contain baseline.
  // ---
  // ARCHITECTURE NOTE (R2 audit acknowledgement, 2026-05-20):
  // Photos render at SLIDE level via slide.imageX/Y/Scale, written by
  // SlidePanel's PhotoEditModal. The forward-compat `zone.photoTransform`
  // field exists in shared/types/slide.ts + resolvePhotoTransform()
  // helper is implemented, but it would only become live once image-typed
  // zones exist (none today — zones are text-only). Photo-as-zone refactor
  // is deferred to v1.1; the brand-default tier of resolvePhotoTransform
  // is unreachable here because slide.imageX is non-optional and PhotoEditModal
  // always writes a value.
  const imgStyle: React.CSSProperties = slide.imageUrl
    ? {
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        objectFit: 'contain',
        objectPosition: `${slide.imageX ?? 50}% ${slide.imageY ?? 50}%`,
        transform: `scale(${slide.imageScale ?? 1})`,
        transformOrigin: 'center center',
        userSelect: 'none',
        pointerEvents: 'none',
      }
    : { display: 'none' };

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

    // A body 'move' press starts as a *click* (enter inline edit on release).
    // It only becomes a real drag once the pointer travels past DRAG_THRESHOLD,
    // at which point the snap grid + alignment guides appear. Resize/rotate
    // handle presses are deliberate gestures, so they drag immediately.
    let moved = mode !== 'move';
    if (moved) {
      onMutationStart?.();
      setSnapActive(true);
      setAlignGuides([]);
    }

    const onMove = (me: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      if (!moved) {
        if (Math.hypot(me.clientX - ds.startX, me.clientY - ds.startY) < DRAG_THRESHOLD) return;
        moved = true;
        onMutationStart?.();
        setSnapActive(true);
        setAlignGuides([]);
      }
      const dx = (me.clientX - ds.startX) / scale;
      const dy = (me.clientY - ds.startY) / scale;

      if (ds.mode === 'move') {
        const rawX = ds.origX + dx;
        const rawY = ds.origY + dy;
        // Snap to grid first, then alignment-guide snap (alignment wins if both trigger)
        const gridX = snapToGrid(rawX, SNAP_GRID_SIZE, SNAP_THRESHOLD);
        const gridY = snapToGrid(rawY, SNAP_GRID_SIZE, SNAP_THRESHOLD);
        const candidate = { ...ds.zone, x: gridX, y: gridY };
        const { snappedX, snappedY, guides } = computeAlignmentGuides(
          candidate, slide.zones, SNAP_THRESHOLD,
        );
        setAlignGuides(guides);
        onZoneChange({ ...ds.zone, x: snappedX, y: snappedY });
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
        // Snap resize handles to grid (x/y/w/h independently)
        const snX = snapToGrid(x, SNAP_GRID_SIZE, SNAP_THRESHOLD);
        const snY = snapToGrid(y, SNAP_GRID_SIZE, SNAP_THRESHOLD);
        const snW = snapToGrid(w, SNAP_GRID_SIZE, SNAP_THRESHOLD);
        const snH = snapToGrid(h, SNAP_GRID_SIZE, SNAP_THRESHOLD);
        onZoneChange({ ...ds.zone, x: snX, y: snY, w: Math.max(60, snW), h: Math.max(40, snH) });
      }
    };
    const onUp = () => {
      const ds = dragState.current;
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!moved) {
        // No real drag happened: a plain click on a text zone body enters
        // inline edit. (Logo zones and handle presses do not.) Defer to the
        // next task so the click's native focus settling finishes first —
        // otherwise the freshly-focused contentEditable is blurred in the same
        // cycle, which auto-commits and exits edit mode immediately.
        if (ds && ds.mode === 'move' && !ds.zone.isLogo) {
          const zid = ds.zoneId;
          setTimeout(() => setEditingZoneId(zid), 0);
        }
        return;
      }
      setSnapActive(false);
      setAlignGuides([]);
      onMutationEnd?.();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [scale, onZoneChange, onSelect, slide.zones, onMutationStart, onMutationEnd]);

  // Ensure every fontFamily used by a zone is loaded, so the initial preview
  // renders in the correct typeface instead of a system fallback.
  useEffect(() => {
    const families = new Set<string>();
    for (const z of slide.zones) if (z.fontFamily) families.add(z.fontFamily);
    families.forEach(ensureFontLoaded);
  }, [slide.zones]);

  const zoneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Run synchronously before paint so the user never sees an overlap flash on
  // the initial render. Process every overflowing zone in a single pass and
  // accumulate y-shifts for downstream zones, so one tick fixes all collisions.
  // autoGrow is a layout correction, NOT a user action — route through
  // onTransientZoneChange so it never pollutes the undo stack.
  useAutoGrow(slide.zones, zoneRefs, onTransientZoneChange ?? onZoneChange);

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
      {slide.imageUrl && <img src={slide.imageUrl} style={imgStyle} alt="" draggable={false} />}
      {(slide.type === 'photo' || slide.type === 'overlay') && <div style={gradOverlay} />}
      <SnapGrid
        visible={snapActive}
        gridSize={SNAP_GRID_SIZE}
        canvasWidth={REF_W}
        canvasHeight={refH}
        scale={scale}
      />
      <AlignmentGuides
        guides={alignGuides}
        scale={scale}
        canvasWidth={REF_W}
        canvasHeight={refH}
      />
      {slide.zones.map(zone => {
        const sel = selectedId === zone.id;
        const isEditing = editingZoneId === zone.id;
        // Text zones get a text cursor on hover; logo/image zones keep move cursor.
        const zoneCursor = !zone.isLogo ? 'text' : 'move';
        const zStyle: React.CSSProperties = {
          position: 'absolute',
          left: zone.x, top: zone.y, width: zone.w, height: zone.h,
          zIndex: 10,
          transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
          transformOrigin: 'center center',
          cursor: isEditing ? 'text' : (sel ? 'move' : zoneCursor),
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
          // Hide rendered text while editing so the textarea is the only visible text.
          // Keep the element in the DOM so useAutoGrow can still measure it.
          visibility: isEditing ? 'hidden' : 'visible',
        };

        return (
          <div
            key={zone.id}
            style={zStyle}
            title={!zone.isLogo && !isEditing ? 'Klicken zum Bearbeiten, ziehen zum Verschieben' : undefined}
            onMouseDown={e => {
              if (isEditing) return; // let InlineTextEditor handle its own mouse events
              onMouseDown(e, zone, 'move');
            }}
            onClick={e => e.stopPropagation()}
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
                  {getZonePlainText(zone)}
                </div>
              </div>
            ) : (
              <div ref={el => { zoneRefs.current[zone.id] = el; }} style={txtStyle}><SpanText zone={zone} /></div>
            )}

            {sel && !isEditing && corners.map(c => (
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

            {sel && !isEditing && (
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

      {/* Inline text editor overlay — rendered outside the zone div so it is not
          clipped by the zone's overflow or transform and sits at canvas level.
          Position is set to match zone.x/y directly (same coordinate space). */}
      {editingZoneId && (() => {
        const zone = slide.zones.find(z => z.id === editingZoneId);
        if (!zone || zone.isLogo) return null;
        return (
          <InlineTextEditor
            key={editingZoneId}
            zone={zone}
            scale={scale}
            onCommit={(text) => {
              onZoneChange({ ...zone, text });
              setEditingZoneId(null);
            }}
          />
        );
      })()}
    </div>
  );
}

interface SlideThumbnailProps {
  slide: SocialSlide;
  format: Format;
  active: boolean;
  index: number;
  onClick: () => void;
  backgroundColor?: string;
  /**
   * Optional zone-correction callback. Mirrors ZoneCanvas's auto-grow useLayoutEffect
   * so thumbnails render with the right (post-grow) zone heights on first paint.
   * Without this, slide thumbnails show pre-grow positions (overlapping text)
   * until each slide is clicked at least once and the active-canvas effect runs.
   */
  onZoneChange?: (z: Zone) => void;
}

export function SlideThumbnail({ slide, format, active, index, onClick, backgroundColor, onZoneChange }: SlideThumbnailProps) {
  const refH = FORMAT_HEIGHTS[format];
  // Slightly smaller than before (was 160x220) — keeps ~3 portrait thumbs visible
  // in the 200px-wide rail without scrolling.
  const thumbWMax = 130;
  const thumbHMax = 180;
  const aspect = REF_W / refH;
  let thumbW = thumbWMax;
  let thumbH = thumbW / aspect;
  if (thumbH > thumbHMax) {
    thumbH = thumbHMax;
    thumbW = thumbH * aspect;
  }
  const scale = thumbW / REF_W;

  const zoneRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Ensure brand fonts are loaded before measuring so scrollHeight uses the
  // real font metrics, not a system fallback. Mirrors ZoneCanvas behavior.
  useEffect(() => {
    const families = new Set<string>();
    for (const z of slide.zones) if (z.fontFamily) families.add(z.fontFamily);
    families.forEach(ensureFontLoaded);
  }, [slide.zones]);

  // Auto-grow + downstream-shift pass, mirrors ZoneCanvas behavior.
  // Without this, thumbnails render with the un-grown zone heights/positions
  // (overlapping text) until the user clicks a slide and the active-canvas
  // effect persists corrections. Running it here too means every slide is
  // corrected on first thumbnail paint, regardless of which slide is active.
  // Idempotent: once persisted values fit, the effect early-returns.
  useAutoGrow(slide.zones, zoneRefs, onZoneChange);

  const bgColor = slide.type === 'cta' ? '#0f1f16' : (backgroundColor ?? '#1c1c2e');
  const imgStyle: React.CSSProperties = slide.imageUrl
    ? {
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        objectFit: 'contain',
        objectPosition: `${slide.imageX ?? 50}% ${slide.imageY ?? 50}%`,
        transform: `scale(${slide.imageScale ?? 1})`,
        transformOrigin: 'center center',
        userSelect: 'none',
        pointerEvents: 'none',
      }
    : { display: 'none' };

  // Mirror the editor preview: gradient overlay matches ZoneCanvas (uses
  // gradientColor + textPosition + overlayOpacity), not a hard-coded black.
  const { r: gr, g: gg, b: gb } = hexToRgb(slide.gradientColor ?? '#000000');
  const gradAlpha = (slide.overlayOpacity ?? 75) / 100;
  const gradDir = (slide.textPosition ?? 'bottom') === 'top' ? 'to top' : 'to bottom';
  const overlayBg =
    slide.type === 'photo'
      ? `linear-gradient(${gradDir}, rgba(${gr},${gg},${gb},0) 0%, rgba(${gr},${gg},${gb},${gradAlpha}) ${100 - (slide.gradientStart ?? 25)}%, rgba(${gr},${gg},${gb},${gradAlpha}) 100%)`
      : slide.type === 'overlay'
      ? `rgba(${gr},${gg},${gb},${gradAlpha})`
      : undefined;

  return (
    <div
      onClick={onClick}
      style={{ width: thumbW, height: thumbH }}
      className={`relative transition-all overflow-hidden ${active ? 'ring-2 ring-amber-500' : 'ring-1 ring-zinc-700 opacity-55 hover:opacity-90'}`}
    >
      {/* Render the slide at full reference resolution then CSS-scale down,
          so the thumbnail is a true visual mirror of the editor canvas
          (background, photo, gradient, AND text zones at correct positions). */}
      <div
        style={{
          width: REF_W,
          height: refH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'relative',
          backgroundColor: bgColor,
          pointerEvents: 'none',
        }}
      >
        {slide.imageUrl && <img src={slide.imageUrl} style={imgStyle} alt="" draggable={false} />}
        {overlayBg && <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: overlayBg }} />}
        {slide.zones.map(zone => {
          const zStyle: React.CSSProperties = {
            position: 'absolute',
            left: zone.x, top: zone.y, width: zone.w, height: zone.h,
            zIndex: 10,
            transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
            transformOrigin: 'center center',
            display: 'flex', flexDirection: 'column',
            justifyContent: zone.alignV === 'top' ? 'flex-start' : zone.alignV === 'bottom' ? 'flex-end' : 'center',
            padding: 8,
            boxSizing: 'border-box',
          };
          if (zone.isLogo) {
            return (
              <div key={zone.id} style={zStyle}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%',
                }}>
                  <div style={{
                    background: 'rgba(255,255,255,0.12)', borderRadius: 4,
                    padding: '8px 20px', fontFamily: 'Josefin Sans', fontSize: 24,
                    fontWeight: 700, color: '#fff', letterSpacing: '0.12em',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}>
                    {getZonePlainText(zone)}
                  </div>
                </div>
              </div>
            );
          }
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
          };
          return (
            <div key={zone.id} style={zStyle}>
              <div ref={el => { zoneRefs.current[zone.id] = el; }} style={txtStyle}><SpanText zone={zone} /></div>
            </div>
          );
        })}
      </div>
      <div className="absolute bottom-0.5 right-0.5 font-mono text-[8px] text-zinc-400 bg-zinc-900/80 px-0.5 leading-tight z-20">
        {index + 1}
      </div>
    </div>
  );
}
