---
sop_id: "SOP-01"
title: "Dashboard + Create Menu"
module: "dashboard"
version: "1.0.0"
status: "active"
last_updated: "2026-05-14"
faa_refs: []
source_file: "mark downs/manuals/1. dashboard mechanic/myaircraft_dashboard_create_menu_sop_codex.md"
---

# myaircraft.us Dashboard + Universal Create Menu SOP and Product Specification

**Section:** 1 of 8 - Dashboard + Universal Create Menu  
**Audience:** product, design, engineering, QA, SOP/manual authors, Codex/Claude Code agents  
**Purpose:** Define the dashboard command center and the universal + Create launcher for myaircraft.us.

## 1. Executive Summary

The Dashboard is the **Shop Command Center**. It is intentionally **not** a permanent record page. It is an exception dashboard that surfaces the work, approvals, billing, aircraft risks, and assignments that need human attention today.

The permanent truth must remain inside source records:

- Aircraft Master Record owns aircraft identity, owner, times, timeline, compliance, documents, and full aircraft history.
- Squawks own discrepancy intake and traceability.
- Estimates own commercial scope, owner approval, and deposits.
- Work Orders own maintenance execution, checklist completion, actual labor/parts, AI review, logbook readiness, and closure gates.
- Invoices own final billing, payments, receipts, and balance.
- Logbook Entries own signed maintenance/inspection records.
- Reports own cross-record exports, packages, analytics, and scheduled summaries.

The Dashboard only **shows exceptions and launches workflows**.

## 2. Core Doctrine

### 2.1 Dashboard Rule

The Dashboard is a command surface, not a source of truth.

It may display the state of records, but it must not become the permanent place where operational facts live. Every dashboard card must link back to the owning module and, where possible, the Aircraft Master Record timeline.

### 2.2 Create Menu Rule

The + Create button must open a **smart menu**, not a blank generic form.

The user chooses what operational record they are creating:

1. Squawk / Discrepancy
2. Estimate / Quote
3. Work Order
4. Invoice
5. Logbook Entry
6. Aircraft
7. Upload / AI Intake

The system then routes the user into the correct module-specific create flow.

### 2.3 Official Save Rule

Users may start anywhere, but an official record must attach to an aircraft before final save unless it is an aircraft draft itself.

If the aircraft does not exist, the system must route to aircraft creation using tail number lookup, owner/payee intake, and review-confirmed save.

### 2.4 Context Rule

When a record is started from a context page, the system must prefill and lock relevant context.

Examples:

- From Aircraft: lock aircraft and owner.
- From Work Order: lock work order, aircraft, owner, and source.
- From Estimate: lock estimate, aircraft, owner, approval/deposit context.
- From Invoice: lock invoice, aircraft, owner, source and payment context.
- From Logbook: lock logbook entry, aircraft, source work order if present.

## 3. Dashboard Goals

The dashboard must answer these questions in under five seconds:

1. What is active right now?
2. What needs a human decision?
3. Which aircraft are at risk?
4. What is waiting on an owner?
5. What is ready to invoice?
6. What is blocked because of parts, checklist, logbook, payment, or approvals?
7. What am I personally assigned to do?
8. Where do I click to start a new record?

## 4. Required Dashboard Layout

### 4.1 Header

The dashboard header should include:

- Page title: **Dashboard - Shop Command Center**
- Subtitle: **Global operating view: current work, approvals, billing, and aircraft risk.**
- New Intake button
- + Create button
- Optional global search field, if not already in top navigation

### 4.2 KPI Strip

The first row should contain high-level operational counters:

| Card | Purpose | Example |
|---|---|---|
| Active Work Orders | Current execution load | 18, with 4 due soon |
| Estimates Waiting | Quotes waiting for owner/shop action | 7, with $12.4k pending |
| Owner Approvals | Decisions pending from owners | 5 needs action |
| Ready to Invoice | Work ready for billing | 3, with $4.8k ready |

These are entry points, not final reports. Clicking a KPI opens the filtered module list.

