---
id: TASK-030
title: RiftCodex catalog client for Riftbound card data
status: To Do
assignee: []
created_date: '2026-08-06 02:19'
updated_date: '2026-08-06 02:20'
labels:
  - 'epic:riftbound'
  - api
milestone: m-3
dependencies:
  - TASK-029
references:
  - apps/api/src/lib/scryfall.ts
  - apps/api/src/lib/inventory.ts
documentation:
  - 'https://riftcodex.com/docs/'
priority: high
type: feature
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Riftbound card data will come from the RiftCodex API (base https://api.riftcodex.com — unofficial fan project, no auth for reads, JSON, marked work-in-progress). Build a server-side client in the API Worker mirroring the existing Scryfall client (apps/api/src/lib/scryfall.ts: normalizeCard 62-80, getCardById 86-102 KV-cached 30 days, searchCards 109-138 KV-cached 10 min, base URL + User-Agent 15-21).

Relevant endpoints: GET /cards/search?query= (full-text, relevance-ranked), GET /cards/name?exact=|fuzzy=, GET /cards/{id}, GET /sets, GET /sets/{id}; all list endpoints paginate with page/size (max 100) and envelope {items,total,page,size,pages}.

CardResponse fields: id, name, riftbound_id, tcgplayer_id, public_code, collector_number, attributes{energy,might,power — nullable}, classification{type,supertype,rarity,domain[]}, text{rich,plain,flavour}, set{set_id,label}, media{image_url,artist,accessibility_text}, metadata{clean_name,alternate_art,overnumbered,signature}, orientation, tags.

Results must normalize into the shared game-agnostic card snapshot (from the task "Make listing contracts and write path game-agnostic"). The API being third-party and WIP means failures must be handled gracefully with a proper User-Agent set.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Searching by card name returns normalized snapshots with name, set code/name, collector number, rarity, artist, and image URL
- [ ] #2 Fetching a card by its RiftCodex id returns the same normalized shape used at listing-create time
- [ ] #3 Responses are KV-cached with TTLs consistent with the Scryfall client (long for cards, short for searches)
- [ ] #4 API errors and timeouts surface as controlled errors, not unhandled exceptions
- [ ] #5 Tests cover normalization (including null attributes and alternate-art/signature variants) and cache behavior
<!-- AC:END -->
