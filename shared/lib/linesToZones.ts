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

const FONT_SIZE_BY_TYPE: Record<SlideContentLine['type'], number> = {
  ACCENT: 88,
  BASE: 56,
  SUBTLE: 36,
  BRAND: 80,
  DIVIDER: 0,
};

const FONT_WEIGHT_BY_TYPE: Record<SlideContentLine['type'], number> = {
  ACCENT: 700,
  BASE: 500,
  SUBTLE: 400,
  BRAND: 700,
  DIVIDER: 400,
};

const FONT_FAMILY_BY_TYPE: Record<SlideContentLine['type'], string> = {
  ACCENT: 'Inter',
  BASE: 'Inter',
  SUBTLE: 'Inter',
  BRAND: 'Josefin Sans',
  DIVIDER: 'Inter',
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
  label: string;
  isLogo?: boolean;
}

export interface LinesToZonesOptions {
  zoneDefaults?: ZoneDefaults;
  standardTextColor?: string;
  accentTextColor?: string;
}

function resolveColor(
  role: ZoneRole | null,
  zoneDefaults: ZoneDefaults | undefined,
  standardTextColor: string,
  accentTextColor: string,
): string {
  if (!role || !zoneDefaults) return standardTextColor;
  const def = zoneDefaults[role];
  if (!def) return standardTextColor;
  return def.color === 'accent' ? accentTextColor : standardTextColor;
}

function lineSeeds(lines: SlideContentLine[], opts: LinesToZonesOptions): ZoneSeed[] {
  const standard = opts.standardTextColor ?? '#ffffff';
  const accent = opts.accentTextColor ?? '#f59e0b';
  const seeds: ZoneSeed[] = [];
  for (const line of lines) {
    if (line.type === 'DIVIDER') continue;
    if (!line.text.trim()) continue;
    // Only ACCENT and BASE are configurable roles; SUBTLE and BRAND lines
    // use hardcoded defaults and the standard text color.
    const role: ZoneRole | null =
      line.type === 'ACCENT' || line.type === 'BASE' ? line.type : null;
    const def = role ? opts.zoneDefaults?.[role] : undefined;
    seeds.push({
      text: line.text,
      fontSize: line.fontSize ?? def?.fontSize ?? FONT_SIZE_BY_TYPE[line.type],
      fontWeight: FONT_WEIGHT_BY_TYPE[line.type],
      fontFamily: def?.fontFamily ?? FONT_FAMILY_BY_TYPE[line.type],
      color: resolveColor(role, opts.zoneDefaults, standard, accent),
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
      lineHeight: 1.2,
      letterSpacing: 0,
      rotation: 0,
      isLogo: seed.isLogo,
    };
    cursorY += h + gap;
    return z;
  });
}
