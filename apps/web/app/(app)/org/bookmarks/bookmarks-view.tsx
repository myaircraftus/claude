'use client'

import { useEffect, useState } from 'react'
import { Loader2, Star, Trash2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface Bookmark {
  id: string
  entity_type: string
  entity_id: string
  label: string
  url: string
  position: number
  created_at: string
}

export function BookmarksView() {
  const [items, setItems] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/bookmarks').then((r) => r.json())
      .then((j: { bookmarks?: Bookmark[] }) => setItems(j.bookmarks ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function unstar(b: Bookmark) {
    try {
      const u = new URLSearchParams({ entity_type: b.entity_type, entity_id: b.entity_id })
      const res = await fetch(`/api/bookmarks?${u}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setItems((cur) => cur.filter((x) => x.id !== b.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unstar failed')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Pinned</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Your starred items across the org.</p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-white p-8 text-center text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
          <Star className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Nothing pinned yet</p>
          <p className="text-[11.5px] text-muted-foreground mt-1">
            Click the <Star className="inline h-3 w-3 mx-0.5" /> on any aircraft / WO / report to pin it here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <ul className="divide-y divide-border">
            {items.map((b) => (
              <li key={b.id} className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/15">
                <div className="min-w-0">
                  <Link href={b.url} className="text-[13px] text-foreground hover:underline inline-flex items-center gap-1" style={{ fontWeight: 600 }}>
                    {b.label} <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                  <div className="text-[10.5px] text-muted-foreground capitalize">{b.entity_type.replace(/_/g, ' ')}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => void unstar(b)} className="text-rose-700 hover:bg-rose-50">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
