---
id: TASK-032
title: 'Seller panel: game selector and Riftbound add-card flow'
status: In Progress
assignee:
  - Claude
created_date: '2026-08-06 02:20'
updated_date: '2026-08-06 03:04'
labels:
  - 'epic:riftbound'
  - web
milestone: m-3
dependencies:
  - TASK-031
references:
  - apps/web/src/components/panel/AddCardFlow.tsx
  - apps/web/src/lib/client-api.ts
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - apps/web/src/lib/catalog/display.ts
  - apps/web/src/components/panel/PhotoManagerModal.tsx
priority: high
type: feature
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The seller panel's add-card flow (apps/web/src/app/[locale]/panel/agregar/page.tsx → apps/web/src/components/panel/AddCardFlow.tsx, steps search → detail → success) has no game selector, keys search results and selection on `scryfallId` (lines 91-97, 186, 388), and its i18n copy literally says "Scryfall catalog" (apps/web/messages/es.json:404, en.json:404). The client API layer (apps/web/src/lib/client-api.ts: searchPrintings 211-217, createListing 122-134) targets the Scryfall-only endpoints.

Sellers must be able to choose the game (MTG or Riftbound), search the Riftbound catalog, pick a printing, and publish a Riftbound listing with condition/finish/language/price/quantity — then manage photos exactly as today (PhotoManagerModal). Game display names come from TCG_META (apps/web/src/lib/catalog/display.ts).

This consumes the multi-game API contract from the sibling task "Multi-game catalog search and listing creation in seller/admin APIs".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Seller can select Riftbound, search by card name, pick a printing, and publish a listing end-to-end from the panel
- [ ] #2 The MTG add-card flow is unchanged in behavior
- [ ] #3 Search-result identity/keying no longer assumes Scryfall ids
- [ ] #4 i18n copy in both es and en no longer hardcodes Scryfall; game names come from TCG_META
- [ ] #5 The photo manager works for Riftbound listings
- [ ] #6 Typecheck and lint pass; flow verified per repo practice (no browser automation)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Add a game selector as the first control of the search step, driven by the list of publishable games the API already knows — not a hardcoded frontend list.

## Steps

1. **Source of truth for publishable games**: extend `SellerPanelMe` (`packages/shared/src/index.ts`) with `catalogGames: Tcg[]` and have `GET /seller/me` (`apps/api/src/routes/seller-panel.ts`) fill it from `supportedTcgs()` (the provider registry from TASK-031). The panel already loads `SellerPanelMe` through `PanelProvider`/`usePanel`, so no new endpoint and no drift when a game is added — one registry entry lights it up in the UI.
2. **`AddCardFlow.tsx`**: `game` state defaulting to `'mtg'`; a segmented selector above the search box rendered from `me.catalogGames` with labels from `TCG_META` (hidden when only one game is publishable). Switching game clears query, results and selection. `searchPrintings(token, q, game)` and `createListing({ tcg: game, ... })`. Search-result keying already uses `catalogId` (TASK-029).
3. **i18n** (`apps/web/messages/{es,en}.json`): replace `scryfallLabel` with `catalogLabel` interpolating the game name (`Catálogo {game}` / `{game} catalog`) and add `offerGame` for the selector heading. No provider name hardcoded in copy.
4. **Photo manager**: verify it needs no change — `PhotoManagerModal` keys off the created listing's id, not the game.
5. **Validate**: `pnpm typecheck`, `pnpm lint`, `pnpm --filter @thepubmarket/api test`, plus a live smoke of `GET /seller/me` returning `catalogGames` and a Riftbound publish through the same client path the panel uses (no browser automation, per project practice).

## Notes
- Finish stays a two-button nonfoil/foil control for every game: RiftCodex reports no finishes, so `finishes: []` accepts either, and Riftbound variants (Signature / Alternate Art / Overnumbered) are distinct catalog entries already disambiguated in the card name.
- Offer languages stay `es/en/ja` — that is the language of the physical copy the seller owns, independent of the catalog's language.
<!-- SECTION:PLAN:END -->
