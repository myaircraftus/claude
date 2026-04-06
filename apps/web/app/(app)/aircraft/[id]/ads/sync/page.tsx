'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function SyncADsPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [status, setStatus] = useState<'syncing' | 'done' | 'error'>('syncing')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function sync() {
      try {
        const res = await fetch(`/api/aircraft/${params.id}/ads`, { method: 'POST' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Sync failed')
        if (cancelled) return
        setStatus('done')
        setMessage(`Synced ${data.synced ?? 0} ADs for this aircraft.`)
        setTimeout(() => {
          router.replace(`/aircraft/${params.id}`)
          router.refresh()
        }, 1500)
      } catch (err: any) {
        if (cancelled) return
        setStatus('error')
        setMessage(err?.message ?? 'AD sync failed')
        setTimeout(() => router.replace(`/aircraft/${params.id}`), 3000)
      }
    }
    sync()
    return () => { cancelled = true }
  }, [params.id, router])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      {status === 'syncing' && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Syncing Airworthiness Directives...</p>
        </>
      )}
      {status === 'done' && (
        <>
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          <p className="text-sm text-foreground font-medium">{message}</p>
          <p className="text-xs text-muted-foreground">Redirecting...</p>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="h-8 w-8 text-red-600" />
          <p className="text-sm text-red-700">{message}</p>
          <p className="text-xs text-muted-foreground">Redirecting back...</p>
        </>
      )}
    </div>
  )
}
