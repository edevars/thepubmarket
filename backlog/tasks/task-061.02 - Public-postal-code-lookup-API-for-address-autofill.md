---
id: TASK-061.02
title: Public postal-code lookup API for address autofill
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-08 01:24'
updated_date: '2026-08-08 01:56'
labels:
  - 'epic:sepomex-address'
milestone: m-2
dependencies:
  - TASK-061.01
references:
  - apps/api/src/routes/catalog.ts
  - apps/api/src/lib/rate-limit.ts
  - packages/shared/src/index.ts
parent_task_id: TASK-061
priority: high
type: feature
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
API layer of the epic. The checkout form needs one call it can make while the buyer is still typing: give it a 5-digit CP, get back everything the corpus knows about that CP.

TASK-061.01 provides the corpus in D1 (settlements by CP, with tipo de asentamiento, municipio, estado, ciudad, and the loaded vintage). This task exposes it.

What the consumer needs from one response: the estado and municipio (a CP never spans two), the ciudad when the corpus has one, and the full list of colonias for that CP with their tipo. Unknown CPs are an ordinary, expected outcome — brand-new developments and typos both land there — so they get a clean empty answer, not an error the client has to special-case as a failure.

This is unauthenticated, high-frequency, and hit once per keystroke-completion during checkout, so it has to be cheap: the corpus is immutable between refreshes, which makes it aggressively cacheable at the edge. It is also public reference data with zero PII — the request carries a CP, never a buyer's address — so nothing here needs logging beyond ordinary request metrics. Still needs rate limiting; the repo already has `apps/api/src/lib/rate-limit.ts`.

The response shape is shared contract: put the types in `packages/shared` so the web app consumes them without redefining them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A public API endpoint takes a 5-digit postal code and returns estado, municipio, ciudad (when known) and the list of colonias with their tipo de asentamiento
- [ ] #2 A syntactically valid but unlisted CP returns a successful, explicitly empty result the client can render as 'not found', not an error status
- [ ] #3 A malformed CP (wrong length, non-digits) is rejected with a validation error and never reaches the database
- [ ] #4 Responses are cached at the edge and served without a database round-trip on repeat hits; the cache is invalidated or keyed so a corpus refresh does not keep serving stale settlements
- [ ] #5 The endpoint is rate limited using the existing rate-limit helper, and the limit is high enough that a buyer filling one form is never throttled
- [ ] #6 The response includes or exposes the corpus vintage so clients can tell how current the data is
- [ ] #7 Request and response types live in packages/shared and are consumed by the web app rather than re-declared
- [ ] #8 Tests cover: known multi-colonia CP, known single-colonia CP, CP with empty ciudad, unlisted CP, malformed input, and a cache hit
- [ ] #9 No buyer address data is sent to or logged by this endpoint — only the postal code
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Contexto verificado

- La API corre en `api.thepubmarket.com` (dominio propio), montada en `apps/api/src/index.ts`. Rutas públicas ya existentes sin auth: `/catalog`, `/sellers`, `/photos`, `/card-images`.
- No hay ningún uso del Cache API en el Worker; el único patrón de cache que existe es **KV** (`scryfall.ts`). Se sigue ese, no se inventa otro.
- `checkRateLimit(kv, bucket, id, limit, windowSeconds)` + `clientIp(c)` ya existen en `lib/rate-limit.ts` sobre el binding `SESSIONS`.
- vitest en apps/api solo cubre módulos "puros" (`vitest.config.ts` lo dice explícito); hay un `createFakeKV()` en `src/test/fake-kv.ts`. No hay fake de Drizzle.
- **Producción todavía no tiene el corpus** (TASK-061.01 quedó bloqueada en el paso remoto). El endpoint tiene que degradar a "no encontrado" con `corpusVersion: null` en vez de reventar.

## Forma de la respuesta

Estado y municipio van a nivel CP (ningún CP cruza dos, verificado sobre las 159,006 filas). **Ciudad va por asentamiento**, porque 324 CPs tienen asentamientos en más de una ciudad; a nivel CP solo se expone cuando es única.

