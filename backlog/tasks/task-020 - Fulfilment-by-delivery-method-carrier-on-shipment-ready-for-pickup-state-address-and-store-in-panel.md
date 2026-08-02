---
id: TASK-020
title: >-
  Fulfilment by delivery method: carrier on shipment, ready-for-pickup state,
  address and store in panel
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-31 00:56'
updated_date: '2026-08-02 04:12'
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
modified_files:
  - packages/db/src/schema.ts
  - packages/shared/src/index.ts
  - apps/api/migrations/0008_quiet_marvel_apes.sql
  - apps/api/src/lib/orders.ts
  - apps/api/src/lib/orders.test.ts
  - apps/api/src/routes/seller-panel.ts
  - apps/web/src/lib/client-api.ts
  - apps/web/src/components/panel/PanelProvider.tsx
  - apps/web/src/components/panel/OrdersView.tsx
  - apps/web/src/components/panel/status.ts
  - apps/web/src/components/compras/ComprasView.tsx
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - docs/ingenieria/entrega.md
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
- [x] #1 Marking a shipping order shipped accepts an optional carrier alongside the tracking number and persists both
- [x] #2 A pickup order cannot be marked shipped; it is marked ready for pickup instead, and that transition is recorded with its own timestamp
- [x] #3 A pickup order can be closed as collected and a shipping order as delivered, with neither action applicable to the other method
- [x] #4 Every transition is rejected with a conflict when it does not apply to the order's current state, rather than silently succeeding
- [ ] #5 The seller panel shows the full delivery address for shipping orders and the destination store for pickup orders
- [ ] #6 /compras shows the buyer the delivery method, the tracking number with carrier once shipped, and the pickup store with its address once ready
- [x] #7 Orders created before delivery methods existed still render and can still be marked shipped and delivered
- [ ] #8 Verified against the deployed API in Stripe test mode for both a shipping order and a pickup order, walking each through its full state sequence
- [x] #9 docs/ingenieria/ documents both fulfilment paths, the derived states, and which panel action produces each
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Research findings (current system)

- `POST /seller/orders/:id/ship` takes `{trackingNumber}` only and guards on `status='paid' AND shippedAt IS NULL`. `/deliver` guards on `shippedAt IS NOT NULL AND deliveredAt IS NULL`. Both already return **409** when the guard misses (`not_shippable` / `not_deliverable`), so AC #4's convention exists — it just has no notion of delivery method.
- Neither route filters by `delivery_method`, so today a **pickup order can be marked shipped**. That is the bug at the centre of AC #2.
- `deriveSellerOrderStatus()` in `lib/orders.ts` is the single place statuses come from; both the panel and /compras consume the same `SellerOrderStatus` union.
- Status is consumed in 6 places that must all learn the new value: `panel/status.ts` (colour map), `OrdersView` (tab filter, timeline, action block), `ComprasView` (colour map, tab filter, timeline, tracking block), `ResumenView` (month sales), `PanelProvider` (optimistic patch, `pendingCount`).
- `/ship` and `/deliver` respond with `orderToSellerOrder(row, [], undefined)` — no lines, no pickup store. The client only merges status and timestamps, so that is not a bug today, but the new pickup routes should resolve their store rather than echo a null one.

## Approach

**1. Migration 0008 — two additive columns**
`carrier` (text, nullable) and `ready_at` (integer, nullable) on `orders`. Pure `ALTER TABLE ADD COLUMN`, same constraint as 0007: D1 rejects table rebuilds, so no CHECK and no touching the `status` enum.

`ready_at` is a **new column rather than reusing `shipped_at`**. Overloading `shipped_at` to mean "arrived at the pickup store" would save a column and cost the truth: every query asking "what did we ship" would silently count pickups. The states stay derived from timestamps, which is the convention this schema already follows.

**2. Derived state**
`SellerOrderStatus` gains `'ready'` (readyAt set, not yet collected). It does **not** gain `'collected'`: collection and delivery are the same terminal fact — the buyer has the cards — so both set `deliveredAt` and derive `'delivered'`. Only the label differs by method ("Entregada" / "Recogida"). One terminal state keeps the existing tab filters and the month-sales sum correct without touching them.

