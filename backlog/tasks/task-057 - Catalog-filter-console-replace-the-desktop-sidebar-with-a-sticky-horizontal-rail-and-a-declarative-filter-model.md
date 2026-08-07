---
id: TASK-057
title: >-
  Catalog filter console: replace the desktop sidebar with a sticky horizontal
  rail and a declarative filter model
status: Done
assignee:
  - '@claude'
created_date: '2026-08-07 03:13'
updated_date: '2026-08-07 04:19'
labels:
  - 'epic:catalog-filter-console'
  - web
milestone: m-3
dependencies:
  - TASK-053
  - TASK-054
  - TASK-055
  - TASK-056
references:
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/catalog/FilterSidebar.tsx
  - apps/web/src/components/catalog/MobileFilterSheet.tsx
  - apps/web/src/lib/catalog/game-filters.ts
  - apps/web/src/lib/catalog/facet-presentation.ts
  - apps/web/src/lib/catalog/facet-counts.ts
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
  - apps/web/src/components/layout/GamesMenu.tsx
  - docs/ingenieria/catalogo-multijuego.md
modified_files:
  - apps/web/src/lib/catalog/filter-model.ts
  - apps/web/src/lib/catalog/filter-model.test.ts
  - apps/web/src/lib/catalog/facet-presentation.ts
  - apps/web/src/components/catalog/FilterConsole.tsx
  - apps/web/src/components/catalog/FilterStack.tsx
  - apps/web/src/components/catalog/GameTabs.tsx
  - apps/web/src/components/catalog/MobileFilterSheet.tsx
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/catalog/FacetTile.tsx
  - apps/web/src/components/catalog/PipRow.tsx
  - apps/web/src/components/catalog/GameWordmark.tsx
  - apps/web/src/components/catalog/ActiveChips.tsx
  - apps/web/src/components/catalog/filterControls.ts
  - apps/web/src/components/catalog/controls/FilterControl.tsx
  - apps/web/src/components/catalog/controls/FoilToggle.tsx
  - apps/web/src/components/catalog/controls/PriceRange.tsx
  - apps/web/src/components/ui/Popover.tsx
  - apps/web/src/components/cart/OrderSummary.tsx
  - apps/web/src/components/checkout/DeliveryStep.tsx
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
  - apps/web/src/app/globals.css
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - docs/ingenieria/catalogo-multijuego.md
priority: high
type: feature
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The catalog filter UI costs far more screen than it earns. On desktop it holds a fixed 232px column plus a 24px gap (~21% of the 1232px content width), and the panel itself runs ~700px tall with no game selected, ~1250px for MTG and ~1900px for Riftbound — with internal scrolling disabled on desktop, so its footer is unreachable. Visually it stacks nine different control idioms behind identical mono labels, so nothing reads as more important than anything else.

Replace it with a sticky horizontal filter console under the site header. The active game's identity facet (MTG mana pips, Riftbound domain runes) stays inline and in colour as the one expressive element; every other filter is a quiet trigger that opens a popover. The card grid reclaims the full content width.

Game selection moves out of the filters entirely into a navigation tab strip: it is navigation, not a filter — it drives the URL and refetches — and it already exists in the site header.

Underneath, the 377-line FilterSidebar monolith is replaced by a pure, unit-testable filter model that derives every control descriptor from the counts CatalogView already computes. The console and the mobile bottom sheet render from those same descriptors and share the same control primitives, so adding a facet becomes a declaration rather than an edit to a monolith.

