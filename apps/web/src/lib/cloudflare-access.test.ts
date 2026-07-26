import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAccessJwt } from './cloudflare-access'

/**
 * Pruebas de `verifyAccessJwt` contra JWTs reales (RS256), firmados en el
 * propio test, verificados contra un JWKS servido por un `fetch` mockeado —
 * así cubrimos la ruta real de `jose` (firma, exp, iss, aud) sin pegarle a
 * la red ni depender de un JWKS real de Cloudflare Access.
 *
 * `verifyAccessJwt` cachea el `RemoteJWKSet` por `teamDomain` a nivel de
 * módulo, así que cada test usa un `teamDomain` propio para no compartir
 * cache con otros tests (y así seguir ejercitando el fallo que dice probar,
 * en vez de que un cache "fresco" de otro test lo enmascare).
 */

const AUD = 'test-aud-tag'

function jwksUrlFor(teamDomain: string) {
  return `https://${teamDomain}/cdn-cgi/access/certs`
}

async function makeSignedToken(opts: {
  privateKey: CryptoKey
  kid: string
  iss: string
  aud?: string
  email?: string
  expiresInSeconds?: number
}) {
  const {
    privateKey,
    kid,
    iss,
    aud = AUD,
    email = 'seller@thepubmarket.mx',
    expiresInSeconds = 3600,
  } = opts

  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setIssuer(iss)
    .setAudience(aud)
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(privateKey)
}

let originalFetch: typeof global.fetch

beforeEach(() => {
  originalFetch = global.fetch
})

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('verifyAccessJwt', () => {
  it('acepta un token válido y devuelve el email del claim', async () => {
    const teamDomain = 'valid.cloudflareaccess.com'
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const kid = 'kid-valid'
    const jwk = await exportJWK(publicKey)

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(jwksUrlFor(teamDomain))
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const token = await makeSignedToken({
      privateKey,
      kid,
      iss: `https://${teamDomain}`,
      email: 'vendedor@thepubmarket.mx',
    })

    const result = await verifyAccessJwt(token, { teamDomain, aud: AUD })

    expect(result).toEqual({ valid: true, email: 'vendedor@thepubmarket.mx' })
  })

  it('rechaza un token expirado', async () => {
    const teamDomain = 'expired.cloudflareaccess.com'
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const kid = 'kid-expired'
    const jwk = await exportJWK(publicKey)

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }), {
        status: 200,
      })
    }) as typeof fetch

    const token = await makeSignedToken({
      privateKey,
      kid,
      iss: `https://${teamDomain}`,
      expiresInSeconds: -60,
    })

    const result = await verifyAccessJwt(token, { teamDomain, aud: AUD })

    expect(result.valid).toBe(false)
  })

  it('rechaza un token con aud incorrecto', async () => {
    const teamDomain = 'wrong-aud.cloudflareaccess.com'
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const kid = 'kid-wrong-aud'
    const jwk = await exportJWK(publicKey)

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }), {
        status: 200,
      })
    }) as typeof fetch

    const token = await makeSignedToken({
      privateKey,
      kid,
      iss: `https://${teamDomain}`,
      aud: 'otra-app-completamente-distinta',
    })

    const result = await verifyAccessJwt(token, { teamDomain, aud: AUD })

    expect(result.valid).toBe(false)
  })

  it('rechaza un token con issuer incorrecto', async () => {
    const teamDomain = 'wrong-iss.cloudflareaccess.com'
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const kid = 'kid-wrong-iss'
    const jwk = await exportJWK(publicKey)

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }), {
        status: 200,
      })
    }) as typeof fetch

    const token = await makeSignedToken({
      privateKey,
      kid,
      iss: 'https://un-team-distinto.cloudflareaccess.com',
    })

    const result = await verifyAccessJwt(token, { teamDomain, aud: AUD })

    expect(result.valid).toBe(false)
  })

  it('rechaza un token firmado con una llave que no está en el JWKS', async () => {
    const teamDomain = 'no-matching-key.cloudflareaccess.com'
    const { privateKey } = await generateKeyPair('RS256')

    // JWKS servido no incluye ninguna llave que haga match con el `kid` firmante.
    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [] }), { status: 200 })
    }) as typeof fetch

    const token = await makeSignedToken({
      privateKey,
      kid: 'kid-no-existe',
      iss: `https://${teamDomain}`,
    })

    const result = await verifyAccessJwt(token, { teamDomain, aud: AUD })

    expect(result.valid).toBe(false)
  })

  it('rechaza un token malformado sin lanzar', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('fetch no debería llamarse para un token malformado')
    }) as typeof fetch

    const result = await verifyAccessJwt('esto-no-es-un-jwt', {
      teamDomain: 'malformed.cloudflareaccess.com',
      aud: AUD,
    })

    expect(result.valid).toBe(false)
  })

  it('devuelve inválido (sin lanzar) si falla la red al pedir el JWKS', async () => {
    const teamDomain = 'network-fail.cloudflareaccess.com'
    const { privateKey } = await generateKeyPair('RS256')
    const kid = 'kid-network-fail'

    global.fetch = vi.fn(async () => {
      throw new TypeError('network error')
    }) as typeof fetch

    const token = await makeSignedToken({ privateKey, kid, iss: `https://${teamDomain}` })

    await expect(verifyAccessJwt(token, { teamDomain, aud: AUD })).resolves.toEqual(
      expect.objectContaining({ valid: false }),
    )
  })
})
