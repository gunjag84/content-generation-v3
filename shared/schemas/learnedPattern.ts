import { z } from 'zod';

export const PatternZoneSchema = z.enum(['hook', 'body', 'cta', 'caption']);
export type PatternZone = z.infer<typeof PatternZoneSchema>;

// active: extractor-default. Injected as Layer 6 in system prompt. Eligible
//         for promotion to brand.identity once threshold is crossed.
// dismissed: user explicitly rejected. NOT injected. NOT eligible for
//            promotion. Stays as a record so the extractor knows to avoid
//            proposing similar rules.
export const PatternStatusSchema = z.enum(['active', 'dismissed']);
export type PatternStatus = z.infer<typeof PatternStatusSchema>;

export const LearnedPatternSchema = z.object({
  description: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  zone: PatternZoneSchema,
  sourcePostId: z.string(),
  sourceMethod: z.string(), // method slug; user-extensible via Settings
  sourceMode: z.enum(['create-demand', 'convert-demand']),
  // {postId}_{diffHash}_{zone} - prevents duplicate writes when extractor re-runs.
  idempotencyKey: z.string(),
  // 'active' (default at creation) or 'dismissed' (user rejected).
  status: PatternStatusSchema.default('active'),
  // True once the pattern has been used >=3 times with confidence >=0.7.
  // Surfaced in Settings as a "Suggested update" candidate. Cleared when
  // dismissed (status='dismissed') or when promoted (doc deleted).
  promotionCandidate: z.boolean().default(false),
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
