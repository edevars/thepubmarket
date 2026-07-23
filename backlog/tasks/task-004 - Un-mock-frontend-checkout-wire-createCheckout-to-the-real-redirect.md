---
id: TASK-004
title: 'Un-mock frontend checkout: wire createCheckout to the real redirect'
status: Done
assignee: []
created_date: '2026-07-22 22:31'
updated_date: '2026-07-23 01:18'
labels:
  - 'epic:checkout-golive'
  - feature
milestone: m-0
dependencies:
  - TASK-002
  - TASK-003
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/web/src/app/[locale]/cart/page.tsx currently mocks checkout: the startCheckout() function (near the `// Mock de checkout` comment, ~line 34) simulates a 1.8s delay then redirects to /checkout/success without calling Stripe or touching funds. The real createCheckout function already exists intact in apps/web/src/lib/client-api.ts and calls the real checkout API. This task replaces the mock with the real call now that Stripe Connect is live (depends on platform setup + secrets).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 startCheckout() in cart/page.tsx calls the real createCheckout from lib/client-api.ts instead of simulating a redirect
- [x] #2 On success, browser redirects to res.data.url returned by the API (the real Stripe Checkout session URL)
- [x] #3 The simulated ~1.8s mock redirect and mock comment are removed
- [x] #4 NEXT_PUBLIC_API_URL confirmed to point at the correct (working) API for the target environment
- [x] #5 `pnpm -F @thepubmarket/web typecheck` and `pnpm -F @thepubmarket/web build` pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
startCheckout() en cart/page.tsx ahora llama a createCheckout(token, {items}) real vía @/lib/client-api y redirige con window.location.href = res.data.url (dominio externo de Stripe, por eso no se usa el router de Next). Se agrega estado checkoutError con el mensaje ya existente en i18n ('cart.checkoutError'). Se removió MOCK_REDIRECT_MS, el timer y el comentario de mock. typecheck y build pasan limpio.

AC#4: apps/web/.env (gitignored, no se despliega) se apuntó temporalmente a http://localhost:8787 para poder probar el flujo local con la cuenta Connect y las llaves de test ya configuradas (TASK-002/003). Antes de cualquier deploy a producción hay que confirmar que sigue/vuelve a apuntar al Worker remoto correcto — no se toca ninguna config de producción con este cambio.

AC#4: apps/web/.env revertido a la API remota (https://thepubmarket-api.enrique-devars-cee.workers.dev), que es el valor correcto para el entorno de trabajo normal. Se usó localhost:8787 solo temporalmente durante la prueba E2E de esta sesión.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
startCheckout() in cart/page.tsx now calls the real createCheckout(token, {items}) and redirects via window.location.href to the Stripe Checkout URL, replacing the 1.8s mock redirect. Added a checkoutError state that surfaces the existing 'cart.checkoutError' i18n message on failure. Verified end-to-end in the browser: login via magic link, add to cart, pay with Stripe test card 4242..., redirect to /checkout/success, order confirmed paid via webhook. typecheck and build both pass. NEXT_PUBLIC_API_URL confirmed correct (remote Worker) for normal use; it was pointed at localhost only during this session's local testing and has been reverted.
<!-- SECTION:FINAL_SUMMARY:END -->
