// PDF rendering using puppeteer-core + @sparticuz/chromium for Vercel compatibility
// Install: pnpm add puppeteer-core @sparticuz/chromium
// These packages are loaded at runtime only (see next.config.mjs externals).
// If not installed, renderReportToPDF will throw a clear error at call time.

export async function renderReportToPDF(
  data: Record<string, unknown>,
  template: string
): Promise<Buffer> {
  const html = buildReportHTML(data, template)

  let chromium: any
  let puppeteer: any
  try {
    chromium = require('@sparticuz/chromium')
    puppeteer = require('puppeteer-core')
    if (chromium && chromium.default) chromium = chromium.default
    if (puppeteer && puppeteer.default) puppeteer = puppeteer.default
  } catch (err) {
    throw new Error(
      'PDF generation requires puppeteer-core and @sparticuz/chromium. ' +
      'Run: pnpm --filter @myaircraft/web add puppeteer-core @sparticuz/chromium'
    )
  }

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
  ${findings.map((f: any) => `
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
  ${recentMaintenance.map((e: any) => `
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
