---
id: TASK-034
title: Display Riftbound-specific attributes on listing detail
status: To Do
assignee: []
created_date: '2026-08-06 02:20'
labels:
  - 'epic:riftbound'
  - web
  - api
milestone: m-3
dependencies: []
references:
  - apps/web/src/components/detail/CardDetailView.tsx
  - packages/db/src/schema.ts
  - .claude/agents/d1-schema-guardian.md
documentation:
  - 'https://riftcodex.com/docs/'
priority: low
type: enhancement
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The listing detail view (apps/web/src/components/detail/CardDetailView.tsx, attribute table at 58-66) renders only generic fields: set, collector number, language, finish, rarity, game, artist. Riftbound cards carry game-specific data buyers care about — domains (e.g. Fury, Order), card type/supertype (Unit, Spell, Gear, Champion), and energy/might/power costs — available from RiftCodex at catalog-resolution time but not persisted in the listing snapshot today. Showing them requires a deliberate storage decision for game-specific attributes; schema guidance says to split shared card attributes from game-specific ones and avoid a sprawling nullable mega-table (.claude/agents/d1-schema-guardian.md:85-89), and D1 cannot rebuild tables, so the choice must be additive and reversible. The storage approach is decided during execution of this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Riftbound listing detail shows domain(s), card type, and energy/might/power when present on the card
- [ ] #2 Detail views for MTG and other games are unaffected
- [ ] #3 The chosen storage approach is documented and additive (no D1 table rebuild)
- [ ] #4 Tests cover rendering with and without game-specific attributes
<!-- AC:END -->
