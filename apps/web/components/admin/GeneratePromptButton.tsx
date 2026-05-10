'use client'

/**
 * Phase 16 Sprint 16.11 — "Generate Claude Code Prompt" button.
 *
 * Click → POSTs source_type + source_id to /api/admin/ops-prompt,
 * shows the generated markdown in a modal with Copy + Mark Used +
 * Outcome buttons. Saves an audit row in ops_event_prompts.
 */
import { useState } from 'react'
import { Loader2, Copy, X, Sparkles, Check } from 'lucide-react'
import type { OpsSourceType } from '@/lib/ops/spine'

interface Props {
  sourceType: OpsSourceType
  sourceId: string
  /** Disable the button (e.g. for resolved tickets where it's not useful). */
  disabled?: boolean
}

interface GenerateResponse {
  prompt_id: string
  prompt_text: string
  context_files: Array<{ path: string; reason: string }>
}

export function GeneratePromptButton({ sourceType, sourceId, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<GenerateResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [outcome, setOutcome] = useState<'pending' | 'used' | 'fixed' | 'partial' | 'wont_fix' | 'duplicate'>('pending')

  async function generate() {
    setBusy(true); setError(null); setData(null); setCopied(false); setOutcome('pending')
    try {
      const res = await fetch('/api/admin/ops-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: sourceType, source_id: sourceId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Generation failed'); return }
      setData(json as GenerateResponse)
      setOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  async function copyToClipboard() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.prompt_text)
      setCopied(true)
      // Mark as "used" in the audit log on first copy.
      await fetch('/api/admin/ops-prompt', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_id: data.prompt_id, used_at: true }),
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Copy failed')
    }
  }

  async function recordOutcome(newOutcome: typeof outcome, note?: string) {
    if (!data) return
    try {
      await fetch('/api/admin/ops-prompt', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_id: data.prompt_id, outcome: newOutcome, outcome_note: note }),
      })
      setOutcome(newOutcome)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={generate}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Generate Claude Code Prompt
      </button>

      {error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</div>
      )}

      {open && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <p className="text-sm" style={{ fontWeight: 600 }}>Claude Code prompt</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-white p-4 text-[12px] font-mono leading-relaxed">{data.prompt_text}</pre>
              {data.context_files.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Auto-included {data.context_files.length} file{data.context_files.length === 1 ? '' : 's'}.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy to clipboard'}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Did this fix it?</span>
                {(['fixed', 'partial', 'wont_fix'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => recordOutcome(o)}
                    className={`rounded-md border px-2 py-1 ${
                      outcome === o
                        ? 'bg-violet-50 border-violet-300 text-violet-900'
                        : 'border-border bg-white hover:bg-muted/40'
                    }`}
                  >
                    {o.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
