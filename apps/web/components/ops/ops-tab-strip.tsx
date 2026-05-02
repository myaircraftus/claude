'use client'

/**
 * Operations tab strip — Work Orders / Estimates / Invoices / Logbook.
 *
 * Renders at the top of every Operations route so the user can flip
 * between the four primary lists with one click. The visual is a
 * full-width grid with the active tab highlighted.
 */

import Link from 'next/link'
import { ClipboardList, FileText, Receipt, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export type OpsTab = 'work-orders' | 'estimates' | 'invoices' | 'logbook'

const TABS: Array<{ id: OpsTab; label: string; href: string; icon: any }> = [
  { id: 'work-orders', label: 'Work Orders', href: '/work-orders',     icon: ClipboardList },
  { id: 'estimates',   label: 'Estimates',   href: '/estimates',       icon: FileText },
  { id: 'invoices',    label: 'Invoices',    href: '/invoices',        icon: Receipt },
  { id: 'logbook',     label: 'Logbook',     href: '/logbook-entries', icon: BookOpen },
]

export function OpsTabStrip({ active }: { active: OpsTab }) {
  return (
    <div className="grid grid-cols-4 border-b border-border bg-muted/20 shrink-0">
      {TABS.map((t) => {
        const Icon = t.icon
        const isActive = t.id === active
        return (
          <Link
            key={t.id}
            href={t.href}
            className={cn(
              'flex items-center justify-center gap-1.5 py-3 text-[12px] transition-colors border-b-2',
              isActive
                ? 'text-primary border-primary bg-white'
                : 'text-muted-foreground border-transparent hover:bg-white hover:text-foreground',
            )}
            style={{ fontWeight: isActive ? 600 : 500 }}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
