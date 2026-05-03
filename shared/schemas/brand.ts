import { z } from 'zod';
import { FocusAreaSchema } from './focusArea.js';

export const BrandIdentitySchema = z.object({
  voice: z.string().default(''),
  persona: z.string().default(''),
  product_uvp: z.string().default(''),
  point_of_view: z.string().default(''),
  competitive_landscape: z.string().default(''),
});

export const ZoneRoleSchema = z.enum(['ACCENT', 'BASE', 'SUBTLE', 'BRAND']);
export type ZoneRole = z.infer<typeof ZoneRoleSchema>;

export const ZoneDefaultSchema = z.object({
  color: z.enum(['primary', 'secondary']),
  fontFamily: z.string().min(1),
  fontSize: z.number().int().positive(),
});
export type ZoneDefault = z.infer<typeof ZoneDefaultSchema>;

// Per-zone-role defaults applied when draft slides are first generated.
// Stored partial — missing roles fall back to hardcoded values in linesToZones.
export const ZoneDefaultsSchema = z
  .object({
    ACCENT: ZoneDefaultSchema,
    BASE: ZoneDefaultSchema,
    SUBTLE: ZoneDefaultSchema,
    BRAND: ZoneDefaultSchema,
  })
  .partial();
export type ZoneDefaults = z.infer<typeof ZoneDefaultsSchema>;

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
  zoneDefaults: ZoneDefaultsSchema.default({}),
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