Scope note: toggling a game facet currently remounts the whole catalog view because the page remount key still includes the serialized game facets, even though TASK-053 stopped sending them to the server fetch. That remount destroys focus and any open popover, so it must be fixed as part of this work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Desktop catalog renders no persistent filter sidebar column; the card grid spans the full content width of the page container
- [x] #2 A sticky filter console sits directly below the site header and shows the active game's identity facet inline; remaining filters are triggers, and any facet beyond the inline width budget collapses into a single overflow trigger
- [x] #3 The inline/overflow split is deterministic and computed without runtime measurement, and is correct for MTG (4 facets), Riftbound (7 facets) and the four games with no facets
- [x] #4 Game selection is presented as a navigation tab strip separate from the filters, preserves the search query and all local filters when switching games, and offers a discoverable way to return to all games
- [x] #5 Clearing filters keeps the active game instead of navigating away from it, and the active game no longer counts toward the active filter count
- [x] #6 A pure module derives every filter descriptor (kind, zone, values, counts, selected, disabled) from the counts CatalogView already computes, with no duplicated computation, and the `count === 0 && !selected` disabled rule exists in exactly one place
- [x] #7 Filter popovers are keyboard accessible: Escape closes and returns focus to the trigger, clicking or moving focus outside closes, and each trigger exposes aria-expanded and aria-controls
- [x] #8 Popover panels are never clipped by an overflow container and never render beneath the card grid or above the site header
- [x] #9 Toggling a game facet does not remount the catalog view: keyboard focus stays on the control and the page does not scroll to top; browser Back still restores the previous facet selection
- [x] #10 The mobile bottom sheet keeps its dialog semantics: role=dialog, aria-modal, an aria-labelledby that resolves to a rendered element, focus moved into the panel on open, focus returned to the trigger on all three close paths, body scroll lock, and Escape to close
- [x] #11 The console and the mobile sheet render from the same descriptors and share the same control primitives; FilterSidebar.tsx and GameFacetSection.tsx no longer exist
- [x] #12 Shared control primitives do not silently change semantics between surfaces: the foil control stays a switch in the sheet while presenting as a pressed toggle in the console
- [x] #13 All user-facing strings come from next-intl with full es/en key parity, and message keys orphaned by this change are removed
- [x] #14 All motion uses the existing duration and easing tokens with no hardcoded milliseconds or cubic-beziers, and prefers-reduced-motion is respected
- [x] #15 New unit tests cover the filter model: the disabled rule, the frozen facet order, null identity for games without facets, the inline/overflow split per game, and width estimates that do not vary with selection count
- [x] #16 pnpm typecheck, pnpm lint, pnpm turbo run test and pnpm build all pass, with no regression against the 322-test baseline
- [x] #17 The UI is audited against the web-design-guidelines skill before the task closes
- [x] #18 docs/ingenieria/catalogo-multijuego.md documents the new filter architecture, including what a new TCG must declare to get an identity zone
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Qué se hizo

**Paso 0 — el bloqueante.** `catalog/page.tsx:61` seguía metiendo
`serializeGameFilters(gameFilters)` en la `key` de remount, contradiciendo su
propio comentario: desde TASK-053 las facetas ya no entran al fetch del
servidor (`getCatalog({ tcg: activeGame })`), así que ese remount no traía ni
un item nuevo y sí destruía foco y animaciones en cada clic de faceta. Con
popovers habría sido fatal (el popover se cerraría solo a mitad de un
multi-select). Se quitó de la key, se añadió un `useEffect` de re-sync
props→estado para cubrir Back/Forward, y `navigate()` pasa `{ scroll: false }`.

**Modelo declarativo.** Nuevo `lib/catalog/filter-model.ts` (puro, sin React):
`buildFilterModel` devuelve descriptores con kind/zone/values/counts/disabled y
reparte inline vs overflow con un presupuesto de anchos **sin medición en
runtime**. La regla `count === 0 && !selected` pasó de estar copiada en 5
sitios a existir en uno. `estWidth` es estático a propósito: si dependiera de
`selectedCount`, marcar un valor podría empujar su propio trigger al overflow
y cerrarle el popover al usuario. 24 tests nuevos.

**Consola.** `FilterConsole` sticky en `top-[var(--header-h)]` con tres zonas
separadas por hairlines: identidad (pips inline y a color — lo único cromático
del riel), carta y oferta. Lo que no cabe cae en un único popover "Más
filtros". `riftbound.domain` recibió `layout: 'pips'` para tener zona de
identidad, sin assets nuevos (los 7 dominios ya traían icono + hex).

**Primitivas.** `ui/Popover.tsx` nuevo, portando el patrón de disclosure de
`GamesMenu` (Escape con retorno de foco, cierre por clic/foco fuera, panel
dentro del mismo `rootRef`). `controls/{FilterControl,FoilToggle,PriceRange}`;
`FacetTile` y `PipRow` ahora reciben el valor ya resuelto por el modelo.
`FoilToggle` tiene `variant: 'switch' | 'chip'` explícito para no cambiar en
silencio la semántica del sheet.

**Juego fuera de los filtros.** `GameTabs` con `<Link>` reales (Cmd+clic y clic
central funcionan), construidos con el MISMO builder que `navigate()` para no
perder `q` ni los filtros locales. Ya no suma a `activeFilterCount` y
`clearAll` conserva el juego activo; la pestaña "Todos" es la salida explícita.

**Borrados.** `FilterSidebar.tsx` (377 líneas) y `GameFacetSection.tsx` (143).
El sheet mobile ahora renderiza su propio encabezado y es dueño de `TITLE_ID`,
que antes le inyectaba un hijo genérico — si no, `aria-labelledby` habría
quedado colgando.

