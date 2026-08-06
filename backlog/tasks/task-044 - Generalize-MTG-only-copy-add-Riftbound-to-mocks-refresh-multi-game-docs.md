---
id: TASK-044
title: 'Generalize MTG-only copy, add Riftbound to mocks, refresh multi-game docs'
status: In Progress
assignee:
  - '@Claude'
created_date: '2026-08-06 05:45'
updated_date: '2026-08-06 13:52'
labels:
  - 'epic:riftbound-ux'
  - web
  - docs
milestone: m-3
dependencies: []
references:
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - apps/web/src/lib/catalog/display.ts
  - apps/web/src/lib/catalog/mock-data.ts
  - docs/ingenieria/catalogo-multijuego.md
  - scripts/import-riftbound.mjs
modified_files:
  - apps/web/messages/en.json
  - apps/web/messages/es.json
  - apps/web/src/lib/catalog/mock-data.ts
  - apps/web/src/lib/catalog/mock-data.test.ts
  - apps/web/src/lib/sellers/mock-data.ts
  - docs/ingenieria/catalogo-multijuego.md
priority: medium
type: chore
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Several user-facing surfaces still assume MTG is the only game: the catalog subtitle is hardcoded "Singles de Magic: The Gathering", the home hero copy ends with "Arrancamos con Magic: The Gathering.", and game display names live untranslated in TCG_META. The frontend mock dataset has zero Riftbound entries, so mock mode (NEXT_PUBLIC_USE_MOCKS=true) shows no Riftbound at all. docs/ingenieria/catalogo-multijuego.md is stale — it still documents RiftCodex as the Riftbound provider, replaced by the local D1 provider in TASK-037.

Outcome: copy, mocks, and docs reflect a multi-game marketplace where Riftbound is a first-class TCG. Part of `epic:riftbound-ux`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Catalog subtitle and home hero copy no longer hardcode MTG as the only game; multi-game copy reads naturally in es and en
- [x] #2 No remaining user-facing copy implies MTG is the only supported game (audit of messages es.json/en.json and hardcoded strings)
- [x] #3 Frontend mock data includes Riftbound entries so mock mode displays Riftbound listings
- [x] #4 docs/ingenieria/catalogo-multijuego.md updated: RiftCodex references replaced with the local D1 catalog provider and current import flow
- [x] #5 Typecheck, biome, and web tests green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Two independent tracks on branch `task/TASK-044`, no file overlap.

**Track A — web copy + mocks (nextjs-frontend)**
1. Audit `apps/web/messages/{es,en}.json` and hardcoded strings for MTG-only assumptions (catalog subtitle "Singles de Magic: The Gathering", home hero "Arrancamos con Magic: The Gathering.", any others found by grep).
2. Rewrite that copy so it reads as a multi-game marketplace in both locales — natural Spanish and English, not a literal translation of each other.
3. Move game display names in `TCG_META` (`apps/web/src/lib/catalog/display.ts`) out of untranslated hardcoding where they are user-facing labels (proper nouns like "Magic: The Gathering" stay as-is; generic labels get translated).
4. Add Riftbound entries to `apps/web/src/lib/catalog/mock-data.ts` so `NEXT_PUBLIC_USE_MOCKS=true` renders Riftbound listings with the same shape real D1 rows have (set, number, rarity, printing metadata from TASK-043).

**Track B — docs (inline/general)**
5. Refresh `docs/ingenieria/catalogo-multijuego.md`: remove RiftCodex as the Riftbound provider, document the local D1 `catalog_cards` provider added in TASK-037 and the `scripts/import-riftbound.mjs` import flow.

**Verification** — `task-verifier` runs typecheck, biome and web tests, and audits the UI copy work against the design guidelines.

## Risks
- Copy changes touch shared i18n keys; the grep audit (AC#2) is the part most likely to miss a surface, so the verifier re-runs the audit independently.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TCG_META (`display.ts`) se dejó intacto: todos sus valores son nombres propios de juego (Magic, Pokémon, Riftbound…), no hay label genérico que traducir. El paso 3 del plan quedó sin cambios por diseño, no por omisión.

AC#3 se verificó con un test nuevo (`src/lib/catalog/mock-data.test.ts`, 4 casos) que ejercita el mismo camino que usa el modo mock: `MOCK_LISTINGS` activos + `applyFilters` por `tcg` y por faceta propia de Riftbound (`domain`). Cubre además la invariante de forma (gameAttributes null y oracleId no-null solo en MTG).
<!-- SECTION:NOTES:END -->
