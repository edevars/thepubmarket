import { describe, expect, it } from 'vitest'
import { dummyVerify, hashPassword, needsRehash, verifyPassword } from './password'

const PASSWORD = 'correct horse battery staple'

describe('hashPassword', () => {
  it('emits the self-describing pbkdf2-sha512 format', async () => {
    const stored = await hashPassword(PASSWORD)
    const [algo, iterations, salt, hash] = stored.split('$')
    expect(algo).toBe('pbkdf2-sha512')
    expect(Number(iterations)).toBe(210_000)
    expect(atob(salt as string)).toHaveLength(16)
    expect(atob(hash as string)).toHaveLength(32)
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

  it('still verifies hashes written under the previous sha256 params', async () => {
    // Produced by the pre-TASK-011 implementation (PBKDF2-HMAC-SHA256 @ 210k)
    // for PASSWORD; the point is that raising the params never locks anyone out.
    const salt = new Uint8Array(16).fill(7)
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(PASSWORD),
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' },
      keyMaterial,
      256,
    )
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
    const legacy = `pbkdf2-sha256$210000$${b64(salt)}$${b64(new Uint8Array(bits))}`

    expect(await verifyPassword(PASSWORD, legacy)).toBe(true)
    expect(await verifyPassword('wrong', legacy)).toBe(false)
  })

  it('rejects malformed stored values instead of throwing', async () => {
    for (const bad of [
      '',
      'not-a-hash',
      'pbkdf2-sha512$210000$onlythree',
      'bcrypt$210000$c2FsdA==$aGFzaA==',
      'pbkdf2-sha512$notanumber$c2FsdA==$aGFzaA==',
      'pbkdf2-sha512$0$c2FsdA==$aGFzaA==',
      'pbkdf2-sha512$-1$c2FsdA==$aGFzaA==',
      'pbkdf2-sha512$210000$!!!$!!!',
    ]) {
      expect(await verifyPassword(PASSWORD, bad)).toBe(false)
    }
  })
})

describe('needsRehash', () => {
  it('is false for a hash written with the current params', async () => {
    expect(needsRehash(await hashPassword(PASSWORD))).toBe(false)
  })

  it('is true for a weaker algorithm or a lower iteration count', () => {
    expect(needsRehash('pbkdf2-sha256$210000$c2FsdA==$aGFzaA==')).toBe(true)
    expect(needsRehash('pbkdf2-sha512$1000$c2FsdA==$aGFzaA==')).toBe(true)
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
