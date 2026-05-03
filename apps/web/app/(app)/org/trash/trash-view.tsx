'use client'

/**
 * TrashView (Cross-cutting Concern 4) — fan-out list of soft-deleted
 * rows across every registered entity type. Restore (mechanic+) or
 * Permanent delete (owner+admin only).
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Trash2, Undo, AlertTriangle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface Row { id: string; display: string; deleted_at: string }
interface Group { entity_type: string; label: string; rows: Row[] }

export function TrashView({ canPurge }: { canPurge: boolean }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trash')
      const json = (await res.json()) as { groups?: Group[]; total?: number; error?: string }
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); return }
      setGroups(json.groups ?? [])
      setTotal(json.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function action(entity_type: string, id: string, act: 'restore' | 'purge') {
    if (act === 'purge' && !window.confirm('Permanently delete this row? This cannot be undone.')) return
    setBusy(`${entity_type}:${id}:${act}`)
    try {
      const res = await fetch('/api/trash', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type, id, action: act }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success(act === 'restore' ? 'Restored' : 'Permanently deleted')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Trash</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Soft-deleted rows from across the org. Restore brings them back; permanent delete is final. Trash auto-purges 30 days after deletion.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : total === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-border bg-white">
          <Trash2 className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Trash is empty</p>
          <p className="text-[11.5px] text-muted-foreground mt-1">Deleted rows will appear here for 30 days before purge.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.entity_type} className="rounded-2xl border border-border bg-white overflow-hidden">
              <div className="px-4 py-2 bg-muted/15 border-b border-border flex items-center justify-between">
                <h3 className="text-[13px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>{g.label}</h3>
                <span className="text-[10.5px] text-muted-foreground">{g.rows.length} row{g.rows.length === 1 ? '' : 's'}</span>
              </div>
              <table className="w-full text-[12.5px]">
                <tbody className="divide-y divide-border">
                  {g.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/15">
                      <td className="px-3 py-1.5">{r.display}</td>
                      <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                        <Clock className="inline h-3 w-3 mr-1" />
                        {new Date(r.deleted_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            variant="outline" size="sm"
                            onClick={() => void action(g.entity_type, r.id, 'restore')}
                            disabled={!!busy}
                          >
                            <Undo className="h-3 w-3 mr-1" /> Restore
                          </Button>
                          {canPurge && (
                            <Button
                              variant="outline" size="sm"
                              onClick={() => void action(g.entity_type, r.id, 'purge')}
                              disabled={!!busy}
                              className="text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
