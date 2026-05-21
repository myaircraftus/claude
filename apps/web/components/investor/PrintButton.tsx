'use client'

import { Printer } from 'lucide-react'

/**
 * Small client island for `window.print()`. Lives here so server pages
 * (business plan, data room, etc.) can stay server components and just
 * drop in a print button without "use client" leaking into the page.
 */
export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 transition-colors print:hidden"
    >
      <Printer className="w-3 h-3" />
      {label}
    </button>
  )
}
