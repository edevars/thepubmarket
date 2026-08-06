---
id: TASK-043
title: >-
  Seller panel: Riftbound filtering and printing metadata in inventory and
  add-card flow
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 05:45'
updated_date: '2026-08-06 08:52'
labels:
  - 'epic:riftbound-ux'
  - web
milestone: m-3
dependencies:
  - TASK-038
  - TASK-045
references:
  - apps/web/src/components/panel/InventoryView.tsx
  - apps/web/src/components/panel/AddCardFlow.tsx
  - apps/web/src/lib/client-api.ts
  - apps/api/src/routes/seller-panel.ts
  - apps/web/messages/es.json
  - apps/web/messages/en.json
priority: medium
type: enhancement
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The seller panel's inventory game filter only shows chips for games the seller already stocks, and the add-card search results give minimal context per result — for Riftbound, where the same card exists across sets (OGN/UNL) and in foil-only printings, sellers cannot reliably pick the right printing. Inventory rows also don't surface set/game context for Riftbound listings.

Outcome: a seller can filter their panel inventory to Riftbound cards and confidently distinguish Riftbound printings when adding stock, using the strict metadata (set, collector number, rarity, domains, energy/might) and real finish availability. Part of `epic:riftbound-ux`.

Depends on TASK-038, which adds this metadata to the seller catalog search response.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Seller inventory view can be filtered to Riftbound; the game filter behavior for sellers with and without Riftbound stock is deliberate and consistent
- [ ] #2 Add-card search results display set, collector number, rarity, and key Riftbound attributes (domains, energy/might) so printings across sets are disambiguated
- [ ] #3 Finish availability is respected in the add-card UI: foil-only printings do not offer nonfoil, matching the API finish_not_available rule
- [ ] #4 Inventory rows surface game and set context for Riftbound listings
- [ ] #5 Labels localized in es and en; typecheck, biome, and tests green
- [ ] #6 Panel filter and search interactions use the shared motion foundation (TASK-045) for state transitions (chip toggles, result list updates), respecting prefers-reduced-motion; a web-design-guidelines skill audit of touched panel surfaces reports no violations
<!-- AC:END -->
