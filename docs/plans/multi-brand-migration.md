# Plan: Multi-Brand Architektur Migration

**Status**: APPROVED_WITH_FIXES (CEO + Eng review done, ready to implement)
**Mode**: HOLD SCOPE
**Approach**: A - Hybrid (Meta-Token zu Brand, Anthropic bleibt User, plus Walkthrough-Wizard)
**Reviews**: plan-ceo-review (HOLD), plan-eng-review (APPROVE_WITH_FIXES)
**Last updated**: 2026-05-06

---

## Goal

Brand zu vollwertiger "Workspace"-Instanz machen. Meta-Token per Brand (statt User), shared `<BrandSetupWizard>` fuer Add-Brand und initial Onboarding, plus igStatsSync-P0-Live-Bug fixen.

## Context

Heute (Phase 4b live, rev 00021-9r9):
- Meta-Token: USER-scoped (`users/{uid}.apiKeys.metaGraph`), KMS-encrypted
- igUserId: Brand-scoped (`users/{uid}/brands/{bid}.instagramUserId`)
- Anthropic-Key: USER-scoped (KMS)
- Posts/Photos/Identity/Patterns/Methods: Brand-scoped (correct)
- OnboardingModal: nur Anthropic-Key + Brand-Name. Keine IG-Setup-Schritte.
- Add-Brand-Button (heute Mittag): nur Name. Mini-Modal in `BrandSwitcher.tsx`. Wird durch Wizard ersetzt.

User-Erwartung: "neue Brand = neue Instanz". Heute zu 70% wahr; Meta-Token ist die Bruchstelle.

## P0 BUG (independent, ship first)

**`server/functions/igStatsSync.ts:23-36` liest `users/{uid}/secrets/apiKeys.meta_ciphertext` - dieser Pfad wird NIRGENDWO geschrieben.** Der echte write-path ist `users/{uid}.apiKeys.metaGraph`. Heisst: igStats ist seit Phase-4b-Deploy live broken. Jeder `igStats`-Eintrag ist null/missing. Phase-4b-Dashboard-Widgets (TopPerformer, MethodAggregate, etc) lesen alle leere Werte.

**Fix isoliert ship-bar**: 10 Zeilen, ueberlappt aber mit Multi-Brand-Migration weil danach eh brand-scoped gelesen wird. Empfohlen: in **Hour 1 / Deploy Step 1** dieses Plans, NICHT als separate Mini-PR (waere doppelte Arbeit weil sich der Read-Pfad sowieso aendert).

## Approach (locked)

**Hybrid**: Meta-Token wandert von `users/{uid}.apiKeys.metaGraph` zu `users/{uid}/brands/{bid}.metaGraphCiphertext` (KMS, same key). Anthropic-Key bleibt user-scoped (99% Realitaet). Shared `<BrandSetupWizard>` fuer Add-Brand und initial Onboarding.

3 Approaches evaluiert:
- A (gewaehlt): Hybrid Meta-per-Brand, Anthropic-per-User
- B verworfen: nur Walkthrough ohne Token-Refactor - Architektur-Schuld bleibt
- C verworfen: Voll-Refactor (alles per Brand inkl. Anthropic) - Over-Engineering fuer 99% Use-Case

## Schema

```
shared/schemas/brand.ts:
  + metaGraphCiphertext: z.string().nullable().default(null)  // KMS-encrypted
  + metaGraphSetAt: z.unknown().nullable().default(null)       // Timestamp

shared/schemas/user.ts:
  apiKeys.metaGraph KEEP (during 1-week fallback window, removed in cleanup deploy)
  apiKeys.anthropic UNCHANGED (user-scoped per design)
```

## Architecture

### BrandSetupWizard state machine

