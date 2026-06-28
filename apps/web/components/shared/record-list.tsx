'use client'

/**
 * RecordList — the shared, responsive list primitive for the app's record
 * surfaces (estimates, invoices, logbook entries, due list, …).
 *
 * Why this exists: every module hand-rolled a wide multi-column <table> with no
 * mobile handling, so on a phone they overflowed or crushed. RecordList renders
 * ONE column definition two ways — a clean table on desktop (md+) and stacked
 * cards on mobile (<md) — and folds in the loading / empty / error states each
 * module otherwise skipped. Modeled on the Work Orders v2 list (the production
 * benchmark); navigation is SPA (next/navigation), not full-page reloads.
 *
 * Column cells must return plain content (no <a>/<Link>) — RecordList owns
 * navigation: the desktop row is keyboard-activatable and the mobile card is a
 * real <Link>, so wrapping an anchor inside a cell would nest <a> tags.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { Inbox, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export interface RecordColumn<T> {
  key: string
  header: string
  cell: (item: T) => ReactNode
  align?: 'left' | 'right'
  /** Extra classes for the desktop <th>/<td>. */
  className?: string
  /** Omit this column from the mobile card (keep it desktop-only). */
  hideOnMobile?: boolean
  /** On mobile, render this column as the card title (top-left, emphasized). */
  primary?: boolean
  /** On mobile, render this column at the card's top-right (e.g. a status badge). */
  badge?: boolean
}

export interface RecordListProps<T> {
  items: T[]
  columns: RecordColumn<T>[]
  getRowHref: (item: T) => string
  getRowKey: (item: T) => string
  isLoading?: boolean
  error?: boolean
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: ReactNode
  emptyAction?: ReactNode
  skeletonRows?: number
  className?: string
}

export function RecordList<T>({
  items,
  columns,
  getRowHref,
  getRowKey,
  isLoading = false,
  error = false,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyIcon,
  emptyAction,
  skeletonRows = 6,
  className,
}: RecordListProps<T>) {
  const router = useRouter()

  if (isLoading) return <RecordListSkeleton columns={columns} rows={skeletonRows} className={className} />
  if (error) return <ListErrorState onRetry={onRetry} />
  if (items.length === 0) {
    return <ListEmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />
  }

  const mobileCols = columns.filter((c) => !c.hideOnMobile)
  const primary = mobileCols.find((c) => c.primary) ?? mobileCols[0]
  const badge = mobileCols.find((c) => c.badge)
  const detailCols = mobileCols.filter((c) => c !== primary && c !== badge)

  return (
    <div className={className}>
      {/* Desktop — table (overflow-x-auto is a safety net at tablet widths) */}
      <div className="hidden md:block bg-background border border-border rounded-xl overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => {
              const href = getRowHref(item)
              return (
                <tr
                  key={getRowKey(item)}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(href)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      router.push(href)
                    }
                  }}
                  className="hover:bg-muted/20 focus:bg-muted/30 focus:outline-none cursor-pointer transition-colors"
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn('px-4 py-3 align-middle', c.align === 'right' ? 'text-right' : 'text-left', c.className)}
                    >
                      {c.cell(item)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile — stacked cards (real <Link>, so they're tappable + accessible) */}
      <div className="md:hidden space-y-2.5">
        {items.map((item) => (
          <Link
            key={getRowKey(item)}
            href={getRowHref(item)}
            className="block rounded-xl border border-border bg-background p-3.5 transition-all hover:border-foreground/20 hover:shadow-sm active:bg-muted/30"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 text-[14px] font-semibold text-foreground truncate">
                {primary ? primary.cell(item) : null}
              </div>
              {badge ? <div className="shrink-0">{badge.cell(item)}</div> : null}
            </div>
            {detailCols.length > 0 && (
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                {detailCols.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{c.header}</dt>
                    <dd className="text-[12.5px] text-foreground truncate">{c.cell(item)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

export function ListEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3 text-muted-foreground">
        {icon ?? <Inbox className="h-7 w-7" />}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ListErrorState({
  onRetry,
  message = "We couldn't load this list. Please try again.",
}: {
  onRetry?: () => void
  message?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-3 text-red-500">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <p className="text-sm font-medium text-foreground">Something went wrong</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{message}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => (onRetry ? onRetry() : window.location.reload())}
      >
        Try again
      </Button>
    </div>
  )
}

export function RecordListSkeleton({
  columns,
  rows = 6,
  className,
}: {
  columns: { key: string; align?: 'left' | 'right' }[]
  rows?: number
  className?: string
}) {
  return (
    <div className={className}>
      {/* Desktop skeleton table */}
      <div className="hidden md:block bg-background border border-border rounded-xl overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-4 py-3 flex gap-4">
          {columns.map((c) => (
            <Skeleton key={c.key} className="h-3 w-20" />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 flex items-center gap-4">
              {columns.map((c) => (
                <Skeleton key={c.key} className={cn('h-4', c.align === 'right' ? 'ml-auto w-16' : 'w-24')} />
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* Mobile skeleton cards */}
      <div className="md:hidden space-y-2.5">
        {Array.from({ length: Math.min(rows, 5) }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-background p-3.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
