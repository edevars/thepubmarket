---
id: TASK-050
title: >-
  Backfill MTG card attributes from Scryfall for existing inventory (local +
  prod)
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-07 00:01'
labels:
  - 'epic:catalog-visual-refactor'
  - api
  - scripts
milestone: m-3
dependencies:
  - TASK-049
references:
  - apps/api/src/routes/admin.ts
  - scripts/import-riftbound.mjs
  - 'https://scryfall.com/docs/api/cards/collection'
priority: high
type: feature
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of epic:catalog-visual-refactor. Every existing MTG inventory row has `card_attributes = NULL` (the Scryfall pipeline never populated it). TASK-049 fixes the pipeline going forward; this task backfills the existing rows so the new MTG color/type/rarity filters actually return results.

Outcome: all MTG inventory rows have populated `card_attributes`, locally and in production, via an idempotent, re-runnable process.

Scope:
- Two admin endpoints in `apps/api/src/routes/admin.ts`, admin-key guarded like their siblings: `GET /admin/inventory/mtg-missing-attributes` (rows with `tcg='mtg' AND card_attributes missing/invalid`, returns id + scryfall/catalog identifier, limit param) and `POST /admin/inventory/attributes` (batch `[{id, gameAttributes}]`, validates the `tcg:'mtg'` shape, updates `card_attributes`). Rationale for endpoints over raw `wrangler d1 execute`: identical path against local and prod, reuses auth, keeps validation in one place.
- `scripts/backfill-mtg-attributes.mjs` (pattern: `scripts/import-riftbound.mjs` — API_URL/ADMIN_KEY env vars, batches, retries): pulls missing rows, resolves cards via Scryfall `POST /cards/collection` (75 identifiers per request, ~150ms throttle for the ~10 req/s limit), derives `MtgAttributes` with the same rules as TASK-049 (colors union of faces, empty → ['C'], types from type_line), posts batches. Idempotent by construction (the GET only returns missing rows).
- No schema change (uses the existing `card_attributes` column) — d1-schema-guardian not needed.
- Document the prod one-liner: `API_URL=... ADMIN_KEY=... node scripts/backfill-mtg-attributes.mjs`.

Depends on TASK-049 (MtgAttributes type, attribute derivation rules). Does not block the UI tasks — only gates seeing MTG facets with real data. Subagent: cloudflare-worker-dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running the script converges to 0 missing rows; a second run is a no-op
- [ ] #2 After a local run, GET /catalog?tcg=mtg&color=G returns only green cards
- [ ] #3 Rows with unresolvable Scryfall ids are reported in the script output, not silently skipped
- [ ] #4 Prod run command is documented (script header or docs); api tests, typecheck, and biome are green
<!-- AC:END -->
