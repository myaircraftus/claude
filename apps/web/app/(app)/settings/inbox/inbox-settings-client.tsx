'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Mail, Phone, Plane, AlertCircle, Loader2, Trash2, AtSign, Check, Share2 } from 'lucide-react'

type System =
  | 'flight_schedule_pro'
  | 'flight_circle'
  | 'shop_monkey'
  | 'mechanics_helper'
  | 'quickbooks'
  | 'other'

const SYSTEM_LABELS: Record<System, string> = {
  flight_schedule_pro: 'Flight Schedule Pro',
  flight_circle: 'Flight Circle',
  shop_monkey: 'ShopMonkey',
  mechanics_helper: "Mechanic's Helper",
  quickbooks: 'QuickBooks',
  other: 'Other',
}

interface InboxState {
  inbox_email: string | null
  inbox_phone: string | null
  handle: string | null
  full_name: string | null
  external_systems: Array<{
    system: System
    login_email: string
    last_synced_at: string | null
    last_error: string | null
    scrape_disabled: boolean
  }>
}

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/

type HandleStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken' | 'reserved' | 'format' | 'error'; message: string }

export function InboxSettingsClient() {
  const [data, setData] = useState<InboxState | null>(null)
  const [loading, setLoading] = useState(true)
  const [allocating, setAllocating] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addSystem, setAddSystem] = useState<System>('flight_schedule_pro')
  const [addLogin, setAddLogin] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [handleDraft, setHandleDraft] = useState('')
  const [handleStatus, setHandleStatus] = useState<HandleStatus>({ state: 'idle' })
  const [savingHandle, setSavingHandle] = useState(false)

  async function refresh() {
    const res = await fetch('/api/me/inbox')
    if (res.ok) setData(await res.json())
    setLoading(false)
  }
  useEffect(() => {
    void refresh()
  }, [])

  async function allocate() {
    setAllocating(true)
    const res = await fetch('/api/me/inbox', { method: 'POST' })
    setAllocating(false)
    if (!res.ok) {
      toast.error('Could not allocate inbox email')
      return
    }
    toast.success('Inbox email allocated')
    void refresh()
  }

  async function addCredentials() {
    if (!addLogin || !addPassword) return
    setSubmitting(true)
    const res = await fetch('/api/owner/external-systems', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: addSystem, login_email: addLogin, password: addPassword }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const err = await res.text()
      toast.error(`Failed: ${err.slice(0, 100)}`)
      return
    }
    toast.success('Credentials stored (encrypted)')
    setAddOpen(false)
    setAddLogin('')
    setAddPassword('')
    void refresh()
  }

  async function deleteCredentials(system: System) {
    if (!confirm(`Remove ${SYSTEM_LABELS[system]} credentials? Tach-time sync will stop.`)) return
    const res = await fetch(`/api/owner/external-systems?system=${system}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Removed')
      void refresh()
    }
  }

  async function copyEmail() {
    if (!data?.inbox_email) return
    await navigator.clipboard.writeText(data.inbox_email)
    toast.success('Copied')
  }

  async function copyShareCard() {
    if (!data?.inbox_email) return
    const name = data.full_name ?? 'aircraft owner'
    const shareText = `Hi — I run my aircraft records in myaircraft.us. Please cc any receipts, estimates, invoices, or reminders to ${data.inbox_email} and they'll flow straight into my logbook + AI inbox. Reply-all is fine; my real name is ${name}.`
    await navigator.clipboard.writeText(shareText)
    toast.success('Shareable note copied — paste it to your mechanic or FBO')
  }

  // Handle-availability check, debounced 350ms
  useEffect(() => {
    if (!handleDraft) {
      setHandleStatus({ state: 'idle' })
      return
    }
    const candidate = handleDraft.trim().toLowerCase()
    if (candidate === data?.handle) {
      setHandleStatus({ state: 'idle' })
      return
    }
    if (!HANDLE_RE.test(candidate)) {
      setHandleStatus({
        state: 'format',
        message: '3-32 chars, lowercase letters/numbers/dashes, must start alphanumeric',
      })
      return
    }
    setHandleStatus({ state: 'checking' })
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/me/handle-available?handle=${encodeURIComponent(candidate)}`)
        const j = (await res.json()) as {
          available?: boolean
          reason?: 'taken' | 'reserved' | 'format' | 'missing'
          message?: string
        }
        if (j.available) {
          setHandleStatus({ state: 'available' })
        } else {
          const reason = j.reason === 'taken' || j.reason === 'reserved' || j.reason === 'format'
            ? j.reason
            : 'error'
          setHandleStatus({ state: reason, message: j.message ?? 'Not available' })
        }
      } catch {
        setHandleStatus({ state: 'error', message: 'Could not check availability' })
      }
    }, 350)
    return () => clearTimeout(t)
  }, [handleDraft, data?.handle])

  async function saveHandle() {
    if (savingHandle) return
    if (handleStatus.state !== 'available') return
    setSavingHandle(true)
    const res = await fetch('/api/me/handle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: handleDraft.trim().toLowerCase() }),
    })
    setSavingHandle(false)
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(j?.error ?? 'Could not change handle')
      return
    }
    toast.success('Handle updated — your inbox email moved with it')
    setHandleDraft('')
    setHandleStatus({ state: 'idle' })
    void refresh()
  }

  if (loading || !data) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="w-4 h-4 mx-auto animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Inbox &amp; integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your myaircraft.us address is where receipts, estimates, invoices, and reminders
          land. Use it as the contact email anywhere a vendor needs one. AI agents read
          inbound mail and surface drafts in your inbox.
        </p>
      </div>

      {/* Inbox identity */}
      <section className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">Your inbox identity</div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Inbox email</div>
              {data.inbox_email ? (
                <div className="font-mono text-sm flex items-center gap-2">
                  {data.inbox_email}
                  <button
                    type="button"
                    onClick={copyEmail}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Copy"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="text-amber-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  not allocated yet
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={allocate}
              disabled={allocating}
              className="rounded-md border border-border bg-white px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
            >
              {allocating ? <Loader2 className="w-3 h-3 animate-spin" /> : data.inbox_email ? 'Re-allocate' : 'Allocate'}
            </button>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Inbox phone (SMS)</div>
              {data.inbox_phone ? (
                <div className="font-mono text-sm">{data.inbox_phone}</div>
              ) : (
                <div className="text-muted-foreground text-xs italic">
                  Not provisioned. Twilio numbers are billed per-user — ask the founder to enable
                  yours.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Change handle (also re-allocates email) */}
        <div className="pt-3 border-t border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Change handle
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">
            Current handle: <span className="font-mono">{data.handle ?? '—'}</span>. Changing it
            updates your @myaircraft.us address. The old address keeps receiving mail for 30
            days as a safety net.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center rounded-md border border-border bg-white overflow-hidden focus-within:ring-2 focus-within:ring-violet-500">
              <span className="px-2 text-muted-foreground">
                <AtSign className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                value={handleDraft}
                onChange={(e) => setHandleDraft(e.target.value.toLowerCase())}
                placeholder={data.handle ?? 'pick-your-handle'}
                className="flex-1 py-1.5 text-sm font-mono outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="px-2 text-xs text-muted-foreground">@myaircraft.us</span>
            </div>
            <button
              type="button"
              onClick={saveHandle}
              disabled={savingHandle || handleStatus.state !== 'available'}
              className="rounded-md bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              {savingHandle ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Change'}
            </button>
          </div>
          {handleStatus.state === 'checking' && (
            <div className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> checking…
            </div>
          )}
          {handleStatus.state === 'available' && (
            <div className="mt-1.5 text-[11px] text-emerald-700 flex items-center gap-1">
              <Check className="w-3 h-3" /> available — click Change to switch
            </div>
          )}
          {(handleStatus.state === 'taken' ||
            handleStatus.state === 'reserved' ||
            handleStatus.state === 'format' ||
            handleStatus.state === 'error') && (
            <div className="mt-1.5 text-[11px] text-rose-700 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {handleStatus.message}
            </div>
          )}
        </div>

        {/* Share card */}
        {data.inbox_email && (
          <div className="pt-3 border-t border-border">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Share with your mechanic or FBO
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              Anyone you give this address to can email receipts, estimates, invoices, or
              reminders. AI agents parse them, surface drafts, and you approve in one click.
              No mailbox setup on their side.
            </p>
            <button
              type="button"
              onClick={copyShareCard}
              className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-700 hover:bg-violet-100"
            >
              <Share2 className="w-3.5 h-3.5" />
              Copy share-this-email note
            </button>
          </div>
        )}
      </section>

      {/* External systems */}
      <section className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">Third-party systems</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              An AI agent logs into these on your behalf nightly and syncs tach hours. Your
              password is encrypted at rest with a server-side key (envelope encryption); we
              never see the plaintext after you submit.
            </p>
          </div>
          {!addOpen && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-md bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5"
            >
              Add system
            </button>
          )}
        </div>

        {addOpen && (
          <div className="rounded-md border border-violet-200 bg-violet-50 p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs">
                <span className="block text-muted-foreground mb-0.5">System</span>
                <select
                  value={addSystem}
                  onChange={(e) => setAddSystem(e.target.value as System)}
                  className="w-full border border-border rounded px-2 py-1 text-sm bg-white"
                >
                  {Object.entries(SYSTEM_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="block text-muted-foreground mb-0.5">Login email</span>
                <input
                  type="email"
                  value={addLogin}
                  onChange={(e) => setAddLogin(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1 text-sm bg-white"
                  autoComplete="off"
                />
              </label>
              <label className="text-xs">
                <span className="block text-muted-foreground mb-0.5">Password</span>
                <input
                  type="password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1 text-sm bg-white"
                  autoComplete="new-password"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addCredentials}
                disabled={submitting || !addLogin || !addPassword}
                className="text-xs px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white font-semibold disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Store (encrypted)'}
              </button>
            </div>
          </div>
        )}

        {data.external_systems.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            No systems wired up. The browser-automation scraper sync runs nightly only on
            systems you add here.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.external_systems.map((s) => (
              <li key={s.system} className="py-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Plane className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{SYSTEM_LABELS[s.system] ?? s.system}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                    {s.login_email}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2">
                    {s.last_synced_at ? (
                      <>last synced {new Date(s.last_synced_at).toLocaleString()}</>
                    ) : (
                      <span className="italic">not synced yet</span>
                    )}
                    {s.last_error && (
                      <span className="text-rose-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {s.last_error}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteCredentials(s.system)}
                  className="text-rose-600 hover:text-rose-700 p-1.5 rounded-md hover:bg-rose-50"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
