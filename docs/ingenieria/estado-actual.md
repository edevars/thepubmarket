# Estado actual — Ingeniería

> Snapshot técnico del proyecto. Actualízalo al cerrar cada bloque de trabajo.
> Léelo junto con `ROADMAP.md` (fases) y `CLAUDE.md` (reglas de decisión).

**Fecha:** 2026-07-28
**Rama activa:** `main`
**Fase del roadmap:** Fase 2 → Fase 3 — Núcleo transaccional completo; identidad de usuario migrando a email+password

---

## 🛡️ Turnstile activo en producción (2026-07-28)

TASK-012. Anti-bot real, con llaves reales, desplegado — no solo wireado.

- **Gate en 5 endpoints:** `POST /auth/{register,login,password/forgot,password/reset}`
  y `POST /checkout`. `turnstileGuard` corre **antes** del trabajo caro (KDF,
  KV, Durable Objects de reserva, Stripe). Rechazo = `403 turnstile_failed`,
  distinto del `429 rate_limited` de los contadores en KV, que siguen vivos.
- **Widget** `thepubmarket` (managed): `thepubmarket.com`,
  `www.thepubmarket.com`, `localhost`, `127.0.0.1`. Site key
  `0x4AAAAAAEAZkoBZ4yQKkn4x` en `apps/web/.env.production` (público, se inlina
  en build time); secret en `wrangler secret put TURNSTILE_SECRET_KEY` sobre
  `thepubmarket-api`.
- **Verificado en prod** (2026-07-28): sin token → 403; token inválido → 403
  (`invalid-input-response` en el log); `/health`, `/catalog` y `/sellers`
  intactos.
- **Ojo con el orden al redesplegar:** site key sin secret = cero protección
  (la API lo advierte en el log); secret sin site key = 403 en todo. Se mueven
  juntos. Un host no registrado (`*.workers.dev`) falla la verificación.
- Detalle y diagnóstico: [`turnstile.md`](./turnstile.md).

---

## 🎟️ Invitación de vendedores: flujo formal y auditable (2026-07-25)

TASK-010. La invitación sigue siendo el mismo endpoint
(`POST /admin/sellers/:id/link`), pero ahora deja rastro y exige responsable.

- **Bitácora append-only:** tabla `seller_invitations` (migración `0006`) —
  seller, email, usuario, `invited_by`, IP, nota y fecha. Se lee con
  `GET /admin/sellers/:id/invitations`.
- **`x-admin-actor` obligatorio** (formato email) en el link: sin responsable
  no hay invitación (`400 missing_admin_actor`).
- **`adminAuth` endurecido:** comparación en tiempo constante sobre SHA-256 y
  rate limit de intentos fallidos por IP en KV (10 / 15 min). Sigue siendo
  clave compartida — el cierre real son service tokens de Access.
- **Salvaguardas anti auto-registro verificadas** con sondeos curl (registro no
  puede inyectar `role` ni crear tienda; `/seller/*` responde `403`).
- Proceso completo, bitácora y veredicto de la revisión de `x-admin-key` en
  [`invitacion-sellers.md`](./invitacion-sellers.md).

⚠️ **Pendiente antes de desplegar el API:** correr
`pnpm -F @thepubmarket/api db:migrate:remote` (migración `0006`). Si el Worker
sale a producción sin la tabla, `POST /admin/sellers/:id/link` falla al
insertar en la bitácora. Local ya está migrada.

---

## 🔐 Auth de comprador/vendedor: magic link → email+password (2026-07-24)

El login pasó de passwordless (magic link) a **email + contraseña**, para
compradores y vendedores por igual (comparten `users`). Reemplazo completo,
no aditivo — `/auth/magic-link` y `/auth/verify` ya no existen.

- **Hashing:** PBKDF2 vía `crypto.subtle` nativo de Workers (sin dependencia
  nueva). Endurecido en TASK-011 a **HMAC-SHA512 encadenado, 3 × 70k = 210k**
  de trabajo efectivo (Workers topa PBKDF2 en 100k por llamada, ver doc); el
  formato lleva sus parámetros y se re-hashea en el siguiente login exitoso.
