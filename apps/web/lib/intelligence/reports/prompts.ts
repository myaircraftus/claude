export const REPORT_TYPES = {
  aircraft_overview: {
    label: 'Aircraft Overview',
    description: 'General summary of aircraft records and maintenance status',
  },
  insurance_packet: {
    label: 'Insurance Packet',
    description: 'Maintenance status + safety records for insurance underwriting',
  },
  pre_buy_inspection: {
    label: 'Pre-Buy Inspection Summary',
    description: 'ADs, repairs, damage history for buyer due diligence',
  },
  annual_inspection_summary: {
    label: 'Annual Inspection Summary',
    description: 'Last 2 annual inspections + trends and compliance status',
  },
  compliance_ad_report: {
    label: 'Compliance / AD Report',
    description: 'AD compliance status and any overdue items',
  },
} as const

export type ReportType = keyof typeof REPORT_TYPES

export interface ReportContext {
  tailNumber: string
  makeModel: string
  year: number | null
  serialNumber: string | null
  engineMakeModel: string
  totalTime: number | null
  engineSmoh: number | null
  annualIsCurrent: boolean | null
  lastAnnualDate: string | null
  adsComplied: number
  adsOpen: number
  adsUnknown: number
  openFindingsCount: number
  criticalFindingsCount: number
  recentMaintenance: Array<{ date: string; type: string; summary?: string }>
}

export function systemPromptForType(type: ReportType): string {
  switch (type) {
    case 'aircraft_overview':
      return 'You are an aviation records analyst preparing a general aircraft overview report for an owner or operator. Be factual, clear, and concise. Use markdown formatting with headers.'

    case 'insurance_packet':
      return 'You are preparing an aviation insurance underwriting summary. Focus on maintenance currency, airworthiness certificate status, compliance records, and any risk factors. Flag concerns clearly. Use markdown formatting with headers.'

    case 'pre_buy_inspection':
      return 'You are preparing a pre-buy inspection summary for an aircraft buyer or their representative. Emphasize ADs, major repairs, damage history, compliance status, and any value-affecting issues. Be thorough and objective. Use markdown formatting with headers.'

    case 'annual_inspection_summary':
      return 'You are preparing an annual inspection summary report. Focus on inspection history, any squawks or findings from recent annuals, trends, and whether the aircraft is currently airworthy. Use markdown formatting with headers.'

    case 'compliance_ad_report':
      return 'You are preparing an Airworthiness Directive (AD) compliance report. Focus on AD status, overdue items, compliance dates, and any open or unknown AD applicability. Be precise and note any compliance gaps clearly. Use markdown formatting with headers.'
  }
}

export function userPromptForType(type: ReportType, ctx: ReportContext): string {
  const base = `Aircraft: ${ctx.makeModel} (${ctx.tailNumber})
Year: ${ctx.year ?? 'Unknown'} | S/N: ${ctx.serialNumber ?? 'Unknown'}
Engine: ${ctx.engineMakeModel}
Total Airframe Time: ${ctx.totalTime ?? 'Unknown'} hrs
Engine SMOH: ${ctx.engineSmoh ?? 'Unknown'} hrs
Annual Status: ${ctx.annualIsCurrent ? 'Current' : 'OVERDUE'} | Last Annual: ${ctx.lastAnnualDate ?? 'Unknown'}
AD Status: ${ctx.adsComplied} complied, ${ctx.adsOpen} open, ${ctx.adsUnknown} unknown
Open Findings: ${ctx.openFindingsCount} total (${ctx.criticalFindingsCount} critical)
Recent Maintenance: ${ctx.recentMaintenance.slice(0, 5).map(e => `${e.date}: ${e.type}`).join('; ') || 'None on record'}`

  switch (type) {
    case 'aircraft_overview':
      return `${base}

Write a 2–3 paragraph Aircraft Overview Report. Cover overall maintenance health, key dates, and any notable concerns. Write for an aircraft owner — not a mechanic.`

    case 'insurance_packet':
      return `${base}

Write an Insurance Underwriting Summary. Include:
## Aircraft Identification
## Maintenance Currency
## Airworthiness & Compliance Status
## Risk Assessment
## Summary

Flag any items that would concern an aviation underwriter. Be direct about risk factors.`

    case 'pre_buy_inspection':
      return `${base}

Write a Pre-Buy Inspection Summary for a prospective buyer. Include:
## Aircraft Overview
## Compliance & AD Status
## Maintenance History Highlights
## Damage / Major Repair History
## Open Findings & Concerns
## Buyer Recommendation

Be objective. Note both positives and red flags.`

    case 'annual_inspection_summary':
      return `${base}

Write an Annual Inspection Summary. Include:
## Current Inspection Status
## Recent Annual Inspection History
## Findings & Squawks (last 2 annuals)
## Airworthiness Assessment
## Next Due

Focus on inspection trends and whether the aircraft demonstrates consistent maintenance.`

    case 'compliance_ad_report':
      return `${base}

Write an AD Compliance Report. Include:
## AD Compliance Overview
## Complied ADs Summary
## Open / Overdue ADs
## Unknown Applicability Items
## Compliance Recommendations

Be specific about any compliance gaps and their airworthiness implications.`
  }
}
