---
id: TASK-032
title: 'Seller panel: game selector and Riftbound add-card flow'
status: To Do
assignee: []
created_date: '2026-08-06 02:20'
labels:
  - 'epic:riftbound'
  - web
milestone: m-3
dependencies: []
references:
  - apps/web/src/components/panel/AddCardFlow.tsx
  - apps/web/src/lib/client-api.ts
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - apps/web/src/lib/catalog/display.ts
  - apps/web/src/components/panel/PhotoManagerModal.tsx
priority: high
type: feature
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The seller panel's add-card flow (apps/web/src/app/[locale]/panel/agregar/page.tsx → apps/web/src/components/panel/AddCardFlow.tsx, steps search → detail → success) has no game selector, keys search results and selection on `scryfallId` (lines 91-97, 186, 388), and its i18n copy literally says "Scryfall catalog" (apps/web/messages/es.json:404, en.json:404). The client API layer (apps/web/src/lib/client-api.ts: searchPrintings 211-217, createListing 122-134) targets the Scryfall-only endpoints.

Sellers must be able to choose the game (MTG or Riftbound), search the Riftbound catalog, pick a printing, and publish a Riftbound listing with condition/finish/language/price/quantity — then manage photos exactly as today (PhotoManagerModal). Game display names come from TCG_META (apps/web/src/lib/catalog/display.ts).

This consumes the multi-game API contract from the sibling task "Multi-game catalog search and listing creation in seller/admin APIs".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Seller can select Riftbound, search by card name, pick a printing, and publish a listing end-to-end from the panel
- [ ] #2 The MTG add-card flow is unchanged in behavior
- [ ] #3 Search-result identity/keying no longer assumes Scryfall ids
- [ ] #4 i18n copy in both es and en no longer hardcodes Scryfall; game names come from TCG_META
- [ ] #5 The photo manager works for Riftbound listings
- [ ] #6 Typecheck and lint pass; flow verified per repo practice (no browser automation)
<!-- AC:END -->
