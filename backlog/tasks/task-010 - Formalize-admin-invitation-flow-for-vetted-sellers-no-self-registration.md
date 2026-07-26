---
id: TASK-010
title: Formalize admin invitation flow for vetted sellers (no self-registration)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-22 22:32'
updated_date: '2026-07-26 03:20'
labels:
  - 'epic:identity'
  - feature
milestone: m-1
dependencies: []
modified_files:
  - packages/db/src/schema.ts
  - packages/db/src/index.ts
  - apps/api/migrations/0006_perpetual_the_liberteens.sql
  - apps/api/src/middleware/admin-auth.ts
  - apps/api/src/routes/admin.ts
  - apps/api/src/routes/auth.ts
  - docs/ingenieria/invitacion-sellers.md
  - docs/ingenieria/README.md
  - docs/ingenieria/estado-actual.md
  - docs/ingenieria/handoff.md
  - docs/ingenieria/checklist-go-live-real.md
priority: medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today, linking a seller account to a login email happens via a raw internal endpoint (POST /admin/sellers/:id/link with an x-admin-key header, see docs/ingenieria/estado-actual.md). This is functional but not a proper, auditable admin workflow. Per CLAUDE.md's 'vetted sellers / no self-registration' rule, this must remain admin-invite-only — this task formalizes that into a real, auditable flow (not necessarily a full UI, but at minimum logging/audit trail and guardrails), and must explicitly prevent any path to public self-registration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Admin invite-and-link action (building on POST /admin/sellers/:id/link) is auditable — who invited whom, when, recorded
- [x] #2 Explicit safeguards confirmed preventing any public self-registration path for sellers
- [x] #3 Documented process for how a new vetted seller gets invited end-to-end (admin action -> seller receives access)
- [x] #4 x-admin-key protection reviewed and confirmed adequate, or upgraded if found insufficient
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan (recorded 2026-07-25)

Research findings that shape the plan:
- `POST /admin/sellers/:id/link` (apps/api/src/routes/admin.ts:89) is the only invite mechanism. It creates the user if missing, sets `sellers.user_id`, and records nothing. No caller in the repo (scripts/load-inventory.mjs only hits `POST /admin/inventory`), so adding a required actor header breaks nothing.
- `adminAuth` (apps/api/src/middleware/admin-auth.ts) is fail-closed but compares the key with `!==` (non-constant-time) and has no throttling on failed attempts.
- Seller identity = a row in `sellers` with `user_id`. `POST /auth/register` hardcodes `role: 'buyer'` and zod strips unknown fields, so no public path can mint a seller. No public route inserts into `sellers`.

### 1. AC#1 — auditable invite (D1 append-only table)
- `packages/db/src/schema.ts`: new `seller_invitations` table — `id`, `seller_id` (FK cascade), `email`, `user_id` (FK set null), `invited_by`, `ip`, `note`, `created_at`. Append-only: every link/re-link writes a row, never updates. Export row types from `packages/db/src/index.ts`.
- Generate migration `0006_*` with `pnpm -F @thepubmarket/api db:generate` (drizzle-kit), apply locally.
- `POST /admin/sellers/:id/link`: require an `x-admin-actor` header (validated as email) = who performed the invite; write the audit row in the same handler; return the invitation id.
- New `GET /admin/sellers/:id/invitations` — reading back the trail is what makes it auditable.
- Honest limitation to document: with a shared key, `x-admin-actor` is attribution *by convention*, not cryptographic. Cryptographic attribution needs Access service tokens on `/admin/*` (follow-up, needs dashboard).

### 2. AC#4 — admin-key hardening
- Constant-time comparison (fixed-work XOR over the encoded bytes) to remove the timing oracle.
- KV rate limit on failed admin auth by IP, reusing `checkRateLimit` (`lib/rate-limit.ts`, SESSIONS binding) → 429 after N failures/window. Successful requests don't consume budget.
- `console.warn` (not fail-closed) when `ADMIN_API_KEY` is shorter than 32 chars — failing closed on a weak key would lock the operator out of prod admin.
- Write the review verdict in the runbook: adequate as interim for a single operator; the durable fix is Access service tokens.

