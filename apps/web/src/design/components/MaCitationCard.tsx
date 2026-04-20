'use client'
import { MaIcon } from '../icons/MaIcon'
import { MaBadge } from './MaBadge'

interface CitationCardProps {
  docName: string
  docType: string
  section?: string
  pageNumber: number
  snippet: string
  confidence: 'high' | 'medium' | 'low' | 'insufficient'
  onPreview?: () => void
}

const confidenceBorder: Record<string, string> = {
  high: '#10B981', medium: '#F59E0B', low: '#F97316', insufficient: '#EF4444'
}

export function MaCitationCard({ docName, docType, section, pageNumber, snippet, confidence, onPreview }: CitationCardProps) {
  return (
    <div
      className="bg-white rounded-[10px] border border-[#E2E8F0] p-3 text-sm"
      style={{ borderLeftWidth: 3, borderLeftColor: confidenceBorder[confidence] }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <MaBadge type="docType" value={docType} />
          <MaBadge type="confidence" value={confidence} />
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F1F3F7] text-[#4B5563]">
            <MaIcon name="page" size={11} />
            Page {pageNumber}
          </span>
        </div>
      </div>
      <p className="font-medium text-[#0D1117] text-[13px] truncate mb-0.5">{docName}</p>
      {section && <p className="text-[11px] text-[#9CA3AF] mb-1.5">{section}</p>}
      <p className="text-[13px] text-[#4B5563] line-clamp-2 leading-relaxed">&ldquo;{snippet}&rdquo;</p>
      {onPreview && (
        <button onClick={onPreview} className="mt-2 text-[12px] text-[#2563EB] font-medium hover:underline flex items-center gap-1">
          View source <MaIcon name="arrowRight" size={11} />
        </button>
      )}
    </div>
  )
}
