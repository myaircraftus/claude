export type FieldValidationStatus = 'valid' | 'invalid' | 'suspicious' | 'unvalidated'

export type FieldValidationResult = {
  status: FieldValidationStatus
  normalized?: string | null
  notes?: string | null
}

function normalizeDate(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const slashMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (!slashMatch) return null

  const month = Number(slashMatch[1])
  const day = Number(slashMatch[2])
  let year = Number(slashMatch[3])
  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeNumeric(input: string): string | null {
  const trimmed = input.trim().replace(/,/g, '')
  if (!trimmed) return null
  if (!/^[-+]?\d+(\.\d+)?$/.test(trimmed)) return null
  return trimmed
}

export function validateOcrField(fieldName: string, value: string | null | undefined): FieldValidationResult {
  if (!value) return { status: 'unvalidated', normalized: null }
  const trimmed = value.trim()
  if (!trimmed) return { status: 'unvalidated', normalized: null }

  switch (fieldName) {
    case 'entry_date': {
      const normalized = normalizeDate(trimmed)
      if (!normalized) return { status: 'invalid', notes: 'Unparseable date' }
      return { status: 'valid', normalized }
    }
    case 'tach_time':
    case 'airframe_tt':
    case 'tsmoh': {
      const normalized = normalizeNumeric(trimmed)
      if (!normalized) return { status: 'invalid', notes: 'Not a number' }
      const numeric = Number(normalized)
      if (numeric < 0 || numeric > 200000) {
        return { status: 'suspicious', normalized, notes: 'Out of expected range' }
      }
      return { status: 'valid', normalized }
    }
    case 'mechanic_cert_number':
    case 'ia_cert_number': {
      const digits = trimmed.replace(/[^0-9]/g, '')
      if (digits.length < 5) {
        return { status: 'suspicious', normalized: trimmed, notes: 'Cert number length looks short' }
      }
      return { status: 'valid', normalized: trimmed }
    }
    case 'ad_reference': {
      const normalized = trimmed.toUpperCase()
      if (!/\b\d{2}-\d{2}-\d{2}\b/.test(normalized)) {
        return { status: 'suspicious', normalized, notes: 'AD reference format unexpected' }
      }
      return { status: 'valid', normalized }
    }
    default:
      return { status: 'unvalidated', normalized: trimmed }
  }
}
