// Zitat carousels are pure quote+caption with no Anthropic call.
// Hardcoded captions drawn from v2 zitat templates.

import type { SocialSlide } from '../../shared/types/slide.js';
import type { ParsedCarousel } from '../../shared/lib/parseSlidesMd.js';

export const ZITAT_CAPTIONS: string[] = [
  'Manchmal trifft ein Satz mitten ins Gefühl. Speicher Dir das, wenn es Dir gerade auch so geht.\n\n#lebenlieben #familienleben #mamaleben',
  'Ich lese diesen Satz immer wieder, wenn der Tag mich klein macht. Vielleicht hilft er Dir auch.\n\n#lebenlieben #familienleben #mamaleben',
  'Ein Gedanke, den ich nicht mehr loswerde. Wenn er Dich auch trifft, schick ihn weiter an jemanden, der ihn heute braucht.\n\n#lebenlieben #familienleben #mamaleben',
];

function pickCaption(situationText: string): string {
  // Deterministic pick based on situation hash so retries stay stable.
  let h = 0;
  for (let i = 0; i < situationText.length; i++) h = (h * 31 + situationText.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % ZITAT_CAPTIONS.length;
  return ZITAT_CAPTIONS[idx];
}

function emptySlide(num: number): SocialSlide {
  return {
    number: num,
    type: 'photo',
    textPosition: 'bottom',
    lines: [],
    zones: [],
    imageScale: 1,
    imageX: 0,
    imageY: 0,
    overlayOpacity: 0,
  };
}

export function buildZitatCarousel(situationText: string): ParsedCarousel {
  // One quote slide. The situation text IS the quote source — caller passes it in.
  const slide = emptySlide(1);
  slide.lines = [
    { type: 'BASE', text: situationText.trim() },
  ];

  return {
    title: 'Zitat',
    slides: [slide],
    caption: pickCaption(situationText),
  };
}
