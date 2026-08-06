---
id: TASK-030
title: RiftCodex catalog client for Riftbound card data
status: Done
assignee:
  - Claude
created_date: '2026-08-06 02:19'
updated_date: '2026-08-06 02:45'
labels:
  - 'epic:riftbound'
  - api
milestone: m-3
dependencies:
  - TASK-029
references:
  - apps/api/src/lib/scryfall.ts
  - apps/api/src/lib/inventory.ts
documentation:
  - 'https://riftcodex.com/docs/'
priority: high
type: feature
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Riftbound card data will come from the RiftCodex API (base https://api.riftcodex.com — unofficial fan project, no auth for reads, JSON, marked work-in-progress). Build a server-side client in the API Worker mirroring the existing Scryfall client (apps/api/src/lib/scryfall.ts: normalizeCard 62-80, getCardById 86-102 KV-cached 30 days, searchCards 109-138 KV-cached 10 min, base URL + User-Agent 15-21).

Relevant endpoints: GET /cards/search?query= (full-text, relevance-ranked), GET /cards/name?exact=|fuzzy=, GET /cards/{id}, GET /sets, GET /sets/{id}; all list endpoints paginate with page/size (max 100) and envelope {items,total,page,size,pages}.

CardResponse fields: id, name, riftbound_id, tcgplayer_id, public_code, collector_number, attributes{energy,might,power — nullable}, classification{type,supertype,rarity,domain[]}, text{rich,plain,flavour}, set{set_id,label}, media{image_url,artist,accessibility_text}, metadata{clean_name,alternate_art,overnumbered,signature}, orientation, tags.

Results must normalize into the shared game-agnostic card snapshot (from the task "Make listing contracts and write path game-agnostic"). The API being third-party and WIP means failures must be handled gracefully with a proper User-Agent set.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Searching by card name returns normalized snapshots with name, set code/name, collector number, rarity, artist, and image URL
- [x] #2 Fetching a card by its RiftCodex id returns the same normalized shape used at listing-create time
- [x] #3 Responses are KV-cached with TTLs consistent with the Scryfall client (long for cards, short for searches)
- [x] #4 API errors and timeouts surface as controlled errors, not unhandled exceptions
- [x] #5 Tests cover normalization (including null attributes and alternate-art/signature variants) and cache behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Live API findings (probed 2026-08-05, differ from docs)

- `GET /cards/search?query=` returns `total: 0` for every term tried (Vi, Jinx, Bewitching) — the full-text index is not working in this WIP API. `GET /cards/name?fuzzy=` works well and returns all printings. **Use `/cards/name?fuzzy=` for seller search.**
- A non-existent card id returns **HTTP 500**, not 404 (`/cards/deadbeef...` → "Internal Server Error"). The provider cannot signal not-found, so a bad id maps to an upstream error.
- Card `id` is a 24-char hex ObjectId (not a UUID) — fits the `catalogId` string contract from TASK-029.
- Variants are already disambiguated in `name` ("Jinx - Loose Cannon (Signature)", "(Alternate Art)", "(Overnumbered)") plus set + collector number, so they behave as distinct catalog entries.
- No `lang` and no finishes in the payload; embedded `set` is `{set_id, label}`.

## Approach

New `apps/api/src/lib/riftcodex.ts` mirroring the Scryfall client, plus a small shared seam so both providers behave alike.

1. **`apps/api/src/lib/catalog.ts`** (new): `CatalogError` (message + status) and the shared cache TTLs. `ScryfallError` extends `CatalogError` so existing imports/tests keep working.
2. **`apps/api/src/lib/riftcodex.ts`** (new):
   - `normalizeCard(raw)` → `CardSnapshot`: `tcg:'riftbound'`, `catalogId: id`, `oracleId: null`, `name`, `setCode: set.set_id`, `setName: set.label`, `collectorNumber: String(collector_number)`, `lang: 'en'` (API has no language field), `rarity` lowercased for cross-game consistency with the Scryfall snapshots, `artist: media.artist ?? null`, `finishes: []` (provider reports none → createListing accepts any), `imageUrl: media.image_url ?? null`.
   - `getCardById(id, kv)` — `GET /cards/{id}`, KV `riftcodex:card:<id>` 30 days.
   - `searchCards(query, kv)` — `GET /cards/name?fuzzy=&size=60`, KV `riftcodex:search:<q>` 10 min; empty result caches as `[]`.
   - Identifiable `User-Agent`, `AbortSignal.timeout` on both calls; aborts and non-OK statuses become `CatalogError` (504 / upstream status → 502 at the caller).
3. **`apps/api/src/lib/inventory.ts`**: register `riftbound` in `CATALOG_PROVIDERS` and widen the catch from `ScryfallError` to `CatalogError` (TASK-029 left this narrowed on purpose). Route-level game-aware search stays in TASK-031.
4. **Tests** (`apps/api/src/lib/riftcodex.test.ts`): normalization of a plain card, a signature/alternate-art variant, null attributes and missing artist/image; KV cache hit avoids fetch and miss writes with the right TTL; non-OK status and timeout produce `CatalogError`; empty search caches `[]`.
5. **Validate**: `pnpm --filter @thepubmarket/api test`, `pnpm typecheck`, `pnpm lint`, plus a live smoke of the client path.

## Risks
- RiftCodex is an unofficial WIP fan API: no not-found signal and a possibly changing schema. Normalization tolerates missing optional fields rather than trusting the documented shape.
- If `/cards/search` starts working it may be a better search endpoint than `/cards/name?fuzzy=`; revisit in TASK-031.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Two live-API quirks drove the design and are worth remembering: (1) `/cards/search?query=` returns total 0 for every term (full-text index not working in this WIP API) so `searchCards` uses `/cards/name?fuzzy=&size=60` instead; revisit if the full-text endpoint starts working. (2) RiftCodex answers HTTP 500 — not 404 — for a non-existent card id, so a bad Riftbound catalogId surfaces as `catalog_error` / 502, never 404. Only Scryfall can signal not-found.

Scope note: this task also registered `riftbound` in CATALOG_PROVIDERS and widened the createListing catch from ScryfallError to CatalogError (TASK-029 deliberately left it narrow). Without that the client would be dead code and AC #2 unverifiable. Consequence: POST /admin|seller/inventory with tcg=riftbound now succeeds, which was listed under TASK-031 AC #2 — TASK-031 still owns the game-aware SEARCH endpoint and the /scryfall/ route rename. The error code for a failed catalog lookup changed from `card_not_found_or_scryfall_error` to `card_not_found` (404) / `catalog_error` (502); grep confirmed no client consumed the old string.

Riftbound rarity is lowercased in the snapshot ('Showcase' → 'showcase') to match the Scryfall convention already baked into CardSnapshot.rarity. Variants (Signature / Alternate Art / Overnumbered) arrive from RiftCodex as separate entries already disambiguated in `name` plus set + collector number, so they need no finish handling — `finishes: []` lets the seller pick any finish, matching the TASK-031 note that the DB finish CHECK stays untouched.

Verification: 102 vitest tests pass (12 new in riftcodex.test.ts + 1 new Riftbound create test in inventory.test.ts); typecheck and biome clean. Live smoke against wrangler dev + the real RiftCodex API: published 'Jinx - Rebel' (id 69bc5befd308c64675ca89c4) → 201 with tcg riftbound, setCode PR, rarity promo, artist and image URL populated, oracleId null; D1 row confirmed catalog_id set and scryfall_id/oracle_id NULL; item rendered in GET /catalog. Bad id → {error:'catalog_error', status:500}; tcg=pokemon → tcg_not_supported with supported:['mtg','riftbound']. Smoke row deleted from local D1 afterwards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Riftbound card data now resolves through the RiftCodex API, mirroring how MTG resolves through Scryfall.

- **apps/api/src/lib/catalog.ts** (new) — shared provider seam: `CatalogError` (message + status), the cache TTLs (30d cards / 10m searches) and an 8s request timeout, so every game's catalog behaves the same way.
- **apps/api/src/lib/riftcodex.ts** (new) — `normalizeCard` / `getCardById` / `searchCards` against `https://api.riftcodex.com`, KV-cached under `riftcodex:card:*` and `riftcodex:search:*`, identifiable User-Agent, `AbortSignal.timeout` on every call. Search uses `/cards/name?fuzzy=` because the documented full-text endpoint returns nothing. All optional payload fields degrade gracefully — the API is an unofficial WIP fan project.
- **apps/api/src/lib/scryfall.ts** — `ScryfallError` now extends `CatalogError`; local TTL constants moved to the shared module. No behavior change.
- **apps/api/src/lib/inventory.ts** — `riftbound` registered in `CATALOG_PROVIDERS`; the lookup catch widened from `ScryfallError` to `CatalogError`, with error codes `card_not_found` (404, Scryfall only) and `catalog_error` (502).

## Tests / verification

13 new vitest cases: snapshot normalization (plain card, signature variant, card missing set/media/classification, null attributes), cache hit skips fetch, cache miss writes with the right TTL, upstream failure and timeout become `CatalogError`, blank and no-match searches. Suite 102/102 green; typecheck + biome clean. Live smoke against the real RiftCodex API published a Riftbound single end-to-end (correct set, rarity, artist, image; `scryfall_id`/`oracle_id` NULL in D1; visible in `GET /catalog`), and error paths returned `catalog_error` and `tcg_not_supported` as expected.

## Risks / follow-ups

- RiftCodex cannot signal not-found (500 for unknown ids) and its schema may shift; normalization is defensive but a breaking upstream change would surface as 502s.
- If `/cards/search` starts working it is likely a better seller-search endpoint than fuzzy-name — revisit in TASK-031.
- The seller/admin search route is still Scryfall-only; game-aware search is TASK-031.
<!-- SECTION:FINAL_SUMMARY:END -->
