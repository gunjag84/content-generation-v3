// Vertical thumbnail rail for slide selection. Reuses SlideThumbnail from ZoneCanvas
// so the mini-preview shares the same render code as the main canvas.
import { useState } from 'react';
import { SlideThumbnail } from './ZoneCanvas';
import type { Format, SocialSlide } from '../../../../shared/types/slide';

interface SlideStripProps {
  slides: SocialSlide[];
  format: Format;
  activeIdx: number;
  onSelect: (idx: number) => void;
  onDelete?: (idx: number) => void;
  onReorder?: (from: number, to: number) => void;
  backgroundColor?: string;
}

export function SlideStrip({
  slides,
  format,
  activeIdx,
  onSelect,
  onDelete,
  onReorder,
  backgroundColor,
}: SlideStripProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function handleDragStart(e: React.DragEvent, i: number) {
    setDragIdx(i);
    e.dataTransfer.effectAllowed = 'move';
    // Required by Firefox to actually start the drag.
    e.dataTransfer.setData('text/plain', String(i));
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    if (dragIdx === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIdx !== i) setOverIdx(i);
  }

  function handleDrop(e: React.DragEvent, i: number) {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== i && onReorder) onReorder(dragIdx, i);
    setDragIdx(null);
    setOverIdx(null);
  }

  function handleDragEnd() {
    setDragIdx(null);
    setOverIdx(null);
  }

  const canDelete = (slides.length > 1) && !!onDelete;

  return (
    <aside className="h-full w-[200px] overflow-y-auto bg-zinc-950 border-r border-zinc-800 p-2 space-y-2">
      {slides.map((slide, i) => {
        const isDragging = dragIdx === i;
        const isOver = overIdx === i && dragIdx !== null && dragIdx !== i;
        return (
          <div
            key={i}
            draggable={!!onReorder}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            className={`relative inline-block transition-opacity ${isDragging ? 'opacity-40' : ''} ${isOver ? 'ring-2 ring-amber-400' : ''}`}
          >
            <SlideThumbnail
              slide={slide}
              format={format}
              active={i === activeIdx}
              index={i}
              onClick={() => onSelect(i)}
              backgroundColor={backgroundColor}
            />
            {canDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete?.(i); }}
                className="absolute top-1 right-1 z-30 w-5 h-5 flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] leading-none font-bold hover:bg-red-700 shadow"
                title="Slide löschen"
                aria-label="Slide löschen"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      {slides.length === 0 && (
        <p className="font-mono text-[10px] text-zinc-600 text-center mt-4">No slides yet</p>
      )}
    </aside>
  );
}
