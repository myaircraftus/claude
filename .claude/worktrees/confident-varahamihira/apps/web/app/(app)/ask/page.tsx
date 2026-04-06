'use client'

import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Send, Loader2, Plane, Clock, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AnswerBlock } from '@/components/ask/answer-block'
import { CitationCard } from '@/components/ask/citation-card'
import { DocumentViewer } from '@/components/ask/document-viewer'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { formatDateTime } from '@/lib/utils'
import type { Aircraft, AnswerCitation, QueryConfidence } from '@/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  confidence?: QueryConfidence
  citations?: AnswerCitation[]
  warningFlags?: string[]
  followUpQuestions?: string[]
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
  'What oil is approved for this engine?',
  'Show me all ADs applicable to this aircraft',
  'What is the total time on the airframe?',
  'When was the last engine oil change?',
  'What are the VFR fuel reserves per the POH?',
]

export default function AskPage() {
  const searchParams = useSearchParams()
  const [aircraft, setAircraft] = useState<AircraftOption[]>([])
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>(
    searchParams.get('aircraft') ?? 'all'
  )
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeCitation, setActiveCitation] = useState<AnswerCitation | null>(null)
  const [activeDocPath, setActiveDocPath] = useState<string | null>(null)
  const [previousQueries, setPreviousQueries] = useState<Array<{ id: string; question: string; created_at: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleAsk(questionText?: string) {
    const q = questionText ?? question.trim()
    if (!q || isLoading) return

    setQuestion('')
    setIsLoading(true)

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: q,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const history = messages
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/query', {
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
          id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        confidence: data.confidence,
        citations: data.citations ?? [],
        warningFlags: data.warning_flags ?? [],
        followUpQuestions: data.follow_up_questions ?? [],
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
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
      textareaRef.current?.focus()
    }
  }

  function handleCitationSelect(citation: AnswerCitation) {
    setActiveCitation(citation)
    // Fetch document file path
    const supabase = createBrowserSupabase()
    supabase.from('documents')
      .select('file_path')
      .eq('id', citation.documentId)
      .single()
      .then(({ data }) => {
        if (data) setActiveDocPath(data.file_path)
      })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant')

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT PANE — Aircraft selector + history */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-border">
        {/* Aircraft selector */}
        <div className="p-4 border-b border-border space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Aircraft</h2>
          <Select value={selectedAircraftId} onValueChange={setSelectedAircraftId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All aircraft" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All aircraft</SelectItem>
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

        {/* Suggested prompts (when no messages) */}
        {messages.length === 0 && (
          <div className="p-4 border-b border-border space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Sparkles className="h-3 w-3 inline mr-1" />
              Suggested
            </h3>
            {SUGGESTED_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => handleAsk(prompt)}
                className="w-full text-left text-xs text-muted-foreground p-2 rounded-md hover:bg-accent hover:text-foreground transition-colors border border-transparent hover:border-border"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Recent queries */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-1">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              <Clock className="h-3 w-3 inline mr-1" />
              Recent
            </h3>
            {previousQueries.map(q => (
              <button
                key={q.id}
                onClick={() => handleAsk(q.question)}
                className="w-full text-left p-2 rounded-md hover:bg-accent transition-colors"
              >
                <p className="text-xs text-foreground line-clamp-2">{q.question}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(q.created_at)}</p>
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Question input */}
        <div className="p-4 border-t border-border space-y-2">
          <Textarea
            ref={textareaRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your aircraft records…"
            className="min-h-[80px] resize-none text-sm"
            maxLength={2000}
          />
          <Button
            onClick={() => handleAsk()}
            disabled={!question.trim() || isLoading}
            className="w-full"
            size="sm"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isLoading ? 'Searching records…' : 'Ask'}
          </Button>
        </div>
      </div>

      {/* CENTER PANE — Conversation + citations */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
        {/* Messages */}
        <ScrollArea className="flex-1 p-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-16">
              <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M28 16L4 8L10 16L4 24L28 16Z" fill="#3b82f6" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">Ask your aircraft anything</h2>
                <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                  Get citation-backed answers from your own records. Every answer references the exact document, page, and section.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 max-w-2xl">
              {messages.map(msg => (
                <div key={msg.id}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-lg bg-brand-500 text-white rounded-2xl rounded-tr-sm px-4 py-3">
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <AnswerBlock
                        answer={msg.content}
                        confidence={msg.confidence!}
                        citations={msg.citations ?? []}
                        warningFlags={msg.warningFlags ?? []}
                        followUpQuestions={msg.followUpQuestions ?? []}
                        onCitationClick={handleCitationSelect}
                        onFollowUp={handleAsk}
                      />
                      {/* Citation cards */}
                      {(msg.citations?.length ?? 0) > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Sources ({msg.citations!.length})
                          </p>
                          {msg.citations!.map((c, i) => (
                            <CitationCard
                              key={c.chunkId}
                              citation={c}
                              index={i + 1}
                              isActive={activeCitation?.chunkId === c.chunkId}
                              onSelect={handleCitationSelect}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Searching your records…</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
      </div>

      {/* RIGHT PANE — Document viewer */}
      <div className="w-96 flex-shrink-0 flex flex-col">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">Source Preview</h3>
        </div>
        <div className="flex-1 overflow-hidden">
          <DocumentViewer
            citation={activeCitation}
            documentId={activeCitation?.documentId}
            filePath={activeDocPath ?? undefined}
            onClose={() => { setActiveCitation(null); setActiveDocPath(null) }}
          />
        </div>
      </div>
    </div>
  )
}
