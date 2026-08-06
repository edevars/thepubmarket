# Correo transaccional — Cloudflare Email Sending

> Cómo sale el correo de la plataforma (TASK-016), qué registros DNS lo
> autentican y qué revisar cuando un correo no llega.

**Creado:** 2026-07-29 (TASK-016).

---

## 1. Qué se envía hoy

| Disparador | Destinatario | Contenido |
|---|---|---|
| `POST /auth/password/forgot` con cuenta existente | comprador o vendedor | link de reset, vence en 15 min, un solo uso |
| Workflow post-pago, step `notify-buyer` | comprador | confirmación de compra: folio, líneas con set/condición, totales y cómo llega |
| Workflow post-pago, step `notify-seller` | tienda vendedora | venta nueva: qué sacar del stock, a dónde va, link al panel |
| `POST /seller/orders/:id/ship` | comprador | va en camino: número de guía y paquetería |
| `POST /seller/orders/:id/ready` | comprador | listo para recoger: tienda, dirección y horarios |

Los cuatro de orden se arman en `apps/api/src/lib/order-emails.ts` y salen por
el mismo transporte de abajo. No hay una segunda ruta al proveedor.

**Esto no es una herramienta de marketing.** Email Sending es para correo
transaccional; boletines y campañas no van por aquí.

---

## 2. Cómo está armado

Tres piezas, con una frontera clara entre ellas:

| Archivo | Responsabilidad |
|---|---|
| `apps/api/src/lib/email.ts` | **Único** punto que toca el binding `EMAIL`. Nunca lanza. |
| `apps/api/src/lib/email-templates.ts` | Plantillas puras: datos → `{subject, html, text}`. Sin red, sin env. |
| `apps/api/src/lib/order-emails.ts` | Arma los datos de una orden y dispara el envío. Nunca lanza. |
| `apps/api/wrangler.jsonc` | Binding `send_email` + vars `EMAIL_MODE` / `EMAIL_FROM` / `EMAIL_FROM_NAME`. |

Propiedades deliberadas:

- **`sendEmail` nunca lanza.** Devuelve un resultado que el caller puede
  ignorar. Un proveedor con un mal día no puede convertir un reset exitoso en
  un 500, ni filtrar su mensaje de error al cliente.
- **Se llama por `waitUntil`.** `/auth/password/forgot` responde el mismo
  `{ok: true}` neutral exista o no la cuenta; esperar al proveedor solo
  agregaría latencia — y latencia que correlaciona con "esta dirección sí tiene
  cuenta" es exactamente el oráculo que la respuesta neutral evita.
- **Remitente restringido.** El binding lleva
  `allowed_sender_addresses: ["no-reply@thepubmarket.com"]`: un bug no puede
  enviar como cualquier dirección del dominio. **Va en pareja con el var
  `EMAIL_FROM`** — si se mueve uno sin el otro, el runtime rechaza el envío.
- **Siempre HTML y texto plano.** No es cortesía: hay clientes que muestran el
  texto, y los filtros de spam castigan el correo solo-HTML.
- **El cuerpo nunca se loguea en un fallo.** Solo destinatario, asunto y código
  de error. Un link de reset no va a observabilidad.

### `EMAIL_MODE`

| Valor | Qué hace | Dónde |
|---|---|---|
| `send` | entrega real por Cloudflare Email Sending | var de `wrangler.jsonc` (desplegado) |
| cualquier otro | imprime el correo completo en el log y **no envía nada** | `EMAIL_MODE=log` en `apps/api/.dev.vars` |

Esto es lo que permite desarrollar en local sin dominio verificado, sin
credenciales y sin riesgo de escribirle a una persona real desde una corrida de
prueba. El link de reset sale íntegro en el log:

```
[email] NOT SENT (EMAIL_MODE=log) → alguien@example.com
[email] subject: Restablece tu contraseña — The Pub Market
…
http://localhost:3000/auth/reset-password?token=b2b4543a…
[email] ---
```

> **Ojo con `wrangler dev` y `EMAIL_MODE=send`:** Miniflare **simula** el envío
> (loguea `send_email binding called with MessageBuilder` y escribe el HTML a un
> archivo temporal) en vez de llamar al proveedor. Sirve para revisar el payload
> y el render, pero **la ruta de fallo real no se puede ejercitar en local**:
> eso solo se comprueba contra el Worker desplegado.

---

## 3. Alta del dominio (una vez)

