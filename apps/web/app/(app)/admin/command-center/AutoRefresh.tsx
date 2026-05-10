'use client'

/**
 * Phase 16 Sprint 16.7 — refreshes the command-center page every 30s.
 * Visual ping when the next refresh fires so the admin knows data is
 * live.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export function AutoRefresh() {
  const router = useRouter()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
      setTick((t) => t + 1)
    }, 30_000)
    return () => clearInterval(id)
  }, [router])
  return <span className="inline-block">{tick > 0 ? `· refreshed ${tick}×` : '· live'}</span>
}
