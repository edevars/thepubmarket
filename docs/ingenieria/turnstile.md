# Turnstile — anti-bot en auth y checkout

> Cómo está wireado Cloudflare Turnstile (TASK-012), qué llaves lleva cada
> ambiente y qué hacer cuando algo devuelve `403 turnstile_failed`.

**Creado:** 2026-07-28 (TASK-012).

---

## 1. Qué protege

| Endpoint | Por qué |
|---|---|
| `POST /auth/register` | alta masiva de cuentas basura |
| `POST /auth/login` | fuerza bruta / credential stuffing |
| `POST /auth/password/forgot` | dispara envío de correo — abuso más barato del set |
| `POST /auth/password/reset` | fuerza bruta del token de reset |
| `POST /checkout` | reserva inventario en Durable Objects y crea sesiones en Stripe |

No protege el catálogo público, `/health`, `/auth/me`, `/auth/logout`, ni el
Panel del Vendedor (`/seller/*`, que va detrás de sesión + Cloudflare Access) ni
`/admin/*` (`ADMIN_API_KEY`). Los webhooks de Stripe **no llevan Turnstile**: no
son tráfico de navegador y ya están autenticados por firma.

Turnstile **complementa**, no reemplaza, el rate limiting en KV
(`apps/api/src/lib/rate-limit.ts`, ver [`auth-hardening.md`](./auth-hardening.md)).
Los códigos son distintos a propósito: `403 turnstile_failed` = anti-bot,
`429 rate_limited` = contador de KV.

---

## 2. Cómo viaja el token

```
navegador                              Worker de API                Cloudflare
 widget → token ──header───────────────→ turnstileGuard ──siteverify──→ ✓/✗
          cf-turnstile-response
```

- El widget se renderiza **explícitamente** (`api.js?render=explicit`) en modo
  `execution: 'execute'` + `appearance: 'interaction-only'`: no se dibuja nada ni
  se gasta un reto hasta que el usuario envía el formulario, y solo aparece UI si
  Cloudflare decide que hay que resolver algo.
- El token es de **un solo uso y de vida corta**. Por eso se pide uno nuevo en
  cada submit (`useTurnstile().getToken()`) en vez de al cargar la página: elimina
  de raíz los errores `timeout-or-duplicate`.
- Viaja en el **header** `cf-turnstile-response`, no en el body — así ningún tipo
  de request de `packages/shared` tuvo que cambiar y el mecanismo es el mismo para
  auth y para checkout.
- La verificación (`siteverify`) ocurre **solo en el Worker**. Nunca desde el
  navegador: el secret no puede salir del servidor.

### Archivos

| Archivo | Rol |
|---|---|
| `apps/api/src/lib/turnstile.ts` | `verifyTurnstile()` — llamada a siteverify |
| `apps/api/src/middleware/turnstile.ts` | `turnstileGuard` — el gate de Hono |
| `apps/web/src/lib/turnstile.ts` | site key, carga del script, helper de header |
| `apps/web/src/components/security/useTurnstile.ts` | hook del widget (`getToken()`) |

---

## 3. Llaves por ambiente

El **site key es público** (se inlina en el bundle del cliente); el **secret solo
vive en el Worker de la API**.

| | site key (web, build time) | secret (API, runtime) |
|---|---|---|
| Local | `.env` → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `.dev.vars` → `TURNSTILE_SECRET_KEY` |
| Producción | `apps/web/.env.production` (commiteado) | `wrangler secret put TURNSTILE_SECRET_KEY` |

En local se usan las **llaves de prueba de Cloudflare**, que corren el mismo
código que producción sin bloquear el desarrollo:

| Llave de prueba | Efecto |
|---|---|
| site `1x00000000000000000000AA` | siempre aprueba (visible) |
| site `2x00000000000000000000AB` | siempre aprueba (invisible) |
| site `1x00000000000000000000BB` | siempre bloquea |
| site `3x00000000000000000000FF` | fuerza reto interactivo |
| secret `1x0000000000000000000000000000000AA` | siempre aprueba |
| secret `2x0000000000000000000000000000000AA` | siempre rechaza |

