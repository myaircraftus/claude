'use client'

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Mic,
  MicOff,
  Camera,
  AlertTriangle,
  AlertCircle,
  Clock,
  CheckCircle,
  Wrench,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  Trash2,
  FileText,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Squawk {
  id: string
  aircraft_id: string
  title: string
  description: string | null
  severity: 'minor' | 'normal' | 'urgent' | 'grounding'
  status: 'open' | 'acknowledged' | 'in_work_order' | 'resolved' | 'deferred'
  source: string
  source_metadata: Record<string, unknown>
  assigned_work_order_id: string | null
  reported_at: string
  resolved_at: string | null
  created_at: string
  updated_at: string
  reporter?: { id: string; full_name?: string; email: string; avatar_url?: string } | null
}

interface Mechanic {
  id: string
  full_name: string
  email: string
}

interface SquawksViewProps {
  aircraftId: string
  aircraftTail: string
  initialSquawks: Squawk[]
  mechanics: Mechanic[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  minor: { label: 'Minor', variant: 'secondary' as const, className: 'bg-gray-100 text-gray-700' },
  normal: { label: 'Normal', variant: 'info' as const, className: 'bg-blue-100 text-blue-800' },
  urgent: { label: 'Urgent', variant: 'warning' as const, className: 'bg-amber-100 text-amber-800' },
  grounding: { label: 'Grounding', variant: 'danger' as const, className: 'bg-red-100 text-red-800' },
} as const

const STATUS_CONFIG = {
  open: { label: 'Open', variant: 'warning' as const, icon: AlertCircle },
  acknowledged: { label: 'Acknowledged', variant: 'info' as const, icon: Clock },
  in_work_order: { label: 'In Work Order', variant: 'default' as const, icon: Wrench },
  resolved: { label: 'Resolved', variant: 'success' as const, icon: CheckCircle },
  deferred: { label: 'Deferred', variant: 'secondary' as const, icon: Clock },
} as const

type StatusFilter = 'all' | 'open' | 'in_work_order' | 'resolved' | 'deferred'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_work_order', label: 'In Work Order' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'deferred', label: 'Deferred' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export function SquawksView({ aircraftId, aircraftTail, initialSquawks, mechanics }: SquawksViewProps) {
  const router = useTenantRouter()
  const [squawks, setSquawks] = useState<Squawk[]>(initialSquawks)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Add squawk dialog
  const [addOpen, setAddOpen] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addDesc, setAddDesc] = useState('')
  const [addSeverity, setAddSeverity] = useState<Squawk['severity']>('normal')
  const [addSource, setAddSource] = useState<'manual' | 'voice' | 'photo'>('manual')
  const [addSaving, setAddSaving] = useState(false)

  // Voice recording
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Photo extraction
  const [isExtracting, setIsExtracting] = useState(false)
  const [photoSquawks, setPhotoSquawks] = useState<{ title: string; description: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Maintenance request dialog
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestMechanic, setRequestMechanic] = useState('')
  const [requestMessage, setRequestMessage] = useState('')
  const [requestSquawkIds, setRequestSquawkIds] = useState<string[]>([])
  const [requestSaving, setRequestSaving] = useState(false)

  // Create estimate from squawks
  const [estimateOpen, setEstimateOpen] = useState(false)
  const [estimateSquawkIds, setEstimateSquawkIds] = useState<string[]>([])
  const [estimateSaving, setEstimateSaving] = useState(false)

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editSeverity, setEditSeverity] = useState<Squawk['severity']>('normal')
  const [editStatus, setEditStatus] = useState<Squawk['status']>('open')
  const [editSaving, setEditSaving] = useState(false)

  // ── Filtered squawks ─────────────────────────────────────────────────────

  const filtered = statusFilter === 'all'
    ? squawks
    : squawks.filter(s => s.status === statusFilter)

  // ── Create squawk ────────────────────────────────────────────────────────

  const createSquawk = async (title: string, description: string, severity: Squawk['severity'], source: string) => {
    setAddSaving(true)
    try {
      const res = await fetch('/api/squawks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          title,
          description: description || null,
          severity,
          source,
        }),
      })
      if (!res.ok) throw new Error('Failed to create squawk')
      const data = await res.json()
      setSquawks(prev => [data, ...prev])
      resetAddForm()
      setAddOpen(false)
    } catch (err) {
      console.error(err)
    } finally {
      setAddSaving(false)
    }
  }

  const resetAddForm = () => {
    setAddTitle('')
    setAddDesc('')
    setAddSeverity('normal')
    setAddSource('manual')
    setPhotoSquawks([])
  }

  // ── Voice recording ──────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Voice recording is not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setIsTranscribing(true)
        try {
          const formData = new FormData()
          formData.append('audio', audioBlob, 'recording.webm')
          const res = await fetch('/api/squawks/transcribe', {
            method: 'POST',
            body: formData,
          })
          if (!res.ok) {
            let errBody: { error?: string; code?: string } = {}
            try { errBody = await res.json() } catch {}
            if (errBody.code === 'SERVICE_NOT_CONFIGURED' || res.status === 503) {
              toast.error('Dictation is not configured', {
                description:
                  'The speech-to-text service is unavailable on this server (missing OPENAI_API_KEY). Ask an admin to configure it, or type the squawk manually.',
              })
            } else if (res.status === 401) {
              toast.error('Please sign in again to use dictation.')
            } else {
              toast.error('Failed to transcribe audio', {
                description: errBody.error ?? `Server returned HTTP ${res.status}.`,
              })
            }
            return
          }
          const { text } = await res.json()
          // Use the first sentence as title, rest as description
          const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim())
          setAddTitle(sentences[0]?.trim() ?? text)
          setAddDesc(sentences.length > 1 ? sentences.slice(1).join('. ').trim() : '')
          setAddSource('voice')
        } catch (err) {
          console.error(err)
          toast.error('Failed to transcribe audio', {
            description: err instanceof Error ? err.message : 'Network error. Please try again.',
          })
        } finally {
          setIsTranscribing(false)
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access denied:', err)
      toast.error('Microphone access denied', {
        description: 'Please allow microphone access in your browser and try again.',
      })
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  // ── Photo extraction ─────────────────────────────────────────────────────

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsExtracting(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/squawks/from-photo', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        let errBody: { error?: string; code?: string } = {}
        try { errBody = await res.json() } catch {}
        if (errBody.code === 'SERVICE_NOT_CONFIGURED' || res.status === 503) {
          toast.error('Photo extraction is not configured', {
            description:
              'The AI vision service is unavailable on this server (missing OPENAI_API_KEY). Ask an admin to configure it, or describe the squawk manually.',
          })
        } else if (res.status === 401) {
          toast.error('Please sign in again to use photo extraction.')
        } else {
          toast.error('Failed to extract squawks from image', {
            description: errBody.error ?? `Server returned HTTP ${res.status}.`,
          })
        }
        return
      }
      const { squawks: extracted, fallback, error: bodyError } = await res.json()
      setPhotoSquawks(extracted)
      setAddSource('photo')
      // Auto-fill with first extracted squawk
      if (extracted.length > 0) {
        setAddTitle(extracted[0].title)
        setAddDesc(extracted[0].description)
      }
      if (fallback) {
        toast.warning('AI extraction unavailable', {
          description: bodyError
            ? `${bodyError} — a placeholder squawk was added for manual review.`
            : 'A placeholder squawk was added. Review the photo and fill in details manually.',
        })
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to extract squawks from image', {
        description: err instanceof Error ? err.message : 'Network error. Please try again.',
      })
    } finally {
      setIsExtracting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Update squawk ────────────────────────────────────────────────────────

  const startEdit = (s: Squawk) => {
    setEditingId(s.id)
    setEditTitle(s.title)
    setEditDesc(s.description ?? '')
    setEditSeverity(s.severity)
    setEditStatus(s.status)
  }

  const saveEdit = async () => {
    if (!editingId) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/squawks/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          description: editDesc || null,
          severity: editSeverity,
          status: editStatus,
        }),
      })
      if (!res.ok) throw new Error('Failed to update')
      const data = await res.json()
      setSquawks(prev => prev.map(s => s.id === editingId ? { ...s, ...data } : s))
      setEditingId(null)
    } catch (err) {
      console.error(err)
    } finally {
      setEditSaving(false)
    }
  }

  const deleteSquawk = async (id: string) => {
    if (!confirm('Delete this squawk?')) return
    try {
      const res = await fetch(`/api/squawks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setSquawks(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  // ── Maintenance request ──────────────────────────────────────────────────

  const openRequestDialog = () => {
    setRequestSquawkIds(
      squawks.filter(s => s.status === 'open').map(s => s.id)
    )
    setRequestOpen(true)
  }

  const submitMaintenanceRequest = async () => {
    if (!requestMechanic) return
    setRequestSaving(true)
    try {
      const res = await fetch('/api/maintenance/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          target_mechanic_user_id: requestMechanic,
          message: requestMessage || null,
          squawk_ids: requestSquawkIds,
        }),
      })
      if (!res.ok) throw new Error('Failed to create request')
      setRequestOpen(false)
      setRequestMechanic('')
      setRequestMessage('')
      setRequestSquawkIds([])
      router.refresh()
    } catch (err) {
      console.error(err)
    } finally {
      setRequestSaving(false)
    }
  }

  const toggleRequestSquawk = (id: string) => {
    setRequestSquawkIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // ── Create Estimate from squawks ─────────────────────────────────────────

  const openEstimateDialog = () => {
    setEstimateSquawkIds(
      squawks.filter(s => s.status === 'open' || s.status === 'acknowledged').map(s => s.id)
    )
    setEstimateOpen(true)
  }

  const toggleEstimateSquawk = (id: string) => {
    setEstimateSquawkIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const createEstimateFromSquawks = async () => {
    if (estimateSquawkIds.length === 0) return
    setEstimateSaving(true)
    try {
      // Build customer_notes from selected squawk titles
      const selected = squawks.filter(s => estimateSquawkIds.includes(s.id))
      const customerNotes = selected
        .map(s => `• [${s.severity.toUpperCase()}] ${s.title}${s.description ? ': ' + s.description : ''}`)
        .join('\n')

      const res = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          linked_squawk_ids: estimateSquawkIds,
          customer_notes: customerNotes,
          status: 'draft',
        }),
      })
      if (!res.ok) throw new Error('Failed to create estimate')
      const data = await res.json()
      setEstimateOpen(false)
      router.push(`/estimates/${data.id}`)
    } catch (err) {
      console.error(err)
      toast.error('Failed to create estimate')
    } finally {
      setEstimateSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const openCount = squawks.filter(s => s.status === 'open').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Squawks &mdash; {aircraftTail}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {squawks.length} total squawk{squawks.length !== 1 ? 's' : ''}{openCount > 0 && `, ${openCount} open`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openCount > 0 && (
            <Button variant="outline" size="sm" onClick={openEstimateDialog}>
              <FileText className="h-4 w-4 mr-1" />
              Create Estimate
            </Button>
          )}
          {mechanics.length > 0 && openCount > 0 && (
            <Button variant="outline" size="sm" onClick={openRequestDialog}>
              <Send className="h-4 w-4 mr-1" />
              Request Maintenance
            </Button>
          )}
          <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetAddForm() }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Squawk
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Squawk</DialogTitle>
                <DialogDescription>
                  Report a discrepancy or maintenance issue for {aircraftTail}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="sq-title">Title *</Label>
                  <Input
                    id="sq-title"
                    placeholder="Brief description of the issue"
                    value={addTitle}
                    onChange={e => setAddTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sq-desc">Description</Label>
                  <Textarea
                    id="sq-desc"
                    placeholder="Additional details..."
                    rows={3}
                    value={addDesc}
                    onChange={e => setAddDesc(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={addSeverity} onValueChange={(v) => setAddSeverity(v as Squawk['severity'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="grounding">Grounding</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Photo extracted squawks list */}
                {photoSquawks.length > 1 && (
                  <div className="space-y-2">
                    <Label>Extracted squawks (click to select)</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {photoSquawks.map((ps, i) => (
                        <button
                          key={i}
                          type="button"
                          className={cn(
                            'w-full text-left p-2 rounded-lg border text-sm transition-colors',
                            addTitle === ps.title
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted'
                          )}
                          onClick={() => { setAddTitle(ps.title); setAddDesc(ps.description) }}
                        >
                          <p className="font-medium">{ps.title}</p>
                          {ps.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{ps.description}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input mode buttons */}
                <Separator />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={isRecording ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing}
                  >
                    {isTranscribing ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Transcribing...</>
                    ) : isRecording ? (
                      <><MicOff className="h-4 w-4 mr-1" /> Stop Recording</>
                    ) : (
                      <><Mic className="h-4 w-4 mr-1" /> Voice</>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExtracting}
                  >
                    {isExtracting ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Extracting...</>
                    ) : (
                      <><Camera className="h-4 w-4 mr-1" /> Photo</>
                    )}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => { setAddOpen(false); resetAddForm() }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createSquawk(addTitle, addDesc, addSeverity, addSource)}
                  disabled={!addTitle.trim() || addSaving}
                >
                  {addSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Create Squawk
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/50 w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              statusFilter === tab.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Squawks list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">
              {statusFilter === 'all' ? 'No squawks yet' : `No ${statusFilter.replace('_', ' ')} squawks`}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {statusFilter === 'all'
                ? 'Report discrepancies and maintenance issues to keep your aircraft records up to date.'
                : 'No squawks match this filter.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(squawk => {
            const sev = SEVERITY_CONFIG[squawk.severity]
            const stat = STATUS_CONFIG[squawk.status]
            const StatIcon = stat.icon
            const isExpanded = expandedId === squawk.id
            const isEditing = editingId === squawk.id

            return (
              <Card key={squawk.id} className="transition-colors hover:border-primary/30">
                <CardContent className="p-4">
                  {/* Row header */}
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      if (isEditing) return
                      setExpandedId(isExpanded ? null : squawk.id)
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Badge className={cn('mt-0.5 flex-shrink-0', sev.className)}>
                          {sev.label}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground text-sm">{squawk.title}</p>
                          {squawk.description && !isExpanded && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {squawk.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span>{formatDate(squawk.reported_at)}</span>
                            {squawk.reporter?.full_name && (
                              <span>by {squawk.reporter.full_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={stat.variant}>
                          <StatIcon className="h-3 w-3 mr-1" />
                          {stat.label}
                        </Badge>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded / Edit section */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Title</Label>
                            <Input
                              value={editTitle}
                              onChange={e => setEditTitle(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Description</Label>
                            <Textarea
                              value={editDesc}
                              onChange={e => setEditDesc(e.target.value)}
                              rows={3}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Severity</Label>
                              <Select value={editSeverity} onValueChange={(v) => setEditSeverity(v as Squawk['severity'])}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="minor">Minor</SelectItem>
                                  <SelectItem value="normal">Normal</SelectItem>
                                  <SelectItem value="urgent">Urgent</SelectItem>
                                  <SelectItem value="grounding">Grounding</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Status</Label>
                              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as Squawk['status'])}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="open">Open</SelectItem>
                                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                                  <SelectItem value="in_work_order">In Work Order</SelectItem>
                                  <SelectItem value="resolved">Resolved</SelectItem>
                                  <SelectItem value="deferred">Deferred</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <Button size="sm" onClick={saveEdit} disabled={editSaving}>
                              {editSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {squawk.description && (
                            <p className="text-sm text-foreground whitespace-pre-wrap">{squawk.description}</p>
                          )}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>Source: <span className="text-foreground capitalize">{squawk.source}</span></span>
                            <span>Severity: <span className="text-foreground capitalize">{squawk.severity}</span></span>
                            <span>Reported: <span className="text-foreground">{formatDate(squawk.reported_at)}</span></span>
                            {squawk.resolved_at && (
                              <span>Resolved: <span className="text-foreground">{formatDate(squawk.resolved_at)}</span></span>
                            )}
                            {squawk.assigned_work_order_id && (
                              <span className="col-span-2">
                                Work Order: <span className="text-primary font-medium">{squawk.assigned_work_order_id.slice(0, 8)}...</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <Button size="sm" variant="outline" onClick={() => startEdit(squawk)}>
                              Edit
                            </Button>
                            {squawk.status === 'open' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => deleteSquawk(squawk.id)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Create Estimate Dialog ───────────────────────────────────────── */}
      <Dialog open={estimateOpen} onOpenChange={setEstimateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Estimate from Squawks</DialogTitle>
            <DialogDescription>
              Select the squawks to include as notes on the estimate. An AI summary will be available after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Squawks to include</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-2">
                {squawks
                  .filter(s => s.status === 'open' || s.status === 'acknowledged')
                  .map(s => (
                    <label
                      key={s.id}
                      className="flex items-start gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={estimateSquawkIds.includes(s.id)}
                        onCheckedChange={() => toggleEstimateSquawk(s.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Badge className={cn('text-[10px] px-1.5 py-0', SEVERITY_CONFIG[s.severity].className)}>
                            {SEVERITY_CONFIG[s.severity].label}
                          </Badge>
                          <span className="text-sm font-medium">{s.title}</span>
                        </div>
                        {s.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                {squawks.filter(s => s.status === 'open' || s.status === 'acknowledged').length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No open squawks available.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEstimateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={createEstimateFromSquawks}
              disabled={estimateSquawkIds.length === 0 || estimateSaving}
            >
              {estimateSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <FileText className="h-4 w-4 mr-1" />
              Create Estimate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Maintenance Request Dialog ────────────────────────────────────── */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Maintenance</DialogTitle>
            <DialogDescription>
              Send selected squawks to a mechanic for review and work order creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Mechanic *</Label>
              <Select value={requestMechanic} onValueChange={setRequestMechanic}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a mechanic..." />
                </SelectTrigger>
                <SelectContent>
                  {mechanics.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Optional notes for the mechanic..."
                rows={2}
                value={requestMessage}
                onChange={e => setRequestMessage(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Squawks to include</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-2">
                {squawks
                  .filter(s => s.status === 'open' || s.status === 'acknowledged')
                  .map(s => (
                  <label
                    key={s.id}
                    className="flex items-start gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={requestSquawkIds.includes(s.id)}
                      onCheckedChange={() => toggleRequestSquawk(s.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge className={cn('text-[10px] px-1.5 py-0', SEVERITY_CONFIG[s.severity].className)}>
                          {SEVERITY_CONFIG[s.severity].label}
                        </Badge>
                        <span className="text-sm font-medium">{s.title}</span>
                      </div>
                    </div>
                  </label>
                ))}
                {squawks.filter(s => s.status === 'open' || s.status === 'acknowledged').length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No open squawks available.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitMaintenanceRequest}
              disabled={!requestMechanic || requestSquawkIds.length === 0 || requestSaving}
            >
              {requestSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Send className="h-4 w-4 mr-1" />
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
