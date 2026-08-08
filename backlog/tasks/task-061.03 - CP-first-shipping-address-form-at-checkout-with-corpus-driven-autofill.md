---
id: TASK-061.03
title: CP-first shipping address form at checkout with corpus-driven autofill
status: Done
assignee:
  - '@claude'
created_date: '2026-08-08 01:25'
updated_date: '2026-08-08 02:19'
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
- [x] #1 Entering a valid 5-digit CP fills estado, municipio and ciudad and populates the colonia selector from the lookup API, with no further typing needed for those fields
- [x] #2 Autofilled estado / municipio / ciudad remain editable by the buyer and their edits survive submission
- [x] #3 When the colonia is not in the returned list, the buyer can enter a free-text colonia and complete the order
- [x] #4 An unlisted CP shows a clear, non-blocking explanation and lets the buyer fill every field manually, exactly as today
- [x] #5 The lookup shows a visible loading state, handles API failure and offline by falling back to manual entry instead of blocking checkout, and does not fire a request on every keystroke
- [x] #6 Changing the CP after autofill re-runs the lookup and clears a colonia that no longer belongs to the new CP, instead of silently keeping a stale one
- [x] #7 Keyboard-only and screen-reader users can complete the whole address: correct labels, autocomplete attributes, error messages tied to their inputs, and announcement when fields are autofilled
- [x] #8 All transitions and micro-interactions respect prefers-reduced-motion
- [x] #9 Copy exists in both es and en message files, with no hardcoded strings in the component
- [x] #10 The final UI is audited against web-design-guidelines and typecheck and lint pass clean
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**La auditoría con `web-design-guidelines` encontró defectos reales, no cosméticos.** Todos corregidos antes de cerrar:

| Hallazgo | Por qué importaba |
|---|---|
| El `<select>` de colonia tenía `appearance-none` sin flecha propia | Quedaba sin ninguna señal de que era desplegable |
| Los inputs no tenían `name` | Autofill del navegador y submit nativo degradados |
| Teléfono sin `type="tel"` | Teclado equivocado en móvil |
| El texto de la lectura truncaba sin `min-w-0` | `truncate` no funciona en un hijo de flex sin eso |
| Foco no se movía al primer campo faltante al continuar | "Completa los datos faltantes" sin decir cuál obliga a recorrer todo el formulario con teclado |
| Foco visible solo por cambio de borde | Se adoptó el anillo del sistema (`focus-visible:ring-2 ring-primary/70`), el mismo de SiteHeader e InventoryView |

También se agregó `spellCheck={false}` al CP.

**Movimiento:** no se escribió CSS nuevo. Se reusan `.tpm-tick` (re-key de la lectura en cada resolución) y `.tpm-reveal` (aparición del selector y de la nota de CP no encontrado), que el bloque global de `prefers-reduced-motion` de `globals.css` ya anula. AC #8 sin deuda.

**Verificación:** 17 tests nuevos en `address-form.test.ts` cubren las reglas que deciden si una dirección queda coherente (qué sobrevive a un cambio de CP, qué se sobreescribe, colonia con acentos, CP sin registro, orden del foco). 163 tests de web y 238 de api en verde, `pnpm typecheck`, `pnpm lint` y `next build` limpios. Sin navegador, por la preferencia registrada del proyecto.

**Para TASK-061.04:** el municipio del corpus se escribe en el campo `city` de la dirección — el esquema tiene un solo espacio para la localidad y lo que lee el mensajero en la guía es el municipio o alcaldía, no la "ciudad" de SEPOMEX. La etiqueta cambió a "Municipio o alcaldía" / "Municipality or borough". La validación del servidor debe comparar `city` contra `municipality` del corpus, no contra `city`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
El formulario de envío del checkout ahora se ancla en el código postal. Mergeado a main (`f98c58c`).

**Qué cambió para el comprador.** Escribe 5 dígitos y el corpus responde: municipio y estado se llenan solos, y la colonia pasa de campo de texto a lista de las que de verdad existen en ese CP. Lo único que teclea es lo que solo él sabe — calle, número, referencias y a quién buscar.

**Qué cambió en el código**

| Archivo | Qué hace |
|---|---|
| `components/checkout/ShippingAddressForm.tsx` | El formulario nuevo. Ancla de CP con una lectura en mono que resuelve en vivo, selector de colonia nativo con salida explícita \"mi colonia no está en la lista\", y los campos agrupados dirección → contacto. |
| `lib/checkout/address-form.ts` | Las reglas: qué sobrevive a un cambio de CP, qué se sobreescribe, cómo se arma el payload, a dónde va el foco al fallar. Fuera del componente para que estén probadas. |
| `components/checkout/DeliveryStep.tsx` | Se quedó con el paso; el formulario embebido se fue a su propio archivo. |
| `messages/es.json`, `messages/en.json` | Copy nuevo en ambos idiomas, cero cadenas en el componente. |

**El corpus guía, nunca atrapa.** Los tres caminos terminan en orden pagada: colonia en la lista, colonia escrita a mano, o CP que el catálogo no conoce y formulario completo a mano con una línea que lo explica. Ningún estado del componente puede bloquear el pago — tampoco la API caída ni estar sin conexión.

**Detalles con consecuencia**

- Debounce de 400 ms + `AbortController`: una consulta por CP terminado, no por tecla.
- Una consulta exitosa **sobreescribe** municipio y estado: cambiar el CP significa \"otro lugar\", y conservar lo del CP anterior produce justo la dirección incoherente que este epic existe para evitar. Después el comprador los edita si quiere.
- Si el CP trae una sola colonia, se elige sola.
- El municipio va al campo `city`: es lo que lee el mensajero. La etiqueta cambió a \"Municipio o alcaldía\".

**Sigue pendiente producción**, igual que en las dos tasks anteriores: migración remota, carga del corpus y deploy. Hasta entonces el formulario funciona en modo manual, que es exactamente el comportamiento anterior.
<!-- SECTION:FINAL_SUMMARY:END -->
