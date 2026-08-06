---
id: TASK-039
title: >-
  Catalog API: Riftbound-specific filter parameters (domain, energy, might,
  type, rarity, set)
status: In Progress
assignee:
  - claude
created_date: '2026-08-06 05:44'
updated_date: '2026-08-06 07:31'
labels:
  - 'epic:riftbound-ux'
  - api
milestone: m-3
dependencies:
  - TASK-038
references:
  - apps/api/src/routes/catalog.ts
  - apps/api/src/lib/inventory.ts
  - packages/shared/src/index.ts
  - apps/api/src/routes/catalog.test.ts
modified_files:
  - apps/api/src/lib/catalog-filters.ts
  - apps/api/src/lib/catalog-filters.test.ts
  - apps/api/src/routes/catalog.ts
  - packages/shared/src/index.ts
  - packages/db/src/schema.ts
priority: high
type: feature
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GET /catalog today only supports q, tcg, set, seller, limit, offset — no game-specific filter params exist anywhere in the API. To give the public Riftbound catalog real filtering (the core of the `epic:riftbound-ux` epic), the API must accept Riftbound attribute filters that operate on the metadata exposed by TASK-038 (inventory card_attributes / catalog_cards game_attributes).

Outcome: the public catalog endpoint supports filtering Riftbound listings by domain(s), energy, might, card type, supertype, rarity, and set, combinable with the existing params, with a filter design generic enough that a future TCG (e.g. MTG colors, Pokémon types) can add its own attribute filters without reshaping the API.

Depends on TASK-038, which exposes game attributes, rarity, and set metadata in catalog responses and defines the game-agnostic metadata contract these filters operate on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GET /catalog accepts Riftbound filters — domain(s), energy, might, card type, supertype, rarity, set — combinable with existing q/tcg/seller/limit/offset params
- [x] #2 Invalid filter values return 400 with the supported values, consistent with the existing invalid_tcg error shape
- [x] #3 Game-specific filters apply only when tcg=riftbound; behavior when passed with another game (or none) is explicit and documented (rejected or ignored, one rule)
- [x] #4 Edge cases covered: multi-domain cards match any selected domain, null energy/might handled, filters compose with q and seller correctly
- [x] #5 Typecheck, biome, and vitest green with tests for each filter, combinations, and the error cases
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Filters live in a NEW pure module `apps/api/src/lib/catalog-filters.ts` built around a per-TCG
**filter registry**, so a future game (MTG colors, Pokémon types) registers its own specs without
touching the route or reshaping the API.

### Data facts (verified against local D1, `catalog_cards` tcg='riftbound', 1409 rows)
- domains (`$.domains`, array): Body, Calm, Chaos, Colorless, Fury, Mind, Order
- type (`$.type`): Battlefield, Gear, Legend, Rune, Spell, Unit (null on 6 rows)
- supertype (`$.supertype`): Basic, Champion, Signature, Token (null on 909 rows)
- rarity (column `inventory.rarity`, lowercase): common, uncommon, rare, epic, showcase
- energy/might (`$.energy`, `$.might`): ints 0..12, null on 294 / 620 rows
- sets: ARC, OGN, OGS, SFD, UNL, VEN (free-form — NOT validated, new sets ship constantly)

### Design rules
1. Registry: `GAME_FILTERS: Partial<Record<Tcg, FilterSpec[]>>`; only `riftbound` populated today.
   Spec kinds: `jsonArray` (domains), `jsonScalar` (type/supertype), `jsonInt` (energy/might),
   `column` (rarity). Each spec declares param name, allowed values (or int range) and SQL builder.
