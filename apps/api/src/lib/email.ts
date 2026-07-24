/**
 * Email sending. In Phase 2 the only email is the password-reset link.
 *
 * In development (and while there's no verified sending domain) the link is
 * LOGGED to the console instead of sent — this keeps the flow testable
 * locally without email infrastructure. Real delivery (Cloudflare Email
 * Service, with a domain + SPF/DKIM) is a production TODO.
 */

export async function sendPasswordResetEmail(email: string, link: string): Promise<void> {
  // TODO(prod): send via Cloudflare Email Service once the domain is verified.
  console.log(`[auth] password reset link for ${email}: ${link}`)
}
