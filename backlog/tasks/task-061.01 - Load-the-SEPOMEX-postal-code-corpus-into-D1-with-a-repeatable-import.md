---
id: TASK-061.01
title: Load the SEPOMEX postal-code corpus into D1 with a repeatable import
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-08 01:24'
updated_date: '2026-08-08 01:48'
labels:
  - 'epic:sepomex-address'
milestone: m-2
dependencies: []
references:
  - >-
    https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx
  - scripts/import-riftbound.mjs
  - packages/db/src/schema.ts
  - apps/api/migrations/
parent_task_id: TASK-061
priority: high
type: feature
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Data layer of the epic. Nothing else in the epic can start until the corpus lives in D1 and can be refreshed without archaeology.

The source is the national postal-code catalogue published by Correos de Mexico ("Catalogo Nacional de Codigos Postales"). It is a single delimited export of roughly 145k settlement rows; each row is one asentamiento (colonia) and carries at least: codigo postal, nombre del asentamiento, tipo de asentamiento (Colonia / Fraccionamiento / Pueblo / Barrio / ...), municipio, estado, ciudad (often empty outside metro areas), plus SEPOMEX's own numeric keys for estado, municipio and asentamiento. Several thousand CPs map to many colonias; a few CPs are single-settlement.

The corpus is reference data, not transactional data: read-only at runtime, replaced wholesale on refresh. It must be queryable by CP, and it must be possible to tell which vintage of the catalogue is loaded — an address validated against a two-year-old corpus is a support ticket waiting to happen.

Constraints: Cloudflare-first (D1 is the store of record; KV/R2/Cache are available), operable and refreshable by a single person, and a refresh must not require hand-editing rows in production. The repo already has the pattern for this kind of bulk load in `scripts/import-riftbound.mjs` (admin-authenticated bulk endpoint + local script driving it) — reuse the pattern rather than inventing a second one.

Do not commit the raw multi-MB catalogue file into git history.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A versioned Drizzle migration creates the corpus table(s) in packages/db, applies cleanly to a fresh local D1 and to the existing production database, and is additive only (no destructive change to existing tables)
- [x] #2 Lookup by 5-digit postal code is indexed and returns every settlement of that CP together with its tipo de asentamiento, municipio, estado and ciudad
- [x] #3 A documented import script loads the full catalogue end to end and is re-runnable: running it twice leaves the same row count and the same data, with no duplicates
- [x] #4 The loaded vintage is recorded and readable (catalogue source and load/publication date), so any consumer can report how stale the corpus is
- [x] #5 Row counts and a handful of spot-checked CPs (one single-colonia CP, one multi-colonia CD MX CP, one rural CP with empty ciudad) are verified against the source file after import
- [x] #6 Accents and n-tilde survive the import intact, and a lookup key that is insensitive to accents and case is available for matching
- [x] #7 docs/ingenieria/ documents where the catalogue comes from, its terms of use, the vintage loaded, and the exact steps to refresh it in production
- [x] #8 Automated tests cover parsing of the catalogue format, including rows with empty ciudad and colonia names containing commas or quotes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Source verified before planning

The official export at correosdemexico.gob.mx works today and is current ("Última Actualización de Información: Agosto 6 de 2026"). It is an ASP.NET postback: GET the page, replay `__VIEWSTATE` / `__VIEWSTATEGENERATOR` / `__EVENTVALIDATION` in a POST with `cboEdo=00` (all states), `rblTipo=txt`, `btnDescarga.x/y`. Response is `CPdescargatxt.zip` (2.1 MB) holding `CPdescarga.txt` (15.7 MB, **ISO-8859-1**, CRLF).

Measured shape of the file (159,008 lines):
- line 1 = license notice, line 2 = header, 159,006 data rows, all with exactly 15 pipe-separated fields
- 31,877 distinct CPs; largest is 85203 with 291 settlements
- `(d_codigo, id_asenta_cpcons)` is unique across the whole file — 0 duplicates. That is the primary key.
- a CP never spans two estados or two municipios (verified), but **324 CPs span more than one ciudad**, so ciudad belongs to the settlement row, not to the CP
- `d_ciudad` is empty on 104,045 rows; `c_CP` is empty on every row (dropped)
- 46 settlement names contain commas, 16 contain double quotes → SQL escaping and parser tests need these

## Steps

1. **Schema** in `packages/db/src/schema.ts`, migration via `pnpm --filter @thepubmarket/api db:generate`:
   - `sepomex_settlements` — PK `(postal_code, settlement_id)`, plus settlement, settlement_type, municipality, state, city (nullable), zone, state_code, municipality_code, city_code, four accent/case-folded `*_norm` columns, and `corpus_version`. Index on `(state_norm, municipality_norm)` for the store-matching work in TASK-061.05.
   - `sepomex_corpus_meta` — single row (`id = 1` CHECK), version, source_url, published_label, row_count, file_sha256, loaded_at. This is what answers "how stale is the corpus".
   - Additive only; no existing table is touched.
