# Cloudflare Access delante de /panel (TASK-009)

> Runbook de la protección de red del Panel del Vendedor (`apps/web`, rutas
> `/panel` y `/{locale}/panel`) vía Cloudflare Access / Zero Trust. Cubre la
> decisión de arquitectura, los pasos manuales en el dashboard (no
> automatizables desde este repo) y el flujo de desarrollo local.

## 1. Qué protege esto y qué no

Access se pone delante de **las páginas del Panel del Vendedor en `apps/web`**
(`/panel`, `/en/panel`, `/es/panel`, sus subrutas). **No protege la API**
(`apps/api`, rutas `/seller/*`) — esa sigue detrás de `sellerAuth`
(email+password + sesión en KV, `apps/api/src/middleware/seller-auth.ts`) tal
como antes de esta tarea.

Es deliberado, no un descuido:

- La API vive en un subdominio separado y el browser la llama directo vía
  `fetch()` con `Authorization: Bearer <token>` (ver
  `apps/api/src/lib/auth.ts`, `apps/web/src/lib/client-api.ts`).
- El flujo de login hospedado de Cloudflare Access funciona **redirigiendo
  navegaciones de página** hacia su propia pantalla de login y, tras
  autenticar, seteando la cookie `CF_Authorization`. Eso funciona perfecto
  para una navegación de browser hacia `/panel`, pero una llamada `fetch()`
  cross-origin hacia la API simplemente recibiría un redirect/HTML de login
  en vez del JSON esperado — rompería la app para vendedores reales.
- Por eso Access queda delante de las páginas Next.js (donde una navegación
  de browser sí puede ser interceptada y mostrar el login de Access), y la
  API sigue confiando en `sellerAuth` como la autorización real por vendedor.

Esta capa es **adicional**, no un reemplazo:

1. **Cloudflare Access** (nueva, esta tarea) — gate de red en `/panel`, exige
   una identidad autenticada vía Access antes de que la petición llegue
   siquiera al Worker de Next.js.
2. **`sellerAuth`** (ya existía) — autorización real de datos en la API:
   qué vendedor es, a qué inventario/órdenes tiene acceso.
3. **`PanelShell`** (ya existía, cliente) — guard de UX: llama a `/seller/me`
   y muestra pantallas de "no sesión" / "no es vendedor". No protege datos
   por sí mismo (todo pasa por `sellerAuth` del lado servidor); es solo
   experiencia. No se tocó en esta tarea.

## 2. Configuración manual en el dashboard de Zero Trust

**No se hizo desde este repo** — no hay credenciales de cuenta de Cloudflare
disponibles para el agente. Esto lo tiene que hacer el operador (dueño de la
cuenta) directamente en el dashboard. Pasos, con la salvedad de que el flujo
de clicks exacto del dashboard de Zero Trust puede haber cambiado desde que
se escribió esto — si algo no coincide, es más confiable la documentación
oficial de Cloudflare del momento que esta lista.

1. **Zero Trust → Access → Applications → Add an application → Self-hosted.**
2. **Hostname + path.** El dominio de `apps/web` en producción, con path
   `/panel*`. **Ojo con el prefijo de locale**: las rutas reales son
   `/en/panel*` y `/es/panel*` (más `/panel*` sin prefijo, si `as-needed`
   deja pasar el default sin prefijo — confirmar contra
   `apps/web/src/i18n/routing.ts`, hoy `es` es el default sin prefijo).
   No tengo certeza de que el dashboard actual soporte un solo path con
   wildcard que cubra ambos prefijos de locale en una sola Application. Si
   no lo soporta: **crear dos Access Applications, una por locale
   (`/panel*` y `/en/panel*`), compartiendo la misma Policy** — es el
   fallback confiable y explícito si un solo wildcard no alcanza.
3. **Policy: Allow, por lista explícita de emails.** No usar "cualquiera con
   este dominio de correo" — el modelo de negocio es *store-first, sellers
   por invitación* (ver `CLAUDE.md`), así que la política debe reflejar
   exactamente eso: una lista de emails de vendedores vetted, no una regla
   abierta.
4. **Obtener `CF_ACCESS_TEAM_DOMAIN` y `CF_ACCESS_AUD`:**
   - Team domain: Zero Trust → Settings → Custom Pages (o la URL general del
     equipo), forma `<team-name>.cloudflareaccess.com`.
   - AUD tag: dentro de la Access Application recién creada, en su página de
     overview — "Application Audience (AUD) Tag".
5. **Cargar los valores** en `apps/web/wrangler.jsonc` (bloque `"vars"`) y
   redeploy, o vía `wrangler deploy --var CF_ACCESS_TEAM_DOMAIN:... --var
   CF_ACCESS_AUD:...` si se prefiere no commitear los valores reales (no son
   secretos, pero tampoco hace daño mantenerlos fuera del repo si se
   prefiere ese approach — decisión del operador).

## 3. El gap de `*.workers.dev` (por qué el chequeo en código importa)

Cloudflare Access se ata a un **hostname específico** (el dominio custom que
se configuró en el paso 2). **Nunca se ata al subdominio `*.workers.dev`**
que Wrangler asigna por default a cada Worker. Mientras ese subdominio siga
habilitado (no está deshabilitado explícitamente en el dashboard del
Worker), la URL `https://thepubmarket-web.<cuenta>.workers.dev/panel` queda
alcanzable **sin pasar por Access en absoluto** — sin importar cuán bien
configurada esté la Access Application del dominio custom.

Esta es exactamente la razón de que `guardPanelAccess`
(`apps/web/src/lib/panel-access-guard.ts`, compuesto en
`apps/web/src/middleware.ts`) valide el header `Cf-Access-Jwt-Assertion` **en
código**, no solo confíe en que Access intercepte la petición en el edge:

- Sin el header (nadie pasó por Access) → `401`.
- Header presente pero el JWT no valida (firma, `aud`, `iss`, expiración) →
  `403`.
- Sin `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` configurados y en producción →
  `503` (fail-closed; mismo espíritu que
  `apps/api/src/middleware/admin-auth.ts`).

Esto es lo que hace que el criterio de aceptación diga "capa **adicional**"
y no "capa de borde suficiente por sí sola": el chequeo en código es lo que
cierra el gap de `workers.dev`, incluso si alguien deshabilita o mal-configura
Access en el dashboard.

## 4. Desarrollo local

Access no se puede emular en este repo hoy:

- No hay un túnel `cloudflared` wireado al proyecto.
- `next dev` (el modo normal de desarrollo local, ver `apps/web/package.json`
  script `dev`) **no corre a través de un Worker** — corre como servidor de
  Next.js plano. Access es una capa del edge de Cloudflare; sin Worker/edge
  real en el camino, no hay nada que intercepte la petición.

La salida pragmática: la variable `ACCESS_LOCAL_BYPASS`. Con
`ACCESS_LOCAL_BYPASS=true` en `apps/web/.env` (ver `.env.example`),
`guardPanelAccess` deja pasar `/panel` sin pedir el JWT de Access — pero
**solo si `process.env.NODE_ENV !== 'production'`** (chequeo explícito en
`apps/web/src/lib/panel-access-guard.ts`, líneas del bloque de bypass). Si
por accidente `ACCESS_LOCAL_BYPASS=true` llegara a un build de producción,
es un no-op: el bypass se ignora y el resto de la lógica (fail-closed si no
hay config, 401/403 si el JWT falta o es inválido) sigue aplicando tal cual.

No hace falta nada más para desarrollar `/panel` en local — es el
comportamiento por default en `apps/web/.env` de este repo.

## 5. Mecanismo de runtime env vars bajo OpenNext (confirmado, no asumido)

`CF_ACCESS_TEAM_DOMAIN` y `CF_ACCESS_AUD` viven en el bloque `"vars"` de
`apps/web/wrangler.jsonc` (no son secretos: son identificadores públicos de
la Access Application, no credenciales). Se leen en `middleware.ts` como
`process.env.CF_ACCESS_TEAM_DOMAIN` / `process.env.CF_ACCESS_AUD` — **no**
vía `getCloudflareContext().env`. Confirmado leyendo el código fuente de
`@opennextjs/cloudflare@1.3.0` (no asumido):

- El Worker generado por OpenNext importa
  `dist/cli/templates/init.js` al arrancar. Esa inicialización corre una
  función `populateProcessEnv(url, env)` que, en cada request, **copia cada
  valor string del `env` del Worker (bindings + `vars` de `wrangler.jsonc`)
  hacia `process.env`** antes de que la petición llegue a cualquier handler
  de Next.js (middleware incluido). Fuente:
  `apps/web/node_modules/@opennextjs/cloudflare/dist/cli/templates/init.js`.
- Esto aplica al Worker real: `pnpm preview` (build + wrangler preview) y
  producción desplegada (`pnpm deploy`).
- En `next dev` (sin Worker, plain Next.js) **no corre `init.js`** — ahí
  `process.env` se puebla por el loader nativo de Next.js a partir de
  `apps/web/.env` (mecanismo estándar de Next.js, nada específico de
  OpenNext). Por eso `ACCESS_LOCAL_BYPASS=true` en `apps/web/.env` funciona
  en `next dev` sin configuración adicional.
- `getCloudflareContext().env` sigue siendo necesario para bindings que NO
  son strings simples (D1, KV, R2, Durable Objects) — pero para `vars` de
  texto plano como estas, `process.env` alcanza y es más simple, consistente
  con cómo ya se leen otras vars en este código base.

## 6. Deuda relacionada (fuera de alcance de esta tarea)

`apps/api/src/middleware/admin-auth.ts` protege `/admin` (carga de
inventario) con una clave compartida (`x-admin-key` / `ADMIN_API_KEY`) y
tiene un TODO idéntico en espíritu ("proteger con Cloudflare Access"). No se
tocó en esta tarea — es la misma idea aplicada a otra superficie, pendiente
como tarea futura. El helper `verifyAccessJwt`
(`apps/web/src/lib/cloudflare-access.ts`) es JWT-verification puro (usa
`jose` sobre Web Crypto, sin dependencias de Next.js) y probablemente se
pueda mover a `packages/shared` para reusarlo ahí en vez de reimplementarlo
en Hono.

## 7. Archivos relevantes

- `apps/web/src/lib/cloudflare-access.ts` — verificación de JWT (`jose`,
  JWKS remoto).
- `apps/web/src/lib/panel-access-guard.ts` — lógica de gating de `/panel`
  (`guardPanelAccess`, `isPanelPath`), separada de `middleware.ts` para
  poder testearla sin arrastrar `next-intl/middleware` (ver comentario en el
  archivo — es una limitación de resolución de módulos de Vitest/pnpm con
  esa cadena de imports específica, no una limitación real de Next.js).
- `apps/web/src/middleware.ts` — compone el gate con el middleware de i18n
  existente.
- `apps/web/wrangler.jsonc` — bloque `"vars"` con `CF_ACCESS_TEAM_DOMAIN` /
  `CF_ACCESS_AUD`.
- `apps/web/.env.example` — plantilla con las tres vars (`CF_ACCESS_*` +
  `ACCESS_LOCAL_BYPASS`).
- Tests: `apps/web/src/lib/cloudflare-access.test.ts`,
  `apps/web/src/lib/panel-access-guard.test.ts`.
