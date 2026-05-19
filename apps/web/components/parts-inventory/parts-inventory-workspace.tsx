'use client'

import { useState } from 'react'
import {
  ArrowRight,
  Camera,
  Download,
  Plane,
  Plus,
  ScanLine,
  Sparkles,
} from 'lucide-react'
import Link from '@/components/shared/tenant-link'
import { PartSearchPanel } from '@/app/(app)/parts/components/part-search-panel'
import { PurchaseOrdersView as LivePurchaseOrdersView } from '@/components/parts/pos-view'
import { PartsInventoryView as LivePartsInventoryView } from '@/components/parts/parts-inventory-view'
import { VendorsView as LiveVendorsView } from '@/components/vendors/vendors-view'
import { EntityBulkPanel } from '@/components/bulk/EntityBulkPanel'
import { cn } from '@/lib/utils'
import {
  PARTS_INVENTORY_VIEWS,
  type PartsInventoryViewKey,
} from '@/lib/parts-inventory/workflow'
import type { OrgRole } from '@/types'

type Metric = {
  label: string
  value: string
  helper: string
  tone: 'blue' | 'green' | 'amber' | 'red' | 'slate'
  href?: string
}

type InventoryRow = {
  partNumber: string
  description: string
  category: string
  qty: number
  min: number
  onOrder?: number
  location: string
  cost: number
  retail: number
  vendor: string
  updated: string
  dueDate?: string | null
}

type PoRow = {
  number: string
  vendor: string
  date: string
  total: string
  status: 'open' | 'processing' | 'shipped' | 'received' | 'closed'
  expected: string
}

type ReceiptRow = {
  number: string
  po: string
  vendor: string
  date: string
  status: 'pending' | 'received' | 'partial'
  items: number
  total: string
}

type ReturnRow = {
  number: string
  type: string
  vendor: string
  date: string
  status: 'open' | 'approved' | 'received'
  total: string
}

type AircraftOption = {
  id: string
  tail_number: string
  make?: string | null
  model?: string | null
  year?: number | null
}

const metrics: Metric[] = [
  { label: 'Total Parts', value: '2,845', helper: '+8 this month', tone: 'green', href: '/parts-inventory/inventory' },
  { label: 'Low Stock', value: '42', helper: 'View all', tone: 'amber', href: '/parts-inventory/inventory?status=low_stock' },
  { label: 'On Order', value: '23', helper: 'Open POs', tone: 'blue', href: '/parts-inventory/purchase-orders?status=open' },
  { label: 'Expiring / Due', value: '7', helper: 'Due soon', tone: 'red', href: '/parts-inventory/inventory?status=expiring' },
  { label: 'Total Value', value: '$248,652', helper: 'View details', tone: 'slate', href: '/parts-inventory/analytics?metric=inventory_value' },
]

const inventoryRows: InventoryRow[] = [
  { partNumber: '066-04200-0000', description: 'Brake Disc', category: 'Brakes', qty: 5, min: 1, location: 'Main Warehouse', cost: 250, retail: 425, vendor: 'Aircraft Spruce', updated: 'May 14, 2026' },
  { partNumber: '061-08500-0000', description: 'Brake Pad Set', category: 'Brakes', qty: 1, min: 4, location: 'A-12-03', cost: 125, retail: 185, vendor: 'AeroParts Inc.', updated: 'May 12, 2026' },
  { partNumber: 'CH48110-2', description: 'Oil Filter', category: 'Engine', qty: 2, min: 2, location: 'B-04-01', cost: 18.75, retail: 29, vendor: 'Aircraft Spruce', updated: 'May 11, 2026' },
  { partNumber: 'MS28775-006', description: 'Cotter Pin', category: 'Hardware', qty: 3, min: 5, location: 'C-01-05', cost: 0.45, retail: 1.15, vendor: 'Wicks', updated: 'May 10, 2026' },
  { partNumber: 'ALY-8520R', description: 'Alternator', category: 'Electrical', qty: 0, min: 1, onOrder: 1, location: 'D-02-02', cost: 425, retail: 709, vendor: 'eBay Aviation', updated: 'May 9, 2026' },
  { partNumber: '12V60A', description: 'Alternator', category: 'Electrical', qty: 2, min: 1, location: 'D-02-03', cost: 709.56, retail: 995, vendor: 'Hartzel Engine', updated: 'May 7, 2026' },
]

