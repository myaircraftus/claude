'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import Link, { useTenantRouter } from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn, formatDate } from '@/lib/utils'
import {
  Sparkles, Send, FileText, Loader2, AlertTriangle,
  CheckCircle2, Clock, XCircle, Plane, User, RefreshCw,
} from 'lucide-react'

type EstimateStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'converted'

const STATUS_COLOR: Record<EstimateStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  converted: 'bg-violet-50 text-violet-700 border-violet-200',
}

const STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
  converted: 'Converted to WO',
}

const SEVERITY_COLOR: Record<string, string> = {
  minor: 'bg-gray-100 text-gray-700',
  normal: 'bg-blue-100 text-blue-800',
  urgent: 'bg-amber-100 text-amber-800',
  grounding: 'bg-red-100 text-red-800',
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

interface Props {
  initialEstimate: any
  initialSquawks: any[]
}

export function EstimateDetail({ initialEstimate, initialSquawks }: Props) {
  const router = useTenantRouter()
  const [estimate, setEstimate] = useState(initialEstimate)
  const [squawks] = useState<any[]>(initialSquawks)
  const [summary, setSummary] = useState<string>(initialEstimate.ai_summary ?? '')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)

  const lineItems: any[] = (estimate.line_items ?? []).sort(
    (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  )
  const aircraft = estimate.aircraft as any
  const customer = estimate.customer as any

  const handleGenerateSummary = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/estimates/${estimate.id}/generate-summary`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Failed to generate summary')
        return
      }
      const { summary: newSummary } = await res.json()
      setSummary(newSummary)
      setEstimate((prev: any) => ({ ...prev, ai_summary: newSummary }))
      toast.success('AI summary generated')
    } catch (err: any) {
      toast.error('Failed to generate summary')
    } finally {
      setGenerating(false)
    }
  }

  const handleSend = async () => {
    const recipientEmail = customer?.email
    if (!recipientEmail) {
      toast.error('No customer email on file')
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/estimates/${estimate.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_email: recipientEmail }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Failed to send estimate')
        return
      }
      const { estimate: updated } = await res.json()
      setEstimate((prev: any) => ({ ...prev, status: updated?.status ?? 'sent' }))
      toast.success(`Estimate sent to ${recipientEmail}`)
    } catch (err: any) {
      toast.error('Failed to send estimate')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">{estimate.estimate_number}</h1>
            <Badge
              className={cn(
                'border',
                STATUS_COLOR[(estimate.status as EstimateStatus) ?? 'draft']
              )}
            >
              {STATUS_LABEL[(estimate.status as EstimateStatus) ?? 'draft']}
            </Badge>
          </div>
          {estimate.valid_until && (
            <p className="text-sm text-muted-foreground">
              Valid until {formatDate(estimate.valid_until)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateSummary}
            disabled={generating}
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</>
            ) : summary ? (
              <><RefreshCw className="h-4 w-4 mr-1" /> Regenerate Summary</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" /> Generate AI Summary</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/estimates/${estimate.id}/pdf`, '_blank')}
          >
            <FileText className="h-4 w-4 mr-1" />
            View PDF
          </Button>
          {customer?.email && (
            <Button size="sm" onClick={handleSend} disabled={sending}>
              {sending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending...</>
              ) : (
                <><Send className="h-4 w-4 mr-1" /> Send to Customer</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Aircraft + Customer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2 flex items-center gap-1">
              <Plane className="h-3 w-3" /> Aircraft
            </p>
            {aircraft ? (
              <>
                <p className="font-mono font-bold text-lg">{aircraft.tail_number}</p>
                <p className="text-sm text-muted-foreground">
                  {[aircraft.make, aircraft.model, aircraft.year].filter(Boolean).join(' ')}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not specified</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2 flex items-center gap-1">
              <User className="h-3 w-3" /> Customer
            </p>
            {customer ? (
              <>
                <p className="font-semibold">{customer.name}</p>
                {customer.company && <p className="text-sm text-muted-foreground">{customer.company}</p>}
                {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not specified</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linked squawks */}
      {squawks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Reported Issues ({squawks.length} squawk{squawks.length !== 1 ? 's' : ''})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {squawks.map((s: any) => (
              <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Badge
                  className={cn(
                    'flex-shrink-0 mt-0.5 capitalize',
                    SEVERITY_COLOR[s.severity] ?? 'bg-gray-100 text-gray-700'
                  )}
                >
                  {s.severity}
                </Badge>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* AI Summary */}
      {summary && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-500" />
              AI Summary
              {estimate.ai_summary_generated_at && (
                <span className="text-xs text-muted-foreground font-normal ml-auto">
                  Generated {formatDate(estimate.ai_summary_generated_at)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{summary}</p>
          </CardContent>
        </Card>
      )}

      {!summary && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="font-medium text-foreground mb-1">No AI summary yet</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Generate a customer-facing summary that explains the reported issues and proposed work in plain language.
            </p>
            <Button size="sm" onClick={handleGenerateSummary} disabled={generating}>
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" /> Generate AI Summary</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Proposed Work</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No line items yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wide">Type</th>
                    <th className="text-left py-2 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wide">Description</th>
                    <th className="text-right py-2 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wide">Qty/Hrs</th>
                    <th className="text-right py-2 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wide">Rate</th>
                    <th className="text-right py-2 px-3 text-xs text-muted-foreground font-semibold uppercase tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li: any) => (
                    <tr key={li.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3 text-muted-foreground capitalize">{li.item_type ?? 'service'}</td>
                      <td className="py-2 px-3">{li.description}</td>
                      <td className="py-2 px-3 text-right">{li.hours ?? li.quantity ?? 1}</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(Number(li.unit_price ?? 0))}</td>
                      <td className="py-2 px-3 text-right font-medium">{formatCurrency(Number(li.line_total ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Separator className="my-4" />

          <div className="flex justify-end">
            <div className="space-y-1 min-w-[240px]">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Labor</span>
                <span>{formatCurrency(Number(estimate.labor_total ?? 0))}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Parts</span>
                <span>{formatCurrency(Number(estimate.parts_total ?? 0))}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Outside Services</span>
                <span>{formatCurrency(Number(estimate.outside_services_total ?? 0))}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-base pt-1">
                <span>Total</span>
                <span>{formatCurrency(Number(estimate.total ?? 0))}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {estimate.customer_notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Customer Scope</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-foreground whitespace-pre-wrap">{estimate.customer_notes}</p>
          </CardContent>
        </Card>
      )}
      {estimate.internal_notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Internal Notes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-foreground whitespace-pre-wrap">{estimate.internal_notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
