import type { Format, SocialSlide, TextSpan } from '../../shared/types/slide.js';
import { FORMAT_HEIGHTS, REF_W, getZonePlainText, getZoneSpans } from '../../shared/types/slide.js';

export interface BrandColors {
  primary: string;
  accent: string;
}

// Mirrors web/src/lib/font-loader.ts SPECIAL_FONTS so server-rendered HTML
// resolves the same typefaces the editor previews. Keep these two maps in
// sync. System fonts (palatino, georgia, ...) need no <link>.
const SPECIAL_FONTS: Record<string, string> = {
  satoshi: 'https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700,900&display=swap',
  geist: 'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap',
  'geist mono': 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap',
  daniel: 'https://fonts.cdnfonts.com/css/daniel',
};

const SYSTEM_FONTS = new Set(['palatino', 'georgia', 'times new roman', 'arial', 'helvetica']);

// Always loaded — used by the logo zone fallback in ZoneCanvas + here.
const ALWAYS_LOAD = ['Josefin Sans'];

function fontUrl(family: string): string | null {
  const key = family.toLowerCase().trim();
  if (!key) return null;
  if (SYSTEM_FONTS.has(key)) return null;
  if (SPECIAL_FONTS[key]) return SPECIAL_FONTS[key];
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;500;600;700;900&display=swap`;
}

function buildFontLinks(slide: SocialSlide): string {
  const families = new Set<string>();
  for (const f of ALWAYS_LOAD) families.add(f);
  for (const z of slide.zones ?? []) {
    if (z.fontFamily) families.add(z.fontFamily);
    // Per-span font overrides also need their @font-face loaded; otherwise
    // headless Chromium falls back to a system font and the PNG diverges
    // from the editor preview.
    for (const s of getZoneSpans(z)) {
      if (s.fontFamily) families.add(s.fontFamily);
    }
  }
  const urls: string[] = [];
  for (const family of families) {
    const url = fontUrl(family);
    if (url) urls.push(url);
  }
  // Preconnect helps both Google Fonts and Fontshare warm up the connection.
  const preconnect = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://api.fontshare.com">`;
  const links = urls.map((u) => `<link rel="stylesheet" href="${u}">`).join('\n');
  return `${preconnect}\n${links}`;
}

