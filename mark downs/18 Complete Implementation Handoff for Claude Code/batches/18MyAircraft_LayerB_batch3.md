<!-- ================================================================
  MyAircraft — Layer B: Records Intelligence
  BATCH 3 of 3  |  432 lines
  Covers: Sections 8–12 + Env (API Routes Reference, UI Components, Stripe Billing, TypeScript Types, Build Order, Environment Variables)
  ================================================================ -->


---

## 8. API Routes Reference

Complete list of new routes added by Layer B.

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `GET` | `/api/aircraft/[id]/compute-status` | Org member | Get current computed status |
| `POST` | `/api/aircraft/[id]/compute-status` | Org member | Recompute and refresh status |
| `GET` | `/api/aircraft/[id]/detect-findings` | Org member | Get latest findings run results |
| `POST` | `/api/aircraft/[id]/detect-findings` | Org member | Run missing-record detection |
| `POST` | `/api/aircraft/[id]/analyze-discrepancies` | Org member | AI-powered discrepancy analysis |
| `GET` | `/api/reports` | Org member | List report jobs for org |
| `POST` | `/api/reports` | Org member | Queue a new report |
| `GET` | `/api/reports/[jobId]` | Org member or share token | Get report job status + download URL |
| `POST` | `/api/reports/share` | Org member | Generate shareable link |

---

## 9. UI Components and Pages

### Page: `app/(dashboard)/aircraft/[id]/intelligence/page.tsx`

This is the main Layer B dashboard tab for an aircraft. Add it alongside the existing aircraft detail tabs.

```typescript
// The Intelligence tab shows:
// 1. Health Score badge and breakdown
// 2. Computed Status cards (time, currency, AD status)
// 3. Open Findings list (with resolve/acknowledge actions)
// 4. Report generation panel (generate any of the 6 report types)
// 5. Generated reports history with download links
```

**Sections to build in this page:**

**Status Cards Row** — Use `aircraft_computed_status` data. Show: TTAF, Engine SMOH, Annual status (with days-to-expiry or days-overdue), ELT/Transponder/Pitot-Static currency badges. Color-coded: green = current, amber = within 60 days, red = overdue.

**Health Score Widget** — A circular score out of 100 with a breakdown tooltip showing each component (annual, ELT, transponder, ADs, required docs). Use a ring chart (Recharts `RadialBarChart`).

**Findings Panel** — Grouped by severity. Each finding card shows: severity badge, title, description, recommendation, and Resolve / Acknowledge action buttons. Show count of critical/warning/info at top.

**Report Generator** — A panel with a grid of report type buttons (Aircraft Overview, Engine & Prop, Inspection Status, Maintenance Timeline, Missing Records, Prebuy Packet). Clicking one queues the job. Show a spinner while generating. When complete, show a Download PDF button.

**Generated Reports History** — Table of past reports with type, date generated, and download link.

### Component: `components/intelligence/FindingCard.tsx`

```typescript
// Props: finding (RecordFinding), onResolve, onAcknowledge
// Renders a finding with severity-based styling
// Resolve button → opens a modal asking for resolution note
// Acknowledge button → marks as acknowledged without resolving (reviewer is aware, can't fix it)
```

### Component: `components/intelligence/ReportGeneratorPanel.tsx`

```typescript
// Props: aircraftId, existingReports
// Shows grid of report type buttons
// On click: POST /api/reports, show progress
// Polls GET /api/reports/[jobId] every 3 seconds until status === 'completed'
// On complete: shows Download button with signed URL
// For prebuy/lender/insurer: triggers payment modal before generation (Feature 10)
```

### Component: `components/intelligence/ComputedStatusGrid.tsx`

```typescript
// Props: status (AircraftComputedStatus)
// Shows the full set of currency indicators
// Each item: label, last done date, next due date, status badge
// Recompute button → POST /api/aircraft/[id]/compute-status
```

---

## 10. Stripe Billing Extensions

### New Products to Create in Stripe

Create these as one-time price products (not subscriptions) in your Stripe dashboard:

| Product | Price | Stripe Product ID (set in env) |
|---------|-------|-------------------------------|
| Prebuy Summary Packet | $99 | `STRIPE_PRODUCT_PREBUY` |
| Lender Collateral Report | $149 | `STRIPE_PRODUCT_LENDER` |
| Insurance Underwriting Summary | $149 | `STRIPE_PRODUCT_INSURER` |

### API Route: `app/api/billing/report-checkout/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

