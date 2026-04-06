import { HTMLAttributes } from 'react'

type DocType = 'logbook' | 'poh' | 'afm' | 'manual' | 'parts' | 'workorder' | 'ad' | 'sb' | '337' | 'form8130' | 'misc'
type StatusType = 'active' | 'processing' | 'error' | 'complete' | 'pending' | 'queued'
type ConfidenceType = 'high' | 'medium' | 'low' | 'insufficient'

const docTypeConfig: Record<DocType, { label: string; color: string; bg: string }> = {
  logbook:   { label: 'Logbook',    color: '#2563EB', bg: '#EFF6FF' },
  poh:       { label: 'POH',        color: '#7C3AED', bg: '#F5F3FF' },
  afm:       { label: 'AFM',        color: '#0891B2', bg: '#ECFEFF' },
  manual:    { label: 'Manual',     color: '#059669', bg: '#ECFDF5' },
  parts:     { label: 'Parts Cat',  color: '#D97706', bg: '#FFFBEB' },
  workorder: { label: 'Work Order', color: '#DC2626', bg: '#FEF2F2' },
  ad:        { label: 'AD',         color: '#B45309', bg: '#FFFBEB' },
  sb:        { label: 'SB',         color: '#0369A1', bg: '#F0F9FF' },
  '337':     { label: 'Form 337',   color: '#6D28D9', bg: '#F5F3FF' },
  form8130:  { label: '8130',       color: '#065F46', bg: '#ECFDF5' },
  misc:      { label: 'Misc',       color: '#6B7280', bg: '#F9FAFB' },
}

const confidenceConfig: Record<ConfidenceType, { label: string; color: string; bg: string }> = {
  high:         { label: 'High Confidence',         color: '#065F46', bg: '#ECFDF5' },
  medium:       { label: 'Medium Confidence',       color: '#92400E', bg: '#FFFBEB' },
  low:          { label: 'Low Confidence',          color: '#9A3412', bg: '#FFF7ED' },
  insufficient: { label: 'Insufficient Evidence',   color: '#991B1B', bg: '#FEF2F2' },
}

const statusConfig: Record<StatusType, { label: string; color: string; bg: string; dot: string }> = {
  active:     { label: 'Active',      color: '#065F46', bg: '#ECFDF5', dot: '#10B981' },
  processing: { label: 'Processing',  color: '#1E40AF', bg: '#EFF6FF', dot: '#3B82F6' },
  error:      { label: 'Error',       color: '#991B1B', bg: '#FEF2F2', dot: '#EF4444' },
  complete:   { label: 'Complete',    color: '#065F46', bg: '#ECFDF5', dot: '#10B981' },
  pending:    { label: 'Pending',     color: '#78350F', bg: '#FFFBEB', dot: '#F59E0B' },
  queued:     { label: 'Queued',      color: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' },
}

interface MaBadgeProps {
  type: 'docType' | 'status' | 'confidence'
  value: string
  className?: string
}

export function MaBadge({ type, value, className = '' }: MaBadgeProps) {
  let cfg: { label: string; color: string; bg: string; dot?: string } | undefined

  if (type === 'docType') cfg = docTypeConfig[value as DocType] ?? docTypeConfig.misc
  else if (type === 'confidence') cfg = confidenceConfig[value as ConfidenceType] ?? confidenceConfig.insufficient
  else cfg = statusConfig[value as StatusType] ?? statusConfig.pending

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${className}`}
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {type === 'status' && cfg.dot && (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      )}
      {cfg.label}
    </span>
  )
}
