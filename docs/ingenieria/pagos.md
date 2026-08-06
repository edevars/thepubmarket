# Ids de pago: de la orden al PaymentIntent

Qué id de Stripe existe en qué momento, dónde se guarda y cómo ir de una orden
a su pago (y del pago a la orden, que es lo que necesita una disputa).

Introducido en **TASK-021**, que arregló que `orders.stripe_payment_intent_id`
estuviera NULL en **todas** las órdenes.

---

## 1. La línea de tiempo

Un cargo directo en la cuenta Connect del vendedor produce tres objetos, y **no
existen al mismo tiempo**:

| Momento | Qué existe | Qué guardamos |
|---|---|---|
| `POST /checkout` | Checkout Session | `orders.stripe_checkout_session_id` |
| El comprador abre la página de pago y mete tarjeta | nace el **PaymentIntent** | — |
| `checkout.session.completed` | Session + PaymentIntent (+ Charge) | `orders.stripe_payment_intent_id` |

### Por qué el PaymentIntent no se puede leer al crear la sesión

En `mode: payment`, Stripe **no crea el PaymentIntent hasta que el comprador
empieza a pagar**. `session.payment_intent` es `null` en la respuesta de
`checkout.sessions.create`, siempre, sin excepción.

Ese es exactamente el bug de TASK-021: `checkout.ts` leía ese campo justo
después de crear la sesión y guardaba el `null` resultante. Nunca falló, nunca
avisó — solo dejó la columna vacía en producción durante meses.

**No reintroduzcas esa lectura.** Hay un comentario en `checkout.ts` diciéndolo
y un test en `lib/stripe.test.ts` que fija el caso `null`.

---

## 2. Dónde se persiste hoy

El único evento que trae el id es `checkout.session.completed`. El webhook lo
extrae con `paymentIntentIdFrom()` y **se lo pasa al Workflow post-pago**; no lo
escribe él mismo:

```
webhook checkout.session.completed
  └─ POST_PAYMENT.create({ id: orderId, params: { orderId, paymentIntentId } })
       1. settle-order          orden pending→paid + descuento de inventario
       2. link-payment-intent   UPDATE ... SET stripe_payment_intent_id = ?
       3. commit-reservations
       4. notify (stub)
```

Tres decisiones que importan:

- **Lo escribe el Workflow, no el handler.** El webhook deduplica insertando
  `event.id` en `webhook_events` *antes* de hacer nada; si una escritura fallara
  ahí, el reintento de Stripe se descartaría como duplicado y el dato se
  perdería para siempre. Cada `step.do` del Workflow, en cambio, reintenta solo.
- **Va después del settle.** Es contabilidad, no dinero. Si el enlace falla, la
  orden ya quedó pagada y el inventario descontado. Nunca al revés.
- **El UPDATE lleva `AND stripe_payment_intent_id IS NULL`.** Un evento
  redelivered, un reintento del step o una segunda instancia no sobrescriben.
  Si llega un id distinto al que ya estaba, se loguea como `error` (significaría
  dos pagos apuntando a la misma orden) y **no** se pisa el valor.

Sin `paymentIntentId` en los params, el step es un no-op con warning: la columna
se queda NULL. Una orden que nadie pagó no debe tener un placeholder.

---

## 3. Ir de una orden a su pago

```sh
# orden → pago
npx wrangler d1 execute thepubmarket-db --remote \
  --command "SELECT stripe_payment_intent_id, stripe_checkout_session_id FROM orders WHERE id='<orderId>'"

# pago → orden (esto es lo que necesitas cuando llega una disputa)
npx wrangler d1 execute thepubmarket-db --remote \
  --command "SELECT id, status FROM orders WHERE stripe_payment_intent_id='<pi_...>'"
```

Los cargos son **directos en la cuenta del vendedor**, así que cualquier consulta
a Stripe va con `--stripe-account`:

```sh
stripe payment_intents retrieve pi_... --stripe-account acct_...
stripe checkout sessions retrieve cs_... --stripe-account acct_...
```

Sin ese flag Stripe busca en la cuenta de la plataforma y responde
`resource_missing`, que se lee como "no existe" cuando en realidad es "no es
mía". La cuenta sale de `sellers.stripe_connect_account_id`.

### El índice único vuelve a servir

`idx_orders_stripe_payment_intent_id` es UNIQUE, pero SQLite permite NULLs
ilimitados en un índice único: mientras la columna estuvo vacía en todas las
filas, el índice **no garantizaba nada**. Ahora que se llena, sí impide que dos
órdenes queden apuntando al mismo pago.

---

## 4. Backfill del 2026-08-02

Las 7 órdenes que existían en producción tenían la columna NULL. Se resolvieron
así:

| Órdenes | Estado | Qué se hizo |
|---|---|---|
| 4 | `fulfilled` | Backfill: se recuperó cada Checkout Session de Stripe con `--stripe-account` y se copió su `payment_intent` con un `UPDATE ... WHERE stripe_payment_intent_id IS NULL` |
| 3 | `cancelled` | **Se dejaron en NULL a propósito.** Sus sesiones están `expired` / `unpaid`: nunca hubo PaymentIntent que guardar |

Que las canceladas se queden NULL no es deuda pendiente — es el valor correcto.

---

## 5. Diagnóstico

| Síntoma | Dónde mirar |
|---|---|
| Orden pagada con `stripe_payment_intent_id` NULL | Logs del Workflow: `[post-payment] orden … sin paymentIntentId`. Significa que el evento llegó sin `payment_intent`. Recuperable a mano desde `stripe_checkout_session_id` (sección 3). |
| `[post-payment] orden … ya tenía pi=…, llegó …` | Dos PaymentIntents distintos para la misma orden. No se sobrescribió nada; investiga en Stripe antes de tocar la fila. |
| Llega una disputa y el `pi` no coincide con ninguna orden | Si es anterior al 2026-08-02 y no está en el backfill, búscala por `stripe_checkout_session_id`. Si es posterior, el enlace falló: revisa los logs del Workflow de esa orden. |
| `resource_missing` consultando un `pi_…` en Stripe | Falta `--stripe-account`. El cargo vive en la cuenta del vendedor, no en la de la plataforma. |
| La columna se llenó al crear la sesión | Imposible hoy, y si vuelve a pasar es que alguien reintrodujo la lectura de `session.payment_intent` en `checkout.ts`. Ver sección 1. |
| El comprador pagó pero la orden sigue `pending` | El `checkout.session.completed` no llegó o el Workflow murió: revisa sus instancias con `wrangler workflows instances describe post-payment <orderId>`. |

---

## 6. No custodia

Nada de esto toca el flujo de fondos: el cargo se sigue creando en la cuenta
Connect del vendedor (direct charge) y la plataforma sigue cobrando solo
`application_fee_amount`. Guardar el id es contabilidad — saber qué pago
corresponde a qué orden — no un paso más en el camino del dinero.
