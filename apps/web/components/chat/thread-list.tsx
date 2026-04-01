'use client'

import { useState } from 'react'
import { MessageSquare, Plus, Pin, Plane, Search, MoreHorizontal, Archive, Pencil, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface Thread {
  id: string
  title: string | null
  thread_type: string
  aircraft_id: string | null
  is_pinned: boolean
  last_message_at: string
  message_count: number
  aircraft?: { tail_number: string; make: string; model: string } | null
}

interface Props {
  threads: Thread[]
  currentThreadId: string | null
  aircraft: Array<{ id: string; tail_number: string; make: string; model: string }>
  selectedAircraftId: string | null
  onSelectThread: (id: string) => void
  onNewChat: () => void
  onSelectAircraft: (id: string | null) => void
  onRefresh: () => void
}

export function ThreadList({
  threads, currentThreadId, aircraft, selectedAircraftId,
  onSelectThread, onNewChat, onSelectAircraft, onRefresh
}: Props) {
  const [search, setSearch] = useState('')
  const [showAircraftFilter, setShowAircraftFilter] = useState(false)

  const filtered = threads.filter(t => {
    if (search && !((t.title ?? 'New Chat').toLowerCase().includes(search.toLowerCase()))) return false
    return true
  })

  const pinned = filtered.filter(t => t.is_pinned)
  const recent = filtered.filter(t => !t.is_pinned)

  const renameThread = async (id: string, newTitle: string) => {
    await fetch(`/api/chat/threads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    })
    onRefresh()
  }

  const archiveThread = async (id: string) => {
    await fetch(`/api/chat/threads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: true }),
    })
    onRefresh()
  }

  const pinThread = async (id: string, pin: boolean) => {
    await fetch(`/api/chat/threads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: pin }),
    })
    onRefresh()
  }

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col border-r border-border bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-brand-500" />
            <span className="font-semibold text-sm text-foreground">Conversations</span>
          </div>
          <button
            onClick={onNewChat}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Aircraft filter */}
        {aircraft.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowAircraftFilter(!showAircraftFilter)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plane className="h-3 w-3" />
              <span>{selectedAircraftId ? aircraft.find(a => a.id === selectedAircraftId)?.tail_number ?? 'Filter' : 'All aircraft'}</span>
              <ChevronDown className="h-3 w-3 ml-auto" />
            </button>
            {showAircraftFilter && (
              <div className="mt-1 space-y-0.5">
                <button
                  onClick={() => { onSelectAircraft(null); setShowAircraftFilter(false) }}
                  className={cn('w-full text-left px-2 py-1 text-xs rounded', !selectedAircraftId ? 'bg-brand-50 text-brand-700' : 'hover:bg-accent')}
                >
                  All aircraft
                </button>
                {aircraft.map(a => (
                  <button
                    key={a.id}
                    onClick={() => { onSelectAircraft(a.id); setShowAircraftFilter(false) }}
                    className={cn('w-full text-left px-2 py-1 text-xs rounded font-mono', selectedAircraftId === a.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-accent')}
                  >
                    {a.tail_number} — {a.make} {a.model}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No conversations yet</p>
            <button onClick={onNewChat} className="mt-2 text-xs text-brand-500 hover:underline">
              Start a new chat
            </button>
          </div>
        )}

        {/* Pinned */}
        {pinned.length > 0 && (
          <>
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Pinned</p>
            {pinned.map(thread => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === currentThreadId}
                onSelect={() => onSelectThread(thread.id)}
                onRename={(title) => renameThread(thread.id, title)}
                onArchive={() => archiveThread(thread.id)}
                onTogglePin={() => pinThread(thread.id, !thread.is_pinned)}
              />
            ))}
            {recent.length > 0 && <div className="my-1 border-t border-border" />}
          </>
        )}

        {/* Recent */}
        {recent.length > 0 && (
          <>
            {pinned.length > 0 && <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent</p>}
            {recent.map(thread => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === currentThreadId}
                onSelect={() => onSelectThread(thread.id)}
                onRename={(title) => renameThread(thread.id, title)}
                onArchive={() => archiveThread(thread.id)}
                onTogglePin={() => pinThread(thread.id, !thread.is_pinned)}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          {threads.length} conversation{threads.length !== 1 ? 's' : ''}
        </p>
      </div>
    </aside>
  )
}

function ThreadItem({ thread, isActive, onSelect, onRename, onArchive, onTogglePin }: {
  thread: Thread
  isActive: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onArchive: () => void
  onTogglePin: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(thread.title ?? '')

  return (
    <div
      className={cn(
        'group relative flex items-start gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors',
        isActive ? 'bg-brand-50 text-brand-700' : 'hover:bg-accent'
      )}
      onClick={onSelect}
    >
      <MessageSquare className={cn('h-3.5 w-3.5 mt-0.5 flex-shrink-0', isActive ? 'text-brand-500' : 'text-muted-foreground')} />
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => { setEditing(false); if (editValue.trim()) onRename(editValue) }}
            onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); if (editValue.trim()) onRename(editValue) } if (e.key === 'Escape') setEditing(false) }}
            onClick={e => e.stopPropagation()}
            className="w-full text-xs bg-transparent border-b border-brand-400 outline-none"
          />
        ) : (
          <p className={cn('text-xs font-medium truncate', isActive ? 'text-brand-700' : 'text-foreground')}>
            {thread.title ?? 'New conversation'}
          </p>
        )}
        <div className="flex items-center gap-1 mt-0.5">
          {thread.aircraft && (
            <span className="font-mono text-[10px] text-muted-foreground">{thread.aircraft.tail_number}</span>
          )}
          {thread.aircraft && <span className="text-[10px] text-muted-foreground">·</span>}
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(thread.last_message_at), 'MMM d')}
          </span>
          {thread.is_pinned && <Pin className="h-2.5 w-2.5 text-amber-500" />}
        </div>
      </div>

      {/* Context menu button */}
      <div className="opacity-0 group-hover:opacity-100 relative">
        <button
          onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
          className="p-0.5 rounded hover:bg-muted"
        >
          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        {showMenu && (
          <div
            className="absolute right-0 top-6 z-50 w-40 rounded-md border border-border bg-popover shadow-lg py-1"
            onMouseLeave={() => setShowMenu(false)}
          >
            <button
              onClick={e => { e.stopPropagation(); setEditing(true); setShowMenu(false) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Pencil className="h-3 w-3" /> Rename
            </button>
            <button
              onClick={e => { e.stopPropagation(); onTogglePin(); setShowMenu(false) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Pin className="h-3 w-3" /> {thread.is_pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={e => { e.stopPropagation(); onArchive(); setShowMenu(false) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-destructive"
            >
              <Archive className="h-3 w-3" /> Archive
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
