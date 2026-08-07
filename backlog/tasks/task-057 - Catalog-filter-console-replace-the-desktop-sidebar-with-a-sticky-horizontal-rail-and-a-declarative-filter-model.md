---
id: TASK-057
title: >-
  Catalog filter console: replace the desktop sidebar with a sticky horizontal
  rail and a declarative filter model
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-07 03:13'
labels:
  - 'epic:catalog-filter-console'
  - web
milestone: m-3
dependencies:
  - TASK-053
  - TASK-054
  - TASK-055
  - TASK-056
references:
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/catalog/FilterSidebar.tsx
  - apps/web/src/components/catalog/MobileFilterSheet.tsx
  - apps/web/src/lib/catalog/game-filters.ts
  - apps/web/src/lib/catalog/facet-presentation.ts
  - apps/web/src/lib/catalog/facet-counts.ts
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
  - apps/web/src/components/layout/GamesMenu.tsx
  - docs/ingenieria/catalogo-multijuego.md
priority: high
type: feature
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The catalog filter UI costs far more screen than it earns. On desktop it holds a fixed 232px column plus a 24px gap (~21% of the 1232px content width), and the panel itself runs ~700px tall with no game selected, ~1250px for MTG and ~1900px for Riftbound — with internal scrolling disabled on desktop, so its footer is unreachable. Visually it stacks nine different control idioms behind identical mono labels, so nothing reads as more important than anything else.

Replace it with a sticky horizontal filter console under the site header. The active game's identity facet (MTG mana pips, Riftbound domain runes) stays inline and in colour as the one expressive element; every other filter is a quiet trigger that opens a popover. The card grid reclaims the full content width.

Game selection moves out of the filters entirely into a navigation tab strip: it is navigation, not a filter — it drives the URL and refetches — and it already exists in the site header.

Underneath, the 377-line FilterSidebar monolith is replaced by a pure, unit-testable filter model that derives every control descriptor from the counts CatalogView already computes. The console and the mobile bottom sheet render from those same descriptors and share the same control primitives, so adding a facet becomes a declaration rather than an edit to a monolith.

Scope note: toggling a game facet currently remounts the whole catalog view because the page remount key still includes the serialized game facets, even though TASK-053 stopped sending them to the server fetch. That remount destroys focus and any open popover, so it must be fixed as part of this work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Desktop catalog renders no persistent filter sidebar column; the card grid spans the full content width of the page container
- [ ] #2 A sticky filter console sits directly below the site header and shows the active game's identity facet inline; remaining filters are triggers, and any facet beyond the inline width budget collapses into a single overflow trigger
- [ ] #3 The inline/overflow split is deterministic and computed without runtime measurement, and is correct for MTG (4 facets), Riftbound (7 facets) and the four games with no facets
- [ ] #4 Game selection is presented as a navigation tab strip separate from the filters, preserves the search query and all local filters when switching games, and offers a discoverable way to return to all games
- [ ] #5 Clearing filters keeps the active game instead of navigating away from it, and the active game no longer counts toward the active filter count
- [ ] #6 A pure module derives every filter descriptor (kind, zone, values, counts, selected, disabled) from the counts CatalogView already computes, with no duplicated computation, and the `count === 0 && !selected` disabled rule exists in exactly one place
- [ ] #7 Filter popovers are keyboard accessible: Escape closes and returns focus to the trigger, clicking or moving focus outside closes, and each trigger exposes aria-expanded and aria-controls
- [ ] #8 Popover panels are never clipped by an overflow container and never render beneath the card grid or above the site header
- [ ] #9 Toggling a game facet does not remount the catalog view: keyboard focus stays on the control and the page does not scroll to top; browser Back still restores the previous facet selection
- [ ] #10 The mobile bottom sheet keeps its dialog semantics: role=dialog, aria-modal, an aria-labelledby that resolves to a rendered element, focus moved into the panel on open, focus returned to the trigger on all three close paths, body scroll lock, and Escape to close
- [ ] #11 The console and the mobile sheet render from the same descriptors and share the same control primitives; FilterSidebar.tsx and GameFacetSection.tsx no longer exist
- [ ] #12 Shared control primitives do not silently change semantics between surfaces: the foil control stays a switch in the sheet while presenting as a pressed toggle in the console
- [ ] #13 All user-facing strings come from next-intl with full es/en key parity, and message keys orphaned by this change are removed
- [ ] #14 All motion uses the existing duration and easing tokens with no hardcoded milliseconds or cubic-beziers, and prefers-reduced-motion is respected
- [ ] #15 New unit tests cover the filter model: the disabled rule, the frozen facet order, null identity for games without facets, the inline/overflow split per game, and width estimates that do not vary with selection count
- [ ] #16 pnpm typecheck, pnpm lint, pnpm turbo run test and pnpm build all pass, with no regression against the 322-test baseline
- [ ] #17 The UI is audited against the web-design-guidelines skill before the task closes
- [ ] #18 docs/ingenieria/catalogo-multijuego.md documents the new filter architecture, including what a new TCG must declare to get an identity zone
<!-- AC:END -->
