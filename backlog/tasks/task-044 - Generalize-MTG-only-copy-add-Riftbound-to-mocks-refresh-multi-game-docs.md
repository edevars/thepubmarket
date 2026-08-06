---
id: TASK-044
title: 'Generalize MTG-only copy, add Riftbound to mocks, refresh multi-game docs'
status: To Do
assignee: []
created_date: '2026-08-06 05:45'
labels:
  - 'epic:riftbound-ux'
  - web
  - docs
milestone: m-3
dependencies: []
references:
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - apps/web/src/lib/catalog/display.ts
  - apps/web/src/lib/catalog/mock-data.ts
  - docs/ingenieria/catalogo-multijuego.md
  - scripts/import-riftbound.mjs
priority: medium
type: chore
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Several user-facing surfaces still assume MTG is the only game: the catalog subtitle is hardcoded "Singles de Magic: The Gathering", the home hero copy ends with "Arrancamos con Magic: The Gathering.", and game display names live untranslated in TCG_META. The frontend mock dataset has zero Riftbound entries, so mock mode (NEXT_PUBLIC_USE_MOCKS=true) shows no Riftbound at all. docs/ingenieria/catalogo-multijuego.md is stale — it still documents RiftCodex as the Riftbound provider, replaced by the local D1 provider in TASK-037.

Outcome: copy, mocks, and docs reflect a multi-game marketplace where Riftbound is a first-class TCG. Part of `epic:riftbound-ux`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Catalog subtitle and home hero copy no longer hardcode MTG as the only game; multi-game copy reads naturally in es and en
- [ ] #2 No remaining user-facing copy implies MTG is the only supported game (audit of messages es.json/en.json and hardcoded strings)
- [ ] #3 Frontend mock data includes Riftbound entries so mock mode displays Riftbound listings
- [ ] #4 docs/ingenieria/catalogo-multijuego.md updated: RiftCodex references replaced with the local D1 catalog provider and current import flow
- [ ] #5 Typecheck, biome, and web tests green
<!-- AC:END -->
