// PDF rendering using puppeteer-core + @sparticuz/chromium for Vercel compatibility

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export async function renderReportToPDF(
  data: Record<string, unknown>,
  template: string
): Promise<Buffer> {
  const html = buildReportHTML(data, template)

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless as any,
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
  const executiveSummary = (data.executiveSummary ?? data.narrative) as string | undefined
  const riskRating = data.riskRating as string | undefined
  const riskColor = (data.riskColor as string) ?? '#64748b'
  const majorEvents = data.majorEvents as any
  const adSummary = data.adSummary as any
  const documentChecklist = data.documentChecklist as any

  return `<!DOCTYPE html>
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
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; }
  .stat-label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
  .stat-value { font-size: 14pt; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .finding { border-left: 4px solid #94a3b8; padding: 10px 14px; margin-bottom: 8px; background: #f8fafc; border-radius: 0 4px 4px 0; }
  .finding.critical { border-left-color: #ef4444; background: #fef2f2; }
  .finding.warning { border-left-color: #f59e0b; background: #fffbeb; }
  .finding.info { border-left-color: #3b82f6; background: #eff6ff; }
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
  .risk-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-weight: 700; font-size: 11pt; color: white; }
  .checklist-item { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 10pt; }
  .check-yes { color: #16a34a; font-weight: 700; }
  .check-no { color: #dc2626; font-weight: 700; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>

<div class="header">
  <h1>${aircraft?.tailNumber ?? 'Aircraft'} — ${data.reportType}</h1>
  <div class="subtitle">${aircraft?.makeModel} · S/N ${aircraft?.serialNumber ?? '—'} · Generated ${new Date(data.generatedAt as string).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</div>

${riskRating ? `
<div class="section">
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
    <span class="risk-badge" style="background:${riskColor}">${riskRating} Risk</span>
    <span style="font-size:10pt;color:#64748b;">Overall record assessment based on digitized documents</span>
  </div>
</div>` : ''}

${executiveSummary ? `<div class="section"><div class="narrative">${executiveSummary.replace(/\n/g, '<br>')}</div></div>` : ''}

<div class="section">
  <h2>Aircraft Status</h2>
  <div class="grid-2">
    <div class="stat-box">
      <div class="stat-label">Aircraft Total Time</div>
      <div class="stat-value">${status?.airframeTotalTime ? `${Number(status.airframeTotalTime).toLocaleString()}h` : '—'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Engine SMOH</div>
      <div class="stat-value">${status?.engineTimeSinceOverhaul ? `${Number(status.engineTimeSinceOverhaul).toLocaleString()}h` : '—'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Annual Inspection</div>
      <div class="stat-value ${status?.annualIsCurrent ? 'status-ok' : 'status-bad'}">
        ${status?.annualIsCurrent ? '✓ Current' : '✗ OVERDUE'}
        ${status?.annualNextDue ? `<div style="font-size:9pt;font-weight:400;margin-top:2px;">Due ${status.annualNextDue}</div>` : ''}
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

${majorEvents ? `
<div class="section">
  <h2>Major Events</h2>
  <div class="grid-3">
    <div class="stat-box">
      <div class="stat-label">Annual Inspections on Record</div>
      <div class="stat-value">${majorEvents.annualCount ?? '—'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Engine Overhauls</div>
      <div class="stat-value">${majorEvents.engineOverhauls?.length ?? 0}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Major Repairs</div>
      <div class="stat-value ${majorEvents.majorRepairs?.length > 0 ? 'status-warn' : ''}">${majorEvents.majorRepairs?.length ?? 0}</div>
    </div>
  </div>
  ${majorEvents.damageIndicators?.length > 0 ? `
  <div style="margin-top:12px;padding:10px 14px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:0 4px 4px 0;">
    <div style="font-weight:600;font-size:10pt;color:#dc2626;">⚠ Damage History Indicators (${majorEvents.damageIndicators.length})</div>
    ${majorEvents.damageIndicators.map((e: any) => `<div style="font-size:9.5pt;margin-top:4px;">${e.date}: ${e.summary ?? e.description?.substring(0, 80) ?? 'See records'}</div>`).join('')}
  </div>` : ''}
</div>` : ''}

${adSummary ? `
<div class="section">
  <h2>AD Compliance Summary</h2>
  <div class="grid-3">
    <div class="stat-box"><div class="stat-label">Total Applicable</div><div class="stat-value">${adSummary.total}</div></div>
    <div class="stat-box"><div class="stat-label">Complied</div><div class="stat-value status-ok">${adSummary.complied}</div></div>
    <div class="stat-box"><div class="stat-label">Open / Unknown</div><div class="stat-value ${(adSummary.open + adSummary.unknown) > 0 ? 'status-bad' : 'status-ok'}">${adSummary.open + adSummary.unknown}</div></div>
  </div>
  ${adSummary.openAds?.length > 0 ? `<div style="margin-top:8px;font-size:9.5pt;color:#dc2626;">Open ADs: ${adSummary.openAds.join(', ')}</div>` : ''}
</div>` : ''}

${documentChecklist ? `
<div class="section">
  <h2>Document Checklist</h2>
  ${[
    ['Registration', documentChecklist.hasRegistration],
    ['Airworthiness Certificate', documentChecklist.hasAirworthinessCert],
    ['Weight & Balance', documentChecklist.hasWeightBalance],
    ['FAA Form 337(s)', documentChecklist.hasForm337s],
    ['Airframe Logbooks', documentChecklist.hasAirframeLogbooks],
    ['Engine Logbooks', documentChecklist.hasEngineLogbooks],
    ['Propeller Logbooks', documentChecklist.hasPropLogbooks],
  ].map(([label, has]) => `
    <div class="checklist-item">
      <span class="${has ? 'check-yes' : 'check-no'}">${has ? '✓' : '✗'}</span>
      <span>${label}</span>
    </div>`).join('')}
</div>` : ''}

${findings.length > 0 ? `
<div class="section">
  <h2>Open Findings (${findings.length})</h2>
  ${findings.map((f: any) => `
    <div class="finding ${f.severity}">
      <div class="finding-title">${f.severity.toUpperCase()}: ${f.title}</div>
      <div class="finding-desc">${f.description}</div>
      ${f.recommendation ? `<div class="finding-desc" style="margin-top:4px;font-style:italic;">→ ${f.recommendation}</div>` : ''}
    </div>
  `).join('')}
</div>` : ''}

${recentMaintenance.length > 0 ? `
<div class="section">
  <h2>Recent Maintenance</h2>
  ${recentMaintenance.map((e: any) => `
    <div class="timeline-row">
      <div class="timeline-date">${e.date}</div>
      <div>${e.summary ?? e.type}${e.mechanic ? ` <span style="color:#94a3b8">— ${e.mechanic}</span>` : ''}</div>
    </div>
  `).join('')}
</div>` : ''}

<div class="footer">
  Generated by MyAircraft · myaircraft.us · This report is based on digitized records and should be verified against original source documents. Not a substitute for an FAA-recognized inspection.
</div>
</body>
</html>`
}
