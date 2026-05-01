import { z } from 'zod';

export const RenderJobStatusSchema = z.enum(['pending', 'rendering', 'done', 'error']);
export type RenderJobStatus = z.infer<typeof RenderJobStatusSchema>;

export const RenderJobSchema = z.object({
  postId: z.string(),
  brandId: z.string(),
  status: RenderJobStatusSchema,
  slideCount: z.number().int().positive(),
  completedSlides: z.number().int().nonnegative(),
  slideUrls: z.array(z.string()),
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});
export type RenderJob = z.infer<typeof RenderJobSchema>;

// POST /api/render-jobs request body
export const RenderJobRequestSchema = z.object({
  brandId: z.string().min(1),
  postId: z.string().min(1),
});
export type RenderJobRequest = z.infer<typeof RenderJobRequestSchema>;

// POST /internal/render request body (Cloud Tasks payload)
export const RenderTaskPayloadSchema = z.object({
  uid: z.string().min(1),
  brandId: z.string().min(1),
  postId: z.string().min(1),
  jobId: z.string().min(1),
});
export type RenderTaskPayload = z.infer<typeof RenderTaskPayloadSchema>;
