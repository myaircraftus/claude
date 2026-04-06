<!-- ================================================================
  MyAircraft — Layer B: Records Intelligence
  BATCH 2 of 3  |  1008 lines
  Covers: Sections 4–7 (Feature B continued: remaining detection rules + API routes, Feature C: Discrepancy Detection, Feature D: Report Generation, Feature E: Prebuy/Lender/Insurer Packet)
  ================================================================ -->


/**
 * RULE: Missing Required Documents
 * Registration, Airworthiness Certificate, Weight & Balance.
 */
function detectMissingRequiredDocuments(documents: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const required = [
    {
      type: 'registration',
      findingType: 'missing_registration' as const,
      label: 'Aircraft Registration (FAA Form AC 8050-1)',
      regulation: '14 CFR 91.203(a)(1)',
      severity: 'critical' as const,
    },
    {
      type: 'airworthiness_cert',
      findingType: 'missing_airworthiness_cert' as const,
      label: 'Airworthiness Certificate',
      regulation: '14 CFR 91.203(a)(1)',
      severity: 'critical' as const,
    },
    {
      type: 'weight_balance',
      findingType: 'missing_weight_balance' as const,
      label: 'Current Weight and Balance',
      regulation: '14 CFR Part 23',
      severity: 'warning' as const,
    },
  ]

  for (const req of required) {
    const hasDoc = documents.some(d => d.document_type === req.type)
    if (!hasDoc) {
      findings.push({
        finding_type: req.findingType,
        severity: req.severity,
        title: `Missing: ${req.label}`,
        description: `No ${req.label} was found in the digitized aircraft records. This document is required to be carried aboard or on file per ${req.regulation}.`,
        recommendation: `Upload a copy of the ${req.label} to complete the aircraft record file.`,
        affected_component: 'airframe',
      })
    }
  }

  return findings
}

/**
 * RULE: Missing Form 337 for Major Repairs
 * If a maintenance entry describes a major repair/alteration but no Form 337 exists.
 */
function detectMissing337ForRepairs(events: any[], documents: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const majorRepairEvents = events.filter(e =>
    e.event_type === 'major_repair' || e.event_type === 'major_alteration'
  )
  const has337 = documents.some(d => d.document_type === 'form_337')

  if (majorRepairEvents.length > 0 && !has337) {
    findings.push({
      finding_type: 'missing_form_337',
      severity: 'critical',
      title: 'Major Repair/Alteration — No Form 337 Found',
      description: `${majorRepairEvents.length} major repair or alteration event(s) found in records, but no FAA Form 337 was found in the aircraft file. FAA Form 337 is required for all major repairs and alterations under 14 CFR Part 43.`,
      recommendation: 'Locate the original Form 337 from the performing A&P/IA or the FAA Aircraft Certification Office. Submit a copy to the FAA and retain the original in the aircraft records.',
      affected_component: 'airframe',
      source_event_ids: majorRepairEvents.map(e => e.id),
    })
  }

  return findings
}

/**
 * RULE: Time Discrepancies
 * Aircraft total time should never decrease between sequential entries.
 */
function detectTimeDiscrepancies(events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const timedEvents = events
    .filter(e => e.aircraft_total_time != null)
    .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime())

  for (let i = 1; i < timedEvents.length; i++) {
    const prev = timedEvents[i - 1]
    const curr = timedEvents[i]
    if (curr.aircraft_total_time < prev.aircraft_total_time) {
      findings.push({
        finding_type: 'time_regression',
        severity: 'warning',
        title: `Time Regression Detected: ${prev.aircraft_total_time}h → ${curr.aircraft_total_time}h`,
        description: `Entry dated ${formatDate(new Date(curr.entry_date))} shows aircraft total time of ${curr.aircraft_total_time}h, which is less than the prior entry dated ${formatDate(new Date(prev.entry_date))} showing ${prev.aircraft_total_time}h. Aircraft total time should never decrease.`,
        recommendation: 'Review the original logbook pages for these entries. One of the times may be a transcription error.',
        affected_component: 'airframe',
        source_event_ids: [prev.id, curr.id],
      })
    }
  }

  return findings
}

