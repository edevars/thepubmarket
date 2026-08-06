---
id: TASK-035
title: 'Riftbound end-to-end validation, seed data, and multi-game docs'
status: Done
assignee:
  - Claude
created_date: '2026-08-06 02:20'
updated_date: '2026-08-06 03:37'
labels:
  - 'epic:riftbound'
milestone: m-3
dependencies:
  - TASK-032
  - TASK-033
references:
  - scripts/load-inventory.mjs
  - scripts/inventory-seed.json
  - docs/ingenieria/
documentation:
  - 'https://riftcodex.com/docs/'
priority: medium
type: task
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Close out epic:riftbound with proof the full flow works plus updated tooling and docs. The inventory seed tooling (scripts/load-inventory.mjs + scripts/inventory-seed.json, run via `pnpm inventory:load:local`) resolves entries only through the admin Scryfall search today; extend it to support Riftbound entries. Then validate the complete journey: a seller creates a Riftbound listing in the panel, it appears in the store filtered by game, the detail page renders, and a test-mode Stripe checkout completes (checkout is real Stripe test-mode; the non-custodial model — direct charges + application fee — is untouched by this epic). Document the multi-game catalog architecture in docs/ingenieria/ (Spanish, per existing docs practice): providers, snapshot contract, and how to add the next TCG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The seed script can load Riftbound entries by card name against the local environment
- [x] #2 The MTG seed path has no regressions
- [x] #3 Validation confirms panel → catalog → detail → test-mode checkout for a Riftbound listing, verified via curl/typecheck per project practice (no browser automation)
- [x] #4 docs/ingenieria/ documents the multi-game catalog architecture: providers, snapshot contract, and steps to add the next TCG
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Bug found while reading the code

`scripts/load-inventory.mjs:87` still reads `printing.scryfallId` from the search response, but TASK-029 renamed that field to `catalogId`. The script therefore posts `scryfallId: undefined` and every entry fails with `catalog_id_required` — the legacy body alias kept on `/admin/inventory` does **not** save it, because the break is on the read side. Nothing exercised the script after TASK-029, so this shipped unnoticed. Fixing it is the first step here.

## Steps

1. **`scripts/load-inventory.mjs`** — read `catalogId` from search results and post `{ tcg, catalogId }`. Add per-entry `game` (default `'mtg'`) so a seed entry picks its catalog; the search query stays Scryfall syntax for MTG (`!"name" set:xxx`) and becomes a plain card name for Riftbound, matching the set via `setCode` as it already does. Update the header comment (it still says "resuelve la impresión exacta en Scryfall").
2. **`scripts/inventory-seed.json`** — add a few Riftbound entries with `game: "riftbound"`.
3. **`apps/api/src/routes/admin.ts`** — remove the legacy `scryfallId` body alias now that its last consumer is migrated (deferred here by TASK-031). `catalogId` becomes required.
4. **End-to-end validation** on a local stack: seed loads both games; the Riftbound single appears in `GET /catalog?tcg=riftbound`, renders on the catalog page and on its detail page with the game attributes; and a **Stripe test-mode checkout session** is created for it through `POST /checkout` (the non-custodial model — direct charges + application fee — is untouched by this epic; only verifying the flow reaches Stripe).
5. **`docs/ingenieria/catalogo-multijuego.md`** (Spanish, per the existing docs practice) — the provider registry, the snapshot contract, where game-specific attributes live and why, the two RiftCodex quirks, and a step-by-step "how to add the next TCG". Link it from `docs/ingenieria/README.md`.
6. **Validate** — full test suites, typecheck, lint.

