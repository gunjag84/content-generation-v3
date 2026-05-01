# Phase 1 Foundation - Execution Plan (Tim ↔ Claude)

Strikte Trennung: was nur Tim manuell tun kann (Browser-OAuth, Payment,
Probes mit echten Google-Accounts) vs was Claude ab dann via Bash/CLI
automatisiert durchziehen kann.

**Stack-Status:** Phase 1+2 Code committed; Deploy + Smoke pending.

---

## Tooling Inventory

| Tool | Status | Wofür |
|------|--------|-------|
| Firebase CLI 15.15 | installed | rules/hosting/functions/emulator deploy |
| Node 22 + pnpm 10 | installed | install, typecheck, build |
| gh CLI 2.78 | installed | PR/CI verification |
| Docker | installed | (nicht benötigt - Cloud Build remote) |
| ssh + hetzner_n8n key | installed | (nicht für v3 nötig, nur Jäger) |
| **gcloud SDK** | **MISSING** | **Blocker für ~70% des Plans** |
| Chrome MCP | available | Firebase Console clicks (optional Assist) |
| gstack browse | available | headless E2E probes |

---

## Section A: Tim-only (one-time, irreducible)

Diese Schritte erfordern Browser-OAuth, Payment-Input oder echte Google-
Accounts. Sind nicht delegierbar.

### A-1. Blaze-Plan aktivieren (LÄUFT GERADE)

Firebase Console → Project `contentai-78bfb` → Upgrade to Blaze →
Karte hinterlegen. $40-Hard-Kill ist im Code armed (Cloud Function
`budgetKillswitch` flippt `system/killSwitch.enabled = false` bei
$40, bereits Phase-1-implementiert).

### A-2. gcloud SDK installieren

Empfohlen via Scoop (Tim nutzt eh Scoop für Node):

```powershell
scoop bucket add extras
scoop install gcloud
gcloud --version  # verify
```

Alternative: https://cloud.google.com/sdk/docs/install#windows (Google-Installer).

### A-3. drei OAuth-Logins (Browser)

```powershell
gcloud auth login                     # GCP user identity
gcloud auth application-default login # ADC für Firestore-Admin-SDK
firebase login                        # Firebase CLI
```

### A-4. Werte sammeln (in eine Notiz copy-pasten)

Claude braucht diese 4 Werte vor Section C:

| Variable | Quelle |
|----------|--------|
| `BILLING_ACCOUNT_ID` | `gcloud beta billing accounts list` |
| `BUDGET_EMAIL` | Tims Mail (empfängt $20-Alert) |
| `ALLOWLIST_EMAILS` | Tims + Jules echte Adressen |
| `GCLOUD_PRINCIPAL` | `gcloud auth list --filter=status:ACTIVE --format='value(account)'` |

---

## Section B: Claude-driven (nach A-1 bis A-4)

Sobald Section A green ist, fährt Claude den ganzen Build/Deploy in
einer Sitzung durch. Tim approved nur an Gate-Punkten.

### B-1. Dependencies + Code-Verify

```bash
pnpm install
cd server/functions && pnpm install && cd ../..
pnpm typecheck       # 0 errors expected
pnpm build:web       # clean Vite build expected
```

Output-Gate: alles green → weiter.

### B-2. Allowlist-Edit

Claude editiert `server/middleware/auth.ts`:
```ts
const ALLOWED_EMAILS = ['<tim>', '<jule>'];
```
Mit Werten aus A-4. Commit. Tim reviewed Diff vor B-3.

### B-3. GCP-Substrat provisionieren (`bootstrap.sh`)

```bash
export PROJECT_ID=contentai-78bfb
export REGION=europe-west1
export BILLING_ACCOUNT_ID=<from A-4>
export BUDGET_EMAIL=<from A-4>
bash scripts/bootstrap.sh
```

Idempotent. Verify-Probes (Claude runt + checkt):
- 2 Service-Accounts (`content-gen-sa`, `internal-invoker`)
- 2 Cloud-Tasks-Queues (`render-queue`, `publish-queue`)
- 1 KMS-Key (`api-keys` in `user-secrets` keyring)
- 1 Pub/Sub-Topic (`budget-alerts`)
- 1 Budget ($40 mit 0.5+1.0 thresholds)

`publish-tick`-Scheduler-Job kommt erst in B-5 (URL nach Cloud-Run-Deploy bekannt).

### B-4. Kill-Switch seeden

```bash
bash scripts/seed-killswitch.sh
```
Erwartet: `system/killSwitch seeded with enabled=true`.

### B-5. Cloud Run deploy + Scheduler wiring + Functions deploy

