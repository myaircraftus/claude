'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Wrench,
  Calendar,
  Shield,
  Bell,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  Plus,
  RefreshCw,
  ChevronDown,
  Plane,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReminderType =
  | 'annual'
  | '100hr'
  | 'transponder'
  | 'elt'
  | 'static_pitot'
  | 'vor'
  | 'ad_compliance'
  | 'custom'

type Priority = 'critical' | 'high' | 'normal' | 'low'
type ReminderStatus = 'active' | 'completed' | 'snoozed' | 'dismissed'

interface AircraftRef {
  tail_number: string
  make: string
  model: string
}

interface Reminder {
  id: string
  organization_id: string
  aircraft_id?: string
  reminder_type: ReminderType
  title: string
  description?: string
  priority: Priority
  status: ReminderStatus
  due_date?: string
  due_hours?: number
  snoozed_until?: string
  auto_generated?: boolean
  completed_at?: string
  completed_by?: string
  aircraft?: AircraftRef
  created_at: string
  updated_at: string
}

interface AircraftOption {
  id: string
  tail_number: string
  make: string
  model: string
  total_time_hours?: number
}

interface Props {
  reminders: Reminder[]
  aircraft: AircraftOption[]
  orgId: string
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'critical' | 'high' | 'overdue' | 'due_soon' | 'annual' | '100hr' | 'ad' | 'custom'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'due_soon', label: 'Due Soon' },
  { id: 'annual', label: 'Annual' },
  { id: '100hr', label: '100hr' },
  { id: 'ad', label: 'ADs' },
  { id: 'custom', label: 'Custom' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  annual: 'Annual Inspection',
  '100hr': '100-Hour Inspection',
  transponder: 'Transponder Check',
  elt: 'ELT Inspection',
  static_pitot: 'Static/Pitot Check',
  vor: 'VOR Check',
  ad_compliance: 'AD Compliance',
  custom: 'Custom',
}

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null
  const due = new Date(dateStr)
  due.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function isOverdue(r: Reminder): boolean {
  const d = daysUntil(r.due_date)
  return d !== null && d < 0 && r.status !== 'completed'
}

function isDueSoon(r: Reminder): boolean {
  const d = daysUntil(r.due_date)
  return d !== null && d >= 0 && d <= 30 && r.status !== 'completed'
}

function reminderBorderColor(r: Reminder): string {
  if (r.status === 'completed') return 'border-l-emerald-400'
  if (isOverdue(r) || r.priority === 'critical') return 'border-l-red-500'
  if (isDueSoon(r) || r.priority === 'high') return 'border-l-amber-400'
  return 'border-l-brand-400'
}

function reminderIcon(type: ReminderType) {
  switch (type) {
    case '100hr': return <Wrench className="h-4 w-4" />
    case 'annual': return <Calendar className="h-4 w-4" />
    case 'ad_compliance': return <Shield className="h-4 w-4" />
    default: return <Bell className="h-4 w-4" />
  }
}

