'use client'

/**
 * TaxPnlReportClient (Spec 7.7) — year picker + Generate button + history.
 *
 * History today is the browser's session history (we list the years the
 * operator generated this session). Persisting generated PDFs to a
 * `generated_reports` table is the right long-term move — logged as
 * 7.7 follow-up.
 */

import { useState } from 'react'
import { Download, FileText, Loader2, AlertCircle, FileBarChart } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface Props {
  years: number[]
}

interface HistoryEntry {
  year: number
  generated_at: string
  filename: string
  size_bytes: number
}

export function TaxPnlReportClient({ years }: Props) {
  const [year, setYear] = useState<number>(years[0] ?? new Date().getUTCFullYear())
  const [generating, setGenerating] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/tax-pnl/${year}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') ?? ''
      const m = cd.match(/filename="([^"]+)"/)
      const filename = m?.[1] ?? `aircraft-pnl-${year}.pdf`

      // Trigger browser download.
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setHistory((h) => [
        { year, generated_at: new Date().toISOString(), filename, size_bytes: blob.size },
        ...h,
      ].slice(0, 25))
      toast.success(`Generated ${filename} (${(blob.size / 1024).toFixed(0)} KB)`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Generate failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          Tax-time P&amp;L
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Aircraft profit-and-loss statement for a calendar year, formatted to the IRS Schedule C aircraft expense categories. Pulls approved cost entries
          and recorded flight events; pick a year and we&apos;ll render it as a one-click PDF.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FileBarChart className="h-4 w-4 text-muted-foreground" />
            <label htmlFor="tax-year" className="text-[12px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
              Tax year
            </label>
          </div>
          <select
            id="tax-year"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="bg-white border border-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <Button onClick={() => void generate()} disabled={generating}>
            {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
            {generating ? 'Generating PDF…' : 'Generate PDF'}
          </Button>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <p className="text-[11.5px] text-muted-foreground mt-3">
          The PDF includes per-aircraft revenue, operating expenses grouped by Schedule C line, MACRS 5-year depreciation,
          net income, and net per flight hour. Footer disclaimer notes this is not tax advice — review with your CPA before filing.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
            Recently generated (this session)
          </div>
        </div>
        {history.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-[12px] text-muted-foreground">No reports generated yet.</p>
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/15 border-b border-border">
              <tr>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Year</th>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Filename</th>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Size</th>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Generated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 tabular-nums">{h.year}</td>
                  <td className="px-3 py-1.5 font-mono">{h.filename}</td>
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{(h.size_bytes / 1024).toFixed(0)} KB</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{new Date(h.generated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
