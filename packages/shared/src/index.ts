/**
 * Tipos compartidos entre el Worker (apps/api) y el frontend (apps/web).
 *
 * Mantener este paquete mínimo y sin dependencias: es solo un contrato.
 */

/** Estado de un subsistema verificado por el health check. */
export type HealthStatus = 'ok' | 'error'

/** Respuesta de `GET /health` del Worker. */
export interface HealthResponse {
  /** Estado global del servicio. */
  status: HealthStatus
  /** Conectividad con D1 (base transaccional). */
  db: HealthStatus
  /** Marca de tiempo unix en segundos. */
  timestamp: number
}

// =====================================================================
// Catálogo / inventario (Fase 1)
// =====================================================================

/**
 * Seller ancla: The Pub Game Store. UUID fijo sembrado en la migración
 * 0003_seed_anchor_seller.sql. En Fase 1 es el ÚNICO seller; el admin de carga
 * usa este id por defecto al crear inventario.
 */
export const ANCHOR_SELLER_ID = '00000000-0000-4000-8000-000000000001'

/** Trading Card Game soportado. Códigos estables usados en filtros y URLs. */
export type Tcg = 'mtg' | 'pokemon' | 'yugioh' | 'onepiece' | 'lorcana' | 'riftbound'

export const TCGS: readonly Tcg[] = ['mtg', 'pokemon', 'yugioh', 'onepiece', 'lorcana', 'riftbound']

/** Estado físico de un single. Orden de mejor a peor. */
export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG'

/** Acabado de la carta. MTG: foil / no-foil (etched llega en fases posteriores). */
export type Finish = 'nonfoil' | 'foil'

export const CONDITIONS: readonly Condition[] = ['NM', 'LP', 'MP', 'HP', 'DMG']
export const FINISHES: readonly Finish[] = ['nonfoil', 'foil']

/**
 * Snapshot de los datos canónicos de una carta tomados de Scryfall (fuente de
 * verdad). Se guardan en la fila de inventory para renderizar sin volver a
 * llamar a Scryfall. Las cartas son inmutables, por eso el snapshot es seguro.
 */
export interface CardSnapshot {
  /** Identificador único de la impresión en Scryfall. */
  scryfallId: string
  /** Identificador del oracle (la carta lógica, compartido entre impresiones). */
  oracleId: string
  /** Nombre de la carta. */
  name: string
  /** Código del set (p.ej. 'mh3'). */
  setCode: string
  /** Nombre legible del set (p.ej. 'Modern Horizons 3'). */
  setName: string
  /** Número de coleccionista dentro del set. */
  collectorNumber: string
  /** Idioma de la impresión según Scryfall (p.ej. 'en', 'es'). */
  lang: string
  /** Rareza (p.ej. 'common', 'rare', 'mythic'). */
  rarity: string
  /** Artista de la ilustración según Scryfall. Null si no se conoce. */
  artist: string | null
  /** Acabados disponibles para esta impresión según Scryfall. */
  finishes: string[]
  /**
   * URL de imagen de la carta servida por Scryfall.
   * TODO: migrar a R2 en fase posterior; por ahora se referencia directo.
   */
  imageUrl: string | null
}

/**
 * Un item de inventario: un single físico a la venta, ligado a una impresión de
 * Scryfall. Combina el snapshot de la carta con los datos de la oferta.
 */
export interface InventoryItem {
  /** UUID del item de inventario. */
  id: string
  /** Seller que ofrece el item. */
  sellerId: string
  /** Nombre de la tienda vendedora (para la línea "Vendido por"). */
  sellerName: string
  /** Vendedor verificado / tienda física vetada. */
  sellerVerified: boolean
  /** Juego al que pertenece la carta. */
  tcg: Tcg
  /** Carta (snapshot de Scryfall). */
  card: CardSnapshot
  /** Condición física. */
  condition: Condition
  /** Idioma del single ofrecido (puede diferir del de la impresión base). */
  language: string
  /** Acabado ofrecido. */
  finish: Finish
  /** Precio en centavos MXN (entero, nunca float). */
  priceCents: number
  /** Cantidad disponible. */
  quantity: number
  /** Estado de la publicación. */
  status: 'active' | 'inactive'
}

