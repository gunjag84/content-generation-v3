import { z } from 'zod';

export const MethodSchema = z.object({
  name: z.string().min(1), // display name, e.g. "Vorher/Nachher"
  slug: z.string().regex(/^[a-z0-9-]+$/), // matches v2 prompt file names
  description: z.string().default(''),
});

export type Method = z.infer<typeof MethodSchema>;

export const DEFAULT_METHODS: Array<{ id: string } & Method> = [
  { id: 'story', name: 'Story', slug: 'story', description: '' },
  { id: 'liste', name: 'Liste', slug: 'liste', description: '' },
  { id: 'vorher-nachher', name: 'Vorher/Nachher', slug: 'vorher-nachher', description: '' },
  { id: 'zitat', name: 'Zitat', slug: 'zitat', description: '' },
];
