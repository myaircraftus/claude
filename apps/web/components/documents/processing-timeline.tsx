'use client'

/**
 * Reusable step-by-step processing timeline. Identical look-and-feel to
 * the upload-dropzone's compact timeline so the visual experience matches
 * whether a doc is being processed for the first time or being retried —
 * the user sees the same Uploaded → PDF Probe → OCR → Parse → Chunk →
 * Embed → Done sequence everywhere.
 */

import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DOCUMENT_PROCESSING_STAGE_LABELS,
  DOCUMENT_PROCESSING_STAGE_ORDER,
  coerceDocumentProcessingState,
} from '@/lib/documents/processing-state'
import type { DocumentProcessingState, DocumentProcessingStage } from '@/types'
import type { ParsingStatus } from '@/types'

const COMPACT_STAGE_ORDER = DOCUMENT_PROCESSING_STAGE_ORDER.filter((stage) => stage !== 'ocr_fallback')

const COMPACT_STAGE_LABELS: Partial<Record<DocumentProcessingStage, string>> = {
  uploaded: 'Uploaded',
  native_text_probe: 'PDF Probe',
  document_ai_ocr: 'OCR',
  field_extraction: 'Parse',
  chunking: 'Chunk',
  embedding: 'Embed',
  completed: 'Done',
}

function getCompactStageLabel(
  state: DocumentProcessingState,
  stage: DocumentProcessingStage,
): string {
  const snapshot = state.stages?.[stage]
  if (stage === 'document_ai_ocr' && snapshot?.status === 'skipped') {
    return 'OCR Skipped'
  }
  return COMPACT_STAGE_LABELS[stage] ?? DOCUMENT_PROCESSING_STAGE_LABELS[stage]
}

interface DocumentProcessingTimelineProps {
  /** Live processing state from the documents row. */
  state: DocumentProcessingState | null | undefined
  /** Falls back to inferring a state from the parsing_status when state is null. */
  fallbackStatus?: ParsingStatus
  /** Compact (one-line, small) vs comfortable (slightly larger circles). */
  size?: 'compact' | 'comfortable'
  className?: string
}

export function DocumentProcessingTimeline({
  state,
  fallbackStatus,
  size = 'compact',
  className,
}: DocumentProcessingTimelineProps) {
  const normalizedState = state
    ? state
    : coerceDocumentProcessingState(null, undefined, {
        status: fallbackStatus ?? 'queued',
      })

  const displayStages = [...COMPACT_STAGE_ORDER]
  if (
    normalizedState.current_stage === 'needs_review' ||
    normalizedState.current_stage === 'failed'
  ) {
    displayStages.push(normalizedState.current_stage)
  }

  const circleSize = size === 'comfortable' ? 'h-7 w-7 text-[11px]' : 'h-6 w-6 text-[10px]'
  const labelSize = size === 'comfortable' ? 'text-[11px]' : 'text-[10px]'
  const connectorWidth = size === 'comfortable' ? 'w-8' : 'w-6'
  const iconSize = size === 'comfortable' ? 'h-4 w-4' : 'h-3.5 w-3.5'

  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="flex min-w-max items-start gap-1.5">
        {displayStages.map((stage, index) => {
          const snapshot = normalizedState.stages?.[stage]
          const inferredStatus =
            snapshot?.status ??
            (stage === normalizedState.current_stage ? 'running' : stage === 'uploaded' ? 'completed' : 'pending')
          const label = getCompactStageLabel(normalizedState, stage)

          const circleClass =
            inferredStatus === 'completed'
              ? 'border-green-600 bg-green-600 text-white'
              : inferredStatus === 'running'
                ? 'border-blue-600 bg-blue-600 text-white'
                : inferredStatus === 'failed'
                  ? 'border-red-600 bg-red-600 text-white'
                  : inferredStatus === 'skipped'
                    ? 'border-slate-300 bg-slate-100 text-slate-500'
                    : 'border-slate-300 bg-white text-slate-400'

          const textClass =
            inferredStatus === 'completed'
              ? 'text-green-700'
              : inferredStatus === 'running'
                ? 'text-blue-700'
                : inferredStatus === 'failed'
                  ? 'text-red-700'
                  : inferredStatus === 'skipped'
                    ? 'text-slate-500'
                    : 'text-slate-500'

          return (
            <div key={stage} className="flex items-center gap-1.5">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full border font-semibold',
                    circleSize,
                    circleClass,
                  )}
                >
                  {inferredStatus === 'completed' ? (
                    <CheckCircle2 className={iconSize} />
                  ) : inferredStatus === 'running' ? (
                    <Loader2 className={cn(iconSize, 'animate-spin')} />
                  ) : inferredStatus === 'failed' ? (
                    <AlertCircle className={iconSize} />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className={cn(labelSize, 'font-medium whitespace-nowrap', textClass)}>{label}</span>
              </div>
              {index < displayStages.length - 1 && (
                <div
                  className={cn(
                    'mb-4 h-0.5 rounded-full',
                    connectorWidth,
                    inferredStatus === 'completed' ? 'bg-green-400' : 'bg-slate-200',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
