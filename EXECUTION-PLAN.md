# Execution Plan - Content-Generation v3 Single-Session Build

**Source-of-truth-Plan:** `~/.claude/plans/modular-tumbling-sunrise.md` (Verdict ISSUES_CLOSED v6, 2026-04-26).
**Diese Datei:** ausführbarer Schedule für die einmalige End-to-End-Implementierung. Ersetzt die GSD-Phasen-Orchestrierung.

---

## 1. Architektur (gelockt)

| Layer | Wahl |
|---|---|
| Frontend | React 19 + Vite + Zustand + React Router 7 |
| Frontend-Hosting | Firebase Hosting |
| Auth | Firebase Auth (Google + Email-Link) |
| Datenbank | Cloud Firestore (eu-west1) |
| Storage | Firebase Storage (eu-west1) |
| Backend | Cloud Run `content-gen` (eu-west1, concurrency=1, mem=2Gi, cpu=2, **min-instances=1**, --allow-unauthenticated) |
| Async-Jobs | Cloud Tasks (`render-queue`, `publish-queue`) |
| Scheduler | Cloud Scheduler (`publish-tick` */5min) |
| Encryption | Cloud KMS (Keyring `user-secrets`, Key `api-keys`, 90d Rotation) |
| Budget-Tripwire | Pub/Sub `budget-alerts` → Cloud Function `budgetKillswitch` → Firestore `system/killSwitch.enabled=false` |
| Observability | Sentry Browser SDK + Cloud Logging + GCP Budget |

Begründung min-instances=1 statt 0: Stabilität + Cleanness als Guiding Principle (Tim 2026-05-01). Keine Cold-Starts, konsistente UX. Kosten ~$5-15/mo akzeptiert.

---

## 2. Discovered State

**Vorherige GSD-Session hat code-side fertig (40% laut STATE.md, ungeprüft am Live-System):**

- Repo-Foundation: `package.json`, `tsconfig.*`, `pnpm-workspace.yaml`, `Dockerfile`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `.env.example`, `.gitignore`, `.firebaserc`
- Provisioning: `scripts/bootstrap.sh`, `scripts/seed-killswitch.sh`, `scripts/seed-emulator.sh`
- Server: `server/index.ts`, Middleware `requireAuth` + `requireOidc` + `killSwitchGate`, `server/lib/{firebase,killSwitchCache,kms}.ts`, Routes `/health` + `/api/settings/api-keys`
- Cloud Function: `server/functions/budget-killswitch.ts`
- Web: Firebase-Init, AuthGuard, OnboardingModal, SignInScreen, Sidebar/Header/BrandSwitcher, 5 Route-Stubs (Dashboard/Create/Posts/Calendar/Settings)
- Brand Settings + Create-Flow + Zone-Editor laut `STATE.md` → wird in Schritt 2 verifiziert

**Nicht provisioniert:**
- GCP-Project, Blaze-Plan, alle Cloud-Resources
- `gcloud` CLI nicht lokal installiert
- Allowlist-Emails noch Platzhalter
- Keine Deploys gelaufen

**Verbleibend gegen Plan v6:** Render-Service, Posts-Lifecycle + Publish, Learning-Loop, Dashboard-Polish, Cutover.

---

## 3. Schritt-für-Schritt-Plan

### Schritt 0 - Pre-Flight Setup

| # | Wer | Aktion | Output |
|---|---|---|---|
| 0.1 | Claude | `scoop install gcloud` | gcloud CLI lokal verfügbar |
| 0.2 | Tim | GCP-Billing-Account neu anlegen unter `console.cloud.google.com/billing` (Kreditkarte) | `BILLING_ACCOUNT_ID` |
| 0.3 | Tim | `gcloud auth login` (Browser) | aktive User-Auth |
| 0.4 | Tim | `gcloud auth application-default login` (Browser) | ADC für Admin-SDK-Calls |
| 0.5 | Tim | `firebase login` (Browser) | aktive Firebase-CLI-Auth |
| 0.6 | Tim | Liefert ENV-Werte: `BUDGET_EMAIL`, `ALLOWED_EMAILS` (Tim + Jule echte Adressen), Anthropic-API-Key, IG-Business-Token, IG-Business-Account-ID | `.env`-Snapshot lokal |

**Gate:** alle CLIs authed, `gcloud beta billing accounts list` zeigt Account, ENV-Werte vorhanden.

### Schritt 1 - GCP Substrate Provisioning (Claude autonomous)

