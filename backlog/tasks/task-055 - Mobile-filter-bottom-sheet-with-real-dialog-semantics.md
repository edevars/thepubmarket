---
id: TASK-055
title: Mobile filter bottom-sheet with real dialog semantics
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-07 00:03'
labels:
  - 'epic:catalog-visual-refactor'
  - web
milestone: m-3
dependencies:
  - TASK-053
  - TASK-054
references:
  - apps/web/src/components/cart/CartDrawer.tsx
  - apps/web/src/components/layout/MobileNav.tsx
  - apps/web/src/components/catalog/CatalogView.tsx
priority: medium
type: feature
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of epic:catalog-visual-refactor. The mobile filter UI today is an inline fullscreen overlay inside CatalogView with no dialog semantics: no role="dialog"/aria-modal, no Escape-to-close, no body scroll lock, no focus trap or focus return, no scrim element. The correct pattern already exists in this codebase (MobileNav.tsx, CartDrawer.tsx: .tpm-scrim backdrop + .tpm-drawer-panel + scroll lock + Escape).

Outcome: a proper bottom-sheet for mobile filters, consistent with the app's drawer pattern and accessible.

Scope:
- New `apps/web/src/components/catalog/MobileFilterSheet.tsx` replacing the `mobileFiltersOpen` inline <aside> overlay in CatalogView: `fixed inset-0 z-50`, `.tpm-scrim` backdrop button, `.tpm-drawer-panel` bottom sheet (`max-h-[88%]`, `border-t border-line-strong`), body scroll lock + Escape via effect (copy CartDrawer's mechanics), PLUS what CartDrawer itself lacks: `role="dialog" aria-modal="true" aria-labelledby` pointing at the Filters heading, initial focus moved into the sheet on open, focus returned to the trigger button on close.
- Sticky footer keeps the existing `showResults` CTA with live result count; applying filters inside the sheet updates the count without closing the sheet.
- Desktop `md:` sidebar behavior untouched.

Depends on TASK-053 (URL state — filter changes inside the sheet must not remount/close it) and TASK-054 (renders the refactored sidebar content). Subagent: nextjs-frontend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sheet opens as a bottom sheet with scrim fade and panel slide using existing motion tokens; Escape and scrim tap close it; background never scrolls while open
- [ ] #2 role=dialog, aria-modal, and aria-labelledby are present; focus enters the sheet on open and returns to the Filters trigger on close
- [ ] #3 Applying any filter inside the sheet updates the live count in the CTA without closing the sheet
- [ ] #4 Desktop sidebar unchanged; pnpm typecheck, pnpm build, and biome are green
<!-- AC:END -->
