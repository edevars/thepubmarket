import { describe, expect, it } from 'vitest'
import {
  type OrderEmailData,
  orderConfirmationEmail,
  orderReadyEmail,
  orderShippedEmail,
  sellerNewOrderEmail,
} from './email-templates'

const BASE: OrderEmailData = {
  shortId: '#TPM-3F2A',
  storeName: 'The Pub Game Store',
  items: [
    { name: 'Sol Ring', setCode: 'cmm', condition: 'NM', quantity: 2, lineTotalCents: 77800 },
    { name: 'Brainstorm', setCode: null, condition: null, quantity: 1, lineTotalCents: 2800 },
  ],
  subtotalCents: 80600,
  shippingCents: 20000,
  totalCents: 100600,
  delivery: {
    method: 'shipping',
    recipient: 'Ana Pérez',
    phone: '5555551234',
    lines: ['Calle Falsa 123', 'Roma Norte, CDMX, CDMX', 'C.P. 06700'],
  },
  actionUrl: 'https://thepubmarket.com/compras',
}

const PICKUP: OrderEmailData = {
  ...BASE,
  shippingCents: 0,
  totalCents: 80600,
  delivery: {
    method: 'pickup',
    store: {
      name: 'Bahamut Cards',
      address: 'Av. Insurgentes 500, Del Valle',
      hours: [
        { key: 'weekday', open: '12:00', close: '20:00' },
        { key: 'sunday', open: null, close: null },
      ],
    },
  },
}

/** Every buyer-facing template, for the invariants that apply to all of them. */
const BUYER_EMAILS = [
  ['confirmation', orderConfirmationEmail(BASE)],
  ['confirmation (pickup)', orderConfirmationEmail(PICKUP)],
  [
    'shipped',
    orderShippedEmail({
      shortId: BASE.shortId,
      storeName: BASE.storeName,
      trackingNumber: '7788990011',
      carrier: 'Estafeta',
      actionUrl: BASE.actionUrl,
    }),
  ],
  [
    'ready',
    orderReadyEmail({
      shortId: BASE.shortId,
      store: { name: 'Bahamut Cards', address: 'Av. Insurgentes 500', hours: [] },
      actionUrl: BASE.actionUrl,
    }),
  ],
] as const

describe('order emails — shared invariants', () => {
  it.each(
    BUYER_EMAILS.map(([name, email]) => ({ name, email })),
  )('renders both an HTML and a plain-text body: $name', ({ email }) => {
    expect(email.subject.length).toBeGreaterThan(0)
    expect(email.html).toContain('<!doctype html>')
    expect(email.text.length).toBeGreaterThan(0)
    // Plain text must be readable on its own: no tags leaking into it.
    expect(email.text).not.toMatch(/<[a-z/][^>]*>/i)
  })

  it.each(
    BUYER_EMAILS.map(([name, email]) => ({ name, email })),
  )('never exposes the platform commission to the buyer: $name', ({ email }) => {
    // AC#7: no fee, no commission, nothing implying the platform holds funds.
    for (const forbidden of ['comisión', 'comision', 'fee', 'application fee', 'saldo']) {
      expect(email.html.toLowerCase()).not.toContain(forbidden)
      expect(email.text.toLowerCase()).not.toContain(forbidden)
    }
  })
})

describe('orderConfirmationEmail', () => {
  it('carries the reference, the store, every line and the total paid', () => {
    const { subject, text } = orderConfirmationEmail(BASE)
    expect(subject).toContain('#TPM-3F2A')
    expect(text).toContain('The Pub Game Store')
    expect(text).toContain('2 × Sol Ring (CMM · NM)')
    expect(text).toContain('$1,006.00 MXN')
  })

  it('renders a line with no set or condition without empty parentheses', () => {
    expect(orderConfirmationEmail(BASE).text).toContain('1 × Brainstorm —')
  })

  it('shows the shipping address for a shipping order', () => {
    const { text } = orderConfirmationEmail(BASE)
    expect(text).toContain('Llega a domicilio:')
    expect(text).toContain('Ana Pérez')
    expect(text).toContain('C.P. 06700')
  })

  it('shows the pickup store and its hours, and omits a shipping charge of zero', () => {
    const { text } = orderConfirmationEmail(PICKUP)
    expect(text).toContain('Recoges en tienda:')
    expect(text).toContain('Bahamut Cards')
    expect(text).toContain('Lunes a jueves: 12:00–20:00')
    expect(text).toContain('Domingo: cerrado')
    expect(text).not.toContain('Envío:')
  })

  it('still renders an order predating the delivery model', () => {
    const legacy = orderConfirmationEmail({ ...BASE, delivery: { method: null } })
    expect(legacy.text).toContain('Entrega: por confirmar')
  })

  it('escapes buyer-supplied values instead of injecting them into the HTML', () => {
    const nasty = orderConfirmationEmail({
      ...BASE,
      delivery: {
        method: 'shipping',
        recipient: '<script>alert(1)</script>',
        phone: null,
        lines: ['Calle Falsa 123'],
      },
    })
    expect(nasty.html).not.toContain('<script>')
    expect(nasty.html).toContain('&lt;script&gt;')
  })
})

describe('sellerNewOrderEmail', () => {
  it('reads like a picking slip and points at the panel', () => {
    const { subject, text } = sellerNewOrderEmail({ ...BASE, actionUrl: 'https://x.test/panel' })
    expect(subject).toContain('Nueva venta')
    expect(text).toContain('2 × Sol Ring (CMM · NM)')
    expect(text).toContain('Enviar a domicilio:')
    expect(text).toContain('https://x.test/panel')
  })

  it('tells a pickup order where to stage it', () => {
    expect(sellerNewOrderEmail(PICKUP).text).toContain('Preparar para recoger en:')
  })
})

describe('orderShippedEmail', () => {
  const base = {
    shortId: '#TPM-3F2A',
    storeName: 'The Pub Game Store',
    trackingNumber: '7788990011',
    actionUrl: 'https://thepubmarket.com/compras',
  }

  it('includes the tracking number and the carrier when captured', () => {
    const { text } = orderShippedEmail({ ...base, carrier: 'Estafeta' })
    expect(text).toContain('Guía: 7788990011')
    expect(text).toContain('Paquetería: Estafeta')
  })

  it('omits the carrier line entirely when the seller left it blank', () => {
    const { text } = orderShippedEmail({ ...base, carrier: null })
    expect(text).toContain('Guía: 7788990011')
    expect(text).not.toContain('Paquetería:')
  })
})

describe('orderReadyEmail', () => {
  it('names the store, its address and its hours', () => {
    const { subject, text } = orderReadyEmail({
      shortId: '#TPM-3F2A',
      store: {
        name: 'Coliseo TCG',
        address: 'Eje Central 90',
        hours: [{ key: 'friSat', open: '13:00', close: '22:00' }],
      },
      actionUrl: 'https://thepubmarket.com/compras',
    })
    expect(subject).toContain('listo para recoger')
    expect(text).toContain('Coliseo TCG')
    expect(text).toContain('Eje Central 90')
    expect(text).toContain('Viernes y sábado: 13:00–22:00')
  })

  it('renders a store with no address or hours on file', () => {
    const { text } = orderReadyEmail({
      shortId: '#TPM-3F2A',
      store: { name: 'Tienda sin datos', address: null, hours: [] },
      actionUrl: 'https://thepubmarket.com/compras',
    })
    expect(text).toContain('Tienda sin datos')
  })
})
