---
id: TASK-019
title: 'Delivery method at checkout: ship to address or free pickup at an allied store'
status: To Do
assignee: []
created_date: '2026-07-31 00:56'
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

User-facing copy in Spanish; code, comments and docs in English.</description>
<parameter name="acceptanceCriteria">["Buyer must choose between shipping to an address and pickup at an allied store before being sent to Stripe; the step cannot be skipped or bypassed","Choosing shipping requires a complete delivery address and adds MXN 200 to the order total, shown as a separate line from the product subtotal before payment","Choosing pickup lists only active stores in the same city as the selling store, adds no cost, and states the up-to-7-days expectation","The chosen method, the address or the pickup store, and the shipping amount are persisted on the order and survive payment confirmation","The application fee sent to Stripe is computed on the product subtotal only and excludes the shipping amount, verified against the created Checkout Session","An order whose selling store has no other store in its city still offers shipping and never presents an empty or broken pickup option","Orders created before delivery methods existed still render in /compras and /panel without errors","Verified end to end against the deployed API in Stripe test mode: one shipping order and one pickup order both reach paid with the correct totals and persisted delivery data","docs/ingenieria/ documents the delivery model, where the MXN 200 is mocked, and how same-city pickup eligibility is decided"]
<!-- SECTION:DESCRIPTION:END -->
