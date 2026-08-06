---
id: TASK-034
title: Display Riftbound-specific attributes on listing detail
status: Done
assignee:
  - Claude
created_date: '2026-08-06 02:20'
updated_date: '2026-08-06 03:28'
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
- [x] #1 Riftbound listing detail shows domain(s), card type, and energy/might/power when present on the card
- [x] #2 Detail views for MTG and other games are unaffected
- [x] #3 The chosen storage approach is documented and additive (no D1 table rebuild)
- [x] #4 Tests cover rendering with and without game-specific attributes
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Storage decision (AC #3): one additive nullable TEXT column `inventory.card_attributes` holding a small per-game JSON blob, migration 0012_perfect_gamma_corps.sql — a pure ALTER TABLE ADD COLUMN, no index, no D1 rebuild, and no backfill (rows without it simply render the old table). Rejected: a column per game attribute, which is exactly the sprawling nullable mega-table .claude/agents/d1-schema-guardian.md:85-89 warns against and would widen further with every TCG; and a 1:1 child table, which would add a join to every render for data that is written once and never queried. The blob fits the schema's existing rule that JSON is for small config blobs, not lists of entities (sellers.favorite_games is the precedent). If a field ever needs filtering or sorting, promote that one field to a real column then.

Contract shape: `CardGameAttributes` is a union discriminated by `tcg` with one variant today (`RiftboundAttributes`), so the next game adds a variant instead of widening CardSnapshot with every game's nullable fields. Scryfall returns null (MTG mana/colors are not displayed today and are not stored). `rowToInventoryItem` parses the blob defensively — malformed JSON, `null`, a bare string, or an object missing the `tcg` discriminant all degrade to null rather than throwing, so a corrupt blob can never take down the render of an otherwise valid listing.

The row-building logic lives in a pure helper (`apps/web/src/components/detail/game-attributes.ts`) rather than inline in the component, because apps/web has no React component test harness — only pure modules under src/**/*.test.ts. That keeps the interesting rule testable: WHICH rows appear. Absent attributes are omitted entirely rather than rendered as empty rows or dashes, and a zero cost is kept because 0 is a real value, not 'missing'. Supertype and type render as one row ('Champion · Unit').

Verification: 115 API tests + 28 web tests (5 new for gameAttributeRows), typecheck + biome clean, migration applied locally. Live end-to-end smoke: published a Riftbound Unit, confirmed the JSON blob in the D1 column and in GET /catalog/:id, then rendered both detail pages through the actual Next.js SSR and parsed the attribute-table markup — Riftbound showed 11 rows (Tipo Unit, Dominios Chaos, Energía 3, Poderío 2; Poder correctly absent since it is null on that card) and MTG showed exactly its original 7. Worth noting for future checks: a plain grep for the label strings in the HTML gives a FALSE POSITIVE on the MTG page, because next-intl inlines the whole message namespace into the flight data — the labels must be matched against the rendered row markup, not the raw document. Test row deleted by exact id; local D1 verified back at 20 rows, zero non-MTG, zero rows with attributes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Riftbound listings now show the game data buyers actually use to recognise a card, without turning the inventory table into a per-game field dump.

- **packages/db/src/schema.ts** + **migration 0012** — nullable `inventory.card_attributes` TEXT holding a small per-game JSON blob. Additive, no index, no rebuild, no backfill.
- **packages/shared/src/index.ts** — `RiftboundAttributes` (type, supertype, domains, energy, might, power) and `CardGameAttributes`, a union discriminated by `tcg`; `CardSnapshot.gameAttributes` carries it.
- **apps/api/src/lib/riftcodex.ts** — fills the attributes from RiftCodex `classification` + `attributes`; **scryfall.ts** returns null.
- **apps/api/src/lib/inventory.ts** — serialises on insert and parses defensively on read: a corrupt or unknown-shape blob degrades to no attributes instead of breaking the listing.
- **apps/web/src/components/detail/game-attributes.ts** (new) + **CardDetailView.tsx** — a pure, testable helper builds the extra rows, appended to the existing attribute table. Absent attributes produce no row; a zero cost is kept.
- **apps/web/messages/{es,en}.json** — labels for type, domains, energy, might, power.

## Tests / verification

5 new web tests for `gameAttributeRows` (full attributes, none at all, sparse, zero costs, untyped) plus API coverage for normalization and the persist→parse round-trip including corrupt blobs; 115 API + 28 web tests green, typecheck + biome clean. End-to-end smoke rendered both detail pages through real SSR and parsed the attribute-table markup: Riftbound showed 11 rows with the four applicable game attributes, MTG showed exactly its original 7.

## Risks / follow-ups

- These fields are display-only; nothing filters or sorts on them. Promoting one to a real column is the migration path if that changes.
- Only the seed script remains (TASK-035): still MTG-only and still posting the legacy `scryfallId`.
<!-- SECTION:FINAL_SUMMARY:END -->
