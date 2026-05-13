// Ported from v2 client/src/components/social-club/SlidePanel.tsx (276 lines).
// Diff vs v2:
//   - Imports rewritten to shared/types/slide.
//   - repositionZonesForTextPosition import dropped; the textPosition button now
//     just updates slide.textPosition without re-laying out zones (zones can be
//     repositioned manually in v3 — phase-2 ZoneCanvas already supports drag).
//   - ColorPicker swapped for a plain <input type="color"> (the v2 picker was
//     a heavy popover dependency; v3 phase 2 keeps it minimal).
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
}

export function SlidePanel({
  slide, onChange, onApplyImageToAll,
  photoPool, slidePhotoId, photoTransforms,
  onAssignPhoto, onRotatePhoto,
  onUpload, uploading, uploadError,
  onApplyGradientToAll,
}: SlidePanelProps) {
  const s = (p: Partial<SocialSlide>) => onChange({ ...slide, ...p });
  const needsPhoto = ['photo', 'overlay'].includes(slide.type);

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
            <Label>Image Transform</Label>
            <button onClick={onApplyImageToAll}
              className="w-full mt-1.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors flex items-center justify-center gap-1.5">
              <Ico d={I.copy} size={11} /> Apply to All Slides
            </button>

            <div className="mt-3 space-y-2">
              <div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-600">Zoom</span>
                  <span className="font-mono text-[11px] text-zinc-400">{Math.round((slide.imageScale ?? 1) * 100)}%</span>
                </div>
                <Slider value={slide.imageScale ?? 1} onChange={v => s({ imageScale: v })} min={1} max={3} step={0.05} />
              </div>
              <div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-600">X Position</span>
                  <span className="font-mono text-[11px] text-zinc-400">{slide.imageX ?? 50}%</span>
                </div>
                <Slider value={slide.imageX ?? 50} onChange={v => s({ imageX: v })} min={0} max={100} />
              </div>
              <div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-zinc-600">Y Position</span>
                  <span className="font-mono text-[11px] text-zinc-400">{slide.imageY ?? 50}%</span>
                </div>
                <Slider value={slide.imageY ?? 50} onChange={v => s({ imageY: v })} min={0} max={100} />
              </div>
            </div>
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
    </div>
  );
}
