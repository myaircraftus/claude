# Maintenance Module — Developer Documentation

**Project:** myaircraft.us
**Feature Area:** Maintenance (Entry Generator, Work Orders, Parts & Ordering, Workflow) + Workspace AI
**Last Updated:** 2026-04-03

---

## Overview

The Maintenance module is the operational core of myaircraft.us. It consists of four primary sub-sections — **Entry Generator**, **Work Orders**, **Parts & Ordering**, and **Workflow** — all tied together by the **Workspace**, a persistent AI chat interface that can create, update, and finalize records through natural language.

---

## Navigation Structure

The left sidebar includes the following top-level routes:

```
/dashboard
/workspace
/aircraft
/ask
/documents
/maintenance
  /maintenance/entry-generator
  /maintenance/work-orders
  /maintenance/work-orders/:id
  /maintenance/parts-ordering
    /maintenance/parts-ordering/part-orders
    /maintenance/parts-ordering/parts-catalog
    /maintenance/parts-ordering/vendors
  /maintenance/workflow
/parts-orders
/settings
```

The active aircraft context (e.g., `N2345 – Cessna 172S`) is pinned in the top-left sidebar below the org name and persists across all maintenance sub-pages.

---

## 1. AI Entry Generator

**Route:** `/maintenance/entry-generator`

### Purpose
Allows mechanics and operators to describe work performed in plain language. The AI drafts a fully-formatted FAA-style Aircraft Maintenance Record entry.

### Layout
- **Left panel:** Aircraft selector + freeform text input with quick-action suggestion chips
- **Right panel:** Live-rendered `Maintenance Entry Draft`

### AI Input
The user types a plain-language description of the work performed. Example:

> "Pilot reported slight oil seepage around #3 cylinder base. Replaced O-ring, performed engine run-up."

Quick-action chips available at the bottom of the input:
- `Oil Change`
- `Annual Inspection`
- `AD Compliance`
- `Repair`

### Generated Entry Fields

The AI produces a structured maintenance record with the following fields:

| Field | Description |
|---|---|
| `date` | Date of maintenance (auto-populated from context) |
| `aircraft` | Aircraft registration pulled from active context |
| `tail` | Tail number (e.g., N2345) |
| `tach_hobbs` | Tach/Hobbs time at time of service |
| `discrepancy` | Pilot-reported or mechanic-identified issue |
| `corrective_action` | Step-by-step corrective procedure performed |
| `parts_used` | Part number(s) and description(s) used |
| `references` | Applicable ADs, SIs, or maintenance manual chapter references |
| `mechanic_name` | Populated from logged-in mechanic profile |
| `certificate_number` | Mechanic's A&P/IA certificate number |
| `signature` | Signature placeholder (triggers E-Sign flow) |

### Entry Actions

After generation, the following actions are available:

| Action | Behavior |
|---|---|
| `Save to Logbook` | Saves entry to the aircraft's digital logbook |
| `Download PDF` | Exports a print-ready PDF of the maintenance record |
| `Share Link` | Generates a shareable URL |
| `Email` | Opens email composer pre-filled with the entry |
| `Print` | Triggers browser print dialog |
| `E-Sign` | Initiates digital signature flow |

### Notes for Developers
- The left panel preserves the user's text input so they can iterate and regenerate.
- The AI re-drafts on any text change + submit — do not auto-regenerate on keystroke.
- The draft panel uses a `[draft]` badge in the header until saved.

---

## 2. Work Orders

**Route:** `/maintenance/work-orders`

### Purpose
Full lifecycle management for maintenance work orders, from squawk intake through invoicing and closure.

### 2a. Work Order List

Displays all work orders for the active aircraft (or all aircraft, depending on context).

**List card fields:**
- WO number (`WO-YYYY-XXXX`)
- Status badge
- Aircraft tail + type
- Squawk/description (truncated)
- Assignee
- Opened date
- Document count
- Recent activity timestamp

**Filters:** All Status, search by WO number or description
**CTA:** `+ New Work Order` button (top right)

