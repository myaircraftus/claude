'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CalendarClock,
  Sparkles,
  ChevronRight,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReminderPriority = 'critical' | 'high' | 'medium' | 'low'
type ReminderStatus = 'overdue' | 'due_soon' | 'upcoming' | 'completed' | 'dismissed'

interface Reminder {
  id: string
  aircraft_id: string
  organization_id: string
  title: string
  description?: string | null
  priority: ReminderPriority
  status: ReminderStatus
  due_date?: string | null
  due_hours?: number | null
  category?: string | null
  ad_number?: string | null
  source?: string | null
  created_at: string
  updated_at: string
}

interface RemindersResponse {
  reminders: Reminder[]
  total: number
}

interface Props {
  aircraftId: string
  organizationId: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priorityConfig(priority: ReminderPriority, status: ReminderStatus) {
  if (status === 'overdue') {
    return {
      badgeVariant: 'danger' as const,
      iconClass: 'text-red-500',
      rowClass: 'border-l-2 border-red-400',
      label: 'Overdue',
      icon: XCircle,
    }
  }
  if (status === 'due_soon') {
    return {
      badgeVariant: 'warning' as const,
      iconClass: 'text-amber-500',
      rowClass: 'border-l-2 border-amber-400',
      label: 'Due Soon',
      icon: AlertTriangle,
    }
  }
  if (status === 'completed') {
    return {
      badgeVariant: 'success' as const,
      iconClass: 'text-emerald-500',
      rowClass: '',
      label: 'Done',
      icon: CheckCircle2,
    }
  }

  // Priority-based for upcoming/active items
  switch (priority) {
    case 'critical':
      return {
        badgeVariant: 'danger' as const,
        iconClass: 'text-red-500',
        rowClass: 'border-l-2 border-red-400',
        label: 'Critical',
        icon: AlertTriangle,
      }
    case 'high':
      return {
        badgeVariant: 'warning' as const,
        iconClass: 'text-amber-500',
        rowClass: 'border-l-2 border-amber-400',
        label: 'High',
        icon: Clock,
      }
    case 'medium':
      return {
        badgeVariant: 'info' as const,
        iconClass: 'text-blue-500',
        rowClass: 'border-l-2 border-blue-300',
        label: 'Medium',
        icon: CalendarClock,
      }
    case 'low':
    default:
      return {
        badgeVariant: 'secondary' as const,
        iconClass: 'text-muted-foreground',
        rowClass: '',
        label: 'Low',
        icon: Bell,
      }
  }
}

function sortReminders(reminders: Reminder[]): Reminder[] {
  const statusOrder: Record<ReminderStatus, number> = {
    overdue: 0,
    due_soon: 1,
    upcoming: 2,
    dismissed: 4,
    completed: 3,
  }
  const priorityOrder: Record<ReminderPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }
  return [...reminders].sort((a, b) => {
    const statusDiff =
      (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
    if (statusDiff !== 0) return statusDiff
    return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4)
  })
}

// ─── Reminder row ─────────────────────────────────────────────────────────────

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const config = priorityConfig(reminder.priority, reminder.status)
  const StatusIcon = config.icon

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors pl-3',
        config.rowClass
      )}
    >
      <div className="mt-0.5 flex-shrink-0">
        <StatusIcon className={cn('h-4 w-4', config.iconClass)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground leading-snug">{reminder.title}</p>
          <Badge variant={config.badgeVariant} className="flex-shrink-0 text-xs">
            {config.label}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
          {reminder.category && (
            <span className="text-xs text-muted-foreground capitalize">
              {reminder.category.replace(/_/g, ' ')}
            </span>
          )}
          {reminder.due_date && (
            <span
              className={cn(
                'text-xs font-medium',
                reminder.status === 'overdue'
                  ? 'text-red-600'
                  : reminder.status === 'due_soon'
                  ? 'text-amber-600'
                  : 'text-muted-foreground'
              )}
            >
              Due {formatDate(reminder.due_date)}
            </span>
          )}
          {reminder.due_hours != null && (
            <span className="text-xs text-muted-foreground">
              at {reminder.due_hours.toLocaleString()} hrs
            </span>
          )}
          {reminder.ad_number && (
            <span className="text-xs font-mono text-amber-700">AD {reminder.ad_number}</span>
          )}
        </div>

        {reminder.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{reminder.description}</p>
        )}
      </div>
    </div>
  )
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function RemindersWidget({ aircraftId, organizationId }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReminders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/reminders?aircraft_id=${aircraftId}&limit=5&status=overdue,due_soon,upcoming`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // Gracefully handle 404 if reminders API doesn't exist yet
        if (res.status === 404) {
          setReminders([])
          setTotal(0)
          return
        }
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      const json: RemindersResponse = await res.json()
      setReminders(json.reminders ?? [])
      setTotal(json.total ?? json.reminders?.length ?? 0)
    } catch (err: any) {
      // Graceful degradation — don't surface errors for missing tables
      setReminders([])
      setTotal(0)
      if (!err.message?.includes('404') && !err.message?.includes('not found')) {
        setError(err.message ?? 'Failed to load reminders')
      }
    } finally {
      setLoading(false)
    }
  }, [aircraftId])

  useEffect(() => {
    fetchReminders()
  }, [fetchReminders])

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/reminders/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, organization_id: organizationId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      // Reload reminders after generation
      await fetchReminders()
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate reminders')
    } finally {
      setGenerating(false)
    }
  }

  const urgentCount = reminders.filter(
    r => r.status === 'overdue' || r.status === 'due_soon'
  ).length

  const displayedReminders = sortReminders(reminders).slice(0, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-blue-500" />
          Reminders &amp; Due Items
          {total > 0 && (
            <Badge
              variant={urgentCount > 0 ? 'danger' : 'secondary'}
              className="text-xs py-0 px-1.5 h-4"
            >
              {urgentCount > 0 ? urgentCount : total}
            </Badge>
          )}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={generating || loading}
          className="h-8"
        >
          <Sparkles className={cn('h-3.5 w-3.5', generating && 'animate-pulse')} />
          {generating ? 'Generating…' : 'Generate'}
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 p-3">
                <div className="h-4 w-4 rounded-full bg-muted flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-4/5" />
                  <div className="h-2.5 bg-muted rounded w-2/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && displayedReminders.length === 0 && (
          <div className="text-center py-8">
            <Bell className="h-9 w-9 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground mb-1">No reminders yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Generate reminders to track upcoming inspections, ADs, and maintenance due items.
            </p>
            <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
              <Sparkles className={cn('h-3.5 w-3.5 mr-1', generating && 'animate-pulse')} />
              {generating ? 'Generating…' : 'Generate Reminders'}
            </Button>
          </div>
        )}

        {/* Reminder list */}
        {!loading && displayedReminders.length > 0 && (
          <div className="space-y-1">
            {displayedReminders.map(reminder => (
              <ReminderRow key={reminder.id} reminder={reminder} />
            ))}
          </div>
        )}

        {/* Footer */}
        {!loading && total > 0 && (
          <div className="pt-1 border-t border-border flex items-center justify-between">
            <Link
              href={`/reminders?aircraft=${aircraftId}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all {total} reminder{total !== 1 ? 's' : ''}
              <ChevronRight className="h-3 w-3" />
            </Link>
            {urgentCount > 0 && (
              <span className="text-xs font-medium text-red-600">
                {urgentCount} need{urgentCount === 1 ? 's' : ''} attention
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
