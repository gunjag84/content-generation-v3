import type { SocialSlide } from '../../shared/types/slide.js';

export interface BrandColors {
  primary: string;
  accent: string;
}

// Mirror the visual contract of ZoneCanvas.tsx server-side.
// All styles are inline; no external resources so Playwright renders instantly.
export function buildSlideHtml(
  slide: SocialSlide,
  photoUrl: string | null,
  brandColors?: BrandColors,
): string {
  const bgColor = slide.type === 'cta' ? '#0f1f16' : '#1c1c2e';
  const imageX = slide.imageX ?? 50;
  const imageY = slide.imageY ?? 50;
  const imageScale = slide.imageScale ?? 1;

  // Match editor preview: <img> with object-fit:contain + transform:scale().
  // Default (scale=1) = whole photo visible; slider zoom up to 3x.
  const bgCss = `background-color: ${bgColor};`;
  const photoHtml = photoUrl
    ? `<img src="${escapeAttr(photoUrl)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:${imageX}% ${imageY}%;transform:scale(${imageScale});transform-origin:center center;" />`
    : '';

  // Gradient overlay — mirrors ZoneCanvas gradOverlay logic
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

  // Zones
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
        <div style="background:rgba(255,255,255,0.12);border-radius:4px;padding:8px 20px;font-family:system-ui,sans-serif;font-size:24px;font-weight:700;color:${escapeAttr(accentColor)};letter-spacing:0.12em;border:1px solid rgba(255,255,255,0.2);">
          LEBEN.LIEBEN
        </div>
      </div>`;
    } else {
      const textStyle = [
        `font-family:${escapeAttr(zone.fontFamily || 'system-ui, sans-serif')}`,
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
      inner = `<div style="${textStyle}">${escapeHtml(zone.text)}</div>`;
    }

    return `<div style="${containerStyle}">${inner}</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1080px; overflow: hidden; }
</style>
</head>
<body>
<div style="width:1080px;height:1080px;position:relative;overflow:hidden;">
  <div style="position:absolute;inset:0;${bgCss}"></div>
  ${photoHtml}
  ${overlayHtml}
  ${zonesHtml}
</div>
</body>
</html>`;
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
