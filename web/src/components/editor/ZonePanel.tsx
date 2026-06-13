// Ported from v2 client/src/components/social-club/ZonePanel.tsx (324 lines).
// Diff vs v2:
//   - Imports rewritten: './types' -> '../../../../shared/types/slide';
//     '../create/ColorPicker' dropped in favor of a native <input type="color">
//     (matches the SlidePanel divergence in v3 phase 2 - the v2 ColorPicker was
//     a heavy popover dependency we don't carry yet).
//   - font-loader path: '../../lib/font-loader' (v3 layout).
import { useEffect, useState } from 'react';
import { FONT_FAMILIES, ensureFontLoaded } from '../../lib/font-loader';
import { ColorInput } from '../ColorInput';
import type { Zone } from '../../../../shared/types/slide';
import { getZonePlainText } from '../../../../shared/types/slide';
import {
  applyFormatToSelection,
  captureSelection,
  getActiveSelectionFontSizePx,
  type SpanFormatKey,
} from '../../lib/spanFormat';

// ─── Icons ───────────────────────────────────────────────────────────────────

function Ico({ d, size = 16, className = '' }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

const I = {
  bold: 'M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z',
  italic: 'M19 4h-9M14 20H5M15 4L9 20',
  left: 'M3 6h18M3 12h12M3 18h15',
  center: 'M3 6h18M6 12h12M4 18h16',
  right: 'M3 6h18M9 12h12M6 18h15',
  valTop: 'M3 3h18M9 7v13M15 7v13M9 7h6',
  valMid: 'M3 12h18M9 4v7M15 4v7M9 11h6M9 13v7M15 13v7M9 20h6',
  valBot: 'M3 21h18M9 4v13M15 4v13M9 17h6',
  layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  logo: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  copy: 'M20 9H11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block">{children}</span>;
}

function Divider() { return <div className="border-t border-zinc-800 my-3" />; }

function IBtn({ d, active = false, onClick, title = '', size = 13, onMouseDown }: {
  d: string; active?: boolean; onClick?: () => void; title?: string; size?: number;
  onMouseDown?: (e: React.MouseEvent) => void;
}) {
  return (
    <button title={title} onClick={onClick} onMouseDown={onMouseDown}
      className={`p-1.5 flex-shrink-0 transition-colors ${active
        ? 'bg-amber-500/20 text-amber-400'
        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'}`}>
      <Ico d={d} size={size} />
    </button>
  );
}

/** Try applying a per-span format to the active inline-edit selection. Returns
 *  true if it landed on a real selection (and therefore the caller should NOT
 *  fall through to a zone-level update). */
function trySpanFormat(prop: SpanFormatKey, value: unknown): boolean {
  return applyFormatToSelection(prop, value);
}

/** Standard mousedown handler for any format control that should preserve
 *  the inline-edit selection. Captures the current selection (in case the
 *  control is about to take focus) and prevents focus shift when possible
 *  (buttons only — selects/inputs handle focus themselves). */
function preserveSelectionMouseDown(e: React.MouseEvent) {
  captureSelection();
  // Only buttons can preventDefault to keep contentEditable focus; selects
  // and inputs must take focus by design (text input, dropdown).
  if ((e.currentTarget as HTMLElement).tagName === 'BUTTON') e.preventDefault();
}

function Slider({ value, onChange, min, max, step = 1 }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
}) {
  return (
    <input type="range" value={value} min={min} max={max} step={step}
      onChange={e => onChange(parseFloat(e.target.value))}
      className="w-full accent-amber-500 h-1 cursor-pointer" />
  );
}

function NumInput({ value, onChange, min, max, step = 1, unit = '' }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string;
}) {
  return (
    <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 px-2 py-1 min-w-0">
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="bg-transparent text-zinc-200 text-[12px] w-10 focus:outline-none tabular-nums min-w-0" />
      {unit && <span className="text-zinc-500 text-[11px] flex-shrink-0">{unit}</span>}
    </div>
  );
}

const SIZE_STEP = 2; // px per arrow click

