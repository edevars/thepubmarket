/**
 * Onboarding de Stripe Connect (`/seller/connect`). Autoservicio para que
 * cualquier seller invitado (vetted, ya con fila en `sellers` — el alta la
 * hace un admin, ver TASK-010) cree/retome su cuenta Express de Stripe.
 *
 * NO CUSTODIA (fondos del comprador): esta cuenta Express es la que recibe
 * el direct charge en el checkout (`stripeAccount`, ver `lib/stripe.ts`).
 * Aquí NUNCA se crean transfers ni se toca un balance de plataforma con
 * fondos de compradores — solo se crea la cuenta y el link de onboarding
 * hospedado por Stripe.
 *
 * KYC/AML, verificación de identidad y obligaciones fiscales quedan 100% en
 * manos de Stripe (`controller.requirement_collection: 'stripe'`); esta ruta
 * no valida ni recolecta ningún dato de identidad.
 *
 * ⚠️ Hallazgo de compliance (ver notas de TASK-007): Stripe EXIGE, para
 * `stripe_dashboard.type = 'express'`, que la plataforma sea `fees.payer` y
 * `losses.payments` = `'application'` — o sea, la plataforma queda expuesta
 * a nivel Stripe a saldos negativos/contracargos que la cuenta del seller no
 * pueda cubrir. Es un hard constraint de la API (verificado en vivo), no una
 * elección de este código. NO es custodia de fondos del comprador (el direct
 * charge sigue liquidando en la cuenta del seller), pero SÍ es una exposición
 * financiera de la plataforma que no estaba contemplada en el plan original
 * y requiere sign-off explícito antes de onboardear sellers reales.
 *
 * Va detrás de `sellerConnectAuth` (permite status `invited` o `active`,
 * NO `sellerAuth`) — un seller recién invitado, sin cuenta de Stripe
 * todavía, necesita poder llegar aquí.
 */
import { sellers } from '@thepubmarket/db'
import type { ConnectOnboardingLinkResponse, ConnectStatusResponse } from '@thepubmarket/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { createStripe } from '../lib/stripe'
import type { AppEnv } from '../types'

export const sellerConnect = new Hono<AppEnv>()

/**
 * POST /seller/connect/onboarding-link — crea (si hace falta) la cuenta
 * Express del seller y devuelve una Account Link fresca para completar o
 * retomar el onboarding. Idempotente y seguro de llamar repetidas veces:
 * los Account Links de Stripe expiran rápido, así que "reintentar" es
 * simplemente pedir uno nuevo — la cuenta subyacente nunca se recrea.
 */
sellerConnect.post('/onboarding-link', async (c) => {
  const user = c.get('user')
  const seller = c.get('seller')
  if (!user || !seller) return c.json({ error: 'not_a_seller' }, 403)

  const db = c.get('db')
  const stripe = createStripe(c.env.STRIPE_SECRET_KEY)

  let accountId = seller.stripeConnectAccountId
  if (!accountId) {
    // Cuenta Connect Express, MX. `controller` explícito (reemplaza el
    // `type: 'express'` legado) — verificado en vivo contra la API de Stripe:
    //   - requirement_collection: 'stripe' → Stripe recolecta y valida el
    //     KYC/AML, no lógica propia de la plataforma (AC#4).
    //   - stripe_dashboard.type: 'express' → onboarding autoservicio vía
    //     Account Link + Express Dashboard para el seller (AC#1).
    //   - fees.payer: 'application' / losses.payments: 'application' → Stripe
    //     EXIGE esta combinación cuando stripe_dashboard.type = 'express'
    //     (probado en vivo: "When `stripe_dashboard[type]=express`, your
    //     platform must collect fees and be liable for negative balances or
    //     refunds and chargebacks" — no es una preferencia, es un hard
    //     constraint de la API). Esto es DISTINTO de la no-custodia de fondos
    //     del comprador (el direct charge sigue liquidando 100% en la cuenta
    //     del seller, sin transfers ni balance de plataforma en el pago) —
    //     pero SÍ significa que la plataforma queda expuesta, a nivel Stripe,
    //     a saldos negativos/contracargos de este seller si su cuenta no
    //     alcanza a cubrirlos. Requiere sign-off explícito de negocio/
    //     compliance — ver hallazgo en TASK-007 antes de habilitar sellers
    //     reales (no solo de prueba).
    const account = await stripe.accounts.create({
      country: 'MX',
      email: user.email,
      controller: {
        stripe_dashboard: { type: 'express' },
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        requirement_collection: 'stripe',
      },
      // card_payments + transfers: par requerido por Stripe para que
      // card_payments quede activable (ver docs.stripe.com/connect/
      // account-capabilities). No se solicita ninguna otra capability:
      // no hay custom capabilities de método de pago fuera de tarjeta, y NO
      // se usa `transfers.create` en ningún punto del código — la plataforma
      // jamás mueve fondos hacia/desde esta cuenta.
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    })
    accountId = account.id

    // Persistir DE INMEDIATO, aunque el seller nunca termine el onboarding:
    // así un reintento reutiliza la misma cuenta en vez de crear cuentas
    // huérfanas en Stripe.
    await db
      .update(sellers)
      .set({ stripeConnectAccountId: accountId })
      .where(eq(sellers.id, seller.id))
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${c.env.WEB_BASE_URL}/panel/connect/refresh`,
    return_url: `${c.env.WEB_BASE_URL}/panel/connect/return`,
  })

  const body: ConnectOnboardingLinkResponse = { url: accountLink.url }
  return c.json(body)
})

/**
 * GET /seller/connect/status — estado de onboarding en vivo (consulta
 * directa a Stripe, no solo lo que dice `sellers.status` localmente). Sirve
 * para que el panel muestre "onboarding pendiente" vs. "cuenta lista" antes
 * de que llegue el webhook `account.updated` que hace el flip definitivo.
 */
sellerConnect.get('/status', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)

  if (!seller.stripeConnectAccountId) {
    const body: ConnectStatusResponse = {
      status: seller.status,
      chargesEnabled: null,
      detailsSubmitted: null,
    }
    return c.json(body)
  }

  const stripe = createStripe(c.env.STRIPE_SECRET_KEY)
  const account = await stripe.accounts.retrieve(seller.stripeConnectAccountId)

  const body: ConnectStatusResponse = {
    status: seller.status,
    chargesEnabled: account.charges_enabled,
    detailsSubmitted: account.details_submitted,
  }
  return c.json(body)
})
