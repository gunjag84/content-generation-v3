// Ported from v2 client/src/components/social-club/SlidePanel.tsx (276 lines).
// Diff vs v2:
//   - Imports rewritten to shared/types/slide.
//   - repositionZonesForTextPosition import dropped; the textPosition button now
//     just updates slide.textPosition without re-laying out zones (zones can be
//     repositioned manually in v3 — phase-2 ZoneCanvas already supports drag).
//   - ColorPicker swapped for a plain <input type="color"> (the v2 picker was
//     a heavy popover dependency; v3 phase 2 keeps it minimal).
//   - B4: inline Image Transform sliders replaced by modal photo-edit mode.
import { useEffect, useRef, useState } from 'react';
import type { SocialSlide, SlideType } from '../../../../shared/types/slide';
import { ColorInput } from '../ColorInput';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function Ico({ d, size = 16, className = '' }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

const I = {
  copy: 'M20 9H11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  image: 'M21 15l-5-5L5 20M3 3h18v18H3z',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
};

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block">{children}</span>;
}

function Divider() { return <div className="border-t border-zinc-800 my-3" />; }

function Slider({ value, onChange, min, max, step = 1 }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
}) {
  return (
    <input type="range" value={value} min={min} max={max} step={step}
      draggable={false}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="w-full accent-amber-500 h-1 cursor-pointer select-none" />
  );
}

export interface PoolPhoto {
  id: string;
  url: string;
}

interface SlidePanelProps {
  slide: SocialSlide;
  onChange: (s: SocialSlide) => void;
  onApplyImageToAll: () => void;
  photoPool: PoolPhoto[];
  slidePhotoId: string | undefined;
  photoTransforms: Record<string, { rotation: number; scale: number }>;
  onAssignPhoto: (photoId: string | null) => void;
  onRotatePhoto: (photoId: string, dir: 90 | -90) => void;
  onScalePhoto: (photoId: string, scale: number) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  uploadError?: string | null;
  /** One-shot: copy the active slide's gradientColor to every slide. */
  onApplyGradientToAll: () => void;
  /** Restore all slides + caption from aiSnapshot via commitEdit. Null = no snapshot available. */
  onResetToAi: (() => void) | null;
  /** True when current slides are already byte-equal to aiSnapshot (button is disabled). */
  isAlreadyAiVersion: boolean;
}

// ---------------------------------------------------------------------------
// PhotoEditModal — modal overlay for zoom/pan editing of the slide photo.
// Reads/writes slide.imageScale / imageX / imageY via the parent onChange.
// Drag-on-photo pans; slider zooms. ESC or "Fertig" exits.
// ---------------------------------------------------------------------------
interface PhotoEditModalProps {
  slide: SocialSlide;
  imageUrl: string;
  onChange: (s: SocialSlide) => void;
  onClose: () => void;
}