// Font-size control with clean ▲/▼ steppers. The steppers are <button>s (not the
// native number-input spinners), so clicking them sets blur.relatedTarget
// correctly and the inline editor stays open — the size then applies to the
// active text selection (via trySpanFormat) instead of the whole zone. Each
// step reads the SELECTION's current rendered size so increments are cumulative.
function SizeStepper({ fontSize, onZoneSize }: { fontSize: number; onZoneSize: (v: number) => void }) {
  const [display, setDisplay] = useState(fontSize);
  // Resync when zone.fontSize changes (zone switch, or a zone-level size apply).
  useEffect(() => { setDisplay(fontSize); }, [fontSize]);

  const apply = (next: number) => {
    const v = Math.max(12, Math.min(400, Math.round(next)));
    setDisplay(v);
    if (trySpanFormat('fontSize', v)) return; // applies to the selection
    onZoneSize(v); // no selection → whole zone
  };
  const step = (delta: number) => apply((getActiveSelectionFontSizePx() ?? display) + delta);

  return (
    <div className="flex items-stretch bg-zinc-800 border border-zinc-700" onMouseDown={preserveSelectionMouseDown}>
      <input
        type="number"
        value={display}
        min={12}
        max={400}
        onMouseDown={preserveSelectionMouseDown}
        onChange={(e) => apply(parseFloat(e.target.value) || display)}
        className="bg-transparent text-zinc-200 text-[12px] w-9 px-2 py-2 text-center focus:outline-none tabular-nums min-w-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-zinc-500 text-[11px] self-center pr-1 flex-shrink-0">px</span>
      <div className="flex flex-col flex-shrink-0 border-l border-zinc-700 w-7">
        <button
          type="button"
          title="Größer"
          onMouseDown={preserveSelectionMouseDown}
          onClick={() => step(SIZE_STEP)}
          className="flex-1 leading-none text-[11px] text-zinc-300 hover:text-amber-400 hover:bg-zinc-700 active:bg-amber-500/20 border-b border-zinc-700 flex items-center justify-center"
        >▲</button>
        <button
          type="button"
          title="Kleiner"
          onMouseDown={preserveSelectionMouseDown}
          onClick={() => step(-SIZE_STEP)}
          className="flex-1 leading-none text-[11px] text-zinc-300 hover:text-amber-400 hover:bg-zinc-700 active:bg-amber-500/20 flex items-center justify-center"
        >▼</button>
      </div>
    </div>
  );
}

// ─── ZoneEditor ──────────────────────────────────────────────────────────────

interface ZoneEditorProps {
  zone: Zone;
  onChange: (z: Zone) => void;
}

