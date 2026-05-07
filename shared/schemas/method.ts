import { z } from 'zod';

// Methods are mode-scoped (each method belongs to exactly one mode) and
// per-brand: each brand has its own methods sub-collection so users can add
// custom methods from the Settings UI.
//
// Each method has THREE length variants (Kurz / Mittel / Lang). The user
// picks length in the Create flow. The length determines slide count and
// the description that gets injected into the system prompt for user-added
// methods. Built-in shipped templates (`{slug}-{lengthKey}.md` or legacy
// `{slug}-{count}.md`) win over the description-as-prompt fallback.

export const MethodModeSchema = z.enum(['create-demand', 'convert-demand']);
export type MethodMode = z.infer<typeof MethodModeSchema>;

export const LengthKeySchema = z.enum(['short', 'medium', 'long']);
export type LengthKey = z.infer<typeof LengthKeySchema>;

export const MethodLengthSchema = z.object({
  description: z.string().default(''),
  slideCount: z.number().int().min(1).max(10),
});
export type MethodLength = z.infer<typeof MethodLengthSchema>;

export const MethodLengthsSchema = z.object({
  short: MethodLengthSchema,
  medium: MethodLengthSchema,
  long: MethodLengthSchema,
});
export type MethodLengths = z.infer<typeof MethodLengthsSchema>;

export const MethodSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  mode: MethodModeSchema,
  lengths: MethodLengthsSchema,
});

export type Method = z.infer<typeof MethodSchema>;

// Verbatim descriptions for the convert-demand built-ins. These get seeded
// when a brand has no method docs yet; they're shown in Settings/Methods
// for editing and (for custom methods or when a built-in template is
// missing for the chosen length) injected into _generic.md as
// <method_definition>.
const HORMOZI_VE_DESCRIPTIONS = {
  short:
    'Eine VE-Komponente pro Slide. Sequenz: Dream Outcome (Hook) -> Likelihood (Beweis) -> Time Delay (Geschwindigkeit) -> Effort (Aufwand) -> Bridge -> CTA. Pain bleibt implizit im Dream-Outcome-Hook.',
  medium:
    'Pain bekommt eigene Buehne plus Trust-Builder. Sequenz: Hook (Dream Outcome) -> Status Quo (Pain, 2nd Hook) -> Likelihood -> Time Delay -> Effort -> Trust-Builder (Mini-Case, Wissenschaft, Handwerk) -> Bridge -> CTA.',
  long:
    'Doppelter Pain plus doppelter Beweis. Sequenz: Hook (Dream Outcome) -> Pain Layer 1 (Szene heute) -> Pain Layer 2 (Konsequenz) -> Likelihood (Mechanismus) -> Time Delay -> Effort -> Beweis 2 (Mini-Case oder Vorher/Nachher) -> Trigger-Stack -> Bridge -> CTA.',
};

const TWIST_THE_KNIFE_DESCRIPTIONS = {
  short:
    'Eine PAS-Komponente pro Slide. Sequenz: Problem (Hook) -> Agitate (Twist) -> Solve (Solution-Tease) -> Bridge -> CTA. Funktioniert wenn der Schmerz allgemein bekannt ist.',
  medium:
    'Mit Failed Solutions als Voraus-Einwand. Sequenz: Hook -> Problem (2nd Hook) -> Agitate -> Failed Solutions (was alle versuchen, was nicht funktioniert) -> Solve -> Bridge -> CTA.',
  long:
    'Doppeltes Twisting plus Mechanismus. Sequenz: Hook -> Problem (2nd Hook) -> Agitate Layer 1 (unmittelbare Konsequenz) -> Agitate Layer 2 (Kaskade/Langzeit) -> Failed Solutions -> Failed-Mechanismus (warum sie scheitern, kein Willens-Defizit sondern Design-Fehler) -> Solve -> Bridge -> CTA.',
};

export const DEFAULT_METHODS: Array<{ id: string } & Method> = [
  // Create-Demand: shipped templates exist as legacy {slug}-5/7/9.md;
  // resolver maps short=5, medium=7, long=9.
  {
    id: 'story',
    name: 'Story',
    slug: 'story',
    mode: 'create-demand',
    lengths: {
      short: { description: '', slideCount: 5 },
      medium: { description: '', slideCount: 7 },
      long: { description: '', slideCount: 9 },
    },
  },
  {
    id: 'liste',
    name: 'Liste',
    slug: 'liste',
    mode: 'create-demand',
    lengths: {
      short: { description: '', slideCount: 5 },
      medium: { description: '', slideCount: 7 },
      long: { description: '', slideCount: 9 },
    },
  },
  {
    id: 'vorher-nachher',
    name: 'Vorher/Nachher',
    slug: 'vorher-nachher',
    mode: 'create-demand',
    lengths: {
      short: { description: '', slideCount: 5 },
      medium: { description: '', slideCount: 7 },
      long: { description: '', slideCount: 9 },
    },
  },
  // Zitat is shortcircuited (deterministic 1-slide); length is irrelevant
  // but we ship 1/1/1 for UI consistency.
  {
    id: 'zitat',
    name: 'Zitat',
    slug: 'zitat',
    mode: 'create-demand',
    lengths: {
      short: { description: '', slideCount: 1 },
      medium: { description: '', slideCount: 1 },
      long: { description: '', slideCount: 1 },
    },
  },
  // Convert-Demand: shipped templates exist as {slug}-{lengthKey}.md.
  {
    id: 'hormozi-ve',
    name: 'Hormozi Value Equation',
    slug: 'hormozi-ve',
    mode: 'convert-demand',
    lengths: {
      short: { description: HORMOZI_VE_DESCRIPTIONS.short, slideCount: 6 },
      medium: { description: HORMOZI_VE_DESCRIPTIONS.medium, slideCount: 8 },
      long: { description: HORMOZI_VE_DESCRIPTIONS.long, slideCount: 10 },
    },
  },
  {
    id: 'twist-the-knife',
    name: 'Twist the Knife',
    slug: 'twist-the-knife',
    mode: 'convert-demand',
    lengths: {
      short: { description: TWIST_THE_KNIFE_DESCRIPTIONS.short, slideCount: 5 },
      medium: { description: TWIST_THE_KNIFE_DESCRIPTIONS.medium, slideCount: 7 },
      long: { description: TWIST_THE_KNIFE_DESCRIPTIONS.long, slideCount: 9 },
    },
  },
];
