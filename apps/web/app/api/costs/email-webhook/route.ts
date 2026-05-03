/**
 * POST /api/costs/email-webhook (Spec 7.2)
 *
 * SendGrid Inbound Parse target. Each org gets a forwarding address
 * <orgId>@bills.aircraft.us; the operator forwards bills to it; SendGrid
 * POSTs the parsed email + attachments here. We extract the org from
 * the to-address, store attachments in the cost-receipts bucket, and
 * create one intake_documents row per attachment.
 *
 * Auth: SendGrid doesn't sign Inbound Parse webhooks by default. We use
 * a shared secret in the URL query string (?key=$SENDGRID_INBOUND_KEY)
 * — match it server-side and refuse if it doesn't match. This route is
 * THE only public-internet entry point; everything else is auth-gated.
 *
 * Security:
 *   - Validate the org from the to-address (must be a known
 *     organization id — UUID match against organizations.id).
 *   - Cap total payload size at 25 MB (SendGrid's own cap is 30 MB).
 *   - Skip attachments above 10 MB or with disallowed mime types.
 *   - NEVER trust email_from for cross-org leakage; org is determined
 *     ONLY by the recipient address.
 */
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_MIME = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
])
const MAX_BYTES_PER_ATTACH = 10 * 1024 * 1024
const MAX_PAYLOAD = 25 * 1024 * 1024
// Domain pattern: <orgId>@bills.aircraft.us. Org-id is the standard UUID.
const TO_REGEX = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@bills\.aircraft\.us/i

export async function POST(req: NextRequest) {
  const expected = process.env.SENDGRID_INBOUND_KEY
  if (!expected) {
    // Defensive: refuse rather than no-op silently. Without the secret we
    // can't authenticate inbound emails, so the route stays inert.
    return NextResponse.json({ error: 'Inbound parse not configured' }, { status: 503 })
  }
  const provided = new URL(req.url).searchParams.get('key')
  if (provided !== expected) {
    return NextResponse.json({ error: 'Invalid auth' }, { status: 401 })
  }

  const contentLengthHeader = req.headers.get('content-length')
  if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_PAYLOAD) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 })

  const to = String(form.get('to') ?? '')
  const fromAddr = String(form.get('from') ?? '')
  const subject = String(form.get('subject') ?? '(no subject)')
  const m = to.match(TO_REGEX)
  if (!m) {
    return NextResponse.json({ error: 'Recipient does not match <orgId>@bills.aircraft.us' }, { status: 400 })
  }
  const orgId = m[1].toLowerCase()

  // Verify org exists. Don't leak org existence to the caller — a 404 here
  // is fine since SendGrid would only see this on a misconfigured org id.
  const service = createServiceSupabase()
  const { data: org } = await service
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ error: 'Unknown org' }, { status: 404 })

  // SendGrid Inbound Parse uploads attachments under fields named
  // attachment1, attachment2, … with attachment-info metadata.
  const created: string[] = []
  const skipped: Array<{ name: string; reason: string }> = []
  const stamp = new Date().toISOString().replace(/[^0-9T]/g, '').slice(0, 15)

  for (let i = 1; i <= 20; i++) {
    const file = form.get(`attachment${i}`)
    if (!file) break
    if (!(file instanceof File)) continue

    if (file.size > MAX_BYTES_PER_ATTACH) {
      skipped.push({ name: file.name, reason: 'too-large' })
      continue
    }
    if (!ALLOWED_MIME.has(file.type)) {
      skipped.push({ name: file.name, reason: `mime ${file.type}` })
      continue
    }

    const ext = (file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '').toLowerCase()
    const rand = crypto.randomUUID().slice(0, 8)
    const path = `${orgId}/email-${stamp}-${rand}-att${i}${ext}`
    const buf = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await service.storage
      .from('cost-receipts')
      .upload(path, buf, { contentType: file.type, upsert: false })
    if (upErr) {
      skipped.push({ name: file.name, reason: upErr.message })
      continue
    }
    const { data: pub } = service.storage.from('cost-receipts').getPublicUrl(path)

    const { data: ins, error: insErr } = await service
      .from('intake_documents')
      .insert({
        organization_id: orgId,
        // No uploaded_by — email source has no auth user. NULL FK.
        uploaded_by: null,
        source: 'email',
        filename: file.name || `email-${stamp}-att${i}${ext}`,
        storage_path: path,
        storage_url: pub?.publicUrl ?? null,
        mime_type: file.type,
        file_size_bytes: file.size,
        email_from: fromAddr.slice(0, 320),  // RFC 5321 max
        email_subject: subject.slice(0, 500),
        email_received_at: new Date().toISOString(),
        status: 'received',
      })
      .select('id')
      .single()
    if (insErr || !ins) {
      // Best-effort cleanup; don't fail the whole webhook for one row.
      await service.storage.from('cost-receipts').remove([path]).catch(() => {})
      skipped.push({ name: file.name, reason: insErr?.message ?? 'insert-failed' })
      continue
    }
    created.push((ins as { id: string }).id)
  }

  // No attachments at all? Still log a row so the operator sees that an
  // email arrived (e.g. operator emailed but forgot to attach the bill).
  if (created.length === 0 && skipped.length === 0) {
    const { data: ins } = await service
      .from('intake_documents')
      .insert({
        organization_id: orgId,
        uploaded_by: null,
        source: 'email',
        filename: '(no attachment)',
        email_from: fromAddr.slice(0, 320),
        email_subject: subject.slice(0, 500),
        email_received_at: new Date().toISOString(),
        status: 'rejected',
        error_message: 'No attachment found in inbound email',
      })
      .select('id')
      .single()
    if (ins) created.push((ins as { id: string }).id)
  }

  // Spec 7.3 — fire extraction on each newly-created intake row in
  // background. SendGrid only needs the 200 ack from this handler.
  //
  // Vercel-safe pattern: `waitUntil` from @vercel/functions keeps the
  // function alive until the promise resolves. Previous
  // `void (async () => …)()` pattern was killed when the 200 response
  // flushed. Next 15's `after()` is the equivalent helper; we're on
  // Next 14.2.
  if (created.length > 0) {
    waitUntil((async () => {
      try {
        const { runExtraction } = await import('@/lib/ai/extractors/run')
        for (const id of created) {
          await runExtraction({ intake_document_id: id })
        }
      } catch (e) {
        console.warn('[email-webhook] background extraction failed:', e)
      }
    })())
  }

  return NextResponse.json({ ok: true, created_ids: created, skipped })
}
