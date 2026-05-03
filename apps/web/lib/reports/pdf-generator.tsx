/**
 * Tax-time P&L PDF renderer (Spec 7.7).
 *
 * @react-pdf/renderer is server-only — render to a Node Buffer and stream
 * back to the client. The component tree below is plain JSX-as-data using
 * the `@react-pdf/renderer` primitives (Document/Page/View/Text). DO NOT
 * try to reuse Next.js components here; @react-pdf has its own renderer.
 */

import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'
import type { TaxPnlReport, AircraftPnl } from './tax-pnl-generator'

const styles = StyleSheet.create({
  page:        { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  h1:          { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  h2:          { fontSize: 14, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  h3:          { fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 4 },
  meta:        { fontSize: 9, color: '#666', marginBottom: 12 },
  hr:          { borderBottomWidth: 1, borderBottomColor: '#ccc', marginVertical: 6 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rowH:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#000' },
  rowSubtotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderTopWidth: 1, borderTopColor: '#000', marginTop: 4 },
  cellL:       { width: '70%' },
  cellR:       { width: '30%', textAlign: 'right' },
  cellLine:    { fontSize: 8, color: '#666' },
  bold:        { fontWeight: 700 },
  green:       { color: '#047857' },
  red:         { color: '#b91c1c' },
  small:       { fontSize: 8, color: '#888' },
  footer:      { fontSize: 8, color: '#888', marginTop: 18, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ddd' },
})

function fmt(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function AircraftSection({ a }: { a: AircraftPnl }) {
  const profitable = a.net_income_usd >= 0
  return (
    <View wrap={false} style={{ marginBottom: 18 }}>
      <Text style={styles.h2}>{a.tail_number} — {[a.make, a.model, a.year_built].filter(Boolean).join(' ')}</Text>
      <Text style={styles.meta}>
        {a.flight_hours_in_year.toFixed(1)} hr flown · {a.cost_entry_count} cost entries · {a.intake_document_count} supporting documents
      </Text>

      <Text style={styles.h3}>Revenue</Text>
      <View style={styles.row}>
        <Text style={styles.cellL}>Rental / charter / dry lease</Text>
        <Text style={styles.cellR}>{fmt(a.revenue_rental_usd)}</Text>
      </View>
      <View style={styles.rowSubtotal}>
        <Text style={[styles.cellL, styles.bold]}>Total revenue</Text>
        <Text style={[styles.cellR, styles.bold]}>{fmt(a.revenue_total_usd)}</Text>
      </View>

      <Text style={styles.h3}>Operating expenses (IRS Schedule C)</Text>
      {a.expense_lines.length === 0 ? (
        <Text style={styles.small}>No approved expense entries for this period.</Text>
      ) : (
        a.expense_lines.map((line, i) => (
          <View key={i} style={styles.row}>
            <View style={styles.cellL}>
              <Text>{line.category_label}</Text>
              <Text style={styles.cellLine}>{line.schedule_c_line}</Text>
            </View>
            <Text style={styles.cellR}>{fmt(line.amount_usd)}</Text>
          </View>
        ))
      )}
      <View style={styles.rowSubtotal}>
        <Text style={[styles.cellL, styles.bold]}>Total operating expenses</Text>
        <Text style={[styles.cellR, styles.bold]}>{fmt(a.expense_total_usd)}</Text>
      </View>

      <Text style={styles.h3}>Depreciation (MACRS — 5-year property)</Text>
      <View style={styles.row}>
        <Text style={styles.cellL}>Logged depreciation entries</Text>
        <Text style={styles.cellR}>{fmt(a.depreciation_logged_usd)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.cellL}>MACRS schedule (default — set acquisition cost to populate)</Text>
        <Text style={styles.cellR}>{fmt(a.depreciation_macrs_usd)}</Text>
      </View>
      <View style={styles.rowSubtotal}>
        <Text style={[styles.cellL, styles.bold]}>Total depreciation</Text>
        <Text style={[styles.cellR, styles.bold]}>{fmt(a.depreciation_total_usd)}</Text>
      </View>

      <Text style={styles.h3}>Net</Text>
      <View style={styles.row}>
        <Text style={styles.cellL}>Net income</Text>
        <Text style={[styles.cellR, styles.bold, profitable ? styles.green : styles.red]}>{fmt(a.net_income_usd)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.cellL}>Net per flight hour</Text>
        <Text style={[styles.cellR, profitable ? styles.green : styles.red]}>
          {a.net_per_flight_hour_usd == null ? '—' : fmt(a.net_per_flight_hour_usd)}
        </Text>
      </View>
    </View>
  )
}

function ReportDocument({ report }: { report: TaxPnlReport }) {
  const total_profitable = report.total_net_income_usd >= 0
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>Aircraft P&L Statement — {report.year}</Text>
        <Text style={styles.meta}>
          {report.organization_name ?? 'Organization'} · Generated {new Date(report.generated_at).toLocaleString()}
        </Text>

        <Text style={styles.h2}>Summary across all aircraft</Text>
        <View style={styles.rowH}>
          <Text style={[styles.cellL, styles.bold]}>Item</Text>
          <Text style={[styles.cellR, styles.bold]}>Amount</Text>
        </View>
        <View style={styles.row}><Text style={styles.cellL}>Total revenue</Text><Text style={styles.cellR}>{fmt(report.total_revenue_usd)}</Text></View>
        <View style={styles.row}><Text style={styles.cellL}>Total operating expenses</Text><Text style={styles.cellR}>{fmt(report.total_expense_usd)}</Text></View>
        <View style={styles.row}><Text style={styles.cellL}>Total depreciation</Text><Text style={styles.cellR}>{fmt(report.total_depreciation_usd)}</Text></View>
        <View style={styles.rowSubtotal}>
          <Text style={[styles.cellL, styles.bold]}>Net income</Text>
          <Text style={[styles.cellR, styles.bold, total_profitable ? styles.green : styles.red]}>
            {fmt(report.total_net_income_usd)}
          </Text>
        </View>

        {report.aircraft.length === 0 ? (
          <Text style={[styles.h2, { color: '#666' }]}>No aircraft on file for this organization.</Text>
        ) : (
          report.aircraft.map((a) => <AircraftSection key={a.aircraft_id} a={a} />)
        )}

        <Text style={styles.footer}>
          This statement is generated from your approved cost entries and recorded flight events for the calendar year. It is NOT tax advice. Before filing,
          review the figures with a licensed CPA. MACRS schedule applied is the IRS Pub 946 General Depreciation System (GDS) 5-year property half-year
          convention. Depreciation will populate automatically once the per-aircraft acquisition_cost field is recorded; until then logged depreciation entries
          are the only source.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderTaxPnlPdf(report: TaxPnlReport): Promise<Buffer> {
  return renderToBuffer(<ReportDocument report={report} />)
}
