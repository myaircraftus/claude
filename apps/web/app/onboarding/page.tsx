'use client'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plane,
  Building2,
  FileText,
  Check,
  ArrowRight,
  Loader2,
  Sparkles,
} from 'lucide-react'
import Link, { useTenantRouter } from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn, slugify } from '@/lib/utils'
import { withTenantPrefix } from '@/lib/auth/tenant-routing'
import { OPERATION_TYPE_OPTIONS, type AircraftOperationType } from '@/lib/aircraft/operations'

const orgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(80),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
})

const aircraftSchema = z.object({
  tail_number: z.string().min(2, 'Tail number required').max(10),
  make: z.string().min(1, 'Make is required').max(80),
  model: z.string().min(1, 'Model is required').max(80),
  year: z.string().optional(),
})

type OrgFormValues = z.infer<typeof orgSchema>
type AircraftFormValues = z.infer<typeof aircraftSchema>

const STEPS = [
  { number: 1, label: 'Organization', icon: Building2 },
  { number: 2, label: 'First Aircraft', icon: Plane },
  { number: 3, label: 'Operation', icon: Sparkles },
  { number: 4, label: 'First Document', icon: FileText },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {STEPS.map((step, idx) => {
        const done = current > step.number
        const active = current === step.number
        const Icon = step.icon
        return (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all',
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : active
                      ? 'border-brand-500 bg-white text-brand-600'
                      : 'border-white/30 bg-white/20 text-white/50'
                )}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  'text-xs font-medium',
                  active ? 'text-white' : done ? 'text-emerald-300' : 'text-white/50'
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  'mx-2 mb-5 h-0.5 w-12 transition-all',
                  done ? 'bg-emerald-400' : 'bg-white/20'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepOrganization({
  onSuccess,
}: {
  onSuccess: (organization: { id: string; slug: string; name: string }) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: '', slug: '' },
  })

  const _slug = watch('slug')

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setValue('name', value)
    setValue('slug', slugify(value))
  }

  async function onSubmit(values: OrgFormValues) {
    setServerError(null)
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) {
        setServerError(data.error ?? 'Failed to create organization')
        return
      }
      onSuccess({ id: data.id, slug: data.slug, name: values.name })
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-panel">
      <CardHeader className="pb-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Building2 className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <CardTitle className="text-xl">Create your organization</CardTitle>
            <CardDescription>Your team or flight operation</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              placeholder="Acme Aviation LLC"
              {...register('name')}
              onChange={handleNameChange}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org-slug">URL slug</Label>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-sm text-muted-foreground">myaircraft.us/</span>
              <Input
                id="org-slug"
                placeholder="acme-aviation"
                {...register('slug')}
                className="font-mono"
              />
            </div>
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
          </div>

          {serverError && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function StepAircraft({
  organizationId,
  onSuccess,
}: {
  organizationId: string
  onSuccess: (aircraft: { id: string; tailNumber: string }) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AircraftFormValues>({
    resolver: zodResolver(aircraftSchema),
    defaultValues: { tail_number: '', make: '', model: '', year: '' },
  })

  async function onSubmit(values: AircraftFormValues) {
    setServerError(null)
    const yearParsed = values.year ? parseInt(values.year, 10) : undefined
    try {
      const res = await fetch('/api/aircraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          tail_number: values.tail_number.toUpperCase(),
          make: values.make,
          model: values.model,
          year: yearParsed || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setServerError(data.error ?? 'Failed to add aircraft')
        return
      }
      onSuccess({ id: data.id, tailNumber: values.tail_number.toUpperCase() })
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-panel">
      <CardHeader className="pb-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100">
            <Plane className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <CardTitle className="text-xl">Add your first aircraft</CardTitle>
            <CardDescription>You can add more aircraft later</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="tail-number">Tail number</Label>
            <Input
              id="tail-number"
              placeholder="N12345"
              className="font-mono uppercase"
              {...register('tail_number')}
            />
            {errors.tail_number && (
              <p className="text-xs text-destructive">{errors.tail_number.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="make">Make</Label>
              <Input id="make" placeholder="Cessna" {...register('make')} />
              {errors.make && <p className="text-xs text-destructive">{errors.make.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input id="model" placeholder="172S" {...register('model')} />
              {errors.model && <p className="text-xs text-destructive">{errors.model.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="year">
              Year <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="year"
              type="number"
              placeholder="2018"
              min={1900}
              max={new Date().getFullYear() + 2}
              {...register('year')}
            />
            {errors.year && <p className="text-xs text-destructive">{errors.year.message}</p>}
          </div>

          {serverError && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding aircraft…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function StepOperation({
  onSuccess,
  onSkip,
}: {
  onSuccess: (operationType: AircraftOperationType) => Promise<void> | void
  onSkip: () => Promise<void> | void
}) {
  const [selectedOperationType, setSelectedOperationType] = useState<AircraftOperationType | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleContinue() {
    if (!selectedOperationType) return
    setLoading(true)
    try {
      await onSuccess(selectedOperationType)
    } finally {
      setLoading(false)
    }
  }

  async function handleSkip() {
    setLoading(true)
    try {
      await onSkip()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-panel">
      <CardHeader className="pb-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Sparkles className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <CardTitle className="text-xl">How is this aircraft used?</CardTitle>
            <CardDescription>
              We’ll tune the recommended document categories for this aircraft.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {OPERATION_TYPE_OPTIONS.map((option) => {
            const active = selectedOperationType === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedOperationType(option.value)}
                className={cn(
                  'w-full rounded-xl border-2 p-3 text-left transition-all',
                  active
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-border hover:border-brand-200 hover:bg-muted/30'
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2',
                      active ? 'border-brand-500 bg-brand-500' : 'border-border'
                    )}
                  >
                    {active && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <Button className="w-full" onClick={handleContinue} disabled={!selectedOperationType || loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <Button variant="outline" className="w-full" onClick={handleSkip} disabled={loading}>
          Skip for now
        </Button>
      </CardContent>
    </Card>
  )
}

function StepDocument({
  onSkip,
  onUpload,
}: {
  onSkip: () => Promise<void> | void
  onUpload: () => Promise<void> | void
}) {
  const [loadingAction, setLoadingAction] = useState<'skip' | 'upload' | null>(null)

  async function run(action: 'skip' | 'upload', callback: () => Promise<void> | void) {
    setLoadingAction(action)
    try {
      await callback()
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-panel">
      <CardHeader className="pb-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
            <FileText className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <CardTitle className="text-xl">Upload your first document</CardTitle>
            <CardDescription>
              Logbooks, POH, maintenance records — any aircraft document
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50 p-8 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
          <p className="mb-1 text-sm font-medium text-foreground">Ready to upload your documents?</p>
          <p className="text-xs text-muted-foreground">
            We’ll pre-select this aircraft and show AI-recommended categories first.
          </p>
        </div>

        <Button
          className="w-full"
          onClick={() => run('upload', onUpload)}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'upload' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Opening upload…
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Upload documents
            </>
          )}
        </Button>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => run('skip', onSkip)}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'skip' ? 'Finishing…' : 'Skip for now — go to dashboard'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          You can always upload documents later from the Documents section.
        </p>
      </CardContent>
    </Card>
  )
}

export default function OnboardingPage() {
  const router = useTenantRouter()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [organizationId, setOrganizationId] = useState('')
  const [organizationSlug, setOrganizationSlug] = useState('')
  const [aircraftId, setAircraftId] = useState('')
  const onboardingContextRef = useRef<Record<string, unknown>>({})

  async function saveOnboardingState(payload: Record<string, unknown>) {
    try {
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      // Keep onboarding moving even if incremental state persistence has a transient failure.
    }
  }

  function persistOnboardingContext(
    contextPatch: Record<string, unknown>,
    payloadPatch: Record<string, unknown> = {}
  ) {
    onboardingContextRef.current = {
      ...onboardingContextRef.current,
      ...contextPatch,
    }

    void saveOnboardingState({
      ...payloadPatch,
      onboarding_context: onboardingContextRef.current,
    })
  }

  function handleOrgCreated(organization: { id: string; slug: string; name: string }) {
    setOrganizationId(organization.id)
    setOrganizationSlug(organization.slug)
    persistOnboardingContext(
      {
        onboarding_step: 'organization',
        organization_id: organization.id,
        organization_name: organization.name,
        organization_slug: organization.slug,
      },
      {
        org_id: organization.id,
        org_name: organization.name,
      }
    )
    setStep(2)
  }

  function handleAircraftCreated(aircraft: { id: string; tailNumber: string }) {
    setAircraftId(aircraft.id)
    persistOnboardingContext(
      {
        onboarding_step: 'aircraft',
        first_aircraft_id: aircraft.id,
        first_aircraft_tail_number: aircraft.tailNumber,
      },
      {
        org_id: organizationId,
      }
    )
    setStep(3)
  }

  async function handleOperationChosen(operationType: AircraftOperationType) {
    try {
      await fetch(`/api/aircraft/${aircraftId}/suggest-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation_types: [operationType],
        }),
      })
    } catch {
      // Non-blocking enhancement — if category suggestions fail we still want the user
      // to complete onboarding and upload documents normally.
    }

    persistOnboardingContext(
      {
        onboarding_step: 'operation',
        first_aircraft_operation_type: operationType,
      },
      {
        org_id: organizationId,
      }
    )

    setStep(4)
  }

  async function handleOperationSkipped() {
    persistOnboardingContext(
      {
        onboarding_step: 'operation_skipped',
      },
      {
        org_id: organizationId,
      }
    )
    setStep(4)
  }

  async function completeOnboarding(destination: string) {
    const nextContext = {
      ...onboardingContextRef.current,
      onboarding_step: 'completed',
      onboarding_destination: destination,
    }
    onboardingContextRef.current = nextContext

    await saveOnboardingState({
      org_id: organizationId,
      onboarding_completed_at: new Date().toISOString(),
      onboarding_context: nextContext,
    })

    router.push(destination)
  }

  function handleSkipToDashboard() {
    const destination = withTenantPrefix('/dashboard', organizationSlug)
    return completeOnboarding(destination)
  }

  function handleContinueToUpload() {
    const query = aircraftId ? `?aircraft=${encodeURIComponent(aircraftId)}` : ''
    const destination = withTenantPrefix(`/documents/upload${query}`, organizationSlug)
    return completeOnboarding(destination)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-950 via-brand-900 to-sky-900 p-4">
      <div className="mb-8 flex items-center gap-2">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M28 16L4 8L10 16L4 24L28 16Z"
            fill="#3b82f6"
            stroke="#60a5fa"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-xl font-bold tracking-tight text-white">myaircraft.us</span>
      </div>

      <div className="mb-2 w-full max-w-lg">
        <p className="mb-6 text-center text-sm text-white/60">Step {step} of 4</p>
        <StepIndicator current={step} />
      </div>

      {step === 1 && <StepOrganization onSuccess={handleOrgCreated} />}
      {step === 2 && (
        <StepAircraft organizationId={organizationId} onSuccess={handleAircraftCreated} />
      )}
      {step === 3 && (
        <StepOperation onSuccess={handleOperationChosen} onSkip={handleOperationSkipped} />
      )}
      {step === 4 && (
        <StepDocument onSkip={handleSkipToDashboard} onUpload={handleContinueToUpload} />
      )}

      <p className="mt-6 text-xs text-white/40">
        Already have an account?{' '}
        <Link href="/login" className="underline transition-colors hover:text-white/70">
          Sign in
        </Link>
      </p>
    </div>
  )
}