/**
 * RULE: AD Compliance Gaps
 * ADs marked 'open' or 'unknown' should surface as findings.
 */
function detectAdComplianceGaps(adRecords: any[], events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const openAds = adRecords.filter(a => a.compliance_status === 'open')
  const unknownAds = adRecords.filter(a => a.compliance_status === 'unknown')

  if (openAds.length > 0) {
    findings.push({
      finding_type: 'missing_ad_compliance_record',
      severity: 'critical',
      title: `${openAds.length} Open Airworthiness Directive(s)`,
      description: `${openAds.length} applicable Airworthiness Directive(s) are marked as open (not complied with): ${openAds.map(a => a.ad_number).join(', ')}. Aircraft may not be operated with open ADs.`,
      recommendation: 'Review each open AD with a licensed A&P/IA and comply as required.',
      affected_component: 'airframe',
    })
  }

  if (unknownAds.length > 0) {
    findings.push({
      finding_type: 'missing_ad_compliance_record',
      severity: 'warning',
      title: `${unknownAds.length} AD(s) With Unknown Compliance Status`,
      description: `${unknownAds.length} applicable AD(s) do not have a verified compliance record in the aircraft file: ${unknownAds.map(a => a.ad_number).join(', ')}.`,
      recommendation: 'Search the logbooks for compliance entries for each AD. If no record exists, consult an A&P/IA.',
      affected_component: 'airframe',
    })
  }

  return findings
}

// --- Date formatting helpers ---
function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}
function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}
function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}
```

### API Route: `app/api/aircraft/[id]/detect-findings/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectMissingRecords } from '@/lib/intelligence/detectMissingRecords'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', params.id)
    .single()

  if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const runId = await detectMissingRecords({
    aircraftId: aircraft.id,
    organizationId: aircraft.organization_id,
    triggeredBy: user.id,
    triggerSource: 'manual',
  })

  return NextResponse.json({ run_id: runId })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get latest findings run for this aircraft
  const { data: latestRun } = await supabase
    .from('findings_runs')
    .select('*')
    .eq('aircraft_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!latestRun) return NextResponse.json({ findings: [], run: null })

  const { data: findings } = await supabase
    .from('record_findings')
    .select('*')
    .eq('findings_run_id', latestRun.id)
    .eq('is_resolved', false)
    .order('severity', { ascending: true }) // critical first

  return NextResponse.json({ findings, run: latestRun })
}
```

---

## 5. Feature C: Discrepancy Detection

This runs as part of the detection engine above via `detectTimeDiscrepancies()` and can be extended with additional AI-powered analysis via the following route.

### API Route: `app/api/aircraft/[id]/analyze-discrepancies/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pull last 50 maintenance events for AI analysis
  const { data: events } = await supabase
    .from('maintenance_events')
    .select('entry_date, event_type, aircraft_total_time, work_description, certifying_mechanic_cert')
    .eq('aircraft_id', params.id)
    .order('entry_date', { ascending: true })
    .limit(50)

  if (!events?.length) return NextResponse.json({ discrepancies: [] })

  const eventSummary = events.map(e =>
    `${e.entry_date} | ${e.event_type} | TTAF: ${e.aircraft_total_time ?? 'N/A'} | Cert: ${e.certifying_mechanic_cert ?? 'N/A'} | "${e.work_description?.substring(0, 100)}"`
  ).join('\n')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: `You are an aviation records analyst with expertise in FAA regulations and aircraft logbook standards.
      Analyze the following aircraft maintenance log entries for discrepancies, inconsistencies, or red flags.
      Focus on: time anomalies, missing signatures, conflicting information, regulatory compliance gaps, and anything unusual.
      Return a JSON array of findings with fields: type, severity (critical/warning/info), title, description.
      Be specific and cite the dates/times involved.`
    }, {
      role: 'user',
      content: `Analyze these maintenance log entries for discrepancies:\n\n${eventSummary}`
    }],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
  })

  const result = JSON.parse(completion.choices[0].message.content ?? '{"findings":[]}')

  return NextResponse.json({ discrepancies: result.findings ?? [] })
}
```

---

## 6. Feature D: Report Generation System

### Architecture

Reports are generated asynchronously. The flow is:
1. Client calls `POST /api/reports` → creates a `report_jobs` record in `queued` state
2. The API immediately triggers report generation in the background
3. Report is generated by `lib/intelligence/generateReport.ts`
4. PDF is written to Supabase Storage
5. `report_jobs` updated to `completed` with storage path and signed URL
6. Client polls `GET /api/reports/[jobId]` or uses realtime subscription

### File: `lib/intelligence/generateReport.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { generateAircraftOverviewReport } from './reports/aircraftOverview'
import { generateEngineReport } from './reports/engineReport'
import { generateInspectionReport } from './reports/inspectionReport'
import { generateTimelineReport } from './reports/timelineReport'
import { generateMissingRecordsReport } from './reports/missingRecordsReport'
import { generatePrebuyPacket } from './reports/prebuyPacket'