const purchaseOrders: PoRow[] = [
  { number: 'PO-10048', vendor: 'AeroParts Inc.', date: 'May 08, 2026', total: '$1,245.00', status: 'shipped', expected: 'May 08, 2026' },
  { number: 'PO-10047', vendor: 'Aircraft Spruce', date: 'May 07, 2026', total: '$645.50', status: 'processing', expected: 'May 07, 2026' },
  { number: 'PO-10046', vendor: 'Aviall', date: 'May 06, 2026', total: '$2,389.20', status: 'open', expected: '-' },
  { number: 'PO-10045', vendor: 'Wipaire Inc.', date: 'May 05, 2026', total: '$820.00', status: 'open', expected: '-' },
  { number: 'PO-10044', vendor: 'SkyTech Inc.', date: 'May 02, 2026', total: '$1,150.75', status: 'received', expected: 'May 02, 2026' },
]

const rxReceipts: ReceiptRow[] = [
  { number: 'RX-50036', po: 'PO-10048', vendor: 'AeroParts Inc.', date: 'May 08, 2026', status: 'received', items: 8, total: '$1,245.00' },
  { number: 'RX-50035', po: 'PO-10047', vendor: 'Aircraft Spruce', date: 'May 07, 2026', status: 'pending', items: 4, total: '$645.50' },
  { number: 'RX-50034', po: 'PO-10046', vendor: 'Aviall', date: 'May 06, 2026', status: 'received', items: 2, total: '$2,389.20' },
  { number: 'RX-50033', po: 'PO-10045', vendor: 'Wipaire Inc.', date: 'May 05, 2026', status: 'partial', items: 3, total: '$820.00' },
]

const returnsRows: ReturnRow[] = [
  { number: 'RTN-20012', type: 'Warranty', vendor: 'AeroParts Inc.', date: 'May 12, 2026', status: 'open', total: '$129.30' },
  { number: 'RTN-20011', type: 'Credit', vendor: 'Aircraft Spruce', date: 'May 08, 2026', status: 'approved', total: '$415.00' },
  { number: 'RTN-20010', type: 'Defective', vendor: 'Aviall', date: 'May 06, 2026', status: 'received', total: '$152.00' },
]

