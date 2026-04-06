'use client'

import { useState, useEffect, useCallback } from 'react'
import { ThreadList } from './thread-list'
import { ConversationPanel } from './conversation-panel'
import { ArtifactPanel } from './artifact-panel'

interface Props {
  orgId: string
  userId: string
  aircraft: Array<{ id: string; tail_number: string; make: string; model: string; year?: number; total_time_hours?: number }>
  userProfile: { fullName: string; jobTitle: string }
  userRole: string
}

export type ArtifactData = {
  type: 'logbook_entry' | 'work_order' | 'invoice' | 'parts_search' | 'customer_card' | null
  data: any
  missingFields?: string[]
  complianceNotes?: string[]
}

export function ChatShell({ orgId, userId, aircraft, userProfile, userRole }: Props) {
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(
    aircraft[0]?.id ?? null
  )
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
  const [currentArtifact, setCurrentArtifact] = useState<ArtifactData | null>(null)
  const [threads, setThreads] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [artifactVisible, setArtifactVisible] = useState(false)

  // Load threads
  const loadThreads = useCallback(async () => {
    const res = await fetch('/api/chat/threads')
    if (res.ok) {
      const data = await res.json()
      setThreads(data.threads ?? [])
    }
  }, [])

  useEffect(() => { loadThreads() }, [loadThreads])

  // Load messages for thread
  const loadMessages = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/chat/threads/${threadId}`)
    if (res.ok) {
      const data = await res.json()
      setMessages(data.messages ?? [])
      // Restore last artifact from last assistant message
      const lastAssistant = [...(data.messages ?? [])].reverse().find((m: any) => m.role === 'assistant' && m.artifact_type)
      if (lastAssistant) {
        setCurrentArtifact({
          type: lastAssistant.artifact_type,
          data: lastAssistant.artifact_data,
        })
        setArtifactVisible(true)
      }
    }
  }, [])

  // Select thread
  const handleSelectThread = useCallback(async (threadId: string) => {
    setCurrentThreadId(threadId)
    setMessages([])
    setCurrentArtifact(null)
    await loadMessages(threadId)
  }, [loadMessages])

  // Create new thread
  const handleNewChat = useCallback(async (aircraftId?: string) => {
    const res = await fetch('/api/chat/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aircraft_id: aircraftId ?? selectedAircraftId,
        thread_type: 'general',
      })
    })
    if (res.ok) {
      const data = await res.json()
      setCurrentThreadId(data.thread.id)
      setMessages([])
      setCurrentArtifact(null)
      setArtifactVisible(false)
      await loadThreads()
    }
  }, [selectedAircraftId, loadThreads])

  // Send message
  const handleSendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return

    // Ensure we have a thread
    let threadId = currentThreadId
    if (!threadId) {
      const res = await fetch('/api/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: selectedAircraftId,
          title: message.slice(0, 60),
          thread_type: 'general',
        })
      })
      if (res.ok) {
        const data = await res.json()
        threadId = data.thread.id
        setCurrentThreadId(threadId)
        await loadThreads()
      }
    }

    // Add user message optimistically
    const userMsg = { id: Date.now().toString(), role: 'user', content: message, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])

    // Add placeholder assistant message
    const assistantMsgId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', created_at: new Date().toISOString(), isStreaming: true }])

    setIsLoading(true)
    let fullContent = ''

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          threadId,
          aircraftId: selectedAircraftId,
          messageHistory: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        })
      })

      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.trim())

        for (const line of lines) {
          try {
            const chunk = JSON.parse(line)
            if (chunk.type === 'intent') {
              // Pre-show artifact panel if an artifact is coming
              if (chunk.artifact_type) {
                setArtifactVisible(true)
              }
            } else if (chunk.type === 'delta') {
              fullContent += chunk.content
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: fullContent } : m
              ))
            } else if (chunk.type === 'artifact') {
              setCurrentArtifact({
                type: chunk.artifact_type,
                data: chunk.data,
                missingFields: chunk.missing_fields,
                complianceNotes: chunk.compliance_notes,
              })
              setArtifactVisible(true)
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? {
                  ...m,
                  isStreaming: false,
                  artifact_type: chunk.artifact_type,
                  artifact_data: chunk.data,
                } : m
              ))
            } else if (chunk.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, isStreaming: false } : m
              ))
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: 'An error occurred. Please try again.', isStreaming: false } : m
      ))
    } finally {
      setIsLoading(false)
    }
  }, [currentThreadId, selectedAircraftId, messages, isLoading, loadThreads])

  const selectedAircraft = aircraft.find(a => a.id === selectedAircraftId) ?? null

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left: Thread List */}
      <ThreadList
        threads={threads}
        currentThreadId={currentThreadId}
        aircraft={aircraft}
        selectedAircraftId={selectedAircraftId}
        onSelectThread={handleSelectThread}
        onNewChat={() => handleNewChat()}
        onSelectAircraft={setSelectedAircraftId}
        onRefresh={loadThreads}
      />

      {/* Center: Conversation */}
      <ConversationPanel
        messages={messages}
        isLoading={isLoading}
        selectedAircraft={selectedAircraft}
        onSendMessage={handleSendMessage}
        onNewChat={handleNewChat}
        currentArtifact={currentArtifact}
        artifactVisible={artifactVisible}
      />

      {/* Right: Artifact Panel */}
      <ArtifactPanel
        artifact={currentArtifact}
        visible={artifactVisible}
        onClose={() => setArtifactVisible(false)}
        selectedAircraft={selectedAircraft}
        orgId={orgId}
        userId={userId}
      />
    </div>
  )
}
