---
id: TASK-060
title: Repair the repo-wide lint gate broken by the fees explorer
status: Done
assignee:
  - '@claude'
created_date: '2026-08-07 22:08'
updated_date: '2026-08-07 22:18'
labels:
  - chore
  - pitch
milestone: m-3
dependencies:
  - TASK-058
references:
  - apps/pitch/public/fees/fees.js
  - apps/pitch/public/fees/index.html
  - scripts/fee-model.mjs
  - biome.json
modified_files:
  - apps/pitch/public/fees/index.html
  - apps/pitch/public/fees/fees.js
  - apps/pitch/public/fees/fees.css
  - scripts/fee-model.mjs
priority: high
type: chore
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`pnpm lint` fails on main, so the standard verification gate is red for every task that follows. The failures all come from the fee-analysis explorer landed in TASK-058: the static assets under apps/pitch/public/fees and the scripts/fee-model.mjs generator were never run through Biome.

Fourteen findings across formatting, string concatenation that should be template literals, iterable callbacks that do not return consistently, and non-semantic elements carrying ARIA roles in the fees markup.

A red lint gate is corrosive beyond the specific findings: it trains everyone to skip the check, which is how the next real defect slips through. The point of this task is to get `pnpm lint` back to green so the gate means something again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pnpm lint exits clean on a fresh checkout of main, with no findings left in apps/pitch or scripts
- [x] #2 Elements carrying ARIA roles in the fees markup are replaced with the semantic element that already conveys that role, rather than suppressing the rule
- [x] #3 Iterable callbacks return consistently instead of mixing a value and a bare statement
- [x] #4 The fees explorer still renders and behaves identically after the changes — the repair is stylistic and must not alter the fee maths or the interaction
- [x] #5 pnpm typecheck, pnpm turbo run test and pnpm build stay green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Lo mecánico

Formato y `useTemplate` en `fees.js` y `scripts/fee-model.mjs`: `biome check
--write`. Sin criterio de por medio.

## Lo que sí requería decisión

**Roles ARIA → elementos que ya los llevan** (AC#2, sin suprimir):
- `div[role="list"]#hand` con tarjetas `article[role="listitem"]` → `ul` real
  con `li` reales. `fees.js` crea `li` directamente y ya no calza el rol.
- Los dos `div[role="region"]` que envuelven las tablas → `section` con su
  `aria-label` de siempre, que ya es un region por definición.
- `div[role="group"]` de la comparación de configs → `ul` con tres `li` (los
  dos proofs y el "vs", este último `aria-hidden`).
- `.fx-hand` y `.fx-hero__proof` reciben `list-style: none` y `padding-left: 0`
  para que la conversión sea visualmente idéntica.

**Callbacks de `forEach`**: cuerpo de bloque en vez de devolver implícitamente
el resultado de `classList.add`.

## La supresión deliberada

El autofix `--unsafe` de Biome **quitó `tabindex="0"`** de las dos tablas con
scroll horizontal. Eso es una regresión de accesibilidad, no una limpieza: un
contenedor que scrollea tiene que ser enfocable o el teclado no puede
recorrerlo (WCAG 2.1.1). Se restauró el `tabindex` y se suprimió
`noNoninteractiveTabindex` con la razón escrita en el markup — la premisa de la
regla (nada no-interactivo necesita foco) no se sostiene para un scroller.
`.fx-scroll:focus-visible` ya dibujaba el anillo, así que el foco es visible.

## Verificación

`pnpm lint` sale con código 0 en `main` (quedan los 2 avisos preexistentes de
`noImgElement` en FacetTile/PipRow, que son warnings). Typecheck 0, 353 tests
(207 api + 146 web), build verde.

El explorador se sirvió en local y se revisó en navegador: las cinco cartas
siguen en su grid de 5 con su rampa de condición (P1 DMG → P4 NM), sin viñetas
ni sangría; las tablas y el modelo calculan igual (`proof-a` 3.6%, `proof-b`
6.6%). Comprobado en el DOM que `#hand` es `UL` con 5 `LI` y que ningún `li`
renderiza marcador.

## Fuera de alcance

`main` tiene una rama vieja sin mergear, `demo/showcase-cloudflare` (4 jul): 4
commits propios contra 387 de `main`, y su commit de cabeza es "rediseño del
sidebar de filtros" — el sidebar que TASK-054/057 eliminó. Mergearla
resucitaría código muerto; se deja intacta y se señala para que el dueño decida
borrarla.

Los cambios del pitch NO están desplegados: `apps/pitch` es un Worker aparte y
esta task solo pedía reparar el gate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Mergeado en `0dd8d05`. `pnpm lint` vuelve a salir con código 0 en `main`.

De los catorce hallazgos que dejó TASK-058, once eran mecánicos. Los otros tres
se arreglaron sustituyendo los roles ARIA del markup de fees por los elementos
que ya los llevan —`ul`/`li` reales para la mano de cartas y para la
comparación de configs, `section` para los envoltorios de tabla— en vez de
silenciar la regla.

Hay una única supresión, y es a propósito: el autofix inseguro de Biome quitaba
el `tabindex="0"` de las tablas con scroll horizontal, que es lo que permite
recorrerlas con teclado. Se restauró con la razón escrita en el markup.

Verificado en navegador que el explorador se ve y calcula exactamente igual.
<!-- SECTION:FINAL_SUMMARY:END -->
