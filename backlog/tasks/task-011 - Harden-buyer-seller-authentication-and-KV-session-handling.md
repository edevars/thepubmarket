---
id: TASK-011
title: Harden buyer/seller authentication and KV session handling
status: Done
assignee:
  - claude
created_date: '2026-07-22 22:32'
updated_date: '2026-07-28 18:02'
labels:
  - 'epic:identity'
  - chore
milestone: m-1
dependencies: []
modified_files:
  - apps/api/src/lib/password.ts
  - apps/api/src/lib/auth.ts
  - apps/api/src/lib/rate-limit.ts
  - apps/api/src/routes/auth.ts
  - apps/api/src/index.ts
  - apps/api/src/routes/seller-panel.ts
  - apps/api/src/lib/password.test.ts
  - apps/api/src/lib/auth.test.ts
  - apps/api/src/lib/rate-limit.test.ts
  - apps/api/src/test/fake-kv.ts
  - apps/api/vitest.config.ts
  - apps/api/package.json
  - 'apps/web/src/app/[locale]/login/page.tsx'
  - 'apps/web/src/app/[locale]/auth/forgot-password/page.tsx'
  - apps/web/src/components/auth/AuthProvider.tsx
  - apps/web/messages/en.json
  - apps/web/messages/es.json
  - docs/ingenieria/auth-hardening.md
  - docs/ingenieria/README.md
  - turbo.json
priority: medium
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buyer and seller auth are moving from magic-link to email+password (see TASK-013+ implementation work replacing apps/api/src/routes/auth.ts and lib/auth.ts). This task now covers hardening the password-based system instead of magic-link: hashing parameters, KV rate limiting on auth endpoints, reset-token hygiene, and session handling — closing gaps before scaling seller count and real money flowing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Session expiry and rotation behavior reviewed and made explicit/consistent across buyer and seller sessions
- [x] #2 Explicit logout capability confirmed to work for both buyer and seller sessions
- [x] #3 Password-reset token TTL and single-use enforcement reviewed (lib/auth.ts createResetToken/consumeResetToken) and password hashing parameters (PBKDF2 iteration count) reviewed against current OWASP guidance
- [x] #4 KV-based rate limiting on /auth/login, /auth/register, /auth/password/forgot, /auth/password/reset reviewed for correctness and threshold tuning
- [x] #5 No regressions to login, register, password reset, /panel, or /compras flows — verified via build/typecheck and manual pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Findings (review pass over current code)

Reviewed: `apps/api/src/lib/{auth,password,rate-limit}.ts`, `routes/auth.ts`,
`middleware/{buyer,seller}-auth.ts`, `apps/web/src/lib/session.ts`,
`components/auth/AuthProvider.tsx`.

**AC#1 sessions** — One shared session model for buyer and seller (KV `sess:<token>`,
7-day absolute TTL, no sliding renewal, no rotation). Seller identity is resolved live
from the `sellers` row, not baked into the token — good, already consistent.
Gap: no user→sessions reverse index, so a credential change cannot revoke sibling
sessions (documented as a known limitation in `routes/auth.ts:180`).

**AC#2 logout** — `POST /auth/logout` deletes the KV session; `AuthProvider.signOut()`
calls it and clears localStorage. Works for both roles (same session). Gap: it leaves
the reverse-index entry once that index exists.

**AC#3 hashing / reset tokens** — Reset tokens: 256-bit random, 15-min TTL, single-use
(delete-on-read). Correct. Password hashing: PBKDF2-HMAC-SHA256 @ **210,000** iterations.
That is OWASP's number for **SHA-512**, not SHA-256 — current OWASP guidance for
PBKDF2-HMAC-SHA256 is **600,000**. Stored format is self-describing
(`pbkdf2-sha256$<iters>$<salt>$<hash>`) so the count can be raised without a migration,
but there is no rehash-on-login path.
Measured cost (native WebCrypto, M-series): 210k SHA-256 ≈ 25 ms, 600k SHA-256 ≈ 71 ms,
210k SHA-512 ≈ 48 ms.

