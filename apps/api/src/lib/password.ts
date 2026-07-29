/**
 * Password hashing via the Workers-native SubtleCrypto API (no dependency,
 * no nodejs_compat needed).
 *
 * ## Por qué el KDF se ve raro: el tope de 100k de Workers
 *
 * El runtime de Cloudflare **rechaza PBKDF2 con más de 100,000 iteraciones**
 * (`NotSupportedError: iteration counts above 100000 are not supported`), y
 * ninguna cifra de OWASP cabe ahí: pide 600,000 para HMAC-SHA256 o 210,000
 * para HMAC-SHA512. Una sola pasada dentro del tope queda a menos de la mitad
 * del factor de trabajo recomendado.
 *
 * La salida es **encadenar**: N pasadas de PBKDF2 con el mismo salt, cada una
 * usando la salida de la anterior como material de entrada. El atacante tiene
 * que computar las N en secuencia —no hay atajo, cada pasada depende de la
 * previa— así que el trabajo efectivo es la suma. Hoy: 3 × 70,000 = **210,000
 * iteraciones de HMAC-SHA512**, la cifra de OWASP para SHA-512.
 *
 * ⚠️ El tope **no se aplica en `wrangler dev` local**, solo en producción. Un
 * cambio de parámetros aquí no se puede dar por bueno con pruebas locales:
 * hay que verificarlo contra el Worker desplegado.
 *
 * ## Formato almacenado
 *
 * Autodescriptivo, para poder cambiar parámetros sin migración de esquema:
 *
 *     pbkdf2-<hash>x<rondas>$<iteraciones por ronda>$<salt b64>$<hash b64>
 *
 * Los hashes escritos con parámetros viejos se siguen verificando mientras
 * sean computables, y `needsRehash()` los marca para reescribirlos en el
 * siguiente login exitoso. Los de una sola ronda llevan el tag sin `x<n>`.
 */

const HASHES = {
  'pbkdf2-sha256': 'SHA-256',
  'pbkdf2-sha512': 'SHA-512',
} as const

type HashTag = keyof typeof HASHES

const HASH_TAG: HashTag = 'pbkdf2-sha512'
const ROUNDS = 3
const ITERATIONS_PER_ROUND = 70_000
/** Tope duro del runtime de Cloudflare; pasarlo lanza NotSupportedError. */
const MAX_ITERATIONS_PER_ROUND = 100_000
const ALGO_TAG = `${HASH_TAG}x${ROUNDS}`
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

interface KdfParams {
  hash: HashTag
  rounds: number
  iterations: number
}

/**
 * Deriva la clave encadenando `rounds` pasadas de PBKDF2 sobre el mismo salt.
 * La primera parte de la contraseña; cada una siguiente parte de la salida de
 * la anterior, así que el trabajo total es `rounds * iterations`.
 */
async function deriveKey(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<Uint8Array> {
  const hash = HASHES[params.hash]
  let material: Uint8Array = new TextEncoder().encode(password)

  for (let round = 0; round < params.rounds; round++) {
    const key = await crypto.subtle.importKey('raw', material as BufferSource, 'PBKDF2', false, [
      'deriveBits',
    ])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations: params.iterations, hash },
      key,
      KEY_BYTES * 8,
    )
    material = new Uint8Array(bits)
  }

  return material
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

interface ParsedHash extends KdfParams {
  salt: Uint8Array
  digest: Uint8Array
}

/** Parsea `pbkdf2-sha512x3$70000$<salt>$<hash>`; `null` si no es utilizable. */
function parseStored(stored: string): ParsedHash | null {
  const parts = stored.split('$')
  if (parts.length !== 4) return null
  const [tag, iterStr, saltB64, hashB64] = parts as [string, string, string, string]

  // `pbkdf2-sha512x3` → hash `pbkdf2-sha512`, 3 rondas. Sin `x<n>`, una ronda.
  const match = tag.match(/^(.+?)(?:x(\d+))?$/)
  if (!match) return null
  const [, hashTag, roundsStr] = match as [string, string, string | undefined]
  if (!hashTag || !(hashTag in HASHES)) return null

  const rounds = roundsStr === undefined ? 1 : Number(roundsStr)
  const iterations = Number(iterStr)
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 16) return null
  if (!Number.isInteger(iterations) || iterations <= 0) return null
  // Un hash escrito antes de que se conociera el tope de Workers no se puede
  // recomputar aquí: `deriveBits` lanzaría. Se trata como no utilizable, así
  // que la verificación falla y `needsRehash` lo marca (el usuario entra por
  // "olvidé mi contraseña").
  if (iterations > MAX_ITERATIONS_PER_ROUND) return null

  try {
    return {
      hash: hashTag as HashTag,
      rounds,
      iterations,
      salt: fromBase64(saltB64),
      digest: fromBase64(hashB64),
    }
  } catch {
    return null
  }
}

/** Hashea una contraseña al formato almacenable `pbkdf2-sha512x3$...`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const params: KdfParams = {
    hash: HASH_TAG,
    rounds: ROUNDS,
    iterations: ITERATIONS_PER_ROUND,
  }
  const digest = await deriveKey(password, salt, params)
  return `${ALGO_TAG}$${ITERATIONS_PER_ROUND}$${toBase64(salt)}$${toBase64(digest)}`
}

/** Verifica una contraseña contra un hash almacenado (comparación en tiempo constante). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored)
  if (!parsed) return false
  try {
    const actual = await deriveKey(password, parsed.salt, parsed)
    return constantTimeEqual(actual, parsed.digest)
  } catch {
    // Nunca lanzar: un hash con parámetros que este runtime rechaza debe
    // fallar cerrado, no tumbar el endpoint de login con un 500.
    return false
  }
}

/**
 * True cuando `stored` se produjo con parámetros más débiles que los actuales
 * y conviene reescribirlo en el siguiente login exitoso. Lo no parseable
 * también da true: reescribirlo es lo seguro.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parseStored(stored)
  if (!parsed) return true
  if (parsed.hash !== HASH_TAG) return true
  return parsed.rounds * parsed.iterations < ROUNDS * ITERATIONS_PER_ROUND
}

/**
 * Quema el mismo trabajo de KDF que una verificación real y lo descarta. Se
 * usa en el camino de cuenta inexistente del login, para que el tiempo de
 * respuesta no revele si un correo está registrado. El salt es fijo y nunca
 * se almacena.
 */
export async function dummyVerify(password: string): Promise<void> {
  await deriveKey(password, new Uint8Array(SALT_BYTES), {
    hash: HASH_TAG,
    rounds: ROUNDS,
    iterations: ITERATIONS_PER_ROUND,
  })
}