**3. API**
- `shipSchema` gains `carrier` (optional, trimmed, 2–60).
- `/ship` and `/deliver` restricted to `delivery_method = 'shipping' OR IS NULL` — the NULL keeps legacy orders shippable (AC #7).
- New `/orders/:id/ready` — pickup only, from paid, `ready_at IS NULL`. 409 `not_ready_markable`.
- New `/orders/:id/collect` — pickup only, requires `ready_at IS NOT NULL`, sets `delivered_at` + `status='fulfilled'`. 409 `not_collectable`.
- Every guard is a WHERE clause on the UPDATE, so a wrong transition changes no rows and returns 409 instead of silently succeeding (AC #4).
- Unit tests for `deriveSellerOrderStatus` in a new `lib/orders.test.ts`.

**4. Web**
- `client-api`: carrier on `shipOrder`, plus `readyOrder` / `collectOrder`.
- `PanelProvider`: `markReady` / `markCollected`, and carrier threaded through `markShipped`.
- `OrdersView`: delivery block (full address for shipping, destination store for pickup), method-aware timeline and action — tracking + carrier input for shipping, a single "marcar lista para recoger" for pickup.
- `ComprasView`: method shown on the card, carrier beside the tracking number, and once ready, the pickup store with its address and what to do next.
- `'ready'` added to both colour maps; transit/en-curso tabs include it.

**5. Docs**: fulfilment section in `docs/ingenieria/entrega.md` — both paths, the derived states, and which panel action produces each.

## Verification and what blocks it

Locally: `wrangler dev` with Turnstile disabled, walk a shipping order paid → shipped → delivered and a pickup order paid → ready → collected, plus every cross-method rejection (ship a pickup, ready a shipping, collect before ready).

**AC #8 is blocked the same way TASK-019's was.** Production has no pickup order and `POST /checkout` fails closed on Turnstile, so I cannot create one from curl. It needs the browser run already pending on TASK-019.

## Risks

- The status union is consumed in 6 places; missing one shows as an order that renders with no colour or falls out of every tab. Typecheck catches the `Record<SellerOrderStatus, …>` maps but not the `.filter()` predicates — those get checked by hand.
- Legacy orders (`delivery_method IS NULL`) must stay shippable; that is the one branch where a NULL is load-bearing rather than tolerated.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Committed on `feat/task-020-fulfilment` (50e83ed). Verified against a local Worker (`wrangler dev --var TURNSTILE_SECRET_KEY:`) with three seeded paid orders: one shipping, one pickup at an allied store, one legacy with `delivery_method IS NULL`.

**Cross-method rejections** — every one returns 409 and changes no row:

| call | order | result |
|---|---|---|
| `/ship` | pickup | `not_shippable` |
| `/ready` | shipping | `not_pickup_ready` |
| `/ready` | legacy (null method) | `not_pickup_ready` |
| `/deliver` | pickup | `not_deliverable` |
| `/collect` | pickup, not yet ready | `not_collectable` |
| `/deliver` | shipping, not yet shipped | `not_deliverable` |

Repeating an already-applied transition returns the same 409 in all four routes. An order belonging to another seller returns 409 (opaque, not 404), as does an id that does not exist.

**Sequences** — shipping went paid → shipped (`carrier='Estafeta'`) → delivered; pickup went paid → ready → delivered. Final rows confirm the columns stayed in their own lanes: the pickup order has `ready_at` set and `shipped_at` NULL, the shipping order the reverse, and the legacy order shipped with `carrier` NULL.

**Body validation** — `trackingNumber` under 3 chars and `carrier` under 2 both return 400 `invalid_body`. Carrier omitted entirely persists NULL.

**DTOs** — `GET /seller/orders` and `GET /orders` both carry `carrier`, `readyAt` and the resolved pickup store; `/ready` and `/collect` echo the store rather than a null one. The legacy order renders with `method: null` in both.

Unit tests: new `lib/orders.test.ts`, 9 cases over `deriveSellerOrderStatus` (both sequences, the shared terminal state, legacy rows, terminal-wins, and an inconsistent row that must not fall out of the views). Full API suite 68 → 77 passing. Typecheck, lint and the web build all clean.

Local D1 mutations (seeded orders, the seller↔user link) were reverted afterwards.

**Left unchecked and why:**
- **#5, #6** — both assert what someone *sees*. The server halves are verified above and the components are written, but I have not observed them rendered; this project verifies via typecheck/lint/curl rather than driving a browser.
- **#8** — needs a deploy plus a paid pickup order in Stripe test mode. Production has none and `POST /checkout` fails closed on Turnstile, so it is blocked behind the same browser run still pending on TASK-019.

**Copy that changed meaning, not just wording:** the panel's "Por enviar" tab, the pending-orders banner and the stat tile now say *preparar* instead of *enviar* — with pickup orders in the queue, "esperando envío" was counting orders nobody would ever ship. The `tabShipped` key became `tabInProgress` (shipped + ready).

The panel does **not** promise the buyer gets notified when an order is ready, because today nothing sends that email — that is TASK-017. The copy says the buyer will see it in Mis compras, which is what actually happens.
<!-- SECTION:NOTES:END -->
