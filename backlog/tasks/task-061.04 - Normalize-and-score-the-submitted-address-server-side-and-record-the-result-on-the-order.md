---
id: TASK-061.04
title: >-
  Normalize and score the submitted address server-side, and record the result
  on the order
status: To Do
assignee: []
created_date: '2026-08-08 01:26'
labels:
  - 'epic:sepomex-address'
milestone: m-2
dependencies:
  - TASK-061.01
references:
  - apps/api/src/lib/delivery.ts
  - apps/api/src/lib/orders.ts
  - apps/api/src/routes/checkout.ts
  - packages/db/src/schema.ts
parent_task_id: TASK-061
priority: medium
type: feature
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Server side of the epic. The autofill in TASK-061.03 helps honest buyers, but the checkout API takes whatever JSON it is handed: a client can post "CP 06700, Monterrey, Yucatan" today and the order is created exactly like that (`apps/api/src/lib/delivery.ts` validates presence and a 5-digit shape, nothing else). The address that gets frozen on the order is the one the courier reads, so it is worth checking on the server.

What this task does at checkout, before the order is created: match the submitted address against the corpus by CP, replace estado / municipio / ciudad with the corpus's canonical spelling when they clearly refer to the same place (accent- and case-insensitive comparison), match the colonia against the settlements of that CP, and record the outcome on the order — which fields matched, which were corrected, and whether the address matched the corpus at all.

Explicitly not a gate. Per the epic's product decision and the reasoning already written into `delivery.ts`, a strict check rejects real deliverable addresses: colonias newer than the catalogue, rural routes, buyers who write the neighbouring municipio because that is where their post actually arrives. So a mismatch never blocks payment; it is recorded and surfaced to whoever prepares the shipment. The one thing worth reconsidering is a CP whose estado is flatly different from the one submitted, since that is almost always a typo — but even there the buyer gets a chance to confirm rather than a refusal.

Recording is pointless if nobody sees it: the seller panel order detail must show when an address did not match cleanly, so the store can call the buyer before printing a label.

Regulatory: no money-flow change. Shipping fee, application fee and the direct charge stay exactly as they are.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The checkout API matches the submitted address against the corpus by CP and stores canonical estado, municipio and ciudad on the order when the submitted values refer to the same place, ignoring accents and case
- [ ] #2 The submitted colonia is matched against the settlements of that CP, and the match outcome (exact, corrected, or not found) is persisted on the order via an additive Drizzle migration
- [ ] #3 An address that does not match the corpus — unknown CP, unlisted colonia, or a municipio the corpus does not have — still completes checkout and creates a paid order
- [ ] #4 The buyer-facing address stored on the order never loses information the buyer typed: corrections are recorded alongside the original, not on top of it
- [ ] #5 A CP whose estado contradicts the submitted estado is flagged distinctly from an ordinary mismatch, and the behaviour chosen for that case is documented in the task notes
- [ ] #6 The seller panel order detail shows when a shipping address did not match the corpus cleanly, so the store can verify before shipping
- [ ] #7 Orders created before this change keep rendering correctly in buyer and seller views, with no match data
- [ ] #8 Tests cover: exact match, accent- and case-only differences, unlisted colonia, unknown CP, estado contradiction, and an address posted directly to the API bypassing the form
- [ ] #9 Existing checkout, delivery and post-payment tests still pass and no change is made to how shipping or application fees are computed
<!-- AC:END -->
