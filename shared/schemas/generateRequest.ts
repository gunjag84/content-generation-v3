import { z } from 'zod';
import { LengthKeySchema } from './method.js';

// method is a slug-string (not an enum) because methods are user-extensible
// via Settings. Server validates the slug exists in the brand's methods doc
// and resolves slideCount + description (per length) from there.
export const GenerateRequestSchema = z.object({
  brandId: z.string().min(1),
  mode: z.enum(['create-demand', 'convert-demand']),
  method: z.string().min(1).regex(/^[a-z0-9-]+$/),
  length: LengthKeySchema.default('medium'),
  situationText: z.string().min(10),
  situationId: z.string().min(1).nullable().default(null),
  photos: z
    .array(
      z.object({
        url: z.string().url(),
        label: z.string(), // 'all' or '1', '2', ...
      }),
    )
    .default([]),
  author: z.string().optional(),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
