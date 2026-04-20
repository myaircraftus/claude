import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_INGESTION_FILE_SIZE_BYTES,
  shouldPreferBackgroundIngestion,
} from '@/lib/ingestion/background-policy'

describe('shouldPreferBackgroundIngestion', () => {
  it('prefers background processing for files above the size threshold', () => {
    expect(
      shouldPreferBackgroundIngestion({
        fileSizeBytes: BACKGROUND_INGESTION_FILE_SIZE_BYTES + 1,
        docType: 'miscellaneous',
      })
    ).toBe(true)
  })

  it('prefers background processing for OCR-heavy document types even when smaller', () => {
    expect(
      shouldPreferBackgroundIngestion({
        fileSizeBytes: 3 * 1024 * 1024,
        docType: 'logbook',
      })
    ).toBe(true)
  })

  it('keeps lightweight documents inline when they are small and not OCR-heavy', () => {
    expect(
      shouldPreferBackgroundIngestion({
        fileSizeBytes: 2 * 1024 * 1024,
        docType: 'miscellaneous',
      })
    ).toBe(false)
  })
})
