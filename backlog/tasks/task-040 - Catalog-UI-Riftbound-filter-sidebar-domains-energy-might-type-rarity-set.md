---
id: TASK-040
title: >-
  Catalog UI: Riftbound filter sidebar (domains, energy, might, type, rarity,
  set)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 05:44'
updated_date: '2026-08-06 07:39'
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
- [ ] #1 When Riftbound is the selected game, the filter sidebar offers domain, energy, might, card type, rarity, and set filters alongside the existing condition/language/foil/price filters
- [ ] #2 Active Riftbound filters appear as removable chips and persist in the URL, so filtered views are shareable and survive reload
- [ ] #3 Switching to another game (or clearing the game) removes Riftbound-specific filters and controls; other games' filtering is unaffected
- [ ] #4 Empty result states render correctly and the sidebar works on mobile viewports
- [ ] #5 Filter labels localized in es and en; typecheck, biome, and existing web tests green
- [ ] #6 Filter micro-interactions use the shared motion foundation (TASK-045): chip add/remove and card grid updates transition smoothly, respecting prefers-reduced-motion; a web-design-guidelines skill audit of touched surfaces reports no violations
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
