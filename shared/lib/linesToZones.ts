// Convert parsed `lines[]` (BASE/ACCENT/SUBTLE/BRAND/DIVIDER) into editor `zones[]`
// with a sensible default layout. Run once at draft-create time so the editor
// has something to render. User can then drag/resize/restyle.
//
// Layout convention (post format, 1080x1080):
//   textPosition: 'bottom' (default) -> stack zones in lower half above gradient
//   textPosition: 'top'              -> stack in upper half
// CTA slides (BRAND lines) get a centered logo-style zone instead.

import type { SlideContentLine, SocialSlide, Zone, AlignH } from '../types/slide.js';

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

interface ZoneSeed {
  text: string;
  fontSize: number;
  fontWeight: number;
  isLogo?: boolean;
}

function lineSeeds(lines: SlideContentLine[]): ZoneSeed[] {
  const seeds: ZoneSeed[] = [];
  for (const line of lines) {
    if (line.type === 'DIVIDER') continue;
    if (!line.text.trim()) continue;
    seeds.push({
      text: line.text,
      fontSize: line.fontSize ?? FONT_SIZE_BY_TYPE[line.type],
      fontWeight: FONT_WEIGHT_BY_TYPE[line.type],
      isLogo: line.type === 'BRAND',
    });
  }
  return seeds;
}

function zoneId(): string {
  return `z_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function linesToZones(slide: SocialSlide): Zone[] {
  if (slide.zones && slide.zones.length > 0) return slide.zones;
  const seeds = lineSeeds(slide.lines);
  if (seeds.length === 0) return [];

  // Reference canvas is 1080x1080 (post). Editor scales for portrait/story.
  const margin = 80;
  const width = 1080 - 2 * margin; // 920
  const totalH = seeds.reduce((acc, s) => acc + Math.round(s.fontSize * 1.4) + 24, 0);
  const startY =
    slide.textPosition === 'top'
      ? margin
      : Math.max(margin, 1080 - totalH - margin - 80);

  const alignH: AlignH = slide.type === 'cta' ? 'center' : 'left';

  let cursorY = startY;
  return seeds.map((seed) => {
    const h = Math.round(seed.fontSize * 1.4) + 16;
    const z: Zone = {
      id: zoneId(),
      label: seed.isLogo ? 'Brand' : `Text ${seed.fontSize}`,
      x: margin,
      y: cursorY,
      w: width,
      h,
      text: seed.text,
      fontSize: seed.fontSize,
      fontFamily: seed.isLogo ? 'Josefin Sans' : 'Inter',
      fontWeight: seed.fontWeight,
      color: '#ffffff',
      alignH,
      alignV: 'top',
      italic: false,
      lineHeight: 1.2,
      letterSpacing: 0,
      rotation: 0,
      isLogo: seed.isLogo,
    };
    cursorY += h + 16;
    return z;
  });
}
