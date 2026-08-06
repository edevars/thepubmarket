---
id: TASK-029
title: Make listing contracts and write path game-agnostic
status: In Progress
assignee:
  - Claude
created_date: '2026-08-06 02:19'
updated_date: '2026-08-06 02:26'
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
- [ ] #1 Shared contracts express a listing's game and a catalog identifier that is not Scryfall-specific, and existing MTG clients/data keep working unchanged
- [ ] #2 Creating an MTG listing behaves exactly as today, including finish validation against Scryfall finishes
- [ ] #3 Unknown or unsupported tcg values are rejected with a clear validation error
- [ ] #4 inventory.tcg stores the correct game per listing; no D1 table rebuild is required
- [ ] #5 Tests cover the MTG regression path and the new game validation
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
