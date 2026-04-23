'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createBrowserSupabase } from '@/lib/supabase/browser'

function sanitizeNext(next: string | null) {
  if (!next || !next.startsWith('/')) {
    return '/dashboard'
  }

  return next
}

export default function OAuthCallbackPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const code = useMemo(() => {
    const value = searchParams?.code
    return Array.isArray(value) ? value[0] ?? null : value ?? null
  }, [searchParams])

  const nextPath = useMemo(() => {
    const value = searchParams?.next
    return sanitizeNext(Array.isArray(value) ? value[0] ?? null : value ?? null)
  }, [searchParams])

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function completeOAuth() {
      if (!code) {
        setError('Missing authorization code.')
        return
      }

      try {
        const supabase = createBrowserSupabase()
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError) {
          throw exchangeError
        }

        if (!cancelled) {
          window.location.replace(nextPath)
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error && err.message
              ? err.message
              : 'Google sign-in failed. Please try again.'
          setError(message)
        }
      }
    }

    completeOAuth()
    return () => {
      cancelled = true
    }
  }, [code, nextPath])

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Google sign-in failed</h1>
            <p className="mt-3 text-sm text-slate-600">{error}</p>
            <div className="mt-6">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
              >
                Back to login
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">Signing you in</h1>
            <p className="mt-2 text-sm text-slate-600">
              Completing Google authentication and loading your account.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