export type ReportType =
  | 'aircraft_overview'
  | 'engine_prop_summary'
  | 'inspection_status'
  | 'maintenance_timeline'
  | 'missing_records'
  | 'prebuy_packet'
  | 'lender_packet'
  | 'insurer_packet'

export async function generateReport(jobId: string): Promise<void> {
  const supabase = createClient()

  const { data: job } = await supabase
    .from('report_jobs')
    .select('*, aircraft:aircraft_id(*)')
    .eq('id', jobId)
    .single()

  if (!job) throw new Error(`Report job ${jobId} not found`)

  await supabase.from('report_jobs').update({
    status: 'generating',
    generation_started_at: new Date().toISOString(),
  }).eq('id', jobId)

  try {
    let pdfBuffer: Buffer

    switch (job.report_type as ReportType) {
      case 'aircraft_overview':
        pdfBuffer = await generateAircraftOverviewReport(job.aircraft_id, job.options)
        break
      case 'engine_prop_summary':
        pdfBuffer = await generateEngineReport(job.aircraft_id, job.options)
        break
      case 'inspection_status':
        pdfBuffer = await generateInspectionReport(job.aircraft_id, job.options)
        break
      case 'maintenance_timeline':
        pdfBuffer = await generateTimelineReport(job.aircraft_id, job.options)
        break
      case 'missing_records':
        pdfBuffer = await generateMissingRecordsReport(job.aircraft_id, job.options)
        break
      case 'prebuy_packet':
      case 'lender_packet':
      case 'insurer_packet':
        pdfBuffer = await generatePrebuyPacket(job.aircraft_id, job.report_type, job.options)
        break
      default:
        throw new Error(`Unknown report type: ${job.report_type}`)
    }

    // Store PDF
    const fileName = `reports/${job.aircraft_id}/${jobId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('aircraft-reports')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) throw uploadError

    // Create signed URL (valid 7 days)
    const { data: { signedUrl } } = await supabase.storage
      .from('aircraft-reports')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7)

    await supabase.from('report_jobs').update({
      status: 'completed',
      storage_path: fileName,
      signed_url: signedUrl,
      signed_url_expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000).toISOString(),
      file_size_bytes: pdfBuffer.length,
      generation_completed_at: new Date().toISOString(),
    }).eq('id', jobId)

  } catch (err: any) {
    await supabase.from('report_jobs').update({
      status: 'failed',
      error_message: err?.message ?? 'Generation failed',
      generation_completed_at: new Date().toISOString(),
    }).eq('id', jobId)
    throw err
  }
}
```

### File: `lib/intelligence/reports/aircraftOverview.ts`

```typescript
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { renderReportToPDF } from '@/lib/intelligence/reports/pdfRenderer'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateAircraftOverviewReport(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const supabase = createClient()

  const [
    { data: aircraft },
    { data: status },
    { data: events },
    { data: findings },
  ] = await Promise.all([
    supabase.from('aircraft').select('*').eq('id', aircraftId).single(),
    supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single(),
    supabase.from('maintenance_events').select('*').eq('aircraft_id', aircraftId).order('entry_date', { ascending: false }).limit(20),
    supabase.from('record_findings').select('*').eq('aircraft_id', aircraftId).eq('is_resolved', false).order('severity'),
  ])

  // Build narrative summary with GPT-4o
  const narrativePrompt = `
You are writing an Aircraft Overview Report for ${aircraft?.make} ${aircraft?.model} (${aircraft?.tail_number}).
Aircraft data: Serial ${aircraft?.serial_number}, Engine: ${aircraft?.engine_make} ${aircraft?.engine_model}.
Current total time: ${status?.airframe_total_time ?? 'Unknown'}h.
Annual status: ${status?.annual_is_current ? 'Current' : 'OVERDUE'}, last annual: ${status?.last_annual_date ?? 'Unknown'}.
Engine time since overhaul: ${status?.engine_time_since_overhaul ?? 'Unknown'}h.
AD compliance: ${status?.ads_complied ?? 0} complied, ${status?.ads_open ?? 0} open, ${status?.ads_unknown ?? 0} unknown.
Recent maintenance summary: ${events?.slice(0, 5).map(e => `${e.entry_date}: ${e.event_type}`).join('; ')}.
Findings: ${findings?.length ?? 0} open issues (${findings?.filter(f => f.severity === 'critical').length ?? 0} critical).

Write a concise 2-3 paragraph executive summary of this aircraft's maintenance status.
Be factual. Note the overall health, key dates, and any significant concerns.
Write for an aircraft owner or buyer — not a mechanic.
`
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: narrativePrompt }],
    max_tokens: 500,
  })

  const narrative = completion.choices[0].message.content ?? ''

  // Assemble report data structure
  const reportData = {
    reportType: 'Aircraft Overview Report',
    generatedAt: new Date().toISOString(),
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
      engineSerial: aircraft?.engine_serial,
    },
    narrative,
    status: {
      airframeTotalTime: status?.airframe_total_time,
      annualIsCurrent: status?.annual_is_current,
      annualNextDue: status?.annual_next_due_date,
      engineTimeSinceOverhaul: status?.engine_time_since_overhaul,
      eltIsCurrent: status?.elt_is_current,
      transponderIsCurrent: status?.transponder_is_current,
      adsOpen: status?.ads_open,
      adsComplied: status?.ads_complied,
      healthScore: status?.health_score,
    },
    findings: findings?.map(f => ({
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
    })),
    recentMaintenance: events?.slice(0, 10).map(e => ({
      date: e.entry_date,
      type: e.event_type,
      summary: e.work_summary,
      mechanic: e.certifying_mechanic_name,
    })),
  }

  return renderReportToPDF(reportData, 'aircraft_overview')
}
```

### File: `lib/intelligence/reports/pdfRenderer.ts`

```typescript
// PDF rendering using puppeteer-core + @sparticuz/chromium for Vercel compatibility
// Install: npm install puppeteer-core @sparticuz/chromium

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

export async function renderReportToPDF(
  data: Record<string, unknown>,
  template: string
): Promise<Buffer> {
  const html = buildReportHTML(data, template)

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })

  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })

  const pdf = await page.pdf({
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' },
  })

  await browser.close()
  return Buffer.from(pdf)
}

function buildReportHTML(data: Record<string, unknown>, template: string): string {
  const aircraft = data.aircraft as any
  const status = data.status as any
  const findings = (data.findings as any[]) ?? []
  const recentMaintenance = (data.recentMaintenance as any[]) ?? []

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #111; line-height: 1.5; }
  .header { background: #0f172a; color: white; padding: 24px 32px; margin-bottom: 24px; }
  .header h1 { font-size: 20pt; margin: 0 0 4px 0; }
  .header .subtitle { font-size: 10pt; opacity: 0.7; }
  .section { margin-bottom: 24px; padding: 0 32px; }
  .section h2 { font-size: 13pt; font-weight: 600; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 14px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; }
  .stat-label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
  .stat-value { font-size: 14pt; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .finding { border-left: 4px solid #94a3b8; padding: 10px 14px; margin-bottom: 8px; background: #f8fafc; border-radius: 0 4px 4px 0; }
  .finding.critical { border-left-color: #ef4444; background: #fef2f2; }
  .finding.warning { border-left-color: #f59e0b; background: #fffbeb; }
  .finding-title { font-weight: 600; font-size: 10pt; }
  .finding-desc { font-size: 9.5pt; color: #374151; margin-top: 3px; }
  .status-ok { color: #16a34a; font-weight: 600; }
  .status-warn { color: #d97706; font-weight: 600; }
  .status-bad { color: #dc2626; font-weight: 600; }
  .timeline-row { display: grid; grid-template-columns: 110px 1fr; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
  .timeline-date { font-size: 9pt; color: #64748b; }
  .narrative { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 14px 18px; font-size: 10.5pt; line-height: 1.6; margin-bottom: 24px; }
  .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 12px 32px; font-size: 8pt; color: #94a3b8; margin-top: 32px; }
  .health-score { display: inline-block; background: #0f172a; color: white; border-radius: 50%; width: 56px; height: 56px; text-align: center; line-height: 56px; font-size: 16pt; font-weight: 700; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>

<div class="header">
  <h1>${aircraft?.tailNumber ?? 'Aircraft'} — ${data.reportType}</h1>
  <div class="subtitle">${aircraft?.makeModel} · S/N ${aircraft?.serialNumber} · Generated ${new Date(data.generatedAt as string).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</div>

${data.narrative ? `<div class="section"><div class="narrative">${data.narrative}</div></div>` : ''}

<div class="section">
  <h2>Aircraft Status</h2>
  <div class="grid-2">
    <div class="stat-box">
      <div class="stat-label">Aircraft Total Time</div>
      <div class="stat-value">${status?.airframeTotalTime ? `${status.airframeTotalTime.toLocaleString()}h` : '—'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Engine SMOH</div>
      <div class="stat-value">${status?.engineTimeSinceOverhaul ? `${status.engineTimeSinceOverhaul.toLocaleString()}h` : '—'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Annual Inspection</div>
      <div class="stat-value ${status?.annualIsCurrent ? 'status-ok' : 'status-bad'}">
        ${status?.annualIsCurrent ? '✓ Current' : '✗ OVERDUE'}
      </div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Open ADs</div>
      <div class="stat-value ${(status?.adsOpen ?? 0) > 0 ? 'status-bad' : 'status-ok'}">
        ${status?.adsOpen ?? 0} Open
      </div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Transponder</div>
      <div class="stat-value ${status?.transponderIsCurrent ? 'status-ok' : 'status-warn'}">
        ${status?.transponderIsCurrent ? '✓ Current' : '⚠ Check'}
      </div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Record Health Score</div>
      <div class="stat-value">
        <span class="health-score">${status?.healthScore ?? '—'}</span>
      </div>
    </div>
  </div>
</div>

${findings.length > 0 ? `
<div class="section">
  <h2>Open Findings (${findings.length})</h2>
  ${findings.map(f => `
    <div class="finding ${f.severity}">
      <div class="finding-title">${f.severity.toUpperCase()}: ${f.title}</div>
      <div class="finding-desc">${f.description}</div>
      ${f.recommendation ? `<div class="finding-desc" style="margin-top:4px;font-style:italic;">→ ${f.recommendation}</div>` : ''}
    </div>
  `).join('')}
</div>
` : ''}

${recentMaintenance.length > 0 ? `
<div class="section">
  <h2>Recent Maintenance</h2>
  ${recentMaintenance.map(e => `
    <div class="timeline-row">
      <div class="timeline-date">${e.date}</div>
      <div>${e.summary ?? e.type}${e.mechanic ? ` <span style="color:#94a3b8">— ${e.mechanic}</span>` : ''}</div>
    </div>
  `).join('')}
</div>
` : ''}

<div class="footer">
  Generated by MyAircraft · myaircraft.us · This report is based on digitized records and should be verified against original source documents. Not a substitute for an FAA-recognized inspection.
</div>
</body>
</html>`
}
```

### API Route: `app/api/reports/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateReport } from '@/lib/intelligence/generateReport'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { aircraft_id, report_type, options } = body

  if (!aircraft_id || !report_type) {
    return NextResponse.json({ error: 'aircraft_id and report_type required' }, { status: 400 })
  }

  // Verify access
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', aircraft_id)
    .single()

  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  // Create the job
  const { data: job } = await supabase
    .from('report_jobs')
    .insert({
      aircraft_id,
      organization_id: aircraft.organization_id,
      requested_by: user.id,
      report_type,
      options: options ?? {},
      status: 'queued',
    })
    .select()
    .single()

  if (!job) return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })

  // Trigger generation (fire-and-forget — do not await in the request handler)
  // In production, use a Supabase Edge Function or background job queue
  // For now, use waitUntil pattern with Vercel
  generateReport(job.id).catch(err => {
    console.error(`Report generation failed for job ${job.id}:`, err)
  })

  return NextResponse.json({ job_id: job.id, status: 'queued' })
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const aircraftId = searchParams.get('aircraft_id')

  const query = supabase
    .from('report_jobs')
    .select('*')
    .order('created_at', { ascending: false })

  if (aircraftId) query.eq('aircraft_id', aircraftId)

  const { data: jobs } = await query
  return NextResponse.json({ jobs })
}
```

### API Route: `app/api/reports/[jobId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = createClient()

  // Allow public access via share token
  const { searchParams } = new URL(req.url)
  const shareToken = searchParams.get('share_token')

  let job: any

  if (shareToken) {
    const { data } = await supabase
      .from('report_jobs')
      .select('*')
      .eq('id', params.jobId)
      .eq('share_token', shareToken)
      .gt('share_token_expires_at', new Date().toISOString())
      .single()
    job = data

    if (job) {
      // Increment access counter
      await supabase
        .from('report_jobs')
        .update({ share_accessed_count: job.share_accessed_count + 1 })
        .eq('id', params.jobId)
    }
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data } = await supabase
      .from('report_jobs')
      .select('*')
      .eq('id', params.jobId)
      .single()
    job = data
  }

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Refresh signed URL if it's expiring soon (< 1 day)
  if (job.status === 'completed' && job.storage_path) {
    const expiresAt = new Date(job.signed_url_expires)
    if (expiresAt.getTime() - Date.now() < 86400000) {
      const supabaseAdmin = createClient() // use service role for storage
      const { data: { signedUrl } } = await supabaseAdmin.storage
        .from('aircraft-reports')
        .createSignedUrl(job.storage_path, 60 * 60 * 24 * 7)
      await supabaseAdmin.from('report_jobs').update({
        signed_url: signedUrl,
        signed_url_expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000).toISOString(),
      }).eq('id', params.jobId)
      job.signed_url = signedUrl
    }
  }

  return NextResponse.json({ job })
}
```

---

## 7. Feature E: Prebuy / Lender / Insurer Packet

### Overview

The prebuy packet is a premium product sold as a one-time purchase. It generates a comprehensive, professionally formatted PDF summary designed for aircraft buyers, lenders, or insurance underwriters who need a quick but thorough assessment of an aircraft's records.

### File: `lib/intelligence/reports/prebuyPacket.ts`

```typescript
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { renderReportToPDF } from './pdfRenderer'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type PacketAudience = 'prebuy_packet' | 'lender_packet' | 'insurer_packet'

