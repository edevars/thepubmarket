---
id: TASK-041
title: 'Navbar: per-TCG navigation with a Riftbound entry'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-06 05:44'
updated_date: '2026-08-06 08:39'
labels:
  - 'epic:riftbound-ux'
  - web
milestone: m-3
dependencies:
  - TASK-045
references:
  - apps/web/src/components/layout/SiteHeader.tsx
  - apps/web/src/components/home/BrowseByGame.tsx
  - apps/web/src/lib/catalog/display.ts
  - apps/web/messages/es.json
  - apps/web/messages/en.json
priority: medium
type: feature
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The site header currently has a hardcoded "Magic" link that points at the unfiltered catalog and a non-interactive "Juegos" placeholder span; there is no way to navigate directly to a specific TCG's catalog, and Riftbound has no presence in the navigation. The mobile menu is just a single link to the catalog.

Outcome: the main navigation exposes the supported TCGs — including Riftbound — as working entries that land on the per-game catalog view, driven by the shared game list rather than hardcoded JSX, on both desktop and mobile. Part of `epic:riftbound-ux`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The header offers navigation to each available TCG's catalog view, including Riftbound, derived from the shared TCGS list / catalog availability rather than hardcoded per-game JSX
- [x] #2 The Magic entry links to the MTG-filtered catalog (not the unfiltered catalog), and the non-interactive Juegos placeholder is replaced by the working games navigation
- [x] #3 Games without available stock are handled deliberately (hidden or marked as coming soon, consistent with the home Browse-by-game tiles)
- [x] #4 Mobile navigation exposes the same game entries
- [x] #5 Labels localized in es and en; typecheck, biome, and web tests green
- [x] #6 Menu reveal, hover, and focus states use the shared motion foundation (TASK-045) with clear transitions, full keyboard operability, and prefers-reduced-motion respected; a web-design-guidelines skill audit of the header reports no violations
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Context found

- `SiteHeader.tsx` is a `'use client'` component rendered from the server component `apps/web/src/app/[locale]/layout.tsx` (line ~65), so availability data can be fetched server-side and passed in as props — no client fetch needed.
- `getGameCounts()` already exists in `apps/web/src/lib/catalog/data.ts` (backed by `GET /catalog/games` in `apps/api/src/routes/catalog.ts`, which returns `{ tcg, count }` per game). This is the same signal the home tiles conceptually use.
- `BrowseByGame.tsx` is the consistency reference for AC#3: iterates `TCGS`, links `/catalog?game=<tcg>` when `count > 0`, otherwise renders a non-interactive tile with `common.soon` ("Pronto"/"Soon") at 60% opacity.
- `TCG_META` in `lib/catalog/display.ts` already carries `name`/`short` for all six games including `riftbound`.
- Current header nav is hardcoded: a `Magic` link pointing at the unfiltered `/catalog`, and a non-interactive `<span>` for `common.navMore` ("Juegos"). Mobile is a single hamburger `Link` to `/catalog`.
- Motion foundation from TASK-045 is available: `duration-fast/base/slow`, `ease-standard/emphasized`, `.tpm-reveal` (dropdown/sheet), `.tpm-scrim`, plus the global `prefers-reduced-motion` override in `globals.css`.

## Steps

