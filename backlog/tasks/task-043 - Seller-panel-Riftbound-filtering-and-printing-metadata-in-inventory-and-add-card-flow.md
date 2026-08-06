---
id: TASK-043
title: >-
  Seller panel: Riftbound filtering and printing metadata in inventory and
  add-card flow
status: Done
assignee:
  - '@claude'
created_date: '2026-08-06 05:45'
updated_date: '2026-08-06 09:09'
labels:
  - 'epic:riftbound-ux'
  - web
milestone: m-3
dependencies:
  - TASK-038
  - TASK-045
references:
  - apps/web/src/components/panel/InventoryView.tsx
  - apps/web/src/components/panel/AddCardFlow.tsx
  - apps/web/src/lib/client-api.ts
  - apps/api/src/routes/seller-panel.ts
  - apps/web/messages/es.json
  - apps/web/messages/en.json
modified_files:
  - apps/web/src/components/panel/InventoryView.tsx
  - apps/web/src/components/panel/AddCardFlow.tsx
  - apps/web/src/lib/panel/inventory-filters.ts
  - apps/web/src/lib/panel/inventory-filters.test.ts
  - apps/web/messages/es.json
  - apps/web/messages/en.json
priority: medium
type: enhancement
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The seller panel's inventory game filter only shows chips for games the seller already stocks, and the add-card search results give minimal context per result — for Riftbound, where the same card exists across sets (OGN/UNL) and in foil-only printings, sellers cannot reliably pick the right printing. Inventory rows also don't surface set/game context for Riftbound listings.

Outcome: a seller can filter their panel inventory to Riftbound cards and confidently distinguish Riftbound printings when adding stock, using the strict metadata (set, collector number, rarity, domains, energy/might) and real finish availability. Part of `epic:riftbound-ux`.

Depends on TASK-038, which adds this metadata to the seller catalog search response.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Seller inventory view can be filtered to Riftbound; the game filter behavior for sellers with and without Riftbound stock is deliberate and consistent
- [x] #2 Add-card search results display set, collector number, rarity, and key Riftbound attributes (domains, energy/might) so printings across sets are disambiguated
- [x] #3 Finish availability is respected in the add-card UI: foil-only printings do not offer nonfoil, matching the API finish_not_available rule
- [x] #4 Inventory rows surface game and set context for Riftbound listings
- [x] #5 Labels localized in es and en; typecheck, biome, and tests green
- [x] #6 Panel filter and search interactions use the shared motion foundation (TASK-045) for state transitions (chip toggles, result list updates), respecting prefers-reduced-motion; a web-design-guidelines skill audit of touched panel surfaces reports no violations
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Frontend-only work in `apps/web` (seller panel), consuming the metadata TASK-038 already added to `GET /seller/catalog/search` and to the inventory item shape. No API or schema changes expected; if a field is genuinely missing from the API, stop and report rather than widening scope.

## Steps

1. **Research** — read `apps/web/src/components/panel/InventoryView.tsx`, `AddCardFlow.tsx`, `apps/web/src/lib/client-api.ts` and the seller-panel route contract (`apps/api/src/routes/seller-panel.ts`) to confirm which fields (rarity, set code/name, collector number, `gameAttributes`, available finishes) reach the panel today.
2. **AC#1 — inventory game filter**: make the game filter deliberate and consistent instead of "only games already stocked". Show the full supported-game set (or at minimum always include Riftbound), with empty-state copy when the seller has no stock for the selected game.
3. **AC#2 — add-card result disambiguation**: render set code/name, collector number, rarity and key Riftbound attributes (domains, energy/might) per search result so OGN/UNL printings are distinguishable.
4. **AC#3 — finish availability**: drive the foil/nonfoil control from the printing's real finish list so foil-only printings never offer nonfoil, mirroring the API `finish_not_available` rule (client-side guard, API stays authoritative).
5. **AC#4 — inventory rows**: surface game + set context on rows.
6. **AC#5 — i18n**: all new labels in `messages/es.json` and `messages/en.json`, no hardcoded strings.
7. **AC#6 — motion + audit**: reuse the TASK-045 foundation (`.tpm-chip`, `.tpm-grid-item`, `.tpm-reveal`, duration/ease tokens) for chip toggles and result-list updates; transform/opacity only, reduced-motion respected. Build with the `frontend-design` skill, then audit touched panel surfaces with `web-design-guidelines`.
8. **Verify** — typecheck, biome, tests via the `task-verifier` subagent.

