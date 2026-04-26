# Plan: Content-Generation v3.0 - Web-App Rewrite

## Context

Die aktuelle Applikation läuft als lokale Express + React Dev-Setup mit `node:sqlite` File-DB, lokalen Uploads und Single-User. Der Code ist Tier 3 (parked) im Portfolio, aber für LEBEN.LIEBEN-Support weiter nutzbar.

Ziel des Rewrites:
1. **Web-App**: Vollständig im Browser deploybar, kein lokales Setup mehr.
2. **Multi-User**: Verschiedene User können sich einloggen, jeder mit eigenen Brands.
3. **Cloud-Backend**: Firestore + Firebase Storage statt SQLite + lokales Filesystem.
4. **Radikale Reduktion**: Der bestehende 4-Step-Create-Flow (90% des aktuellen Codes für Editor, Layouts, Style Types, Library) entfällt komplett. Social Club wird zum Hauptpfad und ersetzt Create.
5. **Vereinfachtes Learning**: Eine einzige Logik (AI-First-Shot vs Final-Posted Diff → Patterns → unsichtbar in Prompt).

Es ist kein Refactor, sondern ein Rewrite mit Übernahme einzelner Pages und Komponenten. Frischer Start in Firestore, keine Datenmigration aus SQLite.

---

## Architectural Decisions

### Tech Stack

| Layer | Wahl | Begründung |
|---|---|---|
| Frontend Framework | React 19 + Vite (bleibt) | Kein Migrationsgrund, Komponenten wiederverwendbar |
| State | Zustand (bleibt) | Funktioniert, kein Replace-Bedarf |
| Routing | React Router v7 (bleibt) | OK |
| Hosting Frontend | **Firebase Hosting** | Free-Tier deckt 2 User easy, gleiches Projekt wie Firestore/Auth, kein Vercel-Pro nötig |
| Auth | **Firebase Auth** | Google Sign-In + Email-Link Magic-Link out-of-the-box |
| Datenbank | **Cloud Firestore** | NoSQL, Realtime, Security Rules pro User/Brand |
| Storage (Bilder, Renders) | **Firebase Storage** | Direkt integriert mit Auth, Security Rules, Signed URLs |
| Backend (alles) | **Cloud Run: `content-gen`** | Single service. Frontend-API + `/internal/render` + `/internal/publish-worker` + `/internal/learning-worker`. concurrency=1, mem=2Gi, cpu=2, min-instances=1, --allow-unauthenticated. App-code splittet Auth: `/api/*` → Firebase ID-token + email-allowlist, `/internal/*` → OIDC verify. |
| Encryption für API-Keys | Cloud KMS direkt (kein envelope) | Statt selbstgebautem AES-Layer |

