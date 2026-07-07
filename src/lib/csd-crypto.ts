import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

export interface CsdPayload {
  certificateBase64: string
  privateKeyBase64: string
  password: string
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.CSD_ENCRYPTION_KEY
  if (!key) {
    throw new Error('CSD_ENCRYPTION_KEY no está configurada')
  }
  const buffer = Buffer.from(key, 'base64')
  if (buffer.length !== 32) {
    throw new Error('CSD_ENCRYPTION_KEY debe decodificar a 32 bytes en base64')
  }
  return buffer
}

export function encryptCsd(payload: CsdPayload): Buffer {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext])
}

export function decryptCsd(blob: Buffer): CsdPayload {
  const key = getKey()
  const iv = blob.subarray(0, IV_LENGTH)
  const authTag = blob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = blob.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plaintext.toString('utf8')) as CsdPayload
}
