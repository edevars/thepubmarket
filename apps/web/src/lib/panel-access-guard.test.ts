import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./cloudflare-access', () => ({
  verifyAccessJwt: vi.fn(),
}))

import { verifyAccessJwt } from './cloudflare-access'
import { guardPanelAccess, isPanelPath } from './panel-access-guard'

const verifyAccessJwtMock = vi.mocked(verifyAccessJwt)

function req(path: string, headers?: Record<string, string>) {
  return new NextRequest(new URL(path, 'https://panel.thepubmarket.mx'), { headers })
}

afterEach(() => {
  vi.unstubAllEnvs()
  verifyAccessJwtMock.mockReset()
})

describe('isPanelPath', () => {
  it('matches /panel sin locale', () => {
    expect(isPanelPath('/panel')).toBe(true)
    expect(isPanelPath('/panel/inventario')).toBe(true)
  })

  it('matches /{locale}/panel', () => {
    expect(isPanelPath('/en/panel')).toBe(true)
    expect(isPanelPath('/es/panel/ordenes')).toBe(true)
  })

  it('no matches rutas que no son de panel', () => {
    expect(isPanelPath('/')).toBe(false)
    expect(isPanelPath('/catalogo')).toBe(false)
    expect(isPanelPath('/es/catalogo')).toBe(false)
    expect(isPanelPath('/panelista')).toBe(false)
  })
})

describe('guardPanelAccess', () => {
  describe('rutas fuera de /panel', () => {
    it('nunca se gatean, sin importar la config de Access', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', '')
      vi.stubEnv('CF_ACCESS_AUD', '')

      for (const path of ['/', '/catalogo', '/es/catalogo', '/tiendas/the-pub-game-store']) {
        const result = await guardPanelAccess(req(path))
        expect(result).toBeNull()
      }
      expect(verifyAccessJwtMock).not.toHaveBeenCalled()
    })
  })

  describe('bypass de desarrollo', () => {
    it('permite el paso si ACCESS_LOCAL_BYPASS=true fuera de producción', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('ACCESS_LOCAL_BYPASS', 'true')

      const result = await guardPanelAccess(req('/panel'))

      expect(result).toBeNull()
      expect(verifyAccessJwtMock).not.toHaveBeenCalled()
    })

    it('se ignora en producción incluso si el flag está en true (fail-closed)', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('ACCESS_LOCAL_BYPASS', 'true')
      vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', '')
      vi.stubEnv('CF_ACCESS_AUD', '')

      const result = await guardPanelAccess(req('/panel'))

      expect(result).not.toBeNull()
      expect(result?.status).toBe(503)
    })
  })

  describe('config faltante', () => {
    it('falla cerrado (503) en producción si falta CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', '')
      vi.stubEnv('CF_ACCESS_AUD', '')

      const result = await guardPanelAccess(req('/en/panel/inventario'))

      expect(result?.status).toBe(503)
    })

    it('deja pasar con warning fuera de producción si falta config', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', '')
      vi.stubEnv('CF_ACCESS_AUD', '')
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await guardPanelAccess(req('/panel'))

      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
    })
  })

  describe('con Access configurado', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('CF_ACCESS_TEAM_DOMAIN', 'thepubmarket.cloudflareaccess.com')
      vi.stubEnv('CF_ACCESS_AUD', 'aud-tag')
    })

    it('devuelve 401 si falta el header Cf-Access-Jwt-Assertion', async () => {
      const result = await guardPanelAccess(req('/panel'))

      expect(result?.status).toBe(401)
      expect(verifyAccessJwtMock).not.toHaveBeenCalled()
    })

    it('devuelve 403 si el token es inválido', async () => {
      verifyAccessJwtMock.mockResolvedValue({ valid: false, reason: 'bad_signature' })

      const result = await guardPanelAccess(
        req('/panel', { 'Cf-Access-Jwt-Assertion': 'un-token-cualquiera' }),
      )

      expect(result?.status).toBe(403)
    })

    it('deja pasar (null) si el token es válido', async () => {
      verifyAccessJwtMock.mockResolvedValue({ valid: true, email: 'seller@thepubmarket.mx' })

      const result = await guardPanelAccess(
        req('/es/panel/ordenes', { 'Cf-Access-Jwt-Assertion': 'un-token-valido' }),
      )

      expect(result).toBeNull()
      expect(verifyAccessJwtMock).toHaveBeenCalledWith('un-token-valido', {
        teamDomain: 'thepubmarket.cloudflareaccess.com',
        aud: 'aud-tag',
      })
    })
  })
})
