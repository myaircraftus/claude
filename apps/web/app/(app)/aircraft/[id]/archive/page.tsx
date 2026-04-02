'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, AlertTriangle, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Topbar } from '@/components/shared/topbar'

type ArchiveState = 'idle' | 'archiving' | 'done' | 'error'

export default function ArchiveAircraftPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const aircraftId = params.id

  const [archiveState, setArchiveState] = useState<ArchiveState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [aircraft, setAircraft] = useState<{
    tail_number: string
    make: string
    model: string
    year?: number
  } | null>(null)
  const [loadError, setLoadError] = useState(false)

  // Load aircraft info
  useEffect(() => {
    fetch(`/api/aircraft/${aircraftId}`)
      .then(r => r.json())
      .then(d => {
        if (d.id) setAircraft(d)
        else setLoadError(true)
      })
      .catch(() => setLoadError(true))
  }, [aircraftId])

  async function confirmArchive() {
    setArchiveState('archiving')
    setErrorMsg('')

    try {
      const res = await fetch(`/api/aircraft/${aircraftId}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to archive aircraft')
        setArchiveState('error')
        return
      }

      setArchiveState('done')
      // Redirect to fleet after a short pause
      setTimeout(() => router.push('/aircraft'), 1500)
    } catch {
      setErrorMsg('Network error. Please try again.')
      setArchiveState('error')
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
          { label: 'Archive' },
        ]}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-12">

          {/* Header */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground leading-tight">Archive Aircraft</h1>
              {aircraft && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {aircraft.tail_number} · {aircraft.make} {aircraft.model}
                  {aircraft.year ? ` · ${aircraft.year}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Load error */}
          {loadError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-sm text-destructive">
              Could not load aircraft details. Please go back and try again.
            </div>
          )}

          {/* Confirmation card */}
          {!loadError && (
            <Card className="border-destructive/30">
              <CardContent className="pt-6 pb-6 space-y-5">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>This will remove the aircraft from your active fleet. The following applies:</p>
                  <ul className="list-disc list-inside space-y-1 ml-1">
                    <li>The aircraft will no longer appear in your fleet</li>
                    <li>All documents and records are <span className="font-medium text-foreground">preserved</span></li>
                    <li>Only owners and admins can archive aircraft</li>
                    <li>This action can be reversed by contacting support</li>
                  </ul>
                </div>

                {/* Error */}
                {archiveState === 'error' && errorMsg && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {errorMsg}
                  </div>
                )}

                {/* Done */}
                {archiveState === 'done' && (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-medium text-center">
                    Aircraft archived — redirecting to fleet…
                  </div>
                )}

                {/* Actions */}
                {archiveState !== 'done' && (
                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      asChild
                    >
                      <Link href={`/aircraft/${aircraftId}`}>Cancel</Link>
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={confirmArchive}
                      disabled={archiveState === 'archiving' || !aircraft}
                    >
                      {archiveState === 'archiving' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Archiving…
                        </>
                      ) : (
                        'Archive Aircraft'
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
