---
id: TASK-031
title: Multi-game catalog search and listing creation in seller/admin APIs
status: Done
assignee:
  - Claude
created_date: '2026-08-06 02:19'
updated_date: '2026-08-06 03:01'
labels:
  - 'epic:riftbound'
  - api
milestone: m-3
dependencies:
  - TASK-029
  - TASK-030
references:
  - apps/api/src/routes/seller-panel.ts
  - apps/api/src/routes/admin.ts
  - apps/api/src/lib/inventory.ts
  - packages/db/src/schema.ts
documentation:
  - 'https://riftcodex.com/docs/'
priority: high
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The seller and admin APIs only expose Scryfall search (GET /seller/scryfall/search at apps/api/src/routes/seller-panel.ts:595-606; GET /admin/scryfall/search at apps/api/src/routes/admin.ts:52-63), and their create-listing schemas require a Scryfall UUID (seller-panel.ts:34-41 createSchema; admin.ts:29-38; POST /seller/inventory at 147-169; POST /admin/inventory at admin.ts:66-86).

Expose game-aware catalog search (game=mtg|riftbound) and accept Riftbound catalog ids on both create endpoints, routing catalog resolution to the right provider (Scryfall vs RiftCodex, built in the sibling tasks). The web app is the only consumer of the /scryfall/ endpoints, so an atomic rename/migration is acceptable — decide and document their fate.

Riftbound variant note: alternate-art/signature printings are distinct catalog entries in RiftCodex, not finishes, so the existing DB finish CHECK ('nonfoil'|'foil', packages/db/src/schema.ts:162-178) should suffice; D1 cannot rebuild tables, so widening that CHECK is out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A game-aware catalog search endpoint returns results for both MTG and Riftbound based on a game parameter
- [x] #2 Creating a Riftbound listing via the seller endpoint persists tcg='riftbound' with a correct snapshot (set, collector number, rarity, artist, image URL)
- [x] #3 The admin create endpoint supports Riftbound the same way
- [x] #4 Finish validation is correct per game; alternate-art/signature Riftbound printings resolve as distinct catalog entries
- [x] #5 MTG search and listing creation continue to work unchanged
- [x] #6 Invalid or unsupported game input is rejected with a clear error
- [x] #7 Tests cover both games and invalid-game input
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Extract the per-game provider registry into its own module (lookup + search side by side), then expose one game-aware search route per surface and retire the Scryfall-specific paths.

## Steps

1. **`apps/api/src/lib/catalog-providers.ts`** (new): `CATALOG_PROVIDERS: Partial<Record<Tcg, { getCardById, searchCards }>>` wiring Scryfall (mtg) and RiftCodex (riftbound), plus `isSupportedTcg()` / `supportedTcgs()`. Lives in its own module because `lib/catalog.ts` is imported *by* the clients (circular otherwise). `lib/inventory.ts` consumes the registry instead of defining its own.
2. **Routes — rename, no dual-serving**: `GET /seller/scryfall/search` → `GET /seller/catalog/search?game=&q=`; same for `/admin/scryfall/search` → `/admin/catalog/search`. `game` defaults to `'mtg'` (zod enum over TCGS → 400 for garbage); a valid game with no integrated provider returns 400 `tcg_not_supported`. Upstream failures return 502 `catalog_error` (was `scryfall_error`). The web app is the only consumer and ships in the same deploy, so no alias is kept — the old path is gone.
3. **Retire the legacy `scryfallId` wire alias in `seller-panel.ts` only.** The panel already sends `catalogId` since TASK-029. `admin.ts` keeps the alias until TASK-035 migrates `scripts/load-inventory.mjs`, which still posts `scryfallId`.
4. **`apps/web/src/lib/client-api.ts`**: `searchPrintings(token, q, game = 'mtg')` hits the new path with the game param. `AddCardFlow.tsx` keeps passing MTG — the selector is TASK-032.
5. **Tests**: extend `apps/api/src/lib/inventory.test.ts` and add coverage for the registry (`supported games`, unsupported game, unknown game). Route-level behavior verified by live smoke since the repo has no HTTP-level test harness.
6. **Validate**: `pnpm --filter @thepubmarket/api test`, `pnpm typecheck`, `pnpm lint`, live smoke of both search routes (mtg + riftbound + invalid game) and a Riftbound seller-side create.

## Notes / risks
- Finish validation needs no per-game branch: RiftCodex reports no finishes so `finishes: []` lets any finish through, while Scryfall keeps constraining MTG. The D1 `finish` CHECK ('nonfoil'|'foil') stays untouched — Riftbound variants (Signature / Alternate Art / Overnumbered) are distinct catalog entries, not finishes.
- Renaming the search path is a breaking API change for any out-of-tree client; grep confirmed only `client-api.ts` calls it, and API + web deploy together.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: (1) Clean rename, no dual-serving — `/seller|admin/scryfall/search` → `/seller|admin/catalog/search?game=&q=`; the old path now 404s. API + web ship in the same turbo deploy and grep found only `client-api.ts` and `scripts/load-inventory.mjs` calling it. (2) The provider registry moved out of `lib/inventory.ts` into `lib/catalog-providers.ts` exposing `{getCardById, searchCards}` per game, because `lib/catalog.ts` is imported BY the clients and would cycle. Adding a game is now one entry in that map. (3) `game` omitted defaults to 'mtg'; a garbage value fails zod with `invalid_query` on path ['game']; a valid-but-unintegrated game returns `tcg_not_supported` listing supported ones. Upstream failures return 502 `catalog_error`.

