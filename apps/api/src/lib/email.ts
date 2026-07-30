/**
 * Transactional email — the only path from the API to the mail provider.
 *
 * Everything that sends mail goes through `sendEmail`. Nothing else touches the
 * `EMAIL` binding: one place to reason about failure, one place to change if
 * Cloudflare Email Sending ever stops being the right answer.
 *
 * Three deliberate properties:
 *
 * - **Never throws.** Callers get an outcome they are free to ignore. A mail
 *   provider having a bad afternoon must not turn a successful password reset
 *   into a 500, and must not leak its error text to the caller.
 * - **Log mode.** With `EMAIL_MODE` set to anything but `send`, the message is
 *   printed in full — subject, recipient and plain-text body — and nothing is
 *   sent. That is what makes local development work with no credentials, no
 *   verified domain and no risk of mailing a real person from a test run.
 * - **Restricted sender.** `EMAIL_FROM` must match `allowed_sender_addresses`
 *   on the binding in wrangler.jsonc; the runtime rejects anything else. The
 *   pair moves together — see docs/ingenieria/email.md.
 *
 * Templates live in lib/email-templates.ts and know nothing about any of this.
 */
import { RESET_TTL_SECONDS } from './auth'
import { type EmailContent, passwordResetEmail } from './email-templates'

export type SendOutcome =
  | { ok: true; mode: 'sent'; messageId: string }
  | { ok: true; mode: 'logged' }
  | { ok: false; reason: string }

/** Reads the provider's error code without assuming its shape. */
function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const { code, message } = err as { code?: unknown; message?: unknown }
    if (typeof code === 'string' && code) return message ? `${code}: ${message}` : code
    if (typeof message === 'string' && message) return message
  }
  return String(err)
}

/**
 * Delivers one message. Returns an outcome; never rejects.
 *
 * @param env Worker env — needs `EMAIL` (binding) and the `EMAIL_*` vars.
 * @param to  Single recipient. Bulk sends are out of scope by design: this is
 *            transactional mail, and Email Sending is not a marketing tool.
 */
export async function sendEmail(env: Env, to: string, content: EmailContent): Promise<SendOutcome> {
  // Widened on purpose: `wrangler types` narrows vars to the literal value in
  // wrangler.jsonc, which would make this comparison look constant to TS even
  // though .dev.vars overrides it at runtime.
  const mode: string = env.EMAIL_MODE

  if (mode !== 'send' || !env.EMAIL) {
    const why = env.EMAIL ? `EMAIL_MODE=${mode}` : 'no EMAIL binding'
    console.log(
      `[email] NOT SENT (${why}) → ${to}\n` +
        `[email] subject: ${content.subject}\n` +
        `${content.text}\n[email] ---`,
    )
    return { ok: true, mode: 'logged' }
  }

  try {
    const result = await env.EMAIL.send({
      to,
      from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
      subject: content.subject,
      html: content.html,
      text: content.text,
    })
    return { ok: true, mode: 'sent', messageId: result.messageId }
  } catch (err) {
    // Recipient and subject, never the body: reset links and order contents
    // don't belong in a log line that gets shipped to observability.
    const reason = describeError(err)
    console.error(`[email] send failed → ${to} (${content.subject}): ${reason}`)
    return { ok: false, reason }
  }
}

/**
 * Password reset link.
 *
 * Call it through `executionCtx.waitUntil` — `/auth/password/forgot` answers
 * the same neutral `{ok: true}` either way, so blocking the response on the
 * provider only makes the endpoint slower and its timing more informative.
 */
export function sendPasswordResetEmail(env: Env, to: string, link: string): Promise<SendOutcome> {
  return sendEmail(env, to, passwordResetEmail(link, Math.round(RESET_TTL_SECONDS / 60)))
}
