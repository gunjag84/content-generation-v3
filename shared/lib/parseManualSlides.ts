// Parses user-typed verbatim slide input. Format:
//   Slide 1: text...
//   Slide 2: more text...
// Lines until the next `Slide N:` header belong to the previous slide.
// Slide numbers in the input are ignored — slides are renumbered 1..N in
// order of appearance. Empty slides are dropped. Throws if no slides parse.

export interface ManualSlide {
  number: number;
  text: string;
}

export interface ManualSlidesParse {
  slides: ManualSlide[];
}

const HEADER = /^Slide\s+(\d+)\s*:\s*(.*)$/i;

export function parseManualSlides(input: string): ManualSlidesParse {
  const lines = input.split('\n');
  const accum: string[][] = [];
  let current: string[] | null = null;

  for (const raw of lines) {
    const m = raw.match(HEADER);
    if (m) {
      if (current) accum.push(current);
      current = [m[2] ?? ''];
    } else if (current) {
      current.push(raw);
    }
  }
  if (current) accum.push(current);

  const slides: ManualSlide[] = [];
  for (const chunk of accum) {
    const text = chunk.join('\n').trim();
    if (text.length === 0) continue;
    slides.push({ number: slides.length + 1, text });
  }

  if (slides.length === 0) {
    throw new Error('no_slides');
  }

  return { slides };
}
