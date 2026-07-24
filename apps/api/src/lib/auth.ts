/**
 * Buyer/seller auth: email+password + KV sessions (SESSIONS binding).
 *
 * Cross-origin: the web app and the API live on different subdomains, where
 * third-party cookies get blocked by Safari. So the session token is handed
 * to the client and sent back as `Authorization: Bearer <token>` (no
 * cookie). Password-reset tokens are single-use and short-lived, sent to the
 * user's email as a link.
 */
import type { SessionUser } from '../types'

const RESET_TTL_SECONDS = 60 * 15 // 15 min
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

const resetKey = (token: string) => `pwr:${token}`
const sessionKey = (token: string) => `sess:${token}`

/** Random 256-bit token in hex (crypto.getRandomValues-backed). */
function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Creates a password-reset token for `email` (lives 15 min, single-use). */
export async function createResetToken(kv: KVNamespace, email: string): Promise<string> {
  const token = randomToken()
  await kv.put(resetKey(token), JSON.stringify({ email }), { expirationTtl: RESET_TTL_SECONDS })
  return token
}

/** Consumes a password-reset token: returns the email and invalidates it (single-use). */
export async function consumeResetToken(kv: KVNamespace, token: string): Promise<string | null> {
  const raw = await kv.get(resetKey(token))
  if (!raw) return null
  await kv.delete(resetKey(token))
  try {
    return (JSON.parse(raw) as { email: string }).email
  } catch {
    return null
  }
}

/** Creates a session for the user and returns its token (lives 7 days). */
export async function createSession(kv: KVNamespace, user: SessionUser): Promise<string> {
  const token = randomToken()
  await kv.put(sessionKey(token), JSON.stringify(user), { expirationTtl: SESSION_TTL_SECONDS })
  return token
}

/** Resolves a session from its token; null if missing or expired. */
export async function getSession(kv: KVNamespace, token: string): Promise<SessionUser | null> {
  const raw = await kv.get(sessionKey(token))
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

/** Invalidates a session (logout). */
export async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(sessionKey(token))
}

/** Extracts the Bearer token from the Authorization header, or null. */
export function bearerToken(header: string | undefined | null): string | null {
  if (!header) return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}