```bash
export PROJECT_ID=content-gen-prod
export REGION=europe-west1
export BILLING_ACCOUNT_ID=<from 0.2>
export BUDGET_EMAIL=<from 0.6>
bash scripts/bootstrap.sh
bash scripts/seed-killswitch.sh
```

**Verify-Checks (Claude runs):**
- `gcloud projects describe content-gen-prod` → existent
- `gcloud iam service-accounts list` → 2 SAs (`content-gen-sa`, `internal-invoker`)
- `gcloud tasks queues list --location=europe-west1` → 2 Queues
- `gcloud kms keys list --keyring=user-secrets --location=europe-west1` → 1 Key `api-keys`
- `gcloud pubsub topics list` → enthält `budget-alerts`
- `gcloud billing budgets list` → 1 Budget $40 mit 50%/100% Thresholds
- Firebase Console → Firestore-Doc `system/killSwitch { enabled: true }` existiert

**Gate:** alle 7 Checks grün.

### Schritt 2 - Phase 1+2 Code-Verify + Drift-Fix (Claude)

- `pnpm install` (root + `server/functions/`)
- `pnpm typecheck` → 0 Errors
- `pnpm build:web` → clean Vite Build
- `cd server/functions && pnpm exec tsc --noEmit` → 0 Errors
- ALLOWED_EMAILS-Platzhalter in `server/middleware/auth.ts` durch Tim+Jule ersetzen
- `pnpm emulators` (Firebase) hochfahren
- Smoke: Tim signt sich einmal ein, Onboarding-Modal kommt, Anthropic-Key wird gespeichert (KMS-Bypass im Emulator), Brand wird angelegt, Create-Stub lädt
- Bei Drift → inline-Fixes oder Sub-Agent-Dispatch falls strukturell

**Gate:** Build + Typecheck green, Emulator-Sign-In + Onboarding + Brand-Anlage funktioniert lokal.

### Schritt 3 - Render-Service (Plan v6 Phase 4)

**Sub-Agent-Strategie:** 2 parallele Sonnet-Agents.

| Agent | Scope | Output |
|---|---|---|
| 3-A | Port `v2/socialClubRender.ts` Kern (`parseSlidesMd`, `buildCarouselSlideHTML`, `buildZoneSlideHTML`); `/internal/render` Endpoint im bestehenden Express-Server; per-request Chromium-Launch (Plan A1); `users/{uid}/renderJobs/{jobId}` Subcoll-Update-Logik (status, completedSlides) | `server/routes/render.ts`, `server/services/render.ts`, `server/services/renderJobs.ts` |
| 3-B | Dockerfile-Update für Playwright + Chromium (~250MB Image); lokaler `docker build` zur Verifikation; `POST /api/render-jobs` Frontend-Endpoint mit Cloud-Tasks-Enqueue (OIDC-Token, audience=`CLOUD_RUN_SERVICE_URL`); `server/lib/cloudTasks.ts` | `Dockerfile`, `server/routes/renderJobs.ts`, `server/lib/cloudTasks.ts` |

**Sequentiell danach (Claude main):** Frontend `useRenderJob`-Hook (2s Polling), Editor-Preview-Integration in bestehende ZoneCanvas (Storage-URLs).

**Gate:** Lokaler Smoke - Mock-Render-Job erzeugt 7 PNGs in Firebase-Storage-Emulator, Frontend zeigt Progress.

### Schritt 4 - Posts + Publish (Plan v6 Phase 5)

**Sub-Agent-Strategie:** 3 parallele Sonnet-Agents.

| Agent | Scope | Output |
|---|---|---|
| 4-A | PostsPage 3-Tab-UI (`History` / `Scheduled` / `Drafts`); je gefilterte Liste aus `users/{uid}/brands/{brandId}/posts`; Schedule-Modal mit Datepicker; Status-Badges; Click → Editor-Reopen | `web/src/routes/Posts.tsx`, `web/src/components/posts/{PostsTabs,PostCard,ScheduleModal}.tsx` |
| 4-B | Publish-Service mit Meta Graph API (Container-Create + Publish via `https://graph.facebook.com/v18.0/{ig-user-id}/media`); Storage-Signed-URL-Generation; Firestore-Transaction-Lock per A6; `publishedSnapshot`-Capture (Trigger für Learning); Stale-Lock-Sweep ≥10min | `server/services/publish.ts`, `server/routes/publish.ts` (POST `/api/posts/{id}/publish-now`) |
| 4-C | `/internal/publish-worker` Endpoint (Cloud-Scheduler-getriggert via OIDC); Sweep-Query `status==scheduled AND scheduledAt<=now` (Collection-Group); Stale-Lock-Recovery; ruft 4-B-Service-Code | `server/routes/publishWorker.ts` |