## Notes

- Branch `task/task-043`. No money-flow surface: read-only inventory/catalog UI, non-custodial invariant untouched.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Frontend-only; the API contract from TASK-038 already carried everything needed, so no API or schema change.

Filter logic was extracted out of the component into `apps/web/src/lib/panel/inventory-filters.ts` (`presentGames`, `filterInventory`) precisely so AC#1's "deliberate and consistent" behavior could be pinned by tests instead of living implicitly in JSX. The rule: a game chip appears once the seller holds at least one listing in that game, computed off the **full** inventory rather than the filtered view — otherwise the chip set would flicker as the search/condition filters narrowed results. Zero Riftbound stock → no Riftbound chip, since filtering to it could only ever produce an empty list.

AC#3's `finishAvailable(finishes, f)` is `finishes.length === 0 || finishes.includes(f)` — an exact mirror of the server guard in `apps/api/src/lib/inventory.ts:146`, including the empty-array-means-both semantics. The client hides the unavailable finish button and defaults the selection; the API stays authoritative.

Motion reuses the TASK-045 foundation only (`.tpm-chip`, `.tpm-grid-item`, `duration-base`/`ease-standard`) — no new primitives, so `prefers-reduced-motion` is covered by the existing global override.

web-design-guidelines audit findings fixed before verification: missing focus-visible rings on the segmented/toggle and pause-resume buttons, `outline-none` inputs with no focus replacement on the wrapping compound controls (4 spots), decorative glyphs without `aria-hidden`, icon-only button without `aria-label`, and the debounced search-status text without `aria-live="polite"`.

Verified by task-verifier: typecheck ok, biome ok (207 files), tests 182 api + 63 web (8 new). Merged to main (db1cf12), deployed thepubmarket-web (version 0487f18e).

Non-custodial invariant untouched: read-only catalog/inventory UI, no money flow.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

The seller panel now treats Riftbound as a first-class game.

- **`apps/web/src/lib/panel/inventory-filters.ts`** (new, with 8 unit tests) — `presentGames()` / `filterInventory()` pulled out of `InventoryView` so the game-chip rule is testable: a chip shows once the seller holds ≥1 listing in that game, derived from the unfiltered inventory so it stays stable while other filters narrow the list.
- **`AddCardFlow.tsx`** — search results render set name, set code, collector number and rarity, plus a Riftbound meta block (type/supertype, domain badges, energy/might) from `card.gameAttributes`, so OGN/UNL printings of the same card are distinguishable. `finishAvailable()` mirrors the server's `finish_not_available` rule exactly, so foil-only printings hide the Normal option, default the selection correctly, and carry a "foil only" badge and hint.
- **`InventoryView.tsx`** — rows show a game badge alongside the set/collector line for non-MTG listings.
- **`messages/{es,en}.json`** — `foilOnlyTag`, `energyAbbr`, `mightAbbr`, `offerFinishOnlyHint`.

## Verification

typecheck, biome (207 files) and tests (182 api + 63 web) green. `web-design-guidelines` audit run over both touched panel surfaces; five accessibility findings (focus-visible rings, focus treatment on compound inputs, decorative-glyph `aria-hidden`, icon-button `aria-label`, `aria-live` on the debounced result count) found and fixed before verification.

Deployed to `thepubmarket-web` (version 0487f18e).
<!-- SECTION:FINAL_SUMMARY:END -->
