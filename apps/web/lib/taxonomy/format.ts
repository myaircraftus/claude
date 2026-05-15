export type ClassificationSource = 'manual' | 'suggested' | 'template' | 'imported' | 'ai' | 'unknown'
export type ClassificationConfidence = 'high' | 'medium' | 'low' | 'unknown'
export type ClassificationStatus =
  | 'classified'
  | 'suggested'
  | 'needs_review'
  | 'unclassified'
  | 'not_applicable'

export interface TaxonomyLabelParts {
  ata_code?: string | null
  ata_title?: string | null
  jasc_code?: string | null
  jasc_title?: string | null
}

export function formatTaxonomyLabel(parts: TaxonomyLabelParts) {
  const primary = [parts.ata_title, parts.jasc_title].filter(Boolean).join(' / ')
  const secondary = [
    parts.ata_code ? `ATA ${parts.ata_code}` : null,
    parts.jasc_code ? `JASC ${parts.jasc_code}` : null,
  ].filter(Boolean).join(' · ')

  return {
    label: primary || secondary || 'Unclassified',
    secondary,
  }
}

export function normalizeAtaCode(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  if (/^\d{1,2}$/.test(text)) return text.padStart(2, '0')
  if (/^\d{2}$/.test(text)) return text
  throw new Error('ATA code must be a two-character string, e.g. 05 or 32')
}

export function normalizeJascCode(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  if (/^\d{1,4}$/.test(text)) return text.padStart(4, '0')
  if (/^\d{4}$/.test(text)) return text
  throw new Error('JASC code must be a four-character string, e.g. 0500 or 3240')
}

export function normalizeClassificationSource(value: unknown): ClassificationSource | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim().toLowerCase()
  if (['manual', 'suggested', 'template', 'imported', 'ai', 'unknown'].includes(text)) {
    return text as ClassificationSource
  }
  throw new Error('classification_source is invalid')
}

export function normalizeClassificationConfidence(value: unknown): ClassificationConfidence | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim().toLowerCase()
  if (['high', 'medium', 'low', 'unknown'].includes(text)) {
    return text as ClassificationConfidence
  }
  throw new Error('classification_confidence is invalid')
}

export function normalizeClassificationStatus(
  value: unknown,
  codes: { ataCode?: string | null; jascCode?: string | null },
): ClassificationStatus {
  if (value !== null && value !== undefined && value !== '') {
    const text = String(value).trim().toLowerCase()
    if (['classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable'].includes(text)) {
      return text as ClassificationStatus
    }
    throw new Error('classification_status is invalid')
  }

  return codes.ataCode || codes.jascCode ? 'classified' : 'unclassified'
}

export function buildClassificationPatch(
  body: Record<string, unknown>,
  options: {
    ataKey?: string
    jascKey?: string
    sourceKey?: string
    confidenceKey?: string
    statusKey?: string
    includeUnset?: boolean
  } = {},
) {
  const ataKey = options.ataKey ?? 'ata_code'
  const jascKey = options.jascKey ?? 'jasc_code'
  const sourceKey = options.sourceKey ?? 'classification_source'
  const confidenceKey = options.confidenceKey ?? 'classification_confidence'
  const statusKey = options.statusKey ?? 'classification_status'
  const patch: Record<string, unknown> = {}

  const hasAta = Object.prototype.hasOwnProperty.call(body, ataKey)
  const hasJasc = Object.prototype.hasOwnProperty.call(body, jascKey)
  const jascCode = hasJasc ? normalizeJascCode(body[jascKey]) : undefined
  const ataCode = hasAta
    ? normalizeAtaCode(body[ataKey])
    : jascCode
      ? jascCode.slice(0, 2)
      : undefined

  if (hasAta || hasJasc || options.includeUnset) patch[ataKey] = ataCode ?? null
  if (hasJasc || options.includeUnset) patch[jascKey] = jascCode ?? null

  if (Object.prototype.hasOwnProperty.call(body, sourceKey) || options.includeUnset) {
    patch[sourceKey] = normalizeClassificationSource(body[sourceKey]) ?? null
  }
  if (Object.prototype.hasOwnProperty.call(body, confidenceKey) || options.includeUnset) {
    patch[confidenceKey] = normalizeClassificationConfidence(body[confidenceKey]) ?? null
  }
  if (Object.prototype.hasOwnProperty.call(body, statusKey) || hasAta || hasJasc || options.includeUnset) {
    patch[statusKey] = normalizeClassificationStatus(body[statusKey], {
      ataCode: ataCode ?? null,
      jascCode: jascCode ?? null,
    })
  }

  return patch
}