**Estado:** `thepubmarket.com` dado de alta el 2026-07-29, `enabled: true`,
return-path `cf-bounce.thepubmarket.com`, selector DKIM `cf-bounce`.

Dashboard: **Compute & AI → Email Service → Email Sending → Onboard Domain**.
Por CLI: `wrangler email sending enable thepubmarket.com`.

### Los registros que crea

Cloudflare **no toca el ápice** salvo el DMARC: todo lo demás cuelga de
`cf-bounce`. Por eso el alta convivió sin conflicto con el reenvío de correo
entrante que ya existía en Namecheap.

| Registro | Host | Valor |
|---|---|---|
| MX ×3 | `cf-bounce.thepubmarket.com` | `route1/2/3.mx.cloudflare.net` (rebotes) |
| TXT SPF | `cf-bounce.thepubmarket.com` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT DKIM | `cf-bounce._domainkey.thepubmarket.com` | `v=DKIM1; h=sha256; k=rsa; p=…` |
| TXT DMARC | `_dmarc.thepubmarket.com` | `v=DMARC1; p=none;` ← **modificado a mano** |

Lo que **sigue intacto** en el ápice, y debe seguir así:

```
MX      10 eforward1..3 / 15 eforward4 / 20 eforward5 .registrar-servers.com
TXT     v=spf1 include:spf.efwd.registrar-servers.com ~all
```

Verificación:

```bash
dig +short TXT cf-bounce.thepubmarket.com
dig +short TXT cf-bounce._domainkey.thepubmarket.com
dig +short TXT _dmarc.thepubmarket.com
dig +short MX  thepubmarket.com          # el reenvío de Namecheap, sin tocar
```

### Por qué el DMARC está en `p=none` y no en `reject`

Cloudflare lo crea en **`p=reject`**. Se bajó a `p=none` a propósito.

El registro `_dmarc` del ápice aplica a **todo remitente que diga ser
`@thepubmarket.com`**, no solo a este Worker. Nuestro correo transaccional pasa
alineado en cualquiera de los dos casos (DKIM `cf-bounce` + SPF del
return-path), así que `reject` no nos protege más a nosotros — pero sí empieza a
**rechazar en silencio** cualquier otro remitente legítimo con esa dirección
(un "send mail as" de Gmail, un webmail del registrar). Mientras no esté
inventariado qué más manda correo con el dominio, `none` es lo correcto.

**Subirlo a `quarantine` y luego a `reject` es trabajo de la checklist de
go-live**, no de esta tarea. Antes de subirlo conviene añadir `rua=mailto:…` a
una bandeja que sí se lea, para ver los reportes agregados primero.

---

## 4. Acceso por API

El token OAuth de `wrangler login` **no** trae permisos de Email Sending
(`2036 Unauthorized`). Se usa un token scoped en `~/.cf-email-token` con
`Account → Email Sending: Edit` y `Zone → DNS: Edit` sobre la zona.

Dos trampas encontradas al usarlo:

- **`wrangler email sending list` no sirve aquí.** Pega contra
  `/accounts/{id}/email/sending/zones`, que sigue devolviendo
  `10000 Authentication error` con este token. El endpoint que sí responde es el
  de zona:

  ```bash
  curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/sending/subdomains" \
    -H "Authorization: Bearer $(cat ~/.cf-email-token)"
  ```

- **Wrangler necesita el account ID explícito** con un token scoped, porque no
  puede resolverlo solo: `export CLOUDFLARE_ACCOUNT_ID=…`.

---

## 5. Límites

Cuota de la cuenta, consultable en vivo:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/email/sending/limits" \
  -H "Authorization: Bearer $(cat ~/.cf-email-token)"
