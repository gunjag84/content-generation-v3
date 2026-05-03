// Phase 4a learning loop tuning constants. Centralized so a single PR can
// tune the loop based on observed data, without hunting through 3 files.
// Each constant is consumed by exactly one feature; documented here.

// ── Edit diff threshold (learningExtractor) ─────────────────────────────────
// Below this Levenshtein ratio, an edit is treated as noise (typo,
// single-word swap) and not handed to Haiku for pattern extraction.
export const EDIT_RATIO_THRESHOLD = 0.15;

// ── Pattern injection (learnedPatterns) ─────────────────────────────────────
// Top-N patterns injected into Layer 6 of the system prompt per generate.
export const TOP_N = 20;
// Half-life for recency weight: a pattern's score halves every N days since
// last use. Keeps fresh signal dominant; aged patterns fade smoothly.
export const RECENCY_HALF_LIFE_DAYS = 30;
// Hard cap on Firestore reads in loadTopPatterns / loadDismissed; protects
// against runaway brands. Brands won't approach 200 patterns at 2-user scale.
export const MAX_FETCH = 200;

// ── Promotion thresholds (learnedPatterns.markPatternsUsed) ─────────────────
// A pattern flips to promotionCandidate=true once BOTH thresholds cross.
export const PROMOTION_USE_COUNT = 3;
export const PROMOTION_CONFIDENCE = 0.7;

// ── Pattern audit (patternAudit) ────────────────────────────────────────────
// Output token budget for the per-generate audit Haiku call. Generous so the
// model can return one result per active pattern with short evidence quote.
export const AUDIT_MAX_TOKENS = 1500;

// ── Approval ledger (approvalLedger / learningExtractor) ────────────────────
// Number of post-approval publishes to observe before finalizing the
// editRatioAfter measurement. Low (5) so signal arrives fast at 2-user scale.
export const APPROVAL_LEDGER_WINDOW = 5;
// Same window size for the BEFORE baseline (most recent N publishes prior
// to approval).
export const APPROVAL_BASELINE_WINDOW = 5;
// Delta threshold above which an approval is flagged as "may have hurt"
// (editRatioAfter > editRatioBefore by this much).
export const APPROVAL_HURTFUL_DELTA = 0.05;

// ── Models ──────────────────────────────────────────────────────────────────
export const HAIKU_MODEL = 'claude-haiku-4-5';
// Output cap for pattern extraction (1-2 sentence rule, generous buffer).
export const HAIKU_EXTRACT_MAX_TOKENS = 400;
