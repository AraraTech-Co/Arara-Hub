import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const KEY_BYTES = 32

export type EncryptedSecret = {
  ciphertext: string
  iv: string
  authTag: string
}

function getMasterKey(): Buffer {
  const raw = process.env.APP_SECRETS_KEY
  if (!raw || !raw.trim()) {
    throw new Error(
      'APP_SECRETS_KEY is required (base64-encoded 32-byte key for AES-256-GCM). Generate with: openssl rand -base64 32',
    )
  }
  let key: Buffer
  try {
    key = Buffer.from(raw.trim(), 'base64')
  } catch {
    throw new Error('APP_SECRETS_KEY must be valid base64')
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `APP_SECRETS_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). Generate with: openssl rand -base64 32`,
    )
  }
  return key
}

/** Validate key at startup / first use — fails fast if misconfigured. */
export function assertAppSecretsKeyConfigured(): void {
  getMasterKey()
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getMasterKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

export function decryptSecret(parts: EncryptedSecret): string {
  const key = getMasterKey()
  const iv = Buffer.from(parts.iv, 'base64')
  const authTag = Buffer.from(parts.authTag, 'base64')
  const ciphertext = Buffer.from(parts.ciphertext, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
