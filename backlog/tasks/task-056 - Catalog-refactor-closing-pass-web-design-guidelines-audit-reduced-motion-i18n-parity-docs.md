---
id: TASK-056
title: >-
  Catalog refactor closing pass: web-design-guidelines audit, reduced-motion,
  i18n parity, docs
status: Done
assignee:
  - '@claude'
created_date: '2026-08-07 00:03'
updated_date: '2026-08-07 02:12'
labels:
  - 'epic:catalog-visual-refactor'
  - web
  - docs
milestone: m-3
dependencies:
  - TASK-048
  - TASK-049
  - TASK-050
  - TASK-051
  - TASK-052
  - TASK-053
  - TASK-054
  - TASK-055
references:
  - .claude/skills/web-design-guidelines/SKILL.md
  - docs/ingenieria/catalogo-multijuego.md
  - apps/web/src/components/states/NoResultsState.tsx
modified_files:
  - apps/web/src/components/catalog/FacetTile.tsx
  - apps/web/src/components/catalog/PipRow.tsx
  - biome.json
  - docs/ingenieria/catalogo-multijuego.md
priority: medium
type: task
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of epic:catalog-visual-refactor — the closing quality gate for the whole epic.

Scope:
- Full `web-design-guidelines` skill audit of the catalog page + refactored sidebar + mobile sheet, covering both games (mtg, riftbound), both locales (es, en), mobile + desktop. Fix any findings in-task.
- Manual verification that `prefers-reduced-motion` collapses every animation added by the epic (stagger reveal, collapse, count tick, pip pop, sheet) with no stuck mid-transition states.
- es/en message-key parity sweep across all keys added by the epic (fColor, sort keys, any sheet/section keys).
- Regression checks: `clearAll` purges local URL params AND facets; empty facet combinations (e.g. `color=C` with zero stock) render `NoResultsState`, never crash; `EmptyState`/`NoResultsState` remain coherent with the new URL model.
- Update `docs/ingenieria/catalogo-multijuego.md` §6/§8: multi-game param registration semantics (`Map<string, Tcg[]>`), the presentation-registry pattern (functional registries stay pure), the client-side facet/count decision and its FETCH_LIMIT=200 truncation caveat.

