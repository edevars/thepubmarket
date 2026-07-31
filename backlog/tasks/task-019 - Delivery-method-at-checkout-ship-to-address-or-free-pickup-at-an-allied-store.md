---
id: TASK-019
title: 'Delivery method at checkout: ship to address or free pickup at an allied store'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-31 00:56'
updated_date: '2026-07-31 00:59'
labels:
  - 'epic:delivery'
  - api
  - web
  - db
  - orders
  - checkout
milestone: m-2
dependencies: []
references:
  - apps/api/src/routes/checkout.ts
  - apps/api/src/lib/stripe.ts
  - apps/api/src/lib/orders.ts
  - packages/db/src/schema.ts
  - apps/web/src/components/cart
documentation:
  - docs/ingenieria/estado-actual.md
  - CLAUDE.md
priority: high
type: feature
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today checkout goes straight from the cart to Stripe. The buyer never says where the order should go, nothing captures an address, and no shipping is charged. A physical store cannot fulfil an order it has no destination for, so this blocks any real sale — it is not a nice-to-have.

Add a delivery step before payment with exactly two options:

- **Ship to my address.** The buyer enters a delivery address and pays a shipping fee. Real rates will vary by location; for now the fee is a fixed placeholder of MXN 200 per order.
- **Pick up at an allied store.** Free. The buyer picks any active store on the platform in the same city as the selling store. Copy must set the expectation up front: it can take up to 7 days to reach the pickup store, and the buyer will be notified when it is ready to collect.

Money constraints (non-custodial, see CLAUDE.md):

- The shipping fee is charged inside the same direct charge on the seller's Connect account. The platform must not collect, hold, or route it at any point.
- The application fee stays computed on the product subtotal only — the platform earns nothing on freight. Changing that is an explicit pricing decision, never a side effect of adding shipping to the total.

Flagged at creation, not blocking this task:

- MXN 200 is a placeholder standing in for real location-based rates.
- Who absorbs the cost of moving a card from the selling store to a different pickup store is an operational question, not a software one.
- `sellers.city` is free text, so same-city matching is only as good as that data.

User-facing copy in Spanish; code, comments and docs in English.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Buyer must choose between shipping to an address and pickup at an allied store before being sent to Stripe; the step cannot be skipped or bypassed
- [ ] #2 Choosing shipping requires a complete delivery address and adds MXN 200 to the order total, shown as a separate line from the product subtotal before payment
- [ ] #3 Choosing pickup lists only active stores in the same city as the selling store, adds no cost, and states the up-to-7-days expectation
- [ ] #4 The chosen method, the address or the pickup store, and the shipping amount are persisted on the order and survive payment confirmation
- [ ] #5 The application fee sent to Stripe is computed on the product subtotal only and excludes the shipping amount, verified against the created Checkout Session
- [ ] #6 An order whose selling store has no other store in its city still offers shipping and never presents an empty or broken pickup option
- [ ] #7 Orders created before delivery methods existed still render in /compras and /panel without errors
- [ ] #8 Verified end to end against the deployed API in Stripe test mode: one shipping order and one pickup order both reach paid with the correct totals and persisted delivery data
- [ ] #9 docs/ingenieria/ documents the delivery model, where the MXN 200 is mocked, and how same-city pickup eligibility is decided
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Research findings (current system)

- `checkout.ts` builds the order from cart lines only: `totalCents = subtotalCents`, no shipping, no address, no delivery choice.
- `orders` has shipping *fulfilment* columns (`trackingNumber`, `shippedAt`, `deliveredAt`) but no destination.
- `shippingCents` is currently **derived** in `lib/orders.ts` as `max(0, total - subtotal)`, which is always 0 today.
- The cart drawer pays via `/cart?pay=1`, and the cart page **auto-submits checkout** from a `useEffect`. That auto-start is exactly what AC #1 forbids, so it has to become "open the delivery step".
- `CartItem` already carries `sellerId`, so the client knows the selling store without a lookup.
- `GET /sellers` already exposes city/address/hours publicly for active stores.
- Schema comment is explicit that the `status` CHECK cannot be extended (D1 rejects table rebuilds). Same reasoning applies to adding CHECK constraints via `ALTER TABLE ADD COLUMN`, so delivery values are validated with zod in the app layer, not by the database.

## Approach

**1. Shared contract** (`packages/shared`)
`DeliveryMethod`, `ShippingAddress`, `DeliverySelection` (discriminated union), `PickupPoint`, and the two placeholder constants `SHIPPING_FLAT_CENTS` / `PICKUP_ETA_DAYS`. The constant lives in shared so the cart preview and the server charge cannot drift — the server stays authoritative and never trusts a client-sent amount.

**2. Schema + migration 0007**
Add to `orders`: `delivery_method`, `shipping_cents` (NOT NULL DEFAULT 0), the `shipping_*` address columns, and `pickup_seller_id` → `sellers`. All nullable except `shipping_cents` so pre-existing rows stay valid. Replace the `total - subtotal` derivation with the real column.

**3. API**
- New `lib/delivery.ts`: city normalisation (trim/lowercase/strip accents — `sellers.city` is free text), pickup eligibility, and the amount for a method.
- `GET /checkout/pickup-points?sellerId=` — active stores in the selling store's city. The same-city rule lives server-side only; the client renders what it is given.
- `checkout.ts`: validate the selection, compute `shippingCents` **server-side**, persist delivery data, set `totalCents = subtotal + shipping`.
- `stripe.ts`: append shipping as its own line item. `application_fee_amount` keeps using the product subtotal — the platform earns nothing on freight.
- Unit tests for the delivery lib (city matching, eligibility, amounts).

**4. Web**
- `components/checkout/DeliveryStep.tsx`: method toggle, address form, pickup store picker with the 7-day expectation.
- Cart page gains a `delivery` phase; `?pay=1` opens that step instead of auto-submitting.
- `OrderSummary` shows shipping as its own line.
- es/en messages.

**5. Docs**: `docs/ingenieria/entrega.md`.

## Decision taken, flagged for review

The MXN 200 goes to the **seller**, inside the same direct charge — they are the ones paying the courier. The application fee stays on the product subtotal only. The alternative (platform keeps the shipping fee by folding it into the application fee) is also non-custodial and therefore legal, but it would mean the platform profits on freight it does not perform. Proceeding with the first; it is a one-line change if that call is wrong.

## Risks

- `?pay=1` must not bypass the delivery step — the auto-start effect is the regression to watch.
- Legacy orders (no delivery method) must keep rendering; covered by AC #7.
- Same-city matching is only as good as free-text `sellers.city`.
<!-- SECTION:PLAN:END -->