export function ZoneEditor({ zone, onChange }: ZoneEditorProps) {
  const s = (p: Partial<Zone>) => onChange({ ...zone, ...p });

  useEffect(() => { FONT_FAMILIES.forEach(ensureFontLoaded); }, []);

  return (
    <div className="space-y-3 p-3">

      {/* Zone name */}
      <div>
        <Label>Name</Label>
        <input
          type="text"
          value={zone.label}
          onChange={e => s({ label: e.target.value })}
          className="mt-1.5 w-full bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-zinc-200 text-[12px] focus:outline-none focus:border-amber-500/50"
        />
      </div>

      {/* Text content. Editing here clobbers any per-word formatting because
          textarea is plain-text only. Per-word formatting is preserved when
          editing in the canvas via double-click → InlineTextEditor. */}
      <div>
        <Label>Text</Label>
        <textarea
          value={getZonePlainText(zone)}
          rows={3}
          onChange={e => s({ text: e.target.value })}
          className="mt-1.5 w-full bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-zinc-200 text-[12px] resize-none focus:outline-none focus:border-amber-500/50"
        />
        {Array.isArray(zone.text) && zone.text.some((sp) =>
          sp.color !== undefined || sp.fontFamily !== undefined ||
          sp.fontSize !== undefined || sp.fontWeight !== undefined || sp.italic !== undefined,
        ) && (
          <p className="mt-1 font-mono text-[9px] text-zinc-600">
            Diese Zone enthält Per-Wort-Formatierung. Bearbeiten hier reduziert sie auf Plain-Text.
          </p>
        )}
      </div>

      <Divider />

      {/* Text formatting. The per-text-span controls (Bold, Italic, font,
          size, weight, color) all first try applyFormatToSelection — when
          there is an active inline-edit selection in the canvas they apply
          ONLY to that selection. With no selection they fall through to a
          zone-level update (existing behavior).
          The data-keep-inline-edit attribute on this section tells
          InlineTextEditor's onBlur to NOT commit when focus moves into
          here, so the contentEditable stays mounted and the saved
          selection survives. */}
      <div data-keep-inline-edit>
        <Label>Formatting</Label>
        <div className="mt-1.5 flex flex-wrap gap-0.5">
          <IBtn
            d={I.bold}
            active={zone.fontWeight >= 700}
            title="Bold"
            onMouseDown={preserveSelectionMouseDown}
            onClick={() => {
              const nextWeight = zone.fontWeight >= 700 ? 400 : 700;
              if (trySpanFormat('fontWeight', nextWeight)) return;
              s({ fontWeight: nextWeight });
            }}
          />
          <IBtn
            d={I.italic}
            active={zone.italic}
            title="Italic"
            onMouseDown={preserveSelectionMouseDown}
            onClick={() => {
              const nextItalic = !zone.italic;
              if (trySpanFormat('italic', nextItalic)) return;
              s({ italic: nextItalic });
            }}
          />
          <div className="w-px h-6 bg-zinc-700 mx-0.5 self-center" />
          {/* Alignment + vertical alignment are LAYOUT (block-level), not text
              style — they always operate on the zone, not a selection. */}
          <IBtn d={I.left} active={zone.alignH === 'left'} title="Align Left" onClick={() => s({ alignH: 'left' })} />
          <IBtn d={I.center} active={zone.alignH === 'center'} title="Align Center" onClick={() => s({ alignH: 'center' })} />
          <IBtn d={I.right} active={zone.alignH === 'right'} title="Align Right" onClick={() => s({ alignH: 'right' })} />
          <div className="w-px h-6 bg-zinc-700 mx-0.5 self-center" />
          <IBtn d={I.valTop} active={zone.alignV === 'top'} title="Vertical Top" onClick={() => s({ alignV: 'top' })} />
          <IBtn d={I.valMid} active={zone.alignV === 'middle'} title="Vertical Middle" onClick={() => s({ alignV: 'middle' })} />
          <IBtn d={I.valBot} active={zone.alignV === 'bottom'} title="Vertical Bottom" onClick={() => s({ alignV: 'bottom' })} />
        </div>
      </div>

      <Divider />

      {/* Font */}
      <div data-keep-inline-edit>
        <Label>Font Family</Label>
        <div className="mt-1.5">
          <select
            value={zone.fontFamily}
            onMouseDown={preserveSelectionMouseDown}
            onChange={e => {
              ensureFontLoaded(e.target.value);
              if (trySpanFormat('fontFamily', e.target.value)) return;
              s({ fontFamily: e.target.value });
            }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-none px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-amber-500"
          >
            {FONT_FAMILIES.map(f => (
              <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 mt-2">
          <div className="flex-1">
            <Label>Size</Label>
            <div className="mt-1">
              <SizeStepper fontSize={zone.fontSize} onZoneSize={(v) => s({ fontSize: v })} />
            </div>
          </div>
          <div className="flex-1">
            <Label>Weight</Label>
            <div className="mt-1">
              <select
                value={String(zone.fontWeight)}
                onMouseDown={preserveSelectionMouseDown}
                onChange={e => {
                  const w = parseInt(e.target.value);
                  if (trySpanFormat('fontWeight', w)) return;
                  s({ fontWeight: w });
                }}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-[12px] px-2 py-1.5 focus:outline-none focus:border-amber-500/50"
              >
                <option value="100">Thin</option>
                <option value="300">Light</option>
                <option value="400">Regular</option>
                <option value="500">Medium</option>
                <option value="700">Bold</option>
                <option value="900">Black</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-2" onMouseDown={preserveSelectionMouseDown}>
          <Label>Color</Label>
          <div className="mt-1">
            <ColorInput value={zone.color} onChange={(v) => {
              if (trySpanFormat('color', v)) return;
              s({ color: v });
            }} />
          </div>
        </div>
      </div>

      <Divider />

      {/* Spacing */}
      <div>
        <Label>Spacing</Label>
        <div className="mt-2 space-y-2">
          <div>
            <div className="flex justify-between">
              <span className="font-mono text-[10px] text-zinc-600">Line Height</span>
              <span className="font-mono text-[11px] text-zinc-400">{zone.lineHeight.toFixed(2)}</span>
            </div>
            <Slider value={zone.lineHeight} onChange={v => s({ lineHeight: v })} min={0.8} max={2.5} step={0.05} />
          </div>
          <div>
            <div className="flex justify-between">
              <span className="font-mono text-[10px] text-zinc-600">Letter Spacing</span>
              <span className="font-mono text-[11px] text-zinc-400">{zone.letterSpacing.toFixed(2)}em</span>
            </div>
            <Slider value={zone.letterSpacing} onChange={v => s({ letterSpacing: v })} min={-0.1} max={0.4} step={0.01} />
          </div>
        </div>
      </div>

      <Divider />

      {/* Rotation */}
      <div>
        <div className="flex justify-between">
          <Label>Rotation</Label>
          <span className="font-mono text-[11px] text-zinc-400">{zone.rotation}</span>
        </div>
        <div className="mt-1.5 flex gap-2 items-center">
          <Slider value={zone.rotation} onChange={v => s({ rotation: v })} min={-180} max={180} step={1} />
          <button onClick={() => s({ rotation: 0 })} className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300 flex-shrink-0">reset</button>
        </div>
      </div>

      <Divider />

      {/* Position & Size */}
      <div>
        <Label>Position &amp; Size</Label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          <div><span className="font-mono text-[10px] text-zinc-600">X</span>
            <div className="mt-0.5"><NumInput value={Math.round(zone.x)} onChange={v => s({ x: v })} unit="px" /></div>
          </div>
          <div><span className="font-mono text-[10px] text-zinc-600">Y</span>
            <div className="mt-0.5"><NumInput value={Math.round(zone.y)} onChange={v => s({ y: v })} unit="px" /></div>
          </div>
          <div><span className="font-mono text-[10px] text-zinc-600">W</span>
            <div className="mt-0.5"><NumInput value={Math.round(zone.w)} onChange={v => s({ w: v })} min={60} unit="px" /></div>
          </div>
          <div><span className="font-mono text-[10px] text-zinc-600">H</span>
            <div className="mt-0.5"><NumInput value={Math.round(zone.h)} onChange={v => s({ h: v })} min={40} unit="px" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ZoneList ─────────────────────────────────────────────────────────────────

interface ZoneListProps {
  zones: Zone[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onAddLogo: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function ZoneList({ zones, selectedId, onSelect, onAdd, onAddLogo, onDelete, onDuplicate }: ZoneListProps) {
  return (
    <div className="p-3 space-y-0.5">
      {zones.map(z => (
        <div key={z.id} onClick={() => onSelect(z.id)}
          className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors group ${
            selectedId === z.id
              ? 'bg-amber-500/15 border-l-2 border-amber-500'
              : 'hover:bg-zinc-800 border-l-2 border-transparent'
          }`}>
          <Ico d={z.isLogo ? I.logo : I.layers} size={11}
            className={selectedId === z.id ? 'text-amber-400 flex-shrink-0' : 'text-zinc-500 flex-shrink-0'} />
          <span className={`font-mono text-[11px] flex-1 truncate ${selectedId === z.id ? 'text-zinc-100' : 'text-zinc-400'}`}>
            {z.label}
          </span>
          <div className="hidden group-hover:flex items-center gap-0.5">
            <button onClick={e => { e.stopPropagation(); onDuplicate(z.id); }}
              className="p-0.5 text-zinc-500 hover:text-zinc-200"><Ico d={I.copy} size={10} /></button>
            <button onClick={e => { e.stopPropagation(); onDelete(z.id); }}
              className="p-0.5 text-zinc-500 hover:text-red-400"><Ico d={I.trash} size={10} /></button>
          </div>
        </div>
      ))}
      <button onClick={onAdd}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors mt-1">
        <Ico d={I.plus} size={11} />
        <span className="font-mono text-[11px]">Add Text Zone</span>
      </button>
      <button onClick={onAddLogo}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
        <Ico d={I.logo} size={11} />
        <span className="font-mono text-[11px]">Add Logo Zone</span>
      </button>
    </div>
  );
}

// ─── ZonePanel (combined list + editor) ──────────────────────────────────────

interface ZonePanelProps {
  zones: Zone[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onZoneChange: (z: Zone) => void;
  onAdd: () => void;
  onAddLogo: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function ZonePanel({
  zones, selectedId, onSelect, onZoneChange, onAdd, onAddLogo, onDelete, onDuplicate,
}: ZonePanelProps) {
  const selectedZone = zones.find(z => z.id === selectedId) ?? null;

  return (
    <>
      <ZoneList
        zones={zones}
        selectedId={selectedId}
        onSelect={onSelect}
        onAdd={onAdd}
        onAddLogo={onAddLogo}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />
      {selectedZone ? (
        <>
          <Divider />
          <ZoneEditor zone={selectedZone} onChange={onZoneChange} />
        </>
      ) : (
        <p className="font-mono text-[11px] text-zinc-600 text-center py-6 px-4">
          Click a zone on the canvas to edit it
        </p>
      )}
    </>
  );
}
