'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Wrench,
  ClipboardList,
  Clock,
  AlertTriangle,
  DollarSign,
  Download,
  Loader2,
} from 'lucide-react'
import type { ReportJob } from '@/types/intelligence'

interface ReportGeneratorPanelProps {
  aircraftId: string
  existingReports: ReportJob[]
}

type ReportType = ReportJob['report_type']

const FREE_REPORTS: { type: ReportType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    type: 'aircraft_overview',
    label: 'Aircraft Overview',
    description: 'Full status summary with health score and narrative',
    icon: <FileText className="h-5 w-5" />,
  },
  {
    type: 'engine_prop_summary',
    label: 'Engine & Prop',
    description: 'Engine and propeller history and time tracking',
    icon: <Wrench className="h-5 w-5" />,
  },
  {
    type: 'inspection_status',
    label: 'Inspection Status',
    description: 'All inspection currency dates and compliance',
    icon: <ClipboardList className="h-5 w-5" />,
  },
  {
    type: 'maintenance_timeline',
    label: 'Maintenance Timeline',
    description: 'Chronological maintenance history report',
    icon: <Clock className="h-5 w-5" />,
  },
  {
    type: 'missing_records',
    label: 'Missing Records',
    description: 'All open findings and record gaps',
    icon: <AlertTriangle className="h-5 w-5" />,
  },
]

const PAID_REPORTS: { type: ReportType; label: string; description: string; price: string }[] = [
  {
    type: 'prebuy_packet',
    label: 'Prebuy Packet',
    description: 'Comprehensive buyer summary with risk rating',
    price: '$99',
  },
  {
    type: 'lender_packet',
    label: 'Lender Report',
    description: 'Collateral assessment for aircraft financing',
    price: '$149',
  },
  {
    type: 'insurer_packet',
    label: 'Insurance Summary',
    description: 'Underwriting summary for insurance applications',
    price: '$149',
  },
]

export function ReportGeneratorPanel({ aircraftId, existingReports }: ReportGeneratorPanelProps) {
  const [jobs, setJobs] = useState<Record<ReportType, ReportJob | null>>(() => {
    const map: Partial<Record<ReportType, ReportJob | null>> = {}
    for (const r of existingReports) {
      if (!map[r.report_type] || new Date(r.created_at) > new Date(map[r.report_type]!.created_at)) {
        map[r.report_type] = r
      }
    }
    return map as Record<ReportType, ReportJob | null>
  })
  const [generating, setGenerating] = useState<Partial<Record<ReportType, boolean>>>({})

  async function queueReport(reportType: ReportType) {
    setGenerating(g => ({ ...g, [reportType]: true }))

    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aircraft_id: aircraftId, report_type: reportType }),
    })
    const { job_id } = await res.json()
    if (!job_id) { setGenerating(g => ({ ...g, [reportType]: false })); return }

    // Poll until done
    const poll = setInterval(async () => {
      const r = await fetch(`/api/reports/${job_id}`)
      const { job } = await r.json()
      if (!job) return
      if (job.status === 'completed' || job.status === 'failed') {
        clearInterval(poll)
        setJobs(prev => ({ ...prev, [reportType]: job }))
        setGenerating(g => ({ ...g, [reportType]: false }))
      }
    }, 3000)
  }

  async function startCheckout(reportType: ReportType) {
    const res = await fetch('/api/billing/report-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aircraft_id: aircraftId, report_type: reportType }),
    })
    const { checkout_url } = await res.json()
    if (checkout_url) window.location.href = checkout_url
  }

  return (
    <div className="space-y-6">
      {/* Free reports */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Standard Reports</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FREE_REPORTS.map(({ type, label, description, icon }) => {
            const job = jobs[type]
            const isGenerating = generating[type]

            return (
              <div
                key={type}
                className="border border-gray-200 rounded-lg p-4 flex flex-col gap-3 bg-white"
              >
                <div className="flex items-center gap-2 text-gray-700">
                  {icon}
                  <span className="font-medium text-sm">{label}</span>
                </div>
                <p className="text-xs text-gray-500 flex-1">{description}</p>
                {isGenerating ? (
                  <Button size="sm" disabled className="w-full">
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Generating…
                  </Button>
                ) : job?.status === 'completed' && job.signed_url ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 text-xs" asChild>
                      <a href={job.signed_url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3 w-3 mr-1" /> Download
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => queueReport(type)}>
                      Refresh
                    </Button>
                  </div>
                ) : job?.status === 'failed' ? (
                  <Button size="sm" variant="outline" className="w-full text-xs text-red-600" onClick={() => queueReport(type)}>
                    Failed — Retry
                  </Button>
                ) : (
                  <Button size="sm" className="w-full" onClick={() => queueReport(type)}>
                    Generate PDF
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Paid reports */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Premium Packets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PAID_REPORTS.map(({ type, label, description, price }) => {
            const job = jobs[type]
            const isGenerating = generating[type]

            return (
              <div
                key={type}
                className="border border-indigo-200 rounded-lg p-4 flex flex-col gap-3 bg-indigo-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-indigo-900">{label}</span>
                  <Badge variant="outline" className="text-indigo-700 border-indigo-300 text-xs">
                    {price}
                  </Badge>
                </div>
                <p className="text-xs text-indigo-700 flex-1">{description}</p>
                {isGenerating ? (
                  <Button size="sm" disabled className="w-full">
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Generating…
                  </Button>
                ) : job?.status === 'completed' && job.signed_url ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 text-xs" asChild>
                      <a href={job.signed_url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3 w-3 mr-1" /> Download
                      </a>
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => startCheckout(type)}
                  >
                    <DollarSign className="h-3 w-3 mr-1" /> Purchase & Generate
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
