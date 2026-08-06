---
id: TASK-045
title: >-
  Motion and interaction foundation: transition tokens, micro-interactions,
  reduced-motion support
status: To Do
assignee: []
created_date: '2026-08-06 05:49'
labels:
  - 'epic:riftbound-ux'
  - web
milestone: m-3
dependencies: []
references:
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/catalog/FilterSidebar.tsx
  - apps/web/src/components/layout/SiteHeader.tsx
  - .claude/skills/frontend-design/SKILL.md
  - .claude/skills/web-design-guidelines/SKILL.md
priority: high
type: feature
ordinal: 37500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Visual quality is now a standing priority for the storefront: first-class UI with micro-interactions and clear element transitions. Today the web app has no shared motion system — any animation would be ad-hoc per component, producing inconsistent timing and easings across the catalog, navbar, and seller panel work in this epic.

Outcome: a small, reusable motion/interaction foundation (duration and easing tokens, standard transition patterns for filter chips, card grid updates, navigation menus, hover/press states, and page-level element transitions) that the rest of `epic:riftbound-ux` builds on, so every surface animates consistently and accessibly. Scope stays lean — a system one person can maintain, not an animation library playground.

The project skills `frontend-design` and `web-design-guidelines` (in .claude/skills/) define the quality bar and should guide implementation and review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shared motion tokens (durations, easings) and reusable transition patterns exist and are documented for: hover/press feedback, filter chip add/remove, card grid content changes, and menu/dropdown reveal
- [ ] #2 prefers-reduced-motion is respected globally — all non-essential animation is disabled or reduced for users who request it
- [ ] #3 At least the catalog game switch and filter interactions demonstrably use the foundation (no layout jank, no cumulative layout shift regressions)
- [ ] #4 Animations never block interaction: controls remain responsive during transitions and focus states stay visible for keyboard users
- [ ] #5 Typecheck, biome, and web tests green; a UI audit pass with the web-design-guidelines skill reports no animation/a11y violations on touched surfaces
<!-- AC:END -->
