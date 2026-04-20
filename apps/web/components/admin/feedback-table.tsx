'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type FeedbackRow = {
  id: string
  message: string
  page?: string | null
  status: string
  created_at: string
  organizations?: { name?: string | null } | null
  user_profiles?: { full_name?: string | null; email?: string | null } | null
}

const STATUS_OPTIONS = ['open', 'triaged', 'closed']

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function statusBadge(status: string) {
  switch (status) {
    case 'triaged':
      return <Badge variant="warning">Triaged</Badge>
    case 'closed':
      return <Badge variant="success">Closed</Badge>
    default:
      return <Badge variant="secondary">Open</Badge>
  }
}

export function FeedbackTable({ initialFeedback }: { initialFeedback: FeedbackRow[] }) {
  const [rows, setRows] = useState(initialFeedback)
  const [updating, setUpdating] = useState<string | null>(null)

  async function updateStatus(id: string, status: string) {
    setUpdating(id)
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to update status')
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)))
      toast.success('Feedback status updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setUpdating(null)
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="text-left px-4 py-3">Organization</th>
            <th className="text-left px-4 py-3">User</th>
            <th className="text-left px-4 py-3">Message</th>
            <th className="text-left px-4 py-3">Page</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Created</th>
            <th className="text-right px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium">
                {row.organizations?.name ?? '—'}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.user_profiles?.full_name || row.user_profiles?.email || '—'}
              </td>
              <td className="px-4 py-3 max-w-xs">
                <p className="truncate" title={row.message}>{row.message}</p>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.page ?? '—'}
              </td>
              <td className="px-4 py-3">
                {statusBadge(row.status)}
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                {formatDate(row.created_at)}
              </td>
              <td className="px-4 py-3 text-right">
                <select
                  value={row.status}
                  onChange={(e) => updateStatus(row.id, e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                  disabled={updating === row.id}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                {updating === row.id && (
                  <Button variant="ghost" size="sm" className="ml-2" disabled>
                    Saving…
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
