# Handoff — Continuar en otra sesión

> Punto de arranque para retomar el trabajo técnico (humano o agente Claude) sin
> recargar todo el contexto. Si eres un agente: lee primero `CLAUDE.md` (reglas de
> decisión), luego `docs/ingenieria/estado-actual.md`, luego esto.

---

## 1. Arranca el entorno

```bash
pnpm dev:up            # instala, migra, siembra y levanta api+web+pitch
# o, sin reinstalar/migrar:
pnpm dev:up --no-install --no-migrate
```

- Web → http://localhost:3000 · API → http://localhost:8787 · Pitch → http://localhost:8788
- Si falla con "Address already in use", hay procesos huérfanos:
  ```bash
  pkill -f 'thepubmarket/apps' ; pkill -f 'workerd serve' ; pkill -f 'turbo run dev'
  ```

## 2. Mapa del repo (lo que importa)

```
apps/api/src/
  routes/        checkout.ts · webhooks.ts · auth.ts · catalog.ts · sellers.ts · seller-panel.ts · orders.ts · admin.ts
  middleware/    admin-auth.ts · buyer-auth.ts · seller-auth.ts  # seller = sesión + sellers.user_id
  lib/           stripe.ts · auth.ts · orders.ts · inventory.ts (createListing) · sellers.ts · scryfall.ts · email.ts
  durable-objects/inventory-reservation.ts   # reserva con TTL (anti doble venta)
  workflows/     post-payment.ts             # confirma orden tras payment_intent.succeeded
apps/api/seed.sql                # 5 tiendas (upsert) + reparto de inventario + link dueño→ancla
apps/web/src/
  app/[locale]/  cart/ · checkout/{success,cancel}/ · login/ · catalog/ · tiendas/ · panel/{,inventario,agregar,ordenes} · compras/ · auth/verify/
  components/cart/CartLine.tsx · OrderSummary.tsx · CartDrawer.tsx
  components/sellers/            # SellerHubView, SellerInventory, SellerGallery…
  components/panel/              # PanelShell (guard+sidebar), PanelProvider, 4 vistas
  components/compras/            # ComprasView (rastreo del comprador, sin comisión)
  lib/           cart.tsx (contexto + drawer) · client-api.ts (checkout + /seller/*) · session.ts
  lib/catalog/   display.ts · data.ts · mock-data.ts
  lib/sellers/   data.ts (frontera API/mocks) · mock-data.ts · types.ts
packages/shared/src/index.ts   # contrato (InventoryItem, Seller, SellerOrder, CheckoutRequest…)
```

Panel del Vendedor (`/panel`): acceso = magic link con un email vinculado en
`sellers.user_id` (seed vincula al dueño con el ancla; invitar otros:
`POST /admin/sellers/:id/link {email}` con `x-admin-key`). El chrome del
marketplace se oculta en `/panel/*` vía `MarketplaceChrome` (layout del locale).

## 3. Próximo objetivo: cerrar Fase 2 (Stripe vivo)

Pasos en orden (respetando **no custodia de fondos** — direct/destination charge +
application fee, nunca separate charges & transfers):

1. **Cuenta + Connect.** Crear cuenta de plataforma en Stripe, activar Connect
   (Express). Modo test primero.
2. **Onboarding del primer seller** (The Pub Game Store): generar Connect account,
   completar onboarding, guardar el id en `sellers.connect_account_id`
   (hoy null/placeholder). Revisar cómo lo lee `apps/api/src/lib/stripe.ts`.
3. **Secrets reales:**
   - Local: `apps/api/.dev.vars` → `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
   - Prod: `wrangler secret put STRIPE_SECRET_KEY` (y el webhook secret).
4. **Desmockear el front:** en `apps/web/src/app/[locale]/cart/page.tsx`, la función
   `startCheckout()` hoy simula el redirect. Reemplazarla por la llamada real a
   `createCheckout` (intacta en `lib/client-api.ts`) → redirigir a `res.data.url`.
   Buscar el comentario `// Mock de checkout`. Confirmar `NEXT_PUBLIC_API_URL`.
5. **Webhook local:** `stripe listen --forward-to localhost:8787/webhooks/stripe`
   (o la ruta real en `routes/webhooks.ts`), pegar el signing secret en `.dev.vars`.
6. **Probar e2e en test:** pago OK, pago fallido (tarjeta `4000000000000002`),
   webhook reintentado (idempotencia), liberación de reserva por TTL al no pagar.

**Criterio de cierre:** una transacción real de extremo a extremo confiable.

## 4. Backlog técnico menor (no bloquea Fase 2)

- **Seller en el carrito:** mostrar la fila "Vendido por" (hoy omitida). Ya existe
  `GET /sellers` y el contrato `Seller` (tiendas end-to-end, commit `670fee4`);
  falta decidir si el catálogo hace join de `sellerName`/`verified` en
  `InventoryItem` o el front hace lookup. Campos ya previstos como opcionales en
  `CartItem` (`lib/cart.tsx`).
- **Inventario propio por tienda:** el reparto actual es un `UPDATE` por título en
  `seed.sql` (los 18 singles del ancla repartidos entre 5 tiendas). Cuando haya
  carga real por seller, extender `scripts/load-inventory.mjs` para aceptar
  `sellerId` por entrada y retirar los UPDATE del seed.
- **Migrar imágenes a R2** (hoy se referencian URLs de Scryfall directo).
- **Estados items/redirigiendo del carrito:** solo visibles con sesión; documentar
  un usuario de prueba o un atajo de dev para revisarlos sin magic link.

## 5. Cómo verificar antes de entregar

```bash
pnpm -F @thepubmarket/web typecheck && pnpm -F @thepubmarket/web build
pnpm lint
```
Para validar la UI en el navegador, ver el skill `/verify` o automatizar con la
extensión de Chrome/Brave (browser MCP).

## 6. Reglas que no se negocian (de `CLAUDE.md`)

1. **No custodia de fondos.** Si una decisión implica que la plataforma toque,
   retenga o redirija fondos aunque sea un instante: **detente y señálalo**.
2. Operable y mantenible por **una sola persona**. Simple y durable > sofisticado.
3. **Cloudflare-first.** Nada fuera del ecosistema sin justificación clara.
4. **Marca implicaciones regulatorias** (Ley Fintech, IFPE, CNBV) en cada decisión.
5. Modelo **vetted sellers / no auto-registro**.
