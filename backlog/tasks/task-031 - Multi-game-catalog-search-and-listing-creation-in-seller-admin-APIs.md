---
id: TASK-031
title: Multi-game catalog search and listing creation in seller/admin APIs
status: In Progress
assignee:
  - Claude
created_date: '2026-08-06 02:19'
updated_date: '2026-08-06 02:53'
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
- [ ] #1 A game-aware catalog search endpoint returns results for both MTG and Riftbound based on a game parameter
- [ ] #2 Creating a Riftbound listing via the seller endpoint persists tcg='riftbound' with a correct snapshot (set, collector number, rarity, artist, image URL)
- [ ] #3 The admin create endpoint supports Riftbound the same way
- [ ] #4 Finish validation is correct per game; alternate-art/signature Riftbound printings resolve as distinct catalog entries
- [ ] #5 MTG search and listing creation continue to work unchanged
- [ ] #6 Invalid or unsupported game input is rejected with a clear error
- [ ] #7 Tests cover both games and invalid-game input
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