1. **Feed availability into the header** — `layout.tsx` awaits `getGameCounts()` and passes it to `<SiteHeader gameCounts={...} />`. Keep the header a client component (it uses `useCart`, `useAuth`, search state); games become a prop, not a fetch.
2. **Derive the game list** — a small helper that maps `TCGS` → `{ tcg, label: TCG_META[tcg].name, href: '/catalog?game=<tcg>', available: count > 0 }`. No per-game JSX anywhere (AC#1).
3. **Desktop nav** — replace the hardcoded `Magic` link + inert `navMore` span with a real Games menu (button + `.tpm-reveal` dropdown) listing every TCG. Magic now points at `/catalog?game=mtg` (AC#2). Unavailable games render disabled with the `common.soon` badge, matching the home tiles (AC#3). Full keyboard operability: Escape closes, focus returns to trigger, click-outside closes, `aria-expanded`/`aria-controls` on the trigger.
4. **Mobile nav** — turn the hamburger `Link` into a menu trigger opening a sheet with the same derived entries plus the existing top-level links (Catalog, Stores) (AC#4). Reuse `.tpm-reveal`/`.tpm-scrim`.
5. **i18n** — add the games-menu label and any new strings to `messages/es.json` and `messages/en.json`; game names come from `TCG_META` (proper nouns, not translated), "soon" reuses `common.soon` (AC#5).
6. **Checks + audit** — `pnpm typecheck`, `pnpm lint`, web tests; then a `web-design-guidelines` audit of the header (AC#6).

## Notes

- Frontend-only; no API changes, no money flow, no regulatory surface.
- Delegated to `nextjs-frontend` with the `frontend-design` quality bar, verified by `task-verifier`.
- Branch `task/task-041`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Header game navigation is now derived, not hardcoded:

- `apps/web/src/lib/catalog/game-nav.ts` — `getGameNavItems(gameCounts)` maps shared `TCGS` + `TCG_META` to `{ tcg, label, href: '/catalog?game=<tcg>', available: count > 0 }`. Single source of truth; covered by `game-nav.test.ts` (5 cases, following the `game-filters.test.ts` convention).
- `apps/web/src/app/[locale]/layout.tsx` — server-side `getGameCounts()` wrapped in try/catch (falls back to `[]`) and passed to `<SiteHeader gameCounts>`, so the header stays a client component with no client fetch and still renders if the counts call fails.
- `GamesMenu.tsx` (desktop dropdown) and `MobileNav.tsx` (hamburger → sheet) render the same derived list. Unavailable games are non-interactive rows with `common.soon`, matching `BrowseByGame` exactly.
- `nav-styles.ts` extracts the shared `navLinkClass` previously inlined in `SiteHeader`.
- i18n: `common.navMagic` removed (no longer referenced anywhere), `common.openMenu` / `common.closeMenu` added to both locales. Game names come from `TCG_META` — proper nouns, not translated.

Motion/a11y built on the TASK-045 foundation: `.tpm-reveal` / `.tpm-scrim` / `.tpm-drawer-panel` with `duration-fast` / `ease-standard`, transform+opacity only, globally neutralised under `prefers-reduced-motion`. Triggers carry `aria-expanded` / `aria-controls` / `aria-haspopup`; Escape closes and returns focus to the trigger; `GamesMenu` also closes on outside `mousedown` and `focusin`; the mobile sheet reuses `CartDrawer`'s body-scroll-lock + `overscroll-contain`.

web-design-guidelines audit run twice (implementer + verifier). One finding fixed: the hamburger's three decorative bars lacked `aria-hidden`. Verifier noted the mobile sheet has no full focus trap — same as the pre-existing `CartDrawer`, so consistent with app-wide precedent rather than a new regression.

Checks: typecheck, biome, web tests (47) and api tests (182) all green; `NEXT_PUBLIC_USE_MOCKS=true pnpm build` sanity-checked the OpenNext build. Merged to main (7576935), deployed thepubmarket-web (version a4b574f3).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the site header's hardcoded "Magic" link and inert "Juegos" placeholder with a real per-TCG games navigation driven by the shared `TCGS` list, giving every supported game — Riftbound included — a working entry into its filtered catalog view (`/catalog?game=<tcg>`) on both desktop and mobile.

**What changed.** A new `getGameNavItems()` helper derives the nav entries from `TCGS` + `TCG_META` + catalog counts, so there is no per-game JSX anywhere. The `[locale]` layout fetches game counts server-side (with a safe fallback) and passes them into the header as a prop. Two new components render that list: `GamesMenu` (desktop dropdown) and `MobileNav` (hamburger sheet, replacing the old single link to `/catalog`). Games with no stock render non-interactive with the "Pronto"/"Soon" label, matching the home Browse-by-game tiles.

**Motion and a11y.** Both menus build on the TASK-045 foundation — `.tpm-reveal`/`.tpm-scrim`/`.tpm-drawer-panel`, transform/opacity only, reduced-motion respected globally. Escape closes and returns focus to the trigger, outside click/focus dismisses the dropdown, ARIA disclosure attributes are in place, and the mobile sheet reuses the CartDrawer scroll-lock pattern.

**Tests.** New `game-nav.test.ts` (5 cases); typecheck, biome, 47 web tests and 182 api tests green, plus an OpenNext build sanity check. Audited with web-design-guidelines (one finding — missing `aria-hidden` on the hamburger bars — fixed).

**Follow-up worth noting:** neither the mobile sheet nor the pre-existing `CartDrawer` implements a full focus trap. Out of scope here since it would be an app-wide change, but a candidate for a later a11y pass.
<!-- SECTION:FINAL_SUMMARY:END -->