### 4.3 Today's Action Queue

This is the highest-priority operational table.

Required columns:

- Record ID
- Aircraft
- Next Action
- Status
- Assigned user or owner
- Due / age indicator

Examples:

- WO-0512 / N123AB / Airframe checklist blocked / In Progress
- EST-0045 / N20957 / Owner deposit pending / Approval
- SQ-0221 / N262EE / Left nav light inop / New
- INV-0187 / N67844 / Payment due today / Sent
- LOG-0091 / 260TA / IA signature required / Draft

Rules:

- Items are sorted by urgency, not creation date.
- User can filter by “Mine,” “Shop,” “Owner Waiting,” “Overdue,” and “Compliance.”
- Every row links to the source record and aircraft timeline.
- Dashboard may show the next action but must not replace the source module workflow.

### 4.4 Aircraft Risk Board

This board highlights aircraft with operational, compliance, or billing risk.

Required columns:

- Tail number
- Open items
- Context
- Risk level
- Recommended next action

Risk sources:

- Open high-priority squawks
- AD/SB unresolved or uncertain
- Logbook unsigned
- Work order overdue
- Owner approval overdue
- Invoice overdue
- Aircraft records cleanup required
- Missing tach/Hobbs/total time
- Parts backordered

Risk levels:

- High
- Medium
- Normal
- Low

Rules:

- The risk board is not a compliance record.
- It is a triage surface that links to the aircraft master record.
- Risk scoring should be explainable, not a mysterious AI score.

### 4.5 Revenue & Billing Snapshot

This card tracks the commercial pipeline without mixing it into maintenance execution.

Required rows:

- Draft Estimates
- Approved Estimates
- Ready Invoices
- Paid Today
- Overdue Invoices
- Deposits Pending

Rules:

- Estimate values are planned/commercial values.
- Work-order actuals and invoices drive final financial truth.
- Deposits are credits/payment records, not labor/part line items.
- Clicking a row opens the filtered Estimates or Invoices module.

### 4.6 My Assignments

This card is personalized to the logged-in user.

Example assignments:

- Inspect airframe / WO-0512 / N123AB / In Progress
- Review AD/SB / WO-0518 / 260TA / Ready
- Add logbook entry / WO-0499 / N8202L / Blocked
- Owner reply / EST-0045 / N20957 / Waiting

Rules:

- Mechanics should see assigned tasks and checklist work.
- Lead/IA should see review, signature, approvals, and close gates.
- Admin should see billing, deposits, owner messages, invoices, and receipts.
- The card must link to the exact action location, not only the parent record.

## 5. Universal + Create Menu

### 5.1 Menu Behavior

The + Create menu opens as a modal, popover, or slide-over panel. It must be fast and readable.

Each create option should show:

- Icon
- Record type
- One-line description
- Required context warning
- What it creates

### 5.2 Create Options

#### Squawk / Discrepancy

Purpose: fastest intake for a discrepancy.

Behavior:

- If from aircraft, aircraft/owner are locked.
- If global, user selects or creates aircraft before official save.
- AI-first capture: dictation, photos, video, files.
- AI drafts title, severity, category, description, and recommended route.
- User verifies before save.

Creates:

- Aircraft-linked squawk
- Evidence attachments
- Activity/audit event
- Optional owner-visible update

#### Estimate / Quote

Purpose: commercial approval and deposit collection.

Behavior:

- If from aircraft, aircraft/owner/creator are locked.
- If from squawk, selected squawk becomes source context.
- If from work order, work order and actual/estimated lines may be used according to policy.
- AI-first scope and line-item generation.
- Supports deposit request and owner approval.

Creates:

- Estimate
- Planned line items
- Deposit request
- Owner approval link
- Aircraft timeline event

#### Work Order

Purpose: maintenance execution.

Behavior:

- If from aircraft, aircraft context is locked.
- If from estimate, approved estimate lines and deposit context carry forward.
- If from squawk, selected squawk becomes linked child record.
- Runs through the universal work-order creation flow: aircraft, type, scope/squawks, AD/SB, tasks, estimate/deposit, checklist plan, review/create.

