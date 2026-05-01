import { z } from 'zod';

export const PostStatusSchema = z.enum(['draft', 'scheduled', 'publishing', 'published']);
export type PostStatus = z.infer<typeof PostStatusSchema>;

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
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});
export type Post = z.infer<typeof PostSchema>;
