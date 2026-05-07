import { z } from 'zod';

export const PostStatusSchema = z.enum(['draft', 'scheduled', 'publishing', 'published']);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const IgStatsSchema = z.object({
  reach: z.number().nullable().optional(),
  impressions: z.number().nullable().optional(),
  likes: z.number().nullable().optional(),
  comments: z.number().nullable().optional(),
  saves: z.number().nullable().optional(),
  // Reels-only metrics. Routed via media_type-aware metricsForType() in
  // igStatsSync. Null/undefined when the post is IMAGE/CAROUSEL_ALBUM.
  plays: z.number().nullable().optional(),
  videoViews: z.number().nullable().optional(),
  shares: z.number().nullable().optional(),
  // Followers GAINED through this specific post (Meta v22+ insights metric
  // `follows`). Per-post attribution, not brand-total. Null = endpoint did
  // not return the metric for this media type / fetch failed.
  follows: z.number().nullable().optional(),
  // Comments authored by the brand's own IG account (replies to commenters).
  // Counted via /{mediaId}/comments?fields=username,user,replies{username,user}
  // (v22+ removed the `from` field; match on `username === igUsername` OR
  // `!!user` for self-detection). Null = fetch failed.
  ownComments: z.number().nullable().optional(),
  syncedAt: z.unknown().optional(),
}).nullable();
export type IgStats = z.infer<typeof IgStatsSchema>;

// IG media types we care about. STORY is filtered out before write
// (24h life - no historical value). REELS triggers Reels metric routing.
export const IgMediaTypeSchema = z.enum(['IMAGE', 'CAROUSEL_ALBUM', 'REELS']);
export type IgMediaType = z.infer<typeof IgMediaTypeSchema>;

// Discriminator: 'tool' = generated/published via this app, 'ig-native' = pulled
// from the IG Graph feed by igFeedSync. Flat schema (NOT discriminatedUnion):
// zod's default-on-discriminator is unsupported and would break reads of
// existing pre-migration posts that have no `source` field.
export const PostSourceSchema = z.enum(['tool', 'ig-native']);
export type PostSource = z.infer<typeof PostSourceSchema>;

export const PostSchema = z.object({
  status: PostStatusSchema,
  // Tool-specific creation fields. All optional because ig-native posts
  // (sync'd from IG Graph feed) don't have an AI baseline, slides, or any
  // of the tool's creation-flow metadata. Tool posts always set these.
  aiSnapshot: z.object({
    slides: z.array(z.unknown()), // SocialSlide; not deeply validated server-side
    caption: z.string(),
  }).optional(),
  slides: z.array(z.unknown()).optional(),
  caption: z.string().optional(),
  mode: z.enum(['create-demand', 'convert-demand']).optional(),
  method: z.string().optional(), // slug; methods are user-extensible via Settings
  length: z.enum(['short', 'medium', 'long']).optional(),
  situationText: z.string().optional(),
  situationId: z.string().nullable().optional(),
  photoUrls: z.record(z.string()).optional(), // map: { all: '...', '1': '...' }
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
  // ig-feed-sync (2026-05-06): discriminator + IG-native fields.
  // `source` defaults to 'tool' so existing pre-migration posts read back
  // as tool posts. Flat schema, NOT discriminatedUnion (default-on-disc.
  // unsupported in zod and would break reads).
  source: PostSourceSchema.default('tool'),
  mediaType: IgMediaTypeSchema.optional(),
  // ig-native fields. Tool posts ignore these; ig-native posts use them
  // for the History thumbnail + IG link (since ig-native have no
  // renderedSlideUrls / aiSnapshot).
  mediaUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  syncedAt: z.unknown().optional(),
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
  // Phase 4a observability: structured failure record from learningExtractor
  // / patternAudit / approvalLedger. Set when a step fails so the dashboard
  // can surface 'this post couldn't learn'. Null on the happy path.
  learningError: z
    .object({
      step: z.enum(['diff', 'editStats', 'apiKey', 'extract', 'audit', 'persist', 'ledger']),
      message: z.string(),
      at: z.unknown(),
    })
    .nullable()
    .optional(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});
export type Post = z.infer<typeof PostSchema>;

// Narrow types via discriminator. Use the type guards in
// shared/lib/postTypeGuards.ts rather than these directly when possible.
export type ToolPost = Post & { source?: 'tool'; method: NonNullable<Post['method']> };
export type IgNativePost = Post & {
  source: 'ig-native';
  igMediaId: string;
  mediaType: IgMediaType;
};

// Per-brand status doc written by igFeedSync, read by the Settings/Instagram
// banner. Lives at users/{uid}/brands/{brandId}/igFeedSyncStatus/current.
export const IgFeedSyncStatusSchema = z.enum([
  'not_configured',
  'syncing',
  'ok',
  'token_expired',
  'rate_limited',
  'parse_error',
  'error',
]);
export type IgFeedSyncStatusEnum = z.infer<typeof IgFeedSyncStatusSchema>;

export const IgFeedSyncStatusDocSchema = z.object({
  status: IgFeedSyncStatusSchema,
  lastSync: z.unknown().nullable().optional(),
  itemCount: z.number().int().nonnegative().optional(),
  tokenExpiresInDays: z.number().int().nullable().optional(),
  error: z.string().optional(),
});
export type IgFeedSyncStatusDoc = z.infer<typeof IgFeedSyncStatusDocSchema>;
