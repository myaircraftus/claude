'use client'

/**
 * AtaJascSelector — reusable ATA / JASC classification combobox.
 *
 * Searches the seeded taxonomy by code number OR description text, shows
 * "JASC 7110 — Reciprocating Engine" style rows, and returns the selected
 * code + descriptions as an AtaJascValue. An optional "AI Suggest" button
 * classifies `suggestText` via /api/aviation/suggest-ata-jasc.
 *
 * Wired into: Squawks, Work Orders, Estimates, Logbook Entries, Due List.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Sparkles, X, Loader2 } from 'lucide-react'
import {
  searchAtaJasc,
  suggestAtaJasc,
  ataJascFromResult,
  formatAtaJascLabel,
  hasAtaJasc,
  EMPTY_ATA_JASC,
  type AtaJascValue,
  type AtaJascResult,
  type AtaJascConfidence,
} from '@/lib/aviation/ata-jasc'

export interface AtaJascChangeMeta {
  source: 'manual' | 'ai'
  confidence?: AtaJascConfidence
}

export interface AtaJascSelectorProps {
  value: AtaJascValue
  onChange: (value: AtaJascValue, meta: AtaJascChangeMeta) => void
  /** Aircraft id — narrows JASC results to codes applicable to that aircraft. */
  aircraftId?: string | null
  /** Free text (squawk/WO/estimate description) the AI Suggest button classifies. */
  suggestText?: string
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Hide the AI Suggest button (search-only). */
  hideSuggest?: boolean
  /** Compact spacing for dense forms. */
  compact?: boolean
}

export function AtaJascSelector({
  value,
  onChange,
  aircraftId,
  suggestText,
  label = 'ATA / JASC Classification',
  placeholder = 'Search code or description…',
  disabled = false,
  className = '',
  hideSuggest = false,
  compact = false,
}: AtaJascSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AtaJascResult[]>([])
  const [loading, setLoading] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [note, setNote] = useState<{ tone: 'ai' | 'warn'; text: string } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const selected = hasAtaJasc(value)

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Debounced search whenever the dropdown is open.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      const rows = await searchAtaJasc(query, { aircraftId, limit: 25, signal: ac.signal })
      if (!cancelled && !ac.signal.aborted) {
        setResults(rows)
        setLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, open, aircraftId])

  const pick = useCallback(
    (r: AtaJascResult) => {
      onChange(ataJascFromResult(r), { source: 'manual' })
      setOpen(false)
      setQuery('')
      setNote(null)
    },
    [onChange],
  )

  const clear = useCallback(() => {
    onChange({ ...EMPTY_ATA_JASC }, { source: 'manual' })
    setNote(null)
  }, [onChange])

  const runSuggest = useCallback(async () => {
    const text = (suggestText ?? '').trim()
    if (!text) {
      setNote({ tone: 'warn', text: 'Add a description first, then try AI Suggest.' })
      return
    }
    setSuggesting(true)
    setNote(null)
    const suggestion = await suggestAtaJasc(text)
    setSuggesting(false)
    if (!suggestion) {
      setNote({ tone: 'warn', text: 'No AI suggestion — pick a code manually.' })
      return
    }
    onChange(
      {
        ata_code: suggestion.ata_code,
        ata_description: suggestion.ata_description,
        jasc_code: suggestion.jasc_code,
        jasc_description: suggestion.jasc_description,
      },
      { source: 'ai', confidence: suggestion.confidence },
    )
    setNote({
      tone: 'ai',
      text: `AI suggested (${suggestion.confidence} confidence)${
        suggestion.rationale ? ` — ${suggestion.rationale}` : ''
      }`,
    })
  }, [suggestText, onChange])

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-[10.5px] uppercase tracking-wide text-muted-foreground mb-1" style={{ fontWeight: 600 }}>
          {label}
        </label>
      )}

      {selected ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2 rounded-md border border-input bg-muted/30 px-2.5 py-2">
            <span className="text-[12px] text-foreground truncate" style={{ fontWeight: 500 }}>
              {formatAtaJascLabel(value)}
            </span>
          </div>
          {!disabled && (
            <>
              <button
                type="button"
                onClick={() => { setOpen((v) => !v); setQuery('') }}
                className="shrink-0 text-[11px] text-primary hover:underline"
              >
                Change
              </button>
              <button
                type="button"
                onClick={clear}
                aria-label="Clear classification"
                className="shrink-0 p-1 rounded hover:bg-muted"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              disabled={disabled}
              placeholder={placeholder}
              onFocus={() => setOpen(true)}
              onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
              className={`w-full ${compact ? 'h-8' : 'h-9'} pl-8 pr-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50`}
            />
          </div>
          {!hideSuggest && !disabled && (
            <button
              type="button"
              onClick={runSuggest}
              disabled={suggesting}
              title="Let AI suggest the ATA/JASC code from the description"
              className={`shrink-0 inline-flex items-center gap-1.5 ${compact ? 'h-8' : 'h-9'} px-2.5 rounded-md border border-input bg-background text-[12px] text-foreground hover:bg-muted/40 disabled:opacity-60`}
              style={{ fontWeight: 500 }}
            >
              {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
              AI Suggest
            </button>
          )}
        </div>
      )}

      {note && (
        <p className={`mt-1 text-[11px] ${note.tone === 'ai' ? 'text-primary' : 'text-amber-600'}`}>
          {note.text}
        </p>
      )}

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching taxonomy…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-muted-foreground">
              {query ? 'No matching ATA/JASC codes.' : 'Type a code or description to search.'}
            </div>
          ) : (
            <ul className="py-1">
              {results.map((r) => (
                <li key={r.jasc_code}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
                  >
                    <div className="text-[12.5px] text-foreground" style={{ fontWeight: 600 }}>
                      JASC {r.jasc_code} — {r.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      ATA {r.ata_code}{r.ata_title ? ` — ${r.ata_title}` : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
