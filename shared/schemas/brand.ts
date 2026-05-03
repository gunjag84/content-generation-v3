import { z } from 'zod';
import { FocusAreaSchema } from './focusArea.js';

export const BrandIdentitySchema = z.object({
  voice: z.string().default(''),
  persona: z.string().default(''),
  product_uvp: z.string().default(''),
  point_of_view: z.string().default(''),
  competitive_landscape: z.string().default(''),
});

// Only ACCENT (Hook) and BASE (Body) are user-configurable defaults.
// SUBTLE and BRAND lines from generated content fall back to hardcoded
// defaults in linesToZones.
export const ZoneRoleSchema = z.enum(['ACCENT', 'BASE']);
export type ZoneRole = z.infer<typeof ZoneRoleSchema>;

export const ZoneDefaultSchema = z.object({
  color: z.enum(['standard', 'accent']),
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
  })
  .partial();
export type ZoneDefaults = z.infer<typeof ZoneDefaultsSchema>;

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const BrandDesignSchema = z.object({
  // Background color used for non-CTA slide canvases (editor + preview + render).
  backgroundColor: HEX.default('#1c1c2e'),
  // Default text color for "standard" zones.
  standardTextColor: HEX.default('#ffffff'),
  // Highlight text color for "accent" zones.
  accentTextColor: HEX.default('#f59e0b'),
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
