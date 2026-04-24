import { describe, expect, it } from 'vitest'
import { diagnoseStaleDocumentProcessing } from '@/lib/documents/processing-health'

describe('diagnoseStaleDocumentProcessing', () => {
  const now = new Date('2026-04-12T11:00:00.000Z').getTime()

  it('marks queued documents as stale when they never start', () => {
    const diagnosis = diagnoseStaleDocumentProcessing(
      {
        id: 'doc-queued',
        parsing_status: 'queued',
        uploaded_at: '2026-04-12T10:30:00.000Z',
        updated_at: '2026-04-12T10:30:00.000Z',
      },
      now
    )

    expect(diagnosis?.nextStatus).toBe('failed')
    expect(diagnosis?.parseError).toContain('never started')
  })

  it('does not mark freshly queued documents as stale', () => {
    const diagnosis = diagnoseStaleDocumentProcessing(
      {
        id: 'doc-fresh',
        parsing_status: 'queued',
        uploaded_at: '2026-04-12T10:55:00.000Z',
        updated_at: '2026-04-12T10:55:00.000Z',
      },
      now
    )

    expect(diagnosis).toBeNull()
  })

  it('marks in-progress OCR documents as stale when they stop making progress', () => {
    const diagnosis = diagnoseStaleDocumentProcessing(
      {
        id: 'doc-ocr',
        parsing_status: 'ocr_processing',
        parse_started_at: '2026-04-12T10:00:00.000Z',
        updated_at: '2026-04-12T10:00:30.000Z',
      },
      now
    )

    expect(diagnosis?.nextStatus).toBe('failed')
    expect(diagnosis?.parseError).toContain('stopped making progress')
  })

  it('leaves completed documents alone', () => {
    const diagnosis = diagnoseStaleDocumentProcessing(
      {
        id: 'doc-complete',
        parsing_status: 'completed',
        updated_at: '2026-04-12T09:00:00.000Z',
      },
      now
    )

    expect(diagnosis).toBeNull()
  })
})
