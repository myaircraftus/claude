'use client'

import { useState } from 'react'
import { ComputedStatusGrid } from './ComputedStatusGrid'
import { FindingCard } from './FindingCard'
import { ReportGeneratorPanel } from './ReportGeneratorPanel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ScanLine, XCircle, AlertTriangle, Info } from 'lucide-react'
import type { AircraftComputedStatus, RecordFinding, FindingsRun, ReportJob } from '@/types/intelligence'

interface IntelligenceTabProps {
  aircraftId: string
  initialStatus: AircraftComputedStatus | null
  initialFindings: RecordFinding[]
  initialRun: FindingsRun | null
  initialReports: ReportJob[]
}

export function IntelligenceTab({
  aircraftId,
  initialStatus,
  initialFindings,
  initialRun,
  initialReports,
}: IntelligenceTabProps) {
  const [status, setStatus] = useState(initialStatus)
  const [findings, setFindings] = useState(initialFindings)
  const [run, setRun] = useState(initialRun)
  const [detecting, setDetecting] = useState(false)

  const criticalCount = findings.filter(f => f.severity === 'critical').length
  const warningCount = findings.filter(f => f.severity === 'warning').length
  const infoCount = findings.filter(f => f.severity === 'info').length

  async function runDetection() {
    setDetecting(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/detect-findings`, { method: 'POST' })
      const { run_id } = await res.json()
      if (!run_id) return

      // Poll until complete
      const poll = setInterval(async () => {
        const r = await fetch(`/api/aircraft/${aircraftId}/detect-findings`)
        const data = await r.json()
        if (data.run?.status === 'completed' || data.run?.status === 'failed') {
          clearInterval(poll)
          setFindings(data.findings ?? [])
          setRun(data.run)
          setDetecting(false)
        }
      }, 2000)
    } catch {
      setDetecting(false)
    }
  }

  async function handleResolve(findingId: string, note: string) {
    await fetch(`/api/aircraft/${aircraftId}/detect-findings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finding_id: findingId, action: 'resolve', note }),
    })
    setFindings(prev => prev.filter(f => f.id !== findingId))
  }

  async function handleAcknowledge(findingId: string, note: string) {
    await fetch(`/api/aircraft/${aircraftId}/detect-findings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finding_id: findingId, action: 'acknowledge', note }),
    })
    setFindings(prev => prev.map(f => f.id === findingId ? { ...f, is_acknowledged: true } : f))
  }

  return (
    <div className="space-y-8">
      {/* Health score + status */}
      {status ? (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Aircraft Status</h2>
              <p className="text-sm text-gray-500">Computed from digitized maintenance records</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl"
                  style={{
                    background: status.health_score >= 80
                      ? '#16a34a'
                      : status.health_score >= 50
                      ? '#d97706'
                      : '#dc2626',
                  }}
                >
                  {status.health_score}
                </div>
                <p className="text-xs text-gray-400 mt-1">Health</p>
              </div>
            </div>
          </div>
          <ComputedStatusGrid
            status={status}
            aircraftId={aircraftId}
            onRecomputed={setStatus}
          />
        </section>
      ) : (
        <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400 text-sm">
          No status computed yet.{' '}
          <button
            className="text-blue-600 underline"
            onClick={async () => {
              const res = await fetch(`/api/aircraft/${aircraftId}/compute-status`, { method: 'POST' })
              const data = await res.json()
              if (data.status) setStatus(data.status)
            }}
          >
            Compute now
          </button>
        </div>
      )}

      {/* Findings */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Record Findings</h2>
            <p className="text-sm text-gray-500">
              {run ? `Last run: ${new Date(run.created_at).toLocaleString()}` : 'Not yet run'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {findings.length > 0 && (
              <div className="flex gap-1.5">
                {criticalCount > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1">
                    <XCircle className="h-3 w-3" /> {criticalCount} Critical
                  </Badge>
                )}
                {warningCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs gap-1">
                    <AlertTriangle className="h-3 w-3" /> {warningCount} Warning
                  </Badge>
                )}
                {infoCount > 0 && (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs gap-1">
                    <Info className="h-3 w-3" /> {infoCount} Info
                  </Badge>
                )}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={runDetection}
              disabled={detecting}
            >
              {detecting
                ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Analyzing…</>
                : <><ScanLine className="h-3 w-3 mr-1.5" /> Run Analysis</>
              }
            </Button>
          </div>
        </div>

        {findings.length === 0 && !detecting ? (
          <div className="border border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
            {run ? 'No open findings — records look good.' : 'Run the analysis to detect missing records and discrepancies.'}
          </div>
        ) : (
          <div>
            {/* Critical first */}
            {['critical', 'warning', 'info'].map(sev =>
              findings
                .filter(f => f.severity === sev)
                .map(f => (
                  <FindingCard
                    key={f.id}
                    finding={f}
                    onResolve={handleResolve}
                    onAcknowledge={handleAcknowledge}
                  />
                ))
            )}
          </div>
        )}
      </section>

      {/* Report generator */}
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">Reports</h2>
          <p className="text-sm text-gray-500">Generate PDF reports from the digitized record data</p>
        </div>
        <ReportGeneratorPanel aircraftId={aircraftId} existingReports={initialReports} />
      </section>
    </div>
  )
}
