'use client'

/**
 * Customer-side reply form on /support/tickets/[ticketNumber].
 *
 * Posts to /api/public/support/reply with the ticket_number + access_token
 * (magic link) OR relies on session auth if the customer is signed in.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  ticketNumber: string
  accessToken?: string
  disabled?: boolean
}

export function ReplyForm({ ticketNumber, accessToken, disabled }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')

  if (disabled) {
    return (
      <p className="text-sm text-muted-foreground">
        This ticket is closed. If you need more help, please open a new one.
      </p>
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/public/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_number: ticketNumber,
          access_token: accessToken,
          body: body.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Failed to send reply')
        return
      }
      setBody('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <textarea
        rows={5}
        maxLength={10000}
        placeholder="Type your reply…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2"
      />
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
          {error}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </form>
  )
}
