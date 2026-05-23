'use client'

/**
 * UnifiedLauncher — one floating button (bottom-right) that opens a
 * 3-tab panel:
 *
 *   1. Help  — chat with the support AI. Records the convo as a ticket.
 *   2. Ask   — natural-language Q&A across the user's own records (deeplinks to /ask).
 *   3. Messages — owner ↔ mechanic chat (per-WO or general).
 *
 * Replaces the three scattered widgets (VoiceButton + AI + Support
 * popovers) the user reported.
 *
 * Persists last-used tab in localStorage so the next click opens
 * where they left off.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  MessageSquare,
  HelpCircle,
  Send,
  X,
  Loader2,
  Bot,
  ExternalLink,
} from 'lucide-react'
import { VoiceButton } from '@/components/voice/VoiceButton'

type Tab = 'help' | 'ask' | 'messages'

interface Turn {
  role: 'user' | 'assistant'
  content: string
  confidence?: string
  cited_kb_ids?: string[]
  needs_human?: boolean
  follow_ups?: string[]
}

const STORAGE_KEY = 'mac.launcher.lastTab'

export function UnifiedLauncher({
  persona = 'owner',
}: {
  persona?: 'owner' | 'shop' | 'mechanic' | 'admin'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('help')

  // Help chat state
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [helpTurns, setHelpTurns] = useState<Turn[]>([])
  const [helpInput, setHelpInput] = useState('')
  const [helpBusy, setHelpBusy] = useState(false)
  const helpScrollRef = useRef<HTMLDivElement>(null)

  // Restore last tab on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'help' || saved === 'ask' || saved === 'messages') {
      setTab(saved)
    }
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, tab)
  }, [tab])

  // Auto-scroll Help thread on new turn
  useEffect(() => {
    if (tab === 'help' && helpScrollRef.current) {
      helpScrollRef.current.scrollTo({ top: helpScrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [helpTurns, helpBusy, tab])

  const sendHelp = useCallback(async () => {
    const msg = helpInput.trim()
    if (!msg || helpBusy) return
    setHelpInput('')
    const userTurn: Turn = { role: 'user', content: msg }
    setHelpTurns((t) => [...t, userTurn])
    setHelpBusy(true)
    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, message: msg, persona }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Support failed (${res.status})`)
      }
      const j = (await res.json()) as {
        ticket_id: string
        answer: string
        confidence: string
        cited_kb_ids: string[]
        needs_human: boolean
        follow_ups: string[]
      }
      if (j.ticket_id && j.ticket_id !== ticketId) setTicketId(j.ticket_id)
      setHelpTurns((t) => [
        ...t,
        {
          role: 'assistant',
          content: j.answer,
          confidence: j.confidence,
          cited_kb_ids: j.cited_kb_ids,
          needs_human: j.needs_human,
          follow_ups: j.follow_ups,
        },
      ])
    } catch (err) {
      setHelpTurns((t) => [
        ...t,
        {
          role: 'assistant',
          content: `**Support error.** ${err instanceof Error ? err.message : 'Try again or email support@myaircraft.us.'}`,
          confidence: 'refused',
        },
      ])
    } finally {
      setHelpBusy(false)
    }
  }, [helpInput, helpBusy, ticketId, persona])

  const newHelpSession = useCallback(() => {
    setTicketId(null)
    setHelpTurns([])
    setHelpInput('')
  }, [])

  return (
    <>
      {/* Floating launcher button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 group inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-full pl-3 pr-4 py-2.5 shadow-lg transition-all"
          aria-label="Open help, AI, and messages"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-semibold">Ask · Help · Messages</span>
        </button>
      )}

      {/* Panel — wrapped in a full-screen dim overlay that matches the WO
          chat drawer treatment: the page recedes, the panel "shines".
          Clicking the dim closes the launcher (unlike the WO drawer which
          stays put — the launcher has no native <select>s so the iPad
          dismiss-tap bug doesn't apply). */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-end p-4 pointer-events-none">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm pointer-events-auto transition-opacity duration-150"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="relative pointer-events-auto w-[420px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)] bg-white rounded-xl ring-1 ring-white/40 shadow-[0_0_60px_-10px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-600 font-semibold">
              myaircraft assistant
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-700 p-1"
              aria-label="Close launcher"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 bg-white">
            <TabButton active={tab === 'help'} onClick={() => setTab('help')} icon={HelpCircle} label="Help" />
            <TabButton active={tab === 'ask'} onClick={() => setTab('ask')} icon={Sparkles} label="Ask records" />
            <TabButton
              active={tab === 'messages'}
              onClick={() => setTab('messages')}
              icon={MessageSquare}
              label="Messages"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 flex flex-col">
            {tab === 'help' && (
              <>
                <div ref={helpScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/40">
                  {helpTurns.length === 0 && (
                    <div className="text-center py-8 px-3">
                      <Bot className="w-8 h-8 text-violet-500 mx-auto mb-2" />
                      <div className="text-sm font-semibold text-slate-900 mb-1">
                        How can I help?
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed">
                        Ask about anything in the platform — how to upload a logbook,
                        invite a mechanic, change a tier, etc. I&apos;ll cite the SOP
                        I&apos;m grounding on. Human takeover if I can&apos;t answer.
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-1.5 text-left">
                        {[
                          'How do I invite a mechanic?',
                          'Where do I download my data (GDPR)?',
                          "I forgot my password — what's the fix?",
                          'How does pricing work for a 12-aircraft shop?',
                        ].map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => {
                              setHelpInput(q)
                            }}
                            className="text-left text-[11px] text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded px-2.5 py-1.5 transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {helpTurns.map((t, i) => (
                    <HelpMessage key={i} turn={t} onFollowUp={(q) => setHelpInput(q)} />
                  ))}
                  {helpBusy && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 pl-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Looking it up…
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-200 p-2 bg-white">
                  <div className="flex gap-2 items-stretch">
                    {/* Voice: dictate the question instead of typing. The
                        existing VoiceButton handles MediaRecorder + a POST
                        to /api/voice/transcribe; we just stuff the
                        transcript into the input and let the user hit send. */}
                    <VoiceButton
                      classifyIntent={false}
                      onResult={({ transcript }) => {
                        if (transcript) setHelpInput((cur) => (cur ? `${cur} ${transcript}` : transcript))
                      }}
                      className="shrink-0"
                    />
                    <input
                      value={helpInput}
                      onChange={(e) => setHelpInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void sendHelp()
                        }
                      }}
                      disabled={helpBusy}
                      placeholder="Ask anything…"
                      className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void sendHelp()}
                      disabled={!helpInput.trim() || helpBusy}
                      className="inline-flex items-center justify-center bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 text-white rounded-md w-10 transition-colors"
                      aria-label="Send"
                    >
                      {helpBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                  {(ticketId || helpTurns.length > 0) && (
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                      {ticketId ? (
                        <span>Ticket #{ticketId.slice(0, 8)}</span>
                      ) : (
                        <span>&nbsp;</span>
                      )}
                      <button type="button" onClick={newHelpSession} className="text-violet-700 hover:underline">
                        Start a new session
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {tab === 'ask' && (
              <div className="flex-1 overflow-y-auto px-4 py-4 text-sm text-slate-700">
                <Bot className="w-8 h-8 text-violet-500 mb-2" />
                <p className="font-semibold text-slate-900 mb-1">Ask your records</p>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  Natural-language Q&amp;A scoped to your own aircraft and the records
                  the shop has shared with you.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    router.push('/ask')
                  }}
                  className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-md px-4 py-2 transition-colors"
                >
                  Open Ask <ExternalLink className="w-3 h-3" />
                </button>
                <div className="mt-6">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
                    Try
                  </div>
                  <ul className="space-y-1 text-xs text-slate-700">
                    <li>· When is the next annual due on N401LP?</li>
                    <li>· Show me the last engine overhaul on the fleet.</li>
                    <li>· Which aircraft has the most logbook entries?</li>
                    <li>· How many of my aircraft have records before 1980?</li>
                  </ul>
                </div>
              </div>
            )}

            {tab === 'messages' && (
              <div className="flex-1 overflow-y-auto px-4 py-4 text-sm text-slate-700">
                <MessageSquare className="w-8 h-8 text-violet-500 mb-2" />
                <p className="font-semibold text-slate-900 mb-1">Owner ↔ mechanic chat</p>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  Per-work-order conversations — pick an aircraft, then a
                  work order, and chat with the shop / owner about it.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    // Fire the cross-component event the WorkOrderChatBubble
                    // listens for; it'll open its drawer with the
                    // last-selected aircraft and most-recent WO. Close the
                    // launcher so the bubble drawer has the screen.
                    setOpen(false)
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('mac:open-wo-chat'))
                    }
                  }}
                  className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-md px-4 py-2 transition-colors"
                >
                  Open work-order chat
                </button>
                <div className="mt-4 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Or jump to
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    router.push(persona === 'owner' ? '/owner/dashboard' : '/work-orders')
                  }}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs text-violet-700 hover:text-violet-900 hover:underline"
                >
                  Open {persona === 'owner' ? 'owner dashboard' : 'work orders list'}{' '}
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof HelpCircle
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] transition-colors ${
        active
          ? 'text-violet-700 bg-violet-50/60 border-b-2 border-violet-500 font-semibold'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-b-2 border-transparent'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function HelpMessage({ turn, onFollowUp }: { turn: Turn; onFollowUp: (q: string) => void }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-violet-600 text-white rounded-lg rounded-tr-sm px-3 py-2 text-sm">
          {turn.content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%]">
        <div
          className="bg-white border border-slate-200 rounded-lg rounded-tl-sm px-3 py-2 text-sm text-slate-800 leading-relaxed prose prose-sm prose-slate max-w-none prose-p:my-1.5 prose-strong:text-slate-900 prose-code:text-orange-700 prose-code:bg-orange-50 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none"
          dangerouslySetInnerHTML={{ __html: renderMd(turn.content) }}
        />
        {turn.needs_human && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium">
            Flagged for human follow-up
          </div>
        )}
        {turn.follow_ups && turn.follow_ups.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {turn.follow_ups.slice(0, 3).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onFollowUp(q)}
                className="text-[10px] text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-full px-2 py-0.5 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Tiny inline markdown — same shape as the other Ask bars.
function renderMd(src: string): string {
  let s = escapeHtml(src)
  s = s.replace(/```([\s\S]*?)```/g, (_m, c) => `<pre><code>${c}</code></pre>`)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/(^|\n)((?:- .+(?:\n|$))+)/g, (_m, lead, block) => {
    const items = block.trim().split(/\n/).map((line: string) => line.replace(/^- /, ''))
    return `${lead}<ul>${items.map((it: string) => `<li>${it}</li>`).join('')}</ul>`
  })
  s = s
    .split(/\n{2,}/)
    .map((p) => (/^<(ul|pre|p|h\d|blockquote)/.test(p.trim()) ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`))
    .join('\n')
  return s
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
