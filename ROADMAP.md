# ROADMAP.md — The Pub Market

Plan de construcción por fases. Pensado para un solo desarrollador, priorizando
llegar a transacciones reales lo antes posible y posponiendo lo sofisticado (IA,
búsqueda externa) hasta que el catálogo lo justifique.

Léelo junto con `CLAUDE.md`. Toda decisión debe respetar la restricción de **no
custodia de fondos** (Stripe Connect con destination/direct charges + application
fee; los fondos nunca aterrizan en el balance de la plataforma).

---

## Fase 0 — Fundaciones ✅ (completada)

Esqueleto técnico sobre el que se construye todo. Sin features de producto.

- Monorepo (Worker/API + app Next.js), TypeScript estricto, linter/formatter.
- Worker con Hono desplegable + health check con conectividad a D1.
- Recursos Cloudflare: D1, KV, R2 con bindings configurados.
- Esquema inicial de D1 (migración versionada): `users`, `sellers`, `inventory`,
  `orders`, `order_items`. Incluye `connect_account_id` por seller. Precios en
  enteros (centavos MXN).
- App Next.js mínima en Pages consumiendo `/health`. i18n preparado (ES default,
  EN).
- CI/CD: deploy de Worker y Pages, previews por rama.

**Criterio de cierre:** clonar repo, seguir README, crear recursos, desplegar y
ver el health check en verde.

---

## Fase 1 — Catálogo y vendedor único ✅ (completada)

The Pub Game Store como ÚNICO seller. Sin checkout ni pagos. Objetivo: ver el
catálogo real funcionando y validar el modelo de datos de inventario antes de
introducir dinero.

> **Estado (2026-06-26):** catálogo real end-to-end funcionando (18 singles MTG
> de prueba sembrados). Frontend bilingüe con home, listado, filtros, ficha y
> estados. Imágenes de Scryfall renderizadas. Ver `docs/ingenieria/estado-actual.md`.

- Integración con Scryfall API como fuente de verdad de cartas MTG (cliente,
  respeto de rate limits, cache en KV de respuestas inmutables).
- Imágenes: referenciar URLs de Scryfall; TODO de migración a R2 más adelante.
- Modelo de inventario en D1 (extender esquema con migración): single físico
  ligado a carta de Scryfall, con condición (NM/LP/MP/HP/DMG), idioma,
  foil/no-foil, precio (centavos MXN), cantidad, seller_id, estado.
- Carga de inventario (admin interno) protegida (TODO Cloudflare Access si aún
  no está).
- API pública de catálogo: listado con paginación, búsqueda básica por D1 +
  índices, detalle de item.
- Frontend bilingüe: home, listado con búsqueda/filtros, ficha de item, estados
  (vacío/carga/sin resultados). Sin carrito ni checkout.

**Sub-etapa de diseño:** importar diseño de Claude Design y mockear el frontend
de catálogo con datos de prueba (capa de datos aislada), antes de cablear a la
API real.

---

## Fase 2 — Núcleo transaccional 🔄 (en curso — código completo, falta Stripe vivo)

La fase más delicada; concentra el riesgo técnico. Llegar aquí a la primera venta
real es el objetivo del roadmap. Implementar en orden:

- ✅ Reserva de inventario con **Durable Objects** (un single es único; no se puede
  vender dos veces). Carrito reserva con TTL; si el pago no se completa, libera.
  → `apps/api/src/durable-objects/inventory-reservation.ts`
- ✅ Checkout con **Stripe Connect** (destination/direct charge + application fee).
  El dinero nunca pasa por la plataforma. → `apps/api/src/routes/checkout.ts`,
  `apps/api/src/lib/stripe.ts`
- ✅ **Webhooks en Workers** con verificación de firma e idempotencia (no opcional).
  → `apps/api/src/routes/webhooks.ts` (+ tabla `webhook_events`, migración 0002)
- ✅ Workflow durable post-pago (`payment_intent.succeeded`): confirma orden,
  descuenta inventario definitivo, notifica. Reintentos idempotentes.
  → `apps/api/src/workflows/post-payment.ts`
