---
id: TASK-061.03
title: CP-first shipping address form at checkout with corpus-driven autofill
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-08 01:25'
updated_date: '2026-08-08 02:10'
labels:
  - 'epic:sepomex-address'
milestone: m-2
dependencies:
  - TASK-061.02
references:
  - apps/web/src/components/checkout/DeliveryStep.tsx
  - apps/web/messages/es.json
  - apps/web/messages/en.json
parent_task_id: TASK-061
priority: high
type: feature
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Frontend layer of the epic, and the part the buyer actually feels.

Today the shipping form in `apps/web/src/components/checkout/DeliveryStep.tsx` is seven free-text inputs; the buyer types estado, ciudad and colonia by hand and nothing catches a mismatch. Rework it so the postal code leads: the buyer enters 5 digits, the form asks the lookup API from TASK-061.02, and estado / municipio / ciudad arrive filled while colonia turns into a pick-list of the settlements that actually belong to that CP. What stays typed is what only the buyer knows — street and number, interior, references, recipient and phone.

The corpus guides, it never traps. Three cases must all end in a completed order:
- CP found, colonia in the list: buyer picks it and moves on.
- CP found, colonia missing from the list (new development, renamed): buyer types their own colonia without fighting the UI.
- CP not in the corpus at all: the form degrades to today's all-free-text behaviour with a plain explanation, not a blocking error.

Autofilled fields stay editable — the corpus is authoritative about what exists, not about what the courier will accept.

This is checkout, the highest-stakes screen in the product, and CLAUDE.md sets the bar: first-class visual quality, deliberate micro-interactions and transitions that respect `prefers-reduced-motion`, nothing that reads as a generic form. Build with the `frontend-design` skill and audit with `web-design-guidelines` before closing. Both locales (es default, en) need copy in `apps/web/messages`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Entering a valid 5-digit CP fills estado, municipio and ciudad and populates the colonia selector from the lookup API, with no further typing needed for those fields
- [ ] #2 Autofilled estado / municipio / ciudad remain editable by the buyer and their edits survive submission
- [ ] #3 When the colonia is not in the returned list, the buyer can enter a free-text colonia and complete the order
- [ ] #4 An unlisted CP shows a clear, non-blocking explanation and lets the buyer fill every field manually, exactly as today
- [ ] #5 The lookup shows a visible loading state, handles API failure and offline by falling back to manual entry instead of blocking checkout, and does not fire a request on every keystroke
- [ ] #6 Changing the CP after autofill re-runs the lookup and clears a colonia that no longer belongs to the new CP, instead of silently keeping a stale one
- [ ] #7 Keyboard-only and screen-reader users can complete the whole address: correct labels, autocomplete attributes, error messages tied to their inputs, and announcement when fields are autofilled
- [ ] #8 All transitions and micro-interactions respect prefers-reduced-motion
- [ ] #9 Copy exists in both es and en message files, with no hardcoded strings in the component
- [ ] #10 The final UI is audited against web-design-guidelines and typecheck and lint pass clean
<!-- AC:END -->