> **Las dos llaves van juntas.** Un site key sin secret = cero protección (la API
> deja pasar todo, con un `console.warn` por request). Un secret sin site key =
> **todo request se rechaza con 403**, porque el navegador nunca manda el header.
> Al rotar o desplegar, mover ambas.

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` se inlina en **build time** (igual que
`NEXT_PUBLIC_API_URL`): cambiarla exige reconstruir y redesplegar `apps/web`. Un
`var` de wrangler no sirve.

---

## 4. Comportamiento sin secret configurado

Si `TURNSTILE_SECRET_KEY` no existe en el Worker, `verifyTurnstile()` **deja
pasar** el request y escribe:

```
turnstile: TURNSTILE_SECRET_KEY is unset — skipping verification
```

Es deliberado: mantiene usables `wrangler dev` y los flujos con `curl` de esta
carpeta. **En producción el secret es obligatorio** — está en
[`checklist-go-live-real.md`](./checklist-go-live-real.md). Un `grep` de ese
warning en los logs del Worker desplegado es la forma de detectar que se olvidó.

En cualquier otro escenario el gate **falla cerrado**: token ausente, token
rechazado, siteverify con error HTTP o inalcanzable → `403 turnstile_failed`.

---

## 5. Alta del widget (una vez por ambiente)

**Widget en uso** (creado 2026-07-28): nombre `thepubmarket`, modo `managed`,
`clearance_level: no_clearance`, site key `0x4AAAAAAEAZkoBZ4yQKkn4x`, dominios
`thepubmarket.com`, `www.thepubmarket.com`, `localhost`, `127.0.0.1`.

> Los hosts `*.workers.dev` **no** están registrados: un preview servido desde
> ahí falla la verificación. Es coherente con el plan de deshabilitar esos
> subdominios (ver [`checklist-go-live-real.md`](./checklist-go-live-real.md));
> si alguna vez hace falta un preview funcional, agregar el hostname con PUT.

Para crear uno nuevo — Dashboard: **Turnstile → Add widget**, modo `Managed`,
dominios `thepubmarket.com`, `localhost`, `127.0.0.1`.

Por API (requiere un API token con `Account.Turnstile:Edit` — el token OAuth de
`wrangler login` **no** trae ese scope):

```bash
curl -sX POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/challenges/widgets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"thepubmarket","mode":"managed","domains":["thepubmarket.com","localhost","127.0.0.1"]}'
```

La respuesta trae `sitekey` (→ `.env.production`) y `secret` (→ `wrangler secret
put TURNSTILE_SECRET_KEY`, nunca a un archivo del repo).

Para cambiar los dominios de un widget existente se usa **PUT**, no PATCH (PATCH
devuelve `10405 Method not allowed`).

---

## 6. Diagnóstico

| Síntoma | Causa probable |
|---|---|
| Todo devuelve `403 turnstile_failed` | secret en la API sin site key en el build de web |
| Nadie es bloqueado y el log repite `TURNSTILE_SECRET_KEY is unset` | falta `wrangler secret put` |
| `error-codes: invalid-input-secret` | secret de prueba contra site key real (o viceversa) |
| `error-codes: timeout-or-duplicate` | se reusó un token; `getToken()` ya hace `reset()` antes de cada `execute()` |
| El widget no aparece nunca | correcto: `interaction-only` solo se muestra si hay reto |
| `403` en local con `curl` | el gate está activo (`.dev.vars` trae el secret de prueba); manda `-H 'cf-turnstile-response: XXXX.DUMMY.TOKEN.XXXX'` |

Cada rechazo deja en el log del Worker:

```
turnstile: rejected POST /auth/login (missing-input-response)
```

---

## 7. Verificación rápida

```bash
# rechaza sin token
curl -s -X POST http://localhost:8787/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.mx","password":"passwordlargo123"}'
# → {"error":"turnstile_failed"}  [403]

# acepta con token (el secret de prueba local siempre aprueba)
curl -s -X POST http://localhost:8787/auth/login \
  -H 'content-type: application/json' \
  -H 'cf-turnstile-response: XXXX.DUMMY.TOKEN.XXXX' \
  -d '{"email":"a@b.mx","password":"passwordlargo123"}'
# → {"error":"invalid_credentials"}  [401]  ← pasó el gate
```

Pruebas unitarias del verificador: `apps/api/src/lib/turnstile.test.ts`.
