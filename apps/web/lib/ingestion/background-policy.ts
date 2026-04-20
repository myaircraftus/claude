import type { DocType } from '@/types'

// Mid-size scanned PDFs already feel slow on mobile if we OCR inline.
// Queue them sooner so upload completes quickly and OCR continues in the background.
export const BACKGROUND_INGESTION_FILE_SIZE_BYTES = 15 * 1024 * 1024 // 15 MB

const OCR_HEAVY_DOC_TYPES = new Set<DocType>([
  'logbook',
  'inspection_report',
  'form_337',
  'form_8130',
  'work_order',
  'service_bulletin',
  'airworthiness_directive',
])

export function shouldPreferBackgroundIngestion(args: {
  fileSizeBytes: number
  docType?: DocType | null
}) {
  if (process.env.ENABLE_BACKGROUND_INGESTION !== 'true') {
    return false
  }

  if (args.fileSizeBytes >= BACKGROUND_INGESTION_FILE_SIZE_BYTES) {
    return true
  }

  return args.docType ? OCR_HEAVY_DOC_TYPES.has(args.docType) : false
}