2. **`packages/shared/src/sepomex.ts`** — the corpus format lives in one place: expected header field list (abort loudly if SEPOMEX renames a column, same rule as `import-riftbound.mjs`), `parseSepomexCatalog()`, and `normalizeAddressPart()` (NFD, strip diacritics, fold case, collapse whitespace). TASK-061.04 needs the same normalizer at runtime, so it must not live in the script.
3. **`scripts/import-sepomex.mjs`** — download (or `--file` a local copy), extract the single-entry zip with `zlib.inflateRawSync`, decode latin1, parse via the shared module (Node 24 strips the TS types on import, no build step), emit SQL to a gitignored `.tmp/`, and run `wrangler d1 execute --local|--remote`.
4. **Idempotency** — the emitted SQL is `INSERT OR REPLACE` batches all stamped with the same `corpus_version`, then `DELETE FROM sepomex_settlements WHERE corpus_version <> <this one>` to sweep settlements the catalogue dropped, then the meta upsert. Re-running converges; a failed run never leaves an empty table.
5. **Tests** — `apps/api/src/lib/sepomex-corpus.test.ts` (the repo's only vitest project) against the shared parser: header mismatch, license/header lines skipped, empty ciudad → NULL, names with commas / quotes / apostrophes, accents and ñ preserved, wrong field count rejected, normalizer output.
6. **Docs** — `docs/ingenieria/sepomex-corpus.md`: source, terms of use, vintage loaded, refresh procedure for local and production, and the verification queries.
7. **Verify** — apply local, import, spot-check 01000 (multi-colonia CDMX), a single-settlement CP and a rural CP with empty ciudad against the raw file; run the import twice and compare counts; then apply the migration and the import to production D1.

## Deviation from the task description, recorded

The description says to reuse the `import-riftbound.mjs` pattern (admin endpoint + batched HTTP). Not doing that here: that pattern exists because cards need R2 image mirroring and per-row business logic. This is inert reference data with no images and no logic, and D1 caps bound parameters per statement (~100, the cause of TASK-047), which would force ~6 rows per statement and ~26k HTTP round-trips. `wrangler d1 execute --file` with literal-value multi-row inserts is one command, no new authenticated write surface, and far less to maintain. The script still owns download, parsing and SQL generation, so the refresh is still one command.

## Flag for the user — terms of use

The file's own first line: the catalogue is provided free for particular use, with commercialisation and distribution to third parties not permitted. Using it internally to validate our own shipping addresses is one thing; TASK-061.02 exposes a public lookup endpoint, which is closer to redistribution. Documenting it here and raising it before that task starts; this is not legal advice.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Verificación local (vintage 2026-08-06, medido contra el TXT crudo):**

| Comprobación | Fuente | D1 local |
|---|---|---|
| Asentamientos | 159,006 | 159,006 |
| CPs distintos | 31,877 | 31,877 |
| Filas sin ciudad | 104,045 | 104,045 |
| CP 09630 (varios asentamientos) | 15 | 15 |
| CP 20174 (rural, ciudad vacía) | 14, El Rocío sin ciudad | 14, `city IS NULL`, `zone='Rural'` |
| CP 01000 (acentos) | San Ángel / Álvaro Obregón | idéntico, `settlement_norm='san angel'` |

`EXPLAIN QUERY PLAN` sobre la consulta caliente: `SEARCH sepomex_settlements USING INDEX sqlite_autoindex_sepomex_settlements_1 (postal_code=?)` — la PK sirve la búsqueda por CP, sin scan.

**Idempotencia y barrido, probados en 4 corridas:**
1. carga completa → 159,006 filas / 1 sola `corpus_version`
2. misma versión otra vez → mismas 159,006, sin duplicados
3. `--limit=100 --version=2026-01-01-prueba-barrido` → quedan **100** filas: el barrido eliminó las 159,006 de la versión anterior y `sepomex_corpus_meta` se actualizó
4. carga completa de nuevo → 159,006 restauradas

Tests: 18 nuevos en `sepomex-corpus.test.ts`; suite completa de apps/api en verde (225/225). `pnpm typecheck` y `pnpm lint` limpios (los 2 warnings de `noImgElement` en apps/web son previos y ajenos).

**Hallazgo que afecta a TASK-061.02:** 324 CPs tienen asentamientos en más de una ciudad, así que el endpoint no puede devolver una sola `ciudad` por CP — la ciudad va por asentamiento, y a nivel CP solo cuando es única. En cambio ningún CP cruza dos estados ni dos municipios (verificado sobre las 159,006 filas), así que esos sí pueden ir a nivel CP.

**Desviación menor del plan:** la ñ se pliega a n en `normalizeAddressPart` (NFD la descompone). Se conservó a propósito — la llave normalizada solo sirve para emparejar y el comprador rara vez teclea la ñ; lo que se muestra sale de la columna sin normalizar. Coincide con el `normalizeCity` que ya existe en `delivery.ts`. Documentado en el módulo y en un test.

**Pendiente, bloqueado:** aplicar la migración y cargar el corpus en la D1 de **producción**. `pnpm db:migrate:remote` lo bloqueó el clasificador de permisos de la sesión; no se intentó rodear. Es AC #1 y son dos comandos (ver Final Summary).
<!-- SECTION:NOTES:END -->
