---
id: TASK-041
title: 'Navbar: per-TCG navigation with a Riftbound entry'
status: To Do
assignee: []
created_date: '2026-08-06 05:44'
labels:
  - 'epic:riftbound-ux'
  - web
milestone: m-3
dependencies: []
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
<!-- AC:END -->