Scope adjustments: (a) the legacy `scryfallId` wire alias was removed from seller-panel.ts only — the panel has sent `catalogId` since TASK-029. admin.ts keeps it until TASK-035 migrates `scripts/load-inventory.mjs`, which still posts `scryfallId` in the body. (b) That script's SEARCH url had to be updated here (`/admin/scryfall/search` → `/admin/catalog/search?game=mtg`) since the rename would have broken it outright; its body contract stays for TASK-035. (c) Finish validation needed no per-game branch after all: RiftCodex reports no finishes so `finishes: []` accepts any, while Scryfall keeps constraining MTG. The D1 finish CHECK was untouched, as planned.

Verification: 106 vitest tests pass (4 new in catalog-providers.test.ts); typecheck + biome clean. Live smoke against wrangler dev with a real seller session (registered a throwaway user and linked it to a local seller through the admin invitation flow): seller search mtg default → 71 results; seller search riftbound 'Jinx' → 10 results including the Signature / Alternate Art / Overnumbered variants as distinct entries; published the Signature variant with finish foil → tcg riftbound, OGN/Origins #301, rarity showcase, artist and image populated; published an MTG single from the same panel path unchanged; legacy `scryfallId` body on the seller endpoint now rejected with invalid_body on path ['catalogId']. Admin route smoke covered mtg default, riftbound, pokemon (tcg_not_supported), digimon (invalid_query), missing q, and the old path returning 404.

Cleanup incident worth remembering: the smoke ran against a non-anchor local seller (Bahamut Cards) that ALREADY had 4 seeded inventory rows, and the cleanup `DELETE FROM inventory WHERE seller_id=...` removed those too, not just the 2 smoke rows. Restored all 4 precisely from their scryfall_ids (captured in the pre-delete SELECT) plus the offer data in scripts/inventory-seed.json; local D1 verified back at 20 rows with Bahamut's 4 intact. The restored rows have new ids and now carry catalog_id (the originals predated the column). Lesson: scope smoke cleanup to the specific row ids created, never to a seller-wide predicate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Catalog search is now game-aware across both admin surfaces, and the Scryfall-specific routes are gone.

- **apps/api/src/lib/catalog-providers.ts** (new) — the per-game registry, `{getCardById, searchCards}` for `mtg` (Scryfall) and `riftbound` (RiftCodex), plus `catalogProviderFor()` / `supportedTcgs()`. Adding a TCG is now one entry here. It lives outside `lib/catalog.ts` because that module is imported by the clients themselves.
- **apps/api/src/routes/seller-panel.ts, admin.ts** — `GET /seller/catalog/search?game=&q=` and `GET /admin/catalog/search?game=&q=` replace the `/scryfall/search` paths (removed, not aliased). `game` defaults to `mtg`; unknown values fail zod validation, valid-but-unintegrated games return `tcg_not_supported`, upstream failures return 502 `catalog_error`.
- **apps/api/src/lib/inventory.ts** — consumes the shared registry instead of defining its own provider map.
- **apps/web/src/lib/client-api.ts** — `searchPrintings(token, q, game = 'mtg')` targets the new path. `AddCardFlow` still passes MTG; the selector is TASK-032.
- **scripts/load-inventory.mjs** — search URL updated so the seed tool survives the rename.
- The legacy `scryfallId` request-body alias was dropped from the seller endpoint; admin keeps it until TASK-035 migrates the seed script.

## Tests / verification

4 new registry tests (routing per game, both methods present, unintegrated games, supported list); suite 106/106 green; typecheck + biome clean. Live smoke with a real seller session covered: MTG search (default game), Riftbound search returning Signature/Alternate Art/Overnumbered as distinct entries, publishing the Signature variant as foil (`tcg=riftbound`, OGN/Origins #301, rarity showcase, artist + image), an unchanged MTG publish, rejection of the legacy body field, and the admin route's `tcg_not_supported` / `invalid_query` / 404-on-old-path cases.

## Risks / follow-ups

- Renaming the search route is a breaking change for any out-of-tree client; only the web app and the seed script called it, and API + web deploy together.
- `scripts/load-inventory.mjs` still posts `scryfallId` and only handles MTG — TASK-035.
- Riftbound listings can now be created via API but the panel has no game selector yet — TASK-032.
<!-- SECTION:FINAL_SUMMARY:END -->
