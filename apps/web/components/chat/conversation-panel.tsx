'use client'

import { useEffect, useRef, useState } from 'react'
import { Plane, Send, Loader2, Paperclip, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  artifact_type?: string | null
  isStreaming?: boolean
  created_at: string
}

interface Props {
  messages: Message[]
  isLoading: boolean
  selectedAircraft: { id: string; tail_number: string; make: string; model: string; total_time_hours?: number } | null
  onSendMessage: (message: string) => void
  onNewChat: () => void
  currentArtifact: any
  artifactVisible: boolean
}

const SUGGESTED_PROMPTS = [
  'Prepare a logbook entry',
  'Generate a work order',
  'Find a part number',
  'Create an invoice',
  'Check reminders',
  'Show annual inspection requirements',
]

export function ConversationPanel({ messages, isLoading, selectedAircraft, onSendMessage, onNewChat, currentArtifact, artifactVisible }: Props) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input.trim())
      setInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Aircraft context bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card/80">
        {selectedAircraft ? (
          <>
            <div className="w-7 h-7 rounded-md bg-brand-50 flex items-center justify-center flex-shrink-0">
              <Plane className="h-4 w-4 text-brand-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm text-foreground">{selectedAircraft.tail_number}</span>
                <span className="text-sm text-muted-foreground">{selectedAircraft.make} {selectedAircraft.model}</span>
                {selectedAircraft.total_time_hours && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {selectedAircraft.total_time_hours.toFixed(1)} TT
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Plane className="h-4 w-4" />
            <span className="text-sm">No aircraft selected</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {currentArtifact && artifactVisible && (
            <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium">
              {currentArtifact.type?.replace('_', ' ')} open
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState aircraft={selectedAircraft} onPrompt={(p) => { onSendMessage(p) }} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isLoading && messages[messages.length - 1]?.isStreaming === false && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-background p-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 rounded-xl border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-brand-500/20 focus-within:border-brand-400 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedAircraft
                ? `Ask anything about ${selectedAircraft.tail_number}, or type a command...`
                : 'Ask anything or type a command...'
              }
              rows={1}
              className="flex-1 resize-none bg-transparent px-4 py-3 text-sm focus:outline-none max-h-32 min-h-[44px]"
              style={{ height: 'auto' }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 128) + 'px'
              }}
            />
            <div className="flex items-center gap-1 p-2">
              <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  input.trim() && !isLoading
                    ? 'bg-brand-500 text-white hover:bg-brand-600'
                    : 'text-muted-foreground'
                )}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Press Enter to send · Shift+Enter for new line · AI may make mistakes — always verify critical information
          </p>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold mt-0.5',
        isUser ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground'
      )}>
        {isUser ? 'U' : <Sparkles className="h-3.5 w-3.5" />}
      </div>

      <div className={cn('max-w-[80%] space-y-1', isUser && 'items-end flex flex-col')}>
        <div className={cn(
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-brand-500 text-white rounded-tr-sm'
            : 'bg-card border border-border text-foreground rounded-tl-sm'
        )}>
          {message.isStreaming && !message.content ? (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>
        {message.artifact_type && (
          <span className="text-[10px] text-muted-foreground px-1">
            ↳ {message.artifact_type.replace('_', ' ')} generated
          </span>
        )}
        <span className="text-[10px] text-muted-foreground px-1">
          {format(new Date(message.created_at), 'h:mm a')}
        </span>
      </div>
    </div>
  )
}

function EmptyState({ aircraft, onPrompt }: { aircraft: any, onPrompt: (p: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
        <Sparkles className="h-7 w-7 text-brand-500" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        {aircraft ? `Working on ${aircraft.tail_number}` : 'myaircraft.us'}
      </h2>
      <p className="text-muted-foreground text-sm mb-8 max-w-md">
        {aircraft
          ? `Ask anything about ${aircraft.make} ${aircraft.model} or start a workflow below.`
          : 'Your aviation maintenance AI. Select an aircraft and start typing.'}
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
        {SUGGESTED_PROMPTS.map(prompt => (
          <button
            key={prompt}
            onClick={() => onPrompt(prompt)}
            className="text-left px-4 py-3 rounded-xl border border-border hover:border-brand-300 hover:bg-brand-50 transition-colors text-sm text-foreground"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}
