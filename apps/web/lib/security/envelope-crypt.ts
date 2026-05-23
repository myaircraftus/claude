/**
 * Envelope-encryption helpers for third-party credentials.
 *
 * Why: storing a user's Flight Schedule Pro / Flight Circle password
 * (so an automation agent can log in on their behalf) is a security
 * boundary. We:
 *   1. NEVER log the plaintext password
 *   2. Encrypt with AES-256-GCM
 *   3. Hold the key (KEK) in the env var EXTERNAL_CRED_KEK — not in
 *      the database — so a DB dump alone doesn't expose passwords
 *   4. Per-row random IV stored alongside the ciphertext
 *   5. Authenticated mode (GCM) so silent tampering can't slip through
 *
 * The KEK is a 32-byte (64-hex-char) key. Generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * Then set EXTERNAL_CRED_KEK in Vercel + locally.
 *
 * Rotation note: this module currently uses a single KEK. To rotate
 * KEKs cleanly we'd add a version byte to the ciphertext header; until
 * a real rotation is needed we keep the format minimal.
 */
import crypto from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY_BYTES = 32 // AES-256
const IV_BYTES = 12 // recommended for GCM
const AUTH_TAG_BYTES = 16

function readKek(): Buffer {
  const raw = (process.env.EXTERNAL_CRED_KEK ?? '').trim()
  if (!raw) {
    throw new Error(
      'EXTERNAL_CRED_KEK env var is missing. Generate with: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    )
  }
  // Accept hex (64 chars) or base64. Hex is recommended (no padding).
  let key: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else {
    key = Buffer.from(raw, 'base64')
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `EXTERNAL_CRED_KEK has wrong length: got ${key.length} bytes, expected ${KEY_BYTES}.`,
    )
  }
  return key
}

/**
 * Encrypts `plaintext` with AES-256-GCM. Returns { ciphertext, iv } as
 * Buffers. The auth tag is appended to the ciphertext so the column
 * stores `ciphertext || authTag` and the IV separately.
 */
export function encryptCredential(plaintext: string): { ciphertext: Buffer; iv: Buffer } {
  const key = readKek()
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGO, key, iv) as crypto.CipherGCM
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { ciphertext: Buffer.concat([enc, authTag]), iv }
}

/** Decrypts a ciphertext-with-tag + IV pair into the original plaintext. */
export function decryptCredential(ciphertextWithTag: Buffer, iv: Buffer): string {
  const key = readKek()
  if (ciphertextWithTag.length < AUTH_TAG_BYTES + 1) {
    throw new Error('Ciphertext too short')
  }
  if (iv.length !== IV_BYTES) {
    throw new Error('IV has wrong length')
  }
  const enc = ciphertextWithTag.subarray(0, ciphertextWithTag.length - AUTH_TAG_BYTES)
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - AUTH_TAG_BYTES)
  const decipher = crypto.createDecipheriv(ALGO, key, iv) as crypto.DecipherGCM
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}
