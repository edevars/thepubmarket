---
id: TASK-009
title: Put seller portal /panel behind Cloudflare Access / Zero Trust
status: Done
assignee: []
created_date: '2026-07-22 22:32'
updated_date: '2026-07-29 00:20'
labels:
  - 'epic:seller-portal'
  - feature
milestone: m-1
dependencies: []
modified_files:
  - apps/web/src/lib/cloudflare-access.ts
  - apps/web/src/lib/panel-access-guard.ts
  - apps/web/src/lib/cloudflare-access.test.ts
  - apps/web/src/lib/panel-access-guard.test.ts
  - apps/web/src/middleware.ts
  - apps/web/wrangler.jsonc
  - apps/web/.env.example
  - apps/api/wrangler.jsonc
  - apps/api/src/middleware/seller-auth.ts
  - docs/ingenieria/cloudflare-access-panel.md
  - docs/ingenieria/checklist-go-live-real.md
priority: high
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The seller portal /panel already has application-level auth (sellerAuth middleware: magic-link session + sellers.user_id, see apps/api/src/middleware/seller-auth.ts and PanelShell guard in apps/web/src/components/panel/). Per CLAUDE.md's security stack, admin/seller panels should additionally sit behind Cloudflare Access / Zero Trust as a network-level layer, not rely solely on application auth. This is additive hardening, not a replacement for the existing magic-link flow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /panel/* routes gated by Cloudflare Access in addition to existing sellerAuth magic-link check
- [x] #2 Access policies defined for which identities (invited/vetted sellers) may reach the portal
- [x] #3 Local dev workflow for testing /panel without fighting Access documented (e.g. bypass or local Access emulation)
- [x] #4 No regression to existing PanelShell guard / magic-link session behavior
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Code shipped on this branch (uncommitted as of 2026-07-24):
- apps/web/src/lib/cloudflare-access.ts — verifyAccessJwt() via jose, real JWKS verification (aud/iss/exp), never throws.
- apps/web/src/lib/panel-access-guard.ts — guardPanelAccess(), gates /panel and /{locale}/panel. Fail-closed 503 in production if CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD unset; dev-only ACCESS_LOCAL_BYPASS escape hatch (no-op in production).
- apps/web/src/middleware.ts — composes the guard with the existing next-intl middleware; i18n behavior on non-/panel routes unchanged.
- Test infra bootstrapped from scratch for apps/web (vitest — repo had none before): 18 tests across cloudflare-access.test.ts (JWT verification: valid/expired/wrong-aud/wrong-iss/key-not-found/malformed/JWKS-fetch-failure) and panel-access-guard.test.ts (path matching, bypass, fail-closed config, 401/403/pass-through). Verified live against the actual built Worker via `opennextjs-cloudflare build` + `wrangler dev` (not just unit tests).
- apps/api/src/middleware/seller-auth.ts — fixed stale "magic-link" docblock comment (actual mechanism is email+password, TASK-015).
- docs/ingenieria/cloudflare-access-panel.md — runbook: architecture reasoning (Access gates web /panel pages only, not the API, because cross-origin fetch() calls can't follow Access's hosted-login redirect), manual dashboard steps, workers.dev bypass gap this code closes, local dev workflow.
- docs/ingenieria/checklist-go-live-real.md updated.

REMAINING — cannot be done without Cloudflare account access:
- AC #1: create the Access Application(s) + Policy in the Zero Trust dashboard (allow-list of vetted seller emails), then fill real CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD into apps/web/wrangler.jsonc. Until this is done, the vars are empty placeholders.
- AC #2: policy identities (which vetted sellers) must be entered by hand in the dashboard per the runbook.

⚠️ DEPLOY-ORDER RISK: apps/web/wrangler.jsonc currently ships CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD as empty strings. Per the fail-closed design (intentional, mirrors admin-auth.ts), if this reaches production via Workers Builds auto-deploy on push to main BEFORE the dashboard Access Application is created and real values are filled in, ALL /panel requests will return 503 — including for The Pub Game Store, the current real seller. Do not merge/push to main until the dashboard step is done and wrangler.jsonc has real values, or deploy web separately after that step.

2026-07-28 — DESBLOQUEADO. El operador registró el dominio `thepubmarket.com` en Cloudflare y apuntó Custom Domains: apex → Worker `thepubmarket-web`, `api.thepubmarket.com` → Worker `thepubmarket-api`. Eso era el bloqueo real de AC#1/#2: una Access Application self-hosted exige una zona activa en la cuenta, y hasta hoy todo corría en `*.workers.dev`, que no es zona propia. (El toggle de Access para workers.dev existe pero protege el host completo — habría puesto la tienda pública entera detrás del login.)

AC#1/#2 cerrados. Dos Access Applications creadas por el operador sobre `thepubmarket.com`: `Panel del Vendedor (es)` → `/panel*` y `Panel del Vendedor (en)` → `/en/panel*`, ambas con la policy `Sellers vetted` (Allow / Include / Emails, lista explícita). Son dos y no una porque Access solo admite un wildcard entre cada par de diagonales.

Cambio de código requerido por las dos aplicaciones: cada una trae su propio AUD tag y `verifyAccessJwt` validaba contra un solo string. Ahora `aud` acepta `string | string[]` (jose da por válido si el claim coincide con cualquiera) y `guardPanelAccess` parte `CF_ACCESS_AUD` por comas, descartando vacíos — una lista que queda vacía se trata como sin configurar y mantiene el fail-closed. +5 tests (23 en apps/web).

