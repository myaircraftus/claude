'use client'

/**
 * AI Simulator client — white theme.
 *
 * Two-phase UI:
 *   1. Scenario picker — grid of available scenarios fetched from
 *      GET /api/sop/simulator
 *   2. Chat — once a scenario is picked, the user converses with the AI
 *      coach. Each turn POSTs to /api/sop/simulator with the full message
 *      history. The server returns the assistant reply plus a list of
 *      success criteria the user has demonstrated.
 *
 * On scenario completion, shows a "Completion Certificate" with the
 * user's name + scenario title + timestamp — printable evidence the
 * compliance side asked for.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  Send,
  Sparkles,
  CheckCircle2,
  RefreshCcw,
  Printer,
  History,
  Play,
} from 'lucide-react'

interface Scenario {
  id: string
  title: string
  description: string
  persona: 'mechanic' | 'owner' | 'admin'
  openingMessage: string
  successCriteria: string[]
}

interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

interface RecentSession {
  id: string
  scenario_id: string
  is_complete: boolean
  completed_criteria: string[]
  started_at: string
  last_message_at: string
}

const PERSONA_TINT: Record<Scenario['persona'], string> = {
  mechanic: 'text-sky-700 bg-sky-50 border-sky-200',
  owner: 'text-rose-700 bg-rose-50 border-rose-200',
  admin: 'text-violet-700 bg-violet-50 border-violet-200',
}

export function SimulatorClient() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [scenariosLoading, setScenariosLoading] = useState(true)
  const [scenariosError, setScenariosError] = useState<string | null>(null)
  const [resumeBusy, setResumeBusy] = useState<string | null>(null)

  const [active, setActive] = useState<Scenario | null>(null)
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [completedCriteria, setCompletedCriteria] = useState<string[]>([])
  const [scenarioComplete, setScenarioComplete] = useState(false)
  const [input, setInput] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)
  /**
   * Server-side session id (sop_simulator_sessions.id). Created on the
   * first POST so the conversation can be resumed + audited later.
   * Persisted by /api/sop/simulator; nullable if persistence failed
   * (the chat still works in that case).
   */
  const [sessionId, setSessionId] = useState<string | null>(null)
  const completedAt = useRef<Date | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fetch scenario list + the user's prior sessions on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/sop/simulator', { method: 'GET' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || `Load failed (${res.status})`)
        }
        const data = (await res.json()) as {
          scenarios: Scenario[]
          recentSessions?: RecentSession[]
        }
        if (!cancelled) {
          setScenarios(data.scenarios || [])
          setRecentSessions(data.recentSessions || [])
        }
      } catch (err) {
        if (!cancelled) {
          setScenariosError(err instanceof Error ? err.message : 'Failed to load scenarios.')
        }
      } finally {
        if (!cancelled) setScenariosLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-scroll the chat to the bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, busy])

  const startScenario = useCallback((s: Scenario) => {
    setActive(s)
    setMessages([{ role: 'assistant', content: s.openingMessage, ts: Date.now() }])
    setCompletedCriteria([])
    setScenarioComplete(false)
    setSessionId(null) // new session — server will assign an id on first POST
    setInput('')
    setChatError(null)
    completedAt.current = null
  }, [])

  const resetToPicker = () => {
    setActive(null)
    setMessages([])
    setCompletedCriteria([])
    setScenarioComplete(false)
    setSessionId(null)
    setInput('')
    setChatError(null)
    completedAt.current = null
  }

  const restart = () => {
    if (active) startScenario(active)
  }

  /**
   * Resume an existing session. Pulls the full message history from the
   * server (so we don't trust client cache) and hydrates the chat state.
   */
  const resumeSession = useCallback(
    async (sess: RecentSession) => {
      const scenario = scenarios.find((s) => s.id === sess.scenario_id)
      if (!scenario) return
      setResumeBusy(sess.id)
      try {
        const res = await fetch(`/api/sop/simulator/${sess.id}`, { method: 'GET' })
        if (!res.ok) throw new Error(`Load failed (${res.status})`)
        const data = (await res.json()) as {
          session: {
            id: string
            scenario_id: string
            messages: Array<{ role: 'user' | 'assistant'; content: string; ts?: number }>
            completed_criteria: string[]
            is_complete: boolean
            completed_at: string | null
          }
        }
        const hydrated: ChatTurn[] = (data.session.messages || []).map((m, i) => ({
          role: m.role,
          content: m.content,
          ts: typeof m.ts === 'number' ? m.ts : Date.now() - (1000 * (data.session.messages.length - i)),
        }))
        setActive(scenario)
        setSessionId(data.session.id)
        setMessages(hydrated)
        setCompletedCriteria(data.session.completed_criteria || [])
        setScenarioComplete(!!data.session.is_complete)
        completedAt.current = data.session.completed_at ? new Date(data.session.completed_at) : null
        setInput('')
        setChatError(null)
      } catch (err) {
        setChatError(err instanceof Error ? err.message : 'Failed to resume.')
      } finally {
        setResumeBusy(null)
      }
    },
    [scenarios],
  )

  const sendTurn = useCallback(async () => {
    const text = input.trim()
    if (!text || !active || busy) return
    const userTurn: ChatTurn = { role: 'user', content: text, ts: Date.now() }
    const nextMessages = [...messages, userTurn]
    setMessages(nextMessages)
    setInput('')
    setBusy(true)
    setChatError(null)
    try {
      const res = await fetch('/api/sop/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: active.id,
          sessionId, // null on first turn — server assigns; reused for subsequent turns
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Coach failed (${res.status})`)
      }
      const data = (await res.json()) as {
        sessionId?: string | null
        assistant: string
        scenarioComplete: boolean
        completedCriteria: string[]
      }
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId)
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.assistant, ts: Date.now() },
      ])
      setCompletedCriteria(data.completedCriteria || [])
      if (data.scenarioComplete && !scenarioComplete) {
        completedAt.current = new Date()
        setScenarioComplete(true)
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }, [active, busy, input, messages, scenarioComplete, sessionId])

  // ── Picker view ────────────────────────────────────────────────
  if (!active) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-6 bg-white min-h-screen">
        <Link
          href="/sop-library"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Library
        </Link>

        <header className="mb-6 pb-5 border-b border-slate-200">
          <div className="flex items-center gap-2 text-violet-700 mb-2">
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">
              AI Simulator
            </span>
          </div>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight mb-2">
            Practice a workflow with the AI coach
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Pick a scenario. The AI will play coach — walking you through a real myaircraft.us
            workflow step by step. Useful for training new staff, validating procedures, and
            generating compliance evidence.
          </p>
        </header>

        {scenariosLoading ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading scenarios…
          </div>
        ) : scenariosError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            {scenariosError}
          </div>
        ) : (
          <>
            {recentSessions.length > 0 && (
              <section className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-slate-500" />
                  <h2 className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
                    Resume a session
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recentSessions.slice(0, 6).map((sess) => {
                    const scenario = scenarios.find((s) => s.id === sess.scenario_id)
                    const total = scenario?.successCriteria.length ?? 0
                    const done = sess.completed_criteria.length
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    const when = new Date(sess.last_message_at)
                    return (
                      <button
                        key={sess.id}
                        type="button"
                        onClick={() => resumeSession(sess)}
                        disabled={!scenario || resumeBusy === sess.id}
                        className="text-left rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-violet-300 transition-all p-3 disabled:opacity-60"
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <span className="text-[9px] uppercase tracking-[0.15em] text-slate-500 font-semibold truncate">
                            {scenario?.title ?? sess.scenario_id}
                          </span>
                          {sess.is_complete ? (
                            <span className="text-[9px] uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 font-semibold flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Done
                            </span>
                          ) : (
                            <span className="text-[9px] text-violet-700 bg-violet-50 border border-violet-200 rounded px-1 py-0.5 font-semibold">
                              {pct}%
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 mb-2">
                          {when.toLocaleDateString()} · {done}/{total} steps
                        </div>
                        <div className="inline-flex items-center gap-1 text-[11px] text-violet-700 font-medium">
                          {resumeBusy === sess.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3" />
                          )}
                          {sess.is_complete ? 'Review' : 'Resume'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            <section>
              {recentSessions.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                  <h2 className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
                    Start a new scenario
                  </h2>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => startScenario(s)}
                    className="group text-left rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-violet-300 hover:shadow-sm transition-all p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span
                        className={`text-[10px] uppercase tracking-[0.15em] font-semibold rounded border px-1.5 py-0.5 ${PERSONA_TINT[s.persona]}`}
                      >
                        {s.persona}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {s.successCriteria.length} steps
                      </span>
                    </div>
                    <h2 className="text-base font-semibold text-slate-900 mb-2 leading-snug">
                      {s.title}
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed">{s.description}</p>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    )
  }

  // ── Chat view ──────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col h-[calc(100vh-2rem)] bg-white">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={resetToPicker}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Scenarios
          </button>
          <div className="text-slate-300">·</div>
          <div className="text-xs text-slate-900">
            <span className="text-violet-700 font-semibold">{active.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-50 rounded-md px-2.5 py-1 transition-colors"
          >
            <RefreshCcw className="w-3 h-3" />
            Restart
          </button>
        </div>
      </div>

      {/* Progress strip */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">
            Progress · {completedCriteria.length} / {active.successCriteria.length} steps demonstrated
          </div>
          {scenarioComplete && (
            <div className="text-[10px] uppercase tracking-[0.15em] text-emerald-700 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Scenario complete
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {active.successCriteria.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i < completedCriteria.length ? 'bg-emerald-500' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Chat scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4"
      >
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} content={m.content} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Coach is thinking…
          </div>
        )}
        {chatError && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            {chatError}
          </div>
        )}

        {scenarioComplete && (
          <CompletionCertificate
            scenarioTitle={active.title}
            criteria={active.successCriteria}
            completedAt={completedAt.current}
          />
        )}
      </div>

      {/* Composer */}
      {!scenarioComplete && (
        <div className="mt-4 flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendTurn()
              }
            }}
            disabled={busy}
            rows={2}
            placeholder="Describe what you'd do next…"
            className="flex-1 resize-none bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={sendTurn}
            disabled={!input.trim() || busy}
            className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Send
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function ChatMessage({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-violet-600 text-white rounded-lg rounded-tr-sm px-3 py-2 text-sm shadow-sm">
          {content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className="text-[10px] uppercase tracking-[0.15em] text-violet-700 font-semibold mb-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Coach
        </div>
        <div
          className="prose prose-slate prose-sm max-w-none prose-p:my-2 prose-strong:text-slate-900 prose-code:text-orange-700 prose-code:bg-orange-50 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none bg-white border border-slate-200 rounded-lg rounded-tl-sm px-3 py-2 shadow-sm"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      </div>
    </div>
  )
}

function CompletionCertificate({
  scenarioTitle,
  criteria,
  completedAt,
}: {
  scenarioTitle: string
  criteria: string[]
  completedAt: Date | null
}) {
  const dt = completedAt ?? new Date()
  return (
    <div className="mt-4 rounded-lg border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-6 text-center print:bg-white print:text-black print:border-emerald-700">
      <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-700 font-semibold mb-3">
        Completion Certificate
      </div>
      <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2 print:text-emerald-700" />
      <div className="text-lg font-semibold text-slate-900 mb-1 print:text-black">
        {scenarioTitle}
      </div>
      <div className="text-xs text-slate-600 mb-4 print:text-slate-700">
        Scenario completed · {dt.toLocaleString()}
      </div>
      <div className="text-left max-w-md mx-auto">
        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2 print:text-slate-600">
          Steps demonstrated
        </div>
        <ul className="space-y-1">
          {criteria.map((c, i) => (
            <li
              key={i}
              className="text-xs text-slate-800 flex items-start gap-2 print:text-black"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0 print:text-emerald-700" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-5 inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md px-3 py-1.5 transition-colors print:hidden"
      >
        <Printer className="w-3 h-3" /> Print certificate
      </button>
    </div>
  )
}

// Minimal markdown renderer — same logic as SOPAIQueryBar. Kept inline to
// avoid a shared dep on react-markdown that this surface doesn't need.
function renderMarkdown(src: string): string {
  let s = escapeHtml(src)
  s = s.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${code}</code></pre>`)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/(^|\n)((?:- .+(?:\n|$))+)/g, (_m, lead, block) => {
    const items = block.trim().split(/\n/).map((line: string) => line.replace(/^- /, ''))
    return `${lead}<ul>${items.map((it: string) => `<li>${it}</li>`).join('')}</ul>`
  })
  s = s
    .split(/\n{2,}/)
    .map((para) => {
      if (/^<(ul|pre|p|h\d|blockquote)/.test(para.trim())) return para
      return `<p>${para.replace(/\n/g, '<br/>')}</p>`
    })
    .join('\n')
  return s
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
