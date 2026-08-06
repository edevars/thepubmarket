/**
 * Transactional email templates.
 *
 * Pure functions: they take data, they return a rendered `EmailContent`. No
 * network, no bindings, no env — that lives in lib/email.ts. Keeping them pure
 * is what makes the copy reviewable and testable without a mail provider.
 *
 * Two conventions worth keeping as more emails land here (TASK-017):
 *
 * - **Spanish copy, English code.** These strings are product surface, same as
 *   the web UI; everything around them stays in English.
 * - **Always both bodies.** Every template returns `html` *and* `text`. Plain
 *   text is not a courtesy: clients that show it exist, and spam filters score
 *   HTML-only mail worse.
 *
 * Layout is deliberately plain — inline styles, a single column, no images and
 * no web fonts. Email clients are a hostile rendering target and a password
 * reset is not the place to find that out.
 */

import type { HoursKey, SellerHours } from '@thepubmarket/shared'

const BRAND_INK = '#060911'
const BRAND_PRIMARY = '#3b7bff'
const SUPPORT_NOTE = 'Si no fuiste tú, ignora este correo: tu contraseña no cambia.'

/** A rendered message, provider-agnostic. */
export interface EmailContent {
  subject: string
  html: string
  text: string
}

/** One line of an order, as the buyer and the seller need to read it. */
export interface OrderEmailItem {
  name: string
  setCode: string | null
  condition: string | null
  quantity: number
  lineTotalCents: number
}

/** Where the order is going: a home address or an allied store's counter. */
export type OrderEmailDelivery =
  | {
      method: 'shipping'
      recipient: string
      phone: string | null
      lines: string[]
    }
  | { method: 'pickup'; store: OrderEmailStore }
  // Orders created before the delivery model (TASK-019) carry no method. They
  // exist in production and must still render.
  | { method: null }

/** A store as an email needs it: where to go and when it is open. */
export interface OrderEmailStore {
  name: string
  address: string | null
  hours: SellerHours[]
}

/** Everything the order emails render from. Money already split by concept. */
export interface OrderEmailData {
  /** Short reference the buyer sees everywhere ("#TPM-3F2A"). */
  shortId: string
  storeName: string
  items: OrderEmailItem[]
  subtotalCents: number
  shippingCents: number
  totalCents: number
  delivery: OrderEmailDelivery
  /** Where the recipient goes to see the order (buyer: /compras, seller: /panel). */
  actionUrl: string
}

/** MXN in the shape the storefront uses. Cents in, never floats. */
function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MXN`
}

const HOURS_LABEL: Record<HoursKey, string> = {
  weekday: 'Lunes a jueves',
  friSat: 'Viernes y sábado',
  sunday: 'Domingo',
  holidays: 'Días festivos',
}

/** Store hours as readable lines. A closed range says so instead of vanishing. */
function hourLines(hours: SellerHours[]): string[] {
  return hours.map((h) =>
    h.open && h.close
      ? `${HOURS_LABEL[h.key]}: ${h.open}–${h.close}`
      : `${HOURS_LABEL[h.key]}: cerrado`,
  )
}

/** "2 × Sol Ring (CMM · NM)" — what to pull from a box, in one line. */
function itemLine(item: OrderEmailItem): string {
  const detail = [item.setCode?.toUpperCase(), item.condition].filter(Boolean).join(' · ')
  const name = detail ? `${item.name} (${detail})` : item.name
  return `${item.quantity} × ${name}`
}

function itemsHtml(items: OrderEmailItem[]): string {
  const rows = items
    .map(
      (item) => `<tr>
        <td style="padding:6px 0;color:#1b2436;">${escapeHtml(itemLine(item))}</td>
        <td style="padding:6px 0;text-align:right;color:#1b2436;white-space:nowrap;">${escapeHtml(money(item.lineTotalCents))}</td>
      </tr>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="margin:0 0 20px;font-size:14px;border-collapse:collapse;">${rows}</table>`
}

/**
 * Money block. Shipping only appears when it was charged, and the platform's
 * commission NEVER appears here: the buyer pays the store, and this email must
 * not suggest otherwise.
 */
function totalsHtml(data: OrderEmailData): string {
  const shipping =
    data.shippingCents > 0
      ? `<tr><td style="padding:4px 0;color:#5d6a89;">Envío</td>
           <td style="padding:4px 0;text-align:right;color:#5d6a89;">${escapeHtml(money(data.shippingCents))}</td></tr>`
      : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="margin:0 0 24px;font-size:14px;border-top:1px solid #e3e8f2;padding-top:8px;">
      <tr><td style="padding:8px 0 4px;color:#5d6a89;">Subtotal</td>
          <td style="padding:8px 0 4px;text-align:right;color:#5d6a89;">${escapeHtml(money(data.subtotalCents))}</td></tr>
      ${shipping}
      <tr><td style="padding:4px 0;font-weight:700;color:#0c1322;">Total</td>
          <td style="padding:4px 0;text-align:right;font-weight:700;color:#0c1322;">${escapeHtml(money(data.totalCents))}</td></tr>
    </table>`
}

