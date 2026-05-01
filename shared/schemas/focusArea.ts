import { z } from 'zod';

export const FocusAreaSchema = z.object({
  id: z.string().min(1), // client-generated crypto.randomUUID()
  name: z.string().min(1),
  description: z.string().default(''),
});

export type FocusArea = z.infer<typeof FocusAreaSchema>;
