import { createRemoteJWKSet } from 'jose/jwks/remote'
import { jwtVerify } from 'jose/jwt/verify'

/**
 * Verificación de JWTs de Cloudflare Access (header `Cf-Access-Jwt-Assertion`).
 *
 * Se usa desde `middleware.ts` para proteger `/panel` a nivel de red, como
 * capa ADICIONAL al auth de aplicación (sellerAuth en la API + guard cliente
 * de PanelShell) — no lo reemplaza. Ver `docs/ingenieria/cloudflare-access-panel.md`.
 *
 * El JWKS del team se cachea internamente por `createRemoteJWKSet` (no hay
 * que hacer caching manual). Como `createRemoteJWKSet` guarda el JWKS por
 * instancia, se mantiene un cache por `teamDomain` a nivel de módulo para no
 * volver a golpear el JWKS endpoint en cada request dentro del mismo Worker.
 */

type VerifyResult = { valid: true; email: string } | { valid: false; reason: string }

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    jwksCache.set(teamDomain, jwks)
  }
  return jwks
}

export async function verifyAccessJwt(
  token: string,
  opts: { teamDomain: string; aud: string },
): Promise<VerifyResult> {
  try {
    const jwks = getJwks(opts.teamDomain)
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${opts.teamDomain}`,
      audience: opts.aud,
    })

    const email = payload.email
    if (typeof email !== 'string' || email.length === 0) {
      return { valid: false, reason: 'missing_email_claim' }
    }

    return { valid: true, email }
  } catch (err) {
    // Nunca lanzar: quien llama debe poder fallar cerrado sin try/catch propio.
    const reason = err instanceof Error ? err.message : 'unknown_error'
    return { valid: false, reason }
  }
}
