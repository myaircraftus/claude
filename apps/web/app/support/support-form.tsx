'use client'

/**
 * Public /support page submit form (Phase 16 Sprint 16.2).
 *
 * Includes a honeypot field (the `website` input) that's CSS-hidden
 * but visible to bots; if it's filled, /api/public/support/submit
 * silently drops the request.
 */
import { useState } from 'react'
import Link from 'next/link'

const CATEGORY_OPTIONS = [
  { value: 'technical', label: 'Technical issue' },
  { value: 'billing', label: 'Billing / subscription' },
  { value: 'account', label: 'Account / login' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'bug', label: 'Bug report' },
  { value: 'other', label: 'Other' },
] as const

interface SubmitResult {
  ticket_number: string
  status: string
  view_url: string
}

export function SupportForm() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/public/support/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(form.get('email') ?? '').trim(),
          subject: String(form.get('subject') ?? '').trim(),
          body: String(form.get('body') ?? '').trim(),
          category: String(form.get('category') ?? 'other'),
          organization_slug: String(form.get('organization_slug') ?? '').trim() || undefined,
          // Honeypot — bots fill this.
          website: String(form.get('website') ?? ''),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong')
        return
      }
      setResult(data as SubmitResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 space-y-4">
        <h2 className="text-xl tracking-tight text-emerald-900" style={{ fontWeight: 700 }}>
          We got your ticket
        </h2>
        <p className="text-emerald-900">
          Reference number: <span className="font-mono font-semibold">{result.ticket_number}</span>
        </p>
        <p className="text-sm text-emerald-900/80">
          AI is triaging now. Most replies land within minutes; complex issues
          route to a human within the SLA window for the priority. We&rsquo;ll email
          you at the address you submitted.
        </p>
        <div className="pt-2">
          <Link
            href={result.view_url}
            className="inline-flex items-center rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
          >
            View ticket thread
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Honeypot — bots fill this; real users don't see it. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="email">Your email</label>
          <input
            type="email"
            name="email"
            id="email"
            required
            placeholder="you@example.com"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="organization_slug">
            Org slug <span className="text-xs text-muted-foreground">(optional)</span>
          </label>
          <input
            type="text"
            name="organization_slug"
            id="organization_slug"
            placeholder="acme-aviation"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="category">Category</label>
        <select
          name="category"
          id="category"
          defaultValue="technical"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="subject">Subject</label>
        <input
          type="text"
          name="subject"
          id="subject"
          required
          maxLength={240}
          placeholder="One-line summary"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
        />
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="body">Details</label>
        <textarea
          name="body"
          id="body"
          required
          rows={8}
          maxLength={10000}
          placeholder="What happened? Include steps to reproduce if relevant."
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          By submitting, you agree to receive email replies at the address above.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Submit ticket'}
        </button>
      </div>
    </form>
  )
}
