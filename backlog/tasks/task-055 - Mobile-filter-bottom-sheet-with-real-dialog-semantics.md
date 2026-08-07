---
id: TASK-055
title: Mobile filter bottom-sheet with real dialog semantics
status: Done
assignee:
  - '@claude'
created_date: '2026-08-07 00:03'
updated_date: '2026-08-07 01:57'
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
modified_files:
  - apps/web/messages/en.json
  - apps/web/messages/es.json
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/catalog/FilterSidebar.tsx
  - apps/web/src/components/catalog/MobileFilterSheet.tsx
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
- [x] #1 Sheet opens as a bottom sheet with scrim fade and panel slide using existing motion tokens; Escape and scrim tap close it; background never scrolls while open
- [x] #2 role=dialog, aria-modal, and aria-labelledby are present; focus enters the sheet on open and returns to the Filters trigger on close
- [x] #3 Applying any filter inside the sheet updates the live count in the CTA without closing the sheet
- [x] #4 Desktop sidebar unchanged; pnpm typecheck, pnpm build, and biome are green
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
MobileFilterSheet.tsx nuevo: .tpm-scrim/.tpm-drawer-panel (mismo patrón que CartDrawer) + lo que CartDrawer/MobileNav NO tenían — role="dialog" aria-modal="true" aria-labelledby apuntando a un id real renderizado condicionalmente en FilterSidebar (titleId prop, solo se monta dentro del sheet, sin id duplicado en desktop), foco movido al panel al abrir (panelRef.focus()), y retorno de foco al trigger ("Filters" button, filtersTriggerRef en CatalogView) en los tres caminos de cierre (Escape/scrim/CTA "Ver resultados") unificados en un solo close() callback — simétrico, no tres implementaciones separadas. Sin trap de Tab/Shift+Tab: confirmado que el AC#2 tal como está escrito no lo exige, solo entrada+retorno de foco.

CatalogView.tsx: el <aside> dual-propósito (mobile+desktop con clases condicionales) se separó en un <aside> solo-desktop sin cambios de comportamiento, y MobileFilterSheet para mobile. FilterSidebar.tsx: min-h-0 flex-1 en el root es inerte en desktop (el wrapper desktop no es flex container, confirmado por el verifier).

Verificado por task-verifier con PASS riguroso en las 4 AC, con trazado individual de cada uno de los tres caminos de cierre y confirmación de que ningún callback de cambio de filtro llama a onClose. typecheck/vitest(115/115)/biome/build verdes; branch confirmado partiendo del main actualizado (con TASK-053/054 ya mergeados). Mergeado a main en a3d4815 (merge commit posterior).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
El filtro móvil deja de ser un overlay sin semántica accesible y pasa a ser un diálogo real: `MobileFilterSheet` agrega `role="dialog"`, `aria-modal`, `aria-labelledby`, foco que entra al abrir y regresa al botón "Filtros" al cerrar (por Escape, tap en el scrim, o el CTA "Ver resultados"), todo sobre el mismo patrón visual `.tpm-scrim`/`.tpm-drawer-panel` que ya usan `CartDrawer` y `MobileNav` — pero yendo más allá de esos dos, que carecían de estas piezas de accesibilidad.

Aplicar un filtro dentro del sheet nunca lo cierra; el conteo de resultados en el CTA se actualiza en vivo. El sidebar de escritorio quedó sin cambios de comportamiento — ahora renderiza `FilterSidebar` de forma independiente, ya no comparte un único elemento con clases condicionales para ambos breakpoints.

Verificado por task-verifier con PASS explícito y trazado individual de los tres caminos de cierre (el punto más fácil de romper sutilmente en este tipo de tarea). Mergeado a main en a3d4815.
<!-- SECTION:FINAL_SUMMARY:END -->