```

Al 2026-07-29: **1000 correos/día**. Suficiente con margen amplio para el
volumen actual (un reset ocasional) y para los correos de orden de TASK-017,
pero es un número que hay que volver a mirar antes de abrir el marketplace.

Además, el propio endpoint de reset tiene su rate limit en KV — 3 por dirección
y 10 por IP cada hora (`apps/api/src/lib/rate-limit.ts`) — así que la cuota
diaria no se puede quemar desde ese endpoint.

---

## 6. Diagnóstico

| Síntoma | Causa probable |
|---|---|
| `E_SENDER_NOT_VERIFIED` | el dominio no está dado de alta, o se envió antes de que propagara el DNS |
| `email from X not allowed` | `EMAIL_FROM` no coincide con `allowed_sender_addresses` del binding (verificado: el binding restringido sí bloquea) |
| Nada en el log y nada en la bandeja | `EMAIL_MODE` no es `send` (revisa el var desplegado con `wrangler versions view`) |
| El correo sale pero cae en spam | dominio recién estrenado, sin reputación. Normal al principio; mejora con volumen legítimo constante |
| `E_RECIPIENT_SUPPRESSED` | la dirección rebotó o marcó spam antes; está en la lista de supresión de la cuenta |
| `E_RATE_LIMIT_EXCEEDED` / `E_DAILY_LIMIT_EXCEEDED` | cuota; reintentar con backoff o pedir aumento |
| El usuario dice que no le llegó y no hay línea `[email]` en el log | la dirección **no tiene cuenta**: el endpoint responde igual pero no envía (respuesta neutral, a propósito) |

Todo fallo deja una línea así en el log del Worker:

```
[email] send failed → alguien@example.com (Restablece tu contraseña — The Pub Market): E_SENDER_NOT_VERIFIED: …
```

Para verlo en vivo: `wrangler tail --format pretty` desde `apps/api/`.

---

## 7. Qué NO va en un correo

Regla dura, no preferencia:

- Ningún token de sesión, contraseña ni identificador de Stripe.
- Ninguna cifra de comisión o application fee en correo al comprador.
- Nada que sugiera que la plataforma retiene o mueve fondos — ver
  [`../../CLAUDE.md`](../../CLAUDE.md), restricción de no custodia.

---

## 8. Correos de orden: quién dispara qué, y por qué no se duplican

Los cuatro correos de orden viven en `lib/order-emails.ts`. Ese módulo **no**
implementa idempotencia: la hereda de quien lo llama, y esa es la parte que hay
que preservar al agregar un correo nuevo.

| Correo | Disparador | Por qué no se duplica |
|---|---|---|
| Confirmación (comprador) | step `notify-buyer` del Workflow post-pago | Workflows hace checkpoint de cada `step.do`; la instancia usa `id = orderId`, así que no se crea dos veces. El webhook además deduplica por `event.id` (TASK-022). |
| Venta nueva (tienda) | step `notify-seller` | Igual, en un step aparte: si uno se reintentara, no reenvía el otro. |
| Va en camino (comprador) | `POST /seller/orders/:id/ship` | El UPDATE está guardado por `shipped_at IS NULL`; una segunda llamada responde 409 y nunca llega al envío. |
| Listo para recoger (comprador) | `POST /seller/orders/:id/ready` | Mismo patrón con `ready_at IS NULL`. |

Dos reglas que sostienen todo esto:

- **Un correo nunca hace fallar una orden.** `sendEmail` no lanza, y encima
  `order-emails.ts` envuelve cada envío en un `try/catch` que solo loguea. Un
  step que no puede lanzar tampoco reintenta — que es justamente lo que evita
  el reenvío.
- **Los envíos del panel van en `waitUntil`.** La respuesta del vendedor no se
  cuelga esperando al proveedor.

### Qué NO llevan

Los correos al comprador **jamás** incluyen la comisión de la plataforma ni
nada que sugiera que The Pub Market retiene el dinero: la compra es con la
tienda. Hay un test que falla si alguna plantilla al comprador menciona
comisión, fee o saldo (`email-templates.test.ts`).

### No llegó un correo — dónde buscar

1. **¿En qué modo está el ambiente?** Con `EMAIL_MODE` distinto de `send` no se
   envía nada y el mensaje completo queda en el log con el prefijo `[email]`.
   En local eso es lo normal (§`EMAIL_MODE`).
2. **`[email] send failed → destinatario (asunto): motivo`** — el proveedor
   rechazó. El cuerpo nunca se loguea.
3. **`[order-email] <tipo> failed for order <id>`** — falló armando los datos,
   no enviando. La orden está bien; el correo no salió.
4. **`[order-email] ... no linked user`** — la tienda todavía no reclama su
   cuenta (`sellers.user_id` en NULL), así que no hay a dónde mandarle el aviso
   de venta nueva. Se resuelve con la invitación (ver `invitacion-sellers.md`).
5. **¿Llegó el evento de Stripe?** Si no hubo webhook, tampoco hubo Workflow ni
   correos: revisa el ledger de eventos en `pagos.md`
   (`SELECT ... FROM webhook_events WHERE status='received'`).
