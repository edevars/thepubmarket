/**
 * Password hashing via the Workers-native SubtleCrypto API (no dependency,
 * no nodejs_compat needed). PBKDF2-HMAC-SHA256 at OWASP's 2023 minimum
 * iteration count.
 *
 * Stored format is self-describing so params can change later without a
 * schema migration: `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>`.
 */

const ALGO_TAG = 'pbkdf2-sha256'
const PBKDF2_ITERATIONS = 210_000
const SALT_BYTES = 16
const KEY_BYTES = 32

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_BYTES * 8,
  )
  return new Uint8Array(bits)
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

/** Hashes a plaintext password into the storable `pbkdf2-sha256$...` format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  return `${ALGO_TAG}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`
}

/** Verifies a plaintext password against a stored hash (constant-time compare). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4) return false
  const [algo, iterStr, saltB64, hashB64] = parts as [string, string, string, string]
  if (algo !== ALGO_TAG) return false
  const iterations = Number(iterStr)
  if (!Number.isInteger(iterations) || iterations <= 0) return false
  const actual = await deriveKey(password, fromBase64(saltB64), iterations)
  return constantTimeEqual(actual, fromBase64(hashB64))
}
