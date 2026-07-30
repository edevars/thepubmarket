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

const BRAND_INK = '#060911'
const BRAND_PRIMARY = '#3b7bff'
const SUPPORT_NOTE = 'Si no fuiste tú, ignora este correo: tu contraseña no cambia.'

/** A rendered message, provider-agnostic. */
export interface EmailContent {
  subject: string
  html: string
  text: string
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
