---
id: TASK-056
title: >-
  Catalog refactor closing pass: web-design-guidelines audit, reduced-motion,
  i18n parity, docs
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-07 00:03'
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
