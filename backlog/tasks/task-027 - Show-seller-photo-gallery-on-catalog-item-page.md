---
id: TASK-027
title: Show seller photo gallery on catalog item page
status: Done
assignee:
  - claude
created_date: '2026-08-06 00:13'
updated_date: '2026-08-06 01:39'
labels:
  - 'epic:inventory-photos'
  - frontend
milestone: m-2
dependencies:
  - TASK-025
documentation:
  - docs/ingenieria/fotos-inventario.md
modified_files:
  - apps/web/src/components/detail/PhotoGallery.tsx
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
- [x] #1 Item detail shows the Scryfall image labeled as a reference image and the seller's photos labeled as actual photos of the card being sold; the two are visually distinguishable at a glance
- [x] #2 Selecting a thumbnail swaps the main image, the active thumbnail is highlighted, and selection works via keyboard as well as pointer
- [x] #3 A full-size overlay lets the buyer zoom into photo detail and closes via click and via Escape
- [x] #4 Listings with quantity greater than 1 show copy clarifying the photos are representative of the copy shipped
- [x] #5 With zero seller photos the placeholder strip is hidden and the page matches current layout and behavior exactly
- [x] #6 A broken or failing image URL degrades gracefully with no layout jump
- [x] #7 Catalog grid cards show a subtle indicator when a listing has real photos
- [x] #8 All new strings exist in both the Spanish and English message catalogs
- [x] #9 A manual E2E checklist covering a listing with photos, one without, both locales, and a mobile viewport is appended to docs/ingenieria/fotos-inventario.md
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Design

The item detail view already renders a fake 3-thumbnail placeholder strip under the main image (`CardDetailView.tsx` lines ~103-110, hardcoded empty divs). This task replaces that with a real, working gallery — but only when the listing actually has seller photos; with zero photos the page must render byte-for-byte what it renders today (AC5).

**New file**
1. `apps/web/src/components/detail/PhotoGallery.tsx` (`'use client'`, same leaf-client-in-server-parent pattern as `AddToCartButton`) — owns the whole image experience for a listing that has ≥1 seller photo:
   - `images` array = `[reference?, ...sellerPhotos]` — the Scryfall `card.imageUrl` (if present) prepended as a `kind: 'reference'` entry, then `item.photos` (already sortOrder-ordered by the API) as `kind: 'seller'` entries. Building it this way means the reference image is just another swappable slot in the same array/thumbnail-strip, not a special case in the render logic.
   - Main image is a `<button>` (native keyboard support for free) that opens a lightbox; overlaid with the same `ConditionBadge`/`FoilTag` as before, plus a corner tag reading "Imagen de referencia" or "Foto real de este ejemplar" depending on which is active — this is AC1's at-a-glance distinction.
   - Thumbnail strip: one `<button>` per image, `aria-current` + `border-primary` on the active one, `onClick` swaps `activeIndex`. Buttons are natively focusable/keyboard-activatable, satisfying AC2's keyboard requirement without extra arrow-key wiring.
   - Lightbox: fixed overlay, closes on backdrop click and on a visible ✕ button (pointer), plus a `useEffect` `keydown` listener for Escape (only attached while open) — satisfies AC3. Same backdrop-click-stops-propagation pattern as `PhotoManagerModal`/`ConfirmDialog` from TASK-026, with matching biome-ignore annotations for the two intentional a11y suppressions.
   - `ImageWithFallback` internal helper: wraps `<img onError={...}>`, tracks a local `broken` boolean, and on error swaps to a placeholder `<div>` carrying the *exact same* sizing className (`aspect-[5/7] w-full`) — same box, so no layout jump (AC6). Used for the main image, every thumbnail, and the lightbox image.
   - `item.quantity > 1` renders a buyer-facing hint distinct from the seller panel's copy: buyer framing is "these photos are representative of the copy you'll receive, more than one copy is available at this condition" (not "this is the exact copy").

