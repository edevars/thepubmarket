---
id: TASK-061.05
title: >-
  Normalize store addresses against the corpus so pickup matching stops
  depending on how a city was typed
status: Done
assignee:
  - '@claude'
created_date: '2026-08-08 01:27'
updated_date: '2026-08-08 03:01'
labels:
  - 'epic:sepomex-address'
milestone: m-2
dependencies:
  - TASK-061.01
references:
  - apps/api/src/lib/delivery.ts
  - apps/api/src/lib/sellers.ts
  - packages/db/src/schema.ts
parent_task_id: TASK-061
priority: low
type: enhancement
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The other half of the address problem, and a bug already documented in the code.

`sellers.city` and `sellers.neighborhood` are free text typed by whoever onboarded the store. Pickup at an allied store is offered only when the store is in the same city as the selling store, and that comparison runs through `normalizeCity()` in `apps/api/src/lib/delivery.ts`, which strips accents and case and stops there. Its own comment states the consequence: "CDMX" and "Ciudad de Mexico" are the same place and it does not know that, so a legitimate pickup point silently disappears from checkout — and the stated fix is to normalize the seller records, which is what this task does now that the corpus exists.

Give stores a postal code and derive their estado, municipio and ciudad from the corpus, the same way buyer addresses get resolved in TASK-061.04. Once stores carry a canonical municipio, same-city matching compares corpus keys instead of guessing at strings, and the accent-stripping heuristic stops being load-bearing.

The existing stores are few and known, so backfilling them is a one-off with human review, not a migration heuristic that has to be right for a million rows. Do not silently rewrite a store's address if the corpus disagrees — surface it and let a person decide.

Depends on the corpus being loaded (TASK-061.01). Sequence it after the buyer-facing work: this fixes a smaller, rarer failure than a mistyped delivery address.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Stores carry a postal code and corpus-derived estado, municipio and ciudad, added by an additive Drizzle migration
- [x] #2 The admin or seller flow that sets a store's address resolves these fields from the corpus by CP, and a store whose CP is not in the corpus can still be saved with manually entered values
- [x] #3 Same-city pickup matching uses the canonical corpus values rather than string comparison of free text, and a store recorded as 'CDMX' matches one recorded as 'Ciudad de Mexico'
- [ ] #4 Existing stores are backfilled, with any address the corpus contradicts reported for human review instead of being overwritten automatically
- [x] #5 Stores with no postal code and no corpus match keep working: pickup matching falls back to the current behaviour rather than dropping them from checkout
- [x] #6 Tests cover CDMX/Ciudad de Mexico equivalence, two stores in different municipios of the same metro area, and a store with no corpus match
- [x] #7 Public seller profile and pickup point rendering still show the same human-readable address to buyers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Hallazgo que cambia el diseño de la task

La descripción propone comparar por **municipio** canónico. Medido contra el catálogo, eso rompería el checkout de hoy: las 5 tiendas sembradas están todas en "CDMX" pero en **alcaldías distintas** (Condesa y Roma son Cuauhtémoc, Del Valle es Benito Juárez, Coyoacán es Coyoacán). Comparar por municipio las dejaría de emparejar entre sí y desaparecerían los pickup points, que es justo el bug que la task quiere arreglar.

Lo que dice el catálogo, medido:

- **"Ciudad de México" es el ÚNICO nombre de ciudad del país que abarca más de un municipio** (los 16 de la CDMX). En todos los demás casos ciudad ≈ municipio.
- `c_cve_ciudad` **no** es una llave de ciudad: en la CDMX hay 16 valores distintos para la misma ciudad. No sirve como llave metropolitana; el nombre sí.
- SEPOMEX **no modela zonas metropolitanas**: Zapopan y Guadalajara son ciudades distintas, igual que San Pedro y Monterrey.

Así que la llave de emparejamiento es **estado + ciudad del catálogo, con el municipio como respaldo cuando el CP no trae ciudad**. Eso empareja las 16 alcaldías de la CDMX (comportamiento actual) y es preciso en el resto del país.