- **Endpoints nuevos:** `POST /auth/register`, `POST /auth/login`,
  `POST /auth/password/forgot`, `POST /auth/password/reset` en
  `apps/api/src/routes/auth.ts`. `/auth/logout` y `GET /auth/me` intactos.
- **Rate limiting interino (KV):** `apps/api/src/lib/rate-limit.ts`, mientras
  no llegue Turnstile (TASK-012). El bucket por email del login cuenta
  **fallos**, no intentos (TASK-011).
- **Usuarios legacy** (creados vía magic link, `password_hash IS NULL`): desde
  TASK-011 el login les responde `invalid_credentials` como a cualquier otro
  fallo — el antiguo `password_not_set` era un oráculo de existencia de cuenta.
  Se recuperan por "olvidé mi contraseña".
- **Sesiones:** expiración absoluta de 7 días, sin renovación deslizante. Un
  cambio de contraseña revoca todas las sesiones previas. Detalle completo en
  [`auth-hardening.md`](./auth-hardening.md).
- **Frontend:** `login/`, `register/`, `auth/forgot-password/`,
  `auth/reset-password/` (reemplaza `auth/verify/`) en `apps/web/src/app/[locale]/`.
- Verificado E2E en local: registro, login, `/auth/me`, rate limit,
  usuario legacy → reset → login, checkout y `/panel` sin regresión.
- Ver TASK-015 (implementación) y TASK-011/TASK-012 (scope actualizado).

---

## 🚧 Todo está en modo desarrollo: sin tráfico y sin clientes

**No hay usuarios reales, ni compradores ni vendedores, en ningún ambiente.**
Ni en local, ni en los Workers desplegados. Lo que está en `thepubmarket.com`
y `api.thepubmarket.com` es un entorno de desarrollo con dominio propio, no un
negocio operando. El único seller en D1 es The Pub Game Store, sembrado, y el
único usuario ligado a él es el del fundador.

Esto cambia el cálculo de riesgo de varias decisiones que quedaron abiertas a
propósito, y por eso conviene tenerlo escrito en vez de deducirlo:

- **CORS abierto a cualquier origen** (`apps/api/src/index.ts`, `cors()` sin
  configuración). Con tokens Bearer en `localStorage`, un CORS abierto sería
  exposición real **si hubiera sesiones de usuarios reales que robar**. Hoy no
  las hay. Se deja abierto deliberadamente mientras eso siga siendo cierto.
- **Registro que reclama cuentas sin contraseña** (`POST /auth/register` sobre
  una fila con `password_hash IS NULL`) — ver §6 de
  [`auth-hardening.md`](./auth-hardening.md).
- **Sin envío real de correo:** los enlaces de reset se imprimen en el log.

⚠️ **Todo lo anterior deja de ser aceptable en el momento en que exista el
primer comprador real.** Cerrar el CORS a una allowlist de orígenes es el
primer punto de esa lista, y es trabajo de minutos: el origen ya es fijo
(`https://thepubmarket.com`). No dejarlo para después del lanzamiento.

## ⚠️ "Producción" hoy = Stripe en modo TEST

Desde el 2026-07-23, el checkout E2E funciona de punta a punta **incluso en
los Workers desplegados** (`thepubmarket-api`, `thepubmarket-web`): llaves y
webhook de Stripe subidos vía `wrangler secret put`, `sellers.stripe_connect_account_id`
poblado en D1 remoto. Pero son credenciales y cuentas **de modo test** — no se
mueve dinero real. No confundir "está desplegado" con "ya se puede cobrar de
verdad". Todo lo que falta para cruzar esa línea está en
[`checklist-go-live-real.md`](./checklist-go-live-real.md).

## TL;DR

Todo el núcleo transaccional está implementado en código y verificado por
build/lint, y el checkout ya no está mockeado en el frontend (TASK-004): llama
al `POST /checkout` real y redirige a Stripe. Probado E2E en local y en el
entorno desplegado, ambos en modo test.

