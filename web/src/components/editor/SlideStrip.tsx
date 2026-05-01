// Vertical thumbnail rail for slide selection. Reuses SlideThumbnail from ZoneCanvas
// so the mini-preview shares the same render code as the main canvas.
import { SlideThumbnail } from './ZoneCanvas';
import type { Format, SocialSlide } from '../../../../shared/types/slide';

interface SlideStripProps {
  slides: SocialSlide[];
  format: Format;
  activeIdx: number;
  onSelect: (idx: number) => void;
}

export function SlideStrip({ slides, format, activeIdx, onSelect }: SlideStripProps) {
  return (
    <aside className="h-full w-[200px] overflow-y-auto bg-zinc-950 border-r border-zinc-800 p-2 space-y-2">
      {slides.map((slide, i) => (
        <SlideThumbnail
          key={i}
          slide={slide}
          format={format}
          active={i === activeIdx}
          index={i}
          onClick={() => onSelect(i)}
        />
      ))}
      {slides.length === 0 && (
        <p className="font-mono text-[10px] text-zinc-600 text-center mt-4">No slides yet</p>
      )}
    </aside>
  );
}
