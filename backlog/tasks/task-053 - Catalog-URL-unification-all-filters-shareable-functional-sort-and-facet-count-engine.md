---
id: TASK-053
title: >-
  Catalog URL unification (all filters shareable), functional sort, and
  facet-count engine
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-07 00:02'
updated_date: '2026-08-07 01:14'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Plan (deps TASK-049/TASK-051 both Done; binding design decisions are in the task description — follow them exactly, they're already approved):

Current state confirmed by reading the real files:
- `CatalogView.tsx`: local `FilterState` (conditions/languages/foilOnly/minPesos/maxPesos/game) lives in `useState`, initialized once from `initialGameFilters` prop only (cond/lang/foil/price are NEVER read from URL). `navigate()` rebuilds the URL from scratch with only `q` + `game` + that game's facet params — local-filter state is silently dropped on every facet/game navigation because the page remounts via the `key` in `catalog/page.tsx` (`${q}|${activeGame}|${serializeGameFilters(gameFilters)}`).
- `catalog/page.tsx`: server component, calls `getCatalog({ tcg: activeGame, game: gameFilters })` — facets ARE filtered server-side today. Sort UI is a decorative `<span>{t('sortRelevance')} ▾</span>` (CatalogView.tsx:294-296), no `<select>`, does nothing.
- `data.ts`: `applyFilters` already does full client-side filtering incl. `matchesGameFilters` — currently redundant with server-side facet filtering but exists for mock parity. `FETCH_LIMIT = 200`.
- `ActiveChips.tsx`: presentational, takes `chips: ActiveChip[]` + `onClearAll`, no changes needed to this component itself — only to what `CatalogView` passes in.

Implementation:
1. New `apps/web/src/lib/catalog/local-filters.ts` (pure, no React): parse/serialize `cond` (comma condition codes), `lang` (comma codes), `foil=1`, `min`/`max` (pesos), `sort=relevance|price_asc|price_desc|newest` to/from `URLSearchParams`. Export a `LocalFilters` type and `parseLocalFilters`/`serializeLocalFilters` (or apply-to-URLSearchParams) functions, round-trip safe.
2. New `apps/web/src/lib/catalog/facet-counts.ts` (pure, no React): faceted count engine with per-facet self-exclusion — a value's count = items matching all OTHER active filters (game facets AND condition/language/foil each self-exclude). Consumes `matchesGameFilters`/`applyFilters`-shaped filter state; used by the sidebar (TASK-054) later but must be correct and unit-tested now.
3. `catalog/page.tsx`: drop `game: gameFilters` from the `getCatalog` call — fetch `getCatalog({ tcg: activeGame })` only; facets now apply client-side in `CatalogView` via the existing `applyFilters`/`matchesGameFilters` (SSR still renders the filtered grid — same computation moves client-side but still runs during the server render of `CatalogView`). Parse local-filters server-side too (from `searchParams`) and pass as initial props so first paint matches the URL without a client flash. Page `key` stays `q|game|serializedFacets` — local-filter params must NOT be part of it (verify: adding cond/lang/foil/price/sort to key would remount on every tile click).
4. `CatalogView.tsx`: initialize local filter state (cond/lang/foil/price/sort) from URL via the new parse function (with the SSR-parsed initial values as fallback), not just from a `game` prop. Two write paths: `navigate()` (q/game/facets) keeps `router.push` but must now carry current local-filter params forward instead of dropping them. New local-only setter path uses `window.history.replaceState` (construct the URL by merging current `location.search` with the new local-filter serialization) — no `router` call, no remount. Fallback noted in description if `useSearchParams` desyncs: `router.replace({ scroll: false })`.
5. Sort: client-side only for now (comment noting Fase 5 API pagination will change this). `relevance` = API order, or startsWith>includes name rank when `q` present; `newest` = `createdAt` desc. Apply sort after `applyFilters` in the `visible` memo.
6. Replace the decorative sort `<span>` with a real `<select>` styled to match existing input aesthetics (see `border-line`/`bg-input` classes already used elsewhere in this file), wired to the new sort state/setter. New i18n keys `catalog.sortPriceAsc`/`sortPriceDesc`/`sortNewest` in both `apps/web/messages/es.json` and `en.json` (an existing `catalog.sortRelevance` key likely already exists — reuse it, check first).
7. `clearAll()` must reset both local-filter URL params and facet/game URL params in one shot (currently it clears local React state and separately does `router.push('/catalog')` only if a game is active — needs to always clear local params from the URL too, even with no game active).
8. Unit tests: `local-filters.test.ts` (parse/serialize round-trips, defaults, malformed input never throws) and `facet-counts.test.ts` (self-exclusion counting correctness — a selected facet value's own count reflects OTHER active filters, not itself). All existing tests (game-filters, facet-presentation, data) must stay green.
9. `pnpm typecheck`, `pnpm build`, `pnpm vitest run`, `pnpm biome check` all green from `apps/web`.

Executed by nextjs-frontend subagent in an isolated worktree on branch task/TASK-053; verified by task-verifier before merge (this is a state-architecture task — verifier must specifically check AC#1 URL round-trip on hard refresh and AC#3 no-remount-on-local-change, not just typecheck/tests).
<!-- SECTION:PLAN:END -->
