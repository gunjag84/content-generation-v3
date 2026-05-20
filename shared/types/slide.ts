// Shared types for Social Club zone-based editor.
// Ported verbatim from v2 client/src/components/social-club/types.ts.
// Canonical source for editor + parser + render layers in v3.

export type SlideType = 'photo' | 'overlay' | 'cta';
export type AlignH = 'left' | 'center' | 'right';
export type AlignV = 'top' | 'middle' | 'bottom';
export type Format = 'post' | 'portrait' | 'story';

export interface PhotoTransform {
  x: number;        // 0-100, object-position horizontal
  y: number;        // 0-100, object-position vertical
  scale: number;    // 1.0-3.0, CSS transform:scale()
  rotation: number; // degrees
}

export interface Zone {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
  alignH: AlignH;
  alignV: AlignV;
  italic: boolean;
  lineHeight: number;
  letterSpacing: number;
  rotation: number;
  isLogo?: boolean;
  /** Per-zone photo transform override. Only meaningful for image-typed zones.
   *  Takes precedence over brand.photoTransforms[photoId] when set. */
  photoTransform?: PhotoTransform;
}

// The legacy line types used by the v2 renderer.
export interface SlideContentLine {
  type: 'BASE' | 'ACCENT' | 'SUBTLE' | 'BRAND' | 'DIVIDER';
  text: string;
  fontSize?: number;
  opacity?: number;
}

// SocialSlide extends the legacy ParsedSlide with zone fields.
export interface SocialSlide {
  number: number;
  type: SlideType;
  textPosition?: 'top' | 'bottom';
  lineGap?: number;
  gradientStart?: number;
  gradientColor?: string;
  photo?: string | number;
  lines: SlideContentLine[];
  // Zone-based fields
  zones: Zone[];
  imageUrl?: string;
  imageScale: number;
  imageX: number;
  imageY: number;
  overlayOpacity: number;
  // True once the user has manually changed Zoom/X/Y for this slide.
  // While false, the editor auto-fits the photo (cover) on photo assignment
  // and on format change. Manual edits are sticky from then on.
  imageManualAdjust?: boolean;
}

export const FORMAT_HEIGHTS: Record<Format, number> = {
  post: 1080,
  portrait: 1350,
  story: 1920,
};

export const REF_W = 1080;
