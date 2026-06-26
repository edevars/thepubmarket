/**
 * Envío de email. En Fase 2 el único correo es el magic link de login.
 *
 * En desarrollo (y mientras no haya dominio de envío verificado) se LOGUEA el
 * link en consola en vez de enviarlo — así el flujo es probable localmente sin
 * infraestructura de email. La integración real (Cloudflare Email Service, con
 * dominio + SPF/DKIM) es un TODO de producción.
 */

export async function sendMagicLink(email: string, link: string): Promise<void> {
  // TODO(prod): enviar vía Cloudflare Email Service una vez configurado el dominio.
  console.log(`[auth] magic link para ${email}: ${link}`)
}