/** Respuesta paginada de `GET /catalog`. */
export interface CatalogListResponse {
  items: InventoryItem[]
  /** Total de items que cumplen el filtro (para paginación). */
  total: number
  limit: number
  offset: number
}

// =====================================================================
// Sellers / tiendas (perfil público de escaparate)
// =====================================================================

/** Clave de rango de días para los horarios de una tienda (i18n en el front). */
export type HoursKey = 'weekday' | 'friSat' | 'sunday' | 'holidays'

/** Una fila de horario. `open`/`close` en 'HH:MM' 24h; null = cerrado. */
export interface SellerHours {
  key: HoursKey
  open: string | null
  close: string | null
}

/**
 * Perfil público de un seller (tienda), tal como lo devuelve `GET /sellers`.
 * SOLO vitrina: nada de pagos, payouts ni Stripe Connect. `singlesCount` es
 * derivado del inventario activo (lo calcula la API, no es editable).
 */
export interface Seller {
  /** UUID del seller (tabla `sellers`; el ancla es ANCHOR_SELLER_ID). */
  id: string
  name: string
  /** Slug único usado en la URL `/tiendas/{slug}`. */
  slug: string
  status: 'invited' | 'active' | 'suspended'
  /** Vendedor verificado / tienda física vetada (modelo curado). */
  verified: boolean
  /** Monograma de 2 letras para el placeholder ("BC"). */
  monogram: string
  city: string
  neighborhood: string
  /** Año de alta en el market (para "En el market desde 2023"). */
  memberSince: number
  /** Descripción corta del hero. */
  blurb: string
  favoriteGames: Tcg[]
  yearsInHobby: number
  funFact: string
  address: string
  hours: SellerHours[]
  /** Número de WhatsApp en formato internacional (solo dígitos, con lada). */
  whatsapp: string
  /** Handle de Instagram sin arroba. */
  instagram: string
  /** Total de singles activos del vendedor (derivado del inventario). */
  singlesCount: number
}

/** Respuesta de `GET /sellers`. Sin paginación: lista curada por invitación. */
export interface SellerListResponse {
  items: Seller[]
}

// =====================================================================
// Auth (email + password)
// =====================================================================

/** Authenticated user as resolved from a session. */
export interface AuthUser {
  id: string
  email: string
  role: 'buyer' | 'admin'
  displayName: string | null
}

/** Session created by register/login/reset: Bearer token + user. */
export interface AuthSessionResponse {
  sessionToken: string
  user: AuthUser
}

export interface RegisterRequest {
  email: string
  password: string
  displayName?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  token: string
  password: string
}

// =====================================================================
// Órdenes / checkout (Fase 2)
// =====================================================================

/** Estado de una orden. */
export type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded'

/** Línea de una orden (snapshot de título y precio al momento de la compra). */
export interface OrderItemSummary {
  id: string
  inventoryId: string | null
  titleSnapshot: string
  unitPriceCents: number
  quantity: number
  lineTotalCents: number
}

/** Orden con sus líneas, tal como la devuelve la API al comprador. */
export interface OrderSummary {
  id: string
  status: OrderStatus
  sellerId: string
  subtotalCents: number
  platformFeeCents: number
  totalCents: number
  currency: string
  createdAt: number
  items: OrderItemSummary[]
}

// ---------------------------------------------------------------------
// Entrega — cómo llega la orden al comprador (TASK-019)
// ---------------------------------------------------------------------

/**
 * Cómo recibe el comprador su orden. Se elige ANTES de pagar y queda fijada en
 * la orden: el vendedor no puede cambiarla, porque el comprador ya pagó (o no)
 * el envío correspondiente.
 */
export type DeliveryMethod = 'shipping' | 'pickup'

/**
 * Costo de envío a domicilio, en centavos MXN.
 *
 * MOCK DELIBERADO. La tarifa real varía por destino y peso; mientras no exista
 * integración con paqueterías se cobra una tarifa plana. Vive aquí —y no en la
 * API— para que el resumen del carrito muestre exactamente lo que el servidor
 * va a cobrar. El servidor SIEMPRE recalcula: este valor es para previsualizar,
 * nunca se acepta un monto enviado por el cliente.
 */
