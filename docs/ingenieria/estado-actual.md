# Estado actual — Ingeniería

> Snapshot técnico del proyecto. Actualízalo al cerrar cada bloque de trabajo.
> Léelo junto con `ROADMAP.md` (fases) y `CLAUDE.md` (reglas de decisión).

**Fecha:** 2026-07-04
**Rama activa:** `main`
**Fase del roadmap:** Fase 2 — Núcleo transaccional (código completo; falta Stripe vivo)

---

## TL;DR

Todo el núcleo transaccional está implementado en código y verificado por
build/lint. La experiencia de compra corre con **checkout mockeado** (no toca
fondos, no llama a Stripe). El único bloqueo para transaccionar de verdad es la
**configuración viva de Stripe Connect** + onboarding del primer seller.

Nuevo desde el 2026-07-01: **tiendas end-to-end** (commit `670fee4`) — galería
`/tiendas` + perfil Seller Hub `/tiendas/[slug]` conectados a D1 vía
`GET /sellers`, con 5 tiendas seedeadas e inventario repartido. Desplegado a
producción (D1 remota + api + web).

Nuevo desde el 2026-07-04: **Panel del Vendedor** (`/panel`) end-to-end —
autoservicio de inventario (alta vía Scryfall, precio/cantidad inline, pausa) y
órdenes con envío (Pagada → Enviada con guía → Entregada). API `/seller/*` con
`sellerAuth` (sesión magic-link + `sellers.user_id`, por fin en uso). Migración
0005-ready: 0004 añadió `tracking_number/shipped_at/delivered_at` a `orders`
(el enum de status NO se tocó; enviado/entregado se derivan, entregada fija
`fulfilled`). Vinculación de sellers: seed (dueño→ancla) +
`POST /admin/sellers/:id/link`. Desplegado a producción.

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

### Tiendas — Seller Hub + galería (end-to-end, diseño Seller Hub.dc.html)
- **D1:** migración `0003_friendly_scourge.sql` añade 13 columnas de perfil
  público a `sellers` (verified, monogram, blurb, horarios/juegos como JSON,
  whatsapp, instagram…). Solo vitrina; nada de pagos.
- **Seed:** `apps/api/seed.sql` upserta 5 tiendas vetted (ancla + 4) con
  `INSERT … ON CONFLICT DO UPDATE` idempotente que **nunca toca** `user_id` ni
  `stripe_connect_account_id`, y reparte el inventario por título.
- **API:** `GET /sellers` y `GET /sellers/:slug` (`apps/api/src/routes/sellers.ts`,
  singlesCount vía LEFT JOIN + `COUNT(inventory.id)`); filtro `?seller=` en
  `GET /catalog`. Contrato `Seller` en `packages/shared`.
- **Web:** galería `/tiendas` y perfil `/tiendas/[slug]` (hero + badge
  verificado, inventario con filtros, conoce al vendedor, ubicación, horarios,
  contacto). Componentes en `apps/web/src/components/sellers/`; frontera
  `apps/web/src/lib/sellers/data.ts` (API real; mocks tras
  `NEXT_PUBLIC_USE_MOCKS=true`). Navbar: link "Tiendas".

---

## Lo que falta / está mockeado (⏳)

1. **Stripe Connect vivo** — el bloqueo real. Sin keys reales ni Connect account
   ni `sellers.connect_account_id` poblado. Ver pasos en `handoff.md`.
2. **Checkout mockeado en el front:** `cart/page.tsx` simula el redirect (~1.8 s →
   `/checkout/success`) en vez de llamar a `createCheckout`. La ruta real sigue
   intacta en `apps/web/src/lib/client-api.ts`.
3. **Estados items/redirigiendo del `/cart`** solo se ven con sesión iniciada
   (sin usuario, el carrito muestra el auth gate). Verificados por build.
4. **Gap de datos seller en el carrito:** `InventoryItem` (en `packages/shared`)
   sigue sin exponer nombre/verificación del vendedor; la fila "Vendido por" del
   carrito se omite. Ahora es fácil de cerrar: existe `GET /sellers` y el contrato
   `Seller` — falta decidir si se hace join en catálogo o lookup en el front.

---

## Gotchas conocidos

- **Puertos de wrangler:** `api` usa los defaults (8787 / inspector 9229). El
  worker `pitch` se fijó a `8788` / inspector `9230` en su `wrangler.jsonc` para no
  chocar. Si agregas otro Worker, asígnale puertos propios o `dev:up` fallará con
  "Address already in use".
- **Procesos huérfanos:** wrangler/workerd/next a veces quedan vivos tras un Ctrl+C
  sucio y ocupan puertos. Límpialos: `pkill -f 'thepubmarket/apps' ; pkill -f 'workerd serve'`.
- **`NEXT_PUBLIC_API_URL`:** en `apps/web/.env` apunta al **API remoto**
  (`workers.dev`), que sí tiene catálogo y sellers. El API local arranca sin
  inventario: cárgalo con `pnpm inventory:load:local` (API levantada) y luego
  re-corre `pnpm -F @thepubmarket/api db:seed:local` para repartirlo entre
  tiendas. Para demo 100% local sin API, `NEXT_PUBLIC_USE_MOCKS=true`.
- **`load-inventory.mjs` asigna todo al seller ancla** y no es idempotente: tras
  cualquier recarga de inventario (local o remota), re-ejecuta `db:seed:*` para
  que los `UPDATE` por título redistribuyan las cartas entre las 5 tiendas.
- **Carrito en `localStorage`** (clave `tpm_cart`): persiste entre recargas e
  independiente del API. Campos de display son opcionales (retrocompat).

---

## Verificación rápida

```bash
pnpm -F @thepubmarket/web typecheck   # tipos del front
pnpm -F @thepubmarket/web build       # build de producción
pnpm lint                             # biome en todo el repo
curl -s localhost:8787/health         # API + D1
curl -s localhost:8787/sellers        # 5 tiendas con singlesCount
```
