import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from './email'
import type { EmailContent } from './email-templates'

const CONTENT: EmailContent = {
  subject: 'Compra confirmada #TPM-3F2A',
  html: '<p>hola</p>',
  text: 'hola',
}

/** Minimal env: only what sendEmail reads. */
function envWith(send: unknown, mode = 'send'): Env {
  return {
    EMAIL: send ? ({ send } as unknown) : undefined,
    EMAIL_MODE: mode,
    EMAIL_FROM: 'no-reply@thepubmarket.com',
    EMAIL_FROM_NAME: 'The Pub Market',
  } as unknown as Env
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sendEmail', () => {
  it('reports a provider failure instead of throwing', async () => {
    // AC#6 of TASK-017 rests on this: an order email that blows up must never
    // reach the caller as an exception, or a dead mail provider would start
    // failing paid orders.
    const boom = vi.fn(async () => {
      throw Object.assign(new Error('mailbox unavailable'), { code: 'EMAIL_REJECTED' })
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const outcome = await sendEmail(envWith(boom), 'ana@example.test', CONTENT)

    expect(outcome).toEqual({ ok: false, reason: 'EMAIL_REJECTED: mailbox unavailable' })
    expect(boom).toHaveBeenCalledTimes(1)
  })

  it('never logs the body of a failed message', async () => {
    const boom = vi.fn(async () => {
      throw new Error('nope')
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await sendEmail(envWith(boom), 'ana@example.test', {
      ...CONTENT,
      text: 'SECRET-ORDER-CONTENTS',
    })

    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).toContain('ana@example.test')
    expect(logged).not.toContain('SECRET-ORDER-CONTENTS')
  })

  it('returns the provider message id on success', async () => {
    const send = vi.fn(async () => ({ messageId: 'msg_123' }))
    await expect(sendEmail(envWith(send), 'ana@example.test', CONTENT)).resolves.toEqual({
      ok: true,
      mode: 'sent',
      messageId: 'msg_123',
    })
  })

  it('logs instead of sending when the mode is not "send"', async () => {
    const send = vi.fn()
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(sendEmail(envWith(send, 'log'), 'ana@example.test', CONTENT)).resolves.toEqual({
      ok: true,
      mode: 'logged',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('logs instead of sending when the binding is missing entirely', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(sendEmail(envWith(null), 'ana@example.test', CONTENT)).resolves.toEqual({
      ok: true,
      mode: 'logged',
    })
  })
})
