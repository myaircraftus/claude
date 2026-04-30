'use client'

/**
 * Rich chat panel for a single work order. Hooked into the same
 * thread_messages infrastructure used by /api/work-orders/[id]/messages, so
 * everything stays in one place: text, image attachments, voice memos
 * (auto-transcribed by Whisper on the existing upload route), and
 * approval / time-log markers stored as message intents.
 *
 * Real-time-ish: polls /messages every 4s while the panel is mounted. Cheap,
 * works without setting up a Supabase realtime channel, and unread state on
 * the parent bubble works the same way.
 *
 * Designed to drop straight into WorkOrderChatBubble.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Send, Paperclip, Mic, MicOff, Image as ImageIcon, Play, Pause, Clock, CheckCircle2, X, Loader2, AlertCircle } from 'lucide-react'

interface Attachment {
  path?: string
  url?: string
  name?: string
  size?: number
  kind?: 'image' | 'audio' | 'file'
  transcript?: string
}

interface MessageRecord {
  id: string
  role: string
  content: string
  intent: string | null
  artifact_type: string | null
  artifact_id: string | null
  metadata: Record<string, unknown> | null
  attachments: Attachment[] | null
  created_at: string
  sender?: {
    id: string | null
    full_name: string | null
    email: string | null
    avatar_url: string | null
  } | null
}

interface Props {
  workOrderId: string
  viewerRole: 'owner' | 'mechanic'
  /**
   * Called when a new outbound message arrives — drives unread badge clearing
   * on the parent bubble.
   */
  onMessageActivity?: (mostRecentIso: string) => void
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function isMine(senderRole: string, viewerRole: 'owner' | 'mechanic'): boolean {
  // The thread_messages role column uses 'user' for everything posted via the
  // work-orders/[id]/messages POST. There's no built-in role split. We fall
  // back to: anything posted by my user.id is "mine"; otherwise it's the
  // counterparty. Caller passes in viewerRole for label only.
  return senderRole === viewerRole
}

