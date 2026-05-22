'use client'

/**
 * OwnerAIQueryBar — natural-language Q&A for owner portal users.
 *
 * Drops onto /owner/dashboard or any owner page. Owner types a question;
 * the bar POSTs to /api/owner/ask which retrieves owner-visible records
 * scoped to the user's aircraft and returns a constrained answer with
 * citations into the owner-side records.
 *
 * Companion to SOPAIQueryBar (which queries the platform SOPs) and the
 * shop-side /api/ask (which queries maintenance history). Three different
 * audiences, three different corpora, three different bars.
 *
 * Per SOP-12 §10. The retrieval-layer scoping happens server-side; this
 * component just renders the question + answer + clickable citations.
 */
import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Loader2, X, ArrowUpRight, ShieldCheck } from 'lucide-react'

interface Citation {
  kind: 'aircraft' | 'logbook_entry' | 'estimate' | 'invoice' | 'work_order'
  id: string
  label: string
  href: string
}
interface OwnerAnswer {
  answer: string
  citations: Citation[]
}

interface Props {
  /**
   * Optional aircraft narrowing. If the bar is rendered on an aircraft
   * detail page, pass the aircraft id so the AI only considers that
   * aircraft's records.
   */
  aircraftId?: string
  /** Compact mode hides the descriptive label; useful on inline placements. */
  compact?: boolean
}

export function OwnerAIQueryBar({ aircraftId, compact = false }: Props) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<OwnerAnswer | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = useCallback(async () => {
    const q = query.trim()
    if (!q || busy) return
    setBusy(true)
    setError(null)
    setAnswer(null)
    try {
      const res = await fetch('/api/owner/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, aircraft_id: aircraftId ?? null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Lookup failed (${res.status})`)
      }
      const data = (await res.json()) as OwnerAnswer
      setAnswer(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }, [query, busy, aircraftId])

  const reset = () => {
    setQuery('')
    setAnswer(null)
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <div className={`rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white ${compact ? 'p-3' : 'p-4'}`}>
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="owner-ai-query"
            className="block text-[11px] uppercase tracking-[0.15em] text-violet-700 font-semibold"
          >
            Ask about your aircraft
          </label>
          <span
            className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 font-medium"
            title="Only your shared records are searched"
          >
            <ShieldCheck className="w-3 h-3" /> Your records only
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-600 shrink-0" />
        <input
          ref={inputRef}
          id="owner-ai-query"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={
            aircraftId
              ? "e.g. When was the last oil change on this aircraft?"
              : "e.g. When is my next annual due? Or — how much have I paid this year?"
          }
          disabled={busy}
          className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none disabled:opacity-60"
        />
        {(answer || error) && !busy && (
          <button
            type="button"
            onClick={reset}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1"
            aria-label="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!query.trim() || busy}
          className="text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-md px-3 py-1.5 transition-colors"
        >
          {busy ? (
            <>
              <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
              Looking…
            </>
          ) : (
            'Ask'
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {answer && (
        <div className="mt-4 rounded-md bg-white border border-slate-200 p-4">
          <div
            className="prose prose-slate prose-sm max-w-none prose-p:my-2 prose-strong:text-slate-900 prose-code:text-orange-700 prose-code:bg-orange-50 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(answer.answer) }}
          />
          {answer.citations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200">
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">
                Linked records
              </div>
              <div className="flex flex-wrap gap-2">
                {answer.citations.map((c) => (
                  <Link
                    key={`${c.kind}-${c.id}`}
                    href={c.href}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded px-2 py-1 transition-colors"
                  >
                    {c.label}
                    <ArrowUpRight className="w-2.5 h-2.5 opacity-70" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Minimal markdown — same shape as SOPAIQueryBar to keep visual parity.
function renderMarkdown(src: string): string {
  let s = escapeHtml(src)
  s = s.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${code}</code></pre>`)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/(^|\n)((?:- .+(?:\n|$))+)/g, (_m, lead, block) => {
    const items = block.trim().split(/\n/).map((line: string) => line.replace(/^- /, ''))
    return `${lead}<ul>${items.map((it: string) => `<li>${it}</li>`).join('')}</ul>`
  })
  s = s
    .split(/\n{2,}/)
    .map((para) => {
      if (/^<(ul|pre|p|h\d|blockquote)/.test(para.trim())) return para
      return `<p>${para.replace(/\n/g, '<br/>')}</p>`
    })
    .join('\n')
  return s
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
