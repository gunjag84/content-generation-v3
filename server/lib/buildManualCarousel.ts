// Manual-mode carousel builder: takes verbatim slide text from the user and
// asks Haiku to mark 1-3 emphasis spans per slide. Spans become ACCENT lines
// in the SocialSlide; surrounding text becomes BASE lines. Span text must be
// a verbatim substring of the slide; hallucinated spans are dropped silently.
// On any Haiku failure (network, malformed JSON, validation) the slides
// degrade to all-BASE rather than failing the whole submission.

import { z } from 'zod';
import type { SocialSlide, SlideContentLine } from '../../shared/types/slide.js';
import type { ParsedCarousel } from '../../shared/lib/parseSlidesMd.js';
import { parseManualSlides } from '../../shared/lib/parseManualSlides.js';
import { makeAnthropicClient } from './anthropic.js';
import { HAIKU_MODEL } from './learningConfig.js';

const EmphasisSchema = z.object({
  slides: z.array(
    z.object({
      number: z.number().int().positive(),
      spans: z.array(z.string()).max(5),
    }),
  ),
});

interface BuildInput {
  apiKey: string;
  situationText: string;
  methodSlug: string;
}

function emptySlide(num: number): SocialSlide {
  return {
    number: num,
    photo: num,
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

// Split slide text on the first occurrence of each span (greedy, left-to-right).
// Returns interleaved BASE/ACCENT SlideContentLine[]. Spans not found in the
// text are skipped. If all spans drop, returns a single BASE line with the
// full text.
function buildLinesWithSpans(text: string, spans: string[]): SlideContentLine[] {
  const lines: SlideContentLine[] = [];
  let cursor = 0;

  // Find first index for each span starting from current cursor; sort by index.
  const remaining = [...spans];
  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestSpan: string | null = null;
    let bestSpanPos = -1;
    for (let i = 0; i < remaining.length; i++) {
      const span = remaining[i];
      if (!span) continue;
      const idx = text.indexOf(span, cursor);
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
        bestSpan = span;
        bestSpanPos = i;
      }
    }
    if (bestIdx === -1 || bestSpan === null) break;

    if (bestIdx > cursor) {
      const pre = text.slice(cursor, bestIdx).trim();
      if (pre) lines.push({ type: 'BASE', text: pre });
    }
    lines.push({ type: 'ACCENT', text: bestSpan });
    cursor = bestIdx + bestSpan.length;
    remaining.splice(bestSpanPos, 1);
  }

  if (cursor < text.length) {
    const tail = text.slice(cursor).trim();
    if (tail) lines.push({ type: 'BASE', text: tail });
  }

  if (lines.length === 0) {
    lines.push({ type: 'BASE', text: text.trim() });
  }
  return lines;
}

function buildHaikuPrompt(slides: Array<{ number: number; text: string }>): string {
  const rendered = slides.map((s) => `Slide ${s.number}: ${s.text}`).join('\n\n');
  return `You are styling slide text for an Instagram carousel. For each slide below, return a JSON object marking which short span(s) should be emphasized with accent color + bold. Pick 1-3 spans per slide, total <= 6 words. Spans must be verbatim substrings of the slide text - never invent or rewrite. Prefer the line's emotional or imperative payload (the question, the punchline, the verb of the call-to-action). Return only JSON.

${rendered}

Output exactly this shape, no surrounding text or markdown fences:
{ "slides": [ { "number": 1, "spans": ["..."] } ] }`;
}

export async function buildManualCarousel(input: BuildInput): Promise<ParsedCarousel> {
  const { apiKey, situationText } = input;
  const parsed = parseManualSlides(situationText);

  // Build BASE-only fallback so any failure path still produces valid slides.
  const fallback = (): SocialSlide[] =>
    parsed.slides.map((s) => {
      const slide = emptySlide(s.number);
      slide.lines = [{ type: 'BASE', text: s.text }];
      return slide;
    });

  let spansByNumber = new Map<number, string[]>();
  try {
    const client = makeAnthropicClient(apiKey);
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: buildHaikuPrompt(parsed.slides) }],
    });
    let text = '';
    for (const block of resp.content) {
      if (block.type === 'text') text += block.text;
    }
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    const validated = EmphasisSchema.parse(JSON.parse(cleaned));
    spansByNumber = new Map(validated.slides.map((s) => [s.number, s.spans]));
  } catch (err) {
    console.error('[buildManualCarousel] haiku emphasis failed:', (err as Error).message);
    return { title: '', slides: fallback(), caption: '' };
  }

  const slides: SocialSlide[] = parsed.slides.map((s) => {
    const slide = emptySlide(s.number);
    const spans = spansByNumber.get(s.number) ?? [];
    slide.lines = buildLinesWithSpans(s.text, spans);
    return slide;
  });

  return { title: '', slides, caption: '' };
}
