---
id: TASK-061
title: 'SEPOMEX address corpus: guided, error-proof shipping address capture'
status: To Do
assignee: []
created_date: '2026-08-08 01:24'
labels:
  - 'epic:sepomex-address'
milestone: m-2
dependencies: []
references:
  - >-
    https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx
  - apps/api/src/lib/delivery.ts
  - apps/web/src/components/checkout/DeliveryStep.tsx
  - packages/db/src/schema.ts
priority: high
type: feature
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Epic. Shipping addresses at checkout are free text today: the buyer types recipient, phone, line1/line2, colonia, city, state and a 5-digit CP, and the server only checks that the fields are present and that the CP has 5 digits (`apps/api/src/lib/delivery.ts`). Nothing verifies that the CP actually belongs to the city and state written next to it, and nothing helps the buyer spell the colonia the way the courier expects.

A wrong address becomes a failed delivery, and in this marketplace the seller pays the courier (the shipping fee settles inside the seller's direct charge), so every bad address costs a seller money and costs us trust. Cheapest fix available: anchor the address on the CP using the SEPOMEX national postal-code catalogue (Correos de Mexico) — the buyer types 5 digits, and estado / municipio / ciudad get filled and the colonias of that CP get offered, leaving only street, number and references as free text.

Layers touched: D1 (corpus tables + new order columns), API (public CP lookup + server-side normalization at checkout), web (checkout address form).

Product decisions, fixed for this epic:
- The corpus **guides and normalizes; it never gates.** Mexican addresses are legitimately messy (no house number, informal references, rural routes, colonias newer than the catalogue). The form always keeps a free-text escape hatch, and checkout must never reject an address just because it does not match the corpus. Mismatches are recorded on the order for ops, not thrown at the buyer.
- Mexico only. `country` is already pinned to `MX`; widening it is a separate product decision.
- Corpus refresh is a manual, documented operation. The catalogue moves slowly and a cron job is not worth the maintenance cost for a single operator.

Non-goals: buyer address book / saved addresses, street-level or geocoded validation, carrier rate quoting by zone, international addresses.

Regulatory: none. Nothing here touches the money flow; the shipping fee keeps riding inside the seller's direct charge and the platform still never holds funds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All subtasks of this epic are Done
- [ ] #2 At checkout, typing a valid 5-digit CP fills estado, municipio and ciudad and offers the colonias belonging to that CP, without the buyer typing them
- [ ] #3 An address whose colonia is not in the corpus can still be completed, submitted and paid — no dead end
- [ ] #4 Orders record which parts of the submitted address matched the corpus, so ops can spot suspect addresses without blocking buyers
- [ ] #5 docs/ingenieria/ documents the corpus source, its version/date and the refresh procedure
<!-- AC:END -->
