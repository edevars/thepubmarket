/** Client-side auth form validation. Mirrors the server's rules (apps/api/src/routes/auth.ts) for instant feedback. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

export const PASSWORD_MIN_LENGTH = 10

export function isPasswordLongEnough(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH
}
