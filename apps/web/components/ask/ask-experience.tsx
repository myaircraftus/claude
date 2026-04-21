'use client'

import dynamic from 'next/dynamic'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Send, Loader2, Plane, Clock, Sparkles, FileText, BookOpen, ChevronDown, ClipboardList, Package, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AnswerBlock } from '@/components/ask/answer-block'
import { DocumentViewerBoundary } from '@/components/ask/document-viewer-boundary'
import { MechanicToolsPanel } from '@/components/ask/mechanic-tools-panel'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { formatDateTime } from '@/lib/utils'
import type { Aircraft, AnswerCitation, QueryConfidence, OrgRole } from '@/types'

// ── Artifact types (mirrors /api/ask Artifact interface) ──────────────────────
interface Artifact {
  type: 'logbook_draft' | 'checklist' | 'parts_results' | 'logbook_entries'
  title: string
  data: any
  aircraft_id?: string
  action_url?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  confidence?: QueryConfidence
  citations?: AnswerCitation[]
  warningFlags?: string[]
  followUpQuestions?: string[]
  artifacts?: Artifact[]
  timestamp: Date
}

interface AircraftOption {
  id: string
  tail_number: string
  make: string
  model: string
}

const SUGGESTED_PROMPTS = [
  'When was the last annual inspection?',
  'Draft a logbook entry for the oil change I just did',
  'Find magneto parts for my aircraft',
  'Generate an annual inspection checklist',
  'Show oil change history',
  'What does my engine logbook say about the last overhaul?',
]

const DocumentViewer = dynamic(
  () => import('@/components/ask/document-viewer').then((mod) => mod.DocumentViewer),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-center">Loading source preview…</p>
      </div>
    ),
  }
)

function createMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// ── Artifact card renderer ────────────────────────────────────────────────────

