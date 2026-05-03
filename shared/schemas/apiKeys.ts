import { z } from 'zod';

export const SetApiKeysBody = z
  .object({
    anthropic: z.string().min(20).startsWith('sk-').optional(),
    metaGraph: z.string().min(20).optional(),
  })
  .refine((d) => d.anthropic || d.metaGraph, { message: 'no key provided' });

export const GetApiKeysResponse = z.object({
  anthropic: z.object({ configured: z.boolean() }),
  metaGraph: z.object({ configured: z.boolean() }),
});
