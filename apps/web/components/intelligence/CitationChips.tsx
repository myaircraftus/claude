'use client'

/** Expandable source chips for AI-generated intelligence findings. */
import { useState } from 'react'
import { FileText, ChevronDown } from 'lucide-react'
import type { IntelligenceCitation } from '@/lib/intelligence/types'

export function CitationChips({
  citations,
  label = 'Sources',
}: {
  citations: IntelligenceCitation[]
  label?: string
}) {
  const [open, setOpen] = useState<number | null>(null)

  if (!citations || citations.length === 0) {
    return (
      <p className="mt-1.5 text-[11px] italic text-muted-foreground">
        Inferred — no direct document evidence.
      </p>
    )
  }

  return (
    <div className="mt-2 space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </div>
      {citations.map((c, i) => (
        <div key={i} className="rounded-md border border-border bg-muted/20 text-[11px] overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/40 transition-colors"
          >
            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-foreground truncate" style={{ fontWeight: 600 }}>{c.doc_name}</span>
            {c.page_number != null && (
              <span className="text-muted-foreground shrink-0">p.{c.page_number}</span>
            )}
            {c.entry_date && (
              <span className="text-muted-foreground shrink-0">· {c.entry_date}</span>
            )}
            {c.excerpt && (
              <ChevronDown
                className={`h-3 w-3 ml-auto shrink-0 text-muted-foreground/60 transition-transform ${
                  open === i ? 'rotate-180' : ''
                }`}
              />
            )}
          </button>
          {open === i && c.excerpt && (
            <div className="px-2.5 pb-2 pt-1 border-t border-border/60 text-muted-foreground leading-relaxed">
              &ldquo;{c.excerpt}&rdquo;
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
