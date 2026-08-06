---
id: TASK-040
title: >-
  Catalog UI: Riftbound filter sidebar (domains, energy, might, type, rarity,
  set)
status: Done
assignee:
  - '@claude'
created_date: '2026-08-06 05:44'
updated_date: '2026-08-06 08:24'
labels:
  - 'epic:riftbound-ux'
  - web
milestone: m-3
dependencies:
  - TASK-039
  - TASK-045
references:
  - apps/web/src/components/catalog/FilterSidebar.tsx
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/catalog/ActiveChips.tsx
  - apps/web/src/lib/catalog/data.ts
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
  - apps/web/messages/es.json
  - apps/web/messages/en.json
modified_files:
  - apps/web/src/lib/catalog/game-filters.ts
  - apps/web/src/lib/catalog/game-filters.test.ts
  - apps/web/src/lib/catalog/data.ts
  - apps/web/src/lib/api.ts
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/catalog/FilterSidebar.tsx
  - apps/web/messages/es.json
  - apps/web/messages/en.json
priority: high
type: feature
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The public catalog filter sidebar today offers only game, condition, language, foil, and price — no game has attribute-specific filters. This task adds the Riftbound-specific filter experience: when the shopper is browsing Riftbound, the sidebar gains filters matching Riftbound's strict metadata (domains, energy, might, card type, rarity, set), wired to the API filter params delivered by TASK-039.

Outcome: a shopper can narrow the Riftbound catalog by its native card attributes with the same UX quality as the existing filters (chips, counts where applicable, URL persistence), and the pattern is reusable when other TCGs get their own attribute filters.

Depends on TASK-039, which provides the GET /catalog filter parameters these controls drive.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When Riftbound is the selected game, the filter sidebar offers domain, energy, might, card type, rarity, and set filters alongside the existing condition/language/foil/price filters
- [x] #2 Active Riftbound filters appear as removable chips and persist in the URL, so filtered views are shareable and survive reload
- [x] #3 Switching to another game (or clearing the game) removes Riftbound-specific filters and controls; other games' filtering is unaffected
- [x] #4 Empty result states render correctly and the sidebar works on mobile viewports
- [x] #5 Filter labels localized in es and en; typecheck, biome, and existing web tests green
- [x] #6 Filter micro-interactions use the shared motion foundation (TASK-045): chip add/remove and card grid updates transition smoothly, respecting prefers-reduced-motion; a web-design-guidelines skill audit of touched surfaces reports no violations
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## API contract (delivered by TASK-039, ya en prod)

`GET /catalog` acepta, **solo cuando `tcg=riftbound`**:

- `domain` — Body, Calm, Chaos, Colorless, Fury, Mind, Order
- `type` — Battlefield, Gear, Legend, Rune, Spell, Unit
- `supertype` — Basic, Champion, Signature, Token
- `energy`, `might` — enteros 0..12
- `rarity` — common, uncommon, rare, epic, showcase
- `set` — free-form (`set_code`, sin validación, no gated por juego)

Semántica: multi-valor por repetición o por comas, **OR dentro del param, AND entre params**.
Vocabulario canónico exportado desde `packages/shared` (`RIFTBOUND_DOMAINS`,
`RIFTBOUND_CARD_TYPES`, `RIFTBOUND_SUPERTYPES`, `RIFTBOUND_RARITIES`) — la UI debe consumir
esas constantes, no hardcodear listas.