```
{ postalCode, found, state, stateCode, municipality, municipalityCode,
  city,                       // solo si es única entre los asentamientos
  settlements: [{ id, name, type, city, zone }],
  corpusVersion }
```

CP inexistente → **200** con `found: false` y `settlements: []`. CP mal formado → **400 `invalid_postal_code`** sin tocar D1.

## Pasos

1. **`packages/shared`** — tipos `PostalCodeSettlement` y `PostalCodeLookupResponse` en `sepomex.ts` (donde ya vive `isValidPostalCode`, que el Worker reusa para validar).
2. **`apps/api/src/lib/postal-codes.ts`** — la lógica, con las dependencias inyectadas (`loadSettlements`, `loadCorpusVersion`, `kv`) en vez de un `Db`: así es testeable con el fake de KV y un loader falso, sin fake de Drizzle, y respeta la regla de vitest de este repo. Expone también la función pura fila→respuesta.
3. **Cache en KV, llaveado por versión del corpus**: `sepomex:ver` (TTL corto) guarda el vintage; `sepomex:<ver>:<cp>` guarda el payload. Un refresh del corpus cambia el prefijo, así que **invalida solo**; las llaves viejas expiran por TTL. Hit = 2 lecturas de KV y **cero** D1.
4. **`apps/api/src/routes/address.ts`** — `GET /address/postal-codes/:postalCode`, montado en `/address`. Valida, aplica rate limit por IP y responde con `Cache-Control` para el CDN/browser.
5. **Rate limit** — generoso para un comprador (llena un formulario: unas cuantas consultas) y estrecho para un scraper: enumerar los 31,877 CPs le costaría días. Es además la mitigación práctica al tema de términos de uso: el endpoint sirve un CP a la vez, nunca a granel.
6. **`apps/web/src/lib/client-api.ts`** — `lookupPostalCode()` tipado consumiendo el tipo compartido (AC #7); lo usa TASK-061.03.
7. **Tests** en `apps/api/src/lib/postal-codes.test.ts`: CP con varios asentamientos, CP de uno solo, CP con ciudad vacía, CP con dos ciudades distintas (que la ciudad de nivel CP salga null), CP inexistente, hit de cache sin tocar el loader, invalidación al cambiar la versión, y corpus ausente.
8. **Docs** — sección del endpoint en `docs/ingenieria/sepomex.md`.

## Decisión sobre términos de uso, asumida

El usuario dijo "continua" sin cerrar el punto de licencia. Se avanza con el diseño que no cierra ninguna puerta: **una consulta = un CP**, sin endpoint de volcado ni de búsqueda por nombre, y rate limit que hace inviable reconstruir el catálogo. Si más adelante se decide restringirlo a sesión de checkout, es agregar un middleware, no rehacer nada.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude (TASK-061.01)
created: 2026-08-08 01:49
---
Dos hallazgos de TASK-061.01, medidos sobre las 159,006 filas del catálogo real, que cambian el diseño de este endpoint:

1. **La ciudad no es función del CP.** 324 CPs tienen asentamientos en más de una ciudad, así que `ciudad` va **por asentamiento** en la respuesta; a nivel CP solo tiene sentido cuando es única. Estado y municipio sí son únicos por CP — ningún CP cruza dos, verificado — así que esos sí pueden ir a nivel CP como dice la descripción.
2. **Tamaño de la respuesta:** el CP más grande (85203, Ciudad Obregón) trae 291 asentamientos. No es problema, pero el payload no es de tres colonias.

Los datos ya están en D1 local: `sepomex_settlements` (PK `(postal_code, settlement_id)`, que ya sirve la búsqueda por CP sin scan) y `sepomex_corpus_meta` (fila única con el vintage para el AC #6 de esta task). Ver `docs/ingenieria/sepomex.md`.

**Pendiente antes de empezar:** el catálogo se publica "gratuito para uso particular, no estando permitida su comercialización… ni su distribución a terceros". Un endpoint público se acerca a redistribución. Vale resolverlo (o acotar el endpoint) antes de exponerlo. No es asesoría legal.
---
<!-- COMMENTS:END -->
