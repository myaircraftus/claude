'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  MessageSquare, BookmarkIcon, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp,
  Clock, Filter, ChevronLeft, ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ConfidenceBadge } from '@/components/ask/confidence-badge'
import { CitationCard } from '@/components/ask/citation-card'
import { formatDateTime } from '@/lib/utils'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import type { AnswerCitation, QueryConfidence } from '@/types'

interface HistoryQuery {
  id: string
  question: string
  answer?: string
  confidence: QueryConfidence
  confidence_score?: number
  chunks_retrieved?: number
  chunks_used?: number
  latency_ms?: number
  is_bookmarked: boolean
  user_feedback?: string
  warning_flags?: string[]
  follow_up_questions?: string[]
  created_at: string
  aircraft_id?: string
  aircraft?: { tail_number: string; make: string; model: string } | null
}

interface Props {
  queries: HistoryQuery[]
  aircraft: Array<{ id: string; tail_number: string; make: string; model: string }>
  totalPages: number
  currentPage: number
  selectedQueryId?: string
}

export function HistoryClient({ queries, aircraft, totalPages, currentPage, selectedQueryId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [expandedId, setExpandedId] = useState<string | null>(selectedQueryId ?? null)
  const [bookmarked, setBookmarked] = useState<Set<string>>(
    new Set(queries.filter(q => q.is_bookmarked).map(q => q.id))
  )
  const [citations, setCitations] = useState<Record<string, AnswerCitation[]>>({})

  async function toggleBookmark(queryId: string) {
    const supabase = createBrowserSupabase()
    const isNowBookmarked = !bookmarked.has(queryId)
    setBookmarked(prev => {
      const next = new Set(prev)
      if (isNowBookmarked) next.add(queryId)
      else next.delete(queryId)
      return next
    })
    await supabase
      .from('queries')
      .update({ is_bookmarked: isNowBookmarked })
      .eq('id', queryId)
  }

  async function submitFeedback(queryId: string, feedback: 'helpful' | 'not_helpful') {
    const supabase = createBrowserSupabase()
    await supabase.from('queries').update({ user_feedback: feedback }).eq('id', queryId)
  }

  async function expandQuery(queryId: string) {
    if (expandedId === queryId) {
      setExpandedId(null)
      return
    }
    setExpandedId(queryId)
    if (!citations[queryId]) {
      const supabase = createBrowserSupabase()
      const { data } = await supabase
        .from('citations')
        .select(`
          id, page_number, section_title, quoted_snippet, relevance_score, citation_index,
          document_id,
          chunk_id,
          documents:document_id(title, doc_type)
        `)
        .eq('query_id', queryId)
        .order('citation_index')
      if (data) {
        const mapped: AnswerCitation[] = data.map((c: any) => ({
          chunkId: c.chunk_id ?? c.id,
          documentId: c.document_id,
          documentTitle: c.documents?.title ?? 'Unknown document',
          docType: c.documents?.doc_type ?? 'miscellaneous',
          pageNumber: c.page_number,
          sectionTitle: c.section_title,
          snippet: c.quoted_snippet,
          relevanceScore: c.relevance_score ?? 0,
        }))
        setCitations(prev => ({ ...prev, [queryId]: mapped }))
      }
    }
  }

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all' || value === '') params.delete(key)
    else params.set(key, value)
    params.delete('page')
    router.push(`/history?${params.toString()}`)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filter:
          </div>
          <Select
            value={searchParams.get('aircraft') ?? 'all'}
            onValueChange={v => updateFilter('aircraft', v)}
          >
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="All aircraft" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All aircraft</SelectItem>
              {aircraft.map(ac => (
                <SelectItem key={ac.id} value={ac.id}>
                  {ac.tail_number} — {ac.make} {ac.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={searchParams.get('confidence') ?? 'all'}
            onValueChange={v => updateFilter('confidence', v)}
          >
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="All confidence" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All confidence</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="insufficient_evidence">Insufficient evidence</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground ml-auto">
            {queries.length} queries
          </span>
        </div>

        {/* Query list */}
        {queries.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground">No queries yet</p>
            <Button asChild size="sm">
              <Link href="/ask">Ask your first question</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {queries.map(q => (
              <div key={q.id} className="border border-border rounded-lg overflow-hidden">
                {/* Query header row */}
                <button
                  className="w-full flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => expandQuery(q.id)}
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{q.question}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <ConfidenceBadge confidence={q.confidence} />
                      {q.aircraft && (
                        <Badge variant="outline" className="text-xs">
                          {q.aircraft.tail_number}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(q.created_at)}
                      </span>
                      {q.chunks_used !== undefined && q.chunks_used !== null && (
                        <span className="text-xs text-muted-foreground">
                          {q.chunks_used} source{q.chunks_used !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); toggleBookmark(q.id) }}
                      className={`p-1 rounded hover:bg-accent transition-colors ${bookmarked.has(q.id) ? 'text-brand-500' : 'text-muted-foreground'}`}
                    >
                      <BookmarkIcon className="h-4 w-4" />
                    </button>
                    {expandedId === q.id
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                </button>

                {/* Expanded answer */}
                {expandedId === q.id && q.answer && (
                  <div className="border-t border-border p-4 space-y-4 bg-muted/20">
                    <div className="prose prose-sm max-w-none text-foreground">
                      <p>{q.answer}</p>
                    </div>

                    {/* Citations */}
                    {(citations[q.id]?.length ?? 0) > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Sources
                        </p>
                        <div className="grid gap-2">
                          {citations[q.id].map((c, i) => (
                            <CitationCard
                              key={c.chunkId}
                              citation={c}
                              index={i + 1}
                              isActive={false}
                              onSelect={() => {}}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Feedback */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground">Was this helpful?</span>
                      <button
                        onClick={() => submitFeedback(q.id, 'helpful')}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Yes
                      </button>
                      <button
                        onClick={() => submitFeedback(q.id, 'not_helpful')}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        No
                      </button>
                      <Link
                        href={`/ask?replay=${q.id}`}
                        className="ml-auto text-xs text-brand-600 hover:text-brand-700"
                      >
                        Ask again →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              asChild={currentPage > 1}
            >
              {currentPage > 1 ? (
                <Link href={`/history?${new URLSearchParams({ ...Object.fromEntries(searchParams), page: String(currentPage - 1) })}`}>
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Link>
              ) : (
                <span>
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </span>
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              asChild={currentPage < totalPages}
            >
              {currentPage < totalPages ? (
                <Link href={`/history?${new URLSearchParams({ ...Object.fromEntries(searchParams), page: String(currentPage + 1) })}`}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