Creates:

- Work order
- Tasks/checklists
- Line items
- Assignments
- Activity events

#### Invoice

Purpose: billing after reviewed work or custom billing.

Behavior:

- If from work order, invoice pulls reviewed actual line items, deposits, taxes, aircraft, owner, and source reference.
- If from aircraft, user chooses work order, estimate, or manual/custom invoice.
- If from invoice module, user selects aircraft first.
- If aircraft missing, route to aircraft creation.

Creates:

- Invoice draft or sent invoice
- Payment link
- PDF/share link
- Receipt trail when paid

#### Logbook Entry

Purpose: maintenance/inspection/AD/SB record.

Behavior:

- If from work order, pulls work-order AI summary, checklist results, AD/SB, parts, labor, and source references.
- If from aircraft, aircraft is locked and user chooses source work order/template/manual entry.
- If from logbook module, user must select aircraft first.
- Supports airframe, engine, propeller, avionics, and appliance/component entries.

Creates:

- Logbook draft
- Signature workflow
- Certificate/audit package after signing

#### Aircraft

Purpose: create aircraft master record.

Behavior:

- User enters tail number.
- System performs registry lookup where supported.
- User confirms aircraft details.
- User adds owner/payee/contact information.
- System sends invite if applicable.

Creates:

- Aircraft master record
- Owner/customer relationship
- Aircraft timeline start event

#### Upload / AI Intake

Purpose: convert existing paper or digital documents into draft records.

Supported uploads:

- Paper work order
- PDF estimate
- Receipt
- Invoice
- Logbook entry
- Checklist
- Maintenance document
- Photo evidence

Behavior:

- AI extracts possible aircraft, owner, tail, dates, line items, notes, signatures, checklist items, and totals.
- User reviews extracted data before creating any official record.
- Nothing becomes official without user confirmation and aircraft attachment.

## 6. Context Matrix

| Starting Point | Required First Step | Auto-Filled / Locked | Allowed Create Paths |
|---|---|---|---|
| Dashboard | Choose record type | Logged-in user, org, current date | All create options |
| Aircraft | Choose record type | Aircraft, owner, aircraft context | Squawk, estimate, WO, invoice, logbook, upload |
| Squawk | Choose route | Squawk, aircraft, owner, source evidence | Estimate, WO, owner update |
| Estimate | Choose route | Estimate, aircraft, owner, approval/deposit context | WO, invoice, owner approval |
| Work Order | Choose action | WO, aircraft, owner, actuals, checklist context | Invoice, logbook, squawk, upload |
| Invoice | Choose payment/share/edit | Invoice, aircraft, owner | Payment, receipt, share, report |
| Logbook | Choose related action | Entry, aircraft, signer/source | Sign, print, share, revision |
| Reports | Choose report/export | Filtered scope | Export, scheduled report, source record jump |

## 7. Dashboard Global Search

Global search is part of the command center.

It must search:

- Tail number
- Aircraft make/model/serial
- Owner/customer name
- Work order ID and text
- Squawk ID and text
- Estimate ID and scope
- Invoice ID and amount
- Payment reference
- Logbook entry text
- Certificate number
- AD/SB identifiers
- Attachment filenames and metadata
- Notes where permission allows

Results should be grouped by module and show:

- Record type
- ID
- Aircraft
- Owner/customer
- Status
- Last updated
- Matched text
- Action shortcut

Permission rule: search must respect the logged-in user’s role. Owners must not see internal notes, internal chat, cost data, draft AI summaries, or staff audit data.

## 8. Notifications and Action Routing

Dashboard notifications should be actionable.

Notification types:

- Estimate approval pending
- Deposit pending
- Owner message received
- Work order blocked
- Checklist failed item unresolved
- Parts backordered
- AD/SB needs IA review
- Logbook draft ready for signature
- Invoice ready to send
- Payment received
- Payment proof needs verification
- Report ready
- Upload extraction needs review