**AC#3 login enumeration/timing** — `POST /auth/login` returns `403 password_not_set` for
legacy passwordless accounts, which is an account-existence oracle (the web login page
uses it to redirect legacy users to forgot-password). Also, an unknown email returns
before any PBKDF2 work, so response timing distinguishes existing from non-existing
accounts.

**AC#4 rate limiting** — Fixed-window KV counters on register/login/forgot/reset; buckets
and thresholds are sane. Two real issues: (a) `checkRateLimit` increments on **every**
attempt, so a legitimate user's successful logins burn the same 8/10-min email budget an
attacker does; (b) KV is not atomic, so concurrent bursts under-count — already
documented and accepted pending Turnstile (TASK-012).

## Plan

1. `lib/password.ts` — raise iterations to the OWASP SHA-256 figure; add `needsRehash()`;
   fix the stale "OWASP 2023 minimum" docblock. Old hashes keep verifying (self-describing format).
2. `routes/auth.ts` login — opportunistic rehash on successful login when the stored
   iteration count is below current; add a dummy verify on unknown-email so timing does
   not leak account existence.
3. `lib/auth.ts` — add `usess:<userId>:<token>` reverse index (same TTL as the session);
   `deleteSession` cleans both keys; new `deleteAllUserSessions(kv, userId)`.
4. `routes/auth.ts` password reset — revoke all of the user's existing sessions before
   issuing the new one (closes the documented limitation = real rotation on credential change).
5. `lib/rate-limit.ts` — split into a read-only `isRateLimited()` and `recordAttempt()`;
   login records against the email bucket only on **failure**, so successful logins never
   throttle a real user while the attacker budget stays at 8/10 min. IP buckets keep
   counting all attempts.
6. Tests — bootstrap vitest for `apps/api` (mirrors the `apps/web` config added in TASK-009);
   cover password hash/verify/rehash, session create/get/delete/delete-all against a fake KV,
   and rate-limit windowing + failure-only counting. Wire `test` into `turbo.json`.
7. Docs — `docs/ingenieria/auth-hardening.md` (EN): session model, thresholds, hashing
   params and rationale, remaining known limitations.

No fund-flow surface is touched: this is identity/session only, no Stripe, no balances.

## Open decisions (asked before implementing steps 1–2)

- Workers plan / CPU budget → picks the KDF parameters (step 1).
- Whether to close the `password_not_set` enumeration oracle at the cost of the legacy-user
  redirect UX (step 2). Local DB has 5 of 8 users still passwordless.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisiones tomadas con el usuario antes de implementar: (a) plan Workers Paid, KDF a PBKDF2-HMAC-SHA512 @ 210k (cifra OWASP para SHA-512, ~48 ms vs ~71 ms de SHA-256 @ 600k); (b) no hay usuarios en producción, así que se cierra el oráculo de enumeración `password_not_set` sin migración de cuentas legacy.

El test de paginación del índice inverso encontró un bug real en la primera versión de `deleteAllUserSessions`: borraba mientras paginaba, lo que muta el propio listado y salta entradas (5 sesiones → 3 revocadas). Corregido recolectando todas las páginas antes de borrar. El fake de KV también se ajustó para modelar el cursor del KV real (basado en la última clave, no en offset).

