# Plan: IG-Feed-Sync

**Status**: APPROVED_WITH_FIXES (CEO + Eng review done, ready to implement)
**Mode**: HOLD SCOPE
**Approach**: A - Unified `posts` collection mit `source` discriminator
**Reviews**: plan-ceo-review (HOLD), plan-eng-review (APPROVE_WITH_FIXES)
**Last updated**: 2026-05-06

---

## Goal

Alle IG-Posts eines verbundenen Accounts im History-Tab sichtbar machen, nicht nur Tool-publizierte. Voraussetzung für Phase 4c (Auto-Performance-Learning) das einen vollstaendigen Datensatz braucht statt Selection-Bias auf Tool-Slice.

## Context

Heute (Phase 4b live, rev 00021-9r9):
- `server/functions/igStatsSync.ts` laeuft 6h-Cron, queriet `collectionGroup posts WHERE status==published AND igMediaId!=null`, fetcht Insights.
- Posts ohne `igMediaId` (= organisch in IG erstellt) sind nicht in Firestore.
- HistoryTab `web/src/routes/posts/HistoryTab.tsx:198` zeigt "Stats noch nicht synchronisiert".
- Brand `igUserId` already per-Brand (Settings/Instagram-Tab).

User-Erwartung: alle IG-Posts (organisch + Tool) im History-Tab.

## Approach (locked)

Neue Cloud Function `igFeedSync` schreibt organische IG-Posts in dieselbe `posts`-Subcollection wie Tool-Posts, unterscheidet via `source` field. Existing `igStatsSync` greift automatisch (queriet bereits `igMediaId!=null`).

Aus 3 evaluierten Approaches gewaehlt:
- A (gewaehlt): unified posts mit source discriminator
- B verworfen: separate igFeed subcollection - doppelte Queries fuer immer
- C verworfen: live-fetch ohne Storage - Phase 4c hard-blocked

## Schema

```
shared/schemas/post.ts:
  + source: z.enum(['tool', 'ig-native']).default('tool')
  // FLAT schema, NICHT discriminatedUnion (default-on-discriminator nicht supported)
  // slides/aiSnapshot/editStats bleiben optional (already)
  + mediaType: z.enum(['IMAGE','CAROUSEL_ALBUM','REELS']).optional()
  + igPermalink: z.string().nullable().optional()
  + thumbnailUrl: z.string().optional()
  + mediaUrl: z.string().optional()
  + syncedAt: Timestamp.optional()

shared/schemas/igStats.ts:
  + plays: z.number().nullable().optional()      // Reels
  + videoViews: z.number().nullable().optional() // Reels
  + shares: z.number().nullable().optional()     // Reels

shared/lib/postTypeGuards.ts (NEW):
  isToolPost(p: Post): p is ToolPost  -> p.source === 'tool'
  isIgNativePost(p: Post): p is IgNativePost -> p.source === 'ig-native'
```

## Architecture

```
SCHEDULED CRON (6h)
  igFeedSync
    for each uid:
      for each brand with igUserId + token:
        ├─ GET /{ig-user-id}/media?fields=id,media_type,caption,
        │     permalink,media_url,thumbnail_url,timestamp,children
        │     paging.next loop until 200 items or end
        ├─ [code 190] -> status_doc: token_expired, EXIT brand
        ├─ [code 4]   -> status_doc: rate_limited,  EXIT brand
        ├─ [missing igUserId] -> status_doc: not_configured, skip
        ├─ [Zod parse fail]   -> status_doc: parse_error, full bail
        │
        └─ for each item:
            media_type == STORY?  -> skip (24h-life, not historical)
            tx.get existing doc:
              source=='tool' present? -> skip (tool wins)
              else -> set merge users/{uid}/brands/{bid}/posts/{mediaId}:
                { source:'ig-native',
                  status:'published',           ← REQUIRED for igStatsSync to pick up
                  igMediaId, igPermalink, caption,
                  mediaUrl, thumbnailUrl, mediaType,
                  publishedAt, syncedAt }
        │
        └─ write users/{uid}/brands/{bid}/igFeedSyncStatus:
            { lastSync, itemCount, status, tokenExpiresInDays, error? }

SCHEDULED CRON (6h)
  igStatsSync (existing) - picks up new docs unchanged
    [EDIT] media_type-aware metric routing:
      REELS  -> plays,video_views,shares,comments_count,saved
      IMAGE  -> reach,impressions,likes_count,comments_count,saved
      CAROUSEL_ALBUM -> reach,impressions,likes_count,comments_count,saved
```

### Status-Doc state machine

```
brand has igUserId+token?
  /                     \
NO                     YES
 |                      |
not_configured     run feed fetch
                        |
              fetch OK / parse OK?
              /     \      \
            OK    code 190  code 4   parse fail   firestore err
             |       |        |          |           |
            ok  token_expired rate_limited  parse_error  error
```

States: `not_configured | syncing | ok | token_expired | rate_limited | parse_error | error`

## File Plan

### NEW

