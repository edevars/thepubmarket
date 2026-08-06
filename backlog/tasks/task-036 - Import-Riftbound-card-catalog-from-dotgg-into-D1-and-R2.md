---
id: TASK-036
title: Import Riftbound card catalog from dotgg into D1 and R2
status: Done
assignee:
  - '@Claude'
created_date: '2026-08-06 05:03'
updated_date: '2026-08-06 05:23'
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
modified_files:
  - packages/db/src/schema.ts
  - packages/db/src/index.ts
  - apps/api/migrations/0013_silly_lightspeed.sql
  - apps/api/src/lib/card-images.ts
  - apps/api/src/lib/card-images.test.ts
  - apps/api/src/routes/card-images.ts
  - apps/api/src/routes/admin.ts
  - apps/api/src/index.ts
  - scripts/import-riftbound.mjs
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
- [x] #1 catalog_cards table exists (migration applied) with composite PK (tcg, catalog_id), NOCASE name index, and row types exported from @thepubmarket/db
- [x] #2 POST /admin/catalog/cards upserts card batches idempotently and mirrors each card image (front and back) from static.dotgg.gg into R2, reporting per-card image status
- [x] #3 GET /card-images/riftbound/{id}.webp serves the R2 image publicly with Cache-Control immutable; invalid params and missing objects return 404
- [x] #4 node scripts/import-riftbound.mjs imports all 1,409 cards with rules/flavor text cleaned (br to newline, tags stripped, :rb_x: tokens kept) and price snapshot stored
- [x] #5 Re-running the script converges: no duplicate rows, existing R2 objects skipped via head(), cards with image_r2_key NULL are retried
- [x] #6 Typecheck, biome, and vitest suites green, including new card-images tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dataset quirks found live and handled: (1) four oversized promos carry a slash in their id ("OGN-279/298") — the importer sanitizes catalogId to "OGN-279-298" for key safety and uses dotgg's own `image` field as source URL (the slashed CDN path works); the original numbering survives in collector_number ("279/298"). (2) VEN-T01 and VEN-T05 (Vendetta tokens) genuinely 404 on static.dotgg.gg for both faces — they stay with image_r2_key NULL and will heal on a future re-run if dotgg adds them. (3) 30 promo cards report neither hasNormal nor hasFoil → finishes []. (4) 25 cards report hasback=1 but only 23 have a reachable back image (the same two tokens).

The importer asserts every field it reads exists in dotgg's columnar `names` header and aborts on drift. Effect/flavor HTML is cleaned in the script (br→newline, tags stripped, entities decoded); `:rb_x:` icon tokens kept verbatim. Prices stored as JSON snapshot (tcgplayer USD / cardmarket EUR + 7d deltas) with price_fetched_at; refreshed every re-run.

Batch size 10 (zod cap 25) sized for the free-plan 50-subrequest limit: worst case per card is head+fetch+put ×2 faces. Real prod run showed no subrequest errors.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

The full Riftbound card catalog (1,409 cards from the dotgg API behind riftbound.gg) now lives in D1 with images mirrored in our R2 bucket — no browser crawling; the site's own JSON API serves the whole dataset in one response.

- **packages/db/src/schema.ts** — new `catalog_cards` table (composite PK tcg+catalog_id, NOCASE name index, set_code index; game_attributes/price_data JSON blobs; source URLs + R2 keys per face). Migration 0013 applied local + remote.
- **apps/api/src/lib/card-images.ts** (new) — deterministic key builder (`card-images/riftbound/UNL-131[-back].webp`), filename validation, and `ensureCardImage`: head-first idempotent mirror from an allowlisted host (SSRF guard), magic-byte webp validation, never throws.
- **POST /admin/catalog/cards** (admin.ts) — batched upsert (single db.batch, ON CONFLICT DO UPDATE) + server-side image mirroring with bounded concurrency; image keys written only when the R2 object exists, so `image_r2_key IS NULL` reliably means "missing".
- **GET /card-images/:tcg/:file** (new route) — public, immutable-cached, no DB lookup (deterministic keys), 404s never cached.
- **scripts/import-riftbound.mjs** (new) — idempotent importer: fetch dotgg → map/clean → POST batches with throttle/retry; --dry-run supported; exits non-zero if anything failed.

## Verification

Typecheck, Biome, vitest green (11 new tests). Local E2E: 1,409 rows, all images except the 2 that 404 at the source; slashed-id card round-trips. **Production run done**: 1,409 rows in remote D1, 1,407 fronts + 23 backs in R2 (~125 MB), images served with 200 image/webp from the deployed Worker, only VEN-T01/VEN-T05 missing at source.

## Follow-ups

- Re-run the script after each new set / for price refresh: `API_URL=<prod> ADMIN_KEY=<key> node scripts/import-riftbound.mjs`.
- TASK-037 (local D1 provider replacing RiftCodex) shipped in the same session.
<!-- SECTION:FINAL_SUMMARY:END -->
