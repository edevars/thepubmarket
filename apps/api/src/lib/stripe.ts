/**
 * Cliente de Stripe para Workers y helper de Checkout sin custodia.
 *
 * NO CUSTODIA DE FONDOS: usamos **direct charges**. La Checkout Session se crea
 * EN la cuenta Connect del seller (`stripeAccount`), y la plataforma solo cobra
 * `application_fee_amount`. El dinero nunca toca el balance de la plataforma; no
 * hay transfers ni separate charges & transfers.
 */
import Stripe from 'stripe'

/** Crea el cliente de Stripe con el http client basado en fetch (Workers). */
export function createStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

/**
 * Normalizes the `payment_intent` of a Checkout Session to a plain id.
 *
 * Stripe types it as `string | PaymentIntent | null`: a plain id unless the
 * caller expanded it. Beware: **at session-creation time it is always null** in
 * `mode: payment` — the PaymentIntent does not exist until the buyer starts
 * paying. The only moment it is populated is `checkout.session.completed`.
 */
export function paymentIntentIdFrom(session: {
  payment_intent?: string | { id: string } | null
}): string | null {
  const pi = session.payment_intent
  if (!pi) return null
  return typeof pi === 'string' ? pi : pi.id
}

export interface CheckoutLine {
  name: string
  unitPriceCents: number
  quantity: number
}

export interface CreateCheckoutArgs {
  stripe: Stripe
  /** Cuenta Connect del seller — el cargo se crea AQUÍ (direct charge). */
  connectedAccountId: string
  orderId: string
  buyerEmail: string
  lines: CheckoutLine[]
  /**
   * Comisión de la plataforma en centavos (application fee).
   *
   * Se calcula SOLO sobre el subtotal de producto. El envío entra como una
   * línea más del cargo y liquida completo al seller: la plataforma no cobra
   * comisión sobre flete que no realiza.
   */
  applicationFeeCents: number
  /**
   * Envío cobrado al comprador, en centavos. 0 en recolección en tienda.
   * Va como línea propia para que el recibo de Stripe lo desglose en vez de
   * esconderlo dentro del precio de las cartas.
   */
  shippingCents?: number
  /** Etiqueta de la línea de envío en el recibo (idioma del comprador). */
  shippingLabel?: string
  webBaseUrl: string
  currency?: string
}

/**
 * Crea una Stripe Checkout Session (hospedada) como **direct charge** en la
 * cuenta Connect del seller, con application fee para la plataforma.
 */
export async function createCheckoutSession(
  args: CreateCheckoutArgs,
): Promise<Stripe.Checkout.Session> {
  const currency = args.currency ?? 'mxn'
  const lineItems = args.lines.map((l) => ({
    quantity: l.quantity,
    price_data: {
      currency,
      unit_amount: l.unitPriceCents,
      product_data: { name: l.name },
    },
  }))

  // El envío es una línea más del MISMO direct charge: liquida al seller junto
  // con el producto. No hay transfer aparte ni paso por la plataforma.
  if (args.shippingCents && args.shippingCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: args.shippingCents,
        product_data: { name: args.shippingLabel ?? 'Envío' },
      },
    })
  }

  return args.stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: lineItems,
      payment_intent_data: {
        // Comisión de la plataforma; el resto liquida directo al seller.
        application_fee_amount: args.applicationFeeCents,
        // Propaga el orderId al PaymentIntent (lo usa el webhook en pagos fallidos).
        metadata: { orderId: args.orderId },
      },
      client_reference_id: args.orderId,
      customer_email: args.buyerEmail,
      metadata: { orderId: args.orderId },
      success_url: `${args.webBaseUrl}/checkout/success?order=${args.orderId}`,
      cancel_url: `${args.webBaseUrl}/checkout/cancel?order=${args.orderId}`,
    },
    // Direct charge: la operación ocurre en la cuenta Connect del seller.
    { stripeAccount: args.connectedAccountId },
  )
}
