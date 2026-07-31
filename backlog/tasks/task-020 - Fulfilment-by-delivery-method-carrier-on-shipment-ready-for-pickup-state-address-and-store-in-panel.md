---
id: TASK-020
title: >-
  Fulfilment by delivery method: carrier on shipment, ready-for-pickup state,
  address and store in panel
status: To Do
assignee: []
created_date: '2026-07-31 00:56'
updated_date: '2026-07-31 00:56'
labels:
  - 'epic:delivery'
  - api
  - web
  - db
  - orders
milestone: m-2
dependencies:
  - TASK-019
references:
  - apps/api/src/routes/seller-panel.ts
  - apps/api/src/routes/orders.ts
  - apps/api/src/lib/orders.ts
  - apps/web/src/components/panel/OrdersView.tsx
  - apps/web/src/components/compras/ComprasView.tsx
priority: high
type: feature
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-019 lets a buyer choose how an order arrives. The seller panel still knows only one path: mark shipped with a tracking number. That leaves two holes.

A pickup order has no shipped state at all — it becomes *available at a store*, which is a different event and the one the buyer is waiting on. And a shipped order hands the buyer a tracking number with no carrier, which is a number they cannot look up anywhere.

Make fulfilment follow the delivery method the buyer chose:

- A shipping order is marked shipped with a tracking number and an optional carrier.
- A pickup order is marked ready for pickup — the moment the buyer can go get it — and later closed as collected.
- The panel shows the seller what each order actually needs: the full delivery address for a shipping order, the destination allied store for a pickup order.
- The buyer's own view (/compras) shows the same facts in buyer terms.

Constraint inherited from the schema: the order `status` enum is not extended. Delivery state stays derived, following the existing convention where shipped and delivered come from timestamps rather than new enum values — changing that CHECK constraint would force a table rebuild, which D1 rejects.

Depends on TASK-019, which provides the persisted delivery method, address and pickup store this task reads and renders.

User-facing copy in Spanish; code, comments and docs in English.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Marking a shipping order shipped accepts an optional carrier alongside the tracking number and persists both
- [ ] #2 A pickup order cannot be marked shipped; it is marked ready for pickup instead, and that transition is recorded with its own timestamp
- [ ] #3 A pickup order can be closed as collected and a shipping order as delivered, with neither action applicable to the other method
- [ ] #4 Every transition is rejected with a conflict when it does not apply to the order's current state, rather than silently succeeding
- [ ] #5 The seller panel shows the full delivery address for shipping orders and the destination store for pickup orders
- [ ] #6 /compras shows the buyer the delivery method, the tracking number with carrier once shipped, and the pickup store with its address once ready
- [ ] #7 Orders created before delivery methods existed still render and can still be marked shipped and delivered
- [ ] #8 Verified against the deployed API in Stripe test mode for both a shipping order and a pickup order, walking each through its full state sequence
- [ ] #9 docs/ingenieria/ documents both fulfilment paths, the derived states, and which panel action produces each
<!-- AC:END -->
