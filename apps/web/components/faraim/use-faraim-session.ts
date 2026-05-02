'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface FaraimSessionData {
  embedUrls: { ask: string; questionBank?: string }
  expiresAt: string
  access?: { reason: string; remaining: number | null }
}

interface FaraimSessionState {
  data: FaraimSessionData | null
  loading: boolean
  error: string | null
  upgradeRequired: boolean
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000

export function useFaraimSession(enabled: boolean) {
  const [state, setState] = useState<FaraimSessionState>({
    data: null,
    loading: false,
    error: null,
    upgradeRequired: false,
  })
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelled = useRef(false)

  const fetchSession = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const r = await fetch('/api/faraim/session', { method: 'POST' })
      const payload = await r.json().catch(() => ({}))
      if (!r.ok) {
        const upgradeRequired = !!payload?.upgradeRequired
        const message =
          payload?.error ??
          (r.status === 401
            ? 'Please sign in to use FAR/AIM.'
            : 'FAR/AIM is temporarily unavailable. Please try again.')
        if (!cancelled.current) {
          setState({ data: null, loading: false, error: message, upgradeRequired })
        }
        return
      }
      const next = payload as FaraimSessionData
      if (cancelled.current) return
      setState({ data: next, loading: false, error: null, upgradeRequired: false })

      const ms = new Date(next.expiresAt).getTime() - Date.now() - REFRESH_BUFFER_MS
      if (ms > 0) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => {
          void fetchSession()
        }, ms)
      }
    } catch (err) {
      console.error('[faraim] session fetch failed', err)
      if (!cancelled.current) {
        setState({
          data: null,
          loading: false,
          error: 'FAR/AIM is temporarily unavailable. Please try again.',
          upgradeRequired: false,
        })
      }
    }
  }, [])

  useEffect(() => {
    cancelled.current = false
    if (enabled && !state.data && !state.loading) {
      void fetchSession()
    }
    return () => {
      cancelled.current = true
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current)
        refreshTimer.current = null
      }
    }
  }, [enabled, state.data, state.loading, fetchSession])

  return { ...state, retry: fetchSession }
}
