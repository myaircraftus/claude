'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Loader2, RefreshCw, Check, X, Plus, Trash2, Wrench,
  Package, Eye, ClipboardCheck, Settings2, FlaskConical,
} from 'lucide-react'

interface SuggestedPart {
  part_number: string
  title: string
  estimated_price: number
}

interface PlanStep {
  description: string
  estimated_hours: number
  category: 'inspection' | 'repair' | 'replacement' | 'adjustment' | 'testing'
  suggested_parts: SuggestedPart[]
}

interface AIPlan {
  plan_summary: string
  steps: PlanStep[]
  total_estimated_hours: number
  notes: string
}

interface Props {
  workOrderId: string
  open: boolean
  onClose: () => void
  onAcceptPlan: (lines: any[]) => void
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  inspection: { label: 'Inspection', icon: <Eye className="h-3.5 w-3.5" />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  repair: { label: 'Repair', icon: <Wrench className="h-3.5 w-3.5" />, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  replacement: { label: 'Replacement', icon: <Package className="h-3.5 w-3.5" />, color: 'bg-orange-50 text-orange-700 border-orange-200' },
  adjustment: { label: 'Adjustment', icon: <Settings2 className="h-3.5 w-3.5" />, color: 'bg-violet-50 text-violet-700 border-violet-200' },
  testing: { label: 'Testing', icon: <FlaskConical className="h-3.5 w-3.5" />, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

export function AIPlanDrawer({ workOrderId, open, onClose, onAcceptPlan }: Props) {
  const [plan, setPlan] = useState<AIPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editedSteps, setEditedSteps] = useState<PlanStep[]>([])

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPlan(null)
    setEditMode(false)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/ai-plan`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to generate plan')
      }
      const data = await res.json()
      setPlan(data)
      setEditedSteps(data.steps ?? [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [workOrderId])

  useEffect(() => {
    if (open && !plan && !loading) {
      generate()
    }
  }, [open, plan, loading, generate])

  function handleAccept() {
    const steps = editMode ? editedSteps : (plan?.steps ?? [])
    const lines: any[] = []

    steps.forEach((step) => {
      // Labor line from the step
      lines.push({
        line_type: 'labor',
        description: step.description,
        hours: step.estimated_hours,
        rate: 0, // user should set their rate
        quantity: 1,
        unit_price: 0,
      })

      // Part lines from suggested parts
      step.suggested_parts.forEach((part) => {
        lines.push({
          line_type: 'part',
          description: part.title,
          part_number: part.part_number,
          quantity: 1,
          unit_price: part.estimated_price,
        })
      })
    })

    onAcceptPlan(lines)
    onClose()
  }

  function updateStep(index: number, updates: Partial<PlanStep>) {
    setEditedSteps(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s))
  }

  function removeStep(index: number) {
    setEditedSteps(prev => prev.filter((_, i) => i !== index))
  }

  function addStep() {
    setEditedSteps(prev => [...prev, {
      description: '',
      estimated_hours: 1,
      category: 'repair',
      suggested_parts: [],
    }])
  }

  function removePartFromStep(stepIdx: number, partIdx: number) {
    setEditedSteps(prev => prev.map((s, i) =>
      i === stepIdx
        ? { ...s, suggested_parts: s.suggested_parts.filter((_, pi) => pi !== partIdx) }
        : s
    ))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-background border-l border-border flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand-600" />
            <h2 className="text-base font-semibold text-foreground">AI Work Plan</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={generate}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} />
              Regenerate
            </Button>
            <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
              <p className="text-sm text-muted-foreground">Generating work plan...</p>
              <p className="text-xs text-muted-foreground">Analyzing squawks and aircraft data</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={generate} className="mt-3">
                Try Again
              </Button>
            </div>
          )}

          {plan && !loading && (
            <>
              {/* Summary */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-foreground">{plan.plan_summary}</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span>{plan.steps.length} steps</span>
                  <span>{plan.total_estimated_hours} estimated hours</span>
                </div>
              </div>

              {/* Edit toggle */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Steps</h3>
                <Button
                  size="sm"
                  variant={editMode ? 'default' : 'outline'}
                  onClick={() => setEditMode(v => !v)}
                >
                  {editMode ? 'Done Editing' : 'Edit'}
                </Button>
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {(editMode ? editedSteps : plan.steps).map((step, idx) => {
                  const cat = CATEGORY_CONFIG[step.category] ?? CATEGORY_CONFIG.repair
                  return (
                    <div key={idx} className="rounded-lg border border-border bg-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-semibold text-foreground flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            {editMode ? (
                              <textarea
                                value={step.description}
                                onChange={(e) => updateStep(idx, { description: e.target.value })}
                                rows={2}
                                className="w-full px-2 py-1 rounded border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            ) : (
                              <p className="text-sm text-foreground">{step.description}</p>
                            )}
                          </div>
                        </div>
                        {editMode && (
                          <button
                            onClick={() => removeStep(idx)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border',
                          cat.color
                        )}>
                          {cat.icon}
                          {cat.label}
                        </span>

                        {editMode ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.25"
                              value={step.estimated_hours}
                              onChange={(e) => updateStep(idx, { estimated_hours: parseFloat(e.target.value) || 0 })}
                              className="w-16 h-6 text-xs px-1"
                            />
                            <span className="text-xs text-muted-foreground">hrs</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {step.estimated_hours} hr{step.estimated_hours !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Suggested parts */}
                      {step.suggested_parts.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Suggested Parts</p>
                          {step.suggested_parts.map((part, pi) => (
                            <div key={pi} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1">
                              <Package className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="font-mono text-muted-foreground">{part.part_number}</span>
                              <span className="text-foreground flex-1 truncate">{part.title}</span>
                              <span className="text-muted-foreground tabular-nums">${part.estimated_price.toFixed(2)}</span>
                              {editMode && (
                                <button
                                  onClick={() => removePartFromStep(idx, pi)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                {editMode && (
                  <Button size="sm" variant="outline" onClick={addStep} className="w-full">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Step
                  </Button>
                )}
              </div>

              {/* Notes */}
              {plan.notes && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-800 mb-1">Notes</p>
                  <p className="text-xs text-amber-700">{plan.notes}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {plan && !loading && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleAccept}>
              <Check className="h-4 w-4 mr-1" />
              Accept Plan
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