2. All game filters are **multi-value** (repeated param and/or comma-separated) with **OR** semantics
   within a param, **AND** across params. Multi-domain cards match if ANY selected domain matches (AC#4).
3. **AC#3 rule — reject, don't ignore.** Any game-specific param present without the matching
   `tcg` → `400 { error: 'filter_requires_tcg', param, requiresTcg: 'riftbound' }`.
4. **AC#2** invalid value → `400 { error: 'invalid_filter', param, supported: [...] }`, same shape
   family as the existing `invalid_tcg` + `supported` response.
5. `set` stays as-is (generic, exact `set_code`, no validation, works for every game).
6. Null-safe SQL (verified in sqlite3): wrap the blob in `iif(json_valid(x), x, NULL)` so a corrupt
   or NULL `card_attributes` yields 0 rows instead of "malformed JSON" at step time.
   - domains: `EXISTS (SELECT 1 FROM json_each(json_extract(<guard>,'$.domains')) WHERE value IN (...))`
   - scalar/int: `json_extract(<guard>,'$.energy') IN (...)` → rows with null energy never match.

### Steps
1. `packages/shared`: export `RIFTBOUND_DOMAINS`, `RIFTBOUND_CARD_TYPES`, `RIFTBOUND_SUPERTYPES`,
   `RIFTBOUND_RARITIES` (documented as the filter vocabulary, sourced from the dotgg import).
2. New `apps/api/src/lib/catalog-filters.ts` + `catalog-filters.test.ts`.
3. Wire into `GET /catalog` in `apps/api/src/routes/catalog.ts` after the `tcg` parse; filters
   compose with the existing q/tcg/set/seller/limit/offset `and(...)`, and the `total` count uses
   the same `where` (already shared).
4. Tests (vitest, node env — routes are not runtime-testable here): every filter, multi-value,
   combinations, both 400 shapes, null/corrupt attribute handling at the parse layer.
5. Manual SQL evidence for AC#4: synthetic riftbound inventory rows (multi-domain, null energy,
   corrupt JSON blob) inserted into the local D1 sqlite, exact generated WHERE clauses run against it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ejecutado según el plan, sin desviaciones de alcance.

**Evidencia de AC#4 (semántica SQL contra sqlite real).** Los tests de vitest de este repo son node-env sin runtime de Workers, así que la semántica de la query se validó aparte: copia del D1 local + 4 filas sintéticas de inventory riftbound (una multi-dominio Fury+Order, una con energy/might null, una con `card_attributes` corrupto `'{not json'`, una con `card_attributes` NULL) y se corrió el SQL EXACTO que emiten los builders vía `node:sqlite` + `SQLiteSyncDialect.sqlToQuery`. Resultados: `domain=Fury,Order` y `domain=Order` → solo la multi-dominio; `domain=Fury&domain=Calm` → ambas; `energy=3` → solo la que la tiene, `energy=0` → vacío (la de energy null nunca matchea); `rarity=epic,showcase` → las filas de blob corrupto y NULL (rarity es columna, no depende del JSON); compone con `q` LIKE y `seller`. Ninguna query lanzó "malformed JSON": el guard `iif(json_valid(...), ..., NULL)` cubre blob corrupto y NULL. SQL emitido (parametrizado, sin interpolación):

```sql
EXISTS ( SELECT 1 FROM json_each(json_extract(iif(json_valid("inventory"."card_attributes"), "inventory"."card_attributes", NULL), ?)) WHERE value IN (?, ?) )
-- params: ["$.domains","Fury","Order"]
```

El script de evidencia era temporal y se borró; no queda en el repo (dependía de una copia local de la D1 con datos importados).

**Ajuste sobre lo entregado por el subagente:** el parseo de energy/might usaba `Number(raw)`, que acepta `0x10`, `1e2` y `3.0` como enteros válidos. Se endureció a `/^\d+$/` — un param de faceta no debe admitir notaciones alternas.

**Vocabulario:** las constantes `RIFTBOUND_*` son los valores distintos REALES del catálogo importado (1409 filas de `catalog_cards`, import de dotgg / TASK-036), no una lista de las reglas del juego: domains incluye `Colorless` (92 cartas) y rarities incluye `showcase`. Si un import futuro trae un valor nuevo, hay que sumarlo ahí o el filtro lo rechazará con 400.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Qué cambió