export function WorkOrderChatPanel({ workOrderId, viewerRole, onMessageActivity }: Props) {
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordingStart, setRecordingStart] = useState<number | null>(null)
  const [meId, setMeId] = useState<string | null>(null)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const pendingAttachmentsRef = useRef<Attachment[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])

  // Resolve the viewer's user id once so we can mark "mine" correctly
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/me')
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        setMeId(json?.user?.id ?? null)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/messages?limit=200`)
      if (!res.ok) return
      const json = await res.json()
      const next = (json.messages ?? []) as MessageRecord[]
      setMessages(next)
      const lastIso = next[next.length - 1]?.created_at
      if (lastIso) onMessageActivity?.(lastIso)
    } catch { /* swallow — next poll will retry */ }
  }, [workOrderId, onMessageActivity])

  // Initial load + 4s polling for real-time-ish behavior.
  useEffect(() => {
    void loadMessages()
    const t = setInterval(loadMessages, 4000)
    return () => clearInterval(t)
  }, [loadMessages])

  // Auto-scroll to newest message
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const handlePickFile = () => fileInputRef.current?.click()

  const uploadFile = useCallback(async (file: File): Promise<Attachment | null> => {
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/work-orders/${workOrderId}/messages/upload`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error ?? `Upload failed (${res.status})`)
      }
      return (await res.json()) as Attachment
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      return null
    } finally {
      setUploading(false)
    }
  }, [workOrderId])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const att = await uploadFile(file)
    if (att) {
      const next = [...pendingAttachmentsRef.current, att]
      pendingAttachmentsRef.current = next
      setPendingAttachments(next)
    }
  }, [uploadFile])

  // Voice recording — uses MediaRecorder, then sends the blob through the
  // upload endpoint where Whisper transcribes it (existing route already
  // does this). The transcript shows up on the message card so the
  // counterpart sees both audio and text.
  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      audioChunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (audioChunksRef.current.length === 0) return
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        const att = await uploadFile(file)
        if (att) {
          const next = [...pendingAttachmentsRef.current, att]
          pendingAttachmentsRef.current = next
          setPendingAttachments(next)
        }
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
      setRecordingStart(Date.now())
    } catch (err) {
      setError('Microphone access denied. Allow mic permissions to record voice memos.')
    }
  }, [uploadFile])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setRecording(false)
    setRecordingStart(null)
  }, [])

  const removePendingAttachment = (idx: number) => {
    const next = pendingAttachmentsRef.current.filter((_, i) => i !== idx)
    pendingAttachmentsRef.current = next
    setPendingAttachments(next)
  }

  const handleSend = async (intent?: 'estimate_approval' | 'time_log' | 'parts_request', extraMetadata?: Record<string, unknown>) => {
    const text = draft.trim()
    const atts = [...pendingAttachmentsRef.current]
    if (!text && atts.length === 0 && !intent) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          attachments: atts,
          intent: intent ?? null,
          metadata: extraMetadata ?? null,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.error ?? `Send failed (${res.status})`)
      }
      setDraft('')
      pendingAttachmentsRef.current = []
      setPendingAttachments([])
      await loadMessages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  // Time tracker — start/stop posts a message with intent='time_log' so the
  // counterpart sees "Mechanic logged 1.2h". A future iteration writes a
  // labor_line via /api/work-orders/[id]/lines as well.
  const [timerStart, setTimerStart] = useState<number | null>(null)
  const [timerNow, setTimerNow] = useState<number>(Date.now())
  useEffect(() => {
    if (!timerStart) return
    const t = setInterval(() => setTimerNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [timerStart])

  const startTimer = () => {
    setTimerStart(Date.now())
    void handleSend('time_log', { event: 'started' })
  }
  const stopTimer = async () => {
    if (!timerStart) return
    const ms = Date.now() - timerStart
    const hours = Math.round((ms / 3_600_000) * 10) / 10
    setTimerStart(null)
    await fetch(`/api/work-orders/${workOrderId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'Time log entry from chat',
        hours,
        rate: 0,
      }),
    }).catch(() => null)
    setDraft(`Logged ${hours}h`)
    void handleSend('time_log', { event: 'stopped', hours })
  }

  const recordingSeconds = recording && recordingStart ? Math.floor((Date.now() - recordingStart) / 1000) : 0
  const timerSeconds = timerStart ? Math.floor((timerNow - timerStart) / 1000) : 0

  return (
    <div className="flex flex-col h-full">
      {/* Message log */}
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2 bg-muted/10">
        {messages.length === 0 && (
          <div className="text-[12px] text-muted-foreground italic text-center py-4">
            No messages yet. Send the first one to start the conversation.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender?.id ? m.sender.id === meId : isMine(m.role, viewerRole)
          const senderLabel = mine ? 'You' : (m.sender?.full_name ?? (viewerRole === 'mechanic' ? 'Owner' : 'Shop'))
          const intent = m.intent
          return (
            <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                mine ? 'bg-primary text-white rounded-br-sm' : 'bg-white border border-border rounded-bl-sm'
              }`}>
                <div className={`text-[10px] mb-1 ${mine ? 'text-white/75' : 'text-muted-foreground'}`} style={{ fontWeight: 500 }}>
                  {senderLabel} · {formatTime(m.created_at)}
                  {intent && <span className="ml-1 inline-flex items-center gap-0.5">
                    {intent === 'estimate_approval' && '· estimate'}
                    {intent === 'time_log' && '· time log'}
                    {intent === 'parts_request' && '· parts request'}
                  </span>}
                </div>
                {m.content && (
                  <p className={`text-[12px] whitespace-pre-wrap break-words ${mine ? 'text-white' : 'text-foreground'}`}>
                    {m.content}
                  </p>
                )}
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.attachments.map((a, i) => (
                      <AttachmentBubble key={i} attachment={a} mine={mine} workOrderId={workOrderId} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pending attachments tray */}
      {pendingAttachments.length > 0 && (
        <div className="border-t border-border px-3 py-2 bg-amber-50/40 flex flex-wrap gap-1.5 flex-shrink-0">
          {pendingAttachments.map((att, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-white border border-border rounded-full pl-2 pr-1 py-0.5 text-[11px]">
              {att.kind === 'image' ? <ImageIcon className="w-3 h-3" /> : att.kind === 'audio' ? <Mic className="w-3 h-3" /> : <Paperclip className="w-3 h-3" />}
              <span className="truncate max-w-[120px]">{att.name}</span>
              <button onClick={() => removePendingAttachment(i)} className="ml-0.5 p-0.5 rounded-full hover:bg-muted">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Time tracker bar (mechanic-only affordance) */}
      {viewerRole === 'mechanic' && (
        <div className="border-t border-border px-3 py-1.5 bg-emerald-50/40 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-foreground/80">
            <Clock className="w-3 h-3 text-emerald-600" />
            {timerStart ? (
              <span style={{ fontWeight: 600 }}>
                Tracking: {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
              </span>
            ) : (
              <span>Time tracker</span>
            )}
          </div>
          <button
            type="button"
            onClick={timerStart ? stopTimer : startTimer}
            className={`text-[11px] px-2 py-1 rounded ${
              timerStart ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}
            style={{ fontWeight: 500 }}
          >
            {timerStart ? 'Stop & log' : 'Start'}
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-border p-2 flex-shrink-0">
        {error && (
          <div className="mb-2 px-2 py-1 rounded bg-red-50 text-red-700 text-[11px] flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={handlePickFile}
            disabled={uploading}
            className="flex-shrink-0 p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            title="Attach photo or file"
            aria-label="Attach photo or file"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={uploading}
            className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
              recording ? 'bg-red-100 text-red-600 hover:bg-red-200 animate-pulse' : 'hover:bg-muted text-muted-foreground'
            }`}
            title={recording ? `Stop recording (${recordingSeconds}s)` : 'Record voice memo'}
            aria-label={recording ? 'Stop recording' : 'Record voice memo'}
          >
            {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            placeholder={recording ? `Recording… ${recordingSeconds}s` : 'Type a message…'}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-24"
            disabled={sending || recording}
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={sending || recording || (!draft.trim() && pendingAttachments.length === 0)}
            className="flex-shrink-0 p-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * One attached file rendered inline. Image → thumbnail; audio → player +
 * transcript; other files → download chip.
 */
function AttachmentBubble({ attachment, mine, workOrderId }: { attachment: Attachment; mine: boolean; workOrderId: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(attachment.url ?? null)

  // Sign the storage path on demand. The upload endpoint stores the bucket
  // path; we mint a signed url so the bubble can render it.
  useEffect(() => {
    if (signedUrl || !attachment.path) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/work-orders/${workOrderId}/messages/sign-url?path=${encodeURIComponent(attachment.path!)}`,
        )
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled && json?.url) setSignedUrl(json.url)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [attachment.path, signedUrl, workOrderId])

  if (attachment.kind === 'image' && signedUrl) {
    return (
      <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={signedUrl}
          alt={attachment.name ?? 'attachment'}
          className="rounded-lg max-h-48 w-auto border border-border/50"
        />
      </a>
    )
  }
  if (attachment.kind === 'audio' && signedUrl) {
    return (
      <div className="space-y-1">
        <audio controls src={signedUrl} className="max-w-[260px]" />
        {attachment.transcript && (
          <p className={`text-[11px] italic ${mine ? 'text-white/80' : 'text-muted-foreground'}`}>
            "{attachment.transcript}"
          </p>
        )}
      </div>
    )
  }
  return (
    <a
      href={signedUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded ${
        mine ? 'bg-white/10 text-white' : 'bg-muted text-foreground'
      }`}
    >
      <Paperclip className="w-3 h-3" />
      {attachment.name ?? 'file'}
    </a>
  )
}
