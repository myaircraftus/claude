import CryptoJS from 'crypto-js'

const INTEGRATION_CREDENTIAL_VERSION = 'v1'

interface EncryptedIntegrationPayload {
  version: string
  ciphertext: string
}

function getEncryptionSecret() {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET is required for integration credential storage')
  }
  return secret
}

export function encryptIntegrationCredentials<T>(value: T): EncryptedIntegrationPayload {
  const secret = getEncryptionSecret()
  return {
    version: INTEGRATION_CREDENTIAL_VERSION,
    ciphertext: CryptoJS.AES.encrypt(JSON.stringify(value), secret).toString(),
  }
}

export function decryptIntegrationCredentials<T>(value: unknown): T | null {
  if (!value) return null

  if (typeof value === 'object' && value !== null) {
    const candidate = value as Partial<EncryptedIntegrationPayload> & Record<string, unknown>
    if (typeof candidate.ciphertext === 'string') {
      const secret = getEncryptionSecret()
      const bytes = CryptoJS.AES.decrypt(candidate.ciphertext, secret)
      const decrypted = bytes.toString(CryptoJS.enc.Utf8)
      if (!decrypted) {
        throw new Error('Failed to decrypt integration credentials')
      }
      return JSON.parse(decrypted) as T
    }

    return candidate as T
  }

  if (typeof value === 'string') {
    const secret = getEncryptionSecret()
    const bytes = CryptoJS.AES.decrypt(value, secret)
    const decrypted = bytes.toString(CryptoJS.enc.Utf8)
    if (!decrypted) {
      throw new Error('Failed to decrypt integration credentials')
    }
    return JSON.parse(decrypted) as T
  }

  return null
}
