import { z } from 'zod';

export const PatternZoneSchema = z.enum(['hook', 'body', 'cta', 'caption']);
export type PatternZone = z.infer<typeof PatternZoneSchema>;

export const LearnedPatternSchema = z.object({
  description: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  zone: PatternZoneSchema,
  sourcePostId: z.string(),
  sourceMethod: z.enum(['story', 'liste', 'vorher-nachher', 'zitat']),
  sourceMode: z.enum(['create-demand', 'convert-demand']),
  // {postId}_{diffHash}_{zone} - prevents duplicate writes when extractor re-runs.
  idempotencyKey: z.string(),
  createdAt: z.unknown(),
  lastUsedAt: z.unknown().nullable(),
  useCount: z.number().int().min(0),
});
export type LearnedPattern = z.infer<typeof LearnedPatternSchema>;

// Shape returned by the Haiku extractor. Strict JSON contract.
export const PatternExtractionSchema = z.object({
  description: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});
export type PatternExtraction = z.infer<typeof PatternExtractionSchema>;
