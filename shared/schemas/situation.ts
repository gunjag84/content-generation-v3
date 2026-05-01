import { z } from 'zod';

export const SituationSchema = z.object({
  text: z.string().min(1),
  imageUrls: z.array(z.string().url()).default([]),
  // serverTimestamp sentinel; not validated through zod runtime
  createdAt: z.unknown(),
});

export type Situation = z.infer<typeof SituationSchema>;
