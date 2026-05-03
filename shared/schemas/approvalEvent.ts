import { z } from 'zod';

// Phase 4a approval-success ledger.
// On Approve, we capture editRatioBefore (avg total editRatio across the
// most-recent APPROVAL_BASELINE_WINDOW publishes), then track editRatioAfter
// over the next APPROVAL_LEDGER_WINDOW publishes. Once finalized, deltaEditRatio
// tells us whether the approval HELPED the brand (delta < 0) or HURT (delta >
// APPROVAL_HURTFUL_DELTA).
//
// Stored at users/{uid}/brands/{brandId}/approvalEvents/{eventId}.
export const ApprovalEventSchema = z.object({
  patternId: z.string(), // doc id at time of approval (later deleted)
  patternDescription: z.string(),
  zone: z.enum(['hook', 'body', 'cta', 'caption']),
  target: z.enum(['voice', 'persona']),
  mergedText: z.string(),
  // BEFORE baseline: avg totalEditRatio of last APPROVAL_BASELINE_WINDOW
  // publishes prior to approval. Null if fewer than 3 publishes existed
  // (no statistical baseline).
  editRatioBefore: z.number().nullable(),
  publishCountBefore: z.number().int().min(0),
  // AFTER measurement: incrementally updated as new publishes arrive.
  // Null until publishCountAfter > 0.
  editRatioAfter: z.number().nullable(),
  publishCountAfter: z.number().int().min(0),
  // editRatioAfter - editRatioBefore. Negative = approval improved first-shots.
  // Positive = approval hurt. Null until both baselines exist.
  deltaEditRatio: z.number().nullable(),
  // Set true when finalizedAt fires AND deltaEditRatio > APPROVAL_HURTFUL_DELTA.
  // Surfaces in Settings as "this approval may have hurt".
  hurtful: z.boolean(),
  createdAt: z.unknown(),
  // Filled in once publishCountAfter reaches APPROVAL_LEDGER_WINDOW.
  finalizedAt: z.unknown().nullable(),
});
export type ApprovalEvent = z.infer<typeof ApprovalEventSchema>;