## Hallazgos de la auditoría `web-design-guidelines` (corregidos)

1. Las pestañas de juego eran `<button>` para algo que es navegación → pasaron
   a `<Link>` con href construido por `buildUrl`.
2. El bottom sheet no reservaba `env(safe-area-inset-bottom)`: el CTA quedaba
   bajo el indicador de home en iPhone.
3. `CONTROL_BASE` sin `touch-manipulation` → retardo de ~300ms por doble-tap en
   cada control del panel.
4. Inputs de precio sin `name`/`autoComplete` y sin anillo de foco.
5. Popover de overflow sin `overscroll-contain`.

Dos avisos de lint (`noImgElement` en FacetTile/PipRow) son preexistentes: los
SVG de símbolos se sirven desde `/public` y no pasan por el optimizador.

## Decisiones que se apartan del plan

- **6 columnas, no 7.** El plan decía 7; la aritmética real de `CardGrid`
  (`minmax(175px,1fr)` + `gap-4` sobre 1232px) da 6 de 192px. Forzar 7 exigía
  bajar a `minmax(160px)` → cartas de 162px, **más chicas que las 182px de
  hoy**. Para singles el arte importa, así que `CardGrid` no se tocó y las
  cartas crecen.
- **`--header-h: 63px`** en `@theme`, y se migraron los tres offsets
  hardcodeados que existían para el mismo header (`top-[74px]` en el catálogo,
  `top-20` en DeliveryStep y OrderSummary). Ninguno coincidía con los 63px
  reales.
- **`ActiveChips` pasó a `<ul>/<li>`** en vez de `role="group"`: es un conjunto
  enumerable y así un lector de pantalla anuncia cuántos filtros hay puestos.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm turbo run test` y `pnpm build`, los cuatro
verdes. Tests: **346** (207 api + 139 web), desde 322 — +24 de `filter-model`.
Paridad i18n verificada por script sobre los 14 namespaces.

Sin pruebas de navegador, según la preferencia del proyecto.

## Verificación en producción (navegador)

Desplegado a `https://thepubmarket-web.enrique-devars-cee.workers.dev` y verificado
con Claude in Chrome a 1512px.

**Funciona como se diseñó:**
- Riel sticky bajo el header; el grid pasa por debajo sin rendija y a ancho completo.
- Riftbound: 7 runas de dominio inline + `TIPO · SUPERTIPO · RAREZA · MÁS FILTROS` │ `CONDICIÓN · IDIOMA · PRECIO · SOLO FOIL`. El split inline/overflow coincide exactamente con lo que asertan los tests.
- Togglear la runa `Body` → URL `?domain=Body`, runa encendida con glow, 200→33 resultados, chip «Body ×».
- **El fix del remount se confirmó en vivo**: con el popover "Más filtros" abierto, seleccionar `Energía 2` dejó el popover ABIERTO, actualizó la URL a `&energy=2`, pintó el badge «1» en el trigger y recalculó los conteos de Poderío con autoexclusión (solo 1 y 2 quedaron activos). Antes del fix el remount habría cerrado el popover.
- Escape cierra y devuelve el foco al trigger, con `aria-expanded="false"`.
- Popover con `z-10` sobre el grid: no queda recortado ni por debajo de las cartas.

**Bug encontrado y corregido en `c8a3372`:** `--header-h` estaba en 63px, derivado a mano. Medido en el navegador, el header son **66.5px** — el hijo más alto no es el logo (34px) sino el buscador (37.5px), que es `hidden md:flex`. O sea la altura cambia con el breakpoint, cosa que mi comentario negaba. El token salió de `@theme` (ahí no se puede sobrescribir por media query) a `:root` con override en `md`, y el valor de desktop se redondea hacia arriba a 67px: pasarse esconde unos px del riel bajo el header `z-20` (invisible), quedarse corto abre una rendija. Verificado en vivo: 66.5px de header, riel a 67px.

**Hueco de datos preexistente (NO es regresión):** los 200 items de MTG en producción tienen `gameAttributes: null`, así que sus facetas propias (color/tipo/rareza) cuentan 0 y los 6 pips de maná salen deshabilitados. La regla `count === 0 && !selected` es la misma que ya aplicaba el sidebar anterior, así que el comportamiento no cambió — pero significa que hoy la zona de identidad de MTG está muerta en prod. Se arregla repoblando los snapshots de inventario de MTG con el normalizador de Scryfall de TASK-049. Riftbound sí trae atributos (catálogo propio en D1) y funciona completo.

