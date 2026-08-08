---
id: TASK-061.04
title: >-
  Normalize and score the submitted address server-side, and record the result
  on the order
status: Done
assignee:
  - '@claude'
created_date: '2026-08-08 01:26'
updated_date: '2026-08-08 02:49'
labels:
  - 'epic:sepomex-address'
milestone: m-2
dependencies:
  - TASK-061.01
references:
  - apps/api/src/lib/delivery.ts
  - apps/api/src/lib/orders.ts
  - apps/api/src/routes/checkout.ts
  - packages/db/src/schema.ts
parent_task_id: TASK-061
priority: medium
type: feature
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Server side of the epic. The autofill in TASK-061.03 helps honest buyers, but the checkout API takes whatever JSON it is handed: a client can post "CP 06700, Monterrey, Yucatan" today and the order is created exactly like that (`apps/api/src/lib/delivery.ts` validates presence and a 5-digit shape, nothing else). The address that gets frozen on the order is the one the courier reads, so it is worth checking on the server.

What this task does at checkout, before the order is created: match the submitted address against the corpus by CP, replace estado / municipio / ciudad with the corpus's canonical spelling when they clearly refer to the same place (accent- and case-insensitive comparison), match the colonia against the settlements of that CP, and record the outcome on the order — which fields matched, which were corrected, and whether the address matched the corpus at all.

Explicitly not a gate. Per the epic's product decision and the reasoning already written into `delivery.ts`, a strict check rejects real deliverable addresses: colonias newer than the catalogue, rural routes, buyers who write the neighbouring municipio because that is where their post actually arrives. So a mismatch never blocks payment; it is recorded and surfaced to whoever prepares the shipment. The one thing worth reconsidering is a CP whose estado is flatly different from the one submitted, since that is almost always a typo — but even there the buyer gets a chance to confirm rather than a refusal.

Recording is pointless if nobody sees it: the seller panel order detail must show when an address did not match cleanly, so the store can call the buyer before printing a label.

Regulatory: no money-flow change. Shipping fee, application fee and the direct charge stay exactly as they are.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The checkout API matches the submitted address against the corpus by CP and stores canonical estado, municipio and ciudad on the order when the submitted values refer to the same place, ignoring accents and case
- [x] #2 The submitted colonia is matched against the settlements of that CP, and the match outcome (exact, corrected, or not found) is persisted on the order via an additive Drizzle migration
- [x] #3 An address that does not match the corpus — unknown CP, unlisted colonia, or a municipio the corpus does not have — still completes checkout and creates a paid order
- [x] #4 The buyer-facing address stored on the order never loses information the buyer typed: corrections are recorded alongside the original, not on top of it
- [x] #5 A CP whose estado contradicts the submitted estado is flagged distinctly from an ordinary mismatch, and the behaviour chosen for that case is documented in the task notes
- [x] #6 The seller panel order detail shows when a shipping address did not match the corpus cleanly, so the store can verify before shipping
- [x] #7 Orders created before this change keep rendering correctly in buyer and seller views, with no match data
- [x] #8 Tests cover: exact match, accent- and case-only differences, unlisted colonia, unknown CP, estado contradiction, and an address posted directly to the API bypassing the form
- [x] #9 Existing checkout, delivery and post-payment tests still pass and no change is made to how shipping or application fees are computed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Contexto verificado

- `POST /checkout` (`routes/checkout.ts:127-199`) valida el pickup contra la misma regla que vio el comprador, deriva el costo de envío en el servidor, y para envío a domicilio guarda la dirección tal cual con `addressColumns()` de `lib/delivery.ts`. Hoy nadie compara el CP contra el municipio ni el estado.
- `orderToDelivery()` en `lib/orders.ts` arma el DTO que ven comprador y panel; ya tolera órdenes viejas sin método.
- El panel del vendedor pinta la dirección en `DeliveryBlock` (`OrdersView.tsx:212`).
- TASK-061.02 dejó `lookupPostalCode()` con cache en KV llaveado por vintage. **Se reutiliza**: es el mismo dato que acaba de consultar el navegador del comprador, así que el cache suele estar caliente y el veredicto se calcula contra exactamente lo que él vio.
- TASK-061.03 escribe el **municipio** del corpus en el campo `city` de la dirección. La comparación va contra `municipality`, no contra `city` del corpus.