function PhotoEditModal({ slide, imageUrl, onChange, onClose }: PhotoEditModalProps) {
  // Local draft — committed to parent only on "Fertig" / ESC.
  const [scale, setScale] = useState(slide.imageScale ?? 1);
  const [x, setX] = useState(slide.imageX ?? 50);
  const [y, setY] = useState(slide.imageY ?? 50);

  // ESC exits without commit.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Drag-on-preview pan.
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  function onPreviewMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
    const onMove = (me: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // Map mouse delta to object-position delta (sensitivity tuned to preview size).
      const sensitivity = 0.15;
      const nx = Math.max(0, Math.min(100, d.origX - (me.clientX - d.startX) * sensitivity));
      const ny = Math.max(0, Math.min(100, d.origY - (me.clientY - d.startY) * sensitivity));
      setX(nx);
      setY(ny);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function commit() {
    onChange({ ...slide, imageScale: scale, imageX: x, imageY: y, imageManualAdjust: true });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded p-5 w-[400px] flex flex-col gap-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-amber-400">
            Foto-Bearbeitung aktiv
          </span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-[18px] leading-none">&times;</button>
        </div>

        {/* Photo preview with drag-to-pan */}
        <div
          className="relative overflow-hidden bg-zinc-800 border border-zinc-700 select-none"
          style={{ height: 220, cursor: 'grab' }}
          onMouseDown={onPreviewMouseDown}
        >
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'contain',
              objectPosition: `${x}% ${y}%`,
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />
          <div className="absolute bottom-1 left-0 right-0 text-center font-mono text-[9px] text-zinc-500 pointer-events-none">
            Ziehen zum Verschieben
          </div>
        </div>

        {/* Zoom slider */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="font-mono text-[10px] text-zinc-500">Zoom</span>
            <span className="font-mono text-[11px] text-zinc-400">{Math.round(scale * 100)}%</span>
          </div>
          <input type="range" value={scale} min={1} max={3} step={0.05}
            onChange={e => setScale(parseFloat(e.target.value))}
            className="w-full accent-amber-500 h-1 cursor-pointer" />
        </div>

        {/* X/Y position sliders */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="font-mono text-[10px] text-zinc-500">X Position</span>
            <span className="font-mono text-[11px] text-zinc-400">{Math.round(x)}%</span>
          </div>
          <input type="range" value={x} min={0} max={100} step={1}
            onChange={e => setX(parseFloat(e.target.value))}
            className="w-full accent-amber-500 h-1 cursor-pointer" />
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span className="font-mono text-[10px] text-zinc-500">Y Position</span>
            <span className="font-mono text-[11px] text-zinc-400">{Math.round(y)}%</span>
          </div>
          <input type="range" value={y} min={0} max={100} step={1}
            onChange={e => setY(parseFloat(e.target.value))}
            className="w-full accent-amber-500 h-1 cursor-pointer" />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-1.5 font-mono text-[10px] uppercase tracking-widest bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200">
            Abbrechen
          </button>
          <button onClick={commit}
            className="flex-1 py-1.5 font-mono text-[10px] uppercase tracking-widest bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30">
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}

export function SlidePanel({
  slide, onChange, onApplyImageToAll,
  photoPool, slidePhotoId, photoTransforms,
  onAssignPhoto, onRotatePhoto,
  onUpload, uploading, uploadError,
  onApplyGradientToAll,
  onResetToAi, isAlreadyAiVersion,
}: SlidePanelProps) {
  const s = (p: Partial<SocialSlide>) => onChange({ ...slide, ...p });
  const needsPhoto = ['photo', 'overlay'].includes(slide.type);
  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  return (
    <div className="p-3 space-y-4">
      <div>
        <Label>Slide Type</Label>
        <div className="grid grid-cols-3 gap-1 mt-1.5">
          {(['photo', 'overlay', 'cta'] as SlideType[]).map(t => (
            <button key={t} onClick={() => s({ type: t })}
              className={`py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                slide.type === t
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-zinc-700'
              }`}>{t}</button>
          ))}
        </div>
      </div>

      <Divider />
      <div>
        <Label>Photo</Label>
        {needsPhoto && photoPool.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {photoPool.map(photo => {
              const isSelected = slidePhotoId === photo.id;
              const pt = photoTransforms[photo.id] || { rotation: 0, scale: 1 };
              return (
                <div key={photo.id} className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => onAssignPhoto(isSelected ? null : photo.id)}
                    className={`relative w-12 h-14 overflow-hidden border-2 ${
                      isSelected ? 'border-amber-500' : 'border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    <img
                      src={photo.url}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{ transform: `rotate(${pt.rotation}deg) scale(${pt.scale})` }}
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                        <span className="text-amber-500 text-[14px] font-bold">&#10003;</span>
                      </div>
                    )}
                  </button>
                  {isSelected && (
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => onRotatePhoto(photo.id, -90)}
                        className="w-4 h-4 bg-zinc-800 border border-zinc-700 text-[9px] text-zinc-400 hover:text-zinc-50 flex items-center justify-center"
                        title="Rotate left">&#8634;</button>
                      <button onClick={() => onRotatePhoto(photo.id, 90)}
                        className="w-4 h-4 bg-zinc-800 border border-zinc-700 text-[9px] text-zinc-400 hover:text-zinc-50 flex items-center justify-center"
                        title="Rotate right">&#8635;</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <label className={`
          mt-2 flex items-center gap-1.5 px-2 py-1.5 cursor-pointer font-mono text-[10px] uppercase tracking-widest transition-colors
          ${uploading ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'}
        `}>
          <Ico d={I.image} size={10} />
          {uploading ? 'Uploading...' : photoPool.length > 0 ? '+ Add Photos' : 'Upload Photos'}
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple
            onChange={onUpload} className="hidden" disabled={uploading} />
        </label>

        {uploadError && (
          <div className="mt-1 font-mono text-[10px] text-red-400">{uploadError}</div>
        )}

        {needsPhoto && photoPool.length > 0 && !slidePhotoId && (
          <div className="text-[10px] text-zinc-600 mt-1">Using first photo as default</div>
        )}
        {!needsPhoto && (
          <div className="text-[10px] text-zinc-600 mt-1">CTA slide — uploads add to the brand pool for use on photo/overlay slides.</div>
        )}
      </div>

      {(slide.type === 'photo' || slide.type === 'overlay') && (
        <>
          <Divider />
          <div>
            <Label>Foto</Label>
            <button
              onClick={() => slide.imageUrl && setPhotoEditOpen(true)}
              disabled={!slide.imageUrl}
              className="w-full mt-1.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-300 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Ico d={I.edit} size={11} /> Foto bearbeiten
            </button>
            {slide.imageUrl && (
              <div className="mt-1.5 font-mono text-[9px] text-zinc-600 flex gap-3">
                <span>Zoom {Math.round((slide.imageScale ?? 1) * 100)}%</span>
                <span>X {Math.round(slide.imageX ?? 50)}%</span>
                <span>Y {Math.round(slide.imageY ?? 50)}%</span>
              </div>
            )}
            <button onClick={onApplyImageToAll}
              className="w-full mt-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors flex items-center justify-center gap-1.5">
              <Ico d={I.copy} size={11} /> Apply to All Slides
            </button>
          </div>
        </>
      )}

      {slide.type === 'photo' && (
        <>
          <Divider />
          <div>
            <Label>Text Position</Label>
            <div className="grid grid-cols-2 gap-1 mt-1.5">
              {(['bottom', 'top'] as const).map(pos => (
                <button key={pos} onClick={() => s({ textPosition: pos })}
                  className={`py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                    (slide.textPosition ?? 'bottom') === pos
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-zinc-700'
                  }`}>{pos}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {(slide.type === 'photo' || slide.type === 'overlay') && (
        <>
          <Divider />
          <div>
            <Label>Gradient Color</Label>
            <div className="mt-1">
              <ColorInput
                value={slide.gradientColor ?? '#000000'}
                onChange={(v) => s({ gradientColor: v })}
              />
            </div>
            <button onClick={onApplyGradientToAll}
              className="w-full mt-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors flex items-center justify-center gap-1.5">
              <Ico d={I.copy} size={11} /> Apply gradient to all
            </button>
          </div>
          {slide.type === 'photo' && (
            <div className="select-none">
              <div className="flex justify-between">
                <Label>Fade Height</Label>
                <span className="font-mono text-[11px] text-zinc-400">{slide.gradientStart ?? 25}%</span>
              </div>
              <div className="mt-1.5">
                <Slider value={slide.gradientStart ?? 25} onChange={v => s({ gradientStart: v })} min={0} max={100} />
                {(() => {
                  const { r: gr, g: gg, b: gb } = hexToRgb(slide.gradientColor ?? '#000000');
                  const dir = (slide.textPosition ?? 'bottom') === 'top' ? 'to left' : 'to right';
                  const gs = slide.gradientStart ?? 25;
                  return (
                    <div className="h-4 w-full mt-1 border border-zinc-700 pointer-events-none"
                      style={{ background: `linear-gradient(${dir}, rgba(${gr},${gg},${gb},0) 0%, rgba(${gr},${gg},${gb},0.9) ${100 - gs}%, rgba(${gr},${gg},${gb},0.9) 100%)` }} />
                  );
                })()}
              </div>
            </div>
          )}
          <div>
            <div className="flex justify-between">
              <Label>Gradient Darkness</Label>
              <span className="font-mono text-[11px] text-zinc-400">{slide.overlayOpacity ?? 70}%</span>
            </div>
            <div className="mt-1.5">
              <Slider value={slide.overlayOpacity ?? 70} onChange={v => s({ overlayOpacity: v })} min={0} max={100} />
            </div>
          </div>
        </>
      )}

      {/* Reset to AI version */}
      {onResetToAi !== null && (
        <>
          <Divider />
          <div>
            <button
              onClick={() => setResetConfirmOpen(true)}
              disabled={isAlreadyAiVersion}
              className="w-full py-1.5 font-mono text-[10px] uppercase tracking-widest bg-yellow-500 text-zinc-900 hover:bg-yellow-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Auf KI-Version zurücksetzen
            </button>
          </div>
        </>
      )}

      {/* Photo-edit modal — portal-less, fixed positioning covers the viewport */}
      {photoEditOpen && slide.imageUrl && (
        <PhotoEditModal
          slide={slide}
          imageUrl={slide.imageUrl}
          onChange={onChange}
          onClose={() => setPhotoEditOpen(false)}
        />
      )}

      {/* Reset-to-AI confirmation modal */}
      {resetConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={(e) => { if (e.target === e.currentTarget) setResetConfirmOpen(false); }}
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded p-5 w-[360px] flex flex-col gap-4 shadow-2xl">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-widest text-yellow-400">
                Auf KI-Version zurücksetzen?
              </span>
              <p className="font-mono text-[11px] text-zinc-400 mt-1">
                Deine manuellen Änderungen gehen verloren.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setResetConfirmOpen(false)}
                className="flex-1 py-1.5 font-mono text-[10px] uppercase tracking-widest bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200"
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  setResetConfirmOpen(false);
                  onResetToAi?.();
                }}
                className="flex-1 py-1.5 font-mono text-[10px] uppercase tracking-widest bg-yellow-500 text-zinc-900 hover:bg-yellow-400"
              >
                Zurücksetzen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
