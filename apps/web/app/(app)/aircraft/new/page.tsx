'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Loader2, Plane } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Topbar } from '@/components/shared/topbar'
import { createBrowserSupabase } from '@/lib/supabase/browser'

// ─── Schema ───────────────────────────────────────────────────────────────────

const newAircraftSchema = z.object({
  tail_number: z.string().min(2, 'Tail number is required').max(10),
  make: z.string().min(1, 'Make is required').max(80),
  model: z.string().min(1, 'Model is required').max(80),
  year: z.string().optional(),
  serial_number: z.string().max(50).optional(),
  engine_make: z.string().max(80).optional(),
  engine_model: z.string().max(80).optional(),
  base_airport: z.string().max(10).optional(),
  notes: z.string().max(2000).optional(),
})

type NewAircraftValues = z.infer<typeof newAircraftSchema>

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewAircraftPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewAircraftValues>({
    resolver: zodResolver(newAircraftSchema),
    defaultValues: {
      tail_number: '',
      make: '',
      model: '',
      year: '',
      serial_number: '',
      engine_make: '',
      engine_model: '',
      base_airport: '',
      notes: '',
    },
  })

  // Fetch the user's org on first render — we need it for the POST body
  // We do this lazily when the form submits so we don't need a useEffect loader
  async function resolveOrgId(): Promise<string | null> {
    if (orgId) return orgId
    const supabase = createBrowserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()
    if (data?.organization_id) {
      setOrgId(data.organization_id)
      return data.organization_id
    }
    return null
  }

  async function onSubmit(values: NewAircraftValues) {
    setServerError(null)

    const resolvedOrgId = await resolveOrgId()
    if (!resolvedOrgId) {
      setServerError('Unable to determine your organization. Please refresh and try again.')
      return
    }

    const yearParsed = values.year ? parseInt(values.year, 10) : undefined

    try {
      const res = await fetch('/api/aircraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: resolvedOrgId,
          tail_number: values.tail_number.toUpperCase(),
          make: values.make,
          model: values.model,
          year: yearParsed || undefined,
          serial_number: values.serial_number || undefined,
          engine_make: values.engine_make || undefined,
          engine_model: values.engine_model || undefined,
          base_airport: values.base_airport?.toUpperCase() || undefined,
          notes: values.notes || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setServerError(data.error ?? 'Failed to create aircraft')
        return
      }

      router.push(`/aircraft/${data.id}`)
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

  // Build a minimal profile stub for Topbar (profile is available via server session
  // but this is a client page — topbar accepts the profile from its own auth)
  const topbarProfile = {
    id: '',
    email: '',
    full_name: undefined,
    avatar_url: undefined,
    created_at: '',
    updated_at: '',
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={topbarProfile as any}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: 'Add Aircraft' },
        ]}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Page header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <Plane className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Add Aircraft</h1>
              <p className="text-sm text-muted-foreground">
                Fill in the details for the new aircraft in your fleet.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tail_number">
                    Tail number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="tail_number"
                    placeholder="N12345"
                    className="font-mono uppercase max-w-xs"
                    {...register('tail_number')}
                    onChange={e => {
                      e.target.value = e.target.value.toUpperCase()
                    }}
                  />
                  {errors.tail_number && (
                    <p className="text-xs text-destructive">{errors.tail_number.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="make">
                      Make <span className="text-destructive">*</span>
                    </Label>
                    <Input id="make" placeholder="Cessna" {...register('make')} />
                    {errors.make && (
                      <p className="text-xs text-destructive">{errors.make.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="model">
                      Model <span className="text-destructive">*</span>
                    </Label>
                    <Input id="model" placeholder="172S Skyhawk" {...register('model')} />
                    {errors.model && (
                      <p className="text-xs text-destructive">{errors.model.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="year">Year</Label>
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
                  <div className="space-y-1.5">
                    <Label htmlFor="serial_number">Serial number</Label>
                    <Input
                      id="serial_number"
                      placeholder="17281234"
                      className="font-mono"
                      {...register('serial_number')}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="base_airport">Base airport (ICAO/IATA)</Label>
                  <Input
                    id="base_airport"
                    placeholder="KPAO"
                    className="uppercase max-w-xs font-mono"
                    {...register('base_airport')}
                    onChange={e => {
                      e.target.value = e.target.value.toUpperCase()
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Engine */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Engine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="engine_make">Engine make</Label>
                    <Input id="engine_make" placeholder="Lycoming" {...register('engine_make')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="engine_model">Engine model</Label>
                    <Input
                      id="engine_model"
                      placeholder="IO-360-L2A"
                      {...register('engine_model')}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes about this aircraft…"
                  rows={4}
                  {...register('notes')}
                />
              </CardContent>
            </Card>

            {/* Error */}
            {serverError && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {serverError}
              </p>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" asChild>
                <Link href="/aircraft">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Plane className="mr-2 h-4 w-4" />
                    Add Aircraft
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
