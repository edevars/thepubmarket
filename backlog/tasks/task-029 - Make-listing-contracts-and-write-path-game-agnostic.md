---
id: TASK-029
title: Make listing contracts and write path game-agnostic
status: Done
assignee:
  - Claude
created_date: '2026-08-06 02:19'
updated_date: '2026-08-06 02:31'
labels:
  - 'epic:riftbound'
  - api
milestone: m-3
dependencies: []
references:
  - packages/shared/src/index.ts
  - apps/api/src/lib/inventory.ts
  - apps/api/src/routes/seller-panel.ts
  - apps/api/src/routes/admin.ts
  - packages/db/src/schema.ts
  - .claude/agents/d1-schema-guardian.md
priority: high
type: feature
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The create-listing path is hardcoded to MTG: `CardSnapshot` requires a Scryfall UUID (packages/shared/src/index.ts:50-76), `createListing()` forces `tcg:'mtg'` (apps/api/src/lib/inventory.ts:107, snapshot logic at 70-128), and both zod create schemas require `scryfallId` (apps/api/src/routes/seller-panel.ts:34-41, apps/api/src/routes/admin.ts:29-38).

To support Riftbound — and future TCGs — the shared contracts (`CardSnapshot`, `CreateListingRequest` at packages/shared/src/index.ts:437-452) and the write path must carry the listing's game and a game-agnostic catalog identifier while preserving current MTG behavior exactly.

The `inventory.tcg` column (packages/db/src/schema.ts:143) already accepts any string, so no migration should be needed.

Schema guidance: when multi-game modeling arrives, split shared card attributes from game-specific ones deliberately; avoid a sprawling nullable mega-table (.claude/agents/d1-schema-guardian.md:85-89).

This task is the foundation the rest of epic:riftbound depends on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shared contracts express a listing's game and a catalog identifier that is not Scryfall-specific, and existing MTG clients/data keep working unchanged
- [x] #2 Creating an MTG listing behaves exactly as today, including finish validation against Scryfall finishes
- [x] #3 Unknown or unsupported tcg values are rejected with a clear validation error
- [x] #4 inventory.tcg stores the correct game per listing; no D1 table rebuild is required
- [x] #5 Tests cover the MTG regression path and the new game validation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Introduce a game-agnostic catalog identity (`catalogId`) plus an explicit `tcg` on the listing contracts and write path, with a minimal per-game provider seam. MTG keeps resolving through Scryfall with identical behavior; unsupported games fail fast with a clear error until their provider lands (TASK-030/031).

## Steps

1. **Shared contracts** (`packages/shared/src/index.ts`)
   - `CardSnapshot`: add `tcg: Tcg`; rename `scryfallId` → `catalogId` (provider printing id; Scryfall UUID for MTG); `oracleId: string | null` (MTG-only concept).
   - `CreateListingRequest`: `{ tcg?: Tcg (default 'mtg'), catalogId, condition, finish, language, priceCents, quantity }`.
2. **D1 additive column** (`packages/db/src/schema.ts`): nullable `catalog_id` text + index `idx_inventory_catalog_id`. Generate migration with `db:generate` (pure ALTER TABLE ADD COLUMN — no rebuild), apply with `db:migrate:local`. Existing MTG rows keep `scryfall_id`; reads fall back `catalogId ?? scryfallId`.
3. **Write path** (`apps/api/src/lib/inventory.ts`): provider registry `{ mtg: getCardById }` keyed by `Tcg`; unknown-to-registry games return 400 `tcg_not_supported`. Insert stores `tcg` from input, `catalog_id` always, `scryfall_id`/`oracle_id` only for MTG. `rowToInventoryItem` emits `tcg` + `catalogId` with legacy fallback.
4. **Scryfall client** (`apps/api/src/lib/scryfall.ts`): `normalizeCard` emits `tcg: 'mtg'`, `catalogId`, nullable `oracleId`.
5. **Route schemas** (`apps/api/src/routes/seller-panel.ts`, `admin.ts`): `tcg: z.enum(TCGS).default('mtg')` (unknown values → zod 400); accept `catalogId` with legacy `scryfallId` alias on the wire so the deployed web bundle and `scripts/load-inventory.mjs` keep working until TASK-031/032 migrate them.
6. **Web mechanical rename only** (no behavior change, keeps typecheck green): `AddCardFlow.tsx` (`sel.scryfallId` → `catalogId`, send `tcg: 'mtg'`), `mock-data.ts`, `client-api.ts` if typed. Game selector stays in TASK-032.
7. **Tests** (`apps/api/src/lib/inventory.test.ts`, vitest, mock scryfall module + stub db): MTG happy path unchanged (row fields, finish validation vs Scryfall finishes), `finish_not_available`, `tcg_not_supported` without touching the provider, legacy-row fallback in `rowToInventoryItem`.
8. **Validate**: `pnpm typecheck`, `pnpm lint`, `pnpm --filter @thepubmarket/api test`, migration generate+apply local.

