---
id: TASK-040
title: >-
  Catalog UI: Riftbound filter sidebar (domains, energy, might, type, rarity,
  set)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 05:44'
updated_date: '2026-08-06 07:39'
labels:
  - 'epic:riftbound-ux'
  - web
milestone: m-3
dependencies:
  - TASK-039
  - TASK-045
references:
  - apps/web/src/components/catalog/FilterSidebar.tsx
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/catalog/ActiveChips.tsx
  - apps/web/src/lib/catalog/data.ts
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
  - apps/web/messages/es.json
  - apps/web/messages/en.json
priority: high
type: feature
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The public catalog filter sidebar today offers only game, condition, language, foil, and price — no game has attribute-specific filters. This task adds the Riftbound-specific filter experience: when the shopper is browsing Riftbound, the sidebar gains filters matching Riftbound's strict metadata (domains, energy, might, card type, rarity, set), wired to the API filter params delivered by TASK-039.

Outcome: a shopper can narrow the Riftbound catalog by its native card attributes with the same UX quality as the existing filters (chips, counts where applicable, URL persistence), and the pattern is reusable when other TCGs get their own attribute filters.

Depends on TASK-039, which provides the GET /catalog filter parameters these controls drive.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When Riftbound is the selected game, the filter sidebar offers domain, energy, might, card type, rarity, and set filters alongside the existing condition/language/foil/price filters
- [ ] #2 Active Riftbound filters appear as removable chips and persist in the URL, so filtered views are shareable and survive reload
- [ ] #3 Switching to another game (or clearing the game) removes Riftbound-specific filters and controls; other games' filtering is unaffected
- [ ] #4 Empty result states render correctly and the sidebar works on mobile viewports
- [ ] #5 Filter labels localized in es and en; typecheck, biome, and existing web tests green
- [ ] #6 Filter micro-interactions use the shared motion foundation (TASK-045): chip add/remove and card grid updates transition smoothly, respecting prefers-reduced-motion; a web-design-guidelines skill audit of touched surfaces reports no violations
<!-- AC:END -->
