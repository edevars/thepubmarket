---
id: TASK-061.05
title: >-
  Normalize store addresses against the corpus so pickup matching stops
  depending on how a city was typed
status: To Do
assignee: []
created_date: '2026-08-08 01:27'
labels:
  - 'epic:sepomex-address'
milestone: m-2
dependencies:
  - TASK-061.01
references:
  - apps/api/src/lib/delivery.ts
  - apps/api/src/lib/sellers.ts
  - packages/db/src/schema.ts
parent_task_id: TASK-061
priority: low
type: enhancement
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The other half of the address problem, and a bug already documented in the code.

`sellers.city` and `sellers.neighborhood` are free text typed by whoever onboarded the store. Pickup at an allied store is offered only when the store is in the same city as the selling store, and that comparison runs through `normalizeCity()` in `apps/api/src/lib/delivery.ts`, which strips accents and case and stops there. Its own comment states the consequence: "CDMX" and "Ciudad de Mexico" are the same place and it does not know that, so a legitimate pickup point silently disappears from checkout — and the stated fix is to normalize the seller records, which is what this task does now that the corpus exists.

Give stores a postal code and derive their estado, municipio and ciudad from the corpus, the same way buyer addresses get resolved in TASK-061.04. Once stores carry a canonical municipio, same-city matching compares corpus keys instead of guessing at strings, and the accent-stripping heuristic stops being load-bearing.

The existing stores are few and known, so backfilling them is a one-off with human review, not a migration heuristic that has to be right for a million rows. Do not silently rewrite a store's address if the corpus disagrees — surface it and let a person decide.

Depends on the corpus being loaded (TASK-061.01). Sequence it after the buyer-facing work: this fixes a smaller, rarer failure than a mistyped delivery address.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Stores carry a postal code and corpus-derived estado, municipio and ciudad, added by an additive Drizzle migration
- [ ] #2 The admin or seller flow that sets a store's address resolves these fields from the corpus by CP, and a store whose CP is not in the corpus can still be saved with manually entered values
- [ ] #3 Same-city pickup matching uses the canonical corpus values rather than string comparison of free text, and a store recorded as 'CDMX' matches one recorded as 'Ciudad de Mexico'
- [ ] #4 Existing stores are backfilled, with any address the corpus contradicts reported for human review instead of being overwritten automatically
- [ ] #5 Stores with no postal code and no corpus match keep working: pickup matching falls back to the current behaviour rather than dropping them from checkout
- [ ] #6 Tests cover CDMX/Ciudad de Mexico equivalence, two stores in different municipios of the same metro area, and a store with no corpus match
- [ ] #7 Public seller profile and pickup point rendering still show the same human-readable address to buyers
<!-- AC:END -->