Verificación funcional contra `wrangler dev` local (no solo unit tests): register/login/me/logout, reset que revoca sesiones hermanas, token de reset de un solo uso, re-hash de sha256→sha512 en el login (confirmado en D1), login de cuenta legacy sin contraseña devolviendo invalid_credentials, y los tres buckets de rate limit (15 logins correctos sin consumir presupuesto → 8 fallos cortan en el 9no; 20 intentos por IP cortan en el 21). /seller/* y /orders siguen respondiendo 200 con sesión y 401 tras logout.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-24 04:18
---
Superseded scope: original task targeted magic-link hardening. Magic-link is being replaced entirely by email+password auth (see plan executed in this session). AC rewritten to match the new system — see apps/api/src/lib/password.ts and lib/rate-limit.ts once implemented.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Qué cambió

Endurecimiento de la auth email+contraseña de compradores y vendedores. No toca
ninguna superficie de flujo de fondos: identidad y sesión únicamente, sin Stripe
ni saldos.

**Hashing (`lib/password.ts`)** — PBKDF2-HMAC-SHA256 @ 210,000 estaba usando la
cifra que OWASP recomienda para SHA-512, no para SHA-256 (600,000). Se movió a
**PBKDF2-HMAC-SHA512 @ 210,000**: cumple OWASP costando ~48 ms de CPU en vez de
los ~71 ms de SHA-256 @ 600k. El formato almacenado pasó a llevar el algoritmo
(`pbkdf2-<hash>$<iters>$<salt>$<hash>`), los hashes viejos se siguen verificando,
y `needsRehash()` + re-hash en el login exitoso migran el parque sin migración de
esquema ni sacar a nadie de su cuenta.

**Sesiones (`lib/auth.ts`)** — Se documentó el modelo explícitamente (expiración
**absoluta** de 7 días, sin renovación deslizante, sin refresh token; una sola
clase de sesión para comprador y vendedor, con el rol de seller resuelto en vivo
contra `sellers`). Se añadió el índice inverso `usess:<userId>:<token>` y
`deleteAllUserSessions()`, y `deleteSession` ahora limpia ambas claves.

**Reset de contraseña** — Ahora **revoca todas las sesiones previas** del usuario
antes de emitir la nueva. Antes, resetear tras un compromiso no servía de nada:
la sesión de 7 días del atacante sobrevivía al cambio de credencial (era una
limitación conocida en el código). TTL de 15 min y un solo uso: revisados,
correctos, ahora con tests.

**Anti-enumeración en login** — Correo desconocido, cuenta sin contraseña y
contraseña incorrecta devuelven los tres el mismo `401 invalid_credentials`, y
los dos primeros queman una derivación KDF equivalente para que el tiempo de
respuesta tampoco los distinga. Se eliminó el `403 password_not_set` y su rama
de redirect en el frontend.

**Rate limiting (`lib/rate-limit.ts`)** — El bucket por email del login contaba
todos los intentos, así que los logins correctos de un comprador gastaban el
mismo presupuesto que un ataque. Se separó en `isRateLimited` (lectura) +
`recordAttempt` (cargo), y el login solo cobra los **fallos**. El bucket por IP
sigue cobrando todo.

**Tests** — Se bootstrapeó vitest para `apps/api` (no había ninguno) espejando la
config de `apps/web`: 30 tests sobre hashing, sesiones y rate limiting, con un
fake de KV en memoria. `test` cableado en `turbo.json`.

**Docs** — `docs/ingenieria/auth-hardening.md`: parámetros, tabla de límites,
razonamiento y limitaciones conocidas.

## Verificación

`pnpm lint`, `pnpm typecheck`, `pnpm build` y `pnpm turbo run test` (48 tests,
30 nuevos de api + 18 de web) en verde. Además, pasada funcional contra
`wrangler dev` local: los seis flujos de auth, el re-hash confirmado en D1, y
los tres buckets de rate limit comportándose como se diseñaron. `/seller/*` y
`/orders` sin regresión (200 con sesión, 401 tras logout).

## Queda abierto

`POST /auth/register` todavía reclama una cuenta existente con `password_hash
NULL` fijándole contraseña y devolviendo sesión — toma de control sin prueba de
propiedad del correo para cuentas heredadas. Sin usuarios en producción hoy el
riesgo es teórico. Está fuera de los criterios de aceptación de esta tarea y
documentado en §6 de `auth-hardening.md`; conviene cerrarlo antes de que existan
cuentas reales.
<!-- SECTION:FINAL_SUMMARY:END -->