### 3. AC#2 — safeguards against self-registration
- Review-and-record, plus curl probes proving it: unauthenticated and buyer-session calls to every seller-touching path fail; `/auth/register` can't set `role` or create a `sellers` row.
- Reinforce with explicit code comments where the invariant lives (schema `sellers`, `auth.ts` register).

### 4. AC#3 — end-to-end runbook
- `docs/ingenieria/invitacion-sellers.md` (Spanish, matching its siblings in docs/ingenieria): full path from "we decided to invite store X" → create the `sellers` row → link the email → seller registers a password → Stripe Connect onboarding (TASK-007) → `status='active'` via `account.updated` webhook → `/panel`. Includes the audit query and the AC#2 verification matrix.
- Cross-link from `estado-actual.md`, `handoff.md`, `checklist-go-live-real.md`.

### Verification
`pnpm -F @thepubmarket/api typecheck`, `pnpm lint`, `pnpm -F @thepubmarket/api build`, plus live curl against local `wrangler dev` with a migrated local D1 (invite → audit row → read-back → rate limit → self-registration probes). No browser testing.

### Non-goals
Admin UI, changes to `POST /admin/inventory`, Access service tokens in the dashboard (needs Cloudflare account access — same blocker as TASK-009).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verificación en vivo contra `wrangler dev` local con D1 migrada (2026-07-25). Evidencia por AC:

**AC#1 — invitación auditable.** `POST /admin/sellers/:id/link` sin `x-admin-actor` → `400 missing_admin_actor`; con actor no-email → `400`; con actor válido → `200` + `invitationId`. Segunda invitación al mismo seller con otro actor/email → `GET /admin/sellers/:id/invitations` devuelve **las dos** filas (append-only confirmado, orden desc), cada una con `invitedBy`, `email`, `userId`, `ip`, `note`, `createdAt`. Seller inexistente → `404`.

**AC#2 — anti auto-registro.** Sondeos: link sin clave → 401; con clave incorrecta → 401; bitácora sin clave → 401; `POST /auth/register` con `role:"admin"` y `sellerId` inyectados → usuario creado con `role='buyer'` y campos extra ignorados; ese usuario contra `GET /seller/inventory` y `POST /seller/connect/onboarding-link` → `403 not_a_seller`; `POST /sellers` → `404` (no existe la ruta). Query final en D1: 0 filas de `sellers` asociadas al usuario del sondeo.

**AC#4 — rate limit de fallos.** 12 intentos con clave incorrecta desde la misma IP → 401 hasta agotar el presupuesto de 10/15 min (el corte cayó en el intento 8 porque los sondeos previos ya habían gastado 3 fallos en la misma ventana), luego `429`. Inmediatamente después, la clave correcta → `200`: los fallos no bloquean al operador legítimo.

**Limpieza:** los datos de prueba se borraron de la D1 local y se restauró el `user_id` original del seller ancla (`00000000-0000-4000-8000-00000000e001`) — el link de prueba lo había repuntado.

**Build/lint:** `pnpm lint` (biome, 149 archivos), `pnpm -F @thepubmarket/api typecheck`, `pnpm -F @thepubmarket/api build` (wrangler dry-run) y `pnpm -F @thepubmarket/web typecheck`, todos limpios.

**Decisiones de diseño registradas:**
- Tabla enfocada `seller_invitations` en vez de un `admin_audit_log` genérico: los AC piden trazabilidad de la invitación, y una tabla con columnas propias (`seller_id`, `email`, `invited_by`) se consulta sin parsear JSON. Un log genérico se puede agregar después si aparecen más acciones admin que auditar.
- No se creó endpoint de alta de sellers: el alta es rara, deliberada y de bajo volumen; SQL documentado en el runbook es menos superficie de ataque que una ruta más en `/admin`.
- Clave débil solo advierte (no falla cerrado): fallar cerrado por longitud dejaría al operador fuera del admin de producción sin aviso.
- Migración `0006` puramente aditiva (CREATE TABLE + 2 índices), sin operaciones destructivas ni recreación de tablas (patrón que D1 rechaza).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Qué cambió

