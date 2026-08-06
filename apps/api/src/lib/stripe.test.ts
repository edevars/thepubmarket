import { describe, expect, it } from 'vitest'
import { paymentIntentIdFrom } from './stripe'

describe('paymentIntentIdFrom', () => {
  it('devuelve el id cuando Stripe lo manda sin expandir', () => {
    expect(paymentIntentIdFrom({ payment_intent: 'pi_123' })).toBe('pi_123')
  })

  it('devuelve el id cuando el PaymentIntent viene expandido', () => {
    expect(paymentIntentIdFrom({ payment_intent: { id: 'pi_456' } })).toBe('pi_456')
  })

  // Este es el caso de TASK-021: al crear la sesión (`mode: payment`) el
  // PaymentIntent todavía no existe. Null, nunca un placeholder — la columna
  // debe quedarse NULL en una orden que nadie pagó.
  it('devuelve null cuando todavía no hay PaymentIntent', () => {
    expect(paymentIntentIdFrom({ payment_intent: null })).toBeNull()
    expect(paymentIntentIdFrom({})).toBeNull()
  })
})