function DaysBadge({ reminder }: { reminder: Reminder }) {
  const days = daysUntil(reminder.due_date)
  if (days === null) return null

  if (days < 0) {
    return (
      <Badge variant="danger" className="text-xs flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        {Math.abs(days)}d overdue
      </Badge>
    )
  }
  if (days === 0) {
    return (
      <Badge variant="danger" className="text-xs flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        Due today
      </Badge>
    )
  }
  if (days <= 30) {
    return (
      <Badge variant="warning" className="text-xs flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {days}d remaining
      </Badge>
    )
  }
  return (
    <Badge variant="info" className="text-xs flex items-center gap-1">
      <Clock className="h-3 w-3" />
      {days}d remaining
    </Badge>
  )
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({ reminders }: { reminders: Reminder[] }) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const active = reminders.filter(r => r.status === 'active' || r.status === 'snoozed')
  const overdue = active.filter(isOverdue)
  const dueSoon = active.filter(isDueSoon)
  const completedThisMonth = reminders.filter(r => {
    if (r.status !== 'completed' || !r.completed_at) return false
    return new Date(r.completed_at) >= monthStart
  })

  const stats = [
    { label: 'Total Active', value: active.length, icon: <Bell className="h-4 w-4 text-brand-500" />, color: 'text-brand-600' },
    { label: 'Overdue', value: overdue.length, icon: <AlertCircle className="h-4 w-4 text-red-500" />, color: 'text-red-600' },
    { label: 'Due in 30 days', value: dueSoon.length, icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, color: 'text-amber-600' },
    { label: 'Completed this month', value: completedThisMonth.length, icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, color: 'text-emerald-600' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(s => (
        <Card key={s.label}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted">{s.icon}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Reminder card ────────────────────────────────────────────────────────────

function ReminderCard({
  reminder,
  onAction,
}: {
  reminder: Reminder
  onAction: (id: string, action: 'complete' | 'snooze' | 'dismiss') => void
}) {
  const borderColor = reminderBorderColor(reminder)
  const isComplete = reminder.status === 'completed'

  return (
    <Card className={`border-l-4 ${borderColor} transition-all hover:shadow-card-hover`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`mt-0.5 p-2 rounded-lg flex-shrink-0 ${isComplete ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600'}`}>
            {isComplete ? <CheckCircle2 className="h-4 w-4" /> : reminderIcon(reminder.reminder_type)}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`text-sm font-semibold ${isComplete ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {reminder.title}
                </h3>
                {reminder.auto_generated && (
                  <Badge variant="secondary" className="text-xs">Auto</Badge>
                )}
                {reminder.priority === 'critical' && !isComplete && (
                  <Badge variant="danger" className="text-xs">Critical</Badge>
                )}
                {reminder.priority === 'high' && !isComplete && (
                  <Badge variant="warning" className="text-xs">High</Badge>
                )}
              </div>
              {!isComplete && <DaysBadge reminder={reminder} />}
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {reminder.aircraft && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Plane className="h-3 w-3" />
                  <span className="font-mono font-medium">{reminder.aircraft.tail_number}</span>
                  <span>· {reminder.aircraft.make} {reminder.aircraft.model}</span>
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {REMINDER_TYPE_LABELS[reminder.reminder_type]}
              </span>
            </div>

            {reminder.description && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{reminder.description}</p>
            )}

            {/* Due info */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {reminder.due_date && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Due {formatDate(reminder.due_date)}
                </span>
              )}
              {reminder.due_hours != null && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Wrench className="h-3 w-3" />
                  Due at {reminder.due_hours.toLocaleString()} hrs
                </span>
              )}
              {isComplete && reminder.completed_at && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed {formatDate(reminder.completed_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!isComplete && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
              onClick={() => onAction(reminder.id, 'complete')}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Complete
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7"
              onClick={() => onAction(reminder.id, 'snooze')}
            >
              <Clock className="h-3 w-3 mr-1" />
              Snooze 7d
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 text-muted-foreground hover:text-destructive ml-auto"
              onClick={() => onAction(reminder.id, 'dismiss')}
            >
              <X className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Add Reminder Modal ───────────────────────────────────────────────────────

interface AddReminderFormData {
  aircraft_id: string
  reminder_type: ReminderType
  title: string
  description: string
  due_date: string
  due_hours: string
  priority: Priority
}

const DEFAULT_FORM: AddReminderFormData = {
  aircraft_id: '',
  reminder_type: 'custom',
  title: '',
  description: '',
  due_date: '',
  due_hours: '',
  priority: 'normal',
}

function AddReminderModal({
  open,
  onClose,
  aircraft,
  orgId,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  aircraft: AircraftOption[]
  orgId: string
  onCreated: (r: Reminder) => void
}) {
  const [form, setForm] = useState<AddReminderFormData>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(field: keyof AddReminderFormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // Auto-fill title when type changes
  function handleTypeChange(type: ReminderType) {
    setForm(prev => ({
      ...prev,
      reminder_type: type,
      title: prev.title || REMINDER_TYPE_LABELS[type],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.aircraft_id || !form.title) {
      setError('Aircraft and title are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: form.aircraft_id,
          reminder_type: form.reminder_type,
          title: form.title,
          description: form.description || undefined,
          due_date: form.due_date || undefined,
          due_hours: form.due_hours ? parseFloat(form.due_hours) : undefined,
          priority: form.priority,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create reminder')
      onCreated(json.reminder)
      setForm(DEFAULT_FORM)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Reminder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Aircraft */}
          <div className="space-y-1.5">
            <Label>Aircraft *</Label>
            <Select value={form.aircraft_id} onValueChange={v => update('aircraft_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select aircraft…" />
              </SelectTrigger>
              <SelectContent>
                {aircraft.map(ac => (
                  <SelectItem key={ac.id} value={ac.id}>
                    <span className="font-mono font-semibold">{ac.tail_number}</span>
                    <span className="text-muted-foreground ml-1.5 text-xs">{ac.make} {ac.model}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.reminder_type} onValueChange={v => handleTypeChange(v as ReminderType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(REMINDER_TYPE_LABELS) as [ReminderType, string][]).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={e => update('title', e.target.value)}
              placeholder="e.g. Annual inspection due"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Optional notes…"
              rows={2}
            />
          </div>

          {/* Due date + hours */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={e => update('due_date', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due Hours (TT)</Label>
              <Input
                type="number"
                value={form.due_hours}
                onChange={e => update('due_hours', e.target.value)}
                placeholder="e.g. 2350"
                step="0.1"
                min="0"
              />
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={v => update('priority', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add Reminder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  hasAircraft,
  onGenerate,
  generating,
  onAdd,
}: {
  hasAircraft: boolean
  onGenerate: () => void
  generating: boolean
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
        <Bell className="h-8 w-8 text-brand-300" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">No reminders yet</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        {hasAircraft
          ? 'Add aircraft and reminders will auto-generate based on standard inspection intervals, or create one manually.'
          : 'Add your first aircraft to get started with maintenance reminders.'}
      </p>
      <div className="flex items-center gap-3 flex-wrap justify-center">
        {hasAircraft && (
          <Button variant="outline" onClick={onGenerate} disabled={generating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating…' : 'Generate Reminders'}
          </Button>
        )}
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Reminder
        </Button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RemindersClient({ reminders: initialReminders, aircraft, orgId }: Props) {
  const router = useRouter()
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [aircraftFilter, setAircraftFilter] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Filter logic
  const filtered = useMemo(() => {
    let list = reminders

    // Aircraft filter
    if (aircraftFilter !== 'all') {
      list = list.filter(r => r.aircraft_id === aircraftFilter)
    }

    // Tab filter
    switch (activeTab) {
      case 'critical':
        list = list.filter(r => r.priority === 'critical')
        break
      case 'high':
        list = list.filter(r => r.priority === 'high' || r.priority === 'critical')
        break
      case 'overdue':
        list = list.filter(isOverdue)
        break
      case 'due_soon':
        list = list.filter(isDueSoon)
        break
      case 'annual':
        list = list.filter(r => r.reminder_type === 'annual')
        break
      case '100hr':
        list = list.filter(r => r.reminder_type === '100hr')
        break
      case 'ad':
        list = list.filter(r => r.reminder_type === 'ad_compliance')
        break
      case 'custom':
        list = list.filter(r => r.reminder_type === 'custom')
        break
    }

    return list
  }, [reminders, activeTab, aircraftFilter])

  // Count badges for tabs
  const tabCounts = useMemo<Partial<Record<FilterTab, number>>>(() => ({
    all: reminders.filter(r => r.status !== 'completed').length,
    critical: reminders.filter(r => r.priority === 'critical' && r.status !== 'completed').length,
    high: reminders.filter(r => (r.priority === 'high' || r.priority === 'critical') && r.status !== 'completed').length,
    overdue: reminders.filter(isOverdue).length,
    due_soon: reminders.filter(isDueSoon).length,
  }), [reminders])

  async function handleAction(id: string, action: 'complete' | 'snooze' | 'dismiss') {
    const body: Record<string, unknown> = { id }

    if (action === 'complete') {
      body.status = 'completed'
    } else if (action === 'snooze') {
      body.status = 'snoozed'
      const snoozeUntil = new Date()
      snoozeUntil.setDate(snoozeUntil.getDate() + 7)
      body.snoozed_until = snoozeUntil.toISOString()
    } else {
      body.status = 'dismissed'
    }

    try {
      const res = await fetch('/api/reminders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      if (action === 'dismiss') {
        setReminders(prev => prev.filter(r => r.id !== id))
      } else {
        setReminders(prev => prev.map(r => r.id === id ? { ...r, ...json.reminder } : r))
      }
    } catch (err) {
      console.error('Failed to update reminder:', err)
    }
  }

  async function handleGenerate() {
    if (aircraft.length === 0) return
    setGenerating(true)
    setGenerateError(null)
    try {
      // Generate for all aircraft
      const results = await Promise.all(
        aircraft.map(ac =>
          fetch('/api/reminders/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aircraft_id: ac.id }),
          }).then(r => r.json())
        )
      )
      const created: Reminder[] = results.flatMap(r => r.reminders ?? [])
      if (created.length > 0) {
        setReminders(prev => {
          const existingIds = new Set(prev.map(r => r.id))
          return [...prev, ...created.filter(r => !existingIds.has(r.id))]
        })
      }
    } catch (err: any) {
      setGenerateError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  function handleCreated(r: Reminder) {
    setReminders(prev => [r, ...prev])
  }

  const activeRemindersCount = reminders.filter(r => r.status !== 'completed' && r.status !== 'dismissed').length

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Reminders & Due Items</h1>
              {activeRemindersCount > 0 && (
                <Badge variant="danger" className="text-sm px-2 py-0.5">{activeRemindersCount}</Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              Track inspections, ADs, and maintenance deadlines
            </p>
          </div>
          <div className="flex items-center gap-2">
            {aircraft.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${generating ? 'animate-spin' : ''}`} />
                {generating ? 'Generating…' : 'Auto-Generate'}
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Reminder
            </Button>
          </div>
        </div>

        {generateError && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
            {generateError}
          </div>
        )}

        {/* Stats */}
        <StatsRow reminders={reminders} />

        {/* Filters row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Tab filters */}
          <div className="flex items-center gap-1 flex-wrap">
            {FILTER_TABS.map(tab => {
              const count = tabCounts[tab.id]
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                    ${activeTab === tab.id
                      ? 'bg-brand-500 text-white'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                    }
                  `}
                >
                  {tab.label}
                  {count != null && count > 0 && (
                    <span className={`
                      rounded-full text-[10px] font-bold px-1.5 py-0
                      ${activeTab === tab.id ? 'bg-white/25 text-white' : 'bg-background text-foreground'}
                    `}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Aircraft dropdown */}
          {aircraft.length > 1 && (
            <div className="ml-auto">
              <Select value={aircraftFilter} onValueChange={setAircraftFilter}>
                <SelectTrigger className="h-8 text-xs w-44">
                  <SelectValue placeholder="All aircraft" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All aircraft</SelectItem>
                  {aircraft.map(ac => (
                    <SelectItem key={ac.id} value={ac.id}>
                      <span className="font-mono font-semibold">{ac.tail_number}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Reminders list */}
        {filtered.length === 0 ? (
          reminders.length === 0 ? (
            <EmptyState
              hasAircraft={aircraft.length > 0}
              onGenerate={handleGenerate}
              generating={generating}
              onAdd={() => setShowAddModal(true)}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">No reminders match this filter.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setActiveTab('all')}>
                Clear filter
              </Button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {filtered.map(r => (
              <ReminderCard key={r.id} reminder={r} onAction={handleAction} />
            ))}
          </div>
        )}
      </div>

      <AddReminderModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        aircraft={aircraft}
        orgId={orgId}
        onCreated={handleCreated}
      />
    </main>
  )
}
