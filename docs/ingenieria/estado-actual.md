# Estado actual — Ingeniería

> Snapshot técnico del proyecto. Actualízalo al cerrar cada bloque de trabajo.
> Léelo junto con `ROADMAP.md` (fases) y `CLAUDE.md` (reglas de decisión).

**Fecha:** 2026-06-26
**Rama activa:** `fase-2-transaccional`
**Fase del roadmap:** Fase 2 — Núcleo transaccional (código completo; falta Stripe vivo)

---

## TL;DR

Todo el núcleo transaccional está implementado en código y verificado por
build/lint. La experiencia de compra corre con **checkout mockeado** (no toca
fondos, no llama a Stripe). El único bloqueo para transaccionar de verdad es la
**configuración viva de Stripe Connect** + onboarding del primer seller.

---

## Qué corre y dónde

| Servicio | Comando | URL local | Notas |
|---|---|---|---|
| Web (Next.js) | `pnpm dev` (turbo) | http://localhost:3000 | App bilingüe ES/EN |
| API (Worker + Hono) | `wrangler dev` | http://localhost:8787 | D1/KV/R2/DO locales |
| Pitch deck (Worker assets) | `wrangler dev` | http://localhost:8788 | Interno, ajeno al marketplace |

Entrypoint único de dev: `pnpm dev:up` (= `bash scripts/dev.sh`) → instala deps,
crea `.env`, aplica migraciones + seed de D1 local, y levanta los tres servicios.

---

## Lo que ya funciona (✅)

### Fase 1 — Catálogo
- Catálogo real end-to-end: 18 singles MTG de prueba sembrados (D1 + seed).
- Frontend: home, listado con filtros/búsqueda, ficha de item, estados
  (vacío/carga/sin resultados). Imágenes de Scryfall renderizadas.

### Fase 2 — Núcleo transaccional (código completo)
- **Reserva de inventario (Durable Objects):** `apps/api/src/durable-objects/inventory-reservation.ts`
- **Checkout Stripe Connect** (direct charge + application fee, sin custodia):
  `apps/api/src/routes/checkout.ts`, `apps/api/src/lib/stripe.ts`
- **Webhooks idempotentes** (verificación de firma + tabla `webhook_events`):
  `apps/api/src/routes/webhooks.ts`
- **Workflow durable post-pago:** `apps/api/src/workflows/post-payment.ts`
- **Auth de comprador** (magic link + sesión en KV): `apps/api/src/routes/auth.ts`,
  `apps/api/src/lib/auth.ts`, `apps/web/src/app/[locale]/login/`
- **Carrito rediseñado (Cart.dc.html)** con drawer + 4 estados de página:
  `apps/web/src/components/cart/` (`CartLine`, `OrderSummary`, `CartDrawer`),
  `apps/web/src/app/[locale]/cart/page.tsx`

---

## Lo que falta / está mockeado (⏳)

1. **Stripe Connect vivo** — el bloqueo real. Sin keys reales ni Connect account
   ni `sellers.connect_account_id` poblado. Ver pasos en `handoff.md`.
2. **Checkout mockeado en el front:** `cart/page.tsx` simula el redirect (~1.8 s →
   `/checkout/success`) en vez de llamar a `createCheckout`. La ruta real sigue
   intacta en `apps/web/src/lib/client-api.ts`.
3. **Estados items/redirigiendo del `/cart`** solo se ven con sesión iniciada
   (sin usuario, el carrito muestra el auth gate). Verificados por build.
4. **Gap de datos seller:** `InventoryItem` (en `packages/shared`) no expone
   nombre ni verificación del vendedor; la fila "Vendido por" del carrito se omite.

---

## Gotchas conocidos

- **Puertos de wrangler:** `api` usa los defaults (8787 / inspector 9229). El
  worker `pitch` se fijó a `8788` / inspector `9230` en su `wrangler.jsonc` para no
  chocar. Si agregas otro Worker, asígnale puertos propios o `dev:up` fallará con
  "Address already in use".
- **Procesos huérfanos:** wrangler/workerd/next a veces quedan vivos tras un Ctrl+C
  sucio y ocupan puertos. Límpialos: `pkill -f 'thepubmarket/apps' ; pkill -f 'workerd serve'`.
- **`NEXT_PUBLIC_API_URL`:** en `apps/web/.env` apunta al **API remoto**
  (`workers.dev`), que sí tiene catálogo. El API local arranca vacío. Para demo
  100% local con datos, usa `NEXT_PUBLIC_USE_MOCKS=true` (sirve `mock-data.ts`).
- **Carrito en `localStorage`** (clave `tpm_cart`): persiste entre recargas e
  independiente del API. Campos de display son opcionales (retrocompat).

---

## Verificación rápida

```bash
pnpm -F @thepubmarket/web typecheck   # tipos del front
pnpm -F @thepubmarket/web build       # build de producción
pnpm lint                             # biome en todo el repo
curl -s localhost:8787/health         # API + D1
```