export function PartsInventoryWorkspace({
  aircraft,
  initialView,
  userRole,
  inventoryPartCount,
}: {
  aircraft: AircraftOption[]
  initialView: PartsInventoryViewKey
  userRole: OrgRole
  inventoryPartCount: number
}) {
  const [view, setView] = useState<PartsInventoryViewKey>(initialView)

  const activeView = view
  const title = activeView === 'dashboard' ? 'Parts & Inventory' : PARTS_INVENTORY_VIEWS.find((item) => item.key === activeView)?.label ?? 'Parts & Inventory'
  const subtitle = activeView === 'dashboard'
    ? 'Manage inventory, vendors, and purchase orders in one place.'
    : 'Aircraft-aware parts search, procurement, receiving, returns, and analytics.'

  function audit(action: string, description: string) {
    void fetch('/api/parts-inventory/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload: { description, review_required: action.includes('ai') } }),
    }).catch(() => undefined)
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6 space-y-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="hidden h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm sm:flex">
              <Plane className="h-7 w-7 text-blue-700" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 lg:text-3xl">{title}</h1>
                {activeView === 'ai-search' && <Badge tone="violet">AI</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
              <option>N123AB - Cessna 172S Skyhawk</option>
              <option>N262EE - Cessna 172M</option>
              <option>N757VB - Cessna 152</option>
            </select>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              onClick={() => {
                audit('purchase_order_created', 'Quick add launched from Parts & Inventory')
                setView('purchase-orders')
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" />
              Quick Add
            </button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {PARTS_INVENTORY_VIEWS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => setView(item.key)}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-colors',
                activeView === item.key
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-900',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {activeView === 'dashboard' && <DashboardView setView={setView} />}
        {activeView === 'ai-search' && (
          <AiSearchView
            aircraft={aircraft}
          />
        )}
        {activeView === 'inventory' && (
          <div>
            <LivePartsInventoryView userRole={userRole} />
            <div className="mx-auto max-w-4xl px-6 pb-6">
              <EntityBulkPanel entityType="inventory_parts" />
            </div>
          </div>
        )}
        {activeView === 'vendors' && <LiveVendorsView userRole={userRole} />}
        {activeView === 'purchase-orders' && <LivePurchaseOrdersView userRole={userRole} />}
        {activeView === 'rx-receipts' && <ReceivingReturnsView mode="receipts" audit={audit} />}
        {activeView === 'returns' && <ReceivingReturnsView mode="returns" audit={audit} />}
        {activeView === 'analytics' && <AnalyticsView audit={audit} inventoryPartCount={inventoryPartCount} />}
      </div>
    </div>
  )
}

function DashboardView({ setView }: { setView: (view: PartsInventoryViewKey) => void }) {
  return (
    <div className="space-y-5">
      <MetricGrid metrics={metrics} />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_0.85fr]">
        <Panel title="Top Low Stock Parts" subtitle="Items that need reorder attention first.">
          <div className="space-y-3">
            {inventoryRows.slice(0, 4).map((part) => (
              <button
                key={part.partNumber}
                onClick={() => setView('inventory')}
                className="flex w-full items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50/40"
              >
                <div className="flex items-center gap-3">
                  <PartThumbnail label={part.partNumber} small />
                  <div>
                    <div className="text-sm font-semibold text-slate-950">P/N {part.partNumber}</div>
                    <div className="text-xs text-slate-500">{part.description}</div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-rose-600">Qty: {part.qty}</span>
              </button>
            ))}
          </div>
          <Link href="/parts-inventory/inventory?status=low_stock" className="mt-4 inline-flex text-sm font-semibold text-blue-700">
            View all low stock
          </Link>
        </Panel>

        <Panel title="Recent Purchase Orders" subtitle="Procurement activity tied to stocked parts.">
          <div className="space-y-3">
            {purchaseOrders.slice(0, 4).map((po) => (
              <button key={po.number} onClick={() => setView('purchase-orders')} className="flex w-full items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2 text-left hover:border-blue-200">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{po.number}</div>
                  <div className="text-xs text-slate-500">{po.vendor}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-950">{po.total}</div>
                  <StatusPill value={po.status} />
                </div>
              </button>
            ))}
          </div>
          <Link href="/parts-inventory/purchase-orders?recent=true" className="mt-4 inline-flex text-sm font-semibold text-blue-700">
            View all purchase orders
          </Link>
        </Panel>

        <Panel title="Inventory Value" subtitle="Current value by category.">
          <DonutChart />
          <button onClick={() => setView('analytics')} className="mt-4 w-full rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-blue-700">
            View inventory report
          </button>
        </Panel>
      </div>

      <Panel title="Assistant Shortcuts" subtitle="AI can help search, extract, reorder, and enrich records. Human review is required before official save.">
        <div className="flex flex-wrap gap-2">
          {[
            ['Find part by description', 'ai-search'],
            ['Check alternate parts', 'ai-search'],
            ['Create PO from voice', 'purchase-orders'],
            ['Reorder low stock', 'purchase-orders'],
            ['Import inventory', 'inventory'],
          ].map(([label, target]) => (
            <button
              key={label}
              onClick={() => setView(target as PartsInventoryViewKey)}
              className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function AiSearchView({
  aircraft,
}: {
  aircraft: AircraftOption[]
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/parts-inventory" className="text-sm font-semibold text-blue-700">
          Back to Parts Dashboard
        </Link>
      </div>
      <PartSearchPanel aircraft={aircraft} />
    </div>
  )
}

function ReceivingReturnsView({ mode, audit }: { mode: 'receipts' | 'returns'; audit: (action: string, description: string) => void }) {
  const showReceipts = mode === 'receipts'
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Panel title={showReceipts ? 'RX Receipts' : 'Returns / Cores'} subtitle={showReceipts ? 'Track and manage received items.' : 'Manage returns, warranty, credit, wrong parts, and cores.'}>
          <DataTable
            columns={showReceipts ? ['Receipt #', 'PO Number', 'Vendor', 'Date', 'Status', 'Items', 'Total'] : ['Return #', 'Type', 'Vendor', 'Date', 'Status', 'Total']}
            rows={showReceipts
              ? rxReceipts.map((rx) => [rx.number, rx.po, rx.vendor, rx.date, <StatusPill key="status" value={rx.status} />, String(rx.items), rx.total])
              : returnsRows.map((row) => [row.number, row.type, row.vendor, row.date, <StatusPill key="status" value={row.status} />, row.total])}
          />
        </Panel>
        <Panel title={showReceipts ? 'RX Receipts Flow' : 'Returns Flow'} subtitle="The web flow uses staged review before inventory, PO, or vendor history changes are committed.">
          <FlowStrip
            steps={showReceipts
              ? [
                  ['1', 'RX List', 'Open receipt queue'],
                  ['2', 'Choose Method', 'Barcode, image, AI, PO, manual'],
                  ['3', 'Extract Items', 'Confidence shown'],
                  ['4', 'Review', 'Confirm quantities'],
                  ['5', 'Receipt Created', 'Inventory and PO updated'],
                ]
              : [
                  ['1', 'Returns List', 'Open return queue'],
                  ['2', 'Create Return', 'Receipt, inventory, manual'],
                  ['3', 'Select Items', 'Quantity to return'],
                  ['4', 'Review Return', 'Reason, vendor, evidence'],
                  ['5', 'Status Timeline', 'Approved, shipped, received'],
                ]}
          />
        </Panel>
      </div>
      <Panel title={showReceipts ? 'Add RX Receipt' : 'Create Return'} subtitle={showReceipts ? 'Scan/upload first, then review extracted items.' : 'Select source, items, reason, and evidence.'}>
        {showReceipts ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <MethodCard icon={ScanLine} title="By Barcode Scan" copy="Scan items as they arrive" />
              <MethodCard icon={Camera} title="By Image Upload" copy="Upload packing slip or label" />
              <MethodCard icon={Sparkles} title="AI Extract" copy="Extract items from image" />
            </div>
            <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              AI extracted 6 items from packing slip PO-10048. Review all items before confirmation.
            </div>
            <button onClick={() => audit('rx_receipt_confirmed', 'RX receipt confirmed after review')} className="mt-4 w-full rounded-lg bg-blue-700 py-2 text-sm font-semibold text-white">
              Confirm Receipt
            </button>
          </>
        ) : (
          <>
            <select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option>From Receipt - RX-50034 - PO-10046 - Aviall</option>
              <option>From Inventory</option>
              <option>Manual Entry</option>
            </select>
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <Detail label="Item" value="Cotter Pin" />
              <Detail label="Qty Received" value="5" />
              <Detail label="Qty to Return" value="2" />
              <Detail label="Reason" value="Defective - seal damaged in transit" />
            </div>
            <button onClick={() => audit('return_created', 'Return request created with review evidence')} className="mt-4 w-full rounded-lg bg-blue-700 py-2 text-sm font-semibold text-white">
              Create Return Request
            </button>
          </>
        )}
      </Panel>
    </div>
  )
}

function AnalyticsView({
  audit,
  inventoryPartCount,
}: {
  audit: (action: string, description: string) => void
  inventoryPartCount: number
}) {
  // Honest zero-state. Previously this view showed hardcoded demo figures
  // ($248,652 inventory value, 3.42x turnover, 94.6% fill rate, …) regardless
  // of whether any inventory existed. With no parts on file, show an empty
  // state + CTA instead of fabricated analytics.
  if (inventoryPartCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <h3 className="text-base font-semibold text-slate-900">No inventory analytics yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Inventory value, parts turnover, fill rate, and stockout trends appear
          here once you start tracking parts. Add your first part to get started.
        </p>
        <a
          href="/parts-inventory/inventory"
          className="mt-4 inline-block rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
        >
          Add your first part
        </a>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <MetricGrid
        metrics={[
          { label: 'Inventory Value', value: '$248,652', helper: '+12% vs Apr', tone: 'green' },
          { label: 'Parts Turnover', value: '3.42x', helper: '+8% vs Apr', tone: 'green' },
          { label: 'Fill Rate', value: '94.6%', helper: '+3% vs Apr', tone: 'green' },
          { label: 'Stockouts', value: '16', helper: '-22% vs Apr', tone: 'red' },
          { label: 'Total Receipts', value: '42', helper: '+15% vs Apr', tone: 'green' },
          { label: 'Total Returns', value: '8', helper: '-11% vs Apr', tone: 'red' },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_280px]">
        <Panel title="Top Spending Categories">
          <DonutChart />
        </Panel>
        <Panel title="Low Stock Trend">
          <LineChart tone="blue" />
        </Panel>
        <Panel title="Inventory Value Trend">
          <LineChart tone="green" />
        </Panel>
        <Panel title="Views & Filters">
          <div className="space-y-2">
            {['All Locations', 'All Vendors', 'All Categories', 'All Aircraft', 'Date Range'].map((filter) => (
              <button key={filter} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700">{filter}</button>
            ))}
            <button onClick={() => audit('analytics_exported', 'Inventory analytics exported')} className="mt-2 w-full rounded-lg bg-blue-700 py-2 text-sm font-semibold text-white">
              Export Report
            </button>
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ['Slow Moving Parts', '32 parts'],
          ['Most Purchased Parts', '128 parts'],
          ['Top Vendors by Spend', 'Aircraft Spruce'],
          ['Purchase Order Analysis', '$521,430'],
          ['RX & Returns Summary', '50 receipts'],
        ].map(([title, value]) => (
          <Panel key={title} title={title}>
            <div className="text-lg font-bold text-slate-950">{value}</div>
            <button className="mt-3 text-sm font-semibold text-blue-700">View details</button>
          </Panel>
        ))}
      </div>
    </div>
  )
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {metrics.map((metric) => {
        const content = (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-medium text-slate-500">{metric.label}</div>
            <div className="mt-3 text-2xl font-bold text-slate-950">{metric.value}</div>
            <div className={cn('mt-2 text-xs font-semibold', metric.tone === 'green' ? 'text-emerald-600' : metric.tone === 'red' ? 'text-rose-600' : metric.tone === 'amber' ? 'text-amber-600' : 'text-blue-700')}>
              {metric.helper}
            </div>
          </div>
        )
        return metric.href ? <Link key={metric.label} href={metric.href}>{content}</Link> : <div key={metric.label}>{content}</div>
      })}
    </div>
  )
}

function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm', className)}>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function DataTable({ columns, rows }: { columns: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {columns.map((column) => <th key={column} className="px-3 py-2 font-bold">{column}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {row.map((cell, j) => <td key={j} className="whitespace-nowrap px-3 py-3 text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'slate' }) {
  const classes = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
  }
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold', classes[tone])}>{children}</span>
}

