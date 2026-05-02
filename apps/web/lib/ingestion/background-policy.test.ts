import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BACKGROUND_INGESTION_FILE_SIZE_BYTES,
  shouldPreferBackgroundIngestion,
} from '@/lib/ingestion/background-policy'

/**
 * Production behavior is gated by ENABLE_BACKGROUND_INGESTION — the
 * function short-circuits to `false` whenever that env var isn't the
 * literal string "true". The first three tests document the size +
 * doctype branches that run AFTER the gate is open. The fourth test
 * pins down the kill-switch contract so a future refactor that drops
 * the gate (or renames the env var) trips it.
 */
describe('shouldPreferBackgroundIngestion', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefers background processing for files above the size threshold', () => {
    vi.stubEnv('ENABLE_BACKGROUND_INGESTION', 'true')
    expect(
      shouldPreferBackgroundIngestion({
        fileSizeBytes: BACKGROUND_INGESTION_FILE_SIZE_BYTES + 1,
        docType: 'miscellaneous',
      })
    ).toBe(true)
  })

  it('prefers background processing for OCR-heavy document types even when smaller', () => {
    vi.stubEnv('ENABLE_BACKGROUND_INGESTION', 'true')
    expect(
      shouldPreferBackgroundIngestion({
        fileSizeBytes: 3 * 1024 * 1024,
        docType: 'logbook',
      })
    ).toBe(true)
  })

  it('keeps lightweight documents inline when they are small and not OCR-heavy', () => {
    vi.stubEnv('ENABLE_BACKGROUND_INGESTION', 'true')
    expect(
      shouldPreferBackgroundIngestion({
        fileSizeBytes: 2 * 1024 * 1024,
        docType: 'miscellaneous',
      })
    ).toBe(false)
  })

  it('returns false when ENABLE_BACKGROUND_INGESTION is unset, regardless of size/doctype', () => {
    // Explicit kill-switch: env var deliberately NOT stubbed. The function
    // must short-circuit to false even for cases that would otherwise opt
    // into background processing (huge OCR-heavy file).
    vi.stubEnv('ENABLE_BACKGROUND_INGESTION', '')
    expect(
      shouldPreferBackgroundIngestion({
        fileSizeBytes: BACKGROUND_INGESTION_FILE_SIZE_BYTES * 10,
        docType: 'logbook',
      })
    ).toBe(false)

    // Same expectation when set to something that isn't the literal "true".
    vi.stubEnv('ENABLE_BACKGROUND_INGESTION', 'false')
    expect(
      shouldPreferBackgroundIngestion({
        fileSizeBytes: BACKGROUND_INGESTION_FILE_SIZE_BYTES + 1,
        docType: 'form_337',
      })
    ).toBe(false)

    vi.stubEnv('ENABLE_BACKGROUND_INGESTION', '1')
    expect(
      shouldPreferBackgroundIngestion({
        fileSizeBytes: BACKGROUND_INGESTION_FILE_SIZE_BYTES + 1,
        docType: 'logbook',
      })
    ).toBe(false)
  })
})
