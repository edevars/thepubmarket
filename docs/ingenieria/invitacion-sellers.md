# Invitación de vendedores vetted (TASK-010)

> Proceso completo para dar de alta un vendedor nuevo: desde "decidimos invitar
> a la tienda X" hasta que esa tienda cobra en su propio panel. Incluye la
> bitácora de auditoría, las salvaguardas contra auto-registro y la revisión de
> la protección `x-admin-key`.

**Regla que gobierna todo este documento** (`CLAUDE.md`): The Pub Market es un
marketplace **vetted, por invitación**. No hay auto-registro de vendedores ni
lo habrá. Un usuario se vuelve vendedor **solo** porque un admin creó su fila en
`sellers` y la vinculó a su email. Nada en el API público puede producir ese
efecto.

---

## 1. Flujo end-to-end

### Paso 0 — Vetting (fuera del sistema)

Decisión de negocio: conocemos a la tienda, hay reputación y acuerdo comercial.
No hay formulario, cola ni "solicitud de vendedor" que revisar: si no hubo
conversación previa, no hay invitación.

### Paso 1 — Crear la fila del seller (`status = 'invited'`)

No existe endpoint de alta de sellers a propósito: es una operación rara,
deliberada y de bajo volumen. Se hace con SQL contra D1.

```bash
# Local
npx wrangler d1 execute thepubmarket-db --local --command "
INSERT INTO sellers (id, name, slug, status, verified, monogram, city)
VALUES (lower(hex(randomblob(4))) || '-0000-4000-8000-' || lower(hex(randomblob(6))),
        'Tienda Ejemplo', 'tienda-ejemplo', 'invited', 0, 'TE', 'CDMX');"

# Remoto: mismo comando con --remote (revisa DOS veces antes de correrlo)
```

`status='invited'` es lo que le permite entrar al onboarding de Stripe Connect
sin poder aún operar el panel completo (`sellerConnectAuth` acepta `invited`;
`sellerAuth` exige `active`). Anota el `id` resultante:

```bash
npx wrangler d1 execute thepubmarket-db --local \
  --command "SELECT id, name, slug, status FROM sellers WHERE slug='tienda-ejemplo';"
```

### Paso 2 — Vincular el email del vendedor (acción auditada)

```bash
curl -X POST "$API/admin/sellers/$SELLER_ID/link" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "x-admin-actor: enrique.devars@gmail.com" \
  -H 'content-type: application/json' \
  -d '{"email":"duenio@tiendaejemplo.mx","note":"acordado en la tienda el 24/07"}'
```

- `x-admin-actor` (**obligatorio**, formato email) es quién ejecuta la
  invitación. Sin él la petición se rechaza con `400 missing_admin_actor`: una
  invitación sin responsable no es auditable.
- `note` es opcional y queda en la bitácora. Úsala para el contexto que en seis
  meses ya no vas a recordar.
- Efecto: crea el usuario si el email no existía (rol `buyer` siempre), escribe
  `sellers.user_id` y agrega una fila en `seller_invitations`.
- Es idempotente en el vínculo (re-ejecutar deja el mismo `user_id`), pero
  **append-only en la bitácora**: cada llamada agrega una fila.

### Paso 3 — El vendedor crea su contraseña

El vínculo no manda ningún correo: avísale tú por el canal por el que ya hablas
con esa tienda.

- **Email nuevo** (creado en el paso 2, sin contraseña): entra a
  `/register` con **ese mismo email** y elige contraseña. Al existir ya la fila
  con `password_hash NULL`, el registro la reclama en vez de fallar con
  `email_taken`.
- **Email que ya era comprador**: no hace nada; ya tiene contraseña. Su cuenta
  existente es ahora también la del vendedor.
- ¿Olvidó la contraseña? `/auth/forgot-password` normal.

La identidad de vendedor se resuelve **en vivo** en cada request
(`sellers.user_id` vs. la sesión), así que no hace falta re-login tras vincular.

### Paso 4 — Onboarding de Stripe Connect (autoservicio)

Con sesión iniciada, el vendedor entra a `/panel` y arranca el onboarding
(`POST /seller/connect/onboarding-link` → Account Link hospedado por Stripe).
KYC, identidad y datos fiscales los recolecta **Stripe**, no nosotros.

Cuando Stripe confirma `charges_enabled && details_submitted`, el webhook
`account.updated` hace el flip `invited → active`
(`apps/api/src/routes/webhooks.ts`). El redirect de vuelta al panel es solo UX:
la señal autoritativa es el webhook.

> ⚠️ Antes de onboardear un vendedor **real** (no de prueba), lee el hallazgo de
> compliance de TASK-007 documentado en `apps/api/src/routes/seller-connect.ts`:
> Stripe obliga a `fees.payer = 'application'` y `losses.payments = 'application'`
> con dashboard Express. No es custodia de fondos del comprador, pero sí es
> exposición financiera de la plataforma y necesita sign-off explícito.

### Paso 5 — Verificar

```bash
# Bitácora + estado actual del seller
curl -s "$API/admin/sellers/$SELLER_ID/invitations" -H "x-admin-key: $ADMIN_API_KEY"
```

Y del lado del vendedor: `/panel` carga su inventario y sus órdenes.

---

## 2. Bitácora de auditoría (`seller_invitations`)

Tabla append-only (migración `0006_perpetual_the_liberteens.sql`). Nunca se
actualiza ni se borra: re-vincular un seller a otro email agrega una fila, y el
historial queda íntegro.

| Columna | Qué guarda |
|---|---|
| `seller_id` | A qué tienda se invitó |
| `email` | A quién se invitó (normalizado a minúsculas) |
| `user_id` | Usuario resuelto o creado en ese momento |
| `invited_by` | Quién ejecutó la acción (`x-admin-actor`) |
| `ip` | `cf-connecting-ip` de la petición |
| `note` | Contexto libre del operador |
| `created_at` | Cuándo (unix segundos) |