### 2b. Status Pipeline

Work orders follow a linear (but skippable) status pipeline:

```
Draft → Open → In Progress → Awaiting Parts → Ready for Signoff → Closed / Invoiced
```

Status is displayed as a clickable breadcrumb strip at the top of the work order detail page. Clicking a status advances or reverts the WO. Status badges use distinct colors.

### 2c. New Work Order Modal

Fields:
- `Aircraft` — dropdown, pre-filtered to org's fleet
- `Squawk / Customer Complaint` — freeform text
- `Internal Notes` — freeform text (not customer-visible)

On submit: creates the WO in `Draft` status, navigates to detail view.

### 2d. Work Order Detail

**Route:** `/maintenance/work-orders/:id`

Header fields:
- WO Number + status badge
- Aircraft (tail + type)
- Customer (company name)
- Mechanic (assigned user)
- Opened date

Body sections:

**Squawk / Customer Complaint**
Editable freeform field. Populated from creation modal.

**Discrepancy / Findings**
Mechanic's documented findings after inspection. Separate from the customer-reported squawk.

**Corrective Action**
Documented corrective work performed.

**Labor**

| Column | Type |
|---|---|
| Description | Text |
| Hours | Decimal |
| Rate | Currency ($/hr) |
| Amount | Computed (hours × rate) |

`+ Add Labor` button appends a new line item.

**Parts**

| Column | Type |
|---|---|
| Description | Text |
| P/N | Part number |
| Qty | Integer |
| Price | Currency |

`+ Add Parts` button opens the Add Part modal (can link to Parts Catalog or manual entry).

**Totals**
- Labor/Time subtotal
- Parts subtotal
- **Total** (bold)

**Internal Notes** (not customer-visible)
**Customer Notes** (included in customer-facing outputs)

**Bottom Action Bar:**

| Action | Behavior |
|---|---|
| `Generate Logbook Entry` | Triggers AI to draft logbook entry from WO data |
| `Generate Invoice` | Creates invoice record from WO line items |
| `Export PDF` | Full WO export as PDF |
| `Email Customer` | Pre-fills email with WO summary |
| `Share Link` | Shareable WO URL |
| `Print` | Browser print |

---

## 3. Parts & Ordering

**Route:** `/maintenance/parts-ordering`

Three sub-tabs: **Part Orders**, **Parts Catalog**, **Vendors**

### 3a. Part Orders

Displays all part orders for the org with totals summary.

**Table columns:** S/N, Description, Aircraft, Vendor, Qty, Price, Status

**Status values:**
- `Ordered` — PO placed, awaiting delivery
- `Received` — Part in hand
- `Quoted` — Quote received, not yet ordered
- `Needed` — Part required, not yet sourced

**Footer totals row:**
- Needed total
- On Order total
- Received total
- Grand Total

**Add Part Order Modal fields:**
- `Part Number`
- `Aircraft` — dropdown
- `Description`
- `Vendor` — dropdown (pulls from Vendors list)
- `Condition` — New / Overhauled / Serviceable / As-Removed
- `Qty`
- `Unit Price`
- `Link to Work Order` — associates part with a WO (e.g., `WO-2026-0047`)
- `Notes`

### 3b. Parts Catalog

Searchable grid of parts with filter by category. Each part card displays:
- Part image (or placeholder)
- Part number
- Description
- Compatible aircraft (tail numbers)
- Category (Engine, Avionics, Airframe, etc.)
- Price
- Actions: `Add to WO` / `Order`

`Add to WO` links the part directly to an active work order. `Order` opens the Add Part Order modal with part fields pre-filled.

### 3c. Vendors

Directory of parts vendors. Each vendor card displays:
- Vendor name
- Type badge (Distributor, OEM, Salvage, PMA)
- Phone number
- Website URL
- Actions: `Search Parts` (searches Parts Catalog filtered to vendor) / `Contact`

