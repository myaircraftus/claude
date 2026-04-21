import { describe, expect, it } from 'vitest'
import {
  buildInitialDocumentProcessingState,
  getDocumentProcessingProgress,
  markDocumentProcessingCompleted,
  markDocumentProcessingFailed,
  markDocumentProcessingStage,
} from '@/lib/documents/processing-state'

describe('document processing state helpers', () => {
  it('builds an initial uploaded state', () => {
    const state = buildInitialDocumentProcessingState('2026-04-21T10:00:00.000Z')

    expect(state.current_stage).toBe('uploaded')
    expect(state.stages?.uploaded?.status).toBe('completed')
  })

  it('tracks stage progress and batch metadata', () => {
    const running = markDocumentProcessingStage(
      buildInitialDocumentProcessingState('2026-04-21T10:00:00.000Z'),
      'document_ai_ocr',
      'running',
      {
        engine: 'google_document_ai',
        currentBatch: 2,
        totalBatches: 4,
        pageCount: 27,
        now: '2026-04-21T10:01:00.000Z',
      }
    )

    expect(running.current_stage).toBe('document_ai_ocr')
    expect(running.current_batch).toBe(2)
    expect(running.total_batches).toBe(4)
    expect(getDocumentProcessingProgress(running)).toBeGreaterThan(30)
  })

  it('marks completion and failure terminal states', () => {
    const completed = markDocumentProcessingCompleted(
      markDocumentProcessingStage(
        buildInitialDocumentProcessingState('2026-04-21T10:00:00.000Z'),
        'embedding',
        'completed',
        { engine: 'openai_embeddings', now: '2026-04-21T10:03:00.000Z' }
      ),
      { now: '2026-04-21T10:04:00.000Z' }
    )

    expect(completed.current_stage).toBe('completed')
    expect(getDocumentProcessingProgress(completed)).toBe(100)

    const failed = markDocumentProcessingFailed(
      completed,
      'Document AI batch 2 of 3 returned 400',
      { now: '2026-04-21T10:05:00.000Z' }
    )

    expect(failed.current_stage).toBe('failed')
    expect(failed.last_error).toContain('batch 2 of 3')
  })
})