## Risks
- Wire compat: legacy `scryfallId` alias kept at the zod layer on purpose; removal happens in TASK-031.
- `catalog_id` is additive and reversible; no CHECK added on `tcg` (validation stays app-level, consistent with D1 no-rebuild constraint).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: (1) `catalogId` replaces `scryfallId` in `CardSnapshot` (not alongside it) — one identity field, game-scoped; `oracleId` became nullable since it is an MTG-only concept. (2) Wire compat kept at the zod layer only: both create schemas accept legacy `scryfallId` (mapped to `catalogId`, implies default tcg 'mtg') so the deployed web bundle and scripts/load-inventory.mjs keep working; remove the alias in TASK-031. (3) Provider seam is a plain `CATALOG_PROVIDERS: Partial<Record<Tcg, lookup>>` map in lib/inventory.ts — deliberately minimal; TASK-030 registers RiftCodex there and can generalize the error type (today the catch still handles ScryfallError only, fine while MTG is the sole provider). (4) New nullable `catalog_id` column + index (migration 0011_odd_photon.sql, pure ALTER TABLE ADD COLUMN + CREATE INDEX — no rebuild). Legacy rows have only scryfall_id; rowToInventoryItem falls back catalogId ?? scryfallId. No backfill needed.

Verification: 90 vitest tests pass (5 new createListing + 2 rowToInventoryItem tests in apps/api/src/lib/inventory.test.ts); pnpm typecheck (4 pkgs) and biome lint clean; migration applied with db:migrate:local. Live smoke vs wrangler dev on :8787 — POST /admin/inventory with legacy scryfallId → 201 with card.catalogId populated; with {tcg:'mtg',catalogId} → 201; {tcg:'riftbound'} → 400 {error:'tcg_not_supported', supported:['mtg']}; {tcg:'digimon'} → 400 zod issue on path ['tcg']; body without either id → 400 catalog_id_required. Smoke rows deleted from local D1 afterwards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Foundation for multi-TCG listings (epic:riftbound): contracts and the create-listing write path are now game-agnostic while MTG behavior is byte-for-byte preserved.

- **packages/shared/src/index.ts** — `CardSnapshot` gains `tcg` and replaces `scryfallId` with `catalogId` (provider printing id; Scryfall UUID for MTG); `oracleId` is now `string | null` (MTG-only concept). `CreateListingRequest` carries `tcg?` (default 'mtg') + `catalogId`.
- **packages/db/src/schema.ts** + **apps/api/migrations/0011_odd_photon.sql** — additive nullable `inventory.catalog_id` column + `idx_inventory_catalog_id` (pure ALTER TABLE, no D1 rebuild). Legacy MTG columns `scryfall_id`/`oracle_id` still written for MTG rows.
- **apps/api/src/lib/inventory.ts** — hardcoded `tcg:'mtg'` removed; card resolution goes through a `CATALOG_PROVIDERS` map keyed by `Tcg` (only `mtg`→Scryfall today). Games without a provider get 400 `tcg_not_supported` listing supported games. `rowToInventoryItem` emits `tcg`/`catalogId` with `scryfall_id` fallback for pre-migration rows.
- **apps/api/src/lib/scryfall.ts** — `normalizeCard` emits `tcg:'mtg'` + `catalogId`.
- **apps/api/src/routes/seller-panel.ts, admin.ts** — create schemas accept `tcg` (zod enum over TCGS rejects unknown values) + `catalogId`, with legacy `scryfallId` accepted as a wire alias until TASK-031/032 migrate the clients.
- **apps/web** — mechanical rename only (`AddCardFlow.tsx`, `mock-data.ts`); panel still publishes MTG explicitly; game selector arrives in TASK-032.

## Tests / verification

7 new vitest cases (MTG regression incl. finish validation, empty-finishes acceptance, `tcg_not_supported` short-circuit, provider 404→404 / 5xx→502 mapping, legacy-row fallback); full suite 90/90 green; typecheck + biome clean; migration applied locally; live curl smoke against wrangler dev verified all five request shapes (legacy alias, new contract, unsupported game, unknown game, missing id).

## Risks / follow-ups

- Legacy `scryfallId` wire alias is temporary; retire it in TASK-031 (API) / TASK-035 (seed script).
- The provider error handling still catches `ScryfallError` only — generalize when TASK-030 adds the RiftCodex client.
- Migration 0011 must be applied to remote D1 at next deploy (`db:migrate:remote`).
<!-- SECTION:FINAL_SUMMARY:END -->
