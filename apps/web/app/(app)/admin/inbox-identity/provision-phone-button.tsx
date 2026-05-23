'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Phone } from 'lucide-react'

/**
 * Per-user "Provision SMS number" button. Prompts for an optional
 * 3-digit area code (or empty for any US local) then POSTs to
 * /api/admin/inbox/provision-phone — which talks to Twilio.
 *
 * Twilio billing happens on purchase; we make the founder confirm
 * before kicking it off.
 */
export function ProvisionPhoneButton({
  userId,
  label,
}: {
  userId: string
  label: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function provision() {
    if (busy) return
    const raw = window.prompt(
      `Provision a new Twilio SMS number for ${label}? This will buy a number (Twilio bills ~$1/mo).\n\nOptional: enter a 3-digit US area code (e.g. 415). Leave blank for any.`,
      '',
    )
    if (raw === null) return // user cancelled
    const areaCode = raw.trim()
    if (areaCode && !/^\d{3}$/.test(areaCode)) {
      toast.error('Area code must be exactly 3 digits')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/inbox/provision-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, area_code: areaCode || undefined }),
      })
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean
        inbox_phone?: string
        error?: string
        detail?: string
      } | null
      if (!res.ok) {
        toast.error(j?.error ?? `Provision failed (HTTP ${res.status})`)
        return
      }
      toast.success(`Provisioned ${j?.inbox_phone} for ${label}`)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={provision}
      disabled={busy}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors disabled:opacity-50"
      title="Buy a Twilio SMS number and wire it up to this user's inbox"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />}
      Provision SMS
    </button>
  )
}
