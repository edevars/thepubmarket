---
id: TASK-027
title: Show seller photo gallery on catalog item page
status: To Do
assignee: []
created_date: '2026-08-06 00:13'
labels:
  - 'epic:inventory-photos'
  - frontend
milestone: m-2
dependencies:
  - TASK-025
documentation:
  - docs/ingenieria/fotos-inventario.md
modified_files:
  - apps/web/src/components/detail/CardDetailView.tsx
  - apps/web/src/components/catalog/ProductCard.tsx
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - docs/ingenieria/fotos-inventario.md
priority: medium
type: feature
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This is the payoff of the feature: the buyer must be able to inspect the actual card's condition before paying — and must never confuse the canonical Scryfall reference image with the seller's real photos. Mixing the two would be actively misleading, since a pristine stock image next to an HP card is exactly the expectation gap that causes disputes.

The item detail view already renders a decorative placeholder thumbnail strip beneath the main image; this task makes that strip real.

Durable decisions already made:
- The canonical Scryfall image and the seller's photos must be labeled distinctly and never presented as interchangeable.
- No generated thumbnails: the client-compressed original is scaled with CSS. At six photos per listing this is not worth a resizing pipeline.
- A listing with quantity greater than 1 shows photos of one physical copy; the buyer-facing copy must say the photos are representative of the copy shipped.
- Listings with zero photos must render exactly as they do today — this feature cannot regress the existing catalog.

Note on tests: apps/web UI flows in this project are validated by a documented manual E2E pass, not an automated browser suite. Follow that convention.

This feature touches no payment, payout or Stripe code path — no fund-custody implications.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Item detail shows the Scryfall image labeled as a reference image and the seller's photos labeled as actual photos of the card being sold; the two are visually distinguishable at a glance
- [ ] #2 Selecting a thumbnail swaps the main image, the active thumbnail is highlighted, and selection works via keyboard as well as pointer
- [ ] #3 A full-size overlay lets the buyer zoom into photo detail and closes via click and via Escape
- [ ] #4 Listings with quantity greater than 1 show copy clarifying the photos are representative of the copy shipped
- [ ] #5 With zero seller photos the placeholder strip is hidden and the page matches current layout and behavior exactly
- [ ] #6 A broken or failing image URL degrades gracefully with no layout jump
- [ ] #7 Catalog grid cards show a subtle indicator when a listing has real photos
- [ ] #8 All new strings exist in both the Spanish and English message catalogs
- [ ] #9 A manual E2E checklist covering a listing with photos, one without, both locales, and a mobile viewport is appended to docs/ingenieria/fotos-inventario.md
<!-- AC:END -->