Los AUD no se sacaron del dashboard: vienen dentro del JWT de `meta` del redirect a Access, que es público. Documentado en el runbook como atajo.

Verificación en producción (Access ya interceptando, antes de desplegar el código): `/panel`, `/en/panel` y `/panel/inventario` → 302 al login de `thepubmarket.cloudflareaccess.com`; `/`, `/login` y `/compras` → 200. La tienda pública no quedó tocada.

Verificación del guard contra el Worker real (`opennextjs-cloudflare build` + `wrangler dev`, no solo unit tests): `/panel`, `/en/panel` y `/panel/connect/return` sin header → 401; `/panel/inventario` con token basura → 403; `/`, `/login`, `/compras`, `/catalog` → 200. Importante: `ACCESS_LOCAL_BYPASS=true` estaba presente en el entorno y fue no-op, lo que confirma en vivo la protección de que el bypass de desarrollo no aplica en un build de producción.

Runbook actualizado a la realidad: el flujo de dashboard cambió (`Access controls → Applications → Create new application → Self-hosted and private`), la sección §2 documenta las dos aplicaciones y la policy, y se corrigió §3 — decía que Access 'nunca se ata a workers.dev', cuando lo correcto es que workers.dev no es zona propia y por eso no admite una Access Application self-hosted (el toggle host-wide sí existe, pero no sirve para este caso).

PENDIENTE del operador, fuera de esta tarea: (a) `NEXT_PUBLIC_API_URL=https://api.thepubmarket.com` como variable del paso de build en Workers Builds — se inlina en build time, no se lee de wrangler.jsonc; (b) mover el webhook de Stripe a `https://api.thepubmarket.com/webhooks/stripe`, hoy apunta a workers.dev; (c) deshabilitar los subdominios workers.dev DESPUÉS de (b), o los pagos dejan de confirmarse.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Qué quedó

`/panel` protegido por Cloudflare Access como capa de red **adicional** a
`sellerAuth` (API) y al guard cliente de `PanelShell`, ninguno de los dos
tocado.

**Configuración (dashboard, del operador):** dominio `thepubmarket.com` como
zona en Cloudflare, con Custom Domains apuntando al Worker web (apex) y al de
API (`api.thepubmarket.com`). Dos Access Applications —`/panel*` y
`/en/panel*`— compartiendo la policy `Sellers vetted` (Allow / Include /
Emails, lista explícita, no regla por dominio).

**Código:** `verifyAccessJwt` valida el JWT del header `Cf-Access-Jwt-Assertion`
contra el JWKS real del team (firma, `aud`, `iss`, expiración) y nunca lanza;
`guardPanelAccess` compone con el middleware de next-intl sin alterar i18n en
el resto de las rutas. Sin header → 401, JWT inválido → 403, sin configuración
y en producción → 503 fail-closed.

## Lo que costó más de lo previsto

**El bloqueo real no era el dashboard, era el dominio.** Una Access Application
self-hosted exige una zona activa en la cuenta, y el proyecto corría entero en
`*.workers.dev`, que no lo es. El toggle de Access que sí existe para
workers.dev protege el host completo — habría puesto la tienda pública detrás
del login. Sin dominio propio, esta tarea no se podía cerrar.

**Dos aplicaciones, no una.** Access admite un solo wildcard entre cada par de
diagonales, y `es` es el locale default sin prefijo, así que `/panel*` y
`/en/panel*` no caben en un patrón único. Eso obligó a un cambio de código:
cada aplicación trae su propio AUD tag y `verifyAccessJwt` validaba contra un
solo string. Ahora `aud` acepta `string | string[]` y `guardPanelAccess` parte
`CF_ACCESS_AUD` por comas; una lista que queda vacía se trata como sin
configurar y conserva el fail-closed.

## Verificación

En producción, con Access ya interceptando: `/panel`, `/en/panel` y
`/panel/inventario` → 302 al login de `thepubmarket.cloudflareaccess.com`;
`/`, `/login` y `/compras` → 200.

Contra el Worker real (`opennextjs-cloudflare build` + `wrangler dev`, no solo
unit tests): las tres rutas de panel sin header → 401, con token basura → 403,
y la tienda pública en 200. En esa corrida `ACCESS_LOCAL_BYPASS=true` estaba
presente en el entorno y **fue no-op**, lo que confirma en vivo que el escape
hatch de desarrollo no aplica en un build de producción.

23 tests en `apps/web` (5 nuevos para el caso multi-audiencia), más lint,
typecheck y build en verde.

## Pendiente del operador antes de desplegar

1. `NEXT_PUBLIC_API_URL=https://api.thepubmarket.com` como variable del paso de
   build en Workers Builds — se inlina en build time, no se lee de
   `wrangler.jsonc`.
2. Mover el webhook de Stripe a `https://api.thepubmarket.com/webhooks/stripe`.
3. Deshabilitar los subdominios workers.dev **después** del punto 2, o los
   pagos dejan de confirmarse.

Orden de deploy: API primero (su `WEB_BASE_URL` ya apunta al dominio nuevo),
luego web.
<!-- SECTION:FINAL_SUMMARY:END -->
