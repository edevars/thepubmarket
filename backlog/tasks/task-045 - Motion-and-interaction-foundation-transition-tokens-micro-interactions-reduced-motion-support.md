---
id: TASK-045
title: >-
  Motion and interaction foundation: transition tokens, micro-interactions,
  reduced-motion support
status: Done
assignee:
  - '@claude'
created_date: '2026-08-06 05:49'
updated_date: '2026-08-06 07:10'
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
- [x] #1 Shared motion tokens (durations, easings) and reusable transition patterns exist and are documented for: hover/press feedback, filter chip add/remove, card grid content changes, and menu/dropdown reveal
- [x] #2 prefers-reduced-motion is respected globally — all non-essential animation is disabled or reduced for users who request it
- [x] #3 At least the catalog game switch and filter interactions demonstrably use the foundation (no layout jank, no cumulative layout shift regressions)
- [x] #4 Animations never block interaction: controls remain responsive during transitions and focus states stay visible for keyboard users
- [x] #5 Typecheck, biome, and web tests green; a UI audit pass with the web-design-guidelines skill reports no animation/a11y violations on touched surfaces
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Context found

- Tailwind 4 CSS-first: all theme tokens live in `@theme` in `apps/web/src/app/globals.css` (dark navy palette, angular clip-path aesthetic, Rajdhani/Inter/Plex Mono). No motion tokens, no `prefers-reduced-motion` handling, no animation library — and none should be added (CSS-only keeps it maintainable by one person).
- Target surfaces already exist: `CatalogView.tsx` (game switch), `FilterSidebar.tsx` + `ActiveChips.tsx` (chips), `CardGrid.tsx`/`ProductCard.tsx` (grid + hover), `SiteHeader.tsx` (menus).

## Steps

1. **Motion tokens in `@theme`** (`globals.css`): `--duration-*` (fast ~120ms, base ~200ms, slow ~320ms) and `--ease-*` (standard out, emphasized/overshoot for reveals) so Tailwind generates `duration-*`/`ease-*` utilities. Keep the token set minimal.
2. **Reusable patterns** as documented CSS in `globals.css` (keyframes + small utility classes): hover/press feedback (incl. active-scale press), chip add/remove, card-grid content change (fade/rise on data swap, no layout shift), menu/dropdown reveal. A short doc comment block maps pattern → intended use (AC#1's documentation).
3. **Global reduced-motion**: one `@media (prefers-reduced-motion: reduce)` block that collapses non-essential animation/transition to near-zero while keeping state changes instant and visible (AC#2).
4. **Adopt on real surfaces** (AC#3): catalog game switch + filter chip add/remove + grid update in CatalogView/FilterSidebar/ActiveChips/CardGrid/ProductCard; menu reveal in SiteHeader. Transitions on transform/opacity only — never animate layout properties — and never intercept pointer events (AC#4). Focus-visible styles must persist through transitions.
5. **Checks + audit** (AC#5): `pnpm typecheck`, `pnpm lint`, `pnpm turbo run test`; then a `web-design-guidelines` audit pass over the touched components.

## Notes

- Frontend-only task; no API, no regulatory surface.
- Delegated to the `nextjs-frontend` subagent with the `frontend-design` quality bar; audited before closing.
- Branch `task/task-045`; the pre-existing uncommitted files (.gitignore, dispatch-loop infra) belong to the user and stay out of the commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Motion foundation lives entirely in `apps/web/src/app/globals.css` (CSS-only, no animation library):

- Tokens in `@theme`: `--duration-fast/base/slow` (120/200/320ms) and `--ease-standard/emphasized`, which auto-generate Tailwind `duration-*`/`ease-*` utilities.
- Documented patterns: `.tpm-chip`/`.tpm-chip-exit` (chip add/remove), `.tpm-grid-item` (grid content swap fade+rise), `.tpm-reveal` (dropdown/sheet), `.tpm-scrim` (backdrop fade), `.tpm-drawer-panel` (cart drawer). All transform/opacity only.
- Global `@media (prefers-reduced-motion: reduce)` collapses animation/transition to 0.01ms (kept instead of `animation: none` so `forwards`-filled end states still apply).

Adopted on: CatalogView (game switch via grid remount + mobile filter reveal), FilterSidebar (control press feedback, foil toggle knob now animates transform not `left`), ActiveChips (exit animation before state removal, double-fire guarded), CardGrid/ProductCard (entrance + hover/press), SiteHeader (nav hover/press, logo), CartDrawer (scrim + panel, overscroll-contain).

web-design-guidelines audit findings fixed: layout-property animation on foil toggle, aria-hidden/disabled on a focused exiting chip button, missing overscroll-behavior in drawer scroll area, missing focus rings on scrim/CTA, non-transitioning press scale on header cart button.

Checks: typecheck, biome, and all tests green. Merged to main (118090f), deployed thepubmarket-web (version 30e2df6a).

Resumed from an interrupted session that had the implementation staged but unverified. Validated the work, ran the web-design-guidelines audit, fixed 4 findings, shipped.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped a lean, CSS-only motion/interaction foundation for the storefront: shared duration/easing tokens in the Tailwind 4 `@theme`, five documented reusable transition patterns (chips, grid entrance, reveals, scrim, drawer), and a global prefers-reduced-motion override. Adopted across catalog, filters, header, and cart drawer with transform/opacity-only animation, persistent focus-visible states, and no layout shift. Audited with web-design-guidelines (4 findings found and fixed). Merged to main and deployed to Cloudflare.
<!-- SECTION:FINAL_SUMMARY:END -->