function StatusPill({ value }: { value: string }) {
  const tone =
    ['preferred', 'approved', 'received', 'shipped'].includes(value) ? 'green'
    : ['processing', 'pending', 'partial', 'open'].includes(value) ? 'amber'
    : ['blocked'].includes(value) ? 'red'
    : 'blue'
  const label = value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return <Badge tone={tone as any}>{label}</Badge>
}

function FlowStrip({ steps }: { steps: Array<[string, string, string]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      {steps.map(([number, title, copy], idx) => (
        <div key={title} className="relative rounded-xl border border-slate-200 bg-white p-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">{number}</span>
          <div className="mt-3 text-sm font-bold text-slate-950">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{copy}</div>
          {idx < steps.length - 1 && <ArrowRight className="absolute -right-5 top-1/2 hidden h-5 w-5 text-blue-500 md:block" />}
        </div>
      ))}
    </div>
  )
}

function MethodCard({ icon: Icon, title, copy }: { icon: any; title: string; copy: string }) {
  return (
    <button className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-left hover:border-blue-300">
      <Icon className="h-5 w-5 text-blue-700" />
      <div className="mt-2 text-sm font-bold text-slate-950">{title}</div>
      <div className="text-xs text-slate-500">{copy}</div>
    </button>
  )
}

function Detail({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'blue' | 'red' }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={cn('text-sm font-bold text-slate-950', tone === 'green' && 'text-emerald-700', tone === 'blue' && 'text-blue-700', tone === 'red' && 'text-rose-700')}>{value}</span>
    </div>
  )
}

