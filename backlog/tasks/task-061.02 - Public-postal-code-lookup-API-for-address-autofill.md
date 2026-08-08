---
id: TASK-061.02
title: Public postal-code lookup API for address autofill
status: To Do
assignee: []
created_date: '2026-08-08 01:24'
updated_date: '2026-08-08 01:49'
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
