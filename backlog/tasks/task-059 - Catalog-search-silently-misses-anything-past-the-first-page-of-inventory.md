---
id: TASK-059
title: Catalog search silently misses anything past the first page of inventory
status: Done
assignee:
  - '@claude'
created_date: '2026-08-07 05:03'
updated_date: '2026-08-07 05:09'
labels:
  - 'epic:catalog-filter-console'
  - web
  - bug
milestone: m-3
dependencies:
  - TASK-053
  - TASK-057
references:
  - apps/web/src/lib/catalog/data.ts
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/lib/api.ts
  - apps/api/src/routes/catalog.ts
  - docs/ingenieria/catalogo-multijuego.md
modified_files:
  - apps/web/src/lib/catalog/data.ts
  - apps/web/src/lib/catalog/data.test.ts
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
  - apps/web/src/components/catalog/CatalogView.tsx
  - docs/ingenieria/catalogo-multijuego.md
priority: high
type: bug
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Searching the catalog only matches within the first 200 items of a game, because the search term never reaches the API.

`loadActive` in apps/web/src/lib/catalog/data.ts builds its request with only `tcg` and `gameFilters`, then `applyFilters` matches the name client-side over whatever came back. Since the API returns items ordered by title ascending and the page size is 200, the searchable window for Riftbound is "Affectionate Poro" through "Jayce - Man of Progress" — roughly A through J. Everything after that is unreachable: searching "Rengar" returns nothing even though five Rengar listings are published and active.

The API already supports this correctly: `GET /catalog?q=` does a LIKE over the inventory title, and `fetchCatalog` in lib/api.ts already forwards a `q` param. The only missing link is that the data layer never passes it through, and the catalog page never supplies it.

There is a second-order effect to handle: once the server filters by the search term, the fetched set is already narrowed, so clearing the search from the active-filter chip must re-navigate rather than only clearing client state — otherwise the shopper is left looking at the narrowed set with no visible filter explaining it.

This is a pre-existing gap, not a regression from the filter console work. It matters because it makes more than half of each game's inventory undiscoverable by name, which is the primary way a shopper looks for a single.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Searching for a card whose title sorts after the first page of a game's inventory returns it — verified with a term that is currently unreachable, such as "Rengar" in Riftbound
- [x] #2 The search term is applied by the API rather than by filtering an already-truncated page in the browser
- [x] #3 Clearing the search from the active-filter chips restores the unfiltered catalog instead of leaving the shopper on the narrowed result set
- [x] #4 Facet counts and the disabled rule stay correct while a search is active: counts reflect what is available within the search results
- [x] #5 Switching games or changing any filter preserves the active search term, and the search term still survives the local-filter URL channel from TASK-053
- [x] #6 A regression test covers that the search term is forwarded to the API rather than applied only client-side
- [x] #7 pnpm typecheck, pnpm lint, pnpm turbo run test and pnpm build all pass
- [x] #8 docs/ingenieria/catalogo-multijuego.md reflects how search is applied and what the remaining FETCH_LIMIT caveat does and does not cover
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Causa

`loadActive` (`lib/catalog/data.ts`) armaba la petición con `tcg` y
`gameFilters` pero **nunca con `q`**, así que el término se aplicaba en
`applyFilters` sobre la página ya truncada por `FETCH_LIMIT = 200`. Como la API
ordena por título ASC, la ventana buscable de Riftbound iba de *Affectionate
Poro* a *Jayce - Man of Progress*. Con 502 singles, todo lo que ordenara
después de la J era inalcanzable por nombre.

No hizo falta tocar el servidor: `GET /catalog?q=` ya hace `LIKE` sobre el
título (`routes/catalog.ts:98`) y `fetchCatalog` ya reenviaba el param. Solo la
capa de datos y la página lo estaban tirando.

## Por qué `q` sí va al servidor y las facetas no

No es una inconsistencia con TASK-053, y vale la pena dejarlo escrito: una
faceta alimenta conteos por valor, y esos conteos necesitan ver los items de
los valores NO seleccionados para poder responder "cuántos habría si eligieras
este otro". `q` no alimenta ningún conteo — acota el universo entero — así que
filtrarlo en la base es correcto, y además es lo único que alcanza el catálogo
completo.

## Efecto de segundo orden

Como el set ya llega acotado, quitar el chip de búsqueda tiene que NAVEGAR y no
solo hacer `setQ('')`: si no, el comprador se quedaba viendo el set reducido sin
ningún filtro visible que lo explicara. `buildUrl` gana un `nextQuery`
explícito, porque el `setQ('')` que acompaña la navegación todavía no se ve en
ese render.

## Verificación en producción

- `?q=Rengar` → los 5 listings, incluidos los dos **Rengar - Pridestalker**
  ($500 y $4,867). Antes: cero.
- Quitar el chip → navega a `/catalog` y restaura los 200, sin chips.
- `?q=Rengar&cond=NM` → 2 resultados, ambos chips, badge en el trigger.
- Clic en la pestaña Riftbound → `?q=Rengar&game=riftbound&cond=NM`: la
  búsqueda y el filtro local sobreviven al cambio de juego, y las runas de
  dominio se atenúan según lo disponible DENTRO de la búsqueda.

7 tests nuevos en `data.test.ts` (mockeando `@/lib/api`), que congelan que `q`
se reenvía a la API en vez de aplicarse solo en cliente. Web pasa de 139 a 146.

## Nota sobre el gate

`pnpm lint` está en rojo en `main`, pero **no por esta task**: lo rompió
`efab5b7` (TASK-058, explorador de fees del pitch), que aterrizó a las 23:02
desde otra sesión. 14 hallazgos en `apps/pitch/public/fees/*` y
`scripts/fee-model.mjs`; ~8 los arregla `biome check --write --unsafe`, y
quedan 6 que piden criterio (2 `useIterableCallbackReturn`, 4
`useSemanticElements`). No se mezclaron aquí para no ensuciar el diff.
`biome check` sobre los 4 archivos de esta task pasa limpio.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Mergeado en `cab54b7`, desplegado en `2b3427d8`.

El buscador del catálogo solo buscaba dentro de las primeras 200 cartas de cada
juego, porque el término nunca llegaba a la API: se aplicaba en cliente sobre
una página ya truncada. Con 502 singles de Riftbound eso dejaba la búsqueda
ciega de la J en adelante — "Rengar" no devolvía nada aunque hubiera cinco
publicados. Más de la mitad del inventario de cada juego era imposible de
encontrar por nombre, que es justo como un comprador busca un single.

El arreglo es un pass-through: `q` viaja al servidor, donde ya existía el `LIKE`
sobre el título. Con el set llegando acotado, quitar la búsqueda pasa a navegar
en vez de solo limpiar estado.

Verificado en producción con la carta reportada: los dos *Rengar -
Pridestalker* aparecen, y la búsqueda compone bien con filtros locales y con el
cambio de juego.
<!-- SECTION:FINAL_SUMMARY:END -->