**Crítico (AC#3):** cualquier param game-specific enviado sin `tcg=riftbound` devuelve
`400 filter_requires_tcg`. Al cambiar de juego o limpiar el juego, la UI DEBE purgar esos
params de la URL antes de pedir, o el catálogo se rompe con un 400.

## Pasos

1. Investigar el estado actual de `FilterSidebar.tsx`, `CatalogView.tsx`, `ActiveChips.tsx`,
   `lib/catalog/data.ts` y el parseo de searchParams en `app/[locale]/catalog/page.tsx`;
   seguir el patrón de filtros existente (condition/language/foil/price) en vez de inventar uno.
2. Extender el parseo/serialización de searchParams con los params Riftbound, con una tabla
   por-juego (registro en el cliente que refleja el registro del API) para que otro TCG
   pueda sumar sus atributos sin reformar el componente.
3. Renderizar los controles solo cuando el juego seleccionado es Riftbound: multi-select para
   domain/type/supertype/rarity/set, y energy/might como selección de valores discretos (0..12).
4. Chips activos removibles + persistencia en URL (AC#2), reusando `.tpm-chip` / `.tpm-chip-exit`
   del foundation de motion (TASK-045).
5. Purga de params al cambiar de juego (AC#3) — esto es lo que evita el 400.
6. i18n es/en para cada etiqueta y valor de faceta (AC#5).
7. Estados vacíos y layout móvil (AC#4); micro-interacciones con los tokens/patrones de
   TASK-045, `prefers-reduced-motion` respetado (AC#6).
8. typecheck + biome + tests web; auditoría con el skill `web-design-guidelines`.

## Notas

- Frontend-only. Ruta pública de solo lectura: sin superficie de flujo de fondos ni regulatoria.
- Branch `task/task-040`.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Riftbound-specific filters shipped in the public catalog sidebar.

**Per-game facet registry.** New `apps/web/src/lib/catalog/game-filters.ts` mirrors the API's `apps/api/src/lib/catalog-filters.ts` 1:1 in param names and OR/AND semantics, consuming `RIFTBOUND_DOMAINS`/`RIFTBOUND_CARD_TYPES`/`RIFTBOUND_SUPERTYPES`/`RIFTBOUND_RARITIES` from `@thepubmarket/shared` rather than hardcoding vocabularies. Each facet declares a `kind` (`multiValue` for domain/type/supertype/rarity, `multiInt` 0–12 for energy/might, `freeText` for `set`) plus `valuesOf(item)` for mock-mode parity. Adding another TCG's attributes later is one registry entry — no component changes.

**Real server-side filtering.** Following the `tcg` precedent (not the client-only condition/language/price path), facets flow through `CatalogQuery.gameFilters` in `lib/api.ts` and `CatalogFilters.game` in `lib/catalog/data.ts` to `GET /catalog` as repeated query params.

**URL is the source of truth, and the 400 is structurally impossible.** `page.tsx` parses searchParams through `parseGameFiltersFromSearchParams(activeGame, sp)`, which reads only facets registered for the active game and silently drops invalid/out-of-vocabulary values so a corrupt URL never reaches the API. `CatalogView.navigate()` rebuilds the URL from scratch using only `facetsFor(nextGame)`, so switching or clearing the game purges Riftbound params by construction — this is what prevents `400 filter_requires_tcg`. The contract was confirmed live against the prod API.

**UI.** One sidebar section per active-game facet (checkbox groups for multiValue/multiInt, a select for `set` populated from loaded items), reusing the existing `controlBase` treatment and the TASK-045 motion classes unchanged (`ActiveChips` fade+shrink exit, `.tpm-grid-item` card fade), so `prefers-reduced-motion` is honoured by the existing global block. Design-audit fixes applied: `min-h-10` touch targets, `truncate`+`translate="no"` on raw game terms, `aria-label` on the set select, `overscroll-contain` on the taller mobile panel, `aria-live="polite"` on the results count.

**Verification.** typecheck clean, biome clean, 42/42 web tests green (incl. 15 new `game-filters.test.ts` cases) and 182 API tests green; `web-design-guidelines` audit of the touched surfaces reported no violations. Deployed to `thepubmarket-web` (version 518a1747).

**Known omission:** facet value counts are not rendered for Riftbound facets — with real server-side filtering, counting against the already-filtered `items` prop would show misleading dead-end zeros. Worth a follow-up once Riftbound has real inventory; correctness is unaffected since the vocabulary is static.
<!-- SECTION:FINAL_SUMMARY:END -->
