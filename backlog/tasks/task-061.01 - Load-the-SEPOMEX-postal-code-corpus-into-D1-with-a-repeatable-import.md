---
id: TASK-061.01
title: Load the SEPOMEX postal-code corpus into D1 with a repeatable import
status: To Do
assignee: []
created_date: '2026-08-08 01:24'
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
- [ ] #2 Lookup by 5-digit postal code is indexed and returns every settlement of that CP together with its tipo de asentamiento, municipio, estado and ciudad
- [ ] #3 A documented import script loads the full catalogue end to end and is re-runnable: running it twice leaves the same row count and the same data, with no duplicates
- [ ] #4 The loaded vintage is recorded and readable (catalogue source and load/publication date), so any consumer can report how stale the corpus is
- [ ] #5 Row counts and a handful of spot-checked CPs (one single-colonia CP, one multi-colonia CD MX CP, one rural CP with empty ciudad) are verified against the source file after import
- [ ] #6 Accents and n-tilde survive the import intact, and a lookup key that is insensitive to accents and case is available for matching
- [ ] #7 docs/ingenieria/ documents where the catalogue comes from, its terms of use, the vintage loaded, and the exact steps to refresh it in production
- [ ] #8 Automated tests cover parsing of the catalogue format, including rows with empty ciudad and colonia names containing commas or quotes
<!-- AC:END -->
