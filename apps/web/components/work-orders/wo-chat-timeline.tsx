'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Camera, Mic, Paperclip, Send, Loader2, Package, Wrench,
  Play, Pause, Download, X, Image as ImageIcon,
  ClipboardCheck, ChevronDown, ChevronUp, CheckCircle2, Circle,
  Clock, Square, Timer,
} from 'lucide-react'

interface Attachment {
  path: string
  name: string
  size: number
  kind: 'image' | 'audio' | 'file'
  transcript?: string
}

interface Message {
  id: string
  thread_id: string
  role: string
  content: string
  intent?: string
  attachments?: Attachment[] | null
  created_at: string
  sender?: {
    id: string
    full_name?: string
    email: string
    avatar_url?: string
  } | null
}

interface Props {
  workOrderId: string
  className?: string
  /** Optional callbacks — kept for backwards-compatibility with the current
   *  "switch to Line Items tab" navigation. The composer now also has an
   *  inline quick-create menu (+ button) that POSTs lines directly. */
  onAddPart?: () => void
  onAddLabor?: () => void
}

interface ChecklistRow {
  id: string
  item_label: string
  item_description: string | null
  section: string | null
  source: string | null
  required: boolean
  completed: boolean
}

export function WoChatTimeline({ workOrderId, className, onAddPart, onAddLabor }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null)

  // Checklist quick-view state
  const [checklist, setChecklist] = useState<ChecklistRow[]>([])
  const [checklistExpanded, setChecklistExpanded] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Timer state — local stopwatch the mechanic flips on while working.
  // On stop, the elapsed time is rounded to 0.1h and POSTed as a labor line.
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null)
  const [timerNow, setTimerNow] = useState<number>(Date.now())
  const [timerSubmitting, setTimerSubmitting] = useState(false)

  // Inline quick-create state — lets the mechanic add a part or labor line
  // straight from the activity composer without leaving the chat.
  const [quickPartOpen, setQuickPartOpen] = useState(false)
  const [quickPart, setQuickPart] = useState({ pn: '', desc: '', qty: '1', price: '0' })
  const [quickLaborOpen, setQuickLaborOpen] = useState(false)
  const [quickLabor, setQuickLabor] = useState({ desc: '', hours: '0.5', rate: '125' })
  const [quickSubmitting, setQuickSubmitting] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/messages`)
      const data = await res.json()
      if (data.messages) setMessages(data.messages)
    } finally {
      setLoading(false)
    }
  }, [workOrderId])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 5000)
    return () => clearInterval(interval)
  }, [fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Checklist quick-view — fetch once on mount, refresh on toggles only
  const fetchChecklist = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/checklist`)
      const data = await res.json().catch(() => null)
      if (Array.isArray(data?.items)) setChecklist(data.items)
    } catch {
      /* swallow — quick-view is best-effort */
    }
  }, [workOrderId])

  useEffect(() => {
    fetchChecklist()
  }, [fetchChecklist])

  const checklistStats = useMemo(() => {
    const total = checklist.length
    const done = checklist.filter((c) => c.completed).length
    const requiredOpen = checklist.filter((c) => c.required && !c.completed).length
    return { total, done, requiredOpen }
  }, [checklist])

  async function toggleChecklistItem(item: ChecklistRow) {
    if (togglingId) return
    setTogglingId(item.id)
    // Optimistic flip
    setChecklist((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, completed: !c.completed } : c)),
    )
    try {
      const res = await fetch(
        `/api/work-orders/${workOrderId}/checklist/${item.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: !item.completed }),
        },
      )
      if (!res.ok) {
        // Roll back
        setChecklist((prev) =>
          prev.map((c) => (c.id === item.id ? { ...c, completed: item.completed } : c)),
        )
        toast.error('Could not update checklist item')
      }
    } catch {
      setChecklist((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, completed: item.completed } : c)),
      )
      toast.error('Could not update checklist item')
    } finally {
      setTogglingId(null)
    }
  }

  // Timer ticker — only runs when started so we don't burn re-renders.
  useEffect(() => {
    if (timerStartedAt == null) return
    const id = setInterval(() => setTimerNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [timerStartedAt])

  const elapsedSeconds = timerStartedAt ? Math.max(0, Math.floor((timerNow - timerStartedAt) / 1000)) : 0
  const elapsedLabel = useMemo(() => {
    const h = Math.floor(elapsedSeconds / 3600)
    const m = Math.floor((elapsedSeconds % 3600) / 60)
    const s = elapsedSeconds % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }, [elapsedSeconds])

  async function handleStartTimer() {
    setTimerStartedAt(Date.now())
    setTimerNow(Date.now())
    toast.success('Timer started')
  }

  // ─── Quick-create line + post system message in chat ──────────────
  async function postSystemMessage(content: string) {
    try {
      await fetch(`/api/work-orders/${workOrderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, intent: 'system_event' }),
      })
      fetchMessages()
    } catch {
      /* swallow — chat will pick it up on next poll */
    }
  }

  async function handleQuickAddPart(e: React.FormEvent) {
    e.preventDefault()
    if (quickSubmitting) return
    const qty = parseFloat(quickPart.qty) || 1
    const price = parseFloat(quickPart.price) || 0
    const pn = quickPart.pn.trim()
    const desc = quickPart.desc.trim() || pn
    if (!pn && !desc) {
      toast.error('Enter a part number or description')
      return
    }
    setQuickSubmitting(true)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_type: 'part',
          part_number: pn || null,
          description: desc,
          quantity: qty,
          unit_price: price,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Could not add part')
        return
      }
      const total = qty * price
      await postSystemMessage(`📦 Added part: ${pn ? pn + ' — ' : ''}${desc} (×${qty}${total > 0 ? ` · $${total.toFixed(2)}` : ''})`)
      setQuickPart({ pn: '', desc: '', qty: '1', price: '0' })
      setQuickPartOpen(false)
      toast.success('Part added to work order')
    } catch {
      toast.error('Could not add part')
    } finally {
      setQuickSubmitting(false)
    }
  }

  async function handleQuickAddLabor(e: React.FormEvent) {
    e.preventDefault()
    if (quickSubmitting) return
    const hours = parseFloat(quickLabor.hours) || 0
    const rate = parseFloat(quickLabor.rate) || 0
    const desc = quickLabor.desc.trim() || 'Labor'
    if (hours <= 0) {
      toast.error('Enter hours > 0')
      return
    }
    setQuickSubmitting(true)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_type: 'labor',
          description: desc,
          hours,
          rate,
          quantity: hours,
          unit_price: rate,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Could not log labor')
        return
      }
      const total = hours * rate
      await postSystemMessage(`⏱️ Logged labor: ${desc} (${hours}h${rate > 0 ? ` @ $${rate}/hr · $${total.toFixed(2)}` : ''})`)
      setQuickLabor({ desc: '', hours: '0.5', rate: '125' })
      setQuickLaborOpen(false)
      toast.success('Labor logged')
    } catch {
      toast.error('Could not log labor')
    } finally {
      setQuickSubmitting(false)
    }
  }

  async function handleStopTimer() {
    if (timerStartedAt == null) return
    const totalSeconds = Math.floor((Date.now() - timerStartedAt) / 1000)
    setTimerStartedAt(null)
    if (totalSeconds < 30) {
      toast('Timer stopped — under 30 seconds, no labor logged')
      return
    }
    // Round to 0.1 hr (6 minutes) — minimum billable increment
    const hours = Math.max(0.1, Math.round((totalSeconds / 3600) * 10) / 10)
    setTimerSubmitting(true)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_type: 'labor',
          description: `Hands-on time (timer)`,
          hours,
          quantity: hours,
          unit_price: 0,
        }),
      })
      if (!res.ok) {
        toast.error('Failed to log timer hours — recorded locally only')
        return
      }
      toast.success(`Logged ${hours} hr to this work order`)
    } catch {
      toast.error('Failed to log timer hours')
    } finally {
      setTimerSubmitting(false)
    }
  }

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [text])

  async function uploadFile(file: File): Promise<Attachment | null> {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/work-orders/${workOrderId}/messages/upload`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) return null
      return await res.json()
    } finally {
      setUploading(false)
    }
  }

  async function handleSend() {
    if ((!text.trim() && attachments.length === 0) || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.trim(),
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages(prev => [...prev, msg])
        setText('')
        setAttachments([])
      }
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const att = await uploadFile(file)
      if (att) setAttachments(prev => [...prev, att])
    }
    e.target.value = ''
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' })
        const att = await uploadFile(file)
        if (att) {
          // If transcript returned, auto-fill text
          if (att.transcript) {
            setText(prev => prev ? prev + ' ' + att.transcript : att.transcript!)
          }
          setAttachments(prev => [...prev, att])
        }
        setRecording(false)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      // Microphone not available
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  function getStorageUrl(path: string): string {
    return `${supabaseUrl}/storage/v1/object/public/work-order-chat/${path}`
  }

  function getInitials(sender: Message['sender']): string {
    if (!sender) return '?'
    if (sender.full_name) {
      return sender.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }
    return sender.email[0]?.toUpperCase() ?? '?'
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Checklist quick-view — always rendered when there are items so the
          mechanic can tick things off without leaving the activity tab. */}
      {checklist.length > 0 && (
        <div className="border-b border-border bg-white shrink-0">
          <button
            type="button"
            onClick={() => setChecklistExpanded((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                  Checklist
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {checklistStats.done} / {checklistStats.total} done
                </span>
                {checklistStats.requiredOpen > 0 && (
                  <span className="text-[10px] uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                    {checklistStats.requiredOpen} required open
                  </span>
                )}
              </div>
              <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${checklistStats.total === 0 ? 0 : (checklistStats.done / checklistStats.total) * 100}%` }}
                />
              </div>
            </div>
            {checklistExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>
          {checklistExpanded && (
            <div className="border-t border-border max-h-[260px] overflow-y-auto bg-muted/10">
              {checklist.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleChecklistItem(item)}
                  disabled={togglingId === item.id}
                  className="w-full flex items-start gap-2.5 px-4 py-2 text-left hover:bg-muted/30 transition-colors border-b border-border/50 disabled:opacity-50"
                >
                  {item.completed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn(
                        'text-[12px] text-foreground',
                        item.completed && 'line-through text-muted-foreground',
                      )}>
                        {item.item_label}
                      </span>
                      {item.required && !item.completed && (
                        <span className="text-[9px] uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.5 rounded" style={{ fontWeight: 700 }}>
                          Required
                        </span>
                      )}
                      {(item.source === 'ad' || item.source === 'ad_sb') && (
                        <span className="text-[9px] uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200 px-1 py-0.5 rounded" style={{ fontWeight: 700 }}>
                          AD/SB
                        </span>
                      )}
                    </div>
                    {item.section && (
                      <div className="text-[10px] text-muted-foreground/80 mt-0.5">{item.section}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-muted-foreground">No messages yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start a conversation about this work order.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-2.5 group">
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
              {getInitials(msg.sender)}
            </div>

            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {msg.sender?.full_name ?? msg.sender?.email ?? 'Unknown'}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDateTime(msg.created_at)}
                </span>
              </div>

              {/* Content */}
              {msg.content && (
                <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap break-words">
                  {msg.content}
                </p>
              )}

              {/* Attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.attachments.map((att, idx) => (
                    <AttachmentPreview
                      key={idx}
                      attachment={att}
                      getUrl={getStorageUrl}
                      onEnlargeImage={setEnlargedImage}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-border flex flex-wrap gap-2">
          {attachments.map((att, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs">
              {att.kind === 'image' && <ImageIcon className="h-3 w-3 text-muted-foreground" />}
              {att.kind === 'audio' && <Mic className="h-3 w-3 text-muted-foreground" />}
              {att.kind === 'file' && <Paperclip className="h-3 w-3 text-muted-foreground" />}
              <span className="truncate max-w-[120px]">{att.name}</span>
              <button onClick={() => removeAttachment(idx)} className="ml-1 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-border px-4 py-3 space-y-2">
        {/* Chip buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timer chip — flips between Start / Stop. While running shows
              the live elapsed time so the mechanic can see what'll be logged. */}
          {timerStartedAt == null ? (
            <button
              onClick={handleStartTimer}
              className="flex items-center gap-1 px-2 py-1 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Start labor timer"
            >
              <Timer className="h-3 w-3" />
              Start Timer
            </button>
          ) : (
            <button
              onClick={handleStopTimer}
              disabled={timerSubmitting}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-300 bg-emerald-50 text-xs text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
              title="Stop and log labor"
            >
              {timerSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3 fill-current" />}
              <span className="tabular-nums" style={{ fontWeight: 600 }}>{elapsedLabel}</span>
              <span className="text-[10px] text-emerald-600">· tap to stop</span>
            </button>
          )}
          <button
            onClick={() => { setQuickPartOpen((o) => !o); setQuickLaborOpen(false) }}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full border text-xs transition-colors',
              quickPartOpen
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <Package className="h-3 w-3" />
            Add Part
          </button>
          <button
            onClick={() => { setQuickLaborOpen((o) => !o); setQuickPartOpen(false) }}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full border text-xs transition-colors',
              quickLaborOpen
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <Wrench className="h-3 w-3" />
            Add Labor
          </button>
        </div>

        {/* Inline quick-create forms — fold open under the chips */}
        {quickPartOpen && (
          <form onSubmit={handleQuickAddPart} className="rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-foreground" style={{ fontWeight: 600 }}>Add part to work order</span>
              <button type="button" onClick={() => setQuickPartOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-[1fr_2fr_60px_70px] gap-1.5">
              <input
                value={quickPart.pn}
                onChange={(e) => setQuickPart((p) => ({ ...p, pn: e.target.value.toUpperCase() }))}
                placeholder="P/N"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-[11px] outline-none font-mono"
                autoFocus
              />
              <input
                value={quickPart.desc}
                onChange={(e) => setQuickPart((p) => ({ ...p, desc: e.target.value }))}
                placeholder="Description"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-[11px] outline-none"
              />
              <input
                type="number"
                step="0.5"
                min="0"
                value={quickPart.qty}
                onChange={(e) => setQuickPart((p) => ({ ...p, qty: e.target.value }))}
                placeholder="Qty"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-[11px] outline-none tabular-nums"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={quickPart.price}
                onChange={(e) => setQuickPart((p) => ({ ...p, price: e.target.value }))}
                placeholder="$"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-[11px] outline-none tabular-nums"
              />
            </div>
            <Button type="submit" size="sm" disabled={quickSubmitting} className="h-7 px-3 text-[11px] w-full">
              {quickSubmitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Package className="h-3 w-3 mr-1" />}
              Add to Line Items
            </Button>
          </form>
        )}

        {quickLaborOpen && (
          <form onSubmit={handleQuickAddLabor} className="rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-foreground" style={{ fontWeight: 600 }}>Log labor on work order</span>
              <button type="button" onClick={() => setQuickLaborOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-[1fr_70px_70px] gap-1.5">
              <input
                value={quickLabor.desc}
                onChange={(e) => setQuickLabor((p) => ({ ...p, desc: e.target.value }))}
                placeholder="Task / description"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-[11px] outline-none"
                autoFocus
              />
              <input
                type="number"
                step="0.1"
                min="0"
                value={quickLabor.hours}
                onChange={(e) => setQuickLabor((p) => ({ ...p, hours: e.target.value }))}
                placeholder="Hours"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-[11px] outline-none tabular-nums"
              />
              <input
                type="number"
                step="1"
                min="0"
                value={quickLabor.rate}
                onChange={(e) => setQuickLabor((p) => ({ ...p, rate: e.target.value }))}
                placeholder="$/hr"
                className="px-2 py-1.5 rounded-md border border-border bg-white text-[11px] outline-none tabular-nums"
              />
            </div>
            <Button type="submit" size="sm" disabled={quickSubmitting} className="h-7 px-3 text-[11px] w-full">
              {quickSubmitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wrench className="h-3 w-3 mr-1" />}
              Log Labor
            </Button>
          </form>
        )}

        <div className="flex items-end gap-2">
          {/* Attachment buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Attach image"
            >
              <Camera className="h-4 w-4" />
            </button>

            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={uploading}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                recording
                  ? 'text-red-500 bg-red-50 animate-pulse'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
              title={recording ? 'Stop recording' : 'Record audio'}
            >
              <Mic className="h-4 w-4" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
            multiple
          />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            multiple
          />

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-[120px]"
          />

          {/* Send */}
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sending || (text.trim() === '' && attachments.length === 0)}
            className="h-9 px-3"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        {uploading && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Uploading...
          </p>
        )}
      </div>

      {/* Enlarged image overlay */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setEnlargedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300"
            onClick={() => setEnlargedImage(null)}
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enlargedImage}
            alt="Enlarged"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  )
}

// ─── Attachment Preview ──────────────────────────────────────────────────────

function AttachmentPreview({
  attachment,
  getUrl,
  onEnlargeImage,
}: {
  attachment: Attachment
  getUrl: (path: string) => string
  onEnlargeImage: (url: string) => void
}) {
  const url = getUrl(attachment.path)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  function toggleAudio() {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }

  if (attachment.kind === 'image') {
    return (
      <button
        onClick={() => onEnlargeImage(url)}
        className="rounded-md overflow-hidden border border-border hover:border-ring transition-colors"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={attachment.name}
          className="h-20 w-20 object-cover"
        />
      </button>
    )
  }

  if (attachment.kind === 'audio') {
    return (
      <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2 text-xs">
        <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} />
        <button onClick={toggleAudio} className="text-foreground hover:text-brand-600">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <span className="truncate max-w-[140px] text-muted-foreground">{attachment.name}</span>
        {attachment.transcript && (
          <span className="text-muted-foreground italic truncate max-w-[200px]" title={attachment.transcript}>
            &ldquo;{attachment.transcript}&rdquo;
          </span>
        )}
      </div>
    )
  }

  // Generic file
  return (
    <a
      href={url}
      download={attachment.name}
      className="flex items-center gap-2 bg-muted rounded-md px-3 py-2 text-xs hover:bg-muted/80 transition-colors"
    >
      <Download className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="truncate max-w-[160px] text-foreground">{attachment.name}</span>
      <span className="text-muted-foreground">
        {attachment.size > 1024 * 1024
          ? `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(attachment.size / 1024)} KB`}
      </span>
    </a>
  )
}
