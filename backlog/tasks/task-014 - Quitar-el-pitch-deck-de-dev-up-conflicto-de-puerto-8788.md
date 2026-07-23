---
id: TASK-014
title: 'Quitar el pitch deck de dev:up (conflicto de puerto 8788)'
status: Done
assignee: []
created_date: '2026-07-23 06:04'
updated_date: '2026-07-23 06:04'
labels:
  - dev-tooling
dependencies: []
modified_files:
  - package.json
  - docs/ingenieria/estado-actual.md
priority: low
type: chore
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
El worker interno `@thepubmarket/pitch` (pitch deck, ajeno al marketplace) se levantaba junto con el resto de servicios vía `pnpm dev` / `pnpm dev:up`, fijado al puerto 8788. Arranques paralelos o reintentos de `dev:up` chocaban con "Address already in use (127.0.0.1:8788)" cuando una instancia previa de `pitch` seguía viva.

Se filtró `@thepubmarket/pitch` del script `dev` raíz (`turbo run dev --filter=!@thepubmarket/pitch`), así que `pnpm dev`/`pnpm dev:up` ya no lo levantan. Sigue disponible bajo demanda con `pnpm --filter @thepubmarket/pitch dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 package.json (root) excluye @thepubmarket/pitch del turbo run dev
- [x] #2 docs/ingenieria/estado-actual.md refleja que pitch ya no arranca con dev:up y cómo correrlo aparte
- [x] #3 pnpm --filter @thepubmarket/pitch dev sigue funcionando para uso manual
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Se filtró @thepubmarket/pitch del script `dev` raíz (package.json: `turbo run dev --filter=!@thepubmarket/pitch`), confirmado con `turbo run dev --dry-run` (solo quedan api/web/db/shared en scope). Se actualizó docs/ingenieria/estado-actual.md (tabla "Qué corre y dónde" y gotcha de puertos) para reflejar que pitch ya no arranca con dev:up y que se corre aparte con `pnpm --filter @thepubmarket/pitch dev`. Commit d3b9efb, pusheado a origin/main.
<!-- SECTION:FINAL_SUMMARY:END -->