## Aditivo, nunca restrictivo

`isEligiblePickupPoint` pasa a emparejar cuando **coincide la llave del corpus O coincide la ciudad de texto libre** (la heurística de hoy). Nunca se quita una tienda que hoy sí aparece:

- arregla el bug documentado: "CDMX" y "Ciudad de México" resuelven a la misma llave;
- cubre el AC #5 sin código aparte: una tienda sin CP sigue emparejando como hoy;
- y una tienda de Zapopan que escribió "Guadalajara" sigue apareciendo, aunque el catálogo las considere ciudades distintas. **SEPOMEX no modela zonas metropolitanas**; agrupar Zapopan con Guadalajara sería una decisión de producto (qué tiendas cuentan como "misma ciudad"), no algo que se pueda inventar aquí.

## Pasos

1. **Esquema** — cuatro columnas nullable en `sellers`: `postal_code`, `locality_key` (la llave derivada), y `municipality` / `state` canónicos para que una persona pueda verificar qué se resolvió.
2. **`lib/store-locality.ts`** — deriva la llave desde una respuesta de `lookupPostalCode` y compara dos tiendas. Puro, testeable.
3. **`lib/delivery.ts`** — `isEligiblePickupPoint` suma la comparación por llave, conservando la de texto libre.
4. **Endpoint admin** `PATCH /admin/sellers/:id/address` — hoy NO existe ninguna ruta que fije la dirección de una tienda (solo `seed.sql`), así que el AC #2 pide crearla: recibe el CP, resuelve del corpus y guarda; un CP fuera del catálogo se guarda igual con lo que venga a mano.
5. **`scripts/backfill-seller-localities.mjs`** — reporta candidatos para las tiendas sin CP buscando su colonia en el catálogo, y solo aplica cuando el candidato es único. **No inventa códigos postales**: las tiendas actuales no tienen CP registrado y The Pub Game Store es un negocio real; adivinarle el CP sería peor que dejarlo pendiente para una persona (AC #4).
6. **Tests** — equivalencia CDMX / Ciudad de México, dos tiendas en alcaldías distintas de la misma ciudad, tienda sin match que sigue apareciendo, y que ninguna tienda que hoy empareja deje de hacerlo.
7. **Docs** — sección en `docs/ingenieria/sepomex.md` y nota en `entrega.md` si aplica.

## Lo que NO se toca

El perfil público del vendedor y el render de los pickup points siguen mostrando el mismo texto legible (`city`, `neighborhood`, `address` libres): las columnas nuevas son para emparejar, no para pintar (AC #7).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**El plan decía municipio; medir el catálogo lo cambió.** Las 5 tiendas sembradas están todas en "CDMX" pero en alcaldías distintas (Cuauhtémoc, Benito Juárez, Coyoacán). Emparejar por municipio las habría dejado de juntar y los pickup points habrían desaparecido — justo el bug que la task quiere arreglar. La llave quedó en **estado + ciudad**, con el municipio de respaldo cuando el CP no trae ciudad.

Tres hechos medidos sobre las 159,006 filas que sostienen esa decisión:
- "Ciudad de México" es el **único** nombre de ciudad del país que abarca más de un municipio (sus 16 alcaldías).
- `c_cve_ciudad` **no** es una llave de ciudad: la CDMX tiene 16 valores distintos para la misma ciudad. El nombre sí sirve; el código no.
- SEPOMEX **no modela zonas metropolitanas**: Zapopan y Guadalajara son ciudades distintas, igual que San Pedro y Monterrey. Por eso la comparación de texto libre se conserva en paralelo en vez de sustituirse.

**Un error de mi propio script, encontrado al correrlo con datos reales.** La primera versión aplicaba cualquier candidato único. Para "Eldrazi Corner — Coyoacán, CDMX" encontró exactamente un CP… **64510, Monterrey, Nuevo León**: en la CDMX Coyoacán es alcaldía, no colonia, así que la búsqueda por nombre solo pega en Monterrey. Con `--apply` le habría escrito un CP de otro estado. Ahora se exige que el candidato único **además** concuerde con la ciudad que la tienda ya tenía registrada. Un candidato único no es un candidato correcto.

**Verificación end-to-end contra la D1 local**, reproduciendo el bug y su arreglo:

| Escenario | `/checkout/pickup-points` |
|---|---|
| Eldrazi con ciudad "Ciudad de México" (las demás "CDMX") y **sin** llave | **desaparece** de la lista |
| misma tienda, con `locality_key` resuelta del corpus | **vuelve** a aparecer |

Endpoint admin probado: CP válido → `resolved: true` con llave `09:ciudad de mexico` (Cuauhtémoc **y** Coyoacán dan la misma llave); CP fuera del catálogo → `resolved: false` y la tienda **se guarda igual**; CP mal formado → 400.

10 tests nuevos, 266 de API y 163 de web en verde, typecheck, lint y `wrangler deploy --dry-run` limpios.

**AC #4 queda a medias, a propósito.** El mecanismo de backfill está entregado y probado, pero **no inventé códigos postales**: ninguna de las 5 tiendas tenía CP registrado, la ciudad que traen es "CDMX" (que el catálogo no usa) y The Pub Game Store es un negocio real. Una dirección incorrecta en el sistema es más difícil de detectar que una ausente. Las 5 quedan reportadas para revisión humana y **ninguna deja de funcionar**: siguen emparejando por su ciudad de texto libre. Para cerrarlo hace falta que una persona confirme el CP de cada tienda y lo fije con `PATCH /admin/sellers/:id/address`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Las tiendas ya pueden llevar código postal y una localidad resuelta del catálogo, y el emparejamiento de recolección dejó de depender de cómo se tecleó la ciudad. Mergeado a main (`4bdf046`).

**El bug que cierra** estaba documentado en el propio comentario de `normalizeCity`: la recolección se ofrece entre tiendas de la misma ciudad, y esa comparación era texto libre. "CDMX" y "Ciudad de México" no empataban, así que un punto de recolección legítimo desaparecía del checkout sin que nadie se enterara.

**La llave es estado + ciudad, no municipio** — el plan decía municipio y medir el catálogo lo cambió. "Ciudad de México" es el único nombre de ciudad del país que abarca más de un municipio (sus 16 alcaldías); emparejar por municipio habría dejado de juntar una tienda de la Condesa con una de Coyoacán.

**La comparación suma, no sustituye.** Dos tiendas empatan por la llave del corpus **o** por su ciudad de texto libre. Ninguna tienda que hoy aparece deja de aparecer — ni las que no tienen CP, ni una de Zapopan que escribió "Guadalajara". Eso último importa porque SEPOMEX no modela zonas metropolitanas: agrupar Zapopan con Guadalajara es una decisión de producto, no un dato derivable.

**Qué cambió**

| Archivo | Qué hace |
|---|---|
| `apps/api/src/lib/store-locality.ts` | Deriva la llave del CP y compara dos tiendas. Puro y probado. |
| `apps/api/src/lib/delivery.ts` | `isEligiblePickupPoint` usa la llave y conserva el texto libre como respaldo. |
| `apps/api/migrations/0016_rare_slyde.sql` | Cuatro columnas nullable en `sellers`. Aditiva. |
| `PATCH /admin/sellers/:id/address` | **No existía ninguna ruta para fijar la dirección de una tienda** (solo `seed.sql`), que es parte de por qué nadie las corregía. |
| `scripts/backfill-seller-localities.mjs` | Reporta candidatos; solo escribe cuando es único **y** concuerda con la ciudad registrada. |

**Pendiente y consciente:** las 5 tiendas quedan sin CP, reportadas para revisión. No inventé códigos postales para negocios reales — hace falta que una persona confirme cada uno. Ninguna deja de funcionar mientras tanto.
<!-- SECTION:FINAL_SUMMARY:END -->