Lectura por API (`GET /admin/sellers/:id/invitations`, más reciente primero) o
directo en D1:

```bash
npx wrangler d1 execute thepubmarket-db --remote --command "
SELECT datetime(i.created_at,'unixepoch') AS cuando, s.name AS tienda,
       i.email, i.invited_by, i.note
FROM seller_invitations i JOIN sellers s ON s.id = i.seller_id
ORDER BY i.created_at DESC LIMIT 50;"
```

**Limitación honesta:** mientras `/admin/*` esté protegido por clave compartida,
`invited_by` es atribución **por convención**, no criptográfica — la clave
identifica "quien la tiene", no a una persona, y el header lo escribe el propio
operador. Con un solo operador el valor real de la bitácora es el *registro*
(qué pasó y cuándo), no la *prueba* de identidad. La atribución fuerte llega
cuando `/admin/*` quede detrás de Cloudflare Access con service tokens (ver §4).

---

## 3. Salvaguardas contra auto-registro (verificado)

Dónde vive la invariante en el código:

- `packages/db/src/schema.ts` — comentario de invariante sobre `sellers`.
- `apps/api/src/routes/admin.ts` — único lugar que escribe `sellers.user_id`.
- `apps/api/src/routes/auth.ts` — `POST /auth/register` fija `role: 'buyer'` y
  el esquema zod descarta claves desconocidas (no se puede inyectar `role` ni
  `sellerId`).
- `apps/api/src/routes/sellers.ts` — el router público de tiendas es **solo
  lectura** (`GET`).

Matriz de sondeo ejecutada contra `wrangler dev` local (2026-07-25):

| Sondeo | Resultado |
|---|---|
| `POST /admin/sellers/:id/link` sin `x-admin-key` | `401 unauthorized` |
| `POST /admin/sellers/:id/link` con clave incorrecta | `401 unauthorized` |
| `GET /admin/sellers/:id/invitations` sin clave | `401 unauthorized` |
| `POST /auth/register` con `role:"admin"` y `sellerId` inyectados | `201`, usuario creado con `role='buyer'`; campos extra ignorados |
| Ese usuario → `GET /seller/inventory` | `403 not_a_seller` |
| Ese usuario → `POST /seller/connect/onboarding-link` | `403 not_a_seller` |
| `POST /sellers` (¿alta pública de tienda?) | `404` — la ruta no existe |
| Filas en `sellers` creadas por el sondeo | `0` |

Repetible con los comandos de §1 y §5 cambiando el email de prueba. Si algún día
uno de estos deja de dar el resultado esperado, se rompió la invariante vetted.

---

## 4. Revisión de la protección `x-admin-key` (AC#4)

**Hallazgos de la revisión:**

1. La comparación de la clave usaba `!==` sobre strings — oráculo de tiempo,
   explotable en teoría a fuerza bruta byte a byte.
2. No había límite de intentos: la clave se podía atacar sin costo.
3. Una clave débil (corta) pasaba sin señal alguna.
4. La clave autentica *posesión*, no *identidad*: no se puede saber quién hizo
   qué.

**Endurecido en esta tarea** (`apps/api/src/middleware/admin-auth.ts`):

- Comparación en tiempo constante sobre el SHA-256 de cada valor — al comparar
  digests de longitud fija tampoco se filtra el largo de la clave.
- Rate limit de **intentos fallidos por IP** en KV (10 / 15 min → `429`).
  Las peticiones exitosas no consumen presupuesto, así que el operador legítimo
  nunca se autobloquea (verificado en vivo).
- `console.warn` si `ADMIN_API_KEY` mide menos de 32 caracteres. No falla
  cerrado a propósito: dejaría al operador fuera del admin de producción sin
  aviso previo.
- `x-admin-actor` obligatorio en la invitación → el punto 4 queda mitigado a
  nivel de registro (§2), no de prueba criptográfica.

**Veredicto:** adecuado como medida interina para un solo operador y volumen de
invitaciones bajísimo. **No** es el estado final.

**Pendiente (necesita dashboard de Cloudflare, mismo bloqueo que TASK-009):**
poner `/admin/*` detrás de Cloudflare Access con **service tokens**
(`CF-Access-Client-Id` / `CF-Access-Client-Secret`), que sí sirven para llamadas
no interactivas — a diferencia del login hospedado, que rompería un `fetch()`
cross-origin (ver [`cloudflare-access-panel.md`](./cloudflare-access-panel.md)).
Con eso, `invited_by` se puede derivar del JWT verificado y la atribución pasa a
ser criptográfica.

---

## 5. Operaciones relacionadas

**Suspender un vendedor** (lo saca del panel al instante; `sellerAuth` resuelve
la fila en vivo):

```bash
npx wrangler d1 execute thepubmarket-db --remote \
  --command "UPDATE sellers SET status='suspended' WHERE id='$SELLER_ID';"
```

`suspended` también bloquea `/seller/connect/*`, a propósito. Sus listings
siguen en `inventory`: si además hay que retirarlos del catálogo, pásalos a
`status='inactive'`.

**Cambiar el email dueño de una tienda:** repite el paso 2 con el email nuevo.
El vínculo apunta al usuario nuevo y la bitácora conserva ambas filas.

**Cuidado con el seed:** `apps/api/seed.sql` es idempotente y **nunca** toca
`user_id` ni `stripe_connect_account_id` — re-correrlo no deshace una
vinculación. Si haces pruebas de invitación en local contra el seller ancla,
restaura su `user_id` original al terminar.