## Note
Seeding is still not idempotent (each run inserts new rows); that is pre-existing and out of scope. Smoke/seed cleanup must delete by explicit row id, never by a seller-wide predicate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Latent bug found and fixed here: `scripts/load-inventory.mjs` had been BROKEN since TASK-029. It read `printing.scryfallId` from the search response, but that field was renamed to `catalogId`, so every entry posted `scryfallId: undefined` and would have failed with `catalog_id_required`. The legacy body alias kept on /admin/inventory did not save it, because the break was on the READ side of the response, not the write side of the request. Nothing exercised the script between TASK-029 and here, which is exactly why the seed tooling deserved its own end-to-end run.

Seed tooling now takes a per-entry `game` (default 'mtg') and switches search syntax per catalog: Scryfall accepts operators (`!"name" set:xxx`) while RiftCodex only does fuzzy name. Because fuzzy name returns variants (Alternate Art / Signature / Overnumbered), selection now prefers an exact name match within the requested set before falling back. Three Riftbound entries were added to scripts/inventory-seed.json. The legacy `scryfallId` body alias was removed from admin.ts now that its last consumer is migrated — `catalogId` is required on both create endpoints, closing the compatibility window opened in TASK-029.

End-to-end validation against the local stack with the real RiftCodex API: seed loaded 1 MTG + 3 Riftbound entries (4 created, 0 skipped, 0 failed); GET /catalog?tcg=riftbound returned exactly the 3 Riftbound singles; /catalog/games reported mtg 21 / riftbound 3; the detail endpoint carried gameAttributes (Legend, domains Fury+Chaos, null costs); and POST /checkout for the Riftbound single created a real Stripe test-mode session (cs_test_…, checkout.stripe.com) with an order id. The non-custodial model was not touched by this epic — no change to direct charges + application fee.

Cleanup: deleted the order items, the order, the 4 seeded inventory rows and the throwaway buyer, all by explicit id (never a seller-wide predicate, per the TASK-031 incident). Local D1 verified back at 20 rows, zero non-MTG, no leftover test users.

Docs: new docs/ingenieria/catalogo-multijuego.md (Spanish, matching the existing docs practice) covering the provider registry, the snapshot contract and why catalogId replaced scryfallId, where game-specific attributes live and the two rejected storage alternatives, the store's server-side game filter and the facets endpoint's route-ordering trap, both RiftCodex quirks, and a five-step recipe for adding the next TCG with an explicit list of what does NOT need touching. Linked from the docs README index.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Closes epic:riftbound. The seed tooling understands games, the compatibility shim from TASK-029 is gone, and the architecture is written down.

- **scripts/load-inventory.mjs** — fixed a latent break (it still read `scryfallId` from search results after TASK-029 renamed the field to `catalogId`, so every entry would have failed) and taught it per-entry `game`, with Scryfall operator syntax for MTG and fuzzy name for RiftCodex, preferring an exact name match within the requested set.
- **scripts/inventory-seed.json** — three Riftbound entries.
- **apps/api/src/routes/admin.ts** — removed the legacy `scryfallId` body alias; `catalogId` is now required everywhere.
- **docs/ingenieria/catalogo-multijuego.md** (new, linked from the README index) — provider registry, snapshot contract, game-attribute storage and the alternatives rejected, the store's game filter and facets endpoint, RiftCodex's two quirks, and a step-by-step recipe for adding the next TCG.

## Tests / verification

115 API + 28 web tests green, typecheck + biome clean. End-to-end against the local stack and the real RiftCodex API: seed loaded MTG and Riftbound together (4 created, 0 failed), `?tcg=riftbound` returned only Riftbound, facets reported both games, the detail carried its game attributes, and `POST /checkout` produced a Stripe test-mode session (`cs_test_…`). All test data removed by explicit id; local D1 verified back at 20 rows.

## Risks / follow-ups

- Seeding is still not idempotent — each run inserts new rows. Pre-existing, unchanged.
- Production has no Riftbound inventory yet, so the game shows as "Pronto" on the home and is absent from the catalog sidebar until the first single is published. That is the intended behaviour, not a gap.
<!-- SECTION:FINAL_SUMMARY:END -->