function PartThumbnail({ label, small, large }: { label: string; small?: boolean; large?: boolean }) {
  return (
    <div className={cn('relative shrink-0 rounded-full border border-slate-300 bg-[radial-gradient(circle_at_center,#f8fafc_0_18%,#334155_19%_24%,#64748b_25%_31%,#0f172a_32%_42%,#94a3b8_43%_45%,#1e293b_46%_100%)] shadow-sm', small ? 'h-9 w-9' : large ? 'h-24 w-24' : 'h-16 w-16')}>
      <span className="sr-only">{label}</span>
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
    </div>
  )
}

function DonutChart() {
  return (
    <div className="flex items-center gap-5">
      <div className="grid h-36 w-36 place-items-center rounded-full bg-[conic-gradient(#2563eb_0_34%,#8b5cf6_34%_58%,#22c55e_58%_76%,#f59e0b_76%_88%,#94a3b8_88%_100%)]">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center">
          <div>
            <div className="text-xs text-slate-500">Total</div>
            <div className="text-sm font-bold text-slate-950">$248,652</div>
          </div>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        {[
          ['Consumables', '34%', '#2563eb'],
          ['Avionics', '24%', '#8b5cf6'],
          ['Engine', '18%', '#22c55e'],
          ['Airframe', '12%', '#f59e0b'],
          ['Other', '8%', '#94a3b8'],
        ].map(([label, pct, color]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="w-24 text-slate-600">{label}</span>
            <span className="font-semibold text-slate-950">{pct}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LineChart({ tone }: { tone: 'blue' | 'green' }) {
  const color = tone === 'blue' ? '#2563eb' : '#10b981'
  return (
    <div className="h-40 rounded-xl bg-slate-50 p-4">
      <svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label="Inventory trend chart">
        <polyline points="0,92 45,62 92,48 136,70 182,76 225,38 270,52 320,44" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M0 92 L45 62 L92 48 L136 70 L182 76 L225 38 L270 52 L320 44 L320 120 L0 120 Z" fill={color} opacity="0.1" />
      </svg>
    </div>
  )
}