Default vendors shown: Aircraft Spruce, Preferred Airparts, Southeast Components, Garmin (direct), SkyGeek, Wentworth Aircraft.

---

## 4. Workflow (Kanban Board)

**Route:** `/maintenance/workflow`

A Kanban board showing all work orders across statuses for visual pipeline management.

**Columns:**
1. Draft
2. Open
3. In Progress *(includes On-Hold sub-state)*
4. Awaiting Parts
5. Ready for Signoff
6. Closed / Invoiced

**Card fields:**
- WO number + status badge
- Aircraft tail + type
- Customer name
- Assignee
- Opened date / last updated
- Dollar amount

**Toolbar:** Filter button, `+ New Work Order`

Drag-and-drop between columns updates WO status. Clicking a card navigates to the WO detail page.

---

## 5. Workspace (AI Chat)

**Route:** `/workspace`
Also accessible as a persistent right-side panel when triggered from within Work Orders or the Maintenance module.

### Purpose
The Workspace is the AI command center for the entire platform. Users interact with an LLM-backed assistant to create and update records, look up parts, generate entries, draft invoices, and get answers about the aircraft — all in a single chat thread.

### Layout
- **Left sidebar:** Thread list with AI-generated thread names, Recent Docs/entities, quick links (Order a Part, Workspace Settings)
- **Center panel:** Chat conversation
- **Right panel (slide-in):** Workspace Panel — live view of the artifact being worked on (WO, Invoice, Logbook Entry, etc.)

### Aircraft Context Bar (top)
When an aircraft is selected, a persistent context bar shows:

| Field | Example |
|---|---|
| Aircraft tail + type | N2345 – Cessna 172S Skyhawk SP |
| Airframe hours | 2,847.2 hrs |
| Last/Next due date | 2026-08-14 |
| Document count | 2 |
| Open items | 1 |

Top bar actions: `Order Part`, `Workspace` (toggle panel), `Order Part`

### Chat Input
Located at the bottom. Placeholder: *"Add N2345 anything — logbooks, ADs, maintenance history…"*

Quick-action shortcut chips:
- `Oil Change`
- `Annual Inspection`
- `AD Compliance`
- `Repair`
- `Show open squawks`
- `Check AD Compliance`

### AI Capabilities

#### 5a. Draft Logbook Entry
**Trigger phrase example:** *"Prepare a logbook entry for oil change for N2345"*