/** Delivery block, phrased for whoever is reading it. */
function deliveryLines(delivery: OrderEmailDelivery, audience: 'buyer' | 'seller'): string[] {
  switch (delivery.method) {
    case 'shipping':
      return [
        audience === 'buyer' ? 'Llega a domicilio:' : 'Enviar a domicilio:',
        delivery.recipient,
        ...delivery.lines,
        ...(delivery.phone ? [`Tel. ${delivery.phone}`] : []),
      ]
    case 'pickup':
      return [
        audience === 'buyer' ? 'Recoges en tienda:' : 'Preparar para recoger en:',
        delivery.store.name,
        ...(delivery.store.address ? [delivery.store.address] : []),
        ...hourLines(delivery.store.hours),
      ]
    default:
      return ['Entrega: por confirmar con la tienda.']
  }
}

function linesHtml(lines: string[]): string {
  const [first, ...rest] = lines
  return `<p style="margin:0 0 20px;font-size:14px;line-height:1.7;">
      <strong style="color:#0c1322;">${escapeHtml(first ?? '')}</strong><br>
      ${rest.map((l) => escapeHtml(l)).join('<br>')}
    </p>`
}

/** Minimal escaping for anything interpolated into the HTML body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface LayoutOptions {
  /** Preview line some clients show next to the subject in the inbox list. */
  preheader: string
  heading: string
  /** Already-escaped HTML for the message body. */
  bodyHtml: string
  cta?: { label: string; url: string }
  /** Small print under the divider. */
  footerHtml?: string
}