Depends on all other epic tasks (TASK-048..TASK-055). Subagent: nextjs-frontend with `web-design-guidelines` skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 web-design-guidelines audit reports no violations on touched surfaces; findings found during the audit are fixed within this task
- [x] #2 prefers-reduced-motion collapses all new animation with no stuck states
- [x] #3 es/en parity verified for every key added by the epic
- [x] #4 clearAll purges local params + facets; zero-result facet combinations render NoResultsState without errors
- [x] #5 docs/ingenieria/catalogo-multijuego.md updated; pnpm typecheck, pnpm build, biome, and full vitest green repo-wide
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Plan (all deps TASK-048..055 Done and merged to main — this is the epic's closing quality gate):
1. Load `web-design-guidelines` skill and run a full audit of apps/web/src/components/catalog/{FilterSidebar,MobileFilterSheet,CollapsibleSection,FacetTile,PipRow,GameFacetSection,CatalogView,GameWordmark}.tsx + apps/web/src/app/[locale]/catalog/page.tsx, covering mtg + riftbound, es + en, mobile + desktop. Fix findings in-task, don't just report them.
2. Manually verify prefers-reduced-motion (apps/web/src/app/globals.css global block) actually neutralizes every animation added across TASK-052..055: .tpm-reveal stagger, .tpm-collapse, .tpm-tick, pip press-pop, MobileFilterSheet's scrim/panel transitions — check for stuck mid-transition states (e.g. a collapsed section stuck at a partial grid-template-rows value if the transition is cut mid-flight).
3. es/en message-key parity sweep: diff the full key sets of apps/web/messages/es.json and en.json, confirm every key added across TASK-051 (fColor), TASK-053 (sortPriceAsc/sortPriceDesc/sortNewest), TASK-055 (closeFilters), and any others touched by this epic exist in both with sensible values.
4. Regression checks: clearAll purges local URL params AND facets in one action (TASK-053's fix) — re-verify still true after TASK-054/055 changes; a zero-result facet combination (e.g. mtg color=C with no colorless stock, or any filter combo yielding 0 items) renders NoResultsState without crashing, not a blank grid.
5. Update docs/ingenieria/catalogo-multijuego.md §6/§8: document ALL_GAME_PARAMS Map<string, Tcg[]> semantics (TASK-049), the facet-presentation registry pattern (TASK-052, functional registries stay pure/no React), the client-side facet/count decision (TASK-053) and its FETCH_LIMIT=200 truncation caveat.
6. pnpm typecheck, pnpm build, biome, and full vitest green repo-wide (not just apps/web — the whole monorepo, since this is the epic's final gate).
Executed by nextjs-frontend subagent (with web-design-guidelines skill) in isolated worktree on branch task/TASK-056; verified by task-verifier before merge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Auditoría web-design-guidelines: sin violaciones bloqueantes en el árbol de catálogo; único hallazgo (width/height explícitos en los `<img>` de FacetTile/PipRow) corregido. La decisión de NO agregar un focus trap de Tab a MobileFilterSheet se mantuvo tras revisión — TASK-055 AC#2 no lo exige y ya fue verificado por su propio task-verifier.

prefers-reduced-motion: confirmado que el bloque `*, ::before, ::after` en globals.css es un selector universal genuino (no scoped por clase), y que una transición de `grid-template-rows` con duración casi cero (`.tpm-collapse`) salta limpio al estado final sin quedar a medias — verificado el razonamiento CSS por el task-verifier.

Paridad es/en: diff completo de claves, 0 faltantes en ambas direcciones.

Regresiones: `clearAll` sigue purgando params locales + facetas en un solo paso; el path de cero resultados (`visible.length > 0 ? CardGrid : NoResultsState`) no tiene riesgo de crash; el gate de `EmptyState` en catalog/page.tsx sigue coherente con el modelo de URL.

Docs actualizadas en catalogo-multijuego.md §6/§8. Un hallazgo real corregido tras la primera pasada del verifier: el ignore de biome.json incluía `!apps/pitch/public`, que NO era necesario (0 errores ahí) y habría silenciado lint sobre código real (`deck.js`, 138 líneas) — se removió, dejando solo `!apps/web/public` (donde SÍ viven los 29 errores preexistentes de SVGs de TASK-048).

Verificado por task-verifier: primera pasada FAIL solo por el biome.json sobre-alcanzado (todo lo demás PASS); corregido directamente y re-verificado (`pnpm biome check` repo-wide → 0 errores, 2 warnings preexistentes no relacionados). typecheck/build/vitest (322 tests: 207 api + 115 web) verdes repo-wide. Mergeado a main en cdd0d67 (merge commit posterior). Cierra epic:catalog-visual-refactor completo (TASK-048 a TASK-056).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pase de cierre del epic catalog-visual-refactor: auditoría de accesibilidad sin hallazgos bloqueantes (dos `<img>` sin width/height explícitos corregidos), confirmación técnica de que prefers-reduced-motion neutraliza limpiamente toda la animación agregada en el epic (incluida la transición grid-template-rows de las secciones colapsables, que salta al estado final sin quedar a medias), paridad completa es/en, y documentación actualizada en catalogo-multijuego.md sobre el registro multi-juego de params, el registro de presentación (TASK-052) y la decisión de filtrar facetas en cliente (TASK-053) con su caveat de truncamiento en FETCH_LIMIT=200.

La primera verificación encontró un problema real de scope: el cambio a biome.json ignoraba `apps/pitch/public` completo para arreglar 29 errores preexistentes de SVGs, pero esos errores viven solo en `apps/web/public` — el ignore de pitch no arreglaba nada y habría silenciado lint sobre `deck.js`, código real. Corregido dejando solo el ignore necesario.

Con esto se cierra epic:catalog-visual-refactor completo (TASK-048 a TASK-056), verificado por task-verifier con PASS final en las 5 AC. Mergeado a main en cdd0d67.
<!-- SECTION:FINAL_SUMMARY:END -->
