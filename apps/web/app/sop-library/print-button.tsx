'use client'

import { Printer } from 'lucide-react'

/**
 * Triggers a print of just the SOP article body. We add a print-only
 * stylesheet via a `<style jsx>`-free approach: the global stylesheet
 * already supports `@media print`, so we simply hide everything except
 * `#sop-article` via inline CSS the moment the button is clicked.
 *
 * Using window.print() with a media query keeps this dependency-free.
 */
export function SopPrintButton() {
  return (
    <button
      type="button"
      onClick={() => {
        // Toggle a body class so the @media print rules + body.printing
        // selector hide chrome and zoom in on the article. Falls back to
        // the browser's default if the rule isn't present.
        document.body.classList.add('sop-print-mode')
        const cleanup = () => {
          document.body.classList.remove('sop-print-mode')
          window.removeEventListener('afterprint', cleanup)
        }
        window.addEventListener('afterprint', cleanup)
        window.print()
      }}
      className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 transition-colors"
      title="Print / save as PDF"
    >
      <Printer className="w-3 h-3" />
      Print
    </button>
  )
}