**Sequentiell danach (Claude main):**
1. **Erster Cloud Run Deploy:** `gcloud run deploy content-gen --source=. --region=europe-west1 --concurrency=1 --memory=2Gi --cpu=2 --min-instances=1 --max-instances=10 --allow-unauthenticated --service-account=content-gen-sa@<proj>.iam.gserviceaccount.com --set-env-vars=...`
2. `CLOUD_RUN_SERVICE_URL` als Env-Var nachträglich setzen (`gcloud run services update`)
3. `bash scripts/bootstrap.sh` re-runnen → Scheduler-Wire + run.invoker-Binding
4. `firebase deploy --only functions` → `budgetKillswitch` deployen

**Gate:** `/healthz` 200, `/api/health` 401 ohne Token, `/internal/health` 200 mit OIDC-Token; Schedule-Now-Klick im Browser flippt Status, Worker-Sweep findet `scheduled`-Posts.

### Schritt 5 - Learning Loop (Plan v6 Phase 6)

**Sub-Agent-Strategie:** 1 Sonnet-Agent, sequentiell (hängt an Phase 4 Publish-Flow).

| Scope | Output |
|---|---|
| Port `v2/editDiff.ts` (`captureSnapshot`, `computeEditDiff`); Cloud Function `onPostPublished` (Firestore `onDocumentUpdated`-Trigger, Filter `before.status!='published' && after.status=='published'`); Pattern-Extract LLM-Call (Claude Haiku, ~1200 in / 300 out tokens, JSON-Schema-Validation); Idempotency-Key `{postId}_{diffHash}`; `learnedPatterns`-Subcoll-Write; Inject-Block-Logik in `server/routes/generate.ts` (Top-N-Recency×Confidence-Score, max 20 Patterns, `<learned_patterns>`-XML-Block im System-Prompt) | `server/functions/onPostPublished.ts`, `server/services/learning.ts`, Edit `server/routes/generate.ts` |

**Gate:** Test-Post mit Edit + Publish → Trigger feuert → `users/{uid}/brands/{brandId}/learnedPatterns/{id}`-Doc existiert mit `description` + `confidence`. Nächster Generate-Call enthält den Pattern-Block im Anthropic-Request (DevTools-Network).

### Schritt 6 - Dashboard Polish + Calendar Placeholder (Plan v6 Phase 7)

**Sub-Agent-Strategie:** 1 Sonnet-Agent.

Recent-Posts-Liste, Scheduled-Count-Widget, Brand-Switcher-Hervorhebung, Quick-Action "Create New Post"-Button. Calendar-Route bleibt mit "Coming Soon"-Card.

**Gate:** Dashboard zeigt sinnvolle Widgets statt Empty-State, Calendar-Card ist sauber.

### Schritt 7 - Production Cutover (Plan v6 Phase 8)

**Claude:**
- Final-Build + Deploy: `pnpm build:web` → `firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting` + `gcloud run deploy content-gen --source=.`
- Verify-Probes A-J aus `human_tasks.md` H-6 abarbeiten (skripte was scriptbar ist)
- Pub/Sub-Test: `gcloud pubsub topics publish budget-alerts --message='{"costAmount":40,"budgetAmount":40}'` → killSwitch flippt → 503 auf `/api/*` → re-seed via `seed-killswitch.sh`

**Tim:**
- Sign-in auf Production-URL (`https://content-gen-prod.web.app`)
- Anthropic-Key in Settings/API-Keys-Page eingeben
- Echte LEBEN.LIEBEN-Brand anlegen + Identity-Felder ausfüllen
- Mit Jule: Sign-In-Ceremony, ihren Brand anlegen
- Erster echter Test-Post: Generate → Edit → Schedule für `now+5min` → warten → IG-Post live auf @leben.lieben

**Gate:** Tim+Jule jeweils gesignt-in, je 1 Brand existiert, 1 Real-Post lief E2E durch.

### Schritt 8 - E2E-Test-Dokument (Claude)

Single Markdown-File `E2E-TESTS.md` im Repo-Root. Struktur:

```
1. Auth & Onboarding (5 Cases)
2. Multi-Brand Isolation (3 Cases)
3. Brand Settings (4 Cases)
4. Create Flow (Generate → Edit → Save) (6 Cases)
5. Render Pipeline (3 Cases)
6. Posts Lifecycle (Draft → Scheduled → Published) (5 Cases)
7. Publish to Instagram (3 Cases)
8. Learning Loop (Edit → Publish → Pattern → Inject) (3 Cases)
9. Kill Switch + Budget Alerts (2 Cases)
10. Rollback Drill (lokal-v2) (1 Case)
```

Pro Case: nummeriert, Schritte (1, 2, 3...), erwartetes Ergebnis, Stop-Kriterium, geschätzte Dauer.

**Deliverable:** Tim + Jule arbeiten das Doc 1× komplett ab → Handover Tier 2 abschließbar.

---

## 4. Tim-Touchpoints (Summary)

| # | Wann | Aktion | Dauer |
|---|---|---|---|
| T1 | Pre-Flight (Schritt 0) | Billing-Account anlegen, gcloud + firebase Browser-Logins, ENV liefern | ~10-15min |
| T2 | Schritt 2 Gate | Emulator-Smoke, ein Sign-In + Brand-Anlage | ~3min |
| T3 | Schritt 4 Gate | Cloud Run Deploy nebenan beobachten (kann iterieren) | ~5-15min |
| T4 | Schritt 7 Cutover | Production-Sign-In, Anthropic-Key, Sign-In-Ceremony mit Jule, erster Real-Post | ~15min |
| T5 | Schritt 8 (nach Build) | E2E-Doc abarbeiten mit Jule | ~60-90min |

**Total Tim-Aktiv-Zeit ~95-130min** verteilt über die Build-Session + finale 60-90min für E2E mit Jule.

---

## 5. Risks + Mitigations

| Risk | Mitigation |
|---|---|
| GSD-gebauter Code hat Drifts vs Plan v6 (geringe Wahrscheinlichkeit, hoch wenn aktiv) | Schritt 2 Re-Verify-Gate prüft Build + Smoke. Inline-Fixes erlaubt, strukturelle Drifts → Sub-Agent-Patch |
| Cloud Run Image >250MB wegen Chromium → langer Push | Sub-Agent 3-B verifiziert lokal, Layer-Cache nutzen, slim base-image |
| Bootstrap.sh erste Runs failen wegen Service-Agent-Eventual-Consistency | Idempotent → re-run. Hartes Failure → manuell debuggen mit `gcloud projects describe` |
| Meta Graph API Container-Create benötigt öffentlich erreichbare Image-URL | Firebase-Storage-Signed-URL (60min TTL) deckt es. Public-Read auf Render-Bucket-Path nicht nötig |
| Learning-Loop Pattern-Extract gibt invalides JSON | Zod-Schema-Validation, bei Failure: 1 Retry mit explizitem JSON-Only-Re-Prompt, dann mit `parse_failed`-Flag speichern |
| Anthropic-Spend in E2E-Tests hochlaufen | E2E-Doc nutzt 1-2 Test-Generates total, keine Volumen-Tests |
| min-instances=1 startet Billing ab erstem Deploy | Bewusst akzeptiert (~$5-15/mo) |
| Token-Theft in Worst-Case-Window vor Budget-Alert | 2FA auf Tim's Google-Account (out-of-scope für diesen Plan, hard-recommended) |

---

## 6. Stop-Kriterien für die Session

Wenn eines davon eintritt → Session pausieren, Rückfrage:

- Schritt 1 Bootstrap >2 Iterations failed → manuell durchgehen mit Tim
- Schritt 2 Build/Typecheck strukturelle Errors >5 → Drift-Audit, neuer Plan-Step
- Schritt 3-6 Sub-Agent-Output bricht 2× hintereinander → Pause, Inspect, eventuell anders teilen
- Cloud Run Deploy 2× failed → Image-Inspect, Memory-Limits checken, Tim einbeziehen
- Anthropic-Spend in Build >$5 → Pause, Cost-Source identifizieren

---

## 7. Architektur-Entscheidungen (Verweise)

Plan v6 enthält die vollständige ADR-Liste (Cloud Run min=1, Single-Service, Email-Allowlist, Cloud KMS direkt, learnedPatterns-Subcoll, Pub/Sub-Kill-Switch, etc.). Diese Datei dupliziert nichts.

**Quelle:** `~/.claude/plans/modular-tumbling-sunrise.md` Abschnitte "Architectural Decisions", "Gap Closures: Render Service", "Gap Closures: Auth & Security", "Gap Closures: Learning System", "Gap Closures: Schema & Operations".

---

**Status:** ready to execute. Nächster Schritt = Schritt 0.1 (`scoop install gcloud`).