const PRODUCT_MAP: Record<string, string> = {
  prebuy_packet: process.env.STRIPE_PRODUCT_PREBUY!,
  lender_packet: process.env.STRIPE_PRODUCT_LENDER!,
  insurer_packet: process.env.STRIPE_PRODUCT_INSURER!,
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { aircraft_id, report_type } = await req.json()
  const priceId = PRODUCT_MAP[report_type]
  if (!priceId) return NextResponse.json({ error: 'Invalid report type for purchase' }, { status: 400 })

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id, name')
    .eq('id', (await supabase.from('aircraft').select('organization_id').eq('id', aircraft_id).single()).data?.organization_id)
    .single()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: org?.stripe_customer_id,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      aircraft_id,
      report_type,
      user_id: user.id,
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/aircraft/${aircraft_id}/intelligence?report_purchased=true&report_type=${report_type}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/aircraft/${aircraft_id}/intelligence`,
  })

  return NextResponse.json({ checkout_url: session.url })
}
```

### Stripe Webhook Handler — Add to existing `app/api/webhooks/stripe/route.ts`

```typescript
// Add this case to the existing Stripe webhook handler
// Inside the switch(event.type) block:

case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session
  const { aircraft_id, report_type, user_id } = session.metadata ?? {}

  if (aircraft_id && report_type && user_id) {
    // Create the report job, marked as paid
    const { data: job } = await supabase.from('report_jobs').insert({
      aircraft_id,
      organization_id: (await supabase.from('aircraft').select('organization_id').eq('id', aircraft_id).single()).data?.organization_id,
      requested_by: user_id,
      report_type,
      is_paid: true,
      stripe_payment_intent_id: session.payment_intent as string,
      status: 'queued',
    }).select().single()

    if (job) {
      // Trigger generation
      generateReport(job.id).catch(console.error)
    }
  }
  break
}
```

---

## 11. TypeScript Types Reference

### File: `types/intelligence.ts`

```typescript
export interface AircraftComputedStatus {
  id: string
  aircraft_id: string
  organization_id: string
  computed_at: string

  airframe_total_time: number | null
  airframe_time_source_date: string | null

  engine_time_since_new: number | null
  engine_time_since_overhaul: number | null
  engine_last_overhaul_date: string | null
  engine_last_overhaul_shop: string | null
  engine_tbo_hours: number | null
  engine_hours_to_tbo: number | null

  prop_time_since_new: number | null
  prop_time_since_overhaul: number | null
  prop_last_overhaul_date: string | null

  last_annual_date: string | null
  last_annual_aircraft_time: number | null
  annual_next_due_date: string | null
  annual_is_current: boolean

  last_elt_inspection_date: string | null
  elt_next_due_date: string | null
  elt_is_current: boolean

  last_transponder_test_date: string | null
  transponder_next_due_date: string | null
  transponder_is_current: boolean

  last_pitot_static_date: string | null
  pitot_static_next_due_date: string | null
  pitot_static_is_current: boolean

  last_altimeter_date: string | null
  altimeter_next_due_date: string | null
  altimeter_is_current: boolean

  last_vor_check_date: string | null
  vor_check_next_due_date: string | null
  vor_check_is_current: boolean

  total_applicable_ads: number
  ads_complied: number
  ads_open: number
  ads_unknown: number
  next_ad_due_date: string | null
  next_ad_number: string | null

  has_registration: boolean
  registration_expiry_date: string | null
  has_airworthiness_cert: boolean
  has_weight_balance: boolean
  has_equipment_list: boolean

  health_score: number
  health_score_breakdown: Record<string, number>

  created_at: string
  updated_at: string
}

export interface RecordFinding {
  id: string
  aircraft_id: string
  organization_id: string
  findings_run_id: string

  finding_type: string
  severity: 'critical' | 'warning' | 'info'

  title: string
  description: string
  recommendation: string | null

  affected_date_start: string | null
  affected_date_end: string | null
  affected_component: string | null

  source_event_ids: string[] | null
  source_document_ids: string[] | null

  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null

  is_acknowledged: boolean
  acknowledged_at: string | null
  acknowledged_by: string | null
  acknowledge_note: string | null

  created_at: string
}

export interface FindingsRun {
  id: string
  aircraft_id: string
  organization_id: string
  triggered_by: string | null
  trigger_source: string
  status: 'running' | 'completed' | 'failed'
  findings_count: number
  critical_count: number
  warning_count: number
  info_count: number
  completed_at: string | null
  error_message: string | null
  created_at: string
}

export interface ReportJob {
  id: string
  aircraft_id: string
  organization_id: string
  requested_by: string | null

  report_type: 'aircraft_overview' | 'engine_prop_summary' | 'inspection_status' | 'maintenance_timeline' | 'missing_records' | 'prebuy_packet' | 'lender_packet' | 'insurer_packet'
  status: 'queued' | 'generating' | 'completed' | 'failed'

  options: Record<string, unknown>

  stripe_payment_intent_id: string | null
  is_paid: boolean

  share_token: string | null
  share_token_expires_at: string | null
  share_accessed_count: number

  storage_path: string | null
  signed_url: string | null
  signed_url_expires: string | null
  file_size_bytes: number | null

  generation_started_at: string | null
  generation_completed_at: string | null
  error_message: string | null

  created_at: string
  updated_at: string
}
```

---

## 12. Build Order and Dependencies

Build these features in the following order. Each phase is a mergeable unit of work.

### Phase 1 — Foundation (no UI, pure backend)

1. Apply migrations 023, 024, 025
2. Build `lib/intelligence/computeAircraftStatus.ts`
3. Add `app/api/aircraft/[id]/compute-status/route.ts`
4. Run compute status manually via API for all existing aircraft to seed data
5. Add `types/intelligence.ts`

**Test:** Call `POST /api/aircraft/{id}/compute-status` for a real aircraft. Verify `aircraft_computed_status` is populated correctly. Spot-check annual dates, engine time, AD counts.

### Phase 2 — Detection Engine

1. Build `lib/intelligence/detectMissingRecords.ts`
2. Add `app/api/aircraft/[id]/detect-findings/route.ts`
3. Build `app/api/aircraft/[id]/analyze-discrepancies/route.ts`
4. Run detection for all existing aircraft

**Test:** Run detection against an aircraft with known gaps (e.g., N262EE). Verify findings are logical, well-described, and correctly severity-rated.

### Phase 3 — PDF Infrastructure

1. Install: `npm install puppeteer-core @sparticuz/chromium`
2. Build `lib/intelligence/reports/pdfRenderer.ts`
3. Create Supabase Storage bucket `aircraft-reports` with private access
4. Build `lib/intelligence/generateReport.ts` (dispatcher)
5. Build `app/api/reports/route.ts` (queue + list)
6. Build `app/api/reports/[jobId]/route.ts` (status + signed URL)

**Test:** Queue an `aircraft_overview` report and verify the PDF is generated, stored, and accessible via the signed URL.

### Phase 4 — All Report Types

1. Build `lib/intelligence/reports/aircraftOverview.ts`
2. Build `lib/intelligence/reports/engineReport.ts`
3. Build `lib/intelligence/reports/inspectionReport.ts`
4. Build `lib/intelligence/reports/timelineReport.ts`
5. Build `lib/intelligence/reports/missingRecordsReport.ts`

**Test:** Generate all five free report types. Verify content accuracy and PDF formatting.

### Phase 5 — Prebuy Packet + Billing

1. Build `lib/intelligence/reports/prebuyPacket.ts`
2. Build `app/api/reports/share/route.ts`
3. Create Stripe products for three packet types
4. Build `app/api/billing/report-checkout/route.ts`
5. Update Stripe webhook handler
6. Add `STRIPE_PRODUCT_PREBUY`, `STRIPE_PRODUCT_LENDER`, `STRIPE_PRODUCT_INSURER` to env

**Test:** Complete a test purchase for a prebuy packet. Verify report is generated after payment webhook, share link works without auth.

### Phase 6 — UI (Intelligence Tab)

1. Build `components/intelligence/ComputedStatusGrid.tsx`
2. Build `components/intelligence/FindingCard.tsx`
3. Build `components/intelligence/ReportGeneratorPanel.tsx`
4. Build `app/(dashboard)/aircraft/[id]/intelligence/page.tsx`
5. Add Intelligence tab to aircraft detail navigation

**Test:** Full user flow — navigate to aircraft, view intelligence tab, run detection, view findings, generate a report, download PDF, generate prebuy packet (test mode payment).

### Phase 7 — Automation

1. Add post-canonicalization trigger: after `POST /api/ocr/canonicalize` completes successfully, automatically trigger `computeAircraftStatus` and `detectMissingRecords` for the affected aircraft
2. Add Supabase cron job (pg_cron) to recompute status for all aircraft nightly
3. Add UI indicator showing "Last analyzed: X hours ago" with a manual Reanalyze button

---

## Environment Variables (additions to existing .env)

```bash
# Prebuy / Report Billing (Stripe one-time products)
STRIPE_PRODUCT_PREBUY=price_...
STRIPE_PRODUCT_LENDER=price_...
STRIPE_PRODUCT_INSURER=price_...

# Puppeteer / Chromium (Vercel-compatible PDF rendering)
# @sparticuz/chromium is self-contained — no additional env vars needed
# but ensure Vercel function timeout is set to 60s for report generation routes
```

### Vercel Function Configuration (`vercel.json` additions)

```json
{
  "functions": {
    "app/api/reports/route.ts": {
      "maxDuration": 60
    },
    "app/api/reports/[jobId]/route.ts": {
      "maxDuration": 30
    },
    "app/api/aircraft/[id]/detect-findings/route.ts": {
      "maxDuration": 30
    }
  }
}
```

---

*End of Layer B Implementation Handoff — MyAircraft Records Intelligence*
*Generated April 2026 · myaircraft.us*
