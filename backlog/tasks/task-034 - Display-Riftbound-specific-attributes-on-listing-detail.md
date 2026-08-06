---
id: TASK-034
title: Display Riftbound-specific attributes on listing detail
status: In Progress
assignee:
  - Claude
created_date: '2026-08-06 02:20'
updated_date: '2026-08-06 03:22'
labels:
  - 'epic:riftbound'
  - web
  - api
milestone: m-3
dependencies:
  - TASK-029
  - TASK-031
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Storage decision

**One additive nullable TEXT column `inventory.card_attributes` holding a small per-game JSON blob**, written only for games that have extra attributes.

Alternatives rejected:
- *Columns per game* (`domains`, `energy`, `might`, `power`, …) — exactly the "sprawling nullable mega-table" `.claude/agents/d1-schema-guardian.md:85-89` warns against, and every future TCG would widen the table further.
- *A 1:1 child table* — a join on every catalog render for what is display-only snapshot data that is written once and never queried by these fields.

The JSON blob fits the schema's existing rule ("JSON reserved for small config blobs, never lists of entities" — `packages/db/src/schema.ts:190-192`; `sellers.favorite_games` is the precedent). It is a pure `ALTER TABLE ADD COLUMN`, so no D1 rebuild, and dropping the feature means ignoring the column.

Nothing filters or sorts on these fields; if that ever changes, promote the specific field to a real column then.

## Steps

1. **`packages/shared/src/index.ts`** — `RiftboundAttributes { tcg: 'riftbound'; type; supertype; domains[]; energy; might; power }` and `CardGameAttributes` (a union discriminated by `tcg`, one variant today). `CardSnapshot.gameAttributes: CardGameAttributes | null`.
2. **`packages/db/src/schema.ts`** + migration — nullable `card_attributes` TEXT. No index: never queried by it.
3. **`apps/api/src/lib/riftcodex.ts`** — `normalizeCard` fills `gameAttributes` from `classification` (type, supertype, domain[]) and `attributes` (energy, might, power). `apps/api/src/lib/scryfall.ts` returns `null`.
4. **`apps/api/src/lib/inventory.ts`** — persist `JSON.stringify(card.gameAttributes)` (or null) on insert; `rowToInventoryItem` parses defensively (malformed or unknown-shape JSON → `null`, never a thrown render).
5. **`apps/web/src/components/detail/`** — a pure `gameAttributeRows(item, labels)` helper (testable without a React harness, since the repo has no component test setup) returning the extra rows; `CardDetailView` appends them to its attribute table and shows domains as chips. Absent attributes render nothing.
6. **i18n** — labels for type, domains, energy, might, power in `es`/`en`.
7. **Tests** — `gameAttributeRows` with full attributes, partial/null attributes, and no attributes at all; riftcodex normalization asserts the new field; inventory round-trip (persist → parse, plus malformed JSON).
8. **Validate** — `pnpm --filter @thepubmarket/api test`, typecheck, lint, migration generate + apply local, live smoke publishing a Riftbound single and reading it back from `GET /catalog/:id`.

## Note
Existing Riftbound rows (none in production yet) keep `card_attributes` NULL and simply render without the extra rows — no backfill needed.
<!-- SECTION:PLAN:END -->