function layout({ preheader, heading, bodyHtml, cta, footerHtml }: LayoutOptions): string {
  const button = cta
    ? `<p style="margin:28px 0;">
         <a href="${escapeHtml(cta.url)}"
            style="background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;
                   display:inline-block;padding:13px 24px;border-radius:8px;
                   font-weight:600;font-size:15px;">${escapeHtml(cta.label)}</a>
       </p>`
    : ''

  // The raw URL is repeated below the button on purpose: buttons get stripped,
  // and a reset link nobody can click is a support ticket.
  const fallback = cta
    ? `<p style="margin:0 0 24px;font-size:13px;color:#5d6a89;line-height:1.6;">
         Si el botón no funciona, copia y pega esta dirección en tu navegador:<br>
         <span style="color:#3f4d70;word-break:break-all;">${escapeHtml(cta.url)}</span>
       </p>`
    : ''

  return `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;padding:0;background:#f4f6fb;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
          <tr><td style="background:${BRAND_INK};padding:20px 32px;">
            <span style="color:#eef3ff;font-size:16px;font-weight:700;letter-spacing:.2px;">The Pub Market</span>
          </td></tr>
          <tr><td style="padding:32px;color:#1b2436;font-size:15px;line-height:1.65;">
            <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:#0c1322;">${escapeHtml(heading)}</h1>
            ${bodyHtml}
            ${button}
            ${fallback}
          </td></tr>
          <tr><td style="padding:0 32px 28px;">
            <hr style="border:0;border-top:1px solid #e3e8f2;margin:0 0 16px;">
            <p style="margin:0;font-size:12px;color:#7a88a8;line-height:1.6;">
              ${footerHtml ?? ''}
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

/**
 * Password reset link.
 *
 * `ttlMinutes` comes from the same constant that sets the token's KV TTL, so
 * the promise in the copy can't drift from what the token actually does.
 */
export function passwordResetEmail(link: string, ttlMinutes: number): EmailContent {
  const subject = 'Restablece tu contraseña — The Pub Market'
  const heading = 'Restablece tu contraseña'

  const html = layout({
    preheader: `El enlace vence en ${ttlMinutes} minutos.`,
    heading,
    bodyHtml: `<p style="margin:0 0 8px;">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta.
        Elige una nueva desde este enlace:
      </p>`,
    cta: { label: 'Elegir nueva contraseña', url: link },
    footerHtml: `El enlace vence en ${ttlMinutes} minutos y solo se puede usar una vez.
      ${SUPPORT_NOTE}`,
  })

  const text = [
    heading,
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
    'Abre este enlace para elegir una nueva:',
    '',
    link,
    '',
    `El enlace vence en ${ttlMinutes} minutos y solo se puede usar una vez.`,
    SUPPORT_NOTE,
    '',
    'The Pub Market',
  ].join('\n')

  return { subject, html, text }
}

// =====================================================================
// Order lifecycle (TASK-017)
//
// Four moments the order actually has: paid (buyer + store), shipped, and
// ready at the counter. Each one is the answer to a question someone is
// already asking, which is why there is no "your order is being processed".
// =====================================================================

/**
 * Purchase confirmation for the buyer.
 *
 * Carries what was bought, what it cost and how it arrives. Deliberately NOT
 * the platform's commission: the buyer's transaction is with the store, and
 * The Pub Market never holds the money.
 */
export function orderConfirmationEmail(data: OrderEmailData): EmailContent {
  const subject = `Compra confirmada ${data.shortId} — The Pub Market`
  const heading = '¡Listo! Tu compra está confirmada'
  const delivery = deliveryLines(data.delivery, 'buyer')

  const html = layout({
    preheader: `${data.storeName} ya tiene tu pedido ${data.shortId}.`,
    heading,
    bodyHtml: `<p style="margin:0 0 8px;">
        Pagaste tu pedido <strong>${escapeHtml(data.shortId)}</strong> con
        <strong>${escapeHtml(data.storeName)}</strong>. Ya les avisamos para que lo preparen.
      </p>
      ${itemsHtml(data.items)}
      ${totalsHtml(data)}
      ${linesHtml(delivery)}`,
    cta: { label: 'Ver mi compra', url: data.actionUrl },
    footerHtml: `Le compras directo a ${escapeHtml(data.storeName)}; The Pub Market solo conecta la venta.
      ¿Algo no cuadra? Responde este correo.`,
  })

  const text = [
    heading,
    '',
    `Pedido ${data.shortId} con ${data.storeName}.`,
    '',
    ...data.items.map((i) => `- ${itemLine(i)} — ${money(i.lineTotalCents)}`),
    '',
    `Subtotal: ${money(data.subtotalCents)}`,
    ...(data.shippingCents > 0 ? [`Envío: ${money(data.shippingCents)}`] : []),
    `Total: ${money(data.totalCents)}`,
    '',
    ...delivery,
    '',
    `Ver tu compra: ${data.actionUrl}`,
    '',
    `Le compras directo a ${data.storeName}; The Pub Market solo conecta la venta.`,
    'The Pub Market',
  ].join('\n')

  return { subject, html, text }
}

/**
 * New paid order for the selling store.
 *
 * The store fulfils by hand, so this reads like a picking slip: what to pull,
 * where it goes, and one link to the panel. No platform financials beyond what
 * the panel already shows — the totals here are the same the buyer paid.
 */
export function sellerNewOrderEmail(data: OrderEmailData): EmailContent {
  const subject = `Nueva venta ${data.shortId} — prepara el pedido`
  const heading = `Nueva venta ${data.shortId}`
  const delivery = deliveryLines(data.delivery, 'seller')

  const html = layout({
    preheader: `${data.items.length} línea(s) por preparar.`,
    heading,
    bodyHtml: `<p style="margin:0 0 8px;">Ya está pagada. Esto es lo que hay que sacar:</p>
      ${itemsHtml(data.items)}
      ${totalsHtml(data)}
      ${linesHtml(delivery)}`,
    cta: { label: 'Abrir el panel', url: data.actionUrl },
    footerHtml:
      'Marca la orden como enviada o lista para recoger desde el panel para que el comprador reciba su aviso.',
  })

  const text = [
    heading,
    '',
    'Ya está pagada. Esto es lo que hay que sacar:',
    '',
    ...data.items.map((i) => `- ${itemLine(i)} — ${money(i.lineTotalCents)}`),
    '',
    `Subtotal: ${money(data.subtotalCents)}`,
    ...(data.shippingCents > 0 ? [`Envío: ${money(data.shippingCents)}`] : []),
    `Total: ${money(data.totalCents)}`,
    '',
    ...delivery,
    '',
    `Panel: ${data.actionUrl}`,
    '',
    'The Pub Market',
  ].join('\n')

  return { subject, html, text }
}

export interface ShippedEmailData {
  shortId: string
  storeName: string
  trackingNumber: string
  /** Paquetería. Opcional: el vendedor puede no capturarla. */
  carrier: string | null
  actionUrl: string
}

/** The order left the store, with the tracking number as entered in the panel. */
export function orderShippedEmail(data: ShippedEmailData): EmailContent {
  const subject = `Tu pedido ${data.shortId} va en camino`
  const heading = 'Tu pedido va en camino'
  const carrierLine = data.carrier ? `Paquetería: ${data.carrier}` : null

  const html = layout({
    preheader: `Guía ${data.trackingNumber}`,
    heading,
    bodyHtml: `<p style="margin:0 0 20px;">
        <strong>${escapeHtml(data.storeName)}</strong> ya envió tu pedido
        <strong>${escapeHtml(data.shortId)}</strong>.
      </p>
      ${linesHtml(['Datos de tu guía:', `Guía: ${data.trackingNumber}`, ...(carrierLine ? [carrierLine] : [])])}`,
    cta: { label: 'Ver mi compra', url: data.actionUrl },
    footerHtml: carrierLine
      ? 'Rastrea la guía directo con la paquetería.'
      : 'Si necesitas saber con qué paquetería viaja, responde este correo.',
  })

  const text = [
    heading,
    '',
    `${data.storeName} ya envió tu pedido ${data.shortId}.`,
    '',
    `Guía: ${data.trackingNumber}`,
    ...(carrierLine ? [carrierLine] : []),
    '',
    `Ver tu compra: ${data.actionUrl}`,
    '',
    'The Pub Market',
  ].join('\n')

  return { subject, html, text }
}

export interface ReadyEmailData {
  shortId: string
  store: OrderEmailStore
  actionUrl: string
}

/** The order is on the counter. This is the event a pickup buyer waits for. */
export function orderReadyEmail(data: ReadyEmailData): EmailContent {
  const subject = `Tu pedido ${data.shortId} ya está listo para recoger`
  const heading = 'Ya puedes pasar por tu pedido'
  const where = [
    'Recoge en:',
    data.store.name,
    ...(data.store.address ? [data.store.address] : []),
    ...hourLines(data.store.hours),
  ]

  const html = layout({
    preheader: `Te espera en ${data.store.name}.`,
    heading,
    bodyHtml: `<p style="margin:0 0 20px;">
        Tu pedido <strong>${escapeHtml(data.shortId)}</strong> ya está en el mostrador.
      </p>
      ${linesHtml(where)}`,
    cta: { label: 'Ver mi compra', url: data.actionUrl },
    footerHtml: 'Lleva tu identificación y el número de pedido.',
  })

  const text = [
    heading,
    '',
    `Tu pedido ${data.shortId} ya está en el mostrador.`,
    '',
    ...where,
    '',
    `Ver tu compra: ${data.actionUrl}`,
    '',
    'Lleva tu identificación y el número de pedido.',
    'The Pub Market',
  ].join('\n')

  return { subject, html, text }
}
