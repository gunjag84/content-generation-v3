import { z } from 'zod';

export const GenerateRequestSchema = z.object({
  brandId: z.string().min(1),
  mode: z.enum(['create-demand', 'convert-demand']),
  method: z.enum(['story', 'liste', 'vorher-nachher', 'zitat']),
  focusAreaId: z.string().min(1).nullable().default(null),
  situationText: z.string().min(10),
  situationId: z.string().min(1).nullable().default(null),
  slideCount: z.number().int().min(1).max(10).default(7),
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