- ✅ Auth de comprador (magic link + sesión en KV) y UI transaccional (login,
  carrito, checkout). → `apps/api/src/routes/auth.ts`, `apps/web/src/app/[locale]/`
- ✅ Rediseño del carrito (Cart.dc.html): drawer + estados items/vacío/sin sesión/
  redirigiendo. **Checkout mockeado** mientras Stripe no esté configurado vivo.
  → `apps/web/src/components/cart/`, `apps/web/src/app/[locale]/cart/page.tsx`

### ⏳ Pendiente para cerrar la fase

1. **Configurar Stripe Connect vivo** (el bloqueo real):
   - Crear cuenta de plataforma + activar Connect (Express).
   - Onboarding de The Pub Game Store como primera Connect account; poblar
     `sellers.connect_account_id` (hoy null/placeholder).
   - Secrets reales: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (vía `.dev.vars`
     local y `wrangler secret` en prod).
2. **Quitar el mock de checkout** del frontend: reconectar `createCheckout`
   (`apps/web/src/lib/client-api.ts`, intacto) en `cart/page.tsx`, reemplazando el
   redirect simulado. Apuntar `NEXT_PUBLIC_API_URL` al API correcto.
3. **Probar el flujo real e2e** en modo test de Stripe: pago OK, pago fallido,
   webhook reintentado, liberación de reserva por TTL.
4. **Gap de datos:** `InventoryItem` no expone nombre/verificación de seller; la
   fila "Vendido por" del carrito se omite. Decidir si se añade al contrato.

**Criterio de cierre:** transacción real de extremo a extremo confiable,
incluyendo pago fallido y webhook reintentado.

> **Estado (2026-06-26):** todo el núcleo transaccional está implementado en
> código y verificado por build/lint. La experiencia de compra corre con checkout
> **mockeado** (sin tocar fondos). Falta exclusivamente la configuración viva de
> Stripe Connect para transaccionar de verdad. Detalle y handoff en
> `docs/ingenieria/estado-actual.md` y `docs/ingenieria/handoff.md`.

---

## Fase 3 — Onboarding de sellers e identidad

El marketplace deja de ser tienda única y pasa a multi-seller (vetted, por
invitación, sin auto-registro).

- Connect onboarding (Express maneja KYC y obligaciones fiscales del seller).
- Portal de vendedor tras Cloudflare Access (gestión de inventario, ver payouts).
- Autenticación de usuarios y sesiones en KV.
- Turnstile en registro y checkout.

---

## Fase 4 — Operación y confianza

Lo que hace el marketplace usable de verdad.

- Gestión de órdenes (comprador y seller), estados de envío, incidencias.
- Política de devoluciones (el refund también fluye vía Stripe sin que la
  plataforma toque fondos).
- Panel admin para curación y moderación.
- Reportes fiscales básicos para sellers.

---

## Fase 5 — Escala selectiva

No construir antes de necesitarlo (cuando aparezca el dolor).

- Servicio de búsqueda externo cuando D1 se quede corto (probable única pieza
  fuera del ecosistema Cloudflare).
- **Workers AI** para detección de condición de cartas y labeling de imágenes.
- **Vectorize** para búsqueda por similitud y recomendaciones.
- Migración de imágenes a R2.
- Más TCG más allá de MTG, una vez pulido el flujo de MTG.

---

## Principios transversales

1. **No custodia de fondos.** Destination/direct charges + application fee.
   Nunca separate charges and transfers. Si una decisión implica tocar fondos,
   detente y señálalo.
2. **Llegar a la venta real rápido.** El orden está pensado para transaccionar en
   Fase 2, no en el mes seis. Lo no indispensable se pospone.
3. **Mantenible por una sola persona.** Costo operativo y carga de mantenimiento
   guían cada decisión. Simple y durable sobre sofisticado.
4. **Cloudflare-first.** Nada fuera del ecosistema sin justificación clara.
5. **Implicaciones regulatorias siempre marcadas** (Ley Fintech, custodia, CNBV).
   El análisis legal/fiscal no sustituye asesoría formal.