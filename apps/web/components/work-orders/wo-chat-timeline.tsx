'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { cn, formatDateTime } from '@/lib/utils'
import {
  Camera, Mic, Paperclip, Send, Loader2, Package, Wrench,
  Play, Pause, Download, X, Image as ImageIcon,
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
  onAddPart?: () => void
  onAddLabor?: () => void
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
        <div className="flex items-center gap-2">
          {onAddPart && (
            <button
              onClick={onAddPart}
              className="flex items-center gap-1 px-2 py-1 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Package className="h-3 w-3" />
              Add Part
            </button>
          )}
          {onAddLabor && (
            <button
              onClick={onAddLabor}
              className="flex items-center gap-1 px-2 py-1 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Wrench className="h-3 w-3" />
              Add Labor
            </button>
          )}
        </div>

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