**Modified files**
2. `apps/web/src/components/detail/CardDetailView.tsx` — image column becomes `item.photos.length > 0 ? <PhotoGallery item={item} /> : (...unchanged original markup...)`. The zero-photos branch is a byte-for-byte copy of what's there today, not a refactor, so AC5 holds by construction.
3. `apps/web/src/components/catalog/ProductCard.tsx` — when `item.photos.length > 0`, a small unicode-glyph badge (◈, matching the app's existing icon convention of ▶/❙❙/✓ rather than emoji) in an unused image corner (bottom-left; top-left is `ConditionBadge`, top-right is `FoilTag`), `title`/`aria-label` from a new `detail.hasRealPhotos` key. Subtle per AC7 — no layout change, just a small marker.
4. `apps/web/messages/es.json` / `en.json` — ~9 new keys under the existing `detail` namespace (both files currently 563 lines, `detail` at line 237 in both — verified): `galleryReferenceLabel`, `gallerySellerPhotoLabel`, `galleryQuantityHint`, `galleryZoomAria`, `galleryCloseAria`, `galleryThumbReferenceAria`, `galleryThumbPhotoAria` (`{n}` interpolation), `galleryImageError`, `hasRealPhotos`.
5. `docs/ingenieria/fotos-inventario.md` — append §10 with the manual E2E checklist: a listing with photos, one without (must match current behavior exactly), both locales, and a mobile viewport — per this repo's apps/web convention (documented manual pass, no automated browser suite; consistent with not driving browser automation for verification in this session).

**AC mapping**: #1→1's corner tag, #2→1's thumbnail buttons, #3→1's lightbox, #4→1's quantity hint, #5→2's branch split, #6→1's `ImageWithFallback`, #7→3, #8→4, #9→5.

No payment/payout/Stripe code touched — pure catalog/detail display wiring.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification run: `pnpm --filter @thepubmarket/web typecheck` (clean), `pnpm lint` (clean, 175 files — fixed one real a11y finding: `aria-label` isn't valid on a bare `<span>` without a role, added `role="img"` to the photos-indicator badge in ProductCard rather than dropping the accessible name), `pnpm --filter @thepubmarket/web build` (clean production build; `/catalog/[id]` grew from 2.67 kB to 4.46 kB reflecting the new gallery, all other routes unaffected).

es.json/en.json parity verified programmatically: both have exactly 32 keys under `detail` after the 9 new `gallery*`/`hasRealPhotos` additions.

Same convention as TASK-026: per this repo's stated apps/web testing convention and this session's standing instruction against driving browser automation for verification, I did not click through the UI myself. AC checks rest on code-level verification (typecheck/lint/build + reading the actual conditional-render logic) plus the manual checklist appended to docs/ingenieria/fotos-inventario.md §10, which a human runs interactively across a photo listing, a no-photo listing, both locales, and a mobile viewport.

AC5 (zero-photos regression) is verified by construction, not by inspection: the `item.photos.length > 0 ? <PhotoGallery/> : (...)` branch in CardDetailView.tsx has the exact original JSX (CardArt + ConditionBadge + FoilTag, no thumbnail strip) untouched in the else-branch — diffing the file shows only an added wrapper, not a rewrite of that markup. AC6 (no layout jump on broken image) rests on `ImageWithFallback` always applying the identical className to both the <img> and its error-fallback <div>, so the box never resizes, only its contents swap.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Seller photo gallery on the catalog item page

This is the payoff of the `inventory-photos` epic: the item detail page's fake 3-thumbnail placeholder strip is now a real gallery, live only when the listing actually has seller photos.

### What it does
- **`PhotoGallery.tsx`** (new): the Scryfall reference image and the seller's real photos share one swappable array — the reference is just another thumbnail slot, not a special case in the render logic — but the active main image always carries a visible tag ("Imagen de referencia" / "Foto real de este ejemplar") so a buyer can never mistake canonical art for the actual card, which is the whole point: a pristine stock image next to an HP card is exactly the expectation gap that causes disputes.
- **Thumbnails** are plain `<button>`s (keyboard-accessible for free via Tab + Enter/Space, no extra wiring needed), highlighted via `border-primary` + `aria-current` on the active one.
- **Lightbox**: click the main image to zoom full-size; closes on backdrop click, a visible ✕ button, or Escape (a `keydown` listener attached only while open). Same backdrop-click/stopPropagation pattern as TASK-026's `PhotoManagerModal`/`ConfirmDialog`.
- **No thumbnail pipeline**: reuses the already-compressed upload from TASK-026 (1600px JPEG) scaled with CSS — not worth a server-side resizing pipeline at a 6-photo cap.
- **Broken-image resilience**: `ImageWithFallback` swaps a failed `<img>` for a `<div>` with the *identical* className/aspect-ratio, so a dead URL never shifts the layout.
- **Zero-photos path**: `CardDetailView.tsx`'s image column is `item.photos.length > 0 ? <PhotoGallery/> : (...)`, where the else-branch is the untouched original markup — verified by construction, not inspection, that nothing regresses for the ~all listings that still have no photos.
- **Catalog grid**: a subtle ◈ badge in `ProductCard.tsx`'s otherwise-unused bottom-left image corner signals "has real photos" without disturbing layout.
- **Quantity>1 copy**: distinct buyer-facing framing from the seller panel's — "these are representative of the copy you'll receive, more than one is available at this condition" rather than "this is the exact copy."

### Verification
`pnpm --filter @thepubmarket/web typecheck`, `pnpm lint` (fixed one real a11y finding — `aria-label` needs `role="img"` on a bare `<span>`), and `pnpm --filter @thepubmarket/web build` all green; `/catalog/[id]` builds cleanly with the expected size bump. `es.json`/`en.json` parity verified programmatically (32 `detail` keys each). Per this repo's apps/web convention and this session's standing instruction against driving browser automation, the interactive walkthrough (photo listing, no-photo listing, both locales, mobile viewport) is left to the checklist appended at `docs/ingenieria/fotos-inventario.md` §10 rather than run by this agent.

No payment, payout, or Stripe code touched.

### Epic status
With TASK-023 through TASK-027 all Done, the `inventory-photos` epic is complete end to end: schema → upload/delete/reorder API → catalog/read wiring + R2 streaming → seller panel UI → buyer-facing gallery.
<!-- SECTION:FINAL_SUMMARY:END -->
