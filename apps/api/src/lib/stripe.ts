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
  /** Comisión de la plataforma en centavos (application fee). */
  applicationFeeCents: number
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
  return args.stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: args.lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency,
          unit_amount: l.unitPriceCents,
          product_data: { name: l.name },
        },
      })),
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
