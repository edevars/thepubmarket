---
id: TASK-042
title: >-
  Card detail: render full Riftbound metadata (rules text, flavor text, rarity,
  set)
status: In Progress
assignee:
  - claude
created_date: '2026-08-06 05:44'
updated_date: '2026-08-06 08:40'
labels:
  - 'epic:riftbound-ux'
  - web
milestone: m-3
dependencies:
  - TASK-038
  - TASK-045
references:
  - apps/web/src/components/detail/CardDetailView.tsx
  - apps/web/src/components/detail/game-attributes.ts
  - apps/web/src/components/detail/game-attributes.test.ts
  - 'apps/web/src/app/[locale]/catalog/[id]/page.tsx'
  - apps/web/messages/es.json
  - apps/web/messages/en.json
priority: medium
type: enhancement
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The listing detail page currently shows only the basic Riftbound attribute rows (type/supertype, domains, energy, might) delivered by TASK-034. The richer metadata imported from dotgg — rules text, flavor text, rarity, set name, collector number — exists in catalog_cards but is never rendered, so the Riftbound detail page is noticeably poorer than what the strict source metadata supports. Note: rules/flavor text contain `:rb_x:` icon tokens preserved verbatim by the importer.

Outcome: a shopper viewing a Riftbound listing sees the complete card information, matching the depth other TCG marketplaces offer, without affecting non-Riftbound detail pages. Part of `epic:riftbound-ux`.

Depends on TASK-038, which makes rules text, flavor text, rarity, and set metadata available in the catalog detail API response.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Riftbound listing detail shows rules text and flavor text, with :rb_x: icon tokens rendered as icons or a readable fallback — never as raw tokens
- [ ] #2 Rarity, set name/code, and collector number are displayed on the detail page
- [ ] #3 Existing attribute rows (type/supertype, domains, energy, might) are retained and consistent with the new sections
- [ ] #4 Missing fields are hidden gracefully (no empty labels); non-Riftbound listings are unaffected
- [ ] #5 Labels localized in es and en; typecheck, biome, and tests green including game-attributes tests
- [ ] #6 New metadata sections are visually first-class: deliberate typographic hierarchy and entrance/expand transitions from the shared motion foundation (TASK-045), respecting prefers-reduced-motion; a web-design-guidelines skill audit of the detail page reports no violations
<!-- AC:END -->
