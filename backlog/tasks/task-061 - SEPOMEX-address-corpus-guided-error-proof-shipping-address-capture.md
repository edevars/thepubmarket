---
id: TASK-061
title: 'SEPOMEX address corpus: guided, error-proof shipping address capture'
status: Done
assignee: []
created_date: '2026-08-08 01:24'
updated_date: '2026-08-08 03:55'
labels:
  - 'epic:sepomex-address'
milestone: m-2
dependencies: []
references:
  - >-
    https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx
  - apps/api/src/lib/delivery.ts
  - apps/web/src/components/checkout/DeliveryStep.tsx
  - packages/db/src/schema.ts
priority: high
type: feature
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Epic. Shipping addresses at checkout are free text today: the buyer types recipient, phone, line1/line2, colonia, city, state and a 5-digit CP, and the server only checks that the fields are present and that the CP has 5 digits (`apps/api/src/lib/delivery.ts`). Nothing verifies that the CP actually belongs to the city and state written next to it, and nothing helps the buyer spell the colonia the way the courier expects.

A wrong address becomes a failed delivery, and in this marketplace the seller pays the courier (the shipping fee settles inside the seller's direct charge), so every bad address costs a seller money and costs us trust. Cheapest fix available: anchor the address on the CP using the SEPOMEX national postal-code catalogue (Correos de Mexico) — the buyer types 5 digits, and estado / municipio / ciudad get filled and the colonias of that CP get offered, leaving only street, number and references as free text.

Layers touched: D1 (corpus tables + new order columns), API (public CP lookup + server-side normalization at checkout), web (checkout address form).

Product decisions, fixed for this epic:
- The corpus **guides and normalizes; it never gates.** Mexican addresses are legitimately messy (no house number, informal references, rural routes, colonias newer than the catalogue). The form always keeps a free-text escape hatch, and checkout must never reject an address just because it does not match the corpus. Mismatches are recorded on the order for ops, not thrown at the buyer.
- Mexico only. `country` is already pinned to `MX`; widening it is a separate product decision.
- Corpus refresh is a manual, documented operation. The catalogue moves slowly and a cron job is not worth the maintenance cost for a single operator.

Non-goals: buyer address book / saved addresses, street-level or geocoded validation, carrier rate quoting by zone, international addresses.

Regulatory: none. Nothing here touches the money flow; the shipping fee keeps riding inside the seller's direct charge and the platform still never holds funds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All subtasks of this epic are Done
- [x] #2 At checkout, typing a valid 5-digit CP fills estado, municipio and ciudad and offers the colonias belonging to that CP, without the buyer typing them
- [x] #3 An address whose colonia is not in the corpus can still be completed, submitted and paid — no dead end
- [x] #4 Orders record which parts of the submitted address matched the corpus, so ops can spot suspect addresses without blocking buyers
- [x] #5 docs/ingenieria/ documents the corpus source, its version/date and the refresh procedure
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Épica completa y en producción (2026-08-08). Las cinco subtareas cerradas, todo mergeado a `main` y desplegado.

**Qué cambió para el comprador.** El formulario de envío del checkout se ancla en el código postal: escribe 5 dígitos y municipio y estado se llenan solos, y la colonia deja de ser texto libre para volverse la lista de las que existen en ese CP. Lo único que teclea es lo que solo él sabe.

**La regla que sostiene todo:** el corpus guía, nunca bloquea. Colonia en la lista, colonia escrita a mano, CP desconocido, API caída, sin conexión — los cinco caminos terminan en una orden pagada. Nada de esta épica puede impedir un pago.

| Subtarea | Qué dejó |
|---|---|
| .01 | Catálogo Nacional de Códigos Postales en D1: 159,006 asentamientos, 31,877 CPs. Refresh de un comando, idempotente. |
| .02 | `GET /address/postal-codes/:cp` público, cacheado en KV por vintage y por versión de contrato, con rate limit. |
| .03 | Formulario CP-first en el checkout, con lectura en vivo del CP y salida a captura manual siempre disponible. |
| .04 | Cotejo server-side: la orden guarda si la dirección coincide con el catálogo, y el panel del vendedor lo muestra antes de imprimir la guía. |
| .05 | Localidad de las tiendas resuelta del corpus; la recolección dejó de depender de si alguien escribió "CDMX" o "Ciudad de México". |

**Tres cosas que solo aparecieron midiendo el catálogo real**, y que cambiaron el diseño respecto a lo que decían las tasks:

1. Ningún CP tiene dos ciudades distintas. Los 324 que parecían tenerlas mezclan asentamientos con ciudad y sin ella, así que la ciudad **sí** se resuelve a nivel CP y se autocompleta.
2. "Ciudad de México" es el único nombre de ciudad del país que abarca más de un municipio (sus 16 alcaldías). Por eso el emparejamiento de tiendas usa ciudad y no municipio: con municipio, Condesa habría dejado de emparejar con Coyoacán.
3. SEPOMEX no modela zonas metropolitanas. Zapopan y Guadalajara son ciudades distintas para el catálogo, así que la comparación de texto libre se conservó en paralelo en vez de sustituirse.

**Regulatorio:** ninguna implicación. Nada de esto tocó el flujo de fondos; el flete sigue viajando dentro del direct charge del vendedor y la plataforma sigue sin custodiar dinero.

**Dos cosas abiertas, ninguna bloqueante:**

- **Términos de uso de la fuente.** El catálogo se publica gratuito para uso particular, sin comercialización ni distribución a terceros. El endpoint se diseñó del lado de "consulta" —un CP por petición, sin volcado ni búsqueda por nombre, con rate limit— pero la decisión de negocio sigue abierta. No es asesoría legal.
- **Las 5 tiendas siguen sin código postal**, reportadas para revisión humana. No se inventaron CPs para negocios reales. Ninguna deja de funcionar mientras tanto: siguen emparejando por su ciudad de texto libre.
<!-- SECTION:FINAL_SUMMARY:END -->