export const SHIPPING_FLAT_CENTS = 20_000

/**
 * Días máximos que puede tardar una carta en llegar a la tienda de recolección
 * cuando no es la tienda vendedora. Es una expectativa que se le comunica al
 * comprador, no un plazo que el sistema haga cumplir.
 */
export const PICKUP_ETA_DAYS = 7

/** Dirección de entrega capturada en el checkout. Se guarda en la orden. */
export interface ShippingAddress {
  /** Quién recibe (puede no ser el titular de la cuenta). */
  recipient: string
  phone: string
  line1: string
  /** Interior, referencias. Opcional. */
  line2: string | null
  /** Colonia / barrio. */
  neighborhood: string | null
  city: string
  /** Estado de la República. */
  state: string
  postalCode: string
  /** ISO 3166-1 alpha-2. Solo 'MX' por ahora (mercado inicial). */
  country: string
}

/**
 * Tienda aliada donde se puede recoger una orden: la vendedora o cualquier otra
 * tienda ACTIVA de la misma ciudad. Solo datos de vitrina — nada de pagos.
 */
export interface PickupPoint {
  id: string
  name: string
  slug: string
  city: string
  neighborhood: string
  address: string
  hours: SellerHours[]
  /** true si es la tienda que vende la orden (no hay traslado de por medio). */
  isSellingStore: boolean
}

/** Respuesta de `GET /checkout/pickup-points?sellerId=`. */
export interface PickupPointsResponse {
  items: PickupPoint[]
}

/**
 * Elección de entrega que el comprador manda al crear el checkout.
 *
 * Unión discriminada a propósito: no existe un estado intermedio válido donde
 * haya dirección Y tienda de recolección, ni uno donde no haya ninguna de las
 * dos. El servidor la valida con el mismo shape.
 */
export type DeliverySelection =
  | { method: 'shipping'; address: ShippingAddress }
  | { method: 'pickup'; pickupSellerId: string }

/** Cuerpo de `POST /checkout`: líneas del carrito (todas del mismo seller). */
export interface CheckoutRequest {
  items: Array<{ inventoryId: string; quantity: number }>
  /** Obligatorio: sin esto la tienda no sabe a dónde mandar el paquete. */
  delivery: DeliverySelection
}

/**
 * Entrega ya fijada en una orden, como la devuelve la API.
 *
 * `method` es null en órdenes anteriores a TASK-019: existen en producción y
 * deben seguir renderizando. Toda vista que lo consuma tiene que tolerar ese
 * null en vez de asumir que siempre hay método.
 */
export interface OrderDelivery {
  method: DeliveryMethod | null
  /** Presente solo cuando `method === 'shipping'`. */
  address: ShippingAddress | null
  /** Presente solo cuando `method === 'pickup'`: tienda donde se recoge. */
  pickupPoint: { id: string; name: string; slug: string; address: string } | null
}

/** Respuesta de `POST /checkout`: a dónde redirigir para pagar. */
export interface CheckoutResponse {
  orderId: string
  /** URL de Stripe Checkout (hospedado) a la que redirige el frontend. */
  url: string
}

// =====================================================================
// Panel del Vendedor (API /seller, autenticada por sesión + fila en sellers)
// =====================================================================

/**
 * Estado DERIVADO de una orden para el panel del seller. La columna
 * `orders.status` conserva su enum original; 'shipped'/'delivered' se derivan
 * de `shippedAt`/`deliveredAt` (entregada además fija status 'fulfilled').
 */
export type SellerOrderStatus =
  | 'pending'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

/** Orden vista por su seller, con envío y liquidación desglosada. */
export interface SellerOrder {
  id: string
  /** Folio corto para UI ("#TPM-3F2A"). */
  shortId: string
  status: SellerOrderStatus
  createdAt: number
  shippedAt: number | null
  deliveredAt: number | null
  trackingNumber: string | null
  /** Comprador enmascarado (displayName o local-part truncado del email). */
  buyerLabel: string
  /** Cómo entregar la orden: a domicilio o en tienda aliada. */
  delivery: OrderDelivery
  subtotalCents: number
  /** Envío cobrado al comprador. 0 en recolección en tienda. */
  shippingCents: number
  totalCents: number
  platformFeeCents: number
  /** Lo que recibe el seller: subtotal − comisión (application fee). */
  netCents: number
  items: OrderItemSummary[]
}

