import { z } from 'zod';

export const PostStatusSchema = z.enum(['draft', 'scheduled', 'publishing', 'published']);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const IgStatsSchema = z.object({
  reach: z.number().optional(),
  impressions: z.number().optional(),
  likes: z.number().optional(),
  comments: z.number().optional(),
  saves: z.number().optional(),
  syncedAt: z.unknown().optional(),
}).nullable();
export type IgStats = z.infer<typeof IgStatsSchema>;

export const PostSchema = z.object({
  status: PostStatusSchema,
  aiSnapshot: z.object({
    slides: z.array(z.unknown()), // SocialSlide; not deeply validated server-side
    caption: z.string(),
  }),
  slides: z.array(z.unknown()),
  caption: z.string(),
  mode: z.enum(['create-demand', 'convert-demand']),
  method: z.enum(['story', 'liste', 'vorher-nachher', 'zitat']),
  focusAreaId: z.string().nullable(),
  situationText: z.string(),
  situationId: z.string().nullable(),
  photoUrls: z.record(z.string()), // map: { all: '...', '1': '...' }
  // Phase 3 additions:
  renderedSlideUrls: z.array(z.string()).nullable().optional(), // PNG paths in Storage after render
  scheduledAt: z.unknown().nullable().optional(), // Firestore Timestamp; set when status='scheduled'
  publishingStartedAt: z.unknown().nullable().optional(), // lock for publish-worker; >10min = stale
  publishedAt: z.unknown().nullable().optional(), // when status flipped to 'published'
  publishedSnapshot: z.object({
    slides: z.array(z.unknown()),
    caption: z.string(),
  }).nullable().optional(), // captured at publish-time, drives Phase-4 learning loop
  igMediaId: z.string().nullable().optional(),
  igPermalink: z.string().nullable().optional(),
  igStats: IgStatsSchema.optional(),
  // Phase 4a: per-zone Levenshtein edit ratios captured at publish-time.
  // Drives Phase 4b dashboard's edit hot-spots widget. Null until first publish.
  editStats: z
    .object({
      editRatioByZone: z.object({
        hook: z.number().min(0),
        body: z.number().min(0),
        cta: z.number().min(0),
        caption: z.number().min(0),
      }),
      totalEditRatio: z.number().min(0),
    })
    .nullable()
    .optional(),
  // Phase 4a enforcement: post-generate Haiku audit of pattern compliance.
  // Score = followedCount / totalPatterns. Null until first generate with patterns.
  patternAudit: z
    .object({
      score: z.number().min(0).max(1),
      totalPatterns: z.number().int().min(0),
      followedCount: z.number().int().min(0),
      results: z.array(
        z.object({
          patternId: z.string(),
          zone: z.enum(['hook', 'body', 'cta', 'caption']),
          followed: z.boolean(),
          evidence: z.string(),
        }),
      ),
      auditedAt: z.unknown(),
    })
    .nullable()
    .optional(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});
export type Post = z.infer<typeof PostSchema>;
