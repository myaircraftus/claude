'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { AlertTriangle, XCircle, Info, CheckCircle, Eye } from 'lucide-react'
import type { RecordFinding } from '@/types/intelligence'

interface FindingCardProps {
  finding: RecordFinding
  onResolve: (findingId: string, note: string) => Promise<void>
  onAcknowledge: (findingId: string, note: string) => Promise<void>
}

const SEVERITY_CONFIG = {
  critical: {
    border: 'border-l-red-500',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-800',
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    label: 'Critical',
  },
  warning: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-800',
    icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    label: 'Warning',
  },
  info: {
    border: 'border-l-blue-400',
    bg: 'bg-blue-50',
    badge: 'bg-blue-100 text-blue-800',
    icon: <Info className="h-4 w-4 text-blue-500" />,
    label: 'Info',
  },
}

export function FindingCard({ finding, onResolve, onAcknowledge }: FindingCardProps) {
  const [resolveOpen, setResolveOpen] = useState(false)
  const [acknowledgeOpen, setAcknowledgeOpen] = useState(false)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const cfg = SEVERITY_CONFIG[finding.severity]

  async function handleResolve() {
    setLoading(true)
    try {
      await onResolve(finding.id, note)
      setResolveOpen(false)
      setNote('')
    } finally {
      setLoading(false)
    }
  }

  async function handleAcknowledge() {
    setLoading(true)
    try {
      await onAcknowledge(finding.id, note)
      setAcknowledgeOpen(false)
      setNote('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className={`border-l-4 ${cfg.border} ${cfg.bg} rounded-r-md p-4 mb-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {cfg.icon}
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cfg.badge}`}>
              {cfg.label}
            </span>
            <span className="font-semibold text-sm text-gray-900 truncate">{finding.title}</span>
          </div>
          {!finding.is_resolved && !finding.is_acknowledged && (
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => { setNote(''); setAcknowledgeOpen(true) }}
              >
                <Eye className="h-3 w-3 mr-1" /> Acknowledge
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => { setNote(''); setResolveOpen(true) }}
              >
                <CheckCircle className="h-3 w-3 mr-1" /> Resolve
              </Button>
            </div>
          )}
          {finding.is_acknowledged && !finding.is_resolved && (
            <Badge variant="outline" className="text-xs shrink-0">Acknowledged</Badge>
          )}
        </div>

        <p className="text-sm text-gray-700 mt-2">{finding.description}</p>

        {finding.recommendation && (
          <p className="text-sm text-gray-500 italic mt-1.5">
            → {finding.recommendation}
          </p>
        )}

        {finding.affected_component && (
          <span className="inline-block mt-2 text-xs text-gray-400 uppercase tracking-wide">
            {finding.affected_component}
            {finding.affected_date_start && ` · ${finding.affected_date_start}`}
            {finding.affected_date_end && ` – ${finding.affected_date_end}`}
          </span>
        )}
      </div>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Finding</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">{finding.title}</p>
          <Textarea
            placeholder="Resolution note (optional) — describe how this was resolved..."
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={loading}>
              {loading ? 'Saving...' : 'Mark Resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Acknowledge Dialog */}
      <Dialog open={acknowledgeOpen} onOpenChange={setAcknowledgeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge Finding</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 mb-1">{finding.title}</p>
          <p className="text-xs text-gray-400 mb-3">
            Acknowledging means you are aware of this issue but cannot resolve it at this time.
          </p>
          <Textarea
            placeholder="Note (optional) — explain why this is being acknowledged rather than resolved..."
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcknowledgeOpen(false)}>Cancel</Button>
            <Button onClick={handleAcknowledge} disabled={loading}>
              {loading ? 'Saving...' : 'Acknowledge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
