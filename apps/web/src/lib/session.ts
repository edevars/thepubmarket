/**
 * Client-side (browser) session handling. The session token is stored in
 * localStorage and sent as `Authorization: Bearer` (the web app and the API
 * are on different origins; third-party cookies get blocked by Safari).
 *
 * Every unauthenticated endpoint also carries a Turnstile token in
 * `cf-turnstile-response` — see components/security/useTurnstile.ts for where
 * the callers mint it. A `null` token means "no widget configured" and the
 * header is simply omitted.
 */
import type { AuthUser } from '@thepubmarket/shared'
import { withTurnstileHeader } from './turnstile'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'
const TOKEN_KEY = 'tpm_session'

export type { AuthUser }

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY)
}

type AuthResult = { sessionToken: string; user: AuthUser } | { error: string }

async function postAuth(
  path: string,
  body: unknown,
  turnstileToken: string | null,
): Promise<AuthResult> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: withTurnstileHeader({ 'content-type': 'application/json' }, turnstileToken),
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<AuthResult>
  if (!res.ok) return { error: data.error ?? 'unknown_error' }
  return data as AuthResult
}

/** Creates an account with email+password (or claims a legacy passwordless one). */
export async function registerUser(
  email: string,
  password: string,
  turnstileToken: string | null,
  displayName?: string,
): Promise<AuthResult> {
  return postAuth('/auth/register', { email, password, displayName }, turnstileToken)
}

/** Signs in with email+password. */
export async function loginUser(
  email: string,
  password: string,
  turnstileToken: string | null,
): Promise<AuthResult> {
  return postAuth('/auth/login', { email, password }, turnstileToken)
}

/**
 * Requests a password-reset email. Resolves false on a rejected Turnstile so the
 * caller can say so; the success path stays neutral about whether the account
 * exists (the API answers `{ ok: true }` either way).
 */
export async function requestPasswordReset(
  email: string,
  turnstileToken: string | null,
): Promise<boolean> {
  const res = await fetch(`${API}/auth/password/forgot`, {
    method: 'POST',
    headers: withTurnstileHeader({ 'content-type': 'application/json' }, turnstileToken),
    body: JSON.stringify({ email }),
  })
  return res.ok
}

/** Consumes a password-reset token and sets a new password. */
export async function resetPassword(
  token: string,
  password: string,
  turnstileToken: string | null,
): Promise<AuthResult> {
  return postAuth('/auth/password/reset', { token, password }, turnstileToken)
}

/** Returns the current session's user, or null if the token is invalid. */
export async function fetchMe(token: string): Promise<AuthUser | null> {
  const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const { user } = (await res.json()) as { user: AuthUser }
  return user
}

/** Invalidates the session on the server. */
export async function logoutRequest(token: string): Promise<void> {
  await fetch(`${API}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}
