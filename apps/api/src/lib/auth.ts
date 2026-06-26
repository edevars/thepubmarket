/**
 * Auth de compradores: magic link passwordless + sesiones en KV (binding
 * SESSIONS). Sin contraseñas que custodiar.
 *
 * Cross-origin: la web y la API viven en subdominios distintos, donde las cookies
 * third-party las bloquea Safari. Por eso el token de sesión se entrega al cliente
 * y se envía como `Authorization: Bearer <token>` (no cookie). El token de magic
 * link es de un solo uso y vida corta; el link se envía al email del usuario.
 */
import type { SessionUser } from '../types'

const MAGIC_TTL_SECONDS = 60 * 15 // 15 min
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 días

const magicKey = (token: string) => `mlt:${token}`
const sessionKey = (token: string) => `sess:${token}`

/** Token aleatorio de 256 bits en hex (seguro con crypto.getRandomValues). */
function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Crea un token de magic link para `email` (vive 15 min, un solo uso). */
export async function createMagicToken(kv: KVNamespace, email: string): Promise<string> {
  const token = randomToken()
  await kv.put(magicKey(token), JSON.stringify({ email }), { expirationTtl: MAGIC_TTL_SECONDS })
  return token
}

/** Consume un token de magic link: devuelve el email y lo invalida (un solo uso). */
export async function consumeMagicToken(kv: KVNamespace, token: string): Promise<string | null> {
  const raw = await kv.get(magicKey(token))
  if (!raw) return null
  await kv.delete(magicKey(token))
  try {
    return (JSON.parse(raw) as { email: string }).email
  } catch {
    return null
  }
}

/** Crea una sesión para el usuario y devuelve su token (vive 7 días). */
export async function createSession(kv: KVNamespace, user: SessionUser): Promise<string> {
  const token = randomToken()
  await kv.put(sessionKey(token), JSON.stringify(user), { expirationTtl: SESSION_TTL_SECONDS })
  return token
}

/** Resuelve la sesión a partir del token; null si no existe o expiró. */
export async function getSession(kv: KVNamespace, token: string): Promise<SessionUser | null> {
  const raw = await kv.get(sessionKey(token))
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

/** Invalida una sesión (logout). */
export async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(sessionKey(token))
}

/** Extrae el token Bearer del header Authorization, o null. */
export function bearerToken(header: string | undefined | null): string | null {
  if (!header) return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}