## Reglas del veredicto

Un solo campo queryable, `shipping_address_match`, en orden de precedencia:

| Veredicto | Cuándo |
|---|---|
| `no_corpus` | el catálogo no está cargado en ese ambiente — no es culpa de la dirección |
| `unknown_postal_code` | CP bien formado que el catálogo no registra |
| `state_mismatch` | el estado del CP contradice al escrito |
| `unlisted_settlement` | el CP existe pero su lista no tiene la colonia escrita |
| `corrected` | mismo lugar, ortografía distinta: se guarda la del catálogo |
| `exact` | todo coincide |

**Normalizar sí, reinterpretar no.** Se sustituye por la ortografía canónica SOLO cuando el valor normalizado coincide (mismo lugar, distintos acentos o mayúsculas). Si difiere de verdad, se conserva **lo que escribió el comprador** y se marca. Sobreescribir ahí podría mandar el paquete a otro estado si el error estuvo en el CP y no en el estado.

**El estado contradictorio no bloquea** (AC #5). Es casi siempre un typo, pero cuál de los dos campos es el equivocado no se puede saber desde el servidor, y rechazar el pago por eso descarta también las direcciones raras pero entregables que `delivery.ts` ya documenta. Se marca distinto, se conserva lo escrito y el panel lo muestra antes de imprimir guía.

## Pasos

1. **Esquema** — migración aditiva con tres columnas nullable en `orders`: `shipping_address_match` (el veredicto), `shipping_address_original` (JSON con SOLO los campos que se corrigieron, para que nunca se pierda lo que el comprador escribió — AC #4) y `shipping_corpus_version` (con qué vintage se juzgó).
2. **`apps/api/src/lib/address-check.ts`** — función pura `checkShippingAddress(address, lookup)` que devuelve veredicto, valores a persistir y originales. Pura para que la cubra vitest.
3. **`routes/checkout.ts`** — consulta el CP con `lookupPostalCode` antes del insert y mezcla el resultado en las columnas. No cambia nada del cálculo de montos ni del flujo de Stripe.
4. **DTO y panel** — `OrderDelivery` gana `addressCheck`; `DeliveryBlock` avisa cuando el veredicto no es limpio, con el valor que escribió el comprador a la vista para que la tienda pueda llamarle. `no_corpus` no se le muestra al vendedor: es infraestructura nuestra, no un problema de su orden.
5. **Tests** — coincidencia exacta, diferencias solo de acentos/mayúsculas, colonia fuera de lista, CP desconocido, estado contradictorio, corpus ausente, y una dirección posteada directo a la API saltándose el formulario.
6. **Docs** — sección en `docs/ingenieria/sepomex.md`.

## Invariante regulatorio

No se toca el flujo de dinero. Ni el envío, ni la comisión, ni el direct charge cambian; esta task solo escribe columnas descriptivas en la orden.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**AC #5 — qué se hace con un estado que contradice al CP, y por qué.**

Se marca `state_mismatch`, distinto de cualquier otro desajuste, **no bloquea el pago** y **se conserva lo que escribió el comprador**. El razonamiento: desde el servidor no hay forma de saber cuál de los dos campos trae el dedazo. Si el error estuvo en el código postal y no en el estado, "corregir" el estado con el del CP mandaría el paquete al otro lado del país — el daño de adivinar mal es peor que el de no adivinar. Y rechazar el pago descarta también las direcciones raras pero entregables que `delivery.ts` ya documenta. El panel del vendedor lo muestra antes de imprimir guía, que es cuando corregir todavía es gratis.

**Un veredicto de más respecto al plan.** Se agregó `municipality_mismatch`: sin él, un CP de Iztapalapa con "Coyoacán" al lado caía en `unlisted_settlement` o incluso en `exact` si la colonia casaba por casualidad, y esa es justo una de las direcciones que el AC #3 nombra. La localidad se acepta contra el municipio **o** contra la ciudad del CP: en zonas metropolitanas mucha gente escribe la ciudad y las dos son ciertas.

**Reutiliza el lookup cacheado de TASK-061.02** en vez de consultar D1 aparte. Dos efectos: el veredicto se calcula contra exactamente lo que vio el navegador del comprador, y el cache suele estar caliente porque el formulario acaba de pedir ese mismo CP.

**Verificación:** 18 tests nuevos — 14 del cotejo (coincidencia exacta, solo acentos/mayúsculas, ciudad en vez de municipio, colonia fuera de lista, sin colonia, municipio ajeno, estado contradictorio, precedencia del estado sobre todo lo demás, CP desconocido, corpus ausente) y 4 del DTO (órdenes anteriores a la task sin veredicto, órdenes de recolección, JSON de originales, blob ilegible que no debe tumbar la vista). 256 tests de API y 163 de web en verde, `typecheck`, `lint`, `wrangler deploy --dry-run` y `next build` limpios. Migración aplicada en la D1 local.

**Sin cambio en el flujo de dinero:** ni el envío, ni la comisión, ni el direct charge se tocaron. La task solo escribe columnas descriptivas.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
El servidor ya coteja la dirección de envío contra el corpus antes de crear la orden. Mergeado a main (`9d5d0cf`).

**El problema que cierra.** El formulario CP-first ayuda al comprador honesto, pero `POST /checkout` acepta el JSON que le manden: postear el CP de Coyoacán junto a "Monterrey, Yucatán" creaba la orden tal cual. Lo que queda congelado en la orden es lo que lee el mensajero.

**Descriptivo, nunca una compuerta.** Ningún veredicto impide pagar. Existe para que la tienda pueda llamarle al comprador **antes de imprimir la guía**, que es cuando corregir todavía es gratis.

| Veredicto | Qué pasó | ¿Se le avisa al vendedor? |
|---|---|---|
| `exact` | todo coincide | no |
| `corrected` | mismo lugar, se guardó la ortografía del catálogo | no |
| `unlisted_settlement` | el CP existe, su lista no trae esa colonia | sí |
| `municipality_mismatch` | el municipio/ciudad no es el del CP | sí |
| `state_mismatch` | el estado contradice al del CP | sí |
| `unknown_postal_code` | CP que el catálogo no registra | sí |
| `no_corpus` | catálogo sin cargar en ese ambiente | no — es falla nuestra |

**Normalizar sí, reinterpretar no.** Se adopta la ortografía del catálogo solo cuando el valor normalizado coincide, y lo que escribió el comprador se guarda al lado, nunca encima. Cuando difiere de verdad se conserva lo suyo.

**Qué cambió**

| Archivo | Qué hace |
|---|---|
| `apps/api/src/lib/address-check.ts` | La función pura del veredicto. Reutiliza el lookup cacheado de TASK-061.02, así que juzga contra exactamente lo que vio el navegador del comprador. |
| `apps/api/migrations/0015_dizzy_thena.sql` | Tres columnas nullable: veredicto, JSON de lo que escribió el comprador donde se corrigió, y el vintage que juzgó. Aditiva. |
| `apps/api/src/routes/checkout.ts` | Consulta el CP y mezcla el resultado antes del insert. Ni un cambio en montos ni en el flujo de Stripe. |
| `apps/api/src/lib/orders.ts` | `OrderDelivery.addressCheck`, `null` en órdenes viejas y de recolección. |
| `apps/web/.../OrdersView.tsx` | Aviso ámbar en el panel con lo que escribió el comprador, solo en los veredictos que la tienda puede accionar. |

**Regulatorio:** sin cambio en el flujo de fondos. Envío, application fee y direct charge intactos.

**Pendiente operativo:** la migración remota, la carga del corpus y el deploy siguen sin correr. Hasta entonces producción escribiría `no_corpus` en cada orden de envío — que es exactamente el veredicto diseñado para ese caso y no le avisa nada a nadie.
<!-- SECTION:FINAL_SUMMARY:END -->
