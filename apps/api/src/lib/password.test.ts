import { describe, expect, it } from 'vitest'
import { dummyVerify, hashPassword, needsRehash, verifyPassword } from './password'

const PASSWORD = 'correct horse battery staple'

describe('hashPassword', () => {
  it('emits the self-describing chained format', async () => {
    const stored = await hashPassword(PASSWORD)
    const [algo, iterations, salt, hash] = stored.split('$')
    expect(algo).toBe('pbkdf2-sha512x3')
    expect(Number(iterations)).toBe(70_000)
    expect(atob(salt as string)).toHaveLength(16)
    expect(atob(hash as string)).toHaveLength(32)
  })

  /**
   * El runtime de Cloudflare rechaza PBKDF2 con más de 100,000 iteraciones,
   * y `wrangler dev` local NO aplica ese tope — el fallo solo aparece en
   * producción. Este test es lo que impide que vuelva a colarse un valor
   * por encima del límite en un deploy.
   */
  it('mantiene las iteraciones por ronda dentro del tope de 100k de Workers', async () => {
    const stored = await hashPassword(PASSWORD)
    const iterations = Number(stored.split('$')[1])

    expect(iterations).toBeLessThanOrEqual(100_000)
  })

  it('encadena rondas hasta alcanzar el factor de trabajo de OWASP para SHA-512', async () => {
    const [algo, iterations] = (await hashPassword(PASSWORD)).split('$')
    const rounds = Number((algo as string).split('x')[1])

    expect(rounds * Number(iterations)).toBe(210_000)
  })

  it('salts each hash, so the same password never stores the same digest', async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD))
  })
})

describe('verifyPassword', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hashPassword(PASSWORD)
    expect(await verifyPassword(PASSWORD, stored)).toBe(true)
    expect(await verifyPassword('correct horse battery stapl', stored)).toBe(false)
    expect(await verifyPassword('', stored)).toBe(false)
  })

  it('still verifies single-round hashes written under older params', async () => {
    // Formato de una sola ronda, sin sufijo `x<n>` — el que se escribía antes
    // de que el tope de 100k obligara a encadenar. Subir los parámetros nunca
    // debe dejar a nadie fuera de su cuenta.
    const salt = new Uint8Array(16).fill(7)
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(PASSWORD),
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
      keyMaterial,
      256,
    )
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
    const legacy = `pbkdf2-sha256$100000$${b64(salt)}$${b64(new Uint8Array(bits))}`

    expect(await verifyPassword(PASSWORD, legacy)).toBe(true)
    expect(await verifyPassword('wrong', legacy)).toBe(false)
  })

  /**
   * Un hash escrito con iteraciones por encima del tope de Workers no se puede
   * recomputar: `deriveBits` lanzaría. Debe fallar cerrado (false), no tumbar
   * el endpoint de login con un 500 — que es exactamente lo que pasó en el
   * primer deploy con PBKDF2 a producción.
   */
  it('falla cerrado ante un hash con iteraciones por encima del tope, sin lanzar', async () => {
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
    const overCap = `pbkdf2-sha512$210000$${b64(new Uint8Array(16))}$${b64(new Uint8Array(32))}`

    await expect(verifyPassword(PASSWORD, overCap)).resolves.toBe(false)
    expect(needsRehash(overCap)).toBe(true)
  })

  it('rejects malformed stored values instead of throwing', async () => {
    for (const bad of [
      '',
      'not-a-hash',
      'pbkdf2-sha512x3$70000$onlythree',
      'bcrypt$70000$c2FsdA==$aGFzaA==',
      'pbkdf2-sha512x3$notanumber$c2FsdA==$aGFzaA==',
      'pbkdf2-sha512x3$0$c2FsdA==$aGFzaA==',
      'pbkdf2-sha512x3$-1$c2FsdA==$aGFzaA==',
      'pbkdf2-sha512x0$70000$c2FsdA==$aGFzaA==',
      'pbkdf2-sha512x99$70000$c2FsdA==$aGFzaA==',
      'pbkdf2-sha512x3$70000$!!!$!!!',
    ]) {
      expect(await verifyPassword(PASSWORD, bad)).toBe(false)
    }
  })
})

describe('needsRehash', () => {
  it('is false for a hash written with the current params', async () => {
    expect(needsRehash(await hashPassword(PASSWORD))).toBe(false)
  })

  it('is true for a weaker algorithm or less total work', () => {
    expect(needsRehash('pbkdf2-sha256$100000$c2FsdA==$aGFzaA==')).toBe(true)
    expect(needsRehash('pbkdf2-sha512$100000$c2FsdA==$aGFzaA==')).toBe(true)
    expect(needsRehash('pbkdf2-sha512x2$70000$c2FsdA==$aGFzaA==')).toBe(true)
  })

  it('es falso si el trabajo total alcanza, aunque el reparto de rondas difiera', () => {
    // 2 × 100k = 200k... no alcanza; 3 × 70k = 210k sí. Lo que cuenta es el
    // producto, no la forma en que está repartido.
    expect(needsRehash('pbkdf2-sha512x2$100000$c2FsdA==$aGFzaA==')).toBe(true)
    expect(needsRehash('pbkdf2-sha512x4$60000$c2FsdA==$aGFzaA==')).toBe(false)
  })

  it('is true for anything unparseable, so it gets rewritten', () => {
    expect(needsRehash('')).toBe(true)
    expect(needsRehash('garbage')).toBe(true)
  })
})

describe('dummyVerify', () => {
  it('resolves without throwing (timing filler on the unknown-account path)', async () => {
    await expect(dummyVerify(PASSWORD)).resolves.toBeUndefined()
  })
})
