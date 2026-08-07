---
id: TASK-048
title: >-
  Filter symbol asset pipeline + GameWordmark components (mana SVGs, Riftbound
  runes, custom wordmarks)
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-07 00:00'
labels:
  - 'epic:catalog-visual-refactor'
  - web
milestone: m-3
dependencies: []
references:
  - scripts/import-riftbound.mjs
  - apps/web/src/lib/catalog/display.ts
  - 'https://api.scryfall.com/symbology'
  - 'https://static.dotgg.gg/riftbound/'
priority: high
type: feature
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of epic:catalog-visual-refactor (premium per-TCG catalog filters). The web app ships zero binary assets today (`apps/web/public/` does not exist) and the filter UI has no game iconography.

Outcome: all per-value filter symbols self-hosted as committed static assets, plus a custom SVG wordmark component per game so the filter sidebar can show real game identity without using registered logos (IP decision confirmed with the owner: official symbols, custom wordmarks).

Scope:
- `scripts/fetch-filter-symbols.mjs` (pattern: `scripts/import-riftbound.mjs` — User-Agent, ~150ms throttle, idempotent skip-existing, `--force` flag) downloading into `apps/web/public/symbols/` (committed to git; OpenNext serves `public/` as static assets — no R2, no runtime third-party CDN dependency):
  - `mtg/{W,U,B,R,G,C}.svg` from Scryfall symbology (`GET https://api.scryfall.com/symbology`, use `svg_uri`; verified live: `https://svgs.scryfall.io/card-symbols/{code}.svg`)
  - `riftbound/domain/{body,calm,chaos,colorless,fury,mind,order}.svg` from `https://static.dotgg.gg/riftbound/text/rb_rune_{domain}.svg` (colorless → `rb_rune_rainbow.svg`; if that mapping fails, fall back to `static.dotgg.gg/riftbound/colors/colorless.webp`)
  - `riftbound/rarity/{common,uncommon,rare,epic}.svg` from `static.dotgg.gg/riftbound/rarity/` (`showcase.svg` is a verified 404 — warn and continue, never crash)
- `apps/web/src/components/catalog/GameWordmark.tsx`, props `{ tcg, active? }`: angular Rajdhani-style letterforms on a `clip-btn` plate + geometric emblem. MTG = arc of 5 color pips; Riftbound = rhombus rune cluster (`clip-rhombus`); other 4 TCGs = `TCG_META.short` monogram in a rhombus. Active: `--game-accent` border + glow at ~26% + faint scanline texture; inactive: `border-line-soft` + `text-muted`. No cn/clsx (repo convention: template literals). Script header documents sourcing rationale (dotgg mirror, WotC Fan Content Policy).

Subagent: nextjs-frontend. No dependencies — runs parallel with the shared-types/API task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 node scripts/fetch-filter-symbols.mjs is idempotent (second run is a no-op) and exits non-zero on any hard failure other than the known-missing showcase rarity icon
- [ ] #2 All listed SVGs exist under apps/web/public/symbols/ and are served at /symbols/... in local dev
- [ ] #3 GameWordmark renders all 6 TCGs: distinct emblems for mtg and riftbound, monogram fallback for the other 4; no official logo artwork is used anywhere
- [ ] #4 pnpm typecheck, pnpm build, and biome are green
<!-- AC:END -->
