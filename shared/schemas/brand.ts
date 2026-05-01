import { z } from 'zod';
import { FocusAreaSchema } from './focusArea.js';

export const BrandIdentitySchema = z.object({
  voice: z.string().default(''),
  persona: z.string().default(''),
  product_uvp: z.string().default(''),
  point_of_view: z.string().default(''),
  competitive_landscape: z.string().default(''),
});

export const BrandDesignSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#000000'),
  secondaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#ffffff'),
  logoUrl: z.string().url().nullable().default(null),
  igHandle: z.string().default(''),
});

export const BrandSchema = z.object({
  name: z.string().min(1),
  identity: BrandIdentitySchema.default({}),
  design: BrandDesignSchema.default({}),
  focusAreas: z.array(FocusAreaSchema).default([]),
  // Phase 3: required for publish-worker; nullable until user configures
  instagramUserId: z.string().nullable().default(null),
  // serverTimestamp sentinel; not validated through zod runtime
  updatedAt: z.unknown(),
});

export type Brand = z.infer<typeof BrandSchema>;
export type BrandIdentity = z.infer<typeof BrandIdentitySchema>;
export type BrandDesign = z.infer<typeof BrandDesignSchema>;

export { FocusAreaSchema };
export type { FocusArea } from './focusArea.js';
