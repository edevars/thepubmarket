---
id: TASK-061.03
title: CP-first shipping address form at checkout with corpus-driven autofill
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-08 01:25'
updated_date: '2026-08-08 02:11'
labels:
  - 'epic:sepomex-address'
milestone: m-2
dependencies:
  - TASK-061.02
references:
  - apps/web/src/components/checkout/DeliveryStep.tsx
  - apps/web/messages/es.json
  - apps/web/messages/en.json
parent_task_id: TASK-061
priority: high
type: feature
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Frontend layer of the epic, and the part the buyer actually feels.

Today the shipping form in `apps/web/src/components/checkout/DeliveryStep.tsx` is seven free-text inputs; the buyer types estado, ciudad and colonia by hand and nothing catches a mismatch. Rework it so the postal code leads: the buyer enters 5 digits, the form asks the lookup API from TASK-061.02, and estado / municipio / ciudad arrive filled while colonia turns into a pick-list of the settlements that actually belong to that CP. What stays typed is what only the buyer knows — street and number, interior, references, recipient and phone.

The corpus guides, it never traps. Three cases must all end in a completed order:
- CP found, colonia in the list: buyer picks it and moves on.
- CP found, colonia missing from the list (new development, renamed): buyer types their own colonia without fighting the UI.
- CP not in the corpus at all: the form degrades to today's all-free-text behaviour with a plain explanation, not a blocking error.

Autofilled fields stay editable — the corpus is authoritative about what exists, not about what the courier will accept.

This is checkout, the highest-stakes screen in the product, and CLAUDE.md sets the bar: first-class visual quality, deliberate micro-interactions and transitions that respect `prefers-reduced-motion`, nothing that reads as a generic form. Build with the `frontend-design` skill and audit with `web-design-guidelines` before closing. Both locales (es default, en) need copy in `apps/web/messages`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Entering a valid 5-digit CP fills estado, municipio and ciudad and populates the colonia selector from the lookup API, with no further typing needed for those fields
- [ ] #2 Autofilled estado / municipio / ciudad remain editable by the buyer and their edits survive submission
- [ ] #3 When the colonia is not in the returned list, the buyer can enter a free-text colonia and complete the order
- [ ] #4 An unlisted CP shows a clear, non-blocking explanation and lets the buyer fill every field manually, exactly as today
- [ ] #5 The lookup shows a visible loading state, handles API failure and offline by falling back to manual entry instead of blocking checkout, and does not fire a request on every keystroke
- [ ] #6 Changing the CP after autofill re-runs the lookup and clears a colonia that no longer belongs to the new CP, instead of silently keeping a stale one
- [ ] #7 Keyboard-only and screen-reader users can complete the whole address: correct labels, autocomplete attributes, error messages tied to their inputs, and announcement when fields are autofilled
- [ ] #8 All transitions and micro-interactions respect prefers-reduced-motion
- [ ] #9 Copy exists in both es and en message files, with no hardcoded strings in the component
- [ ] #10 The final UI is audited against web-design-guidelines and typecheck and lint pass clean
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Contexto verificado

- `DeliveryStep.tsx` (462 líneas) ya trae el paso completo: tarjetas de método, `AddressForm` con 8 inputs de texto libre, selector de tienda y resumen. Solo se reescribe `AddressForm`; el resto no se toca.
- El sistema visual ya existe y manda: fondo oscuro, bordes angulares con `clip-*`, `font-display` Rajdhani, micro-etiquetas en mono mayúsculas, acentos `primary`/`cyan`. **No se inventa identidad nueva**, se trabaja dentro de ella.
- `globals.css` ya tiene la fundación de movimiento (`--duration-*`, `--ease-*`, `.tpm-tick`, `.tpm-reveal`) y **un bloque global de `prefers-reduced-motion` que anula todas las animaciones**. Usar esas clases satisface el AC #8 sin CSS nuevo.
- `lookupPostalCode()` ya está en `client-api.ts` (TASK-061.02): acepta `AbortSignal` y devuelve `null` ante fallo de red.

## Decisión de mapeo de campos, importante para TASK-061.04

El esquema de dirección tiene `city` y `state`, no tiene `municipio`. En una guía de paquetería mexicana lo que va es **municipio/alcaldía**, no la "ciudad" de SEPOMEX (para el CP 01000 el municipio es Álvaro Obregón y la ciudad es Ciudad de México). Así que el autocompletado escribe el **municipio** del corpus en `city`, y la etiqueta del campo pasa de "Ciudad" a **"Municipio o alcaldía"** en ambos idiomas. El contrato de la API no cambia; solo la etiqueta y qué valor se sugiere. TASK-061.04 tiene que comparar `city` contra `municipality` del corpus, no contra `city`.

## Signature: el CP como lectura de instrumento

El único elemento memorable del bloque, y encaja con el lenguaje de "panel de instrumentos" que ya usa el catálogo: junto al campo de CP vive una **lectura en mono** que resuelve en vivo —`—— · ——` → `BUSCANDO…` → `ÁLVARO OBREGÓN · CIUDAD DE MÉXICO` → `SIN REGISTRO`—, con re-key `.tpm-tick` en cada cambio. Todo lo demás se mantiene idéntico a los campos que ya existen. Un solo acento, no cinco.

## Comportamiento

- **Debounce de 400 ms** y disparo solo con 5 dígitos válidos; `AbortController` cancela la consulta en vuelo. Nunca una petición por tecla.
- **Colonia**: `<select>` nativo (mejor a11y y mejor en móvil que un combobox propio) con las colonias del CP, más una salida explícita "Otra — la escribo yo" que cambia a input de texto y le pone foco. Si el CP trae una sola colonia, se selecciona sola.
- **Estado / Municipio**: se llenan del corpus y **quedan editables**. Una consulta exitosa los sobreescribe: cambiar el CP es un acto deliberado que significa "otro lugar". La edición del comprador sobrevive hasta que él mismo cambie el CP.
- **Cambio de CP** (AC #6): se limpia la colonia si no pertenece al CP nuevo y se vuelve al modo lista.
- **CP no encontrado / API caída / offline**: nota clara no bloqueante y el formulario queda exactamente como hoy, todo a mano. Nunca corta el checkout.
- **a11y**: región `aria-live="polite"` que anuncia el resultado ("CP 01000: Álvaro Obregón, Ciudad de México. 1 colonia disponible"), `aria-describedby` del CP a su estado, `aria-busy` mientras consulta, errores ligados a su input, y se conservan los `autocomplete`.

## Verificación

Sin navegador (ver memoria del proyecto): typecheck, lint, build de Next y auditoría con `web-design-guidelines` sobre el código. La lógica que se pueda separar del render se prueba con vitest si aplica; apps/web no tiene runner de componentes.
<!-- SECTION:PLAN:END -->