```
NEW BRAND (via BrandSwitcher "+"):
  step='name'
    submit -> setDoc brands/{bid} {name, createdAt}, set user.activeBrandId
            -> advance step='ig'
  step='ig'
    submit -> POST /api/settings/brand-ig {brandId, token, igUserId}
            -> server: validate via GET /{igUserId}?fields=id,username&access_token={token}
            -> kmsEncrypt(token), setDoc brand.metaGraphCiphertext + setAt
            -> advance step='identity'
    skip   -> advance step='done' (partial brand, no token)
  step='identity'  (skippable)
    submit -> setDoc brand.identity.{voice, persona}
            -> advance step='done'
  step='done'
    redirect /create

ONBOARDING (initial, via AuthGuard -> OnboardingModal):
  AnthropicKeyStep (only if !user.apiKeys.anthropic)
    submit -> POST /api/settings/api-keys {anthropic}
            -> advance to BrandSetupWizard inline
  BrandSetupWizard (skipAnthropic=true)
    -> same state machine above

ABANDON paths:
  step='name' abandon  -> kein write, sauberer state
  step='ig' abandon    -> brand-doc {name, createdAt, activeBrandId set}, kein token
                       -> AuthGuard-Gate passed (anthropic + activeBrandId both set)
                       -> Settings/Instagram banner: "IG-Token fehlt"
                       -> kein forced re-entry
  step='identity' abandon -> brand+token vorhanden, identity leer (legitim, skippable)
```

### Migration job (local Node script, NICHT Cloud Run Job)

```
node --loader ts-node/esm migration/migrateMetaToken.ts [--dry-run]

Voraussetzung: GOOGLE_APPLICATION_CREDENTIALS=path/to/sa-key.json

list /users docs:
  for each user:
    ciphertext = user.apiKeys.metaGraph
    if !ciphertext -> log {uid, status:'no_token'} -> skip

    brandId = user.activeBrandId
    if !brandId -> log {uid, status:'no_brand'} -> skip

    existing = brands/{brandId}.metaGraphCiphertext
    if existing -> log {uid, brandId, status:'already_migrated'} -> skip (idempotent)

    if DRY_RUN:
      log {uid, brandId, status:'dry_run_would_migrate'}
      continue

    // CIPHERTEXT COPY - same KMS key, no decrypt+re-encrypt needed
    setDoc brands/{brandId}, {metaGraphCiphertext: ciphertext, metaGraphSetAt: now}
    log {uid, brandId, status:'migrated'}

final: {total, migrated, skipped, failed}
```

**Wichtig (Eng-review fix)**: KEIN decrypt, KEIN re-encrypt. Same KMS key = same ciphertext valid. Eliminiert KMS-failure-Risk komplett.

### getMetaToken(uid, brandId) data flow

```
getMetaToken(uid, brandId)  // brandId REQUIRED
  if FIRESTORE_EMULATOR_HOST && META_ACCESS_TOKEN
    return env (dev bypass)

  read brands/{brandId}.metaGraphCiphertext  // PRIMARY
    found  -> kmsDecrypt -> return token
    null   -> FALLBACK (1-week window):
              read users/{uid}.apiKeys.metaGraph
                found  -> kmsDecrypt -> return token + log "legacy fallback used"
                null   -> throw 'No Meta token configured for brand'

[post-cleanup deploy, 1 week later]
  remove fallback branch
  only brand-scoped read remains
```

## File Plan

### NEW

| File | Purpose |
|---|---|
| `server/lib/metaValidate.ts` | Pure fns: `validateMetaToken(token)`, `validateIgUserId(token, igUserId)` - extracted from settings.ts inline fetch |
| `web/src/components/BrandSetupWizard.tsx` | **Single file**, NICHT 4 sub-files (over-engineering fuer 2-user app). Lokale step-functions: NameStep, InstagramStep, IdentityStep, DoneStep als inline JSX |
| `migration/migrateMetaToken.ts` | Local Node script, ciphertext-copy, dry-run flag |

### EDIT