Every notification should have:

- Target record
- Aircraft
- Required role
- Priority
- Due/age
- Recommended action
- Dismiss/snooze rules

## 9. Mobile and iPad Rules

### 9.1 Mobile Dashboard

Mobile dashboard must be reduced to action cards:

1. My Assignments
2. Today’s Action Queue
3. Approvals
4. Ready to Invoice
5. Aircraft Risk
6. + Create

Avoid dense tables on phone. Use cards with one primary action each.

### 9.2 Mobile + Create

+ Create opens a bottom sheet.

Order should prioritize speed:

1. Squawk / Discrepancy
2. Photo / AI Intake
3. Work Order
4. Estimate
5. Invoice
6. Logbook Entry
7. Aircraft

### 9.3 iPad Dashboard

iPad may use the desktop layout with fewer columns or split panels. Cards should remain large enough for hangar use.

## 10. Permissions

| Action | Apprentice | Mechanic / A&P | IA | Lead | Admin / Billing | Parts | Owner |
|---|---:|---:|---:|---:|---:|---:|---:|
| View shop dashboard | Limited | Yes | Yes | Yes | Yes | Limited | No |
| View personal dashboard | Yes | Yes | Yes | Yes | Yes | Yes | Owner portal only |
| Configure dashboard widgets | No | No | No | Yes | Yes | No | No |
| Use + Create squawk | Yes | Yes | Yes | Yes | Yes | Yes | Owner portal only |
| Use + Create estimate | No | Optional | Optional | Yes | Yes | No | No |
| Use + Create work order | No | Optional | Optional | Yes | Optional | No | No |
| Use + Create invoice | No | No | No | Optional | Yes | No | No |
| Use + Create logbook | No | If certified | Yes | If certified | No | No | No |
| Upload/AI intake | Limited | Yes | Yes | Yes | Yes | Yes | Owner upload only if allowed |
| Mark notification complete | Own items | Own items | Own items | Yes | Own billing items | Own parts items | No |

## 11. Data Model Requirements

### 11.1 dashboard_saved_view

Required fields:

- id
- org_id
- user_id or role_id
- name
- widget_layout_json
- filters_json
- visibility_scope
- created_by
- updated_by
- created_at
- updated_at

### 11.2 create_action

Required fields:

- id
- org_id
- actor_user_id
- source_module
- source_record_id
- selected_create_type
- aircraft_id, nullable until official save
- created_record_type
- created_record_id
- status: launched, draft_created, official_saved, abandoned, failed
- route_context_json
- timestamp
- device_metadata

### 11.3 notification

Required fields:

- id
- org_id
- target_module
- target_record_id
- aircraft_id
- assigned_user_id
- assigned_role
- notification_type
- priority
- due_at
- status: unread, read, snoozed, resolved, dismissed
- generated_reason
- recommended_action
- created_at
- resolved_at

### 11.4 global_search_result / search index

Search index should include:

- source_module
- source_record_id
- aircraft_id
- owner_id/customer_id
- searchable_text
- status
- updated_at
- permission_scope
- matched_metadata

### 11.5 audit_event

Required fields:

- id
- org_id
- actor_user_id
- actor_role
- action
- source_module
- source_record_id
- target_module
- target_record_id
- aircraft_id
- timestamp
- ip_address when applicable
- device/browser metadata when applicable
- before/after summary where applicable
- immutable event hash where applicable

## 12. Dashboard Widget Specification

### Active Work Orders Widget

Data source: Work Orders.

Shows:

- Active count
- Due soon count
- Overdue count
- Blocked count

Click behavior:

- Open Work Orders list filtered to active/blocked/due soon.

### Estimates Waiting Widget

Data source: Estimates.

Shows:

- Draft count
- Sent count
- Waiting approval count
- Deposit pending value

Click behavior:

- Open Estimates list filtered to waiting owner/shop action.

### Owner Approvals Widget

