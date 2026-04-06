'use client'

import { FileText, ExternalLink, BookOpen } from 'lucide-react'
import { DOC_TYPE_LABELS } from '@/lib/utils'
import type { AnswerCitation } from '@/types'

interface CitationCardProps {
  citation: AnswerCitation
  index: number
  isActive: boolean
  onSelect: (citation: AnswerCitation) => void
}

const DOC_TYPE_ICONS: Record<string, string> = {
  logbook: '📋',
  poh: '📘',
  afm: '📗',
  maintenance_manual: '🔧',
  service_bulletin: '⚠️',
  airworthiness_directive: '🚨',
  work_order: '📝',
  inspection_report: '✅',
}

export function CitationCard({ citation, index, isActive, onSelect }: CitationCardProps) {
  const emoji = DOC_TYPE_ICONS[citation.docType] ?? '📄'
  const isAd = citation.docType === 'airworthiness_directive'
  const isSb = citation.docType === 'service_bulletin'

  return (
    <button
      onClick={() => onSelect(citation)}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isActive
          ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200'
          : 'border-border hover:border-brand-200 hover:bg-muted/50'
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Citation number */}
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
          {index}
        </span>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-sm">{emoji}</span>
            <span className="text-xs font-medium text-foreground truncate">
              {citation.documentTitle}
            </span>
            {isAd && (
              <span className="flex-shrink-0 px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded font-semibold">AD</span>
            )}
            {isSb && (
              <span className="flex-shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-semibold">SB</span>
            )}
          </div>

          {/* Page + section */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              p.{citation.pageNumber}
            </span>
            {citation.sectionTitle && (
              <>
                <span>·</span>
                <span className="truncate">{citation.sectionTitle}</span>
              </>
            )}
          </div>

          {/* Snippet */}
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            &ldquo;{citation.snippet}&rdquo;
          </p>
        </div>
      </div>
    </button>
  )
}
