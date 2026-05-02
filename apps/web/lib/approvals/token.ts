/**
 * Approval token helper (Spec 1.5).
 *
 * Generates cryptographically random URL tokens for public approval
 * links. Tokens go into approval_requests.public_token (UNIQUE indexed)
 * and form the only auth needed to view + respond from the customer
 * side — so they MUST be unguessable.
 *
 * Format: 32 chars of base32 (~160 bits of entropy). URL-safe, no
 * confusion characters (0/O, 1/I/l).
 */

import { randomBytes } from 'crypto'

// Crockford base32 — no I/L/O/U.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

/**
 * Generate a 32-character token (~160 bits). Collision probability at
 * any realistic scale is negligible, but the public_token UNIQUE index
 * still guards against the pathological case.
 */
export function generateApprovalToken(): string {
  const bytes = randomBytes(20) // 20 bytes = 160 bits
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    // Simple modular projection — the alphabet has 30 chars vs. byte
    // space of 256, so a couple of values repeat. Bias is ~6/256, fine
    // for an unguessable URL token.
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  // 20 input bytes give us 20 chars — pad to 32 with another 12.
  const more = randomBytes(12)
  for (let i = 0; i < more.length; i++) {
    out += ALPHABET[more[i] % ALPHABET.length]
  }
  return out
}

/** Cheap structural validation — token shape only, not membership. */
export function isValidTokenShape(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Z0-9]{20,64}$/.test(t)
}
