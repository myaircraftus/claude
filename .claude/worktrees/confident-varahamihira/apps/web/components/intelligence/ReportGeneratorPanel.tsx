'use client'

import { useState, useCallback } from 'react'
import {
  FileText, Wrench, CheckCircle, Clock, AlertTriangle,
  Download, Loader2, CreditCard, Share2, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportJob } from '@/types/intelligence'

interface Props {
  aircraftId: string
  existingReports: ReportJob[]
}

const REPORT_TYPES = [
  {
    id: 'aircraft_overview',
    label: 'Aircraft Overview',
    description: 'Complete status summary with narrative',
    icon: FileText,
    paid: false,
  },
  {
    id: 'engine_prop_summary',
    label: 'Engine & Prop',
    description: 'Overhauls, oil changes, compression history',
    icon: Wrench,
    paid: false,
  },
  {
    id: 'inspection_status',
    label: 'Inspection Status',
    description: 'All inspection currency with table view',
    icon: CheckCircle,
    paid: false,
  },
  {
    id: 'maintenance_timeline',
    label: 'Maintenance Timeline',
    description: 'Full chronological maintenance history',
    icon: Clock,
    paid: false,
  },
  {
    id: 'missing_records',
    label: 'Missing Records',
    description: 'Gaps and discrepancy findings report',
    icon: AlertTriangle,
    paid: false,
  },
  {
    id: 'prebuy_packet',
    label: 'Prebuy Packet',
    description: 'AI executive summary for aircraft buyers ($99)',
    icon: CreditCard,
    paid: true,
    price: '$99',
  },
  {
    id: 'lender_packet',
    label: 'Lender Packet',
    description: 'Collateral assessment for lenders ($149)',
    icon: CreditCard,
    paid: true,
    price: '$149',
  },
  {
    id: 'insurer_packet',
    label: 'Insurer Packet',
    description: 'Underwriting summary for insurers ($149)',
    icon: CreditCard,
    paid: true,
    price: '$149',
  },
] as const

export function ReportGeneratorPanel({ aircraftId, existingReports }: Props) {
  const [jobs, setJobs] = useState<ReportJob[]>(existingReports)
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [sharing, setSharing] = useState<Record<string, boolean>>({})
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({})

  const latestByType = useCallback(
    (type: string) => {
      return [...jobs]
        .filter(j => j.report_type === type)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    },
    [jobs]
  )

  async function handleGenerate(reportType: string, paid: boolean) {
    if (paid) {
      // Redirect to Stripe checkout
      const res = await fetch('/api/billing/report-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, report_type: reportType }),
      })
      const data = await res.json()
      if (data.checkout_url) window.location.href = data.checkout_url
      return
    }

    setGenerating(prev => ({ ...prev, [reportType]: true }))
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, report_type: reportType }),
      })
      const data = await res.json()
      if (!data.job_id) return

      // Add optimistic job
      const optimisticJob: ReportJob = {
        id: data.job_id,
        aircraft_id: aircraftId,
        organization_id: '',
        requested_by: null,
        report_type: reportType as ReportJob['report_type'],
        status: 'queued',
        options: {},
        stripe_payment_intent_id: null,
        is_paid: false,
        share_token: null,
        share_token_expires_at: null,
        share_accessed_count: 0,
        storage_path: null,
        signed_url: null,
        signed_url_expires: null,
        file_size_bytes: null,
        generation_started_at: null,
        generation_completed_at: null,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setJobs(prev => [optimisticJob, ...prev])

      // Poll for completion
      const pollInterval = setInterval(async () => {
        const pollRes = await fetch(`/api/reports/${data.job_id}`)
        const pollData = await pollRes.json()
        if (pollData.job) {
          setJobs(prev => prev.map(j => (j.id === data.job_id ? pollData.job : j)))
          if (
            pollData.job.status === 'completed' ||
            pollData.job.status === 'failed'
          ) {
            clearInterval(pollInterval)
            setGenerating(prev => ({ ...prev, [reportType]: false }))
          }
        }
      }, 3000)

      // Safety timeout at 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval)
        setGenerating(prev => ({ ...prev, [reportType]: false }))
      }, 300000)
    } catch {
      setGenerating(prev => ({ ...prev, [reportType]: false }))
    }
  }

  async function handleShare(jobId: string) {
    setSharing(prev => ({ ...prev, [jobId]: true }))
    try {
      const res = await fetch('/api/reports/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, expires_days: 30 }),
      })
      const data = await res.json()
      if (data.share_url) {
        setShareLinks(prev => ({ ...prev, [jobId]: data.share_url }))
        await navigator.clipboard.writeText(data.share_url).catch(() => {})
      }
    } finally {
      setSharing(prev => ({ ...prev, [jobId]: false }))
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORT_TYPES.map(rt => {
          const Icon = rt.icon
          const latestJob = latestByType(rt.id)
          const isGenerating = generating[rt.id]
          const isPaid = rt.paid

          return (
            <div
              key={rt.id}
              className="border border-border rounded-xl p-4 flex flex-col gap-3 bg-card"
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  isPaid ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/10'
                )}>
                  <Icon className={cn('h-4 w-4', isPaid ? 'text-amber-600' : 'text-primary')} />
                </div>
                <div>
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    {rt.label}
                    {isPaid && (
                      <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                        {(rt as any).price}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{rt.description}</div>
                </div>
              </div>

              {/* Latest job status */}
              {latestJob && (
                <div className="text-xs rounded-lg px-3 py-2 bg-muted/50">
                  {latestJob.status === 'completed' ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Ready
                      </span>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={latestJob.signed_url ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <Download className="h-3 w-3" /> PDF
                        </a>
                        {isPaid && (
                          <button
                            onClick={() => handleShare(latestJob.id)}
                            disabled={sharing[latestJob.id]}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          >
                            <Share2 className="h-3 w-3" />
                            {sharing[latestJob.id] ? 'Copying…' : shareLinks[latestJob.id] ? 'Copied!' : 'Share'}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : latestJob.status === 'generating' || latestJob.status === 'queued' ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {latestJob.status === 'queued' ? 'Queued…' : 'Generating PDF…'}
                    </span>
                  ) : (
                    <span className="text-red-500">Failed — try again</span>
                  )}
                </div>
              )}

              <button
                onClick={() => handleGenerate(rt.id, isPaid)}
                disabled={isGenerating}
                className={cn(
                  'w-full py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5',
                  isPaid
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-foreground text-background hover:opacity-90',
                  isGenerating && 'opacity-50 cursor-not-allowed'
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating…
                  </>
                ) : isPaid ? (
                  <>
                    <CreditCard className="h-3 w-3" />
                    {latestJob?.status === 'completed' ? 'Regenerate' : 'Purchase & Generate'}
                  </>
                ) : (
                  <>
                    <FileText className="h-3 w-3" />
                    {latestJob?.status === 'completed' ? 'Regenerate' : 'Generate PDF'}
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* History table */}
      {jobs.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Report History
          </div>
          <div className="divide-y divide-border">
            {[...jobs]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .slice(0, 10)
              .map(job => (
                <div key={job.id} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div>
                    <div className="text-sm font-medium capitalize">
                      {job.report_type.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(job.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={job.status} />
                    {job.status === 'completed' && job.signed_url && (
                      <a
                        href={job.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Download
                      </a>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    generating: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    queued: 'bg-muted text-muted-foreground',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  }
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', map[status] ?? 'bg-muted')}>
      {status}
    </span>
  )
}