AI response:
- Confirms the draft is ready and open in the workspace panel
- Lists what it still needs (e.g., oil quantity and brand, Hobbs/tach reading)
- Renders a **Logbook Entry card** in the chat with linked records:
  - Oil Change Record
  - Logbook (e.g., #391)
  - N2345 Aircraft Record
  - Part Registry

**Entry card actions:**
- `Add factory time on service`
- `Sign and seal entry`
- `Download as PDF`

#### 5b. Standard Maintenance Logbook Entry
**Trigger phrase example:** *"Prepare a logbook entry"* (from WO context)

AI pulls from the WO's corrective action and parts used, then drafts a logbook entry in the Workspace Panel:

**Panel fields:**
- Aircraft: N2345, tach time, date
- Maintenance Records Date
- `[Work description to be entered]` — editable placeholder
- Aircraft returned to service certification (14 CFR 43.3(a))
- Mechanic name, certificate number

**Required fields** are flagged (outlined in orange/red if empty).

**Panel actions:**
- `Edit Entry`
- `Regenerate Wording`
- `Show Owner-Friendly` (rewrites in plain language)
- `Sign & Seal Entry`

**Next Required Steps sidebar:**
- Send to digital aircraft logbook
- Send digital copy to aircraft owner

#### 5c. Create Work Order
**Trigger phrase example:** *"Create a work order"* or *"Create an oil change work order for N2345"*

AI creates the WO and opens it in the right-side Workspace Panel with aircraft and customer info pre-filled.

**Inline commands the AI understands (typed naturally in follow-up messages):**
- `"add 2.5 hours labor"` → appends labor line item
- `"add oil filter part AIC133"` → appends part to WO
- `"set squawk to left brake dragging"` → updates squawk field
- `"set squeeze to left brake dragging, mark awaiting parts"` → updates status + field
- `"mark awaiting parts"` → advances status

**Work Order panel fields in Workspace:**
- WO Number (auto-assigned)
- Aircraft, Mechanic, Opened date, WO#
- Squawk/Customer Complaint
- Labor line items (with hours + rate + computed total)
- Parts (placeholder text: "You asked 'say Thorpe'" for parts lookup context)
- Total Estimated
- `Generate Entry` button

#### 5d. Generate Invoice
**Trigger phrase example:** *"Generate invoice"* (from WO context)

AI generates an invoice record (`INV-YYYY-XXXX`) and opens it in the Workspace Panel.

**Invoice panel fields:**
- Invoice number
- Aircraft + customer
- Date + due date + Net terms
- Line items table: Description, Qty, Rate, Amount
- Subtotal
- Tax (configurable %)
- **Total Due**

**Payment status selector:** `Unpaid` / `Pending` / `Partially Paid` / `Paid`

**Actions:**
- `Email` (sends invoice to customer)
- Download PDF
- Share

#### 5e. Parts Lookup
**Trigger phrase example:** *"Find parts for this aircraft"* or *"Find an oil filter for N2345"*

AI searches the parts catalog and vendor network, returns results in chat:

> "I found 3 results for part compatible with N2345 (Cessna 172S Skyhawk SP)."

**Result card fields:**
- Part number + description
- Vendor name + type (Distributor, OEM, etc.)
- Stock status (In Stock / Backordered)
- Price

**Confidence flags:**
- ⚠️ Yellow warning if serial number range or applicability requires manual verification before ordering

**Result actions:**
- `Add to Work Order` — attaches the part to the open WO
- `Refine Search`
- `Save for Later`
- `Search alternate vendors`

#### 5f. Order a Part
After selecting a part, the AI can place the order:

> "Part ordered successfully. CH48110-1 – Oil Filter – Aviation Grade. Ordered from ePlane.com Marketplace. Ground shipping. Expected 7-9 business days. PO#: PO-2026-056. Total: $32.06"

**Order placed panel (right side):**
- Vendor name + network badge (e.g., Allan Parts Network)
- Part number + description
- Qty, shipping method, cost
- `Link to Work Order` — dropdown to attach PO to a WO

**Chat follow-up:** AI asks if you want to attach the part to an open work order.

#### 5g. General Aircraft Queries
The Workspace also handles free-form queries about the aircraft:

- *"When was the last prop overhaul?"*
- *"Show customer history"*
- *"Check AD compliance"*
- *"Show open squawks"*

AI responses cite the specific document or record that the answer was sourced from (linked chips below the response).

---

## 6. Operations Overview Dashboard

**Route:** `/dashboard`

### Stats Row

| Stat | Description |
|---|---|
| Aircraft | Total aircraft in the org |
| Documents Indexed | Total documents processed by AI |
| Upcoming Reminders | Inspections/ADs due within threshold |
| Open Squawks | Unresolved squawks across fleet |

### Your Fleet Section
Paginated list of aircraft cards. Each card shows:
- Aircraft photo
- Tail number + type
- Next due date
- Total time
- Document count
- Last activity

`View All` link navigates to `/aircraft`.

### Recent Activity Feed
Right-side feed of system events:
- AI-generated maintenance entries
- AD compliance evidence uploads
- Reminder triggers
- New queries
- Work orders created

`View Complete Log` link at bottom.

---

## Data Model Reference

### Aircraft
```ts
{
  id: string
  tail_number: string        // e.g., "N2345"
  make: string               // e.g., "Cessna"
  model: string              // e.g., "172S Skyhawk SP"
  year: number
  airframe_hours: number
  next_due_date: string      // ISO date
  document_count: number
  open_squawks: number
}
```

### Work Order
```ts
{
  id: string                 // e.g., "WO-2026-1049"
  status: 'draft' | 'open' | 'in_progress' | 'awaiting_parts' | 'ready_for_signoff' | 'closed' | 'invoiced'
  aircraft_id: string
  customer_name: string
  mechanic_id: string
  opened_date: string        // ISO date
  squawk: string
  discrepancy_findings: string
  corrective_action: string
  labor: LaborLineItem[]
  parts: PartLineItem[]
  internal_notes: string
  customer_notes: string
}
```

### Labor Line Item
```ts
{
  description: string
  hours: number
  rate: number               // $/hr
  amount: number             // computed: hours * rate
}
```

### Part Line Item / Part Order
```ts
{
  part_number: string
  description: string
  aircraft_id: string
  vendor_id: string
  condition: 'new' | 'overhauled' | 'serviceable' | 'as_removed'
  qty: number
  unit_price: number
  status: 'needed' | 'quoted' | 'ordered' | 'received'
  work_order_id?: string     // optional WO link
  po_number?: string
}
```

### Logbook Entry (Maintenance Record)
```ts
{
  id: string
  aircraft_id: string
  date: string               // ISO date
  tach_hobbs: number
  discrepancy: string
  corrective_action: string
  parts_used: PartReference[]
  references: string[]       // AD numbers, SI numbers, MM chapter refs
  mechanic_name: string
  certificate_number: string
  signature?: string         // base64 or signature token
  status: 'draft' | 'signed' | 'sealed'
}
```

### Invoice
```ts
{
  id: string                 // e.g., "INV-2026-2032"
  work_order_id: string
  aircraft_id: string
  customer_name: string
  date: string
  due_date: string
  net_terms: number          // e.g., 30
  line_items: InvoiceLineItem[]
  subtotal: number
  tax_rate: number
  total_due: number
  payment_status: 'unpaid' | 'pending' | 'partially_paid' | 'paid'
}
```

---

## Key Interaction Patterns

### Workspace Panel (Right Slide-In)
The Workspace Panel is a persistent right-side panel that slides in whenever the AI creates or opens an artifact (WO, invoice, logbook entry). It is:
- Triggered by AI actions or by clicking artifacts in chat
- Always in sync with the underlying record (real-time updates as you type in chat)
- Closable without losing the record

### Inline Chat Commands
The AI understands natural language commands that map to structured actions on the currently open workspace artifact. These commands update the artifact in real time without requiring the user to navigate to the detail page.

### Citation Chips
Every AI response that retrieves data from the aircraft record system appends citation chips below the response body linking to the source record (e.g., `Oil Change Record`, `Logbook 391`, `Maintenance Records`, `Work Orders`). These are clickable and open the source in the Workspace Panel.

### "Generate Entry" from Work Order
Clicking `Generate Logbook Entry` in the Work Order detail bottom bar triggers the AI to draft a logbook entry pre-populated from the WO's corrective action, parts, and labor data. The draft opens in the Workspace Panel and the WO context is preserved.

---

## Permissions & Roles (Observed)

From the UI, the following roles appear to exist:
- **Mechanic** — creates/signs logbook entries, manages WOs
- **Customer** — receives customer-facing notes and invoices
- The logged-in user (`John Mitchell`) is presented as the default mechanic/assignee

Full RBAC spec to be defined separately.

---

## Notes & Open Questions

- The global search bar at the top (`Search records or ask your aircraft...`) appears to combine record search and AI Q&A in a single input. Behavior when it returns both structured results and AI answers needs spec.
- The `E-Sign` flow on logbook entries is not fully shown — integration with signing provider (e.g., DocuSign, HelloSign, native) needs to be defined.
- The `Scanning` nav item visible on the marketing site suggests a document ingestion feature (likely scan-to-index for paper logbooks) not fully demonstrated in this walkthrough.
- Parts Catalog data source and sync frequency need to be defined (vendor API integrations vs. static catalog).
- Workspace threads are auto-named by the AI from the conversation content — the naming heuristic should be documented.
