/**
 * POST /api/webhooks/qbo  (Spec 3.3 + 5.7 stub layer)
 *
 * Intuit posts entity-change notifications here. Body shape:
 *   { eventNotifications: [{ realmId, dataChangeEvent: { entities: [...] } }] }
 *
 * Real handler verifies HMAC-SHA256 against QBO_WEBHOOK_VERIFIER. Mock
 * client skips signature checks. On Payment.Create → trigger the same
 * pull_payments + auto-recon flow that /sync uses.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getQboClient, isQboMock } from '@/lib/integrations/qbo-client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const payload = await req.text()
  const signature = req.headers.get('intuit-signature')

  let evt
  try {
    evt = await getQboClient().parseWebhookEvent({ payload, signature })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Bad signature' }, { status: 400 })
  }

  // Best-effort: log every received event. Recon proper happens via /sync
  // pull_payments triggered by an admin or a future cron.
  console.info('[qbo/webhook]', isQboMock() ? '(mock)' : '(live)', JSON.stringify(evt).slice(0, 400))
  void createServiceSupabase()

  return NextResponse.json({ ok: true, mock: isQboMock() })
}