// Mirror the visual contract of ZoneCanvas.tsx server-side.
// Format drives canvas height (post=1080, portrait=1350, story=1920); width is REF_W=1080.
export function buildSlideHtml(
  slide: SocialSlide,
  photoUrl: string | null,
  format: Format = 'post',
  brandColors?: BrandColors,
): string {
  const w = REF_W;
  const h = FORMAT_HEIGHTS[format];

  const bgColor = slide.type === 'cta' ? '#0f1f16' : '#1c1c2e';
  const imageX = slide.imageX ?? 50;
  const imageY = slide.imageY ?? 50;
  const imageScale = slide.imageScale ?? 1;

  const bgCss = `background-color: ${bgColor};`;
  const photoHtml = photoUrl
    ? `<img src="${escapeAttr(photoUrl)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:${imageX}% ${imageY}%;transform:scale(${imageScale});transform-origin:center center;" />`
    : '';

  let overlayHtml = '';
  if (slide.type === 'photo' || slide.type === 'overlay') {
    const gradColor = slide.gradientColor ?? '#000000';
    const { r, g, b } = hexToRgb(gradColor);
    const alpha = (slide.overlayOpacity ?? 75) / 100;
    const gradDir = (slide.textPosition ?? 'bottom') === 'top' ? 'to top' : 'to bottom';
    const gradStart = slide.gradientStart ?? 25;

    let overlayStyle: string;
    if (slide.type === 'photo') {
      overlayStyle = `background: linear-gradient(${gradDir}, rgba(${r},${g},${b},0) 0%, rgba(${r},${g},${b},${alpha}) ${100 - gradStart}%, rgba(${r},${g},${b},${alpha}) 100%);`;
    } else {
      overlayStyle = `background: rgba(${r},${g},${b},${alpha});`;
    }
    overlayHtml = `<div style="position:absolute;inset:0;z-index:1;${overlayStyle}"></div>`;
  }

  const zonesHtml = (slide.zones ?? []).map((zone) => {
    const transform = zone.rotation ? `rotate(${zone.rotation}deg)` : 'none';
    const justifyContent =
      zone.alignV === 'top' ? 'flex-start' :
      zone.alignV === 'bottom' ? 'flex-end' : 'center';

    const containerStyle = [
      `position:absolute`,
      `left:${zone.x}px`,
      `top:${zone.y}px`,
      `width:${zone.w}px`,
      `height:${zone.h}px`,
      `z-index:10`,
      `transform:${transform}`,
      `transform-origin:center center`,
      `display:flex`,
      `flex-direction:column`,
      `justify-content:${justifyContent}`,
      `padding:8px`,
      `box-sizing:border-box`,
    ].join(';');

    let inner: string;
    if (zone.isLogo) {
      const accentColor = brandColors?.accent ?? '#fff';
      inner = `<div style="display:flex;align-items:center;justify-content:center;height:100%;">
        <div style="background:rgba(255,255,255,0.12);border-radius:4px;padding:8px 20px;font-family:'Josefin Sans',sans-serif;font-size:24px;font-weight:700;color:${escapeAttr(accentColor)};letter-spacing:0.12em;border:1px solid rgba(255,255,255,0.2);">
          ${escapeHtml(getZonePlainText(zone))}
        </div>
      </div>`;
    } else {
      const family = zone.fontFamily || 'system-ui, sans-serif';
      const familyCss = /[,]/.test(family) ? family : `'${family}',sans-serif`;
      const textStyle = [
        `font-family:${familyCss}`,
        `font-size:${zone.fontSize}px`,
        `font-weight:${zone.fontWeight}`,
        `color:${escapeAttr(zone.color)}`,
        `font-style:${zone.italic ? 'italic' : 'normal'}`,
        `text-align:${zone.alignH}`,
        `line-height:${zone.lineHeight}`,
        `letter-spacing:${zone.letterSpacing}em`,
        `white-space:pre-wrap`,
        `width:100%`,
      ].join(';');
      inner = `<div style="${textStyle}">${renderTextContent(zone.text)}</div>`;
    }

    return `<div style="${containerStyle}">${inner}</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${buildFontLinks(slide)}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
</style>
</head>
<body>
<div style="width:${w}px;height:${h}px;position:relative;overflow:hidden;">
  <div style="position:absolute;inset:0;${bgCss}"></div>
  ${photoHtml}
  ${overlayHtml}
  ${zonesHtml}
</div>
</body>
</html>`;
}

// Render zone text content. Plain string falls through with HTML-escape.
// TextSpan[] maps each span to a <span> with inline style overrides; spans
// with no overrides emit unwrapped text. Mirrors web/src/.../ZoneCanvas
// SpanText so server PNG and live preview agree visually.
function renderTextContent(text: string | TextSpan[]): string {
  if (typeof text === 'string') return escapeHtml(text);
  return text
    .map((s) => {
      const styleParts: string[] = [];
      if (s.color) styleParts.push(`color:${escapeAttr(s.color)}`);
      if (s.fontFamily) {
        const fam = /[,]/.test(s.fontFamily) ? s.fontFamily : `'${s.fontFamily}',sans-serif`;
        styleParts.push(`font-family:${fam}`);
      }
      if (s.fontSize !== undefined) styleParts.push(`font-size:${s.fontSize}px`);
      if (s.fontWeight !== undefined) styleParts.push(`font-weight:${s.fontWeight}`);
      if (s.italic === true) styleParts.push('font-style:italic');
      if (s.italic === false) styleParts.push('font-style:normal');
      if (styleParts.length === 0) return escapeHtml(s.text);
      return `<span style="${styleParts.join(';')}">${escapeHtml(s.text)}</span>`;
    })
    .join('');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}
