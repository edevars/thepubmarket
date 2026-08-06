---
id: TASK-041
title: 'Navbar: per-TCG navigation with a Riftbound entry'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 05:44'
updated_date: '2026-08-06 08:26'
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
- [ ] #1 The header offers navigation to each available TCG's catalog view, including Riftbound, derived from the shared TCGS list / catalog availability rather than hardcoded per-game JSX
- [ ] #2 The Magic entry links to the MTG-filtered catalog (not the unfiltered catalog), and the non-interactive Juegos placeholder is replaced by the working games navigation
- [ ] #3 Games without available stock are handled deliberately (hidden or marked as coming soon, consistent with the home Browse-by-game tiles)
- [ ] #4 Mobile navigation exposes the same game entries
- [ ] #5 Labels localized in es and en; typecheck, biome, and web tests green
- [ ] #6 Menu reveal, hover, and focus states use the shared motion foundation (TASK-045) with clear transitions, full keyboard operability, and prefers-reduced-motion respected; a web-design-guidelines skill audit of the header reports no violations
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