**Begründung Single Cloud Run Service (v6):**
- 2 Users × ~5 Generates/Tag = concurrent-overlap-Wahrscheinlichkeit ≈ 0. Wenn doch (Jule generiert während Tim's Render läuft), Worst-Case ~30s Wartezeit. Honest behavior, kein Bug.
- `concurrency=1` deckt die Chromium-OOM-Constraint (per-request launch, kein Pool).
- `min-instances=1` absorbiert die ~10s Cold-Start des 250MB-Chromium-Images.
- IAM-Cleanliness via App-Code: `/internal/*` middleware verifiziert OIDC-Audience+Invoker-SA, `--allow-unauthenticated` Frontend-Pfad bleibt davon unberührt.
- Known-Limit: Render-OOM kann generate-in-flight im selben Container killen. Bei 2-User-Scale dokumentiert akzeptiert.

**Begründung Cloud Run statt Vercel (übergreifend):**
- Vercel-Hobby: 10s Function-Timeout + commercial-use Verbot in ToS.
- Vercel-Pro: $20/mo + 60s Timeout.
- Cloud Run: 5min Timeout default (60min konfigurierbar), kein Bundle-Limit, pay-per-use im Free-Tier (2M requests/mo) für 2 User effektiv $0.
- Frontend liegt auf Firebase Hosting (Free-Tier), gleiches Projekt - direkte Auth-Integration ohne CORS-Komplikationen.

### Firestore-Datenmodell

```
/users/{uid}
  - email, displayName, createdAt
  - apiKeys: { anthropic: encrypted, metaGraph: encrypted }   ← per User, nicht per Brand
  - activeBrandId

/users/{uid}/brands/{brandId}
  - name, createdAt
  - identity: { voice, persona, product_uvp, point_of_view, competitive_landscape }
  - design: { colors, logo_url, handle, ... }
  - focusAreas: [{ id, name, description }]
  - learnedPatterns: [{ id, source, description, confidence, createdAt }]   ← unsichtbar, vom Learning gefüllt

/users/{uid}/brands/{brandId}/situations/{situationId}
  - text, imageUrls[], createdAt, usageCount

/users/{uid}/brands/{brandId}/photoPool/{photoId}
  - storageUrl, label, addedAt

/users/{uid}/brands/{brandId}/posts/{postId}
  - status: 'draft' | 'scheduled' | 'published'
  - mode: 'create-demand' | 'convert-demand'
  - method: 'story' | 'liste' | 'vorher-nachher' | 'zitat'
  - focusAreaId, situationText, slideCount
  - slides: [{ ...zone-data, photo_keys }]
  - caption
  - aiSnapshot: { slides, caption }                       ← First-Shot, nie überschrieben
  - publishedSnapshot: { slides, caption } | null         ← Final-Posted (gesetzt beim Publish)
  - scheduledAt: timestamp | null
  - publishedAt: timestamp | null
  - igMediaId, igStats: { reach, likes, ... }
  - renderUrls: [storage URLs zu PNGs in /renders/]
```

Storage-Layout:
```
/photos/{uid}/{brandId}/{photoId}.jpg
/renders/{uid}/{brandId}/{postId}/slide-{n}.png
```

Security Rules: User darf nur `/users/{uid}/**` lesen/schreiben.

### Auth-Flow

- Firebase Auth mit Google Sign-In + Email-Link.
- Sign-up offen für alle (User trägt eigene Anthropic-API-Key-Cost).
- Onboarding: Nach erstem Login Modal mit zwei Pflichtfeldern: **Brand-Name** + **Anthropic-API-Key**. Alles andere später.
- Public-SaaS-Modell, aber User trägt API-Cost selbst (kein Anthropic-Proxy).

---

## Section-by-Section Spec

### 1. Dashboard

- Bleibt als Route, **wird am Ende sinnvoll ergänzt** (parken bis Rest fertig ist).
- Minimaler Zwischenstand: Recent Posts + "Create New Post"-Button.

### 2. Create (vorher Social Club)

**Routen-Umbenennung:** `/social-club` → `/create`. `SocialClubPage.tsx` → `CreatePage.tsx`. Komponentenordner `social-club/` → `create/`.

**Reduktion gegenüber heute:**

- **Pillar entfällt**, ersetzt durch **2 Modi**:
  - `create-demand` - produktloser Inhalt
  - `convert-demand` - Produktbrücke + CTA am Ende
  - P3 Loyalty fällt komplett raus (Code in `socialClub.ts:253`, `fileContext.ts:230-279`, ANGLE_TARGETS['3'], pillar-File p3-loyalty-nurture.md, Topic-Filter `bestPillar === '3'`).
- **Fokus** wird gespeist aus `brand.focusAreas` (Brand Settings). Hardcoded `TOPIC_FILES` (C1-C9) und Topic-File-Loading entfällt. User wählt 1 Focus Area aus Dropdown im Generate-Form.
- **Method bleibt**: Story, Liste, Vorher-Nachher, Zitat. Hardcoded in Code (METHOD_KEY) - bleibt so.
- **Anzahl Slides bleibt**: User-Eingabe 1-10, Mapping zu nächstem Template-Count (5/7/9/10) bleibt.
- **Foto-Pool bleibt**: Per Generation hochgeladene Fotos + persistenter Brand-Photo-Pool aus Firebase Storage.
- **Situation bleibt**: Freitext-Eingabe, optional aus Situations-Library wählbar.

**Pillar-Files-Refactor:**
- `server/prompts/social-club/pillars/p1-create-demand.md` → `prompts/modes/create-demand.md`
- `server/prompts/social-club/pillars/p2-convert-demand.md` → `prompts/modes/convert-demand.md`
- p3-Loyalty-File und alle P3-Branches im Code raus.
- `pillar` Variable im Code wird zu `mode` ('create-demand' | 'convert-demand').

**Generation-Pipeline (Adaption von `socialClub.ts:139-194`):**
1. Lade `mode.md` (statt Pillar-File)
2. Lade `methods/{method}-{closestTemplateCount(slideCount)}.md`
3. Lade `base.md` + `output-format.md` + `product.md` (mit `stripProductForCreateDemand()` analog zu heutigem `stripProductForP1()`)
4. Injiziere Brand-Settings (identity.voice, persona, product_uvp, point_of_view, competitive_landscape) + Focus Area Description
5. Injiziere User-Input: situation, photoLabels
6. Injiziere `learnedPatterns` aus Brand (unsichtbar, kein UI-Touch)
7. Stream Claude → parse `parseSlidesMd()` → render via Cloud Run

**Editor:** Bestehender Zone-Editor aus `client/src/components/social-club/` (ZoneCanvas, SlidePanel, ZonePanel) bleibt, leichte Re-Styling. Wird an Firestore statt REST-API angebunden (Firestore Realtime auch nicht nötig - manuelle Saves reichen).

**Auto-Save als Draft:** Sobald `generate` Response zurückkommt, wird ein Firestore-Doc unter `users/{uid}/brands/{brandId}/posts/{newId}` mit `status: 'draft'` und `aiSnapshot: { slides, caption }` angelegt. Editor-Edits updaten `slides`/`caption`, `aiSnapshot` bleibt unverändert.

### 3. Posts

3 Tabs in `/posts`:

- **History** (`status: 'published'`): Read-only-Liste, sortiert nach `publishedAt desc`. Verlinkt zu IG-Original wenn `igMediaId` vorhanden.
- **Scheduled** (`status: 'scheduled'`): Liste mit `scheduledAt`. Bei erfolgreichem Publish-Trigger automatischer Status-Wechsel zu `'published'` und Übergang nach History.
- **Drafts** (`status: 'draft'`): Liste, klickbar → öffnet Editor (`/create/{postId}`).

Status-Übergänge (einseitig):
- `draft → scheduled` (User klickt Schedule, gibt Datum ein, `scheduledAt` gesetzt)
- `draft → published` (User klickt Publish Now)
- `scheduled → published` (Cloud Scheduler triggert publishService bei `scheduledAt`)

**Publish-Trigger in Cloud:** Cloud Function (Cloud Run oder Firebase Function) läuft per Cloud Scheduler alle 5min, sucht `posts where status='scheduled' AND scheduledAt <= now`, ruft Meta-Graph-API, setzt `publishedAt`, `publishedSnapshot: { slides, caption }`, `status='published'`. Bei Erfolg triggert Learning-Diff-Computation (siehe Learning-Section).

### 4. Instagram

Bleibt unverändert in Funktion: Sync von IG-Posts und Performance-Stats.

Anpassungen nur Datenlayer:
- `instagramSync.ts` schreibt in Firestore statt SQLite.
- IG-Tokens in `users/{uid}.apiKeys.metaGraph`.

### 5. Calendar

Bleibt als Route mit Placeholder-Page (heutiger Stand). Kein Bau in diesem Plan.

### 6. Learning

**Eine einzige Logik:**

1. **Snapshot beim Generate**: `aiSnapshot = { slides, caption }` bei Post-Creation gesetzt.
2. **Snapshot beim Publish**: `publishedSnapshot = { slides, caption }` bei `status → 'published'` gesetzt (durch Publish-Cloud-Function).
3. **Diff-Extraction (Trigger: nach Publish)**:
   - Cloud Function vergleicht `aiSnapshot` vs `publishedSnapshot` per Zone (Hook/Body/CTA) + Caption.
   - Nur Text-Inhalt, kein Layout/Typo/Foto.
   - Levenshtein-basiert (`computeEditDiff()` aus `editDiff.ts:37-94` wiederverwendet).
4. **Pattern-Extraction (LLM)**:
   - Wenn Edit-Diff signifikant (ratio > threshold, z.B. 0.15):
   - Sende Original + Edited + Brand-Context an Claude mit System-Prompt: "Extrahiere strukturelles Muster aus dieser Bearbeitung. Gib 1-2 Sätze als generelle Regel."
   - Speichere als Eintrag in `brand.learnedPatterns: [{ id, source: postId, description: 'Hooks bevorzugen kurze Frage statt Aussage', confidence: 0.7, createdAt }]`.
5. **Pattern-Injection**: Beim nächsten `Generate` lädt der Prompt `brand.learnedPatterns` (max N=20, gewichtet nach Recency × Confidence wie `voiceDna.ts:95-146`) und injiziert sie unsichtbar als `<learned_patterns>` Block.
6. **Kein UI**: Vollautomatisch. User sieht nichts, merkt nur dass First-Shot über Zeit besser wird.

**LearningDashboardPage entfällt komplett** - statt komplexem Dashboard nur eine einzige Read-Only-Listen-Page (oder gar nichts), die vorhandene Patterns als Debug-View zeigt. Default: keine Page in Nav. Optional: `/learning` zeigt aktuelle `learnedPatterns`-Liste der aktiven Brand für Tim's Debug-Zwecke.

**Migration heutiges Learning:**
- Wiederverwenden: `editDiff.ts` (`captureSnapshot`, `computeEditDiff`)
- Streichen: `learning_events` table (komplexes Event-Sourcing), `voiceDna.runSummarizer` (zu komplex), `LearningDashboardPage`
- Neu: Cloud Function `onPublish` triggert Diff + Pattern-Extraction
- Neu: `brand.learnedPatterns` Sub-Collection oder Array-Field

### 7. Brand Settings

**BLEIBT (1:1 aus heutigem Settings.identity):**
- Identity (Voice)
- Target Persona
- Product + UVP
- Point of View
- Competitive Landscape
- Design (Colors, Logo, Handle)

**RAUS:**
- Hooks Guidance (Field aus Identity-Schema entfernen)
- Content Strategy komplett (`StrategyPage.tsx`, settings.strategy-Schema)
- Style Types komplett (`StyleTypesPage.tsx`, settings.styleTypes)
- Layout Templates komplett (`LayoutsPage.tsx`, settings.layoutTemplates)
- Library bis auf Situations (`LibraryPage.tsx` reduziert, hooks/ctas/science Tabellen + Routes raus, situations bleiben + Images bleiben)

**NEU:**
- **Focus Areas Page**: List von `{ name, description }` mit Add/Edit/Delete. Wird in Create-Generate-Form als Dropdown genutzt.

### 8. System

**BLEIBT:**
- API Keys Page (Anthropic + Meta Graph) - per User
- Onboarding-Wizard zwingt initial: Brand-Name + Anthropic-Key
- Output-Page entfällt komplett (kein Download/Output mehr - Renders leben in Firebase Storage)

---

## Build Order (Phasen)

### Phase 0: Repository-Vorbereitung
- **Neues paralleles Verzeichnis:** `C:\webprojects\content-generation-v3\` als separates Repo. Altes System unter `C:\webprojects\content-generation\` bleibt unangetastet und lauffähig. Kein Branch im alten Repo - der existierende `v3-rewrite`-Branch wird stillgelegt (oder gelöscht), v3 lebt im neuen Verzeichnis.
- Frischer Stand: keine Migration aus alter Code-Basis nötig. Komponenten/Prompts werden bei Bedarf manuell rüberkopiert.
- Ein einziges Firebase-Projekt: `content-gen-prod`, Region `europe-west1`. Auth + Firestore + Storage + **Hosting** aktivieren. **Kein Staging** - Tim entwickelt direkt gegen prod, Risiko via Kill Switch + Budget Cap (siehe Failure-Mode #8).
- Gleiches GCP-Projekt für Cloud Run (1 Service: `content-gen`, europe-west1).
- **Blaze-Plan aktivieren:** Cloud Run, Cloud Tasks, Cloud KMS, Cloud Scheduler erfordern Blaze. Spark deckt nur Auth/Firestore/Storage/Hosting. Bei 2 Usern bleiben alle Services im Free-Tier - erwarteter Fix-Cost $0, variabler Cost ~$0-$2/mo. Anthropic-API-Spend (Tims Key) separat. Hardes $20-Budget-Alert + Kill-Switch (siehe Failure-Mode #8) decken das Risiko.
- **Kein Vercel.** Frontend deployed via `firebase deploy --only hosting`, Backend via `gcloud run deploy`.

#### Single-Service-Deploy

```
content-gen          Frontend-API: /api/generate (SSE), /api/render-jobs (enqueue), /api/posts, /api/settings/*
                     Workers:      /internal/render, /internal/publish-worker, /internal/learning-worker
                     concurrency=1, mem=2Gi, cpu=2, min-instances=1, --allow-unauthenticated
                     Image: Node + Playwright + Chromium ~250MB
                     Auth: App-code split — /api/* → requireAuth (Firebase ID-token + email-allowlist),
                                            /internal/* → requireOidc (audience + ALLOWED_INVOKERS email)
```

#### IAM-Bindings (Phase 0 Checklist)

```bash
# Service Accounts anlegen
gcloud iam service-accounts create content-gen-sa        # Service runtime SA
gcloud iam service-accounts create internal-invoker      # Cloud Tasks + Cloud Scheduler beide

# content-gen-sa: Firestore + Storage + KMS
gcloud projects add-iam-policy-binding PROJECT \
  --member=serviceAccount:content-gen-sa@PROJECT.iam.gserviceaccount.com \
  --role=roles/datastore.user
gcloud projects add-iam-policy-binding PROJECT \
  --member=serviceAccount:content-gen-sa@PROJECT.iam.gserviceaccount.com \
  --role=roles/storage.objectAdmin
gcloud kms keys add-iam-policy-binding api-keys \
  --keyring=user-secrets --location=europe-west1 \
  --member=serviceAccount:content-gen-sa@PROJECT.iam.gserviceaccount.com \
  --role=roles/cloudkms.cryptoKeyEncrypterDecrypter

# content-gen-sa darf Tasks erstellen
gcloud projects add-iam-policy-binding PROJECT \
  --member=serviceAccount:content-gen-sa@PROJECT.iam.gserviceaccount.com \
  --role=roles/cloudtasks.enqueuer

# content-gen-sa darf internal-invoker "act as" um OIDC-Tokens zu prägen
gcloud iam service-accounts add-iam-policy-binding internal-invoker@PROJECT.iam.gserviceaccount.com \
  --member=serviceAccount:content-gen-sa@PROJECT.iam.gserviceaccount.com \
  --role=roles/iam.serviceAccountUser

# Cloud Tasks Queues
gcloud tasks queues create render-queue --location=europe-west1
gcloud tasks queues create publish-queue --location=europe-west1
# Tasks-enqueue-Code passt OIDC mit:
#   oidcToken.serviceAccountEmail = internal-invoker@...
#   oidcToken.audience = https://content-gen-HASH-ew.a.run.app

# Cloud Scheduler Job: ruft /internal/publish-worker periodisch auf content-gen
gcloud scheduler jobs create http publish-tick \
  --location=europe-west1 --schedule="*/5 * * * *" \
  --uri=https://content-gen-HASH-ew.a.run.app/internal/publish-worker \
  --oidc-service-account-email=internal-invoker@PROJECT.iam.gserviceaccount.com \
  --oidc-token-audience=https://content-gen-HASH-ew.a.run.app
```

#### Rollback-Strategy

Kein v2-Cloud-Pre-Condition. Rollback = lokal-v2 (siehe Rollback Procedure section). Tim und Jule haben jeweils eine Kopie des alten `content-generation`-Repos und können `npm run dev` ausführen. Verlorene Posts im 48h-Window sind dokumentiert akzeptiert.

### Phase 1: Foundation
- Vite + React + Tailwind + Zustand bleiben aus heute.
- Express-Server, alle `server/routes/*` außer `socialClub.ts` und `instagram.ts` löschen.
- SQLite (`server/db/`) löschen.
- Firebase SDK (`firebase`, `firebase-admin`) installieren.
- Auth-Hook `useAuth()` mit Google + Email-Link.
- Firestore-Wrapper (Client-SDK) mit Convertern für Brand, Post, Settings.
- Onboarding-Modal (Brand + API-Key).
- App-Shell (Sidebar, Header, BrandSwitcher) bleibt aus heute, an Firestore angebunden.
- **Email-Allowlist in `requireAuth` Middleware** (G7-Fix, simplified). Firebase Auth Sign-Up ist by-default offen für jeden mit dem Web-Config-Snippet (steht im JS-Bundle). Statt einer separaten `onCreate` Cloud Function: Email-Allowlist direkt in der Auth-Middleware des Cloud Run Service. Random-User können sich registrieren, kriegen aber 403 auf jeden API-Call.

  ```ts
  // cloud-run/middleware/auth.ts
  import { getAuth } from 'firebase-admin/auth'
  const ALLOWED_EMAILS = ['tim@example.com', 'jule@example.com']

  export async function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).end()
    try {
      const decoded = await getAuth().verifyIdToken(token)
      if (!decoded.email || !ALLOWED_EMAILS.includes(decoded.email)) return res.status(403).end()
      req.uid = decoded.uid
      next()
    } catch { return res.status(401).end() }
  }
  ```

  Caveat: unautorisierte Sign-Ups bleiben als "ghost users" in der Firebase-Auth-Liste. Cosmetic only — sie haben null Capability.

- **`/internal/*` OIDC Middleware** (B1-Fix). Single-service Setup heißt `--allow-unauthenticated` ist gesetzt damit das Frontend rein kommt. `/internal/*` muss daher app-code-seitig OIDC-verifizieren statt sich auf Cloud-Run-IAM zu verlassen.

  ```ts
  // cloud-run/middleware/oidc.ts
  import { OAuth2Client } from 'google-auth-library'
  const oauthClient = new OAuth2Client()
  const ALLOWED_INVOKERS = ['internal-invoker@PROJECT.iam.gserviceaccount.com']
  const SERVICE_URL = process.env.CLOUD_RUN_SERVICE_URL!

  export async function requireOidc(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).end()
    try {
      const ticket = await oauthClient.verifyIdToken({ idToken: token, audience: SERVICE_URL })
      const payload = ticket.getPayload()
      if (!payload?.email || !ALLOWED_INVOKERS.includes(payload.email)) return res.status(403).end()
      next()
    } catch { return res.status(401).end() }
  }

  // app.ts
  app.use('/api', requireAuth)
  app.use('/internal', requireOidc)
  ```

- **Kill-Switch-Doc Schema** (G8-Fix, simplified). Firestore-Doc `system/killSwitch`:

  ```ts
  // system/killSwitch
  { enabled: true }
  ```

  Single tripwire. Check am Anfang jedes API+Internal-Endpoints:

  ```ts
  const flag = await getCachedKillSwitch()  // 30s in-memory TTL
  if (flag.enabled === false) return res.status(503).json({ error: 'suspended' })
  ```

  Auto-flip bei $40-Budget-Alert via Pub/Sub → Cloud Function (oder manueller Firestore-Write). Schreibrechte nur Tim's Admin-Credential (Firestore Rule: `allow write: if false`).

### Phase 2: Brand Settings
- Schema-Reduktion in `shared/schemas/settings.ts` (raus: hooks_guidance, strategy, styleTypes, layoutTemplates).
- Pages reduzieren: IdentityPage, DesignPage bleiben, Strategy/Layouts/StyleTypes/Library löschen.
- Neue FocusAreasPage.
- Neue reduzierte LibraryPage (nur Situations).
- System/ApiKeysPage angebunden an `users/{uid}.apiKeys`.

### Phase 3: Create (vormals Social Club)
- Komponenten umbenennen (`social-club/` → `create/`).
- Pillar-Refactor: P1/P2/P3 → mode (create-demand | convert-demand).
- Topic-File-Loading raus, Focus-Areas-Loading rein.
- Prompt-Files re-organisieren (`prompts/modes/`).
- Generation als Cloud Run Endpoint (`POST /generate`), nutzt Anthropic-Key aus Firestore (KMS-decrypted).
- Photo-Upload zu Firebase Storage statt lokalem Filesystem.
- Editor (ZoneCanvas) angebunden an Firestore-Post-Doc.
- Auto-Save: Generate erzeugt Post-Doc mit `status: 'draft'` + `aiSnapshot`.

### Phase 4: Render-Service (Cloud Run)
- Separates Repo oder Subordner `render-service/`.
- Dockerfile mit Node + Playwright + Chromium.
- HTTP-Endpoint `POST /render`: nimmt `{ slides, brandSettings }`, rendert PNGs, speichert in Firebase Storage, gibt URLs zurück.
- Service-Account für Storage-Schreibrechte.
- Cloud Run Deploy via `gcloud run deploy`.
- Frontend ruft Endpoint via signed Request (Service-Account-Authentifizierung oder kurze JWT vom User).

### Phase 5: Posts (3 Tabs)
- PostHistoryPage refactor: 3 Tabs, je gefilterte Liste aus `/users/{uid}/brands/{brandId}/posts`.
- DraftsPage löschen (war Redirect).
- Schedule-Modal mit Datepicker.
- Publish-Cloud-Function: triggert manuell (`Publish Now`) oder via Cloud Scheduler (`scheduled`).
- IG-Sync für Stats: Cloud Function periodisch.

### Phase 6: Learning
- Cloud Function `onPostPublished` (Firestore Trigger oder im Publish-Flow).
- `computeEditDiff` aus altem `editDiff.ts` portieren.
- Pattern-Extraction-LLM-Call (Claude Haiku, kurzer Prompt).
- Schreibt in `brand.learnedPatterns`.
- Generate-Prompt liest `learnedPatterns` und injiziert.

### Phase 7: Dashboard-Polish + Calendar-Placeholder
- Dashboard mit nützlichen Widgets (Recent Posts, Scheduled-Count, Brand-Switcher).
- Calendar bleibt Placeholder mit "Coming Soon".

### Phase 8: Cutover
- Production-Deploy auf Firebase Hosting + Cloud Run.
- Firestore Security Rules final.
- Tim + Jule legen ihre eigenen User an, befüllen LEBEN.LIEBEN-Brand neu (Fresh Start).
- Alte App archivieren.

---

## Critical Files Reference (heute → morgen)

### Wiederverwenden / Adaptieren
- `client/src/components/social-club/ZoneCanvas.tsx` → Editor-Canvas bleibt
- `client/src/components/social-club/SlidePanel.tsx` + `ZonePanel.tsx` → bleiben
- `server/services/socialClubRender.ts` (`parseSlidesMd`, `buildCarouselSlideHTML`, `buildZoneSlideHTML`) → in Cloud-Run-Service portieren
- `server/routes/socialClub.ts:139-194` (`assembleSystemPrompt`) → in Cloud Run Endpoint portieren, Pillar→Mode-Refactor
- `server/routes/socialClub.ts:909-981` (Photo-Resolution) → portieren mit Firebase Storage statt local
- `server/services/editDiff.ts` (`captureSnapshot`, `computeEditDiff`) → in Cloud Function portieren
- `server/services/learningContext.ts` (`assembleLearningBlock`) → vereinfachen, gegen `learnedPatterns` lesen
- `server/services/instagramSync.ts` → an Firestore anpassen
- `server/services/publish.ts` → an Firestore + Cloud Scheduler anpassen
- `server/prompts/social-club/{base.md, output-format.md, product.md, methods/*.md}` → bleiben, Pfad reorganisieren
- Settings-Pages: `IdentityPage.tsx`, `DesignPage.tsx`, `InstagramPage.tsx` → an Firestore anpassen

### Komplett löschen
- `client/src/pages/CreatePostPage.tsx`
- `client/src/components/create/{SelectStep, GenerateStep, EditStep, ReviewStep, SlidePreview, ZoneEditor, ColorPicker, SituationLinkPicker, LearningContext}.tsx`
- `client/src/pages/settings/{StrategyPage, StyleTypesPage, LayoutsPage}.tsx`
- `client/src/pages/LearningDashboardPage.tsx`
- `client/src/pages/DraftsPage.tsx`
- `client/src/pages/system/OutputPage.tsx`
- `server/routes/{generate, render, drafts, publish (alt), library (reduzieren), inspiration, situationImages (mergen), facebook, learning, posts (refactor), brands, settings}.ts` - jeweils prüfen vs. neue Cloud-Run-Endpoints
- `server/db/` komplett (alle Migrations, index.ts)
- `server/services/{render.ts (alt), browserPool.ts (in render-service), encryption.ts (durch Cloud KMS), voiceDna.ts (vereinfacht), cloudinary.ts, scheduler.ts, fileContext.ts (OneDrive-Loading), vision.ts}` prüfen
- `shared/schemas/{layout, styleType, draft}.ts`
- `server/prompts/social-club/pillars/p3-loyalty-nurture.md`

---

## Verification

End-to-End-Tests pro Phase:

**Phase 1 (Foundation):**
- Neue Email-Adresse → Google Sign-In → Onboarding → Brand angelegt → Anthropic-Key gespeichert
- Logout → Re-Login → Brand-State bleibt erhalten
- Firestore Security Rules: User A kann nicht User Bs Brand sehen

**Phase 2 (Settings):**
- Identity-Felder editieren → Refresh → bleiben gespeichert
- Focus Area anlegen, editieren, löschen
- Situation anlegen mit Image-Upload → Image landet in Firebase Storage

**Phase 3 (Create):**
- Generate-Form ausfüllen (mode, method, focus, situation, photos, slideCount) → Generate → Slides erscheinen
- Editor-Edit → Auto-Save → Reload → Edits da
- aiSnapshot in Firestore-Doc bleibt unverändert nach Edit

**Phase 4 (Render):**
- Render-Endpoint POST → 7 PNGs in Firebase Storage
- PNGs werden in Editor-Preview angezeigt (Storage-URLs)
- Cold-Start-Latenz akzeptabel (<10s)

**Phase 5 (Posts):**
- Post → Schedule für `now+5min` → Cloud Scheduler triggert → IG erhält Post → Status auto auf published → wandert in History-Tab
- IG-Stats nach 1h gesynced

**Phase 6 (Learning):**
- 5 Posts publishen mit Edits → `learnedPatterns` in Brand-Doc gefüllt
- Generate Post 6 → Prompt enthält `<learned_patterns>` Block (in Network-Trace prüfen)
- A/B mental: First-Shot von Post 10 sichtbar näher an Final-Posted als von Post 1

**Phase 8 (Cutover):**
- LEBEN.LIEBEN neu in v3 angelegt
- Erster Real-Post über v3 published auf @leben.lieben
- IG-Stats nach 24h sichtbar in History

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES_OPEN | REDUCTION recommended (Approach C); user chose B; 10 architecture gaps; 8/8 critical failure-mode gaps; portfolio Tier-3 conflict unresolved |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run (plan mode, no shell) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 4 | ISSUES_CLOSED (v6) | v1-v5 history below. v6-delta: simplification pass (Tim's minimalism rule) — collapsed 2 services → 1, dropped v2-cloud-rollback, single kill-flag, allowlist middleware vs Cloud Function, trimmed 86 → ~63 tests, observability 7 → 3 sinks. 4 minor reintroduced gaps (B1, B5/B6, B11) inline-resolved. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not applicable (no new UI scope beyond OnboardingModal) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

**CROSS-MODEL:** CEO review and Eng review agree on auth-from-zero (not migrate), browserPool incompatibility with Cloud Run, learning_events deletion friction, fileContext.ts hardcodes, observability/abuse/staging/rollback gaps. Eng review adds: render-async pattern undefined (A2), Vercel→Cloud Run auth handshake undefined (A3), learnedPatterns storage model under-specified (A4), schema reorganization not enumerated (Q2), test coverage diagram showing 51/52 paths uncovered.

**UNRESOLVED:** 11 decisions to close in plan revision (Tim chose "Full close" gate):
- A1 Cloud Run min-instances + Chromium-per-request rewrite
- A2 Render async/poll model (renderJobs doc or postSlide.renderStatus)
- A3 Vercel → Cloud Run auth (SA ID-token mint vs user JWT verify)
- A4 learnedPatterns storage (sub-collection recommended) + index spec
- A5 Pattern-extract async + JSON validation + idempotency
- A6 Cloud Scheduler idempotency guard
- A7 fileContext.ts angle/pillar guidance replacement
- A8 Vercel SSE timeout test plan
- Q1 vision.ts fate (port labels or drop)
- Q2 Schema reorganization list
- Q3 KMS pattern (Cloud KMS direct recommended, no envelope)

Plus: test plan (75-120 new tests), observability stack, error/rescue table for 8 failure modes, abuse model (signup gate + spend cap + billing alerts), staging environment, rollback procedure, cloudinary disposition.

**VERDICT:** ISSUES_CLOSED (2026-04-26 v6) — simplification pass removed ~260 plan lines and 1 service without losing load-bearing protections. 4 minor reintroduced gaps inline-resolved.

### v6 Patches (2026-04-26, Simplification Pass)

1. **S1 - Collapse 2 services → 1.** `content-gen-api` + `content-gen-render` zusammengeführt zu `content-gen` (concurrency=1, mem=2Gi, cpu=2, min-instances=1, --allow-unauthenticated). App-Code splittet Auth: `/api/*` → `requireAuth`, `/internal/*` → `requireOidc`. Begründung: 2-User-Scale = concurrent-overlap ≈ 0; Worst-Case ~30s Queue-Wait akzeptabel. -1 Service, -1 SA, -6 IAM-Bindings.

2. **S2 - Drop v2-Cloud-Rollback-Pre-Condition.** Rollback = lokal-v2 (Tim und Jule clonen das alte Repo, `npm run dev`). G6 + NG4 entfernt. -1 Cloud Run Service, -4h Phase-0-Aufwand. Rollback-Latency 30-60min statt <60s (akzeptiert für 2-User-internal).

3. **S3 - Single kill-flag.** `system/killSwitch = { enabled: bool }` statt 3 separater Flags. Single tripwire. Auto-flip bei $40-Budget, manuell durch Tim sonst.

4. **S4 - Allowlist in `requireAuth` Middleware.** `blockUnauthorizedSignup` Cloud Function entfernt. Email-Check als hardcoded Konstante in der Auth-Middleware. Same security property, -1 deploy target. Ghost-User in Firebase Auth Liste cosmetic.

5. **S5 - Trim test plan 86 → ~63.** Cut: magic-link Firebase-contract tests (4→1), multi-brand isolation (5→2), cold-start perf (2→0), multer (3→0), node-cron (3→0), missed-run (3→1), Levenshtein (3→1), full E2E (4→1).

6. **S6 - Trim observability 7 → 3.** Sentry browser SDK + Cloud Logging error rate alert + GCP Budget Alert. Dropped: BigQuery billing export, Looker Studio, Slack #infra-costs, PagerDuty webhook, weekly digest.

7. **B1 (inline-resolved) - `/internal/*` OIDC middleware spec.** Single-service requires app-code OIDC verify since service is `--allow-unauthenticated`. Spec in Phase 1.

8. **B5/B6 (inline-resolved) - Failure-Mode #8 rewrite.** Single threshold ($40 → kill). $20 alert → email only, no degraded-mode LRU fallback (was unverified failure mode anyway).

9. **B11 (inline-resolved) - Merge invoker SAs.** `cloud-tasks-invoker` + `cloud-scheduler-invoker` → single `internal-invoker`. Both Tasks and Scheduler invoke same service.

### v5 Patches (2026-04-26)

1. **G1+G2+G3+G5 - Service Split.** Single Cloud Run service split in zwei: `content-gen-api` (concurrency=20, --allow-unauthenticated, kein Chromium, ~50MB image) für User-Traffic + `content-gen-render` (concurrency=1, IAM-gated, voll-Chromium, ~250MB image) für Workers. Löst gleichzeitig die `--allow-unauthenticated`-vs-IAM-Contradiction (Render-Service ist IAM-gated für Cloud Tasks SA + Scheduler SA; API-Service nutzt App-Code Firebase-Auth-Check) und die zweiter-User-Cold-Start-Problematik (API kann concurrency=20 fahren). Phase 0 enthält jetzt vollständige IAM-Bindings-Checklist (gcloud-Befehle für SAs, run.invoker, KMS, Tasks-Enqueuer, Scheduler).

2. **G4 - Server-Side Abort-Propagation.** `/generate` hört auf `req.on('close')` und propagiert AbortController.signal an Anthropic SDK. Verhindert Token-Spend wenn Client wegnavigiert. Tab-Suspension auf Mobile dokumentiert als known-limitation (kein Resumable-Generate in v3-Scope).

3. **G6 - v2-Cloud-Frontend-Pre-Condition.** Phase 0 enthält jetzt zwei v2-Artefakte: (a) v2-Backend in Cloud Run (war bereits da als NG4-Fix), (b) v2-Frontend mit `VITE_API_URL=<v2-backend-URL>` zu Firebase Hosting deployed mit dokumentierter VERSION_ID. Rollback Step 4 hat damit einen tatsächlich existierenden Build zum Clonen. Caveat dokumentiert: v2 hat keine Firebase-Auth, Rollback-Window serviert unauth'd App.

4. **G7 - `onCreate` Allowlist mandatory.** Phase 1 deployed `blockUnauthorizedSignup` Cloud Function als hard requirement (war in v4 als "optional defensive layer" markiert). Verhindert dass jeder mit Web-Config-Snippet aus dem JS-Bundle Tokens prägen kann die Cloud Run akzeptiert.

5. **G8 - `generateEnabled` Kill-Switch.** `system/killSwitch` erweitert auf 3 Flags (`renderEnabled`, `generateEnabled`, `publishEnabled`) statt nur `renderEnabled`. Token-Theft-Response: Tim flippt `generateEnabled=false` mit einem Firestore-Write um Anthropic-Spend zu stoppen, ohne dass GCP-Budget-Alerts triggern müssen (die haben 30-90min Lag). Worst-Case-Loss bei 1h-Token-TTL dokumentiert (~$50-180), 2FA auf Google-Account als out-of-scope-Recommendation.

### Vorher-Patches (v2-v4, beibehalten)

- v1 fixes: A2 Cloud Tasks worker + nested path; A5 trigger type
- v2 fixes: A6 Firestore-Transaction für publish-lock; NG4 v2-containerization-pre-condition; NG6 Failure-Mode #8 rewrite; NG2 path migration
- v3 fixes: kein Staging; v3 in paralleles Verzeichnis
- v4 fixes: Vercel komplett raus; A3 Firebase-Auth-ID-token-Verify in App-Code; A8 Cloud-Run-Timeout absorbiert SSE; Abuse-Model auf 2 trusted users reduziert

1. **A6/NG5 - Firestore transaction for publish idempotency.** Replaced SQLite `UPDATE...WHERE` pattern with Firestore transaction on `users/{uid}/brands/{brandId}/posts/{postId}`. Conditional update where `status == 'scheduled'` → `status = 'publishing'`, conflict = skip silently. Stale recovery via collection-group sweep (`status == 'publishing' AND lockedAt < now-10min` → reset to `scheduled`). Composite index `(status ASC, lockedAt ASC)` on posts collection-group required. See updated A6 section.
2. **NG4 - v2 Cloud Run pre-condition.** Phase 0 now explicitly requires containerizing v2 (Dockerfile + `gcloud run deploy content-gen-api-v2`) before v3 work begins, kept deployed parallel through 48h cutover window. Rollback Procedure pre-condition note updated to reference Phase 0 prerequisite.
3. **NG6 - Failure-Mode #8 rewritten.** Detection now = GCP budget alert at $20/$40 (no false "50k hard cap" claim), auto-rescue = LRU cache fallback at $20 trigger, escalation = kill switch flip + Cloud Run `--max-instances 0` + billing investigation at $40.
4. **NG2 path migration.** Section 2 Auto-Save and Section A5 trigger now use full `users/{uid}/brands/{brandId}/posts/{postId}` path. Section 3 path references already correct (line 261). Cross-checked.

**Non-blocking, tracked for phase execution:**
- ~~A8: Vercel Pro tier as explicit Phase 0 checklist item~~ - moot, Vercel dropped.
- Observability: Cloud Run render latency alert missing from stack
- Test plan: ~5 tests are padded; real count ~79-81

**Tim user-fixes (2026-04-26 v3):**
- No staging environment - prod-only, internal-use rationale documented in Staging section.
- v3 lives in parallel directory `C:\webprojects\content-generation-v3\` (new repo) - old `content-generation` repo untouched and remains runnable. `v3-rewrite` branch in old repo to be retired.
- Blaze plan required (Cloud Run / Tasks / KMS / Scheduler all need it). Phase 0 makes this explicit. $20 budget cap + kill switch cover cost risk. At 2-user volume, expected fixed cost $0, variable cost ~$0-$2/mo.

**Tim user-fixes (2026-04-26 v4):**
- **Vercel dropped entirely.** Frontend → Firebase Hosting (free), backend (generate, render, publish, all `/internal/*`) → single Cloud Run service. Eliminates Vercel-Pro $20/mo, Hobby commercial-use ToS issue, A3 cross-cloud auth handshake, A8 SSE timeout pressure.
- **A3 rewritten** - Firebase Auth ID-token verified in Cloud Run app code (no Cloud-Run-IAM gate for user-facing endpoints). Internal Cloud Run → Cloud Run still uses Google OIDC at IAM layer.
- **A8 collapsed** - Cloud Run 5min default timeout absorbs Claude streaming, no envelope/fallback needed.
- **Abuse Model simplified** - 2 trusted users only, no signup gate, no per-user spend caps. Budget alerts + kill switch remain as runaway-bug protection.
- **Rollback Procedure** - Firebase Hosting clone-version replaces Vercel deployment promotion.

Phase 0 unblocked.

**Non-blocking but track:**
- A8: Vercel Pro tier as explicit Phase 0 checklist item (currently buried in timeout section)
- Observability: Cloud Run render latency alert missing from stack
- Abuse: Storage quota enforcement needs Firestore counter (per-user aggregate not queryable from Storage SDK)
- Test plan: ~5 tests are padded (perf benchmark not unit, cron redundancy with existing); real count ~79-81

Re-review by independent Sonnet subagent. Full output in conversation log.

**Portfolio note:** Plan execution still requires explicit Tier-3 → Tier-1 promotion in next portfolio review (per CEO review Action #3). Eng review does not gate on portfolio status; that's a separate decision surface.

---

## Gap Closures: Render Service

### A1 Cloud Run Chromium Strategy

**Decision: per-request Chromium launch, no pool, `min-instances=1`. Single `content-gen` service.**

The current `browserPool.ts` maintains a module-level `pool: PoolEntry[]` array with `MAX_POOL_SIZE=3` and a `MAX_RENDERS_PER_BROWSER=50` recycle counter. On Cloud Run with `concurrency=1` and scale-to-zero, that array survives within a warm instance but is silently lost on cold start - any request that hits a fresh instance pays full Chromium launch latency anyway. A pool of size 3 only pays off under concurrent load, which `concurrency=1` explicitly prohibits.

```ts
// browserPool.ts (v3)
export async function renderHtmlToPng(html: string, width: number, height: number): Promise<Buffer> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  try {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.route('http://localhost/__render__', route =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    )
    await page.goto('http://localhost/__render__', { waitUntil: 'networkidle', timeout: 30000 })
    await page.evaluate(() => (document as any).fonts?.ready)
    return Buffer.from(await page.screenshot({ type: 'png', clip: { x:0, y:0, width, height } }))
  } finally {
    await browser.close()
  }
}
```

Cloud Run service config (`content-gen`): `min-instances=1`, `concurrency=1`, `memory=2Gi`, `cpu=2`.

Rationale: eliminating the pool removes the leak surface entirely. `min-instances=1` absorbs the latency penalty that motivates pooling in the first place. `concurrency=1` plus rare 2-user-overlap (~0 probability) accepts up to 30s queue-wait when generate+render happen simultaneously — honest behavior, documented as known limit.

### A2 Async Render Model

**Decision: `renderJobs` Firestore sub-collection (under user) + Cloud Tasks for async worker, client polling at 2s interval.**

Current `/render-all` is a synchronous loop (sequential `renderHtmlToPng` calls) inside a single HTTP response. At 7-10 slides × 3-5s each = 21-50s, this is a hard timeout on any serverless platform.

**Path (security-rules-compatible):** `users/{uid}/renderJobs/{jobId}` - nested under user so `/users/{uid}/**` rule applies. NOT top-level.

```
users/{uid}/renderJobs/{jobId}
  status: 'pending' | 'rendering' | 'done' | 'error'
  brandId: string
  createdAt: Timestamp
  updatedAt: Timestamp
  totalSlides: number
  completedSlides: number
  slides: { [slideNumber]: { dataUrl: string, renderedAt: Timestamp } }
  error?: string
```

**Async worker mechanism:** Cloud Tasks queue `render-queue` in same GCP project. Frontend calls `POST /api/render-jobs` on `content-gen` (with Firebase Auth ID-token):
1. `requireAuth` verifiziert Firebase Auth token + email-allowlist, extrahiert `uid`
2. Erstellt Firestore-Doc mit `status='pending'`
3. Enqueue Cloud Task → target `https://content-gen-HASH-ew.a.run.app/internal/render`, OIDC token mit `serviceAccountEmail=internal-invoker@...`, `audience=<service-URL>`
4. Returns `{ jobId }` immediately

`/internal/render` Endpoint (same `content-gen` service):
- App-Code-Verify via `requireOidc` middleware: prüft OIDC-Token-Audience + Invoker-Email gegen ALLOWED_INVOKERS.
- Setzt `status='rendering'`, rendert sequenziell, updated `completedSlides` pro Slide, `status='done'`.
- Cloud Tasks handelt Retries (max 3, exponential backoff). On terminal failure: `status='error'`.

**Client:** `GET /api/social-club/render-jobs/:jobId` polled every 2000ms. Stop on `done`/`error`. Progress = `completedSlides/totalSlides`. Client timeout 120s, no auto-retry. Job TTL: Firestore TTL policy on `createdAt` (1h).

### A8 Generation Timeout + Client-Disconnect-Handling

**Cloud Run timeout:** default 5min (300s), explicit `--timeout=300s` als defensive Cap. Cloud Run gen2 streamt Responses (kein Buffering), Claude-Streaming für 7-10 Slides bei 20-90s sitzt komfortabel drin. SSE flows direkt von Cloud Run zum Client.

**Server-Side Abort-Propagation (G4-Fix):** ohne Abort-Hook streamt Claude weiter wenn Client disconnects → Anthropic-Tokens werden gebillt für Daten die niemand liest. Fix:

```ts
// cloud-run/routes/generate.ts
app.post('/api/generate', requireAuth, async (req, res) => {
  const abortController = new AbortController()
  req.on('close', () => abortController.abort())  // client navigated away or tab closed

  try {
    const stream = await anthropic.messages.stream({
      // ... prompt config
      signal: abortController.signal,
    })
    for await (const chunk of stream) {
      if (abortController.signal.aborted) break
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }
    res.end()
  } catch (err) {
    if (abortController.signal.aborted) return  // expected, no log spam
    throw err
  }
})
```

**Tab-Suspension-Limitation (dokumentiert, nicht gefixt):** Mobile Safari/Chrome suspendieren Background-Tabs nach ~30s. SSE-Connection bricht, Claude-Tokens für die Generation sind weg, User muss re-runnen → Double-Spend in dem Szenario. Bei 2-User-Scale akzeptabel. Resumable-Generate (durable Job-Doc + Reconnect) ist in v3-Scope nicht enthalten - wenn Mobile-Heavy-Use auftaucht, separat eskalieren.

**Kein server-side auto-retry** (vermeidet Double-Billing bei transient errors).

---

## Gap Closures: Auth & Security

### A3 Frontend → Cloud Run Auth (Single-Service-Modell)

**Decision: Single service, App-Code splittet Auth per Route-Prefix.**

| Route-Prefix | App-Code Auth | Wer ruft auf |
|---|---|---|
| `/api/*` | `requireAuth` — Firebase ID-token + email-allowlist | Frontend (Browser, Tim/Jule) |
| `/internal/*` | `requireOidc` — OIDC audience + ALLOWED_INVOKERS email | Cloud Tasks, Cloud Scheduler (intern) |

Beide Middlewares siehe Phase 1. Service ist `--allow-unauthenticated` damit das Frontend rein kommt; die `/internal/*`-Schutzschicht ist app-code-only.

Frontend sendet `Authorization: Bearer ${await user.getIdToken()}` bei jedem `/api/*`-Request. Cloud Tasks und Scheduler verwenden beide `internal-invoker@PROJECT.iam.gserviceaccount.com` als OIDC-SA.

**DDoS-Surface:** `--allow-unauthenticated` heißt jeder kann `requireAuth`-Calls auslösen. Bei min-instances=1 + concurrency=1 ist das real begrenzt — sustained Burst >1 req/s führt zu Cloud-Run-Auto-Scale (max-instances default 100). Wenn realer DDoS auftritt: Cloud Armor in front (free tier 1000 reqs/min/IP). Aktuell nicht im Plan - wenn relevant, separat eskalieren.

### Q3 KMS for User API Keys

Key: `projects/content-gen-prod/locations/europe-west1/keyRings/user-secrets/cryptoKeys/api-keys`. Single symmetric key, automatic rotation every 90 days. KMS does not re-encrypt on rotation; ciphertext stores key version.

**No envelope encryption.** API keys are ~60 bytes - direct KMS calls are fine.

```ts
// server/services/kms.ts
import { KeyManagementServiceClient } from '@google-cloud/kms'
const client = new KeyManagementServiceClient()
const KEY_NAME = process.env.KMS_KEY_NAME!

export async function kmsEncrypt(plaintext: string): Promise<string> {
  const [r] = await client.encrypt({ name: KEY_NAME, plaintext: Buffer.from(plaintext) })
  return Buffer.from(r.ciphertext as Uint8Array).toString('base64')
}
export async function kmsDecrypt(ciphertext: string): Promise<string> {
  const [r] = await client.decrypt({ name: KEY_NAME, ciphertext: Buffer.from(ciphertext, 'base64') })
  return Buffer.from(r.plaintext as Uint8Array).toString('utf8')
}
```

Encrypt on write (settings UI → Cloud Run `POST /settings/api-keys` → KMS encrypt → Firestore base64 blob). Decrypt on read (same Cloud Run service → Firestore → kmsDecrypt → Anthropic). Only the Cloud Run service account gets `roles/cloudkms.cryptoKeyEncrypterDecrypter`.

Latency: ~30-60ms decrypt, same region. Cache decrypted key in Cloud Run memory for instance lifetime. Cost: $0.03 per 10k ops, negligible.

### Abuse Model

**Drastically reduced.** Only two trusted users (Tim + Jule) - no per-user spend caps. The risk surface is bugs/runaway loops + Token-Theft, not unbekannte Angreifer.

**Account creation:** Tim adds Jule manually via Firebase Console → Authentication → Add User (one-time). Sign-up is not exposed in the UI.

**Email-Allowlist in `requireAuth` Middleware (G7-Fix, simplified):** statt separater Cloud Function liegt die Allowlist als hardcoded Konstante in der `requireAuth`-Middleware (`/api/*`). Random Sign-Ups bekommen 403 auf jeden API-Call. Spec siehe Phase 1.

**Billing alerts (Detection):** GCP budget $20/month → email an Tim (no auto-action). Secondary alert bei $40 → Pub/Sub → Cloud Function flippt `system/killSwitch.enabled = false` und setzt Cloud Run `--max-instances 0`.

**Kill-Switch-Schema (G8-Fix, simplified):**
```ts
// system/killSwitch
{ enabled: bool }
```
Single tripwire. Wenn geflippt (auto bei $40 oder manuell durch Tim): gesamte App down bis re-enabled. Bei 2-User-Scale ist "kill everything" der akzeptable Single-Point-Response.

```ts
// Each gated endpoint
const flag = await getCachedKillSwitch()  // 30s TTL in-memory
if (flag.enabled === false) return res.status(503).json({ error: 'suspended' })
```
Writable nur via Tim's Admin SDK (Firestore Rule `allow write: if false`).

**Token-Theft-Response-Latency:** GCP-Budget-Alerts haben 30-90min Aggregation-Lag. Wenn Tim's Session geklaut wird:
- Anthropic-Spend hat keine GCP-side-Bremse - Tim muss `enabled=false` flippen (1 Firestore Write) ODER Anthropic-Key in Anthropic-Dashboard revoken.
- Worst-case-Loss bei 1h-Token-TTL und aggressivem Attacker: ~$50-180 Anthropic-Spend bevor Detection. Akzeptiert für 2-User-Scale.
- Mitigation: 2FA auf Tim's Google-Account (out-of-scope für diesen Plan, aber Hard-Recommendation).

If user count grows beyond Tim+Jule, re-add per-user spend caps + Cloud Armor rate limits.

---

## Gap Closures: Learning System

### A4 learnedPatterns Storage

**Decision: sub-collection.** Array-field hits Firestore's 1 MB doc limit. Sub-collection enables server-side top-N without reading all into client.

Path: `brands/{brandId}/learnedPatterns/{patternId}`

```
{
  patternId: string (auto-id),
  type: "avg_edit_distance" | "length_change" | "word_replacement" | "tone_shift" | "summary_rule",
  styleType: string,         // zone styleType or "global"
  description: string,       // injected into prompt
  confidence: number,        // 0.0-1.0
  source: "learned" | "manual" | "voice_dna",
  brandId: string,           // denormalized for collection-group
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Top-N query: `orderBy("createdAt","desc").limit(50)`, score in memory `score = 0.4*recencyScore + 0.6*confidence`, take top 20 for prompt injection. Firestore can't sort derived field; memory step cheap at N=50.

Index: composite (`brandId ASC`, `createdAt DESC`) only needed for collection-group queries. Single-field auto-index on `createdAt DESC` sufficient if scoped to `brands/{brandId}/learnedPatterns`.

### A5 Pattern Extraction Pipeline

**Trigger:** Firestore `onDocumentUpdated` on `users/{uid}/brands/{brandId}/posts/{postId}` filtering for `before.status != "published" && after.status == "published"`. (`onDocumentCreated` would miss the typical `draft → scheduled → published` lifecycle since posts are rarely created with `published` status.)

**Idempotency key:** `{postId}_{diffHash}` as document ID (via `create()` not `set()` - duplicate = `already-exists`, swallowed). `diffHash`: SHA-256 of serialized `EditDiff.zones`, hex-truncated to 16 chars.

**JSON schema:**
```json
{ "rules": [{ "id": "rule-N", "description": "≤200 chars", "confidence": 0.0-1.0 }] }
```
Validation rejects entire response if array empty or any item malformed. No partial saves.

**Retry:** Cloud Functions default retry up to 7 days. Idempotency key prevents dup writes. Malformed JSON: log + return without throw (no infinite retry on bad output).

**Cost:** Sonnet, ~1200 input + ~300 output tokens = ~$0.008/publish. ~$0.24/month/brand at 30 posts/month.

### A6 Publish Scheduler Idempotency

v3 has no `publish_queue` table - posts carry their own status. Use a Firestore transaction on the post doc as the optimistic lock.

```ts
// publishService.ts (Cloud Run)
const postRef = db.doc(`users/${uid}/brands/${brandId}/posts/${postId}`)
const claimed = await db.runTransaction(async tx => {
  const snap = await tx.get(postRef)
  if (!snap.exists) return false
  if (snap.data()!.status !== 'scheduled') return false  // already claimed or already published
  tx.update(postRef, { status: 'publishing', lockedAt: FieldValue.serverTimestamp() })
  return true
})
if (!claimed) return  // another invocation owns it - skip silently
// ...proceed with Meta Graph publish, on success set status='published'
```

If `claimed === false`, another scheduler invocation (or the immediate Publish-Now path) already owns the post - skip silently, no error.

**Stale lock recovery:** the same Cloud Scheduler tick (every 5min) first runs a sweep query before claiming new work:
```ts
// query: status == 'publishing' AND lockedAt < now - 10min
const stale = await db.collectionGroup('posts')
  .where('status', '==', 'publishing')
  .where('lockedAt', '<', Timestamp.fromMillis(Date.now() - 10*60*1000))
  .get()
// for each: tx update back to status='scheduled', clear lockedAt
```
Handles crash-mid-publish. Composite index required: `(status ASC, lockedAt ASC)` on `posts` collection-group.

**Post-level dedup:** the transaction guard (`status !== 'scheduled'` aborts) covers the case where the same post was published via Publish-Now while waiting in the scheduler tick.

### A7 fileContext.ts Replacement

**Hardcoded path today:** `C:/Users/tim/OneDrive/18 Shared Jule Tim/LEBEN.LIEBEN/.claude/Context/`

| File | Field |
|---|---|
| `BRAND-VOICE.md` | `voice` |
| `PERSONA.md` | `persona` |
| `UVP.md` | `product_uvp` |
| `POV.md` | `point_of_view` |
| `COMPETITIVE-OPPORTUNITY.md` | `competitive_landscape` |
| `CONTENT-STRATEGIE.md` | `hooks_guidance` |
| `FUNNEL.md` | `funnel_context` |
| `BENEFIT-MAP.md` | `benefit_routing` |
| `LEARNINGS.md` | `language_rules` |
| `INSTAGRAM.md` | `instagram_strategy` |

Plus hardcoded `ANGLE_DEFS`, `PILLAR_CONFIGS`, `ANGLE_TARGETS`, `computeRecommendation`, `deriveFromFocus` (LEBEN.LIEBEN-specific routing, not generic).

**Migrates to Focus Areas:**
- `CONTENT-STRATEGIE.md` → Focus Area `description` (per-brand)
- `FUNNEL.md` → Focus Area `cta` + `captureUrl`
- `PERSONA.md`/`UVP.md`/`POV.md` → Brand `identity` (already partially in settings.identity)

**Dies entirely:** file-polling (30s TTL cache, `readFileWithCache`, `getFileContextStatus`), hardcoded path + `BRAND_CONTEXT_PATH` env var, `ANGLE_DEFS`/`PILLAR_CONFIGS` constants, `deriveFromFocus` C-value routing (Focus Area selection becomes explicit user choice).

**Survives in spirit:** `computeRecommendation` deficit math → ports to Firestore-backed function on per-brand post-history aggregates.

### Q1 vision.ts Decision

**Drop.** Called from exactly one place: `POST /api/:brandId/:id/analyze` in `inspiration.ts`. Stores `visual_patterns` (colors, layout, typography) in `inspiration_library.visual_patterns`. Field is **never read** by `generate.ts` or any prompt-assembly service. Stored but not injected into generation context. Cost ~$0.008/analyze, value to prompts: zero.

Delete `vision.ts`, the single inspiration route, and `visual_patterns` column. Re-add when Inspiration Library actually connects to prompt context.

---

## Gap Closures: Test, Observability, Error Handling

### Test Plan (~63 tests, 8 phases) — trimmed from 86 in v6

**Phase 1 - Auth & Multi-Brand Isolation**

| Layer | Critical Paths | Count | Tooling |
|---|---|---|---|
| Integration | Email-link sign-in happy path | 1 | Vitest + Auth emulator |
| Integration | Multi-brand isolation: User A read of User B post → DENIED | 1 | Vitest + Firestore emulator |
| Integration | Multi-brand isolation: User A write to User B brand → DENIED | 1 | Vitest + Firestore emulator |
| Integration | Email-allowlist: non-allowlisted token → 403 from `requireAuth` | 1 | Vitest |
| Unit | Brand context injected into Claude prompt | 2 | Vitest |

**Phase 2 - Generate Pipeline**

| Layer | Critical Paths | Count | Tooling |
|---|---|---|---|
| Unit | Pattern-extraction returns valid `SocialSlide[]` (zod) | 3 | Vitest |
| Unit | Invalid JSON triggers retry, fallback to raw | 3 | Vitest + mock Anthropic |
| Integration | `/api/generate` → Claude → parsed slides → Firestore draft | 5 | Vitest + sandbox key |
| Unit | Server-side abort: `req.on('close')` cancels Anthropic stream | 2 | Vitest + mock |

**Phase 3 - Zone Editor**

| Layer | Critical Paths | Count | Tooling |
|---|---|---|---|
| Unit | ZoneCanvas px coords for Format heights 1080/1350/1920 | 4 | Vitest + jsdom |
| Unit | Zone mutations emit correct Zustand state delta | 4 | Vitest |
| E2E | Drag → save → reload preserves position | 3 | Playwright |

**Phase 4 - Render**

| Layer | Critical Paths | Count | Tooling |
|---|---|---|---|
| Unit | Playwright viewport per Format | 3 | Vitest + mock |
| Integration | `/internal/render` PNG dims (1080x1080/1350/1920) | 3 | Vitest + sharp |

(Cold-start <30s p95 → manual smoke at deploy time, not regression test.)

**Phase 5 - Upload & Storage**

| Layer | Critical Paths | Count | Tooling |
|---|---|---|---|
| Integration | Storage upload Content-Type + signed URL | 2 | Vitest + Storage emulator |
| Integration | Upload failure cleans orphaned draft ref | 2 | Vitest |

(Multer >10MB/non-image rejection → enforced via Storage Rules, library-code test dropped.)

**Phase 6 - Publish (Meta Graph)**

| Layer | Critical Paths | Count | Tooling |
|---|---|---|---|
| Unit | `/internal/publish-worker` retries 3x on 5xx then `failed` | 3 | Vitest + nock |
| Unit | Transient 529 during generate doesn't corrupt draft | 3 | Vitest + mock |
| Integration | FB + IG publish container params correct | 4 | Vitest + Graph sandbox |
| Integration | Firestore-transaction publish-lock prevents double-publish | 2 | Vitest + emulator |

**Phase 7 - Scheduler**

| Layer | Critical Paths | Count | Tooling |
|---|---|---|---|
| Integration | Missed run detected via `scheduledAt` staleness sweep | 1 | Vitest + emulator |
| Unit | Scheduler skips already-published (idempotency) | 2 | Vitest |
| Integration | Stale-lock recovery: `status=publishing AND lockedAt <now-10min` reset | 1 | Vitest + emulator |

**Phase 8 - Settings, Library, Learning**

| Layer | Critical Paths | Count | Tooling |
|---|---|---|---|
| Integration | API key encrypted in Firestore; raw never logged/returned | 3 | Vitest |
| Unit | Library search ranked by Levenshtein | 1 | Vitest |
| E2E | Full happy path: Generate → render → schedule → publish → published | 1 | Playwright |
| Integration | Pattern-extraction idempotency (same diffHash = no dup) | 2 | Vitest + emulator |

**Total: ~63 tests.**

### Observability Stack (3 sinks, trimmed in v6)

- **Frontend errors** - Sentry Browser SDK; 90d retention; alert on any `fatal` → email Tim
- **Backend errors** - Cloud Logging structured JSON; 30d retention; log-based metric `severity>=ERROR` rate >5/5min → email Tim
- **Cost runaway** - GCP Budget Alert at $20 (80% threshold = email Tim) and $40 (100% = Pub/Sub → Cloud Function flips `system/killSwitch.enabled=false` + scales Cloud Run to max-instances=0)

(Dropped in v6: BigQuery billing export, Looker Studio dashboard, Slack `#infra-costs`, PagerDuty webhook, weekly digest, Firestore quota alerts, Storage egress alerts. Re-add if 2-user scale grows.)

### Error/Rescue Table

| # | Failure | Detection | Auto-Rescue | Manual Escalation |
|---|---|---|---|---|
| 1 | Claude rate-limit / 529 during generate | HTTP 529; Sentry tag `generate` | Backoff 2s, 4s, 8s (3 retries); draft `generating_retry`; client polls | After 3 fails: draft `failed`, UI notice; on-call checks Anthropic status |
| 2 | Cloud Run cold start >30s | Cloud Run latency metric >30s; Logging alert | `--min-instances=1` in prod eliminates cold starts | Latency >60s: scale-up triggers; check CPU/mem in Console |
| 3 | Storage upload fails mid-generation | SDK throws; Logging ERROR; Sentry | Retry 2x with fresh signed URL; on final fail, Firestore draft cleaned via transaction | Cleanup-fail alert; hourly orphan check; manual Console deletion |
| 4 | Meta Graph publish 5xx | HTTP 5xx from Graph; `/publish` catches | Retry 3x at 10s with idempotency key; status stays `publishing` | After 3 fails: status `failed`, Sentry tag `meta-publish`; Meta Status check |
| 5 | Cloud Scheduler missed run | Recovery cron query: `scheduledAt < now-10min AND status='scheduled'`, every 5min | Recovery cron re-enqueues; idempotency on `postId` prevents double-publish | Recovery missed too: alert on scheduler `lastAttemptTime` >15min stale; manual trigger |
| 6 | Pattern-extraction LLM invalid JSON | `zod.parse()` throws ZodError | Strip markdown fences, retry parse; if still bad, re-prompt with explicit JSON-only (1 extra call) | After 2 parse fails: save raw with `parse_failed` flag; Sentry; dev reviews prompt |
| 7 | User Anthropic key invalid/revoked | SDK throws `AuthenticationError` 401 | Fail-fast (no retry on 401); response `402` with `key_invalid` | UI redirects to Settings → API Keys; Sentry `key_invalid` (no key value) |
| 8 | Runaway GCP/Firestore spend (Blaze) | GCP budget alert at $20 (80% = email Tim) and $40 (100% = Pub/Sub → Cloud Function) | $20 alert is detection-only (no auto-action). At $40: kill switch auto-flips (`system/killSwitch.enabled = false`) + Cloud Run scaled to `--max-instances 0` | Tim investigates GCP billing dashboard for offending workload, fixes root cause, manually flips `enabled=true` to resume |

---

## Gap Closures: Schema & Operations

### Q2 Schema Reorganization

| Current File (`shared/schemas/*`) | Action | Notes |
|---|---|---|
| `zone.ts` | REWRITE | Drop `rotation`/`locked` (unused in v3); keep `Position`, `StyleOverrides`, `Zone` |
| `slide.ts` | REWRITE | Keep `SlideType`, `BackgroundSettings`, `OverlaySettings`, `Slide`; add Firestore-compatible `id` |
| `post.ts` | REWRITE | Strip `layout_template_id`, `cover_layout_id`, `content_layout_id`, `cta_layout_id`; keep status lifecycle, mode/method refs |
| `brand.ts` | KEEP | Clean, Firestore-compatible as-is |
| `performance.ts` | KEEP | No deps, maps to subcollection |
| `draft.ts` | DELETE | v3 has no draft entity - posts carry status |
| `layout.ts` | DELETE | Layout template system gone |
| `styleType.ts` | DELETE | Typography embedded in zone `styleOverrides` + brand defaults |
| `settings.ts` | REWRITE | Remove `styleTypes`, `layoutTemplates` arrays; keep `BrandIdentitySchema`, `ContentStrategySchema`, `PillarSchema`→`ModeSchema`, `MethodSchema`, `ThemeSchema` |
| `index.ts` | REWRITE | Re-export only surviving schemas |

### Cloudinary Disposition

**Drop entirely.** Sole purpose in v2: hosting temporary public URLs for IG Graph API (which needs internet-accessible image URL). Firebase Storage signed URLs cover this directly - valid long enough for IG container creation + publish (<60s). Remove `cloudinary` npm dep, delete `server/services/cloudinary.ts`, replace call sites in `publish.ts` + `socialClub.ts` with Firebase Storage upload returning signed URL. The `batchDestroy` cleanup pattern stays, swapped for Storage `file.delete()` in same `finally`.

### Staging Environment

**Dropped.** Single prod environment only. Rationale: app is internal-use (Tim + Jule), risk surface is small enough that Kill Switch + Budget Cap + Firebase Hosting preview channels (`firebase hosting:channel:deploy <name>`) cover what staging would have caught. Local dev runs against prod Firebase project (same auth, same data) - acceptable for two trusted users. Re-add staging if user count grows or if writes become irreversible (currently every doc is reversible by Tim's Admin SDK).

### Rollback Procedure (v6: lokal-v2)

If v3 broken within first 48h post-cutover:

1. **Decide.** Trigger: API error rate >10% for 15+ min, or data writes confirmed corrupt. Tim pulls trigger - no "let's see" window.
2. **Stop v3 Cloud Run.** Console → `content-gen` Service min=0, max=0. Prevents writes to v3 Firestore from lingering traffic.
3. **Lokal v2 starten.** Tim und Jule clonen jeweils das alte `content-generation`-Repo (oder behalten den existing local checkout) und führen `npm install && npm run dev` aus. Beide haben Node + alte SQLite-DB lokal.
4. **Notify.** Log timestamp + reason in GitHub issue.

**Pre-Condition:** Beide haben das alte `content-generation`-Repo lokal verfügbar mit funktionierender SQLite. Tim verifiziert das vor Cutover (Jule's local v2 muss Brand+Posts laden können).

**Was verloren geht:** Posts erstellt in v3 zwischen Cutover und Rollback. v3-Firestore-Data syncht nicht zurück nach lokal-v2-SQLite. IG-published Posts bleiben published, aber Data-Record fehlt in lokaler v2-View. Akzeptabel für <48h-Window.

**Latency-Caveat:** Rollback ist nicht <60s wie eine Hosting-Version-Flip wäre — mehr 30-60min wenn Jule offline ist und ihr local v2 erstmal ziehen muss. Akzeptiert für 2-User-internal-use (Tim wählt das 48h-Cutover-Window so dass beide online sind).

**Caveat zu v2-Frontend:** v2 hat keine Firebase-Auth (Single-User-Local). Wenn Rollback feuert, dient `lebenlieben.de` 48h lang eine unauth'd App. Während Rollback-Window keine Public-Links teilen.