| File | Change |
|---|---|
| `shared/schemas/brand.ts` | + `metaGraphCiphertext` + `metaGraphSetAt` |
| `shared/types/brand.ts` | (re-export barrel, no edit needed) |
| `server/lib/getMetaToken.ts` | Signature: `getMetaToken(uid, brandId)` REQUIRED. Brand-first + user-fallback during transition |
| `server/lib/publishOnePost.ts:30` | `getMetaToken(uid)` -> `getMetaToken(uid, brandId)` (brandId already in scope line 18) |
| `server/routes/settings.ts:100` | **MISSED IN ORIGINAL PLAN** - `validate-ig-user-id` endpoint also calls `getMetaToken(uid)`, must add `brandId` from request |
| `server/routes/settings.ts` | Add `POST /api/settings/brand-ig` endpoint (validate -> kmsEncrypt -> brand-doc-write) |
| `server/functions/igStatsSync.ts:21-38` | **REWRITE getMetaTokenForUid** - parse brandId from post path (`parts[3]`), read `brands/{brandId}.metaGraphCiphertext`. P0 fix |
| `web/src/auth/OnboardingModal.tsx` | REFACTOR - extract AnthropicKeyStep, host `<BrandSetupWizard skipAnthropic>` inline |
| `web/src/components/BrandSwitcher.tsx` | Replace inline mini-modal (lines 60-84 today's code) with `<BrandSetupWizard skipAnthropic onDone={() => setAdding(false)} />`. Remove `createBrand`, `newName`, `saving` state |
| `web/src/lib/instagramSettings.ts` | + `saveBrandIgToken(brandId, token, igUserId)` POST helper. Existing `saveMetaToken` keep during transition |
| `web/src/routes/settings/InstagramPage.tsx` | Read `brand.metaGraphCiphertext` (Firestore brand-doc, already snapshot'd line 51). Banner: "IG-Token fuer [brandName] fehlt" wenn null. **Section A save-path post-cleanup**: change from `POST /api/settings/api-keys {metaGraph}` to `POST /api/settings/brand-ig`. Either ship in same sprint OR document as cleanup-deploy-task |

### NO CHANGE

- `firestore.rules` - `users/{uid}/brands/{bid}` already owner-write. metaGraphCiphertext is a brand-doc field, covered.
- `shared/types/user.ts` - keep `apiKeys.metaGraph?` until cleanup deploy

### Tests (Vitest, admin-SDK gegen emulator)

| File | Coverage |
|---|---|
| `tests/unit/metaValidate.test.ts` | happy + code 190 + code 100 + network timeout |
| `tests/unit/getMetaToken.test.ts` | brand-first, user-fallback, null-on-both-missing, emulator bypass |
| `tests/unit/migrateMetaToken.test.ts` | idempotent (already-migrated skip), no-token skip, no-brand skip, ciphertext-copy correctness |
| `tests/integration/brandIgEndpoint.test.ts` | POST /api/settings/brand-ig: 200 happy + 400 invalid token + 400 invalid igUserId |

BrandSetupWizard: keine Unit-Tests. Smoke-Test in prod reicht fuer 2-User-App.

## Critical Gaps (3 from CEO + 6 from Eng review = 6 actionable)

CEO-Review identifiziert (alle in Eng-Plan integriert):
1. ~~Migration KMS-decrypt-failure handling~~ → **eliminiert** weil ciphertext-copy
2. Mid-walkthrough abandonment → AuthGuard-Gate unchanged + Settings-Banner
3. Token-validation-on-entry → server-side `validateIgUserId` pre-write

Eng-Review BLOCKERS:
1. **Missing call site `settings.ts:100`** - validate-ig-user-id needs brandId param
2. **Migration: ciphertext-copy, KEIN decrypt+re-encrypt** - same KMS key
3. **igStatsSync-Fix als Hour 1, P0** - nicht side-quest, live broken seit Phase 4b
4. **InstagramPage Section A post-cleanup**: dead-write-Risiko explizit handhaben
5. **BrandSetupWizard 1 file**, nicht 4 sub-component files
6. **Local Node script** statt Cloud Run Job

## Edge Cases

| Case | Handling |
|---|---|
| Mid-walkthrough abandon (step='ig') | Brand-doc partial. AuthGuard passes. Settings-Banner zeigt missing. Kein forced re-entry. |
| 2nd Brand ohne Meta | Publish-Button disabled mit Tooltip. Generate funktioniert (Anthropic ist user-scoped). |
| User wechselt IG-Account auf existing Brand | Settings/Instagram -> Token+igUserId neu, ueberschreiben. Alte Posts mit alten igMediaIds bleiben (potentiell stale, nicht breaking). |
| Concurrent: User publisht waehrend Migration | Atomic Firestore write. Pre-write: read user-fallback. Post-write: read brand. Beide valide. |
| Concurrent: User klickt 2x auf "Anlegen" | Wizard disabled submit-button on first click (`saving=true`). Doppelten brand-doc verhindert. |
| Brand-Switch waehrend IG-Token-Write | POST nutzt brandId from click-time, nicht reactive. Token landet auf original brand. activeBrandId zeigt auf neuer Brand. Kein corruption. |
| Migration trigger waehrend Cloud Run am alten Pfad | Atomic per-doc-write. Vor Migration: fallback. Nach: brand. Kein mid-write inconsistency. |
| Multiple incomplete brands | Bei 2 Usern non-issue. Switcher listet alle, kein cleanup needed. |

## Failure Modes Registry

| Codepath | Failure | Rescue | User sees |
|---|---|---|---|
| `validateMetaToken` | Token expired/invalid (190) | Y | Inline error "Token ungueltig" |
| `validateIgUserId` | igUserId wrong (100/803) | Y | Inline error "igUserId stimmt nicht mit Token" |
| `validateMetaToken` | Network timeout | Y, retry 1x | Inline "Verbindung Meta fehlgeschlagen" |
| `kmsEncrypt` brand-token | KMS unavailable | Y, retry 2x | 503 "kurz nochmal" |
| Migration: write fail | Firestore unavailable | continue, log status:'write_failed' | per-user log entry, retry-able |
| Walkthrough abandon | n/a | Y, partial brand valid | Settings-Banner |
| `getMetaToken(brandId)` post-migration | brand has no token | Y, return null, caller skip | Publish disabled, History sync-skip |
| `igStatsSync` post-migration | brand owner no token | Y, skip silent + log | Status indicator stays |

## Deploy

```
1. Schema deploy (additive)
   shared/schemas/brand.ts: + metaGraphCiphertext, metaGraphSetAt
   pnpm tsc --noEmit confirms compile

2. Cloud Run deploy mit:
   - server/lib/getMetaToken.ts (brand-first + user-fallback)
   - server/lib/publishOnePost.ts (brandId arg)
   - server/routes/settings.ts (POST /api/settings/brand-ig + validate-ig-user-id fix line 100)
   - server/lib/metaValidate.ts (new)
   gcloud run deploy content-gen --source=. --region=europe-west1 --quiet

3. Cloud Functions deploy mit:
   - server/functions/igStatsSync.ts (REWRITTEN brand-scoped read - P0 fix)
   firebase deploy --only functions

4. Migration script (LOCAL):
   GOOGLE_APPLICATION_CREDENTIALS=... node --loader ts-node/esm migration/migrateMetaToken.ts --dry-run
   verify log: 2 users would migrate
   GOOGLE_APPLICATION_CREDENTIALS=... node --loader ts-node/esm migration/migrateMetaToken.ts
   2 brand-docs updated

5. Frontend deploy:
   pnpm build:web && firebase deploy --only hosting
   - BrandSetupWizard live
   - OnboardingModal refactored
   - InstagramPage banner
   - BrandSwitcher Add-Brand wizard

6. Smoke (Tim + Jule):
   - Sign in
   - publish 1 post
   - Cloud Logging confirms brand-scoped getMetaToken read
   - igStatsSync next 6h tick verify igStats appearing on posts (FIRST TIME EVER)

7. 1-week observation (CEO-review pre Eng-feedback war 2 Wochen, Eng-feedback: 1 Woche reicht)

8. Cleanup deploy:
   - Remove fallback branch from getMetaToken
   - Remove apiKeys.metaGraph from SetApiKeysBody schema
   - Remove from POST /api/settings/api-keys body handling
   - Remove from shared/types/user.ts
   - InstagramPage Section A: switch save path to POST /api/settings/brand-ig (or remove section)
   - Optional 2-liner admin script: clear users/{uid}.apiKeys.metaGraph
```

### Rollback

- Step 1-3: revert deploy. Schema additive, kein migration loss.
- Step 4 migration: idempotent. Re-run nicht harmful. Rollback durch admin-SDK script: `setDoc brands/{bid} {metaGraphCiphertext: null}` (data-loss-frei weil user-doc-token noch da bis Step 8).
- Step 5 frontend: `firebase hosting:rollback`. Brand-tokens in Firestore harmless.
- Step 8 cleanup: irreversibel ohne Backup. Vor Cleanup: `gcloud firestore export gs://contentai-78bfb-backups/pre-cleanup-$(date +%F)` der user-docs.

Risk: LOW vor Step 8. MEDIUM bei Step 8 (loescht legacy state, mit Backup OK).

## Implementation hours (CC + gstack compressed)

| Hour | Work |
|---|---|
| H1 | **igStatsSync P0 fix + foundations**: schema additive, metaValidate.ts new, migrateMetaToken.ts new, igStatsSync rewrite (P0). pnpm tsc --noEmit |
| H2 | **Server refactor parallel** (2 sub-agents): A) getMetaToken refactor + publishOnePost line. B) settings.ts new endpoint + validate-ig-user-id fix |
| H3 | **Frontend refactor parallel** (2 sub-agents): C) BrandSetupWizard new + BrandSwitcher replace. D) OnboardingModal refactor + instagramSettings.ts + InstagramPage banner |
| H4 | **Integration + tests**: wire imports, pnpm tsc --noEmit, 4 test files written, pnpm test green |
| H5 | **Deploy steps 1-5**: Cloud Run, Functions, migration dry-run + real, Hosting |
| H6 | **Smoke + verify**: both users publish, Cloud Logging brand-token-reads, igStatsSync next tick - first real igStats EVER |