Formaliza la invitación de vendedores vetted: la acción sigue siendo el mismo endpoint, pero ahora exige responsable, deja bitácora y corre detrás de un gate endurecido.

### Bitácora de auditoría (AC#1)
- Nueva tabla D1 `seller_invitations` (`packages/db/src/schema.ts`, migración `0006_perpetual_the_liberteens.sql`, puramente aditiva): seller, email, usuario, `invited_by`, IP, nota, fecha. **Append-only** — re-vincular agrega una fila, nunca pisa el historial.
- `POST /admin/sellers/:id/link` ahora exige el header `x-admin-actor` (formato email) y escribe la fila de bitácora después de aplicar el vínculo (si el update falla, no queda registrada una invitación que no ocurrió).
- Nuevo `GET /admin/sellers/:id/invitations` — una bitácora que no se puede leer no es auditoría.

### Endurecimiento de `x-admin-key` (AC#4)
`apps/api/src/middleware/admin-auth.ts`:
- Comparación en **tiempo constante** sobre el SHA-256 de cada valor (comparar digests de longitud fija evita filtrar también el largo de la clave). Antes era `!==` sobre strings.
- **Rate limit de intentos fallidos por IP** en KV (10 / 15 min → `429`), reusando `lib/rate-limit.ts` y el binding `SESSIONS`. Los aciertos no consumen presupuesto, así que el operador legítimo no se autobloquea.
- `console.warn` si la clave mide menos de 32 caracteres — advertencia, no fail-closed, para no dejar al operador fuera del admin de producción sin aviso.

### Salvaguardas anti auto-registro (AC#2)
Verificadas por sondeo, no por lectura de código, y documentadas como matriz repetible. Se reforzó dónde vive la invariante con comentarios en `schema.ts` (`sellers`), `routes/admin.ts` y `routes/auth.ts` (`register` fija `role: 'buyer'` y zod descarta claves desconocidas).

### Runbook (AC#3)
`docs/ingenieria/invitacion-sellers.md`: proceso completo (vetting → alta de la fila → vínculo auditado → el vendedor pone contraseña → onboarding de Connect → `account.updated` hace `invited → active` → `/panel`), queries de la bitácora, matriz de sondeos y el veredicto de la revisión de `x-admin-key`. Cross-links desde `README.md`, `estado-actual.md`, `handoff.md` y `checklist-go-live-real.md`.

## Verificación
`wrangler dev` local con D1 migrada: invitación válida/inválida, append-only en re-vinculación, lectura de la bitácora, 404 de seller inexistente, 8 sondeos de auto-registro y el corte del rate limit a 429 con recuperación del operador legítimo. Datos de prueba borrados y `user_id` del seller ancla restaurado. `pnpm lint`, typecheck de api y web, y `build` de api (wrangler dry-run) limpios.

## Riesgos y seguimiento
- **Migración pendiente en remoto:** `pnpm -F @thepubmarket/api db:migrate:remote` debe correrse antes de desplegar el API, o `POST /admin/sellers/:id/link` fallará al insertar en una tabla inexistente.
- **Cambio incompatible (menor):** el link ahora exige `x-admin-actor`. Ningún caller en el repo lo usa (`scripts/load-inventory.mjs` solo llama a `POST /admin/inventory`), pero cualquier curl guardado a mano hay que actualizarlo.
- **Atribución por convención, no criptográfica:** con clave compartida, `invited_by` lo declara el propio operador. El cierre real es `/admin/*` detrás de Cloudflare Access con **service tokens** — bloqueado por acceso al dashboard, igual que TASK-009. Documentado en el runbook §4 y en el checklist de go-live.
- No se tocó `POST /admin/inventory` ni se agregó UI de admin (fuera de alcance).
<!-- SECTION:FINAL_SUMMARY:END -->
