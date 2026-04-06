'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Plane, Building2, FileText, Check, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn, slugify } from '@/lib/utils'

// ─── Zod schemas ────────────────────────────────────────────────────────────

const orgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(80),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
})

const aircraftSchema = z.object({
  tail_number: z
    .string()
    .min(2, 'Tail number required')
    .max(10),
  make: z.string().min(1, 'Make is required').max(80),
  model: z.string().min(1, 'Model is required').max(80),
  year: z.string().optional(),
})

type OrgFormValues = z.infer<typeof orgSchema>
type AircraftFormValues = z.infer<typeof aircraftSchema>

// ─── Step indicator ──────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, label: 'Organization', icon: Building2 },
  { number: 2, label: 'First Aircraft', icon: Plane },
  { number: 3, label: 'First Document', icon: FileText },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, idx) => {
        const done = current > step.number
        const active = current === step.number
        const Icon = step.icon
        return (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
                  done
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : active
                    ? 'bg-white border-brand-500 text-brand-600'
                    : 'bg-white/20 border-white/30 text-white/50'
                )}
              >
                {done ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
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
                  'w-16 h-0.5 mx-2 mb-5 transition-all',
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

// ─── Step 1: Create Organization ────────────────────────────────────────────

function StepOrganization({
  onSuccess,
}: {
  onSuccess: (orgId: string) => void
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

  // Watch slug so it reflects auto-fill
  const _slug = watch('slug')

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setValue('name', v)
    setValue('slug', slugify(v))
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
      onSuccess(data.id)
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-panel">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
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
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org-slug">URL slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                myaircraft.us/
              </span>
              <Input
                id="org-slug"
                placeholder="acme-aviation"
                {...register('slug')}
                className="font-mono"
              />
            </div>
            {errors.slug && (
              <p className="text-xs text-destructive">{errors.slug.message}</p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
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

// ─── Step 2: Add First Aircraft ──────────────────────────────────────────────

function StepAircraft({
  organizationId,
  onSuccess,
}: {
  organizationId: string
  onSuccess: (aircraftId: string) => void
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
      onSuccess(data.id)
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-panel">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
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
              {errors.make && (
                <p className="text-xs text-destructive">{errors.make.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input id="model" placeholder="172S" {...register('model')} />
              {errors.model && (
                <p className="text-xs text-destructive">{errors.model.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="year">
              Year <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="year"
              type="number"
              placeholder="2018"
              min={1900}
              max={new Date().getFullYear() + 2}
              {...register('year')}
            />
            {errors.year && (
              <p className="text-xs text-destructive">{errors.year.message}</p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
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

// ─── Step 3: Upload First Document ───────────────────────────────────────────

function StepDocument({ onSkip }: { onSkip: () => void }) {
  return (
    <Card className="w-full max-w-lg shadow-panel">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
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
          <FileText className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            Ready to upload your documents?
          </p>
          <p className="text-xs text-muted-foreground">
            PDFs, images, and scanned documents are all supported
          </p>
        </div>

        <Button className="w-full" asChild>
          <Link href="/documents/upload">
            <FileText className="mr-2 h-4 w-4" />
            Upload documents
          </Link>
        </Button>

        <Button variant="outline" className="w-full" onClick={onSkip}>
          Skip for now — go to dashboard
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          You can always upload documents later from the Documents section.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [organizationId, setOrganizationId] = useState<string>('')

  function handleOrgCreated(orgId: string) {
    setOrganizationId(orgId)
    setStep(2)
  }

  function handleAircraftCreated(_aircraftId: string) {
    setStep(3)
  }

  function handleSkipToDashboard() {
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-brand-950 via-brand-900 to-sky-900">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M28 16L4 8L10 16L4 24L28 16Z"
            fill="#3b82f6"
            stroke="#60a5fa"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-xl font-bold text-white tracking-tight">myaircraft.us</span>
      </div>

      {/* Step counter + progress bubbles */}
      <div className="w-full max-w-lg mb-2">
        <p className="text-center text-sm text-white/60 mb-6">Step {step} of 3</p>
        <StepIndicator current={step} />
      </div>

      {/* Step content */}
      {step === 1 && <StepOrganization onSuccess={handleOrgCreated} />}
      {step === 2 && (
        <StepAircraft
          organizationId={organizationId}
          onSuccess={handleAircraftCreated}
        />
      )}
      {step === 3 && <StepDocument onSkip={handleSkipToDashboard} />}

      <p className="mt-6 text-xs text-white/40">
        Already have an account?{' '}
        <Link href="/login" className="underline hover:text-white/70 transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  )
}
