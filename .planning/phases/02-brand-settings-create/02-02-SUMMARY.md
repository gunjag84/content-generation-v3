# Plan 02-02 Summary

**Status:** Complete (Path A, emulators only; KMS replaced with base64 dev stub when `FIRESTORE_EMULATOR_HOST` is set).

## Files created
- Prompts: `server/prompts/base.md`, `output-format.md`, `product.md`,
  `methods/{story,liste,vorher-nachher}-{5,7,9,10}.md` (12 files, verbatim from v2),
  `modes/{create-demand,convert-demand}.md` (renamed from v2 p1/p2 with body Pillar→Mode renames).
- `server/lib/methodResolution.ts` - TEMPLATE_COUNTS + closestTemplateCount nearest-neighbor.
- `server/lib/anthropic.ts` - `makeAnthropicClient`, `ANTHROPIC_MODEL = 'claude-opus-4-7'`.
- `server/lib/getAnthropicKey.ts` - env in emulator, KMS in prod.
- `server/lib/assembleSystemPrompt.ts` - 5-layer assembly (output-format + base + product + methods + modes), joined with `\n\n---\n\n`. Filters: stripProductForCreateDemand, stripMethodStructureForConvertDemand, filterModeByMethod.
- `server/lib/zitatShortcircuit.ts` - hard-coded `ZITAT_CAPTIONS`, deterministic-hash caption pick, single text slide. No Anthropic call.
- `server/lib/createDraftPost.ts` - server-authored post with immutable `aiSnapshot`.
- `server/routes/generate.ts` - POST `/api/generate` NDJSON handler (`Content-Type: application/x-ndjson; charset=utf-8`), AbortController wired to `req.on('close')`.
- `shared/schemas/{generateRequest,post}.ts`.
- `shared/types/slide.ts` (canonical types ported from v2).
- `shared/lib/parseSlidesMd.ts`.

## NDJSON event shapes
- `{type:'chunk',text:string}`
- `{type:'complete',postId:string,slides:SocialSlide[],caption:string}`
- `{type:'error',error:string}`

## Verification
- `pnpm typecheck` (server) clean.
- Anthropic SDK 0.32.1 stable: `system` is plain string (no `cache_control` - that lives on beta types only).

## Deviations from PLAN
- `cache_control: ephemeral` removed from system message (SDK 0.32.1 stable doesn't expose it on `TextBlockParam`); switched `system` from array form to plain string. Caching strategy revisits when SDK adds the type, or when we move to the beta endpoint.
