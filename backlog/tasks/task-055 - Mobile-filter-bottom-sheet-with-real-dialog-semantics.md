---
id: TASK-055
title: Mobile filter bottom-sheet with real dialog semantics
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-07 00:03'
updated_date: '2026-08-07 01:47'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Plan (deps TASK-053/TASK-054 both Done and merged to main):

Confirmed by reading the real current code:
- `CatalogView.tsx` (lines ~445-482): mobile overlay is an inline `<aside>` toggled by `mobileFiltersOpen` state, with classes `fixed inset-0 z-40 block bg-bg/80 p-4 backdrop-blur-sm` on mobile / `md:sticky ... md:block` on desktop — same element does double duty for both breakpoints. No scrim button, no role=dialog, no focus trap, no focus return. Trigger is the "Filters (count)" button at line ~419-425 (`md:hidden`).
- `FilterSidebar.tsx` already has the mobile-only sticky footer CTA (`onClose &&` block, lines 346-356) with `t('showResults', { count: resultCount })` — this stays as-is, MobileFilterSheet just needs to render FilterSidebar inside itself and pass `onClose`.
- `CartDrawer.tsx` and `MobileNav.tsx` are the two reference implementations: both use `.tpm-scrim` scrim button + `.tpm-drawer-panel` panel + a `useEffect` that sets `document.body.style.overflow = 'hidden'` and listens for Escape while open, restoring on cleanup. NEITHER has `role="dialog"`/`aria-modal`/`aria-labelledby`, initial focus-into-panel, or focus-return-to-trigger — MobileNav does at least refocus its trigger on Escape (not on scrim-click or other close paths) via a `triggerRef`. TASK-055 must add what these lack, not just copy them verbatim.

Implementation:
1. New `apps/web/src/components/catalog/MobileFilterSheet.tsx`: `'use client'` component wrapping `FilterSidebar`. Props: `open`, `onClose`, `triggerRef` (or accept the trigger ref via a callback so focus can return to the "Filters" button), plus everything FilterSidebar needs (pass through). Structure: `fixed inset-0 z-50` wrapper, `.tpm-scrim` backdrop button (mirror CartDrawer), `.tpm-drawer-panel` bottom sheet — `max-h-[88%]`, `border-t border-line-strong`, anchored to viewport bottom (mirror CartDrawer's mobile-only geometry, not its `sm:` desktop-right-panel variant since this component is mobile-only, `md:` hidden entirely — desktop uses the existing sticky `<aside>` sidebar unchanged).
2. Dialog semantics: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at a heading rendered inside the sheet (FilterSidebar's own "Filters" header text at line ~99-101 — either give it an id and reference it, or render a visually-hidden heading in MobileFilterSheet itself if wiring an id into FilterSidebar is awkward).
3. Focus management (the part CartDrawer/MobileNav don't fully have): on open, move focus into the sheet (first focusable element, or the panel container itself with `tabIndex={-1}` and `.focus()` — simplest robust option, mirrors common dialog patterns). On close (via Escape, scrim click, or the "Ver resultados" CTA), return focus to the trigger button — needs a ref threaded from `CatalogView`'s existing "Filters (count)" button.
4. Body scroll lock + Escape: copy `CartDrawer`'s `useEffect` mechanics (save/restore `document.body.style.overflow`, `keydown` listener for Escape → close).
5. `CatalogView.tsx`: replace the inline `<aside>`'s mobile branch with `<MobileFilterSheet>`; keep the desktop `<aside className="hidden md:sticky md:block ...">` wrapping `<FilterSidebar>` as a separate, always-desktop render (simplifies both — no more single element serving both breakpoints via conditional classes). Add a `useRef` on the "Filters" trigger button, pass it to `MobileFilterSheet` for focus return.
6. Applying a filter inside the sheet must NOT close it — verify `writeLocalFilters`/`toggleGameFilterValue`/etc none of them call `onClose`; only the explicit close paths (Escape, scrim, X button if present, "Ver resultados" CTA) do. The live result count in the CTA already updates automatically since `resultCount` is a prop threaded from `CatalogView`'s `visible.length`.
7. Desktop `md:` sidebar behavior must be byte-for-byte unchanged — no visual/behavioral diff for md+.
8. `pnpm typecheck`, `pnpm build`, `pnpm biome check` green (no vitest requirement per AC#4 — this is a .tsx-only component, excluded from vitest coverage per repo convention, but confirm existing tests still pass anyway).

Executed by nextjs-frontend subagent in isolated worktree on branch task/TASK-055; verified by task-verifier before merge — verifier should specifically check focus trap/return and that filter interactions inside the sheet don't close it, not just visual/scrim behavior.
<!-- SECTION:PLAN:END -->
