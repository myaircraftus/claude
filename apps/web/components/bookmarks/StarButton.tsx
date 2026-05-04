'use client'

/**
 * StarButton (Spec 6.6) — toggle a bookmark on any entity detail page.
 *
 * Caller passes (entity_type, entity_id, label, url). On mount, the
 * button checks the current state via /api/bookmarks GET (cached at
 * the component level — caller can pass `initialStarred` to skip the
 * fetch when the parent already has the data).
 */

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  entity_type: string
  entity_id: string
  label: string
  url: string
  initialStarred?: boolean
  className?: string
}

interface Bookmark { entity_type: string; entity_id: string }

export function StarButton({ entity_type, entity_id, label, url, initialStarred, className }: Props) {
  const [starred, setStarred] = useState<boolean>(!!initialStarred)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState<boolean>(initialStarred !== undefined)

  useEffect(() => {
    if (loaded) return
    let cancel = false
    fetch('/api/bookmarks').then((r) => r.json())
      .then((j: { bookmarks?: Bookmark[] }) => {
        if (cancel) return
        setStarred(!!j.bookmarks?.some((b) => b.entity_type === entity_type && b.entity_id === entity_id))
        setLoaded(true)
      })
      .catch(() => !cancel && setLoaded(true))
    return () => { cancel = true }
  }, [loaded, entity_type, entity_id])

  async function toggle() {
    setBusy(true)
    try {
      if (starred) {
        const u = new URLSearchParams({ entity_type, entity_id })
        const res = await fetch(`/api/bookmarks?${u}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setStarred(false)
        toast.success('Unpinned')
      } else {
        const res = await fetch('/api/bookmarks', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entity_type, entity_id, label, url }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setStarred(true)
        toast.success('Pinned')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pin failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      title={starred ? 'Unpin' : 'Pin to favorites'}
      className={cn(
        'inline-flex items-center justify-center rounded-md p-1.5 transition-colors',
        starred ? 'text-amber-500 hover:bg-amber-50' : 'text-muted-foreground hover:bg-muted/40',
        busy && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <Star className={cn('h-4 w-4', starred && 'fill-current')} />
    </button>
  )
}
