---
id: TASK-035
title: 'Riftbound end-to-end validation, seed data, and multi-game docs'
status: In Progress
assignee:
  - Claude
created_date: '2026-08-06 02:20'
updated_date: '2026-08-06 03:33'
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
- [ ] #1 The seed script can load Riftbound entries by card name against the local environment
- [ ] #2 The MTG seed path has no regressions
- [ ] #3 Validation confirms panel → catalog → detail → test-mode checkout for a Riftbound listing, verified via curl/typecheck per project practice (no browser automation)
- [ ] #4 docs/ingenieria/ documents the multi-game catalog architecture: providers, snapshot contract, and steps to add the next TCG
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
