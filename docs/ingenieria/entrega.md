# Entrega de órdenes

Cómo llega una orden al comprador: qué elige, qué se cobra, qué se guarda y
dónde mirar cuando algo no cuadra.

La elección se introdujo en **TASK-019** y el cumplimiento en **TASK-020**
(sección 3). Los correos de cada evento son **TASK-017**: hoy **nada avisa
automáticamente al comprador**, solo cambia lo que ve en Mis compras.

---

## 1. Las dos opciones

El comprador elige **antes de pagar**, en un paso obligatorio entre el carrito
y Stripe (`/cart`, fase `delivery`). No hay default: una orden sin destino es
una orden que la tienda no puede cumplir.

| | Envío a domicilio | Recoger en tienda aliada |
|---|---|---|
| Costo | **MXN 200** (plano, mockeado) | Gratis |
| Requiere | Dirección completa | Elegir tienda |
| Tiempo | El de la paquetería | Hasta **7 días** si viaja desde la tienda vendedora |
| Se guarda en | Columnas `shipping_*` de `orders` | `orders.pickup_seller_id` |

### El MXN 200 es un mock

Vive en `packages/shared/src/index.ts` como `SHIPPING_FLAT_CENTS = 20_000`.

Está en `shared` —y no en la API— para que el resumen del carrito muestre
exactamente el monto que el servidor va a cobrar, sin duplicar la constante.
**El servidor siempre recalcula:** `POST /checkout` deriva el monto del método
elegido con `shippingCentsFor()` y nunca lee una cantidad del request. Un
cliente que pudiera nombrar su propio envío podría nombrar cero.

Cuando existan tarifas reales por destino y peso, esto se reemplaza por una
cotización; el punto de cambio es `shippingCentsFor()` en
`apps/api/src/lib/delivery.ts`.

### Qué cuenta como "tienda aliada de la misma ciudad"

Regla en `isEligiblePickupPoint()`. Una tienda califica si:

1. su `status` es `active`, **y**
2. es la tienda vendedora (no hay traslado de por medio), **o** su ciudad
   normalizada coincide con la de la tienda vendedora.

`normalizeCity()` quita acentos, espacios y mayúsculas, así que `"Ciudad de
México"`, `" ciudad de mexico "` y `"CIUDAD DE MEXICO"` son la misma. **No**
sabe que `CDMX` y `Ciudad de México` son el mismo lugar — eso es un problema de
calidad de datos en `sellers.city` (texto libre capturado en el alta), y se
arregla normalizando las filas, no agregando alias en el código. Hay un test que
documenta ese límite a propósito.

Si la tienda vendedora no tiene ciudad registrada, la única opción de
recolección es ella misma: ofrecer todas las tiendas de la plataforma sería
peor que no ofrecer ninguna.

**Lista vacía es un resultado válido.** El front cae a envío a domicilio y
deshabilita la opción de recoger; no es un error.

---

## 2. Dinero — no custodia

La regla de CLAUDE.md se sostiene sin excepciones:

- El envío entra como **una línea más del mismo direct charge** en la cuenta
  Connect del seller. No hay transfer aparte ni paso por la plataforma.
- Liquida **íntegro al seller**, que es quien paga la paquetería.
- `application_fee_amount` se calcula **solo sobre el subtotal de producto**.
  La plataforma no cobra comisión sobre flete que no realiza.

Verificado en la orden de prueba local:

```
subtotal_cents      21000
shipping_cents      20000
total_cents         41000
platform_fee_cents   2100   ← 10% de 21000, NO de 41000
```

Si algún día la plataforma se quedara con el envío, sería subiéndolo al
application fee — sigue siendo no custodia, pero es una **decisión explícita de
precio**, no un efecto secundario. Hoy no es así.

---

## 3. Cumplimiento — cómo avanza una orden pagada

El método que eligió el comprador determina la secuencia. **No se cruzan**: la
API rechaza con 409 cualquier transición que no corresponda al método.

| | Envío a domicilio | Recoger en tienda |
|---|---|---|
| Secuencia | pagada → **enviada** → entregada | pagada → **lista** → recogida |
| Acción en el panel | "Confirmar" con guía (+ paquetería opcional) | "Marcar lista para recoger" |
| Cierre | "Marcar entregada" | "Marcar recogida" |
| Endpoints | `POST /seller/orders/:id/ship`, `/deliver` | `/ready`, `/collect` |
| Columna que la marca | `shipped_at` → `delivered_at` | `ready_at` → `delivered_at` |

