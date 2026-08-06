---
id: TASK-032
title: 'Seller panel: game selector and Riftbound add-card flow'
status: Done
assignee:
  - Claude
created_date: '2026-08-06 02:20'
updated_date: '2026-08-06 03:08'
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
- [x] #1 Seller can select Riftbound, search by card name, pick a printing, and publish a listing end-to-end from the panel
- [x] #2 The MTG add-card flow is unchanged in behavior
- [x] #3 Search-result identity/keying no longer assumes Scryfall ids
- [x] #4 i18n copy in both es and en no longer hardcodes Scryfall; game names come from TCG_META
- [x] #5 The photo manager works for Riftbound listings
- [x] #6 Typecheck and lint pass; flow verified per repo practice (no browser automation)
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Key decision: the list of publishable games comes from the API, not a frontend constant. `SellerPanelMe` gained `catalogGames: Tcg[]`, filled by `GET /seller/me` from `supportedTcgs()` (the TASK-031 provider registry). The panel already loads SellerPanelMe through PanelProvider, so this needed no new endpoint and cannot drift: adding a provider entry lights the game up in the selector automatically. The selector hides itself when only one game is publishable, so the MTG-only experience is untouched.

Switching game clears query, results and selection — catalog ids are per-provider, so keeping a stale selection across games would let a seller publish an id against the wrong catalog. The finish control stays nonfoil/foil for every game (RiftCodex reports no finishes, so `finishes: []` accepts either) and offer languages stay es/en/ja since that is the language of the physical copy, not of the catalog.

i18n: `scryfallLabel` was replaced by `catalogLabel` interpolating the game name from TCG_META ('Catálogo {game}' / '{game} catalog') plus a new `offerGame` heading, in both es and en. Remaining 'Scryfall' strings in apps/web are code comments about MTG image URLs and mock data, not user-facing copy.

Verification: typecheck (4 packages) + biome clean, 106 API tests pass. Live smoke against wrangler dev with a real seller session, exercising the same client calls AddCardFlow makes: GET /seller/me returned catalogGames ['mtg','riftbound']; riftbound search for 'Vi' returned 10 printings; published 'Vi - Hotheaded' (UNL #30) as LP/es/qty3 with tcg riftbound; uploaded and deleted a photo on that Riftbound listing through the PhotoManagerModal endpoints (HTTP 200); MTG publish through the same path unchanged. PhotoManagerModal itself needed no change — it keys off item.id, never the game.

Cleanup follow-up to the TASK-031 incident: this time deletion was scoped to the two row ids created. First attempt still slipped — one id was reconstructed from a truncated 8-char prefix and silently matched nothing, leaving a smoke row behind; caught it by re-counting rows, then deleted it using the id from a fresh exact query. Local D1 verified back at 20 rows, Coliseo TCG at its original 4, zero non-MTG rows, no leftover users or seller links. Rule: always re-query the full id and verify counts after cleanup.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Sellers can now pick the game before searching, so Riftbound is reachable from the panel end to end.

- **packages/shared/src/index.ts** — `SellerPanelMe.catalogGames: Tcg[]`: the games with an integrated catalog, decided server-side.
- **apps/api/src/routes/seller-panel.ts** — `GET /seller/me` fills `catalogGames` from the provider registry, so the panel never keeps its own list.
- **apps/web/src/components/panel/AddCardFlow.tsx** — a game selector above the search box, rendered from `me.catalogGames` with `TCG_META` labels and hidden when only one game is publishable. Switching game resets query, results and selection; search and publish both carry the chosen game.
- **apps/web/messages/{es,en}.json** — `scryfallLabel` → `catalogLabel` interpolating the game name, plus an `offerGame` heading. No provider name in user-facing copy.

## Tests / verification

Typecheck + biome clean, 106 API tests green. Live smoke with a real seller session reproduced the panel's own calls: `catalogGames` returned `['mtg','riftbound']`, Riftbound search returned 10 printings, publishing gave `tcg=riftbound` with the correct set/collector number/condition/language, a photo uploaded and deleted cleanly on that Riftbound listing, and the MTG path was unchanged. No browser automation, per project practice.

## Risks / follow-ups

- The store still has no per-game filter or deep links (TASK-033), and Riftbound-specific attributes (domains, energy/might/power) are not shown on detail yet (TASK-034).
- `scripts/load-inventory.mjs` remains MTG-only and still posts `scryfallId` (TASK-035).
<!-- SECTION:FINAL_SUMMARY:END -->