Data source: estimates, work orders, owner chat/change orders.

Shows:

- Pending approval count
- Needs action count
- Oldest pending approval

Click behavior:

- Open approval queue.

### Ready to Invoice Widget

Data source: Work Orders and Invoices.

Shows:

- Work orders ready for invoice
- Dollar amount ready
- Any missing review gates

Click behavior:

- Open filtered work order/invoice readiness queue.

### Aircraft Risk Board

Data source: aircraft, squawks, work orders, AD/SB, logbook, invoice.

Shows:

- Tail
- Risk reason
- Context
- Risk level

Click behavior:

- Open Aircraft Master Record at relevant tab.

### Revenue & Billing Snapshot

Data source: estimates, invoices, payments.

Shows:

- Draft estimate value
- Approved estimate value
- Ready invoice value
- Paid today
- Overdue amount

Click behavior:

- Open filtered financial records.

### My Assignments

Data source: tasks, checklist items, approvals, logbook drafts, owner messages.

Shows:

- Assigned task
- Source record
- Aircraft
- Status
- Due/age

Click behavior:

- Open exact action surface.

## 13. Audit and Security Rules

Dashboard and + Create must produce audit events for:

- User opened create menu
- User selected record type
- User created draft
- User abandoned draft
- User officially saved record
- User launched upload/AI intake
- User confirmed AI extraction
- User used global search to open sensitive record, where required by policy
- User dismissed/snoozed/resolved critical notification

Security rules:

- Dashboard visibility is role-based.
- Owner never sees internal dashboard.
- Financial widgets require billing/admin/lead permission.
- Compliance/signature widgets require lead/IA permission.
- Search results must be permission-filtered.
- AI intake must require human review before creating official records.

## 14. Acceptance Criteria

A correct Dashboard + Create implementation must satisfy all of the following:

1. Dashboard displays operational exceptions, not permanent source facts.
2. Every dashboard row/card links to the owning module and Aircraft Master Record where available.
3. + Create is available from dashboard and context pages.
4. + Create opens a smart menu with the seven approved create options.
5. Global create requires aircraft selection or aircraft creation before official save.
6. Context create pre-fills and locks relevant aircraft/source data.
7. Dashboard widgets are role-aware.
8. Owner users do not access internal dashboard.
9. Global search crosses aircraft, squawks, work orders, estimates, invoices, logbook, documents, owners, and reports.
10. Search results respect permissions.
11. Notifications route to exact action surfaces.
12. Upload/AI intake never creates official records without user review.
13. Every create action and critical dashboard action creates an audit event.
14. Mobile dashboard uses action cards rather than dense tables.
15. Dashboard remains fast, readable, and does not become a duplicate reporting module.

## 15. Implementation Guidance for Codex / Claude Code

When implementing this section:

- Build the Dashboard as a composition of query-backed widgets, not a monolithic table.
- Keep widget data read-only. Use actions to navigate to source modules.
- Build + Create as a reusable universal component.
- Pass a context object into + Create: source_module, source_record_id, aircraft_id, owner_id, work_order_id, estimate_id, invoice_id, squawk_id, logbook_entry_id.
- Require aircraft_id before official save for squawk, estimate, work order, invoice, and logbook records.
- Allow aircraft draft creation when aircraft_id does not yet exist.
- Store create_action records for launches and saves.
- Use feature flags for optional modules, but do not change the source-of-truth rules.
- Treat AI Intake as draft extraction only.
- Keep Dashboard separate from Reports. Reports handles exports, analytics, scheduled packages, and broad comparisons.

## 16. Manual / SOP Training Notes

Train users this way:

- Use Dashboard first to see what needs attention.
- Use + Create when starting a new operational record.
- Use Aircraft Master Record when reviewing one aircraft’s full history.
- Use Work Orders for execution.
- Use Estimates for approvals and deposits.
- Use Invoices for billing and payment.
- Use Logbook for signed maintenance records.
- Use Reports for exports and management packages.

Never train users to treat Dashboard as the permanent record.
