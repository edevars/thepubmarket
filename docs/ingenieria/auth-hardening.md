# Endurecimiento de auth y sesiones (TASK-011)

> Cómo funciona hoy la autenticación email+contraseña de compradores y
> vendedores: parámetros de hashing, ciclo de vida de la sesión, tokens de
> reset y rate limiting. Complementa a
> [`cloudflare-access-panel.md`](./cloudflare-access-panel.md), que cubre la
> capa de red delante de `/panel`.

Código: `apps/api/src/lib/{auth,password,rate-limit}.ts`,
`apps/api/src/routes/auth.ts`, `apps/api/src/middleware/{buyer,seller}-auth.ts`.
Tests: `apps/api/src/lib/*.test.ts` (`pnpm --filter @thepubmarket/api test`).

## 1. Hashing de contraseñas

**PBKDF2-HMAC-SHA512, 210,000 iteraciones, salt de 16 bytes, clave de 32 bytes**
(`lib/password.ts`), vía SubtleCrypto nativo de Workers — sin dependencias.

Es la cifra que OWASP recomienda para SHA-512 en el *Password Storage Cheat
Sheet*. Se eligió SHA-512 sobre SHA-256 porque llega a paridad con OWASP
costando ~48 ms de CPU del Worker en vez de los ~71 ms que necesitaría
PBKDF2-HMAC-SHA256 con su propia cifra de 600,000 (medido con WebCrypto nativo;
en workerd será algo mayor). Sigue holgado dentro del límite de CPU del plan
Paid de Workers.

El formato almacenado es autodescriptivo:

```
pbkdf2-<hash>$<iteraciones>$<salt b64>$<hash b64>
```

Eso permite subir los parámetros **sin migración de esquema**: los hashes viejos
se siguen verificando con los parámetros con los que se escribieron, y
`needsRehash()` los marca para que `POST /auth/login` los reescriba con los
parámetros actuales en el siguiente login exitoso. Así migró el parque de
hashes `pbkdf2-sha256$210000$…` que existía antes de esta tarea.

## 2. Ciclo de vida de la sesión

Una sola clase de sesión sirve a comprador y vendedor. El rol de vendedor **no
vive en el token**: `sellerAuth` resuelve en vivo la fila de `sellers` por
`user_id`, así que suspender a un vendedor lo saca del panel al instante sin
tocar sesiones.

| Propiedad | Valor |
|---|---|
| Almacén | KV `SESSIONS`, clave `sess:<token>` |
| Token | 256 bits aleatorios en hex (`crypto.getRandomValues`) |
| Transporte | `Authorization: Bearer` (no cookie — el web y la API están en orígenes distintos y Safari bloquea cookies de terceros) |
| Expiración | **Absoluta**, 7 días desde el login |
| Renovación | Ninguna. No hay refresh token: se vuelve a iniciar sesión |
| Revocación | Logout (`POST /auth/logout`) y cambio de contraseña |

**La expiración es absoluta, no deslizante**: el TTL de KV se fija una vez al
crear la sesión y nunca se extiende, así que una sesión muere a los 7 días
aunque se use a diario. Es una decisión, no un descuido — acota la ventana de
un token robado sin necesidad de infraestructura de refresh.

### Índice inverso usuario → sesiones

KV no tiene índices secundarios, así que cada sesión escribe además una clave
marcador `usess:<userId>:<token>` con el mismo TTL. Eso es lo que hace posible
`deleteAllUserSessions()`: listar por prefijo y revocar todas las sesiones de un
usuario de golpe.

Se usa en `POST /auth/password/reset`: **un cambio de contraseña revoca todas
las sesiones anteriores** antes de emitir la nueva. Sin eso, resetear la
contraseña tras un compromiso no servía de nada — la sesión de 7 días del
atacante sobrevivía al cambio de credencial.

Es best-effort por naturaleza: `list` de KV es eventualmente consistente, así
que una sesión creada segundos antes en otro colo puede no aparecer todavía. En
el peor caso expira por su propio TTL.

## 3. Tokens de password reset

256 bits aleatorios, TTL de **15 minutos**, **un solo uso** (se borran al
leerse, `consumeResetToken`). `POST /auth/password/forgot` siempre responde
`{ok:true}` exista o no la cuenta, para no confirmar qué correos están
registrados.

En desarrollo el enlace se **imprime en el log** en vez de enviarse por correo
(`lib/email.ts`) — el envío real por Cloudflare Email Service sigue pendiente
para producción.

## 4. Rate limiting

Ventana fija sobre KV (`lib/rate-limit.ts`), reutilizando el binding
`SESSIONS`. Es una **medida disuasoria complementaria**, no una garantía dura:
las lecturas/escrituras de KV no son atómicas, así que ráfagas concurrentes
pueden contar de menos. La defensa real contra automatización es Turnstile
(TASK-012).

| Endpoint | Bucket | Límite | Ventana |
|---|---|---|---|
| `/auth/login` | IP | 20 intentos | 10 min |
| `/auth/login` | email | 8 **fallos** | 10 min |
| `/auth/register` | IP | 5 | 1 h |
| `/auth/password/forgot` | IP | 10 | 1 h |
| `/auth/password/forgot` | email | 3 | 1 h |
| `/auth/password/reset` | IP | 20 | 1 h |

El bucket por email de login cuenta **fallos, no intentos**
(`isRateLimited` + `recordAttempt`, en vez de `checkRateLimit`). Un comprador
que entra bien diez veces en una mañana nunca se acerca al límite; un ataque de
adivinación lo toca en ocho. El bucket por IP sí cuenta todo, como tope general
barato.

## 5. Anti-enumeración en login

`POST /auth/login` devuelve **el mismo `401 invalid_credentials`** en los tres
casos de fallo: correo desconocido, cuenta sin contraseña y contraseña
incorrecta. Los dos primeros además queman una derivación KDF equivalente
(`dummyVerify`) para que el *tiempo* de respuesta tampoco distinga entre ellos.

Antes existía un `403 password_not_set` para cuentas heredadas sin contraseña, y
la página de login lo usaba para redirigir a "olvidé mi contraseña". Eso
confirmaba qué correos existían; se eliminó junto con su rama en el frontend.
Esas cuentas se recuperan por el flujo normal de reset (el enlace está debajo
del formulario de login).

## 6. Limitaciones conocidas

- **Registro sobre cuentas sin contraseña.** `POST /auth/register` todavía
  "reclama" una cuenta existente que tenga `password_hash NULL`, fijándole
  contraseña y devolviendo sesión. Para esas cuentas es una toma de control sin
  prueba de propiedad del correo. Hoy no hay usuarios en producción, así que el
  riesgo es teórico; conviene cerrarlo antes de que existan.
- **Sin verificación de correo** en el registro.
- **Revocación best-effort** en cambio de contraseña (consistencia eventual de
  KV, ver §2).
- **Sin envío real de correo** (§3).

---

*Escrito: julio 2026 (TASK-011).*
