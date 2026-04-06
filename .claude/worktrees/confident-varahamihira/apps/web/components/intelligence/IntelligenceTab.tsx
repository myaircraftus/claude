'use client'

import { useState } from 'react'
import { Loader2, Search, XCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react'
import { ComputedStatusGrid } from './ComputedStatusGrid'
import { FindingCard } from './FindingCard'
import { ReportGeneratorPanel } from './ReportGeneratorPanel'
import type { AircraftComputedStatus, RecordFinding, FindingsRun, ReportJob } from '@/types/intelligence'

interface Props {
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
}: Props) {
  const [status, setStatus] = useState<AircraftComputedStatus | null>(initialStatus)
  const [findings, setFindings] = useState<RecordFinding[]>(initialFindings)
  const [run, setRun] = useState<FindingsRun | null>(initialRun)
  const [running, setRunning] = useState(false)
  const [activeSection, setActiveSection] = useState<'status' | 'findings' | 'reports'>('status')

  async function runDetection() {
    setRunning(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/detect-findings`, { method: 'POST' })
      const data = await res.json()
      if (!data.run_id) return

      // Poll for completion
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        const res = await fetch(`/api/aircraft/${aircraftId}/detect-findings`)
        const data = await res.json()
        if (data.run && data.run.status !== 'running') {
          clearInterval(poll)
          setFindings(data.findings ?? [])
          setRun(data.run)
          setRunning(false)
          setActiveSection('findings')
        }
        if (attempts > 30) {
          clearInterval(poll)
          setRunning(false)
        }
      }, 3000)
    } catch {
      setRunning(false)
    }
  }

  async function handleResolve(id: string, note: string) {
    await fetch(`/api/aircraft/${aircraftId}/detect-findings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'resolve', note }),
    })
    setFindings(prev => prev.filter(f => f.id !== id))
  }

  async function handleAcknowledge(id: string, note: string) {
    await fetch(`/api/aircraft/${aircraftId}/detect-findings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'acknowledge', note }),
    })
    setFindings(prev =>
      prev.map(f =>
        f.id === id
          ? { ...f, is_acknowledged: true, acknowledge_note: note }
          : f
      )
    )
  }

  const criticalCount = findings.filter(f => f.severity === 'critical').length
  const warningCount = findings.filter(f => f.severity === 'warning').length
  const infoCount = findings.filter(f => f.severity === 'info').length

  return (
    <div className="space-y-6">
      {/* Sub-nav */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
          {(['status', 'findings', 'reports'] as const).map(s => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                activeSection === s
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'findings' ? (
                <span className="flex items-center gap-1.5">
                  Findings
                  {findings.length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                      criticalCount > 0
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>
                      {findings.length}
                    </span>
                  )}
                </span>
              ) : s}
            </button>
          ))}
        </div>

        {/* Run detection button */}
        <button
          onClick={runDetection}
          disabled={running}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-foreground text-background hover:opacity-90 font-medium disabled:opacity-50 transition-opacity"
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Search className="h-3.5 w-3.5" />
              Run Detection
            </>
          )}
        </button>
      </div>

      {/* Status section */}
      {activeSection === 'status' && (
        <ComputedStatusGrid
          status={status}
          aircraftId={aircraftId}
          onRefresh={setStatus}
        />
      )}

      {/* Findings section */}
      {activeSection === 'findings' && (
        <div className="space-y-4">
          {run && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                Last run: {run.completed_at
                  ? new Date(run.completed_at).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
                  : '—'}
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-red-500" />
                {run.critical_count} critical
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                {run.warning_count} warnings
              </span>
              <span className="flex items-center gap-1">
                <Info className="h-3.5 w-3.5 text-blue-500" />
                {run.info_count} info
              </span>
            </div>
          )}

          {findings.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-50" />
              <p className="font-medium">No open findings</p>
              <p className="text-sm mt-1">
                {run ? 'All findings resolved or none detected.' : 'Run detection to analyze this aircraft\'s records.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
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
        </div>
      )}

      {/* Reports section */}
      {activeSection === 'reports' && (
        <ReportGeneratorPanel
          aircraftId={aircraftId}
          existingReports={initialReports}
        />
      )}
    </div>
  )
}
