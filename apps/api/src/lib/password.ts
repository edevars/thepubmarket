/**
 * Password hashing via the Workers-native SubtleCrypto API (no dependency,
 * no nodejs_compat needed). PBKDF2-HMAC-SHA512 at OWASP's recommended
 * iteration count for SHA-512 (210,000 — see the Password Storage Cheat
 * Sheet). SHA-512 over SHA-256 because it hits OWASP parity at ~48 ms of
 * Worker CPU instead of the ~71 ms that PBKDF2-HMAC-SHA256 needs at its own
 * 600,000-iteration figure.
 *
 * Stored format is self-describing so params can change later without a
 * schema migration: `pbkdf2-<hash>$<iterations>$<salt b64>$<hash b64>`.
 * Hashes written by older parameter sets still verify; `needsRehash()` flags
 * them so callers can upgrade them on the next successful login.
 */

const HASHES = {
  'pbkdf2-sha256': 'SHA-256',
  'pbkdf2-sha512': 'SHA-512',
} as const

type AlgoTag = keyof typeof HASHES

const ALGO_TAG: AlgoTag = 'pbkdf2-sha512'
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
  hash: string,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash },
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

interface ParsedHash {
  algo: AlgoTag
  iterations: number
  salt: Uint8Array
  hash: Uint8Array
}

function parseStored(stored: string): ParsedHash | null {
  const parts = stored.split('$')
  if (parts.length !== 4) return null
  const [algo, iterStr, saltB64, hashB64] = parts as [string, string, string, string]
  if (!(algo in HASHES)) return null
  const iterations = Number(iterStr)
  if (!Number.isInteger(iterations) || iterations <= 0) return null
  try {
    return {
      algo: algo as AlgoTag,
      iterations,
      salt: fromBase64(saltB64),
      hash: fromBase64(hashB64),
    }
  } catch {
    return null
  }
}

/** Hashes a plaintext password into the storable `pbkdf2-sha512$...` format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await deriveKey(password, salt, PBKDF2_ITERATIONS, HASHES[ALGO_TAG])
  return `${ALGO_TAG}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`
}

/** Verifies a plaintext password against a stored hash (constant-time compare). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored)
  if (!parsed) return false
  const actual = await deriveKey(password, parsed.salt, parsed.iterations, HASHES[parsed.algo])
  return constantTimeEqual(actual, parsed.hash)
}

/**
 * True when `stored` was produced by weaker parameters than the current ones,
 * so the caller should re-hash the password on the next successful login.
 * Unparseable input also returns true — rewriting it is the safe move.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parseStored(stored)
  if (!parsed) return true
  return parsed.algo !== ALGO_TAG || parsed.iterations < PBKDF2_ITERATIONS
}

/**
 * Burns the same KDF work a real verification would, then discards it. Used on
 * the unknown-account login path so response timing doesn't reveal whether an
 * email is registered. The salt is fixed and never stored.
 */
export async function dummyVerify(password: string): Promise<void> {
  await deriveKey(password, new Uint8Array(SALT_BYTES), PBKDF2_ITERATIONS, HASHES[ALGO_TAG])
}
