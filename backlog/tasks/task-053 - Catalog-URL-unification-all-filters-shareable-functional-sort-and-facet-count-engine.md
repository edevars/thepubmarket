---
id: TASK-053
title: >-
  Catalog URL unification (all filters shareable), functional sort, and
  facet-count engine
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-07 00:02'
labels:
  - 'epic:catalog-visual-refactor'
  - web
milestone: m-3
dependencies:
  - TASK-049
  - TASK-051
references:
  - apps/web/src/components/catalog/CatalogView.tsx
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
  - apps/web/src/lib/catalog/data.ts
  - apps/web/src/components/catalog/ActiveChips.tsx
priority: high
type: feature
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of epic:catalog-visual-refactor — the state-architecture task. Today condition/language/foil/price live only in local React state: they don't survive reload, aren't shareable, and are silently WIPED whenever a facet or game navigation remounts CatalogView (the page `key` changes). The sort control is a decorative div. Facet values show no counts.

Outcome: every filter persists in the URL, sort actually works, and a count engine exposes per-value result counts for the sidebar refactor.

Design decisions (binding, from the approved plan):
- URL schema: existing `q/game/<facet params>` + new `cond` (comma codes), `lang`, `foil=1`, `min`/`max` (pesos), `sort=relevance|price_asc|price_desc|newest`. Parse/serialize in a new `apps/web/src/lib/catalog/local-filters.ts` (logic in lib/ because vitest excludes .tsx).
- Two navigation channels: server-affecting changes (q/game/facets) keep `router.push`, but `navigate()` must now CARRY the local-filter params instead of dropping them; local-only changes (cond/lang/foil/price/sort) use `window.history.replaceState` — no server round-trip, no remount, no scroll jump. Known risk: if `useSearchParams` desyncs from next-intl's router, fall back to `router.replace({ scroll: false })` (still no remount thanks to the key design).
- Remount key: local-filter params are EXCLUDED from the page `key` (they never change what the server fetched; including them would remount on every tile click, killing focus/animation). Key stays `q|game|serializedFacets`. Local state initializes from the URL on mount — this is what makes locals survive facet navigation.
- Sort is client-side (the page already holds the full ≤200-item set and filters client-side; move to an API param when real pagination lands in Fase 5 — leave that comment in code). `relevance` = API order (title ASC) or startsWith>includes name rank when `q` is present; `newest` = `createdAt` desc (TASK-049 exposes it).
- Count engine + data-flow change: `catalog/page.tsx` fetches `getCatalog({ tcg })` WITHOUT facet params; facets apply client-side via the existing tested `matchesGameFilters` (SSR still renders the filtered grid — same computation server-side). Rationale: with facets filtered server-side, counts for unselected values of a facet that has a selection are uncomputable (those items never arrive). New `apps/web/src/lib/catalog/facet-counts.ts` implements standard faceted counting with per-facet self-exclusion (a value's count = items matching all OTHER active filters), covering facets AND condition/language/foil. CAVEAT to document next to `FETCH_LIMIT = 200` in data.ts: if a game exceeds 200 items, counts and client facet filtering truncate; the API-side facet filters remain the contract and stay tested.
- Replace the decorative `sortRelevance ▾` div with a real styled native <select>; i18n keys `catalog.sortPriceAsc/sortPriceDesc/sortNewest` in BOTH es.json and en.json; ActiveChips wiring updated (cond/lang/foil/price/sort chips remove via URL update).

Depends on TASK-049 (createdAt) and TASK-051 (mtg facets exist so counts cover both games). Subagent: nextjs-frontend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Set condition + language + max price + foil, then toggle a facet or switch game: local filters persist in URL and UI; back/forward restores every filter; a hard refresh of the URL reproduces the exact view
- [ ] #2 Sort options reorder the grid correctly (relevance with and without q, price asc/desc, newest) and sort persists in the URL
- [ ] #3 Local-filter changes cause no remount — verifiable: input focus in the price field survives toggling a condition tile
- [ ] #4 local-filters and facet-counts unit tests cover parse/serialize round-trips and self-exclusion counting; all existing tests stay green
- [ ] #5 clearAll clears both URL-local params and facets in one action
- [ ] #6 pnpm typecheck, pnpm build, vitest, and biome are green
<!-- AC:END -->
