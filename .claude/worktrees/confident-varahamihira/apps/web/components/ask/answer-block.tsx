'use client'

import { AlertTriangle, BookMarked, ChevronRight } from 'lucide-react'
import { ConfidenceBadge } from './confidence-badge'
import type { AnswerCitation, QueryConfidence } from '@/types'

interface AnswerBlockProps {
  answer: string
  confidence: QueryConfidence
  citations: AnswerCitation[]
  warningFlags: string[]
  followUpQuestions: string[]
  onCitationClick: (citation: AnswerCitation) => void
  onFollowUp: (question: string) => void
}

const WARNING_LABELS: Record<string, string> = {
  no_documents_found: 'No matching documents found in your records',
  conflicting_sources: 'Conflicting information found in multiple sources',
  low_ocr_confidence: 'Some source documents had low OCR confidence',
  partial_evidence: 'Answer based on partial evidence only',
}

export function AnswerBlock({
  answer,
  confidence,
  citations,
  warningFlags,
  followUpQuestions,
  onCitationClick,
  onFollowUp,
}: AnswerBlockProps) {
  // Render answer text with clickable citation markers [N]
  function renderAnswerWithCitations(text: string) {
    const parts = text.split(/(\[\d+\])/g)
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/)
      if (match) {
        const num = parseInt(match[1])
        const citation = citations[num - 1]
        if (citation) {
          return (
            <button
              key={i}
              onClick={() => onCitationClick(citation)}
              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-bold hover:bg-brand-600 transition-colors mx-0.5 align-middle"
              title={`${citation.documentTitle} p.${citation.pageNumber}`}
            >
              {num}
            </button>
          )
        }
      }
      return <span key={i}>{part}</span>
    })
  }

  const isInsufficient = confidence === 'insufficient_evidence'

  return (
    <div className="space-y-4">
      {/* Confidence badge */}
      <div className="flex items-center gap-2">
        <ConfidenceBadge confidence={confidence} />
      </div>

      {/* Warning flags */}
      {warningFlags.length > 0 && (
        <div className="space-y-1">
          {warningFlags.map(flag => (
            <div key={flag} className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700">{WARNING_LABELS[flag] ?? flag}</p>
            </div>
          ))}
        </div>
      )}

      {/* Answer text */}
      {isInsufficient ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <BookMarked className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800 mb-1">Insufficient Evidence</p>
              <p className="text-sm text-red-700">{answer}</p>
              <p className="text-xs text-red-500 mt-2">
                Tip: Upload the relevant documents (logbook, POH, maintenance manual) to get accurate answers.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="prose prose-sm max-w-none text-foreground leading-relaxed">
          <p>{renderAnswerWithCitations(answer)}</p>
        </div>
      )}

      {/* Follow-up questions */}
      {followUpQuestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Suggested follow-ups</p>
          {followUpQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => onFollowUp(q)}
              className="w-full flex items-center gap-2 p-2 rounded-md border border-dashed border-border hover:border-brand-300 hover:bg-brand-50 transition-colors text-left"
            >
              <ChevronRight className="h-3.5 w-3.5 text-brand-400 flex-shrink-0" />
              <span className="text-sm text-muted-foreground hover:text-foreground">{q}</span>
            </button>
          ))}
        </div>
      )}

      {/* Legal disclaimer */}
      <p className="text-xs text-muted-foreground/60 border-t pt-3">
        myaircraft.us provides document retrieval, not FAA compliance advice. Always verify with a certified A&P mechanic or FSDO for airworthiness determinations.
      </p>
    </div>
  )
}
