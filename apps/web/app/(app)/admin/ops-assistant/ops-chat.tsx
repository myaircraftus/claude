'use client'

/**
 * Phase 16 Sprint 16.8 — chat UI for /admin/ops-assistant.
 *
 * Persists conversations server-side; this client component just owns
 * the in-flight thread for the current page session. Refresh = fresh
 * conversation (we don't auto-resume; admin picks from the list).
 */
import { useState, useRef, useEffect } from 'react'
import { Loader2, Send, Sparkles, Wrench } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_name?: string
  tool_input?: unknown
  tool_output?: unknown
}

export function OpsChat({ examples }: { examples: string[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setError(null)
    setBusy(true)
    setMessages((m) => [...m, { role: 'user', content: trimmed }])
    setInput('')
    try {
      const res = await fetch('/api/admin/ops-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, conversation_id: conversationId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Failed')
        setMessages((m) => [...m, { role: 'assistant', content: `Error: ${data?.error ?? 'failed'}` }])
        return
      }
      setConversationId(data.conversation_id)
      const toolMsgs: ChatMessage[] = (data.tool_calls ?? []).map((c: any) => ({
        role: 'tool',
        content: '',
        tool_name: c.name,
        tool_input: c.input,
        tool_output: c.output,
      }))
      setMessages((m) => [...m, ...toolMsgs, { role: 'assistant', content: data.text }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {messages.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Try one of these:</p>
          <div className="grid gap-2 md:grid-cols-2">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => send(ex)}
                className="text-left rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-muted/40"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((m, i) => <Bubble key={i} message={m} />)}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(input) }}
        className="flex items-end gap-2 rounded-2xl border border-border bg-white p-3"
      >
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault(); send(input)
            }
          }}
          placeholder="Ask anything about platform state…"
          className="flex-1 resize-none rounded-lg border-0 bg-transparent px-2 py-1 text-sm focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Send
        </button>
      </form>
    </div>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === 'tool') {
    return (
      <details className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 text-xs text-blue-900">
        <summary className="cursor-pointer flex items-center gap-1.5">
          <Wrench className="h-3 w-3" /> Tool call: <span className="font-mono">{message.tool_name}</span>
        </summary>
        <pre className="mt-2 max-h-60 overflow-auto rounded bg-white/70 p-2 text-[11px]">
{JSON.stringify({ input: message.tool_input, output: message.tool_output }, null, 2)}
        </pre>
      </details>
    )
  }
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-white">
        {message.content}
      </div>
    )
  }
  return (
    <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-white px-4 py-3 text-sm">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="h-3 w-3" /> AI Ops Assistant
      </div>
      <p className="whitespace-pre-wrap">{message.content}</p>
    </div>
  )
}
