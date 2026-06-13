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

/** Contiguous run of text with optional per-run formatting overrides.
 *  When a property is undefined, the span inherits the parent Zone's value.
 *  Span order in the array IS the rendered text order; concatenating each
 *  span.text yields the plain text. */
export interface TextSpan {
  text: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
}

export interface Zone {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Plain string OR an array of formatted spans. Use getZonePlainText /
   *  getZoneSpans helpers below — never branch on this union manually. */
  text: string | TextSpan[];
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

/** Plain-text view of a zone's content. Always returns a string regardless of
 *  whether the storage is legacy `string` or new `TextSpan[]`. Use for diff,
 *  search, accessibility, and any non-render consumer. */
export function getZonePlainText(zone: { text: string | TextSpan[] }): string {
  if (typeof zone.text === 'string') return zone.text;
  return zone.text.map((s) => s.text).join('');
}

/** TextSpan[] view of a zone's content. Legacy string text is wrapped in a
 *  single span with no overrides. Empty string returns []. */
export function getZoneSpans(zone: { text: string | TextSpan[] }): TextSpan[] {
  if (typeof zone.text === 'string') return zone.text ? [{ text: zone.text }] : [];
  return zone.text;
}

/** Same as getZonePlainText but for untyped Firestore data where the shape
 *  hasn't been validated by Zod yet (calendar, posts list, etc.). */
export function extractPlainText(text: unknown): string {
  if (typeof text === 'string') return text;
  if (Array.isArray(text)) {
    return text
      .map((s) =>
        s && typeof (s as { text?: unknown }).text === 'string'
          ? (s as { text: string }).text
          : '',
      )
      .join('');
  }
  return '';
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
