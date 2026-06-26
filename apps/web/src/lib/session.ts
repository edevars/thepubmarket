/**
 * Sesión del comprador en el cliente (browser). El token de sesión se guarda en
 * localStorage y se envía como `Authorization: Bearer` (la web y la API están en
 * orígenes distintos; las cookies third-party las bloquea Safari).
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'
const TOKEN_KEY = 'tpm_session'

export interface AuthUser {
  id: string
  email: string
  role: 'buyer' | 'admin'
  displayName: string | null
}

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

/** Solicita un magic link al email indicado. Respuesta siempre neutra. */
export async function requestMagicLink(email: string): Promise<boolean> {
  const res = await fetch(`${API}/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return res.ok
}

/** Canjea el token de magic link por una sesión. */
export async function verifyMagicToken(
  token: string,
): Promise<{ sessionToken: string; user: AuthUser } | null> {
  const res = await fetch(`${API}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) return null
  return (await res.json()) as { sessionToken: string; user: AuthUser }
}

/** Devuelve el usuario de la sesión actual, o null si el token no es válido. */
export async function fetchMe(token: string): Promise<AuthUser | null> {
  const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const { user } = (await res.json()) as { user: AuthUser }
  return user
}

/** Invalida la sesión en el servidor. */
export async function logoutRequest(token: string): Promise<void> {
  await fetch(`${API}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}
