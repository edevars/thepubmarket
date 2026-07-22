---
id: TASK-006
title: Expose seller identity on InventoryItem and render the 'Vendido por' cart row
status: To Do
assignee: []
created_date: '2026-07-22 22:31'
labels:
  - 'epic:data-gaps'
  - feature
milestone: m-0
dependencies: []
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The cart UI is designed to show a 'Vendido por' (Sold by) row per line item but currently omits it because InventoryItem (packages/shared/src/index.ts) doesn't expose seller name or verified status. GET /sellers and the Seller contract already exist (apps/api/src/routes/sellers.ts, packages/shared). This task closes that data gap — independent of the Stripe wiring work, can be done in parallel. Note: the rendered UI copy ('Vendido por') stays in Spanish; only this task's own title/description/AC are in English.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision made and implemented: either catalog API joins sellerName/verified into InventoryItem, or the frontend does a lookup against GET /sellers — documented reasoning for the choice
- [ ] #2 InventoryItem in packages/shared/src/index.ts exposes seller name and verified fields
- [ ] #3 Cart line component renders the 'Vendido por' row (currently omitted) using this data
- [ ] #4 CartItem optional display fields (already scaffolded in lib/cart.tsx) populated correctly
- [ ] #5 No regression to existing cart states (empty/loading/no-session) — verified via build/typecheck
<!-- AC:END -->