/** Respuesta de `GET /seller/orders`. */
export interface SellerOrdersResponse {
  items: SellerOrder[]
}

/** Respuesta de `GET /seller/me`: identidad de tienda + comisión vigente. */
export interface SellerPanelMe {
  seller: Seller
  /** Comisión de la plataforma en basis points (800 = 8%). */
  feeBps: number
}

/** Cuerpo de `POST /seller/inventory` (el sellerId lo fija la sesión). */
export interface CreateListingRequest {
  scryfallId: string
  condition: Condition
  finish: Finish
  language: string
  priceCents: number
  quantity: number
}

/** Cuerpo de `PATCH /seller/inventory/:id`. Pausar = status 'inactive'. */
export interface UpdateListingRequest {
  priceCents?: number
  quantity?: number
  condition?: Condition
  status?: 'active' | 'inactive'
}

// =====================================================================
// Mis Compras (vista del comprador: rastreo de sus órdenes)
// =====================================================================

/**
 * Línea de orden enriquecida para el comprador. Los campos extra vienen de un
 * JOIN al inventario original; son null si el listing ya no existe (el FK es
 * set-null al borrar).
 */
export interface BuyerOrderItem extends OrderItemSummary {
  condition: Condition | null
  setCode: string | null
  imageUrl: string | null
}

/**
 * Orden vista por su comprador. Mismo estado derivado que el panel del seller
 * (paid/shipped/delivered + terminales). SIN `platformFeeCents`: la comisión
 * es información del vendedor, el comprador solo ve lo que pagó.
 */
export interface BuyerOrder {
  id: string
  /** Folio corto para UI ("#TPM-3F2A"). */
  shortId: string
  status: SellerOrderStatus
  createdAt: number
  shippedAt: number | null
  deliveredAt: number | null
  trackingNumber: string | null
  /** Tienda vendedora (una orden = un seller). */
  seller: { name: string; slug: string; verified: boolean }
  /** Cómo llega la orden: a domicilio o a recoger en tienda aliada. */
  delivery: OrderDelivery
  subtotalCents: number
  /** Envío cobrado al comprador. 0 en recolección en tienda. */
  shippingCents: number
  totalCents: number
  items: BuyerOrderItem[]
}

/** Respuesta de `GET /orders` (lista del comprador). */
export interface BuyerOrdersResponse {
  items: BuyerOrder[]
}

// =====================================================================
// Onboarding de Stripe Connect (self-service para sellers invitados)
// =====================================================================

/**
 * Respuesta de `POST /seller/connect/onboarding-link`: URL de Stripe hospedada
 * (Account Link) a la que se redirige al seller para completar/retomar su
 * KYC. Expira rápido (minutos) — pedir una nueva en cada intento, nunca
 * cachear esta URL.
 */
export interface ConnectOnboardingLinkResponse {
  url: string
}

/**
 * Respuesta de `GET /seller/connect/status`: estado de onboarding en vivo
 * (consultado directo a Stripe, no solo el status local en `sellers`).
 * `chargesEnabled`/`detailsSubmitted`/`payoutsEnabled` son null si el seller
 * todavía no tiene cuenta de Stripe creada.
 */
export interface ConnectStatusResponse {
  status: 'invited' | 'active' | 'suspended'
  chargesEnabled: boolean | null
  detailsSubmitted: boolean | null
  payoutsEnabled: boolean | null
}

/**
 * Un payout leído en vivo desde la cuenta Connect del seller (nunca
 * almacenado ni agregado por la plataforma — puramente observacional).
 */
export interface ConnectPayout {
  id: string
  amountCents: number
  currency: string
  /** 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed' (Stripe Payout.status). */
  status: string
  /** Unix seconds — fecha estimada/real de llegada a la cuenta bancaria del seller. */
  arrivalDate: number
  /** Unix seconds — cuándo Stripe creó el payout. */
  createdAt: number
}

/** Respuesta de `GET /seller/connect/payouts`: historial reciente, más nuevo primero. */
export interface ConnectPayoutsResponse {
  items: ConnectPayout[]
}