Nuevo desde el 2026-07-01: **tiendas end-to-end** (commit `670fee4`) — galería
`/tiendas` + perfil Seller Hub `/tiendas/[slug]` conectados a D1 vía
`GET /sellers`, con 5 tiendas seedeadas e inventario repartido. Desplegado a
producción (D1 remota + api + web).

Nuevo desde el 2026-07-04 (2): **Mis Compras** (`/compras`) — el comprador ve
sus órdenes con tienda (nombre + verificada), estado derivado, timeline con
fechas y **guía de rastreo copiable**. `GET /orders` ahora devuelve
`{items: BuyerOrder[]}` (sin comisión — info solo del vendedor); líneas
enriquecidas con cond/set/imagen vía JOIN a inventory (null si el listing
murió). Link "Mis compras" en el header con sesión. `GET /orders/:id`
(checkout/success) intacto. Desplegado a producción.

Nuevo desde el 2026-07-04: **Panel del Vendedor** (`/panel`) end-to-end —
autoservicio de inventario (alta vía Scryfall, precio/cantidad inline, pausa) y
órdenes con envío (Pagada → Enviada con guía → Entregada). API `/seller/*` con
`sellerAuth` (sesión email+contraseña + `sellers.user_id`). Migración
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

Entrypoint único de dev: `pnpm dev:up` (= `bash scripts/dev.sh`) → instala deps,
crea `.env`, aplica migraciones + seed de D1 local, y levanta los servicios del
marketplace (`pnpm dev` filtra el workspace `@thepubmarket/pitch` — el pitch
deck interno ya no arranca con `dev:up`; corre por separado con
`pnpm --filter @thepubmarket/pitch dev`, puerto 8788).

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
- **Auth de comprador/vendedor** (email+password + sesión en KV, ver sección
  arriba): `apps/api/src/routes/auth.ts`, `apps/api/src/lib/auth.ts`,
  `apps/web/src/app/[locale]/login/`, `register/`, `auth/forgot-password/`,
  `auth/reset-password/`
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

1. **Ir a modo live de verdad.** TASK-001/002/003/004 cerraron el flujo
   completo en modo test (cuenta plataforma, onboarding del ancla, secrets,
   checkout real). Falta todo lo de
   [`checklist-go-live-real.md`](./checklist-go-live-real.md): onboarding live
   de Stripe (test y live son cuentas separadas, no hay migración automática),
   dominio propio, envío real de email, Cloudflare Access, legal/fiscal.
2. ~~**Bug real, bloqueante para live (TASK-013)**~~ **Resuelto 2026-07-23.**
   `payment_intent.payment_failed` ya no cancela la orden ni libera el hold
   (solo se loguea); la cancelación real solo ocurre en
   `checkout.session.expired`. Verificado que un pago exitoso tras reintento
   en la misma Checkout Session ahora sí liquida la orden y decrementa
   inventario, y que el caso normal (rechazo sin retry, sesión expira) sigue
   cancelando como antes. Ver
   [`validacion-e2e-task-005.md`](./validacion-e2e-task-005.md).
3. **Estados items/redirigiendo del `/cart`** solo se ven con sesión iniciada
   (sin usuario, el carrito muestra el auth gate). Verificados por build.
4. **Gap de datos seller en el carrito:** `InventoryItem` (en `packages/shared`)
   sigue sin exponer nombre/verificación del vendedor; la fila "Vendido por" del
   carrito se omite. Ahora es fácil de cerrar: existe `GET /sellers` y el contrato
   `Seller` — falta decidir si se hace join en catálogo o lookup en el front.

---

## Gotchas conocidos

- **Puertos de wrangler:** `api` usa los defaults (8787 / inspector 9229). El
  worker `pitch` se fijó a `8788` / inspector `9230` en su `wrangler.jsonc` para
  no chocar, pero `pnpm dev` (y por lo tanto `dev:up`) ya NO lo levanta —
  root `package.json` filtra `@thepubmarket/pitch` del `turbo run dev`. Si
  necesitas correrlo, hazlo aparte: `pnpm --filter @thepubmarket/pitch dev`.
  Si agregas otro Worker al `dev` general, asígnale puertos propios o
  `dev:up` fallará con "Address already in use".
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
