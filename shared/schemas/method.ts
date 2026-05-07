import { z } from 'zod';

// A method defines the slide framework Claude uses to generate the carousel.
// Methods are mode-scoped (each method belongs to exactly one mode) and
// per-brand: each brand has its own methods sub-collection so users can add
// custom methods from the Settings UI.
//
// description is the prompt-level definition of the method. When no built-in
// prompt template exists for the slug, the description is injected verbatim
// into the system prompt as <method_definition> via the _generic.md fallback.
export const MethodModeSchema = z.enum(['create-demand', 'convert-demand']);
export type MethodMode = z.infer<typeof MethodModeSchema>;

export const MethodSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().default(''),
  mode: MethodModeSchema,
  slideCount: z.number().int().min(1).max(10),
});

export type Method = z.infer<typeof MethodSchema>;

export const DEFAULT_METHODS: Array<{ id: string } & Method> = [
  // Create-Demand: emotional reach + engagement, no product.
  { id: 'story', name: 'Story', slug: 'story', description: '', mode: 'create-demand', slideCount: 7 },
  { id: 'liste', name: 'Liste', slug: 'liste', description: '', mode: 'create-demand', slideCount: 7 },
  { id: 'vorher-nachher', name: 'Vorher/Nachher', slug: 'vorher-nachher', description: '', mode: 'create-demand', slideCount: 7 },
  { id: 'zitat', name: 'Zitat', slug: 'zitat', description: '', mode: 'create-demand', slideCount: 1 },
  // Convert-Demand: bridge to product, capture page CTA.
  { id: 'hormozi-ve', name: 'Hormozi Value Equation', slug: 'hormozi-ve', description: '', mode: 'convert-demand', slideCount: 7 },
  { id: 'twist-the-knife', name: 'Twist the Knife', slug: 'twist-the-knife', description: '', mode: 'convert-demand', slideCount: 7 },
];