### Los estados son derivados

`orders.status` conserva su enum original (`pending/paid/fulfilled/cancelled/
refunded`) y **nunca se amplía**: cambiar ese CHECK obligaría a recrear la tabla
y D1 rechaza ese patrón. Todo el avance sale de timestamps, en
`deriveSellerOrderStatus()`:

| Estado en la UI | De dónde sale |
|---|---|
| `paid` | `status='paid'`, sin timestamps |
| `shipped` | `shipped_at` |
| `ready` | `ready_at` |
| `delivered` | `delivered_at` o `status='fulfilled'` |

`ready_at` es **columna propia, no un `shipped_at` reutilizado**. Ahorrarse la
columna costaría la verdad: cualquier consulta de "qué mandamos por paquetería"
contaría recolecciones.

`delivered` es terminal de **ambos** métodos. Entregada por paquetería y
recogida en mostrador son el mismo hecho —el comprador ya tiene las cartas— y
solo cambia la etiqueta. Por eso no existe un estado `collected`: duplicarlo
obligaría a tocar cada filtro y cada suma de ventas para que no se perdiera la
mitad de las órdenes.

### Las guardas viven en el WHERE

Cada transición es un `UPDATE ... WHERE` con las condiciones que la hacen
válida: dueño, estado, método y timestamp previo. Si algo no cuadra no se
actualiza ninguna fila y la ruta responde **409**, nunca un éxito silencioso.
Marcar enviada una orden de otra tienda devuelve 409 (no 404): sin filtrar por
dueño primero no se distingue de un estado inválido, y esa opacidad es
deliberada.

| Error | Qué pasó |
|---|---|
| `not_shippable` | No es de envío, ya está enviada, no está pagada, o no es tuya |
| `not_pickup_ready` | No es de recolección, o ya estaba marcada lista |
| `not_deliverable` | No es de envío, aún no se envía, o ya se entregó |
| `not_collectable` | No es de recolección, aún no está lista, o ya se recogió |

### Paquetería

`carrier` es texto libre y **opcional**: una guía sin paquetería sigue siendo
mejor que ninguna guía, pero sin ella el comprador tiene un número que no puede
rastrear en ningún lado. No es un enum porque el catálogo de paqueterías
mexicanas cambia más seguido de lo que justificaría un constraint en el schema.

### Órdenes sin método

Las anteriores a TASK-019 (`delivery_method IS NULL`) se cumplen **como envío**:
`/ship` y `/deliver` las aceptan, `/ready` y `/collect` no. Ese NULL es
load-bearing, no tolerancia — son órdenes reales en producción y enviarlas era
el único cumplimiento que existía cuando se crearon.

---

## 4. Dónde vive cada cosa

| Pieza | Archivo |
|---|---|
| Contrato compartido (`DeliverySelection`, `PickupPoint`, constantes) | `packages/shared/src/index.ts` |
| Columnas de `orders` | `packages/db/src/schema.ts` + migración `0007` |
| Reglas (validación, ciudad, elegibilidad, monto) | `apps/api/src/lib/delivery.ts` |
| Tests de esas reglas | `apps/api/src/lib/delivery.test.ts` |
| Validación y persistencia al comprar | `apps/api/src/routes/checkout.ts` |
| Línea de envío en Stripe | `apps/api/src/lib/stripe.ts` |
| DTO y estado derivado (`orderToDelivery`, `deriveSellerOrderStatus`) | `apps/api/src/lib/orders.ts` |
| Tests del estado derivado | `apps/api/src/lib/orders.test.ts` |
| Transiciones de cumplimiento (`/ship`, `/deliver`, `/ready`, `/collect`) | `apps/api/src/routes/seller-panel.ts` |
| Paso de entrega en el front | `apps/web/src/components/checkout/DeliveryStep.tsx` |
| Orquestación de fases del carrito | `apps/web/src/app/[locale]/cart/page.tsx` |
| Panel: dirección / tienda destino y acciones | `apps/web/src/components/panel/OrdersView.tsx` |
| Mis compras: método, guía y aviso de recolección | `apps/web/src/components/compras/ComprasView.tsx` |

