'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

type SupportRow = {
  id: string
  type: string
  severity: string
  status: string
  subject?: string | null
  description?: string | null
  created_at: string
  organizations?: { name?: string | null } | null
  user_profiles?: { full_name?: string | null; email?: string | null } | null
}

const STATUS_OPTIONS = ['open', 'triaged', 'in_progress', 'resolved', 'closed']

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function severityBadge(severity: string) {
  switch (severity) {
    case 'critical':
      return <Badge variant="destructive">Critical</Badge>
    case 'high':
      return <Badge variant="warning">High</Badge>
    case 'low':
      return <Badge variant="secondary">Low</Badge>
    default:
      return <Badge variant="outline">Medium</Badge>
  }
}

export function SupportTable({ initialTickets }: { initialTickets: SupportRow[] }) {
  const [rows, setRows] = useState(initialTickets)
  const [updating, setUpdating] = useState<string | null>(null)

  async function updateStatus(id: string, status: string) {
    setUpdating(id)
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to update status')
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)))
      toast.success('Support ticket updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update ticket')
    } finally {
      setUpdating(null)
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No support tickets yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="text-left px-4 py-3">Organization</th>
            <th className="text-left px-4 py-3">User</th>
            <th className="text-left px-4 py-3">Subject</th>
            <th className="text-left px-4 py-3">Type</th>
            <th className="text-left px-4 py-3">Severity</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Created</th>
            <th className="text-right px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium">{row.organizations?.name ?? '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.user_profiles?.full_name || row.user_profiles?.email || '—'}
              </td>
              <td className="px-4 py-3 max-w-xs">
                <p className="truncate" title={row.description ?? ''}>{row.subject ?? '—'}</p>
              </td>
              <td className="px-4 py-3 text-muted-foreground capitalize">{row.type?.replace(/_/g, ' ')}</td>
              <td className="px-4 py-3">{severityBadge(row.severity)}</td>
              <td className="px-4 py-3">
                <Badge variant="secondary" className="capitalize">
                  {row.status?.replace(/_/g, ' ')}
                </Badge>
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
