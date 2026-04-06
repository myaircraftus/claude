'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CheckCircle,
  XCircle,
  Clock,
  Wrench,
  Plane,
  MessageSquare,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MaintenanceRequest {
  id: string
  aircraft_id: string
  requester_user_id: string
  target_mechanic_user_id: string
  message: string | null
  squawk_ids: string[]
  status: 'pending' | 'accepted' | 'declined' | 'converted_to_wo'
  created_work_order_id: string | null
  created_at: string
  responded_at: string | null
  requester?: { id: string; full_name?: string; email: string; avatar_url?: string } | null
  mechanic?: { id: string; full_name?: string; email: string; avatar_url?: string } | null
  aircraft?: { id: string; tail_number: string; make: string; model: string } | null
}

interface RequestsListProps {
  initialRequests: MaintenanceRequest[]
  currentUserRole: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: { label: 'Pending', variant: 'warning' as const, icon: Clock },
  accepted: { label: 'Accepted', variant: 'success' as const, icon: CheckCircle },
  declined: { label: 'Declined', variant: 'danger' as const, icon: XCircle },
  converted_to_wo: { label: 'Converted to WO', variant: 'info' as const, icon: Wrench },
} as const

type StatusFilter = 'all' | 'pending' | 'accepted' | 'declined'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export function RequestsList({ initialRequests, currentUserRole }: RequestsListProps) {
  const router = useRouter()
  const [requests, setRequests] = useState<MaintenanceRequest[]>(initialRequests)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [processingId, setProcessingId] = useState<string | null>(null)

  const filtered = statusFilter === 'all'
    ? requests
    : requests.filter(r => {
        if (statusFilter === 'accepted') return r.status === 'accepted' || r.status === 'converted_to_wo'
        return r.status === statusFilter
      })

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const isMechanicOrAdmin = ['mechanic', 'admin', 'owner'].includes(currentUserRole)

  const handleResponse = async (id: string, status: 'accepted' | 'declined') => {
    setProcessingId(id)
    try {
      const res = await fetch(`/api/maintenance/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed to update request')
      const data = await res.json()

      setRequests(prev => prev.map(r => {
        if (r.id !== id) return r
        return {
          ...r,
          status: data.status ?? status,
          created_work_order_id: data.work_order_id ?? r.created_work_order_id,
          responded_at: data.responded_at ?? new Date().toISOString(),
        }
      }))

      if (status === 'accepted' && data.work_order_id) {
        router.refresh()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Maintenance Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {requests.length} request{requests.length !== 1 ? 's' : ''}{pendingCount > 0 && `, ${pendingCount} pending`}
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/50 w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              statusFilter === tab.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.value === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Request list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">
              {statusFilter === 'all' ? 'No maintenance requests' : `No ${statusFilter} requests`}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {isMechanicOrAdmin
                ? 'When pilots submit maintenance requests for your review, they will appear here.'
                : 'Submit a maintenance request from an aircraft squawks page to get started.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(request => {
            const stat = STATUS_CONFIG[request.status]
            const StatIcon = stat.icon
            const isProcessing = processingId === request.id

            return (
              <Card key={request.id} className="transition-colors hover:border-primary/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="p-2 rounded-lg bg-muted flex-shrink-0 mt-0.5">
                        <Plane className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {request.aircraft && (
                            <span className="text-sm font-mono font-semibold text-primary">
                              {request.aircraft.tail_number}
                            </span>
                          )}
                          <Badge variant={stat.variant}>
                            <StatIcon className="h-3 w-3 mr-1" />
                            {stat.label}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {request.squawk_ids.length} squawk{request.squawk_ids.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>

                        {request.message && (
                          <p className="text-sm text-foreground line-clamp-2 mt-1">
                            {request.message}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{formatDate(request.created_at)}</span>
                          {request.requester?.full_name && (
                            <span>from {request.requester.full_name}</span>
                          )}
                          {request.mechanic?.full_name && (
                            <span>to {request.mechanic.full_name}</span>
                          )}
                        </div>

                        {/* Work order link */}
                        {request.created_work_order_id && (
                          <Link
                            href={`/work-orders/${request.created_work_order_id}`}
                            className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline font-medium"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View Work Order
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Action buttons for pending requests (mechanic/admin only) */}
                    {request.status === 'pending' && isMechanicOrAdmin && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => handleResponse(request.id, 'declined')}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <><XCircle className="h-3 w-3 mr-1" /> Decline</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleResponse(request.id, 'accepted')}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <><CheckCircle className="h-3 w-3 mr-1" /> Accept</>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
