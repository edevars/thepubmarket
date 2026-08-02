---
id: TASK-020
title: >-
  Fulfilment by delivery method: carrier on shipment, ready-for-pickup state,
  address and store in panel
status: Done
assignee:
  - '@claude'
created_date: '2026-07-31 00:56'
updated_date: '2026-08-02 22:22'
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
- [x] #5 The seller panel shows the full delivery address for shipping orders and the destination store for pickup orders
- [x] #6 /compras shows the buyer the delivery method, the tracking number with carrier once shipped, and the pickup store with its address once ready
- [x] #7 Orders created before delivery methods existed still render and can still be marked shipped and delivered
- [x] #8 Verified against the deployed API in Stripe test mode for both a shipping order and a pickup order, walking each through its full state sequence
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

## Adjustment during implementation

The `/ready` conflict code shipped as `not_pickup_ready`, not `not_ready_markable` as written above — the latter is not English anyone would write twice.
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

## Branch review + browser verification (2555ecd)

Reviewed the full diff and then drove both views in Chrome against a local Worker and `next dev`, with four seeded orders: shipping, pickup at an allied store, pickup at the selling store, and a legacy one with `delivery_method IS NULL`. Authenticated by injecting the session token I had already minted through the API rather than typing credentials into the login form.

**Two defects the browser run caught, both now fixed:**

1. **A collected order was labelled "Entregada"** — right next to the chip "Recoger en tienda". Nobody delivered it; the buyer walked into the store. `delivered` is still one derived state for both methods (that is the design), but the label now follows the method, which is what the schema comment and `entrega.md` already claimed. Fixed in both views and both locales, plus a new `stCollected` key.
2. **Month sales excluded ready-for-pickup orders.** `ResumenView` summed `shipped || delivered`, so a pickup order sitting at the destination store — sold, paid, out of the seller's hands — did not count. Caught because I had just changed that tile's caption to "Órdenes en curso + completadas", which made the omission a lie.

**AC #5 (panel) verified rendered:** shipping order shows `ENTREGA · ENVÍO A DOMICILIO` with recipient, both address lines, neighbourhood, `06700 · Ciudad de México, CDMX` and phone. Pickup shows `RECOLECCIÓN EN TIENDA`, the destination store with its address, and *"Hay que trasladarla a esa tienda antes de marcarla lista"* — which flips to *"Se recoge en tu propia tienda: no hay traslado"* when the pickup point is the selling store. The legacy order shows *"Orden anterior a la elección de entrega. Se cumple como envío"* and still offers the shipping form.

**AC #6 (/compras) verified rendered:** method chip on every card; `GUÍA DE RASTREO EST-9988776655 · Paquetería: Estafeta` once shipped; the amber *"Ya puedes recogerla"* strip with store, address and folio once ready; `SE RECOGE EN … Puede tardar hasta 7 días en llegar a la tienda. Aquí verás cuándo esté lista.` while still being prepared — no promise of a notification that does not exist yet. Timelines read Pagada → Enviada → Entregada or Pagada → Lista → Recogida by method.

Both sequences were driven end to end **through the UI**, not curl: the shipping order to entregada, the pickup order to recogida. Tab counts moved correctly at every step (`Por preparar` 7→6→5, `En curso` 1→2→3, `Completadas` 1→3). English locale spot-checked: `COLLECTED` / `DELIVERED`, `STORE PICKUP` / `SHIP TO ADDRESS`.

Cleanup: seeded orders, order lines and the seller↔user link removed from local D1; session token cleared from the browser.

**Correction to the note above:** the API suite is **68 tests across 6 files**, 59 of them pre-existing plus the 9 new ones — not "68 → 77".

## Deployed to production

Migration `0008` applied to remote D1 **before** the API deploy, so the columns existed before any code read them. The five pre-existing production orders came through with `carrier` and `ready_at` NULL and nothing else touched.

- API `thepubmarket-api` version `19e9b84e-c6d3-45ca-ac0f-39216f0a8856`
- Web `thepubmarket-web` version `e7ad06c0-8748-417b-9d7a-454b5fc882cc`
- `main` at `d4c0131`

The new buyer copy is live on thepubmarket.com. The panel could not be checked over HTTP — `/panel` sits behind Cloudflare Access and returns its sign-in page, which is Access working as designed.

**Unrelated bug found and fixed while verifying (`d4c0131`):** the pickup option at checkout promised *"te avisamos por correo cuando esté listo"*. Nothing sends that email — order lifecycle mail is TASK-017, still To Do. It shipped with TASK-019 and had been in front of real buyers since. Now says the order shows up as ready in Mis compras, matching the TASK-020 copy.

**Still open, flagged not fixed:** `panel.gateSignedOutBody` and `purchases.gateBody` describe a magic-link sign-in (*"Te enviamos un enlace de acceso por correo"*, *"We'll email you a magic link — no passwords"*) but auth is email + password. Same class of stale promise, different feature area — left alone rather than silently rewritten.

AC #8 remains the only unchecked criterion: it needs a paid pickup order in production, which needs a card entered at Stripe Checkout.

## AC #8 — verified in production, Stripe test mode

The two real purchases were walked through their full sequences from the panel. Final rows in remote D1:

| order | method | tracking | carrier | shipped_at | ready_at | delivered_at |
|---|---|---|---|---|---|---|
| `80bcdf12` | shipping | `iasldjalsjd` | Estafeta | set | **null** | set |
| `8f60e606` | pickup | null | null | **null** | set | set |

The columns stayed in their own lanes under real traffic: the pickup order never got a `shipped_at`, the shipping order never got a `ready_at`, and both closed on `delivered_at` + `status='fulfilled'`. That is the whole design holding up end to end.

Amounts: shipping order `subtotal 9000 + shipping 20000 = total 29000`, fee `900`. Pickup order `subtotal 320000 + shipping 0 = 320000`, fee `32000`.

**Non-custody, confirmed against Stripe rather than inferred:** retrieving both sessions on the connected account (`acct_1TwA3pKpkJIW4eIn`, so these are direct charges — the money never touches a platform account) gives

```
pi_3U07cvKpkJIW4eIn10fcpOz9  amount=29000  application_fee_amount=900
   Path to Exile        9000
   Envío a domicilio   20000
```

**900 is 10% of the 9000 product subtotal, not of the 29000 charged.** 10% of the total would have been 2900. The platform earns nothing on freight, and the shipping fee settles to the seller inside the same direct charge. This was the one claim TASK-019 could not verify — `application_fee_amount` lives on the PaymentIntent, which does not exist until a session completes.

## Bug found while verifying, NOT part of this task

`orders.stripe_payment_intent_id` is **NULL on every order in production**, including these two whose PaymentIntents clearly exist. `checkout.ts:219` reads `session.payment_intent` at session-creation time, but a Checkout Session in `mode: payment` has no PaymentIntent until the buyer starts paying — so it is always null there, and nothing backfills it. The webhook only starts the workflow; the workflow only sets `paid`.

Consequences: an order cannot be joined to its payment for a refund or dispute without going through the stored checkout session first (recoverable, so degraded rather than fatal), and `idx_orders_stripe_payment_intent_id` is inert since SQLite permits unlimited NULLs in a unique index — so it is not providing the idempotency guard its name implies.

Not filed as a task — flagging for a decision.
<!-- SECTION:NOTES:END -->
