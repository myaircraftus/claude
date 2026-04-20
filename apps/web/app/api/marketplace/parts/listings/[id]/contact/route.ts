import { NextRequest, NextResponse } from 'next/server'
import { requireMarketplaceContext } from '../../../../_shared'

type ContactChannel = 'call' | 'text' | 'email'

function buildContactHref(channel: ContactChannel, destination: string) {
  if (channel === 'email') return `mailto:${destination}`
  if (channel === 'text') return `sms:${destination}`
  return `tel:${destination}`
}

async function loadListing(service: any, id: string) {
  const { data, error } = await service
    .from('marketplace_part_listings')
    .select('id, organization_id, status, title, contact_phone, contact_text, contact_email, contact_name, view_count, contact_click_count, call_click_count, text_click_count, email_click_count')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Record<string, unknown> | null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId, user } = ctxRes.ctx
  const listing = await loadListing(service, params.id)
  if (!listing || String(listing.organization_id ?? '') === '') {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  if (String(listing.status ?? '') !== 'available' && String(listing.organization_id ?? '') !== organizationId) {
    return NextResponse.json({ error: 'Listing not available' }, { status: 404 })
  }

  let body: { channel?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const channel = body.channel
  if (!['call', 'text', 'email'].includes(channel ?? '')) {
    return NextResponse.json({ error: 'channel must be call, text, or email' }, { status: 400 })
  }

  const destination =
    channel === 'email'
      ? String(listing.contact_email ?? '').trim()
      : channel === 'text'
        ? String(listing.contact_text ?? listing.contact_phone ?? '').trim()
        : String(listing.contact_phone ?? '').trim()

  if (!destination) {
    return NextResponse.json({ error: 'No contact destination configured for this listing' }, { status: 422 })
  }

  const viewCount = Number(listing.view_count ?? 0)
  const totalContacts = Number(listing.contact_click_count ?? 0)
  const callClicks = Number(listing.call_click_count ?? 0)
  const textClicks = Number(listing.text_click_count ?? 0)
  const emailClicks = Number(listing.email_click_count ?? 0)

  const updatePatch: Record<string, unknown> = {
    contact_click_count: totalContacts + 1,
    last_contacted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (channel === 'call') updatePatch.call_click_count = callClicks + 1
  if (channel === 'text') updatePatch.text_click_count = textClicks + 1
  if (channel === 'email') updatePatch.email_click_count = emailClicks + 1

  await Promise.all([
    service.from('marketplace_part_listings').update(updatePatch).eq('id', params.id),
    service.from('marketplace_part_contact_events').insert({
      listing_id: params.id,
      organization_id: String(listing.organization_id),
      user_id: user.id,
      channel,
      destination,
      metadata_json: {
        note: body.note ?? null,
        source: 'marketplace_listing_contact',
        current_view_count: viewCount,
      },
    }),
  ])

  const { data: updatedListing } = await service
    .from('marketplace_part_listings')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    channel,
    destination,
    href: buildContactHref(channel as ContactChannel, destination),
    listing: updatedListing ?? null,
    metrics: {
      views: viewCount,
      contacts: totalContacts + 1,
      call_clicks: channel === 'call' ? callClicks + 1 : callClicks,
      text_clicks: channel === 'text' ? textClicks + 1 : textClicks,
      email_clicks: channel === 'email' ? emailClicks + 1 : emailClicks,
    },
  })
}