export async function generatePrebuyPacket(
  aircraftId: string,
  audience: PacketAudience,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const supabase = createClient()

  const [
    { data: aircraft },
    { data: status },
    { data: events },
    { data: findings },
    { data: adRecords },
    { data: documents },
  ] = await Promise.all([
    supabase.from('aircraft').select('*').eq('id', aircraftId).single(),
    supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single(),
    supabase.from('maintenance_events').select('*').eq('aircraft_id', aircraftId).order('entry_date', { ascending: true }),
    supabase.from('record_findings').select('*').eq('aircraft_id', aircraftId).eq('is_resolved', false).order('severity'),
    supabase.from('aircraft_ad_applicability').select('*').eq('aircraft_id', aircraftId),
    supabase.from('documents').select('id, document_type, title').eq('aircraft_id', aircraftId),
  ])

  // Identify major events
  const majorRepairs = events?.filter(e => ['major_repair', 'major_alteration'].includes(e.event_type)) ?? []
  const engineOverhauls = events?.filter(e => ['engine_overhaul', 'engine_replacement'].includes(e.event_type)) ?? []
  const propOverhauls = events?.filter(e => ['prop_overhaul', 'prop_replacement'].includes(e.event_type)) ?? []
  const annuals = events?.filter(e => e.event_type === 'annual_inspection') ?? []

  // Detect damage history indicators (major repairs to primary structure)
  const damageIndicators = majorRepairs.filter(e => {
    const desc = (e.work_description ?? '').toLowerCase()
    return desc.includes('damage') || desc.includes('bent') || desc.includes('fire') ||
           desc.includes('ground loop') || desc.includes('prop strike') || desc.includes('gear collapse')
  })

  // Build audience-specific executive summary
  const audienceContext = {
    prebuy_packet: 'You are preparing a prebuy inspection summary for an aircraft buyer. Focus on airworthiness risks, value-affecting issues, and what a buyer should know.',
    lender_packet: 'You are preparing a collateral assessment for an aircraft lender. Focus on document completeness, compliance status, and factors affecting the aircraft as loan security.',
    insurer_packet: 'You are preparing an underwriting summary for an aviation insurance company. Focus on maintenance history, accident/incident indicators, compliance status, and risk factors.',
  }

  const executiveSummaryPrompt = `
${audienceContext[audience]}

Aircraft: ${aircraft?.make} ${aircraft?.model} (${aircraft?.tail_number}), S/N ${aircraft?.serial_number}, Year ${aircraft?.year}
Engine: ${aircraft?.engine_make} ${aircraft?.engine_model}
Total Time: ${status?.airframe_total_time ?? 'Unknown'}h
Engine SMOH: ${status?.engine_time_since_overhaul ?? 'Unknown'}h
Annual Status: ${status?.annual_is_current ? 'Current' : 'OVERDUE'}, last ${status?.last_annual_date}
AD Status: ${status?.ads_complied} complied, ${status?.ads_open} open, ${status?.ads_unknown} unknown
Major Repairs: ${majorRepairs.length}
Damage Indicators: ${damageIndicators.length}
Open Findings: ${findings?.length ?? 0} (${findings?.filter(f => f.severity === 'critical').length ?? 0} critical)

Write a concise 3-4 paragraph executive summary for this aircraft. Be specific, accurate, and clear about any risks or concerns.
Flag the most important issues in the first paragraph.
`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: executiveSummaryPrompt }],
    max_tokens: 600,
  })
  const executiveSummary = completion.choices[0].message.content ?? ''

  // Risk rating
  const criticalCount = findings?.filter(f => f.severity === 'critical').length ?? 0
  const warningCount = findings?.filter(f => f.severity === 'warning').length ?? 0
  const openAdCount = status?.ads_open ?? 0
  const damageCount = damageIndicators.length

  let riskRating: 'Low' | 'Medium' | 'High' | 'Critical'
  let riskColor: string
  if (criticalCount > 2 || openAdCount > 0 || damageCount > 1) {
    riskRating = 'High'; riskColor = '#dc2626'
  } else if (criticalCount > 0 || warningCount > 3 || damageCount > 0) {
    riskRating = 'Medium'; riskColor = '#d97706'
  } else {
    riskRating = 'Low'; riskColor = '#16a34a'
  }

  const reportData = {
    reportType: audience === 'prebuy_packet' ? 'Prebuy Summary Packet'
      : audience === 'lender_packet' ? 'Lender Collateral Summary'
      : 'Insurance Underwriting Summary',
    generatedAt: new Date().toISOString(),
    audience,
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
      engineSerial: aircraft?.engine_serial,
    },
    executiveSummary,
    riskRating,
    riskColor,
    status: {
      airframeTotalTime: status?.airframe_total_time,
      engineTimeSinceOverhaul: status?.engine_time_since_overhaul,
      propTimeSinceOverhaul: status?.prop_time_since_overhaul,
      annualIsCurrent: status?.annual_is_current,
      annualNextDue: status?.annual_next_due_date,
      lastAnnualDate: status?.last_annual_date,
      eltIsCurrent: status?.elt_is_current,
      transponderIsCurrent: status?.transponder_is_current,
      pitotStaticIsCurrent: status?.pitot_static_is_current,
      adsComplied: status?.ads_complied,
      adsOpen: status?.ads_open,
      adsUnknown: status?.ads_unknown,
      hasRegistration: status?.has_registration,
      hasAirworthinessCert: status?.has_airworthiness_cert,
      hasWeightBalance: status?.has_weight_balance,
      healthScore: status?.health_score,
    },
    majorEvents: {
      annualCount: annuals.length,
      lastAnnual: annuals[annuals.length - 1],
      engineOverhauls: engineOverhauls.map(e => ({
        date: e.entry_date,
        aircraftTime: e.aircraft_total_time,
        summary: e.work_summary,
      })),
      propOverhauls: propOverhauls.map(e => ({
        date: e.entry_date,
        summary: e.work_summary,
      })),
      majorRepairs: majorRepairs.map(e => ({
        date: e.entry_date,
        summary: e.work_summary,
        description: e.work_description,
      })),
      damageIndicators: damageIndicators.map(e => ({
        date: e.entry_date,
        summary: e.work_summary,
        description: e.work_description,
      })),
    },
    findings: findings?.map(f => ({
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
    })),
    adSummary: {
      total: adRecords?.length ?? 0,
      complied: status?.ads_complied ?? 0,
      open: status?.ads_open ?? 0,
      unknown: status?.ads_unknown ?? 0,
      openAds: adRecords?.filter(a => a.compliance_status === 'open').map(a => a.ad_number),
    },
    documentChecklist: {
      hasRegistration: status?.has_registration,
      hasAirworthinessCert: status?.has_airworthiness_cert,
      hasWeightBalance: status?.has_weight_balance,
      hasForm337s: documents?.some(d => d.document_type === 'form_337'),
      hasEngineLogbooks: documents?.some(d => d.document_type === 'engine_log'),
      hasAirframeLogbooks: documents?.some(d => d.document_type === 'airframe_log'),
      hasPropLogbooks: documents?.some(d => d.document_type === 'prop_log'),
    },
  }

  return renderReportToPDF(reportData, 'prebuy_packet')
}
```

### API Route: `app/api/reports/share/route.ts`

```typescript
// Generates a shareable link for a completed report (for prebuy/lender/insurer packets)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { job_id, expires_days = 30 } = await req.json()

  const { data: job } = await supabase
    .from('report_jobs')
    .select('id, status, aircraft_id')
    .eq('id', job_id)
    .single()

  if (!job || job.status !== 'completed') {
    return NextResponse.json({ error: 'Report not ready' }, { status: 400 })
  }

  const shareToken = uuidv4()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expires_days)

  await supabase.from('report_jobs').update({
    share_token: shareToken,
    share_token_expires_at: expiresAt.toISOString(),
  }).eq('id', job_id)

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reports/${job_id}?share_token=${shareToken}`

  return NextResponse.json({ share_url: shareUrl, expires_at: expiresAt.toISOString() })
}
```
