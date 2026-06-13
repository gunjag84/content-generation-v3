// Convert parsed `lines[]` (BASE/ACCENT/SUBTLE/BRAND/DIVIDER) into editor `zones[]`
// with a sensible default layout. Run once at draft-create time so the editor
// has something to render. User can then drag/resize/restyle.
//
// Layout convention (post format, 1080x1080):
//   textPosition: 'bottom' (default) -> stack zones in lower half above gradient
//   textPosition: 'top'              -> stack in upper half
// CTA slides (BRAND lines) get a centered logo-style zone instead.

import type { SlideContentLine, SocialSlide, Zone, AlignH } from '../types/slide.js';
import type { ZoneDefaults, ZoneRole } from '../schemas/brand.js';

// Per-type visual defaults ported verbatim from v2 (client/src/lib/
// parsedSlidesToZones.ts) — the LEBEN.LIEBEN look that produced the live
// @leben.lieben carousels: thin white Josefin-Sans body, muted-gold handwritten
// Daniel accent, slightly-dimmed Josefin CTA.
const FONT_SIZE_BY_TYPE: Record<SlideContentLine['type'], number> = {
  ACCENT: 84,
  BASE: 54,
  SUBTLE: 48,
  BRAND: 28,
  DIVIDER: 0,
};

const FONT_WEIGHT_BY_TYPE: Record<SlideContentLine['type'], number> = {
  ACCENT: 400,
  BASE: 100,
  SUBTLE: 100,
  BRAND: 100,
  DIVIDER: 400,
};

const FONT_FAMILY_BY_TYPE: Record<SlideContentLine['type'], string> = {
  ACCENT: 'Daniel',
  BASE: 'Josefin Sans',
  SUBTLE: 'Josefin Sans',
  BRAND: 'Josefin Sans',
  DIVIDER: 'Josefin Sans',
};

// Default text colors per type. Brand zoneDefaults can still override
// ACCENT/BASE (via resolveColor); SUBTLE/BRAND always use these.
const COLOR_BY_TYPE: Record<SlideContentLine['type'], string> = {
  ACCENT: '#C4A265',
  BASE: '#ffffff',
  SUBTLE: 'rgba(255,255,255,0.85)',
  BRAND: '#C4A265',
  DIVIDER: '#ffffff',
};

const LINE_HEIGHT_BY_TYPE: Record<SlideContentLine['type'], number> = {
  ACCENT: 1.2,
  BASE: 1.5,
  SUBTLE: 1.5,
  BRAND: 1,
  DIVIDER: 1.2,
};

const LETTER_SPACING_BY_TYPE: Record<SlideContentLine['type'], number> = {
  ACCENT: 0,
  BASE: 0.05,
  SUBTLE: 0.05,
  BRAND: 0.12,
  DIVIDER: 0,
};

const LABEL_BY_TYPE: Record<SlideContentLine['type'], string> = {
  ACCENT: 'Hook',
  BASE: 'Body',
  SUBTLE: 'Subtle',
  BRAND: 'Brand',
  DIVIDER: 'Divider',
};

interface ZoneSeed {
  text: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  color: string;
  lineHeight: number;
  letterSpacing: number;
  label: string;
  isLogo?: boolean;
}

export interface LinesToZonesOptions {
  zoneDefaults?: ZoneDefaults;
  standardTextColor?: string;
  accentTextColor?: string;
}

function resolveColor(
  type: SlideContentLine['type'],
  role: ZoneRole | null,
  zoneDefaults: ZoneDefaults | undefined,
  standardTextColor: string,
  accentTextColor: string,
): string {
  // Brand zoneDefaults override (ACCENT/BASE only) wins when configured.
  const def = role ? zoneDefaults?.[role] : undefined;
  if (def?.color) return def.color === 'accent' ? accentTextColor : standardTextColor;
  // Otherwise fall back to the per-type v2 default color.
  return COLOR_BY_TYPE[type];
}

function lineSeeds(lines: SlideContentLine[], opts: LinesToZonesOptions): ZoneSeed[] {
  const standard = opts.standardTextColor ?? '#ffffff';
  const accent = opts.accentTextColor ?? '#C4A265';
  const seeds: ZoneSeed[] = [];
  for (const line of lines) {
    if (line.type === 'DIVIDER') continue;
    if (!line.text.trim()) continue;
    // Only ACCENT and BASE are configurable roles; SUBTLE and BRAND lines
    // use the per-type v2 defaults.
    const role: ZoneRole | null =
      line.type === 'ACCENT' || line.type === 'BASE' ? line.type : null;
    const def = role ? opts.zoneDefaults?.[role] : undefined;
    seeds.push({
      text: line.text,
      fontSize: line.fontSize ?? def?.fontSize ?? FONT_SIZE_BY_TYPE[line.type],
      fontWeight: FONT_WEIGHT_BY_TYPE[line.type],
      fontFamily: def?.fontFamily ?? FONT_FAMILY_BY_TYPE[line.type],
      color: resolveColor(line.type, role, opts.zoneDefaults, standard, accent),
      lineHeight: LINE_HEIGHT_BY_TYPE[line.type],
      letterSpacing: LETTER_SPACING_BY_TYPE[line.type],
      label: LABEL_BY_TYPE[line.type],
      isLogo: line.type === 'BRAND',
    });
  }
  return seeds;
}

function zoneId(): string {
  return `z_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function linesToZones(slide: SocialSlide, opts: LinesToZonesOptions = {}): Zone[] {
  if (slide.zones && slide.zones.length > 0) return slide.zones;
  const seeds = lineSeeds(slide.lines, opts);
  if (seeds.length === 0) return [];

  // Reference canvas is 1080x1080 (post). Editor scales for portrait/story.
  const margin = 80;
  const width = 1080 - 2 * margin; // 920
  // Compute zone heights at lineHeight 1.5 + generous padding so the auto-grow
  // logic in ZoneCanvas never triggers and pushes zones into each other.
  const heightOf = (fontSize: number) => Math.round(fontSize * 1.5) + 24;
  const gap = 32; // visual breathing room; prevents overlap on auto-grow
  const totalH = seeds.reduce((acc, s) => acc + heightOf(s.fontSize) + gap, 0) - gap;
  const startY =
    slide.textPosition === 'top'
      ? margin
      : Math.max(margin, 1080 - totalH - margin - 80);

  const alignH: AlignH = slide.type === 'cta' ? 'center' : 'left';

  let cursorY = startY;
  return seeds.map((seed) => {
    const h = heightOf(seed.fontSize);
    const z: Zone = {
      id: zoneId(),
      label: seed.label,
      x: margin,
      y: cursorY,
      w: width,
      h,
      text: seed.text,
      fontSize: seed.fontSize,
      fontFamily: seed.fontFamily,
      fontWeight: seed.fontWeight,
      color: seed.color,
      alignH,
      alignV: 'top',
      italic: false,
      lineHeight: seed.lineHeight,
      letterSpacing: seed.letterSpacing,
      rotation: 0,
      isLogo: seed.isLogo,
    };
    cursorY += h + gap;
    return z;
  });
}
