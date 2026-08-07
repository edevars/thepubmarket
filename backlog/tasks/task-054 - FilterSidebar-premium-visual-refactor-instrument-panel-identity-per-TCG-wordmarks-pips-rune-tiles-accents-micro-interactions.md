---
id: TASK-054
title: >-
  FilterSidebar premium visual refactor: instrument-panel identity per TCG
  (wordmarks, pips, rune tiles, accents, micro-interactions)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-07 00:03'
updated_date: '2026-08-07 01:29'
labels:
  - 'epic:catalog-visual-refactor'
  - web
milestone: m-3
dependencies:
  - TASK-048
  - TASK-051
  - TASK-052
  - TASK-053
references:
  - apps/web/src/components/catalog/FilterSidebar.tsx
  - apps/web/src/app/globals.css
  - .claude/skills/frontend-design/SKILL.md
  - >-
    backlog/tasks/task-045 -
    Motion-and-interaction-foundation-transition-tokens-micro-interactions-reduced-motion-support.md
priority: high
type: feature
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of epic:catalog-visual-refactor — the flagship visual task. The sidebar today is generic text tiles. It becomes an "instrument panel": the site is a dark technical blueprint (angular clip-path, Rajdhani display + mono metadata, blue/cyan) — filters should read like a targeting console, not a form. Build with the `frontend-design` skill loaded; CSS-only motion on the existing tokens (TASK-045 contract — no animation libraries, no cn/clsx).

Binding visual spec:
- Game section: replace fake-checkbox rows with `GameWordmark` plates (TASK-048).
- Generic facet renderer consults the presentation registry (TASK-052): `layout:'pips'` → row of ~34px circular pip buttons (MTG colors; Scryfall SVGs are circular coins): unselected `filter: grayscale(.65) opacity(.7)`; selected full color + 2px ring in the value's identity hex + soft glow + press pop; count as 9px mono digit under each pip. Tiles with `icon` get an 18px img + name + count; selected tile state uses the value hex — solid border, bg at ~14% alpha, tinted label (inline style, same pattern as CONDITION_HEX). MTG rarity tiles: 8px rhombus dot in the rarity hex. Riftbound rarity tiles: dotgg SVGs, showcase = text-only.
- Counts + disabled states everywhere (engine from TASK-053): zero-count values at opacity-40, no hover lift, `aria-disabled`, unclickable — but an already-SELECTED value must never become unremovable. multiInt tiles disabled at zero count. freeText <select> options show counts ("Set name (OGN) · 12").
- Per-game accent: `--game-accent` set inline on the sidebar wrapper (and catalog header eyebrow) from `accentFor(activeGame)`; active-game plate, active-count badge, foil switch, and selected generic tiles consume `var(--game-accent, var(--color-primary))`.
- Collapsible sections: header button with `aria-expanded` + chevron rotate at duration-fast; CSS-only height animation via `grid-template-rows: 0fr→1fr` transition at --duration-base/--ease-emphasized — add a `.tpm-collapse` pattern to globals.css beside the other .tpm-* classes (auto-covered by the global reduced-motion block). All sections open by default.
- Micro-interactions (exact): staggered section mount reveal (`.tpm-reveal` + `animation-delay: calc(var(--i) * 30ms)`, inline `--i` per section); result-count tick (re-keyed span, 120ms fade-slide-up); pip select pop (`active:scale-[0.94]` + ring transition at duration-fast); keep existing `controlBase` press feedback. Everything transform/opacity only.

Architecture constraints: FilterSidebar stays presentational/controlled with no 'use client' directive; extract subcomponents into `components/catalog/` as needed; NO game-name branching inside the renderer beyond presentation-registry lookups — a hypothetical facet with no presentation entry must render today's plain tile (genericity AC).

Depends on TASK-048 (wordmarks/symbols), TASK-051 (mtg facets), TASK-052 (presentation registry), TASK-053 (count engine + URL state). Subagent: nextjs-frontend with `frontend-design` skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MTG shows color pips, rarity/type/set with icons and identity colors; Riftbound shows rune-iconed domain tiles in official domain hexes; each game's accent visibly themes the panel; games without presentation entries degrade to plain tiles
- [ ] #2 Zero-count values are visibly disabled and unclickable, but a selected value always stays removable
- [ ] #3 All animation is transform/opacity-only on existing motion tokens; prefers-reduced-motion collapses it; keyboard focus rings intact on every control including collapsed section headers, and disabled tiles are skipped correctly
- [ ] #4 Registry genericity preserved: no per-game branching in the renderer beyond presentation lookups
- [ ] #5 pnpm typecheck, pnpm build, vitest, and biome are green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Plan (deps TASK-048/051/052/053 all Done and merged to main):
1. Load the `frontend-design` skill before writing UI, per CLAUDE.md.
2. Read the current apps/web/src/components/catalog/FilterSidebar.tsx, GameWordmark.tsx (TASK-048), facet-presentation.ts (TASK-052), facet-counts.ts (TASK-053), and the motion-token contract from TASK-045 (globals.css .tpm-* classes) before writing anything — ground every visual decision in the real current code, not the description's paraphrase.
3. Build presentation per the binding spec in the task description: GameWordmark plates for the game section; generic facet renderer consulting FACET_PRESENTATION (pips layout for MTG colors w/ grayscale-when-unselected + ring+glow when selected; icon tiles for rarity/domain with hex-tinted selected state mirroring the existing CONDITION_HEX inline-style pattern); counts + disabled states from facet-counts.ts everywhere, but a selected value must stay clickable/removable even at zero count; per-game accent via `--game-accent` CSS var from accentFor(activeGame) on the sidebar wrapper + catalog header eyebrow; collapsible sections (CSS grid-template-rows 0fr->1fr, `.tpm-collapse` added to globals.css, all open by default); staggered mount reveal, result-count tick, pip press-pop micro-interactions per the exact spec in the description.
4. Hard constraint: FilterSidebar stays presentational, no 'use client', no game-name branching beyond presentation-registry lookups — a facet with no presentation entry must still render as today's plain tile.
5. Audit with `web-design-guidelines` skill before closing.
6. pnpm typecheck, pnpm build, vitest, biome green.
Executed by nextjs-frontend subagent (with frontend-design skill) in isolated worktree on branch task/TASK-054; verified by task-verifier before merge — verifier must specifically check AC#4 (no per-game branching) and AC#3 (reduced-motion + focus rings), not just visual claims.
<!-- SECTION:PLAN:END -->
