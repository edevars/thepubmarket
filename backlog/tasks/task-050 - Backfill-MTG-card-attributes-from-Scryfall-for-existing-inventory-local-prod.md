---
id: TASK-050
title: >-
  Backfill MTG card attributes from Scryfall for existing inventory (local +
  prod)
status: Done
assignee:
  - '@claude'
created_date: '2026-08-07 00:01'
updated_date: '2026-08-07 00:42'
labels:
  - 'epic:catalog-visual-refactor'
  - api
  - scripts
milestone: m-3
dependencies:
  - TASK-049
references:
  - apps/api/src/routes/admin.ts
  - scripts/import-riftbound.mjs
  - 'https://scryfall.com/docs/api/cards/collection'
priority: high
type: feature
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of epic:catalog-visual-refactor. Every existing MTG inventory row has `card_attributes = NULL` (the Scryfall pipeline never populated it). TASK-049 fixes the pipeline going forward; this task backfills the existing rows so the new MTG color/type/rarity filters actually return results.

Outcome: all MTG inventory rows have populated `card_attributes`, locally and in production, via an idempotent, re-runnable process.

Scope:
- Two admin endpoints in `apps/api/src/routes/admin.ts`, admin-key guarded like their siblings: `GET /admin/inventory/mtg-missing-attributes` (rows with `tcg='mtg' AND card_attributes missing/invalid`, returns id + scryfall/catalog identifier, limit param) and `POST /admin/inventory/attributes` (batch `[{id, gameAttributes}]`, validates the `tcg:'mtg'` shape, updates `card_attributes`). Rationale for endpoints over raw `wrangler d1 execute`: identical path against local and prod, reuses auth, keeps validation in one place.
- `scripts/backfill-mtg-attributes.mjs` (pattern: `scripts/import-riftbound.mjs` — API_URL/ADMIN_KEY env vars, batches, retries): pulls missing rows, resolves cards via Scryfall `POST /cards/collection` (75 identifiers per request, ~150ms throttle for the ~10 req/s limit), derives `MtgAttributes` with the same rules as TASK-049 (colors union of faces, empty → ['C'], types from type_line), posts batches. Idempotent by construction (the GET only returns missing rows).
- No schema change (uses the existing `card_attributes` column) — d1-schema-guardian not needed.
- Document the prod one-liner: `API_URL=... ADMIN_KEY=... node scripts/backfill-mtg-attributes.mjs`.

Depends on TASK-049 (MtgAttributes type, attribute derivation rules). Does not block the UI tasks — only gates seeing MTG facets with real data. Subagent: cloudflare-worker-dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running the script converges to 0 missing rows; a second run is a no-op
- [x] #2 After a local run, GET /catalog?tcg=mtg&color=G returns only green cards
- [x] #3 Rows with unresolvable Scryfall ids are reported in the script output, not silently skipped
- [x] #4 Prod run command is documented (script header or docs); api tests, typecheck, and biome are green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan (TASK-049 merged: MtgAttributes type, buildMtgAttributes derivation rules in apps/api/src/lib/scryfall.ts, card_attributes column already exists)

1. `apps/api/src/routes/admin.ts`: study existing admin endpoints (auth pattern, admin-key guard) and add:
   - `GET /admin/inventory/mtg-missing-attributes?limit=N` — rows where `tcg='mtg' AND (card_attributes IS NULL OR not valid MtgAttributes shape)`. Returns id + scryfall/catalog identifier needed to re-resolve the card.
   - `POST /admin/inventory/attributes` — batch `[{id, gameAttributes}]`, validates `tcg:'mtg'` shape server-side, updates `card_attributes` column.
2. `scripts/backfill-mtg-attributes.mjs` modeled on `scripts/import-riftbound.mjs`: API_URL/ADMIN_KEY env vars, pulls missing rows via the GET endpoint, resolves cards via Scryfall `POST /cards/collection` (75 identifiers/request, ~150ms throttle), derives MtgAttributes using the same rules as TASK-049's `buildMtgAttributes` (reuse the logic — check if it's exported/importable, else duplicate the small pure mapper standalone like import-riftbound.mjs does), posts batches via the POST endpoint. Idempotent by construction (GET only returns missing rows) — re-running converges to 0.
3. Document the prod one-liner in the script header.
4. No schema change — card_attributes column already exists.