| File | Purpose |
|---|---|
| `server/functions/igFeedSync.ts` | Scheduled function, 6h cron, region eu-west1 |
| `server/functions/graphApi.ts` | **Co-located** in functions/ (NICHT lib/, tsconfig boundary). Shared Graph-API helpers: fetchMetaJson, isTokenExpiredError, isRateLimitError, parseMediaType, tokenExpiresInDays (decode JWT exp claim) |
| `shared/lib/postTypeGuards.ts` | isToolPost, isIgNativePost |

### EDIT

| File | Change |
|---|---|
| `shared/schemas/post.ts` | Flat `source` + Reels-fields, no discriminatedUnion |
| `shared/schemas/igStats.ts` | plays/videoViews/shares optional fields |
| `shared/lib/stats.ts` | `aggregateBy` filter `isToolPost` so ig-native nicht in 'unknown'-method-bucket |
| `shared/lib/engagement.ts` (or stats.ts) | media-type-aware engagementRate: Reels uses plays-based formula |
| `server/functions/igStatsSync.ts` | media_type-aware metric query (`metricsForType()`); read mediaType field |
| `server/functions/index.ts` | Export `igFeedSync` |
| `firestore.rules` | `igFeedSyncStatus` subcollection rule (read-owner, write-server-only) |
| `firestore.indexes.json` | Add `posts collection-group: status ASC + igMediaId ASC` (pre-existing gap, fix while we're here) |
| `web/src/routes/posts/HistoryTab.tsx` | `thumb()` reads `mediaUrl/thumbnailUrl` for ig-native; small IG-badge; no editor link for ig-native |
| `web/src/routes/settings/InstagramPage.tsx` | Read `igFeedSyncStatus`, render banner: token_expired (red), tokenExpiresInDays<7 (amber), rate_limited (yellow) |
| `web/src/components/dashboard/TopPerformer.tsx` | Conditional: ig-native -> external link to `igPermalink`, tool -> `/editor/{id}` |
| `web/src/components/dashboard/RecentPosts.tsx` | Same conditional |
| `web/src/components/dashboard/MethodAggregate.tsx` | Filter `isToolPost(p)` before bucketing |

### Eng-review-confirmed call-site audit

Grep `to.*editor` AND `navigate.*editor` across `web/src/` und alle `/editor/{id}`-Konsumenten ig-native-guard hinzufuegen. Mindestens TopPerformer + RecentPosts confirmed; weitere moeglich.

### Tests

`server/functions/__tests__/igFeedSync.test.ts` (Vitest + nock + admin-SDK gegen emulator, NICHT @firebase/rules-unit-testing):

| # | Case |
|---|---|
| 1 | happy-path-paginate (2 pages, 5 items, status_doc ok) |
| 2 | token-190 (status_doc=token_expired, no posts written) |
| 3 | rate-limit-4 (status_doc=rate_limited) |
| 4 | malformed-paging (no infinite-loop, status_doc ok with partial) |
| 5 | missing-timestamp (Zod fallback or skip, no crash) |
| 6 | source-collision (existing source='tool' not overwritten) |
| 7 | story-skip (media_type=STORY -> skip) |
| 8 | carousel-passthrough (CAROUSEL_ALBUM doc written) |
| 9 | reels-metric-routing (igStatsSync calls /insights?metric=plays,video_views,...) |
| 10 | status-doc-write-on-error (Firestore-write throw -> status_doc=error) |
| 11 | initial-sync-200-limit (250 items -> stops at 200) |

## Critical Gaps (5 BLOCKERS from eng-review)

1. **tsconfig boundary**: `server/functions/` rootDir='.' include=['*.ts']. `graphApi.ts` MUSS in `server/functions/graphApi.ts`, NICHT `server/lib/`. Sonst TS6059 build-failure.

2. **igFeedSync schreibt `status: 'published'`** auf jedem ig-native doc. Ohne das greift igStatsSync-Query (`WHERE status==published`) nicht.

3. **Reels-Metrics-Schema-Erweiterung** + media-type-aware `engagementRate()`. Sonst Dashboard dark fuer Reels-Posts. Required vor Implementation.

4. **Flat schema + type guards**, NICHT Zod discriminatedUnion. discriminatedUnion default-on-discriminator nicht supported, bricht beim Read auf existing posts ohne `source`-Field.

5. **`/editor/{id}` call-site audit** ueber gesamtes `web/src/`, nicht nur die 2 sichtbaren Dashboard-Komponenten. Sonst crashed Editor wenn jemand auf ig-native klickt.

### Plus pre-existing bug (mit-fixen)

- `firestore.indexes.json` fehlt `status+igMediaId` composite index fuer existing `igStatsSync`-Query. Funktioniert heute nur weil <50 posts. Mit-deployen.

## Edge Cases

| Case | Handling |
|---|---|
| Brand ohne igUserId/Token | Status-doc `not_configured`, Cloud-Function logged + skipped |
| Brand mit 5000 historischen Posts | Initial-Sync limit 200, dann incremental via `since=lastSyncedAt` |
| Post in IG geloescht | Tombstone: bei naechstem Sync `igDeletedAt` markieren, NICHT Firestore-doc loeschen (engagement_rate-Historie bleibt) |
| Carousel children | Top-Level reicht, children nur on-demand spaeter |
| Stories (24h life) | filter `media_type !== STORY` |
| User wechselt IG-Account auf Brand | igUserId neu, alte Posts stay orphan - known limitation Phase 1 |
| Concurrent Tool-publish + Feed-sync auf demselben mediaId | First-write-wins: tx.get -> set if absent OR source=='ig-native' overwrite ok, source=='tool' protect |
| 200 ig-native Posts initial backfill | igStatsSync `MAX_PER_RUN=50` -> volle Stats-Coverage erst nach ~24h (4 ticks). UX-Hinweis im Status-Banner |

## Failure Modes Registry

| Codepath | Failure | Rescue | User sees |
|---|---|---|---|
| Feed-Fetch | Token 190 (60d expiry) | status-doc + Settings-Banner | red banner "Token abgelaufen" |
| Feed-Fetch | RateLimit 4 (200/h) | status-doc, next 6h tick recovers | yellow banner |
| Feed-Fetch | Network timeout | retry 2x 5s/15s, then bail | next tick recovers |
| Feed-Paginate | Malformed `paging.next` | full-bail, status-doc=parse_error | parse_error in banner |
| Per-Item | Missing timestamp | Zod fallback or skip + log | one item missing |
| Per-Item | Source-collision (tool exists) | first-write-wins protect | tool-post stays |
| Per-Item | media_type=STORY | filter | not synced (correct) |
| Per-Item | Reels metric mismatch in igStatsSync | media-type routing | correct metrics |

## Deploy

```
1. Schema deploy (frontend + server tsc compile)
   shared/schemas/post.ts: + source, mediaType, igPermalink, etc. (additive)
   shared/schemas/igStats.ts: + plays, videoViews, shares (optional)

2. Firestore rules + indexes:
   firebase deploy --only firestore:rules,firestore:indexes
   - igFeedSyncStatus subcollection rule
   - posts collection-group: status+igMediaId composite index
   (Index baut async ~Minuten, igStatsSync may fail-precondition during build)

3. Frontend deploy:
   pnpm build:web && firebase deploy --only hosting
   - HistoryTab source-aware
   - InstagramPage banner
   - Dashboard widget guards

4. Cloud Functions deploy:
   firebase deploy --only functions
   - igFeedSync new
   - igStatsSync media-type-aware
   First igFeedSync run: ~Minute nach Deploy
   First igStatsSync after that: 6h, picks up new docs

5. Smoke: Tim + Jule verify HistoryTab zeigt organische Posts nach 1. Cron-Run
```

### Rollback

- Step 1-2 schema/index: harmless, additive
- Step 3 frontend: revert via `firebase hosting:rollback`, ig-native posts stay in DB but render correctly with old code (haben caption, igPermalink, fallback-pfade greifen)
- Step 4 functions: `firebase functions:delete igFeedSync`, ig-native posts in DB harmless (nicht-mutating)

Risk: LOW. Alles additiv, kein Migration-Pfad in beide Richtungen.

## Implementation hours

| Hour | Work |
|---|---|
| H1 | graphApi.ts + igFeedSync skeleton + status-doc, schema source-field + Reels-fields, indexes/rules |
| H2 | igFeedSync feed-fetch loop + paginate + source-collision tx + story-skip, igStatsSync Reels routing |
| H3 | usePublishedPosts/HistoryTab source-aware, InstagramPage banner, dashboard widget guards |
| H4 | Vitest + nock fixtures fuer alle 11 cases |
| H5 | Deploy sequence + smoke verify |
| H6 | Polish: tokenExpiresInDays banner copy, engagement-formula Reels, edge fixes |

CC + gstack: ~6h compressed. Single dev: ~2-3 Tage.

## TODOs (deferred, post-implementation)

- Token-Storage via KMS migrieren (Brand-scoped Token = Multi-Brand-Plan; aber unabhaengig wenn der nicht zuerst kommt)
- Smart-Reconciliation: organic post matched offen Tool-Draft, "claim"-Flow
- Cross-Brand-Insights-Vergleich (wenn 2+ Brands)
- IG-Feed Backlog jenseits 200 Posts (incremental tail)
- 200-Backfill Stats-Latency UX-Hinweis im Settings/Instagram-Banner

## Out of scope

- IG Stories analytics (24h-life, kein historischer Wert)
- Carousel-Children-Insights (Top-Level reicht)
- IG-Account-Switch auf existing Brand (orphan posts)
- Cross-Account-Analytics (per-Brand reicht)
- Reverse-Sync: Tool-Edits in IG zurueckschreiben (IG API unterstuetzt das nicht ausser direkt nach Posting)

## References

- Existing igStatsSync: `server/functions/igStatsSync.ts`
- HistoryTab consumer: `web/src/routes/posts/HistoryTab.tsx:198`
- Brand schema: `shared/schemas/brand.ts:55` (`instagramUserId`)
- Phase 4b deploy notes: `STATE.md` Phase 4b deploy quirks (2026-05-03)
