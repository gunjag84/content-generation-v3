// Ported verbatim from v2 server/services/socialClubRender.ts lines 103-212.
// Format is brittle by design; do not modify without updating prompt templates.
//
// Returns SocialSlide-shaped objects with empty zone fields filled in;
// the downstream editor (web) populates zones interactively.

import type { SlideType, SlideContentLine, SocialSlide } from '../types/slide.js';

export interface ParsedCarousel {
  title: string;
  slides: SocialSlide[];
  caption: string;
  captionPaid?: string;
}

function emptySlide(num: number, photo: string | number | undefined, type: SlideType): SocialSlide {
  return {
    number: num,
    photo,
    type,
    textPosition: 'bottom',
    lines: [],
    zones: [],
    imageScale: 1,
    imageX: 0,
    imageY: 0,
    overlayOpacity: 0,
  };
}

export function parseSlidesMd(content: string): ParsedCarousel {
  const lines = content.split('\n');
  let title = '';
  const slides: SocialSlide[] = [];
  let currentSlide: SocialSlide | null = null;
  let caption = '';
  let captionPaid = '';
  let captionMode: 'none' | 'caption' | 'organic' | 'paid' = 'none';

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Title
    if (line.startsWith('CAROUSEL:')) {
      title = line.slice('CAROUSEL:'.length).trim();
      continue;
    }

    // Slide header
    const slideMatch = line.match(/^SLIDE\s+(\d+)\s*(?:\|(.*))?$/i);
    if (slideMatch) {
      if (currentSlide) slides.push(currentSlide);
      captionMode = 'none';

      const num = parseInt(slideMatch[1], 10);
      const opts = slideMatch[2] || '';

      let photo: string | number | undefined;
      let type: SlideType = 'text';

      const photoMatch = opts.match(/photo:\s*(\w+)/i);
      if (photoMatch) {
        const val = photoMatch[1];
        photo = /^\d+$/.test(val) ? parseInt(val, 10) : val;
      }

      const typeMatch = opts.match(/type:\s*(photo|text|overlay|cta)/i);
      if (typeMatch) {
        type = typeMatch[1].toLowerCase() as SlideType;
      }

      currentSlide = emptySlide(num, photo, type);
      continue;
    }

    // Caption sections
    if (/^CAPTION\s*\(organisch\)\s*:/i.test(line)) {
      if (currentSlide) {
        slides.push(currentSlide);
        currentSlide = null;
      }
      captionMode = 'organic';
      continue;
    }
    if (/^CAPTION\s*\(Paid\s*Ad\)\s*:/i.test(line)) {
      if (currentSlide) {
        slides.push(currentSlide);
        currentSlide = null;
      }
      captionMode = 'paid';
      continue;
    }
    if (/^CAPTION\s*:/i.test(line)) {
      if (currentSlide) {
        slides.push(currentSlide);
        currentSlide = null;
      }
      captionMode = 'caption';
      continue;
    }

    // Accumulate caption text
    if (captionMode === 'caption' || captionMode === 'organic') {
      caption += (caption ? '\n' : '') + rawLine;
      continue;
    }
    if (captionMode === 'paid') {
      captionPaid += (captionPaid ? '\n' : '') + rawLine;
      continue;
    }

    // Content lines within a slide
    if (currentSlide) {
      if (line === 'DIVIDER') {
        currentSlide.lines.push({ type: 'DIVIDER', text: '' } satisfies SlideContentLine);
      } else if (line.startsWith('BASE:')) {
        currentSlide.lines.push({ type: 'BASE', text: line.slice(5).trim() });
      } else if (line.startsWith('ACCENT:')) {
        currentSlide.lines.push({ type: 'ACCENT', text: line.slice(7).trim() });
      } else if (line.startsWith('SUBTLE:')) {
        currentSlide.lines.push({ type: 'SUBTLE', text: line.slice(7).trim() });
      } else if (line.startsWith('BRAND:')) {
        currentSlide.lines.push({ type: 'BRAND', text: line.slice(6).trim() });
      }
    }
  }

  if (currentSlide) slides.push(currentSlide);

  // Infer types for slides without explicit type
  for (const slide of slides) {
    if (!slide.type || slide.type === 'text') {
      const hasBrand = slide.lines.some((l) => l.type === 'BRAND');
      const hasPhoto = slide.photo !== undefined;
      if (hasBrand) slide.type = 'cta';
      else if (hasPhoto) slide.type = 'photo';
    }
  }

  return {
    title,
    slides,
    caption: caption.trim(),
    captionPaid: captionPaid.trim() || undefined,
  };
}
