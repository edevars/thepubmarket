---
id: TASK-056
title: >-
  Catalog refactor closing pass: web-design-guidelines audit, reduced-motion,
  i18n parity, docs
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-07 00:03'
updated_date: '2026-08-07 01:57'
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
- [ ] #1 web-design-guidelines audit reports no violations on touched surfaces; findings found during the audit are fixed within this task
- [ ] #2 prefers-reduced-motion collapses all new animation with no stuck states
- [ ] #3 es/en parity verified for every key added by the epic
- [ ] #4 clearAll purges local params + facets; zero-result facet combinations render NoResultsState without errors
- [ ] #5 docs/ingenieria/catalogo-multijuego.md updated; pnpm typecheck, pnpm build, biome, and full vitest green repo-wide
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