Executed by cloudflare-worker-dev subagent in an isolated worktree on branch task/TASK-050; verified by task-verifier before merge (verify against local D1, not prod).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dos endpoints admin en `apps/api/src/routes/admin.ts`, guardados por el `adminAuth` global en `/admin/*` (verificado con curl: 401 sin key y con key incorrecta):
- `GET /admin/inventory/mtg-missing-attributes?limit=N`: filas `tcg='mtg'` con `card_attributes` NULL, JSON inválido, o sin `$.colors` (guard `json_valid` antes de `json_extract`). Devuelve `id` + identificador Scryfall vía `catalog_id` con fallback a `scryfall_id` legado (mismo patrón que `catalogIdOf()` en `inventory.ts`).
- `POST /admin/inventory/attributes`: batch `[{id, gameAttributes}]`, validación completa con zod `safeParse` antes de escribir nada — un ítem malformado rechaza todo el batch (verificado: 400 y cero filas escritas).

`scripts/backfill-mtg-attributes.mjs`: duplica la derivación de `buildMtgAttributes` de TASK-049 token por token (colores union de card_faces con fallback a `['C']`, types del type_line de la cara frontal contra `MTG_CARD_TYPES`) — comentario de cabecera señala la fuente canónica para mantenerlas sincronizadas. Batchea Scryfall en grupos de ≤75 (`SCRYFALL_BATCH_SIZE`), throttle de 150ms por request a Scryfall (no por request al admin API). Set en memoria `skipIds` evita loop infinito: cada fila irresoluble (sin scryfallId, Scryfall `not_found`, POST `notFound`) se agrega ahí; el loop termina cuando ya no quedan filas pendientes sin intentar, reporta cada una con `{id, scryfallId, reason}` a stderr y sale con código 1.

Verificación local (D1 local, prod intacta): seed de 10 filas MTG, corrupción manual de `card_attributes` simulando el estado pre-TASK-049, backfill converge a "0 missing" en la segunda corrida; `GET /catalog?tcg=mtg&color=G` devuelve solo la carta verde; fila con UUID Scryfall inexistente reportada como no resuelta sin loop infinito, exit 1, luego reconverge a 0/exit 0 tras restaurarla.

Sin cambios de schema (columna `card_attributes` ya existía). Sin código de pagos/checkout tocado.

Verificado por task-verifier: PASS en las 4 AC, veredicto explícito de que la garantía anti-loop-infinito es correcta y de que la lógica de derivación coincide exactamente con TASK-049. typecheck/tests/biome verdes tras merge a main (204/204 tests API).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Las filas MTG existentes en inventario tenían `card_attributes = NULL` — TASK-049 solo arregló el pipeline para listings nuevos. Este backfill resuelve las existentes de forma idempotente, tanto local como en prod.

Dos endpoints admin (`GET mtg-missing-attributes` / `POST attributes`) exponen el mismo camino para D1 local y prod, reusando la auth existente. El script `backfill-mtg-attributes.mjs` resuelve las cartas contra Scryfall en batches de 75 con throttle, deriva los mismos atributos que el pipeline en vivo (código duplicado pero verificado idéntico, con referencia cruzada a la fuente canónica), y termina de forma garantizada aunque existan filas irresolubles — nunca entra en loop infinito ni las omite en silencio.

Verificado en vivo contra D1 local: converge a cero filas faltantes, `?tcg=mtg&color=G` filtra correctamente, y el caso de fila irresoluble se reporta con exit code 1 en vez de colgarse. Verificado por task-verifier con PASS en las 4 AC. Mergeado a main en c4d3ce6.

Comando de prod documentado en la cabecera del script: `API_URL=... ADMIN_KEY=... node scripts/backfill-mtg-attributes.mjs` (pendiente de ejecutar contra prod cuando se decida).</finalSummary>
<parameter name="modifiedFiles">["apps/api/src/routes/admin.ts", "scripts/backfill-mtg-attributes.mjs"]
<!-- SECTION:FINAL_SUMMARY:END -->
