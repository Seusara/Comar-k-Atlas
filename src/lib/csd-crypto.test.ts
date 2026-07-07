import { describe, expect, it } from 'vitest'
import { encryptCsd, decryptCsd, type CsdPayload } from './csd-crypto'

describe('csd-crypto', () => {
  const payload: CsdPayload = {
    certificateBase64: 'ZmFrZS1jZXJ0aWZpY2F0ZS1ieXRlcw==',
    privateKeyBase64: 'ZmFrZS1wcml2YXRlLWtleS1ieXRlcw==',
    password: 'super-secreta-123',
  }

  it('descifra exactamente lo que se cifró', () => {
    const encrypted = encryptCsd(payload)
    const decrypted = decryptCsd(encrypted)
    expect(decrypted).toEqual(payload)
  })

  it('produce cifrados distintos cada vez (IV aleatorio)', () => {
    const first = encryptCsd(payload)
    const second = encryptCsd(payload)
    expect(first.equals(second)).toBe(false)
  })

  it('el texto cifrado no contiene el certificado en claro', () => {
    const encrypted = encryptCsd(payload)
    expect(encrypted.toString('utf8')).not.toContain(payload.certificateBase64)
    expect(encrypted.toString('utf8')).not.toContain(payload.password)
  })

  it('rechaza un blob alterado (autenticación falla)', () => {
    const encrypted = encryptCsd(payload)
    encrypted[encrypted.length - 1] ^= 0xff
    expect(() => decryptCsd(encrypted)).toThrow()
  })
})