```bash
gcloud auth configure-docker europe-west1-docker.pkg.dev

# Deploy Cloud Run from source (Cloud Build baut den Container remote,
# Dockerfile nutzt npm ci - das ist build-time, kein lokaler pnpm-Konflikt)
gcloud run deploy content-gen \
  --source=. \
  --region=europe-west1 \
  --concurrency=1 --memory=2Gi --cpu=2 \
  --min-instances=1 --max-instances=10 \
  --allow-unauthenticated \
  --service-account=content-gen-sa@contentai-78bfb.iam.gserviceaccount.com \
  --set-env-vars=GCLOUD_PROJECT=contentai-78bfb,KMS_KEY_NAME=projects/contentai-78bfb/locations/europe-west1/keyRings/user-secrets/cryptoKeys/api-keys

# Capture URL (Claude parsed gcloud-Output direkt)
export CLOUD_RUN_SERVICE_URL=<parsed>
gcloud run services update content-gen --region=europe-west1 \
  --update-env-vars=CLOUD_RUN_SERVICE_URL=$CLOUD_RUN_SERVICE_URL

# Re-run bootstrap → wired publish-tick mit der jetzt bekannten URL
bash scripts/bootstrap.sh

# Deploy budget-killswitch Cloud Function
firebase deploy --only functions

# Token-creator binding (braucht GCLOUD_PRINCIPAL aus A-4)
gcloud iam service-accounts add-iam-policy-binding \
  internal-invoker@contentai-78bfb.iam.gserviceaccount.com \
  --member=user:<GCLOUD_PRINCIPAL> \
  --role=roles/iam.serviceAccountTokenCreator
```

Verify-Probes (Claude runt automatisch):
- `curl /healthz` → 200
- `curl /api/health` → 401
- `curl /internal/health` (no token) → 401
- `curl /internal/health` (with OIDC token) → 200
- `gcloud scheduler jobs list` → enthält `publish-tick`
- `gcloud functions list` → enthält `budgetKillswitch`
- Pub/Sub-Trip-Test: `gcloud pubsub topics publish budget-alerts --message='{"costAmount":40,"budgetAmount":40}'` → killSwitch.enabled wird false in <60s
- Restore: `bash scripts/seed-killswitch.sh`

### B-6. Frontend deploy + Rules

```bash
firebase apps:sdkconfig WEB           # Claude parsed + schreibt web/.env
firebase deploy --only firestore:rules,firestore:indexes,storage,hosting
curl -i https://contentai-78bfb.web.app/api/health   # 401 = rewrite ok
```

---

## Section C: Tim-only (final probes)

Diese 5 Probes brauchen echte Google-Accounts in Incognito-Tabs - nicht
delegierbar. gstack browse kann *zuschauen* (Console-Logs, Network) wenn
Tim parallel klickt, aber das Sign-in selbst muss Tim machen.

### C-1. Auth-Provider in Firebase Console aktivieren

Console → Auth → Sign-in method → Google + Email link enable.
(Alternativ: via gcloud Identity Toolkit API, aber Console ist 30s.)

### C-2. End-to-End Probes A-J

| Probe | Was | Expected |
|-------|-----|----------|
| A | Google-Sign-in incognito | OnboardingModal erscheint |
| B | Onboarding ausfüllen | Dashboard rendered, Firestore-Docs angelegt |
| C | Sidebar 5 Routen | alle Placeholders rendern |
| D | Magic-link sign-in | funktioniert für Allowlist-Mail |
| E | Non-allowlist Google-Account | POST /api/settings/api-keys → 403 (NICHT 412) |
| F | Refresh | Session persistiert |
| G | /internal/health ohne OIDC | 401 (in B-5 schon gecheckt) |
| H | Kill-Switch via Pub/Sub trip + restore | (in B-5 schon gecheckt) |
| I | Firestore Rules Playground - User B liest User A | Denied |
| J | Storage Rules Playground - User B liest User A | Denied |

Probes I+J kann Claude **nicht** delegieren (Console-UI), aber 30s Klick.

---

## Section D: Phase 2 Smoke (nach Section C)

Smoke pending vor Phase-2-Closure. Tim-only (echte User-Interaktion):

1. Sign-in → /settings/photos Upload → /create Generate → /editor
2. Edits persistieren mit byte-identischem `aiSnapshot`
3. Reload → alles bleibt
4. Cancel-before-complete → kein Post-Doc

---

## Out-of-Scope-Flags (während Build erfasst)

- **pnpm vs npm-Drift**: Dockerfile nutzt `npm ci` (Cloud Build remote = ok),
  lokal pnpm. Kein Konflikt für Deploy. Falls später `pnpm import`
  gewünscht für lockfile-Konsistenz, separates Cleanup.
- **Prompt-Caching `cache_control: ephemeral`**: deferred bis SDK 0.32.x stable
  Type exposed (Phase 02 Decision).
- **aiSnapshot-Mutation Rules-Deny-Test**: Rule ist live, Test fehlt - Backlog.
- **Vitest-Harness web**: Backlog.
