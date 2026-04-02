'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, ArrowLeft, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Topbar } from '@/components/shared/topbar'

type SyncState = 'idle' | 'syncing' | 'done' | 'error'

export default function SyncADsPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const aircraftId = params.id

  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [result, setResult] = useState<{ message: string; synced: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [aircraft, setAircraft] = useState<{ tail_number: string; make: string; model: string } | null>(null)

  // Load aircraft info
  useEffect(() => {
    fetch(`/api/aircraft/${aircraftId}`)
      .then(r => r.json())
      .then(d => {
        if (d.id) setAircraft(d)
      })
      .catch(() => {})
  }, [aircraftId])

  async function runSync() {
    setSyncState('syncing')
    setErrorMsg('')
    setResult(null)

    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/ads`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || 'Sync failed')
        setSyncState('error')
        return
      }

      setResult({ message: data.message, synced: data.synced ?? 0 })
      setSyncState('done')
    } catch {
      setErrorMsg('Network error. Please try again.')
      setSyncState('error')
    }
  }

  const topbarProfile = { id: '', email: '', full_name: undefined, avatar_url: undefined, created_at: '', updated_at: '' }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={topbarProfile as any}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: aircraft?.tail_number ?? '…', href: `/aircraft/${aircraftId}` },
          { label: 'Sync ADs' },
        ]}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-12">

          {/* Header */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground leading-tight">Sync Airworthiness Directives</h1>
              {aircraft && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {aircraft.tail_number} · {aircraft.make} {aircraft.model}
                </p>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 pb-6 space-y-6">
              {/* Description */}
              <p className="text-sm text-muted-foreground">
                Fetches applicable Airworthiness Directives from the FAA for this aircraft&apos;s make,
                model, and engine. Existing compliance records are preserved.
              </p>

              {/* Idle / ready */}
              {(syncState === 'idle' || syncState === 'error') && (
                <Button onClick={runSync} className="w-full h-11">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync ADs Now
                </Button>
              )}

              {/* Syncing */}
              {syncState === 'syncing' && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
                  <p className="text-sm text-muted-foreground animate-pulse">
                    Fetching ADs from FAA registry…
                  </p>
                </div>
              )}

              {/* Error */}
              {syncState === 'error' && errorMsg && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}

              {/* Done */}
              {syncState === 'done' && result && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-green-900">Sync complete</p>
                      <p className="text-sm text-green-700 mt-0.5">
                        {result.synced} AD{result.synced !== 1 ? 's' : ''} loaded for this aircraft.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => router.push(`/aircraft/${aircraftId}`)}
                    className="w-full h-11"
                  >
                    View Aircraft
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Back link */}
          <div className="mt-8 text-center">
            <Link
              href={`/aircraft/${aircraftId}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Aircraft
            </Link>
          </div>

        </div>
      </main>
    </div>
  )
}