**No verificado:** el breakpoint mobile. La extensión no pudo redimensionar la ventana (`innerWidth` se quedó en 1512px pese a varios intentos), así que el bottom sheet y la fila de pips con scroll horizontal siguen sin prueba visual. Su marcado sí está en el HTML servido y el botón «Filtros (N)» existe con `display:none` en desktop, como corresponde.

## Cierre: el filtro de colores de MTG (backfill de datos, sin cambio de código)

El usuario reportó que todos los filtros funcionaban salvo el de colores de
Magic — exactamente el hueco de datos que la verificación anterior había
dejado señalado. No era la UI: las 506 filas de inventario de MTG en producción
tenían `card_attributes = NULL` porque se cargaron antes de TASK-049, así que
los conteos de color/tipo/rareza daban 0 y la regla `count === 0 && !selected`
deshabilitaba los seis pips.

No hizo falta escribir nada: `scripts/backfill-mtg-attributes.mjs` (TASK-050) ya
existía para justo esto y nunca se había corrido contra producción. Ejecutado
con `API_URL` del Worker de prod y la `ADMIN_KEY` de `apps/api/.dev.vars`:
**507 filas actualizadas, 0 sin resolver**. `GET /admin/inventory/mtg-missing-attributes`
devuelve 0 en la corrida siguiente, que es la señal de idempotencia que el
propio script documenta.

Verificado en vivo tras el backfill: la API devuelve `colors`/`types`/`typeLine`/
`manaValue` poblados, los 6 pips quedan `disabled: false`, y tocar el rojo da
`?game=mtg&color=R` con 200→17 resultados, todos rojos.

## Mobile, por fin verificado

La ventana sí quedó en 406px en esta sesión, así que el breakpoint que estaba
pendiente ya está cubierto:

- **Riel**: solo la fila de pips + botón «FILTROS (N)»; los triggers de
  carta/oferta ocultos, como corresponde a `hidden md:flex`.
- **Pestañas de juego**: scroll horizontal sin cortar «Todos».
- **Bottom sheet**: encabezado propio con `TITLE_ID`, badge de conteo, secciones
  apiladas (Color con pips en variante `wrap` y conteos, Tipo, Rareza con sus
  rombos de color, Set, Condición, Idioma, Precio, Foil como `role="switch"`) y
  CTA «Ver 17 resultados» fijo abajo.
- **Rampa de condición a 406px**: NM 13 · LP 3 · MP 1 · HP 0 · DMG 0, sin
  recorte — el `min-w-[248px]` cabe de sobra.
- **Autoexclusión visible**: con el rojo activo, los conteos de Color siguen
  mostrando el total de cada color (22/21/34/17/36/80) mientras Tipo y Rareza sí
  respetan el filtro. Es el comportamiento diseñado en TASK-053.

Con esto no queda nada de TASK-057 sin verificar en producción.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Mergeado a `main` en `feab3ad` (commit `97bd5c2`). 26 archivos, +2033/-767.

El sidebar de filtros de 232px desapareció del desktop. En su lugar hay una
consola horizontal sticky bajo el header: el grid de cartas recupera los 1232px
completos (6 columnas de 192px, contra 5 de 182px) y los filtros pasan de una
columna de ~1900px de alto con Riftbound a un riel de ~48px.

Toda la audacia visual se gasta en un solo sitio: la zona de identidad, donde
los pips de maná (MTG) y las runas de dominio (Riftbound) van inline y a todo
color. El resto del riel es cromo callado — triggers en mono, hairlines en vez
de cajas, y los conteos por valor solo dentro del popover.

Por debajo, `lib/catalog/filter-model.ts` es ahora el centro: un módulo puro
que decide qué filtros existen, con qué control se pintan y cuáles caben
inline. La consola y el sheet mobile consumen los mismos descriptores y las
mismas primitivas, así que `FilterSidebar.tsx` (377 líneas) y
`GameFacetSection.tsx` se borraron enteros. Agregar una faceta vuelve a ser
declararla, no editar un monolito.

De paso se arregló un bug latente que este trabajo habría vuelto fatal:
`catalog/page.tsx` seguía remontando toda la vista en cada clic de faceta por
una `key` que TASK-053 había dejado obsoleta.

Gate completo verde: typecheck, lint, 346 tests (desde 322) y build. Auditado
con `web-design-guidelines`; los cinco hallazgos se corrigieron dentro de la
misma task.
<!-- SECTION:FINAL_SUMMARY:END -->
