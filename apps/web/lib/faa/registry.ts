export interface NormalizedTailNumber {
  input: string
  normalized: string
  registryKey: string
}

const FAA_TAIL_NUMBER_REGEX = /^N[0-9]{1,5}[A-HJ-NP-Z]{0,2}$/i

export function normalizeTailNumber(input: string): NormalizedTailNumber | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!cleaned) return null

  const normalized = cleaned.startsWith('N') ? cleaned : `N${cleaned}`
  if (!FAA_TAIL_NUMBER_REGEX.test(normalized)) return null

  return {
    input,
    normalized,
    registryKey: normalized.replace(/^N/, ''),
  }
}

export function isValidTailNumber(input: string): boolean {
  return normalizeTailNumber(input) !== null
}
