---
id: TASK-042
title: >-
  Card detail: render full Riftbound metadata (rules text, flavor text, rarity,
  set)
status: In Progress
assignee:
  - claude
created_date: '2026-08-06 05:44'
updated_date: '2026-08-06 08:51'
labels:
  - 'epic:riftbound-ux'
  - web
milestone: m-3
dependencies:
  - TASK-038
  - TASK-045
references:
  - apps/web/src/components/detail/CardDetailView.tsx
  - apps/web/src/components/detail/game-attributes.ts
  - apps/web/src/components/detail/game-attributes.test.ts
  - 'apps/web/src/app/[locale]/catalog/[id]/page.tsx'
  - apps/web/messages/es.json
  - apps/web/messages/en.json
modified_files:
  - apps/web/src/components/detail/CardDetailView.tsx
  - apps/web/src/components/detail/IconizedText.tsx
  - apps/web/src/components/detail/icon-tokens.ts
  - apps/web/src/components/detail/icon-tokens.test.ts
  - apps/web/messages/es.json
  - apps/web/messages/en.json
priority: medium
type: enhancement
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The listing detail page currently shows only the basic Riftbound attribute rows (type/supertype, domains, energy, might) delivered by TASK-034. The richer metadata imported from dotgg — rules text, flavor text, rarity, set name, collector number — exists in catalog_cards but is never rendered, so the Riftbound detail page is noticeably poorer than what the strict source metadata supports. Note: rules/flavor text contain `:rb_x:` icon tokens preserved verbatim by the importer.

Outcome: a shopper viewing a Riftbound listing sees the complete card information, matching the depth other TCG marketplaces offer, without affecting non-Riftbound detail pages. Part of `epic:riftbound-ux`.

Depends on TASK-038, which makes rules text, flavor text, rarity, and set metadata available in the catalog detail API response.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Riftbound listing detail shows rules text and flavor text, with :rb_x: icon tokens rendered as icons or a readable fallback — never as raw tokens
- [x] #2 Rarity, set name/code, and collector number are displayed on the detail page
- [x] #3 Existing attribute rows (type/supertype, domains, energy, might) are retained and consistent with the new sections
- [x] #4 Missing fields are hidden gracefully (no empty labels); non-Riftbound listings are unaffected
- [x] #5 Labels localized in es and en; typecheck, biome, and tests green including game-attributes tests
- [x] #6 New metadata sections are visually first-class: deliberate typographic hierarchy and entrance/expand transitions from the shared motion foundation (TASK-045), respecting prefers-reduced-motion; a web-design-guidelines skill audit of the detail page reports no violations
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Research the TASK-038 detail payload: confirm which fields the catalog detail API returns (rarity, setName/setCode, collectorNumber, rulesText, flavorText) and their shared types, plus how `CardDetailView` currently consumes them.
2. Add a token renderer for `:rb_x:` icon tokens (pure module next to `game-attributes.ts`, unit-tested): parse text into segments and render each token as an icon/badge with an accessible label, never as a raw token. Unknown tokens fall back to a readable label.
3. Extend `game-attributes.ts` (or a sibling `printing-metadata.ts`) with a rows builder for rarity / set name+code / collector number, following the same "omit missing fields" contract. Unit tests mirror `game-attributes.test.ts`.
4. Render in `CardDetailView`: keep the existing attribute rows, add a rules-text block and a flavor-text block with deliberate typographic hierarchy (flavor italic/secondary, rules body), plus the printing metadata rows. Sections absent when data is missing.
5. Motion: entrance/expand transitions from the TASK-045 shared motion foundation, honoring `prefers-reduced-motion`.
6. i18n: new labels in `apps/web/messages/es.json` and `en.json`.
7. Verify: typecheck, biome, vitest; `web-design-guidelines` audit of the detail page.

Non-Riftbound listings must render exactly as before (no game attributes ⇒ no new sections).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Nuevo módulo puro `icon-tokens.ts`: `parseIconTokens(text)` parte el texto en segmentos `text` / `token`. Los tokens conocidos (7 dominios + energy/might/power) resuelven a su nombre canónico; cualquier otro `:rb_x:` se humaniza (`double_strike` → "Double Strike"). Nunca sobrevive un token crudo — hay un test que lo afirma explícitamente.

`IconizedText.tsx` (server component) pinta esos segmentos: spans planos para texto, badges mono con borde cian y `title` accesible para tokens.

En `CardDetailView.tsx` se añadió la sección "Texto de la carta" entre la tabla de atributos y "otras condiciones": rules text en cuerpo regular con `whitespace-pre-line`, flavor text en itálica/secundario, divisor solo si ambos están presentes. El bloque completo va con `.tpm-reveal` (motion foundation de TASK-045, ya neutralizada bajo `prefers-reduced-motion` en globals.css) y solo se renderiza si `rulesText || flavorText`.

Desviación del plan (paso 3): no se construyó un rows-builder para rarity/set/collector number. `CardSnapshot.rarity/setName/setCode/collectorNumber` son campos requeridos no-opcionales (packages/shared/src/index.ts) y ya se renderizaban incondicionalmente en la tabla `attrs`; verificado contra D1 de producción — 0 de 1409 cartas Riftbound tienen esos campos vacíos. Un builder de "omitir si falta" habría sido código muerto.

MTG queda intacto: el snapshot de Scryfall nunca puebla rulesText/flavorText (afirmado en scryfall.test.ts), así que la sección simplemente no aparece.

Verificación: typecheck limpio, biome limpio, tests 55/55 web + 182/182 api (incluye game-attributes.test.ts y los 8 casos nuevos de icon-tokens.test.ts). Auditoría con el skill web-design-guidelines: sin violaciones. Desplegado a producción (thepubmarket-web, version ca5efcde).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
El detalle de una carta Riftbound ahora muestra el texto de reglas y el flavor text que ya venía importado de dotgg, con los tokens de icono `:rb_x:` renderizados como badges legibles en vez de texto crudo. Rarity, set y collector number ya se mostraban y siguen igual. Los listados que no son Riftbound no cambian: la sección nueva no existe cuando no hay texto que mostrar.
<!-- SECTION:FINAL_SUMMARY:END -->
