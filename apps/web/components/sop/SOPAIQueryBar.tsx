'use client'

/**
 * SOPAIQueryBar — natural-language Q&A scoped to the SOP knowledge base.
 *
 * Drops onto the SOP Library home. User types a question, the bar POSTs
 * to /api/sop/ask which calls GPT-4o with the full SOP corpus as context
 * and streams back a grounded answer with citations to specific SOPs.
 *
 * Why this exists separate from /api/ask (the Logbook AI):
 *   - /api/ask is scoped to a tenant's aircraft maintenance records.
 *   - /api/sop/ask is scoped to the *platform's own SOPs* — meta-knowledge
 *     about how myaircraft.us works, who can sign what, where to find what.
 *   - Different system prompt, different corpus, different audience.
 *
 * UI: white theme — matches the rest of the SOP reader surfaces.
 */
import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Loader2, X, ArrowUpRight } from 'lucide-react'

interface SopCitation {
  sopSlug: string
  sopTitle: string
  section?: string
}

interface SopAnswer {
  answer: string
  citations: SopCitation[]
}

export function SOPAIQueryBar() {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<SopAnswer | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = useCallback(async () => {
    const q = query.trim()
    if (!q || busy) return
    setBusy(true)
    setError(null)
    setAnswer(null)
    try {
      const res = await fetch('/api/sop/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Lookup failed (${res.status})`)
      }
      const data = (await res.json()) as SopAnswer
      setAnswer(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }, [query, busy])

  const reset = () => {
    setQuery('')
    setAnswer(null)
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <div className="mb-6 rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white p-4">
      <label
        htmlFor="sop-ai-query"
        className="block text-[11px] uppercase tracking-[0.15em] text-violet-700 font-semibold mb-2"
      >
        Ask anything about myaircraft.us procedures
      </label>
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-600 shrink-0" />
        <input
          ref={inputRef}
          id="sop-ai-query"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="e.g. Who can sign a logbook entry for an annual inspection?"
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
              Searching…
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
                Sources
              </div>
              <div className="flex flex-wrap gap-2">
                {answer.citations.map((c, i) => (
                  <Link
                    key={`${c.sopSlug}-${i}`}
                    href={`/sop-library/${c.sopSlug}${c.section ? `#${c.section}` : ''}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded px-2 py-1 transition-colors"
                  >
                    {c.sopTitle}
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

// Minimal inline markdown renderer — bold, italic, code, paragraphs, lists.
// We deliberately don't pull a full markdown lib here; the answer schema is
// constrained to short rich text from the LLM.
function renderMarkdown(src: string): string {
  let s = escapeHtml(src)
  // code blocks first (triple backtick)
  s = s.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${code}</code></pre>`)
  // inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  // bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // italic
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  // bullet lists (very simple — consecutive "- " lines)
  s = s.replace(/(^|\n)((?:- .+(?:\n|$))+)/g, (_m, lead, block) => {
    const items = block.trim().split(/\n/).map((line: string) => line.replace(/^- /, ''))
    return `${lead}<ul>${items.map((it: string) => `<li>${it}</li>`).join('')}</ul>`
  })
  // paragraphs (double-newline split)
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
