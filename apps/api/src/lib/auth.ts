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

/**
 * Reverse index user → sessions. KV has no secondary index, so every session
 * also writes an empty marker key under a per-user prefix; that's what makes
 * "revoke every session this user has" possible on a password change. Same TTL
 * as the session itself, so the index expires with it.
 */
const userSessionPrefix = (userId: string) => `usess:${userId}:`
const userSessionKey = (userId: string, token: string) => `${userSessionPrefix(userId)}${token}`

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

/**
 * Creates a session for the user and returns its token.
 *
 * Expiry is absolute, not sliding: the KV TTL is set once at creation and
 * never extended, so every session dies 7 days after login regardless of
 * activity. There is no refresh token — the user logs in again. Sessions are
 * revoked early by logout (`deleteSession`) and by a password change
 * (`deleteAllUserSessions`).
 */
export async function createSession(kv: KVNamespace, user: SessionUser): Promise<string> {
  const token = randomToken()
  await Promise.all([
    kv.put(sessionKey(token), JSON.stringify(user), { expirationTtl: SESSION_TTL_SECONDS }),
    kv.put(userSessionKey(user.id, token), '1', { expirationTtl: SESSION_TTL_SECONDS }),
  ])
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

/** Invalidates a session (logout), including its reverse-index entry. */
export async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
  const user = await getSession(kv, token)
  await Promise.all([
    kv.delete(sessionKey(token)),
    user ? kv.delete(userSessionKey(user.id, token)) : Promise.resolve(),
  ])
}

/**
 * Invalidates every session belonging to `userId`; returns how many were
 * revoked. Called on password change so a stolen session can't outlive the
 * credential it came from.
 *
 * Best-effort by nature: KV list is eventually consistent, so a session
 * created seconds earlier on another colo may not appear yet. It expires on
 * its own TTL at the latest.
 */
export async function deleteAllUserSessions(kv: KVNamespace, userId: string): Promise<number> {
  const prefix = userSessionPrefix(userId)
  const indexKeys: string[] = []
  let cursor: string | undefined

  // Collect every page before deleting anything: deleting mid-iteration
  // mutates the very listing being paged through, which can skip entries.
  do {
    const page = await kv.list({ prefix, cursor })
    for (const { name } of page.keys) indexKeys.push(name)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  await Promise.all(
    indexKeys.flatMap((name) => [
      kv.delete(sessionKey(name.slice(prefix.length))),
      kv.delete(name),
    ]),
  )

  return indexKeys.length
}

/** Extracts the Bearer token from the Authorization header, or null. */
export function bearerToken(header: string | undefined | null): string | null {
  if (!header) return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}