`GET /catalog` acepta filtros de atributos de Riftbound: `domain`, `type`, `supertype`, `energy`, `might`, `rarity` (más el `set` que ya existía), combinables entre sí y con `q`/`tcg`/`seller`/`limit`/`offset`.

La lógica vive en un módulo nuevo y puro, `apps/api/src/lib/catalog-filters.ts`, construido sobre un **registro de filtros por juego** (`GAME_FILTERS: Partial<Record<Tcg, FilterSpec[]>>`, hoy solo `riftbound`). Un juego futuro (colores de MTG, tipos de Pokémon) registra sus specs ahí sin tocar el handler ni reformar la API — que era el requisito de diseño del task. Cuatro tipos de spec cubren todo lo necesario: `jsonArray` (domains), `jsonScalar` (type/supertype), `jsonInt` (energy/might) y `column` (rarity).

## Decisiones

- **Multi-valor con OR dentro del param, AND entre params.** Se acepta tanto repetido (`domain=Fury&domain=Order`) como separado por comas (`domain=Fury,Order`). Una carta multi-dominio matchea con CUALQUIERA de los dominios seleccionados, que es lo que espera una UI de facetas.
- **AC#3 — se rechaza, no se ignora.** Cualquier param game-specific con `tcg` ausente o distinto de `riftbound` devuelve `400 { error: 'filter_requires_tcg', param, requiresTcg }`. Ignorarlo en silencio haría que un typo en `tcg` devolviera un catálogo sin filtrar que parece filtrado.
- **Valores inválidos** → `400 { error: 'invalid_filter', param, value, supported }`, misma familia de forma que el `invalid_tcg` + `supported` existente.
- **Matching case-insensitive** normalizado a la casing canónica antes de tocar SQL (los datos son TitleCase en domains/type/supertype y minúsculas en rarity). Contrasta a propósito con `tcg`, que sí es case-sensitive: ahí los códigos son ids estables, aquí son valores de faceta que teclea el usuario.
- **`set` se queda como estaba**: genérico, `set_code` exacto, sin validación y sin gate por juego — los sets nuevos entran constantemente vía import y no hay enum estable que mantener.
- **SQL null/corrupt-safe.** Todo acceso JSON pasa por `iif(json_valid(card_attributes), card_attributes, NULL)`: `json_each`/`json_extract` sobre un blob malformado lanzan "malformed JSON" al ejecutar (500), no al parsear. Todas las filas de MTG tienen `card_attributes` NULL hoy. Los valores van como parámetros ligados (`sql.join`), nunca interpolados.
- Sin cambios de esquema ni de migraciones: los filtros corren sobre columnas y JSON que ya existían (TASK-038). El único toque a `packages/db/src/schema.ts` es un comentario que decía "nada filtra por esto" y ya no era cierto.

## Tests

32 tests nuevos en `apps/api/src/lib/catalog-filters.test.ts`: cada filtro por separado, multi-valor repetido y por comas, normalización de casing, combinaciones, `filter_requires_tcg` para cada param × {sin tcg, tcg=mtg}, `invalid_filter` (enum inválido, no-entero, negativo, fuera de rango), valores en blanco tratados como ausentes y params no registrados ignorados. La semántica SQL se validó aparte contra sqlite real (ver notas de implementación).

`pnpm typecheck` (4/4), `pnpm lint` (biome, 195 archivos, sin hallazgos) y `pnpm turbo run test` (17 archivos / 182 tests) en verde.

## Riesgos / seguimiento

- Las constantes `RIFTBOUND_*` son un snapshot del catálogo importado; un valor nuevo en un import futuro se rechaza con 400 hasta que se agregue a la lista.
- `rarity` queda detrás del gate de `tcg=riftbound` porque su vocabulario es por juego. Cuando MTG registre sus propios filtros, hereda el mismo mecanismo sin cambios en la ruta.
- La UI del catálogo Riftbound que consume estos params es trabajo aparte del epic `riftbound-ux`.
- Sin implicaciones de flujo de fondos: es ruta pública de solo lectura.
<!-- SECTION:FINAL_SUMMARY:END -->
