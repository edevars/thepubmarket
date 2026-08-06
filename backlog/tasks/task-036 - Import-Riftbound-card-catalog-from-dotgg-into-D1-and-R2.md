---
id: TASK-036
title: Import Riftbound card catalog from dotgg into D1 and R2
status: In Progress
assignee:
  - '@Claude'
created_date: '2026-08-06 05:03'
labels:
  - 'epic:riftbound'
  - api
  - db
milestone: m-3
dependencies: []
references:
  - scripts/load-inventory.mjs
  - apps/api/src/lib/photos.ts
  - apps/api/src/routes/photos.ts
  - packages/db/src/schema.ts
documentation:
  - 'https://api.dotgg.gg/cgfw/getcards?game=riftbound&mode=indexed'
priority: high
type: feature
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build a local, canonical Riftbound card catalog: a new game-agnostic `catalog_cards` D1 table plus card images hosted in our own R2 bucket, fed by an importer that reads the dotgg network API behind riftbound.gg.

Source (researched live): `GET https://api.dotgg.gg/cgfw/getcards?game=riftbound&mode=indexed` returns the whole dataset in one 872 KB columnar response (1,409 cards, 37 fields incl. effect/flavor text, domains, cost, might, rarity, set, TCGplayer/Cardmarket prices, image URLs). Images at `https://static.dotgg.gg/riftbound/cards/{ID}.webp` (~88 KB each; 1,409 fronts + 25 backs ≈ 125 MB). No browser crawling needed — the riftbound.gg cards page is a client-side app over this API.

Architecture (follows repo precedents): `scripts/import-riftbound.mjs` (Node ESM, like load-inventory.mjs) fetches + maps the dataset and POSTs batches to a new admin endpoint `POST /admin/catalog/cards` (x-admin-key). The Worker upserts rows into `catalog_cards` (composite PK tcg+catalog_id, ON CONFLICT DO UPDATE) and fetches each card image server-side from static.dotgg.gg into R2 under `card-images/riftbound/{ID}.webp` (skip via head() when present — idempotent re-runs). A public `GET /card-images/:tcg/:file` route streams images from R2 with immutable caching (photos.ts pattern, no DB lookup — keys are deterministic).

Prices are stored as a JSON snapshot (`price_data` + `price_fetched_at`), refreshed on each re-run. Manual re-runnable import, no cron (decision: Riftbound ships ~3-4 sets/year).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 catalog_cards table exists (migration applied) with composite PK (tcg, catalog_id), NOCASE name index, and row types exported from @thepubmarket/db
- [ ] #2 POST /admin/catalog/cards upserts card batches idempotently and mirrors each card image (front and back) from static.dotgg.gg into R2, reporting per-card image status
- [ ] #3 GET /card-images/riftbound/{id}.webp serves the R2 image publicly with Cache-Control immutable; invalid params and missing objects return 404
- [ ] #4 node scripts/import-riftbound.mjs imports all 1,409 cards with rules/flavor text cleaned (br to newline, tags stripped, :rb_x: tokens kept) and price snapshot stored
- [ ] #5 Re-running the script converges: no duplicate rows, existing R2 objects skipped via head(), cards with image_r2_key NULL are retried
- [ ] #6 Typecheck, biome, and vitest suites green, including new card-images tests
<!-- AC:END -->
