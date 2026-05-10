'use client'

/**
 * Phase 16 Sprint 16.5 — install client error handlers on mount.
 *
 * Mounted by the (app) layout so every authenticated page picks up
 * window.onerror + onunhandledrejection. Public marketing pages can
 * mount this independently if/when we want client-side error capture
 * pre-login.
 */
import { useEffect } from 'react'
import { installClientErrorHandlers } from '@/lib/observability/error-capture'

export function ClientErrorBoundary({ persona }: { persona?: string | null }) {
  useEffect(() => {
    installClientErrorHandlers({
      getPersona: () => persona ?? null,
      buildSha: process.env.NEXT_PUBLIC_BUILD_SHA,
    })
  }, [persona])
  return null
}