### Las migraciones 0007 y 0008

Puro `ALTER TABLE ADD COLUMN`, sin recrear la tabla — D1 rechaza ese patrón.
Por lo mismo `delivery_method` **no** tiene CHECK: se valida con zod en la app.
Es la misma razón por la que el enum de `orders.status` nunca se amplía.

Todas las columnas son nullables salvo `shipping_cents` (default 0), para que
las órdenes anteriores a TASK-019 sigan siendo válidas y sigan renderizando.

`0008` (TASK-020) agrega `carrier` y `ready_at` con el mismo patrón: dos
`ADD COLUMN` nullables, sin CHECK y sin tocar el enum de `status`.

---

## 5. Órdenes viejas

`delivery.method` llega como `null` en toda orden creada antes de TASK-019.
Existen en producción. Cualquier vista que lea `delivery` **tiene que tolerar
ese null** en vez de asumir que siempre hay método.

Verificado local: 13 órdenes previas renderizan sin error en `GET /orders` y
`GET /seller/orders` junto a las nuevas, y siguen pudiéndose marcar enviadas y
entregadas.

---

## 6. Diagnóstico

| Síntoma | Dónde mirar |
|---|---|
| No aparece ninguna tienda para recoger | `GET /checkout/pickup-points?sellerId=…`. Si devuelve `[]`, revisa `sellers.city` de la tienda vendedora y de las candidatas: casi siempre es que una dice `CDMX` y otra `Ciudad de México`. |
| Aparecen tiendas que no deberían | Alguna quedó `active` sin serlo, o comparten ciudad por escritura distinta. `SELECT id,name,city,status FROM sellers;` |
| `pickup_point_unavailable` al pagar | La tienda dejó de calificar entre que se pintó la lista y el submit (se suspendió, cambió de ciudad), o el cliente mandó un id que nunca estuvo en la lista. Es la revalidación del servidor haciendo su trabajo. |
| `invalid_body` al pagar | Falta `delivery`, o la dirección está incompleta / el CP no tiene 5 dígitos. El detalle viene en `issues`. |
| El total no cuadra con lo que vio el comprador | `orders.shipping_cents` vs `SHIPPING_FLAT_CENTS`. El servidor manda; si difieren, alguien cambió la constante sin desplegar ambos lados. |
| La comisión salió sobre el total | Bug: `computePlatformFeeCents` debe recibir `subtotalCents`, nunca `totalCents`. |
| 409 al marcar enviada / lista | La acción no aplica a esa orden. `SELECT delivery_method,status,shipped_at,ready_at,delivered_at FROM orders WHERE id='…';` — casi siempre es cruce de método o una transición ya aplicada. Ver la tabla de errores de la sección 3. |
| Una orden no aparece en ningún tab | Estado derivado que la vista no contempla. `deriveSellerOrderStatus` es la única fuente; revisa que los filtros de `OrdersView` / `ComprasView` incluyan el valor. |
| El comprador no supo que ya podía recoger | Hoy es correcto: no hay correo (TASK-017). Solo cambia lo que ve en Mis compras. |

---

## 7. Lo que queda abierto

- **La tarifa de MXN 200 es un placeholder.** No refleja destino ni peso.
- **Quién absorbe el traslado** de una carta desde la tienda vendedora hasta
  otra tienda de recolección es una pregunta operativa, no de software. Hoy el
  comprador no paga nada por esa opción.
- **`sellers.city` es texto libre.** Normalizar esas filas (o pasar a un
  catálogo de ciudades) hace que la recolección funcione de verdad conforme
  entren más tiendas.
- **Los 7 días son una expectativa comunicada**, no un plazo que el sistema
  vigile ni haga cumplir.
- **Nadie avisa al comprador** de ningún cambio de estado: los correos son
  TASK-017. Hasta entonces, "se le notificará cuando pueda pasar a recogerla"
  significa que lo verá en Mis compras si entra a mirar.
- **`carrier` es texto libre.** Dos vendedores pueden escribir `Estafeta` y
  `estafeta` y nada los une. Suficiente mientras nadie construya rastreo
  automático sobre ese campo.