Single dev: ~2-3 Tage.

## TODOs (deferred, post-implementation)

- Brand-Status-Indicator im BrandSwitcher (gray=incomplete, green=ready) - 1 weiteres Field in onSnapshot listener, nice UX, nicht critical
- Brand-Delete + cascade (subcollections posts, photos, methods, situations, learnedPatterns)
- Brand-Templates (preconfigured Identity-Sets)
- Per-Brand-Anthropic-Override-Slot (additive optional `brand.anthropicCiphertext` falls Agency-Use-Case kommt)
- Re-validate-IG-Connection-Button in Settings/Instagram

## Out of scope

- Anthropic-Key per Brand (99% Realitaet ist 1 Key per User, defer bis echter Use-Case)
- IG-Account-Switch auf existing Brand (orphan posts, document als known limitation)
- Per-Brand-Audit-Trail
- Switch-Brand-without-data-loss (impliziert by-design weil alle Subcollections eh per-Brand sind)

## References

- Existing onboarding: `web/src/auth/OnboardingModal.tsx`
- Brand schema: `shared/schemas/brand.ts:55` (instagramUserId)
- igStatsSync (P0 bug): `server/functions/igStatsSync.ts:21-38`
- Token consumer: `server/lib/getMetaToken.ts:14-15`
- Publish flow: `server/lib/publishOnePost.ts:30`
- KMS helpers: `server/lib/kms.ts`
- Auth gate: `web/src/auth/AuthGuard.tsx:25`
- IG-Feed-Sync plan (orthogonal, may build before or after): `docs/plans/ig-feed-sync.md`