function ArtifactCard({ artifact, onUse }: { artifact: Artifact; onUse: (url: string) => void }) {
  const iconMap = {
    logbook_draft: <Sparkles className="w-4 h-4 text-primary" />,
    checklist: <ClipboardList className="w-4 h-4 text-primary" />,
    parts_results: <Package className="w-4 h-4 text-primary" />,
    logbook_entries: <BookOpen className="w-4 h-4 text-primary" />,
  }

  const data = artifact.data as any

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/3 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/10 bg-primary/5">
        <div className="flex items-center gap-2">
          {iconMap[artifact.type]}
          <span className="text-[12px] font-semibold text-foreground">{artifact.title}</span>
        </div>
        {artifact.action_url && (
          <button
            onClick={() => onUse(artifact.action_url!)}
            className="flex items-center gap-1 text-[11px] text-primary font-semibold hover:underline"
          >
            Use This <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="p-3 text-[12px] text-foreground space-y-2">
        {/* Logbook draft */}
        {artifact.type === 'logbook_draft' && data?.description && (
          <>
            <p className="leading-relaxed">{data.description}</p>
            {data.entry_type && (
              <span className="inline-block bg-primary/10 text-primary px-2 py-0.5 rounded text-[11px] font-medium">
                {data.entry_type}
              </span>
            )}
            {Array.isArray(data.parts_used) && data.parts_used.length > 0 && (
              <div>
                <p className="font-semibold text-muted-foreground text-[11px] uppercase mb-1">Parts</p>
                {data.parts_used.map((p: any, i: number) => (
                  <p key={i} className="text-[11px] text-muted-foreground">{p.part_number} — {p.description} (qty {p.quantity})</p>
                ))}
              </div>
            )}
          </>
        )}

        {/* Checklist */}
        {artifact.type === 'checklist' && Array.isArray(data?.items) && (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {data.items.slice(0, 12).map((item: any, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${item.required ? 'bg-destructive' : 'bg-muted-foreground/40'}`} />
                <div>
                  <span className="font-medium text-foreground">{item.title}</span>
                  {item.reference && <span className="ml-1.5 text-[10px] text-primary font-mono">{item.reference}</span>}
                </div>
              </li>
            ))}
            {data.items.length > 12 && (
              <li className="text-[11px] text-muted-foreground pl-3.5">+{data.items.length - 12} more items</li>
            )}
          </ul>
        )}

        {/* Parts results */}
        {artifact.type === 'parts_results' && (
          <>
            {Array.isArray(data?.results) && data.results.length > 0 ? (
              <ul className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {data.results.slice(0, 6).map((p: any, i: number) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-medium text-foreground">{p.part_number ?? p.title ?? 'Part'}</span>
                      {p.description && <p className="text-[11px] text-muted-foreground">{p.description}</p>}
                    </div>
                    {p.price != null && (
                      <span className="text-[11px] font-semibold text-emerald-600 flex-shrink-0">${p.price}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No parts found. Try the parts library for a broader search.</p>
            )}
          </>
        )}

        {/* Logbook entries */}
        {artifact.type === 'logbook_entries' && (
          <>
            {Array.isArray(data?.entries) && data.entries.length > 0 ? (
              <ul className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {data.entries.map((e: any, i: number) => (
                  <li key={i} className="border-b border-border/50 pb-1.5 last:border-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-medium text-foreground">{e.entry_date ?? 'Date unknown'}</span>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{e.entry_type}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{e.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No matching logbook entries found.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function AskExperience() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialQuestionFromQuery = searchParams.get('q')?.trim() ?? ''
  const [aircraft, setAircraft] = useState<AircraftOption[]>([])
  const [userRole, setUserRole] = useState<OrgRole | null>(null)
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>(
    searchParams.get('aircraft') ?? 'all'
  )
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState(initialQuestionFromQuery)
  const [isLoading, setIsLoading] = useState(false)
  const [activeCitation, setActiveCitation] = useState<AnswerCitation | null>(null)
  const [previousQueries, setPreviousQueries] = useState<Array<{ id: string; question: string; created_at: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoAskedQueryRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserSupabase()

    supabase.from('aircraft')
      .select('id, tail_number, make, model')
      .eq('is_archived', false)
      .then(({ data }) => setAircraft(data ?? []))

    supabase.from('queries')
      .select('id, question, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setPreviousQueries(data ?? []))

    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.role) setUserRole(d.role as OrgRole) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleAsk = useCallback(async (questionText?: string) => {
    const q = questionText ?? question.trim()
    if (!q || isLoading) return

    setQuestion('')
    setIsLoading(true)

    const userMsg: Message = {
      id: createMessageId(),
      role: 'user',
      content: q,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const history = messages
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          aircraft_id: selectedAircraftId === 'all' ? undefined : selectedAircraftId,
          conversation_history: history,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessages(prev => [...prev, {
          id: createMessageId(),
          role: 'assistant',
          content: data.error ?? 'An error occurred. Please try again.',
          confidence: 'insufficient_evidence',
          citations: [],
          warningFlags: [],
          followUpQuestions: [],
          timestamp: new Date(),
        }])
        return
      }

      const assistantMsg: Message = {
        id: createMessageId(),
        role: 'assistant',
        content: data.answer,
        confidence: data.confidence,
        citations: data.citations ?? [],
        warningFlags: data.warning_flags ?? [],
        followUpQuestions: data.follow_up_questions ?? [],
        artifacts: data.artifacts ?? [],
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
      setPreviousQueries((prev) => {
        const next = [
          {
            id: data.query_id ?? createMessageId(),
            question: q,
            created_at: new Date().toISOString(),
          },
          ...prev.filter((item) => item.question !== q),
        ]

        return next.slice(0, 20)
      })
    } catch {
      setMessages(prev => [...prev, {
        id: createMessageId(),
        role: 'assistant',
        content: 'Network error. Please check your connection and try again.',
        confidence: 'insufficient_evidence',
        citations: [],
        warningFlags: [],
        followUpQuestions: [],
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [isLoading, messages, question, selectedAircraftId])

  useEffect(() => {
    const queryQuestion = searchParams.get('q')?.trim() ?? ''
    if (!queryQuestion) return
    if (autoAskedQueryRef.current === queryQuestion) return
    if (messages.length > 0 || isLoading) return

    autoAskedQueryRef.current = queryQuestion
    setQuestion(queryQuestion)
    void handleAsk(queryQuestion)
  }, [handleAsk, isLoading, messages.length, searchParams])

  function handleCitationSelect(citation: AnswerCitation) {
    setActiveCitation(citation)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  return (
    <div className="h-full flex">
      {/* ── Mobile citation modal (full-screen on small screens) ─────────────── */}
      {activeCitation && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <span className="text-sm font-semibold">Source Preview</span>
            <button
              onClick={() => setActiveCitation(null)}
              className="p-1 rounded hover:bg-muted transition-colors"
              aria-label="Close citation viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <DocumentViewerBoundary
              resetKey={`${activeCitation.documentId}:${activeCitation.chunkId}:${activeCitation.pageNumber}`}
            >
              <DocumentViewer
                citation={activeCitation}
                documentId={activeCitation.documentId}
                onClose={() => setActiveCitation(null)}
              />
            </DocumentViewerBoundary>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-6 border-b border-border bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-primary" />
              <h1 className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>Ask Your Aircraft</h1>
            </div>
            <Select value={selectedAircraftId} onValueChange={setSelectedAircraftId}>
              <SelectTrigger className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-[13px] w-[220px]" style={{ fontWeight: 500 }}>
                <Plane className="w-4 h-4 text-primary" />
                <SelectValue placeholder="All aircraft" />
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Aircraft</SelectItem>
                {aircraft.map(ac => (
                  <SelectItem key={ac.id} value={ac.id}>
                    <div className="flex items-center gap-2">
                      <Plane className="h-3.5 w-3.5" />
                      <span className="font-mono text-sm">{ac.tail_number}</span>
                      <span className="text-muted-foreground text-xs">{ac.make} {ac.model}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto text-center pt-16">
              <div className="w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-5">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-[20px] text-foreground mb-2" style={{ fontWeight: 700 }}>What would you like to know?</h2>
              <p className="text-[14px] text-muted-foreground mb-8">
                Get source-backed answers from your aircraft records. Every answer includes citations.
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleAsk(prompt)}
                    className="text-left text-[12px] bg-white border border-border rounded-xl px-4 py-3 hover:border-primary/30 hover:bg-primary/3 transition-all"
                    style={{ fontWeight: 500 }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((msg) => (
                <div key={msg.id}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="bg-primary text-white rounded-2xl rounded-br-md px-4 py-3 max-w-md text-[13px]">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl rounded-bl-md border border-border p-5 space-y-4">
                      <div className="text-[13px] text-foreground leading-relaxed">
                        <AnswerBlock
                          answer={msg.content}
                          confidence={msg.confidence ?? 'high'}
                          citations={msg.citations ?? []}
                          warningFlags={msg.warningFlags ?? []}
                          followUpQuestions={msg.followUpQuestions ?? []}
                          onCitationClick={handleCitationSelect}
                          onFollowUp={handleAsk}
                        />
                      </div>
                      {/* Artifact cards */}
                      {(msg.artifacts?.length ?? 0) > 0 && (
                        <div className="space-y-2">
                          {msg.artifacts!.map((artifact, i) => (
                            <ArtifactCard
                              key={i}
                              artifact={artifact}
                              onUse={(url) => router.push(url)}
                            />
                          ))}
                        </div>
                      )}
                      {(msg.citations?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border">
                          <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>Sources:</span>
                          {msg.citations!.map((c, i) => (
                            <button
                              key={c.chunkId}
                              onClick={() => handleCitationSelect(c)}
                              className="inline-flex items-center gap-1 text-[11px] bg-primary/8 text-primary px-2.5 py-1 rounded-full cursor-pointer hover:bg-primary/15 transition-colors"
                              style={{ fontWeight: 500 }}
                            >
                              <BookOpen className="w-3 h-3" />
                              {i + 1}. {c.documentTitle}
                            </button>
                          ))}
                          {msg.confidence && (
                            <span className="text-[11px] bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full" style={{ fontWeight: 600 }}>
                              {msg.confidence === 'high' ? 'High' : msg.confidence === 'medium' ? 'Medium' : 'Low'} confidence
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Working on it…</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-white">
          <div className="max-w-2xl mx-auto flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-muted/30 border border-border rounded-xl px-4 py-3">
              <Input
                ref={inputRef}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your aircraft records..."
                className="bg-transparent text-[13px] outline-none flex-1 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                maxLength={2000}
              />
            </div>
            <button
              onClick={() => handleAsk()}
              disabled={!question.trim() || isLoading}
              className="bg-primary text-white px-4 rounded-xl hover:bg-primary/90 transition-colors"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Right sidebar: mechanic tools + history or source preview */}
      <div className={`hidden lg:block border-l border-border bg-white transition-all duration-200 ${activeCitation ? 'w-[40%]' : 'w-[320px]'}`}>
        {activeCitation ? (
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Source Preview</h3>
              <button
                onClick={() => setActiveCitation(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <DocumentViewerBoundary
                resetKey={`${activeCitation.documentId}:${activeCitation.chunkId}:${activeCitation.pageNumber}`}
              >
                <DocumentViewer
                  citation={activeCitation}
                  documentId={activeCitation.documentId}
                  onClose={() => setActiveCitation(null)}
                />
              </DocumentViewerBoundary>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <MechanicToolsPanel userRole={userRole} aircraft={aircraft} />

            <div>
              <h3 className="text-[13px] text-foreground mb-3" style={{ fontWeight: 600 }}>Query History</h3>
              <div className="space-y-2">
                {previousQueries.map(q => (
                  <button
                    key={q.id}
                    onClick={() => handleAsk(q.question)}
                    className="w-full text-left bg-muted/30 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <div className="text-[12px] text-foreground truncate" style={{ fontWeight: 500 }}>{q.question}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" /> {formatDateTime(q.created_at)}
                    </div>
                  </button>
                ))}
                {previousQueries.length === 0 && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    No recent questions yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
