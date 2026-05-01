import { z } from 'zod';

export const SetApiKeysBody = z.object({
  anthropic: z.string().min(20).startsWith('sk-'),
});

export const GetApiKeysResponse = z.object({
  anthropic: z.object({ configured: z.boolean() }),
  metaGraph: z.object({ configured: z.boolean() }),
});
