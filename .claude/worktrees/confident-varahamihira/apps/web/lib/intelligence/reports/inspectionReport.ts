import { createServiceSupabase } from '@/lib/supabase/server'
import { renderReportToPDF } from './pdfRenderer'

export async function generateInspectionReport(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const supabase = createServiceSupabase()

  const [{ data: aircraft }, { data: status }, { data: adRecords }] = await Promise.all([
    supabase.from('aircraft').select('*').eq('id', aircraftId).single(),
    supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single(),
    supabase.from('aircraft_ad_applicability').select('*').eq('aircraft_id', aircraftId),
  ])

  const inspectionItems = [
    {
      label: 'Annual Inspection',
      regulation: '14 CFR 91.409',
      lastDate: status?.last_annual_date,
      nextDue: status?.annual_next_due_date,
      isCurrent: status?.annual_is_current,
      interval: '12 calendar months',
    },
    {
      label: 'ELT Inspection',
      regulation: '14 CFR 91.207',
      lastDate: status?.last_elt_inspection_date,
      nextDue: status?.elt_next_due_date,
      isCurrent: status?.elt_is_current,
      interval: '24 calendar months',
    },
    {
      label: 'Transponder Test',
      regulation: '14 CFR 91.413',
      lastDate: status?.last_transponder_test_date,
      nextDue: status?.transponder_next_due_date,
      isCurrent: status?.transponder_is_current,
      interval: '24 calendar months',
    },
    {
      label: 'Pitot-Static System Test',
      regulation: '14 CFR 91.411',
      lastDate: status?.last_pitot_static_date,
      nextDue: status?.pitot_static_next_due_date,
      isCurrent: status?.pitot_static_is_current,
      interval: '24 calendar months',
    },
    {
      label: 'Altimeter Calibration',
      regulation: '14 CFR 91.411',
      lastDate: status?.last_altimeter_date,
      nextDue: status?.altimeter_next_due_date,
      isCurrent: status?.altimeter_is_current,
      interval: '24 calendar months',
    },
    {
      label: 'VOR Equipment Check',
      regulation: '14 CFR 91.171',
      lastDate: status?.last_vor_check_date,
      nextDue: status?.vor_check_next_due_date,
      isCurrent: status?.vor_check_is_current,
      interval: '30 days',
    },
  ]

  const openAds = adRecords?.filter((a: any) => a.compliance_status === 'open') ?? []
  const unknownAds = adRecords?.filter((a: any) => a.compliance_status === 'unknown') ?? []

  const reportData = {
    reportType: 'Inspection Status Report',
    generatedAt: new Date().toISOString(),
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
    },
    status: {
      healthScore: status?.health_score,
      adsOpen: status?.ads_open,
      adsComplied: status?.ads_complied,
      annualIsCurrent: status?.annual_is_current,
      transponderIsCurrent: status?.transponder_is_current,
      airframeTotalTime: status?.airframe_total_time,
    },
    inspectionItems,
    adSummary: {
      total: adRecords?.length ?? 0,
      complied: status?.ads_complied ?? 0,
      open: status?.ads_open ?? 0,
      unknown: status?.ads_unknown ?? 0,
      openAds: openAds.map((a: any) => a.ad_number),
      nextDueDate: status?.next_ad_due_date,
      nextDueNumber: status?.next_ad_number,
    },
    findings: [],
  }

  // Build custom HTML section for inspection table
  const inspectionTableHtml = `
<div class="section">
  <h2>Inspection Currency Detail</h2>
  <table style="width:100%;border-collapse:collapse;font-size:10pt;">
    <thead>
      <tr style="background:#0f172a;color:white;">
        <th style="padding:8px 12px;text-align:left;">Inspection</th>
        <th style="padding:8px 12px;text-align:left;">Regulation</th>
        <th style="padding:8px 12px;text-align:left;">Last Done</th>
        <th style="padding:8px 12px;text-align:left;">Next Due</th>
        <th style="padding:8px 12px;text-align:center;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${inspectionItems.map((item, i) => `
        <tr style="background:${i % 2 === 0 ? '#f8fafc' : 'white'};">
          <td style="padding:8px 12px;font-weight:600;">${item.label}</td>
          <td style="padding:8px 12px;color:#64748b;font-size:9pt;">${item.regulation}</td>
          <td style="padding:8px 12px;">${item.lastDate ?? '—'}</td>
          <td style="padding:8px 12px;">${item.nextDue ?? '—'}</td>
          <td style="padding:8px 12px;text-align:center;font-weight:700;color:${item.isCurrent ? '#16a34a' : item.lastDate ? '#dc2626' : '#94a3b8'};">
            ${item.isCurrent ? '✓ Current' : item.lastDate ? '✗ Overdue' : '— No Record'}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</div>`

  // Inject the custom section into HTML by using a marker in narrative
  const fullHtml = inspectionTableHtml

  return renderReportToPDF({ ...reportData, customSection: fullHtml }, 'inspection_status')
}
