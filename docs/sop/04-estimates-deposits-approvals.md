---
sop_id: "SOP-04"
title: "Estimates / Deposits / Owner Approvals"
module: "estimates"
version: "1.0.0"
status: "active"
last_updated: "2026-05-14"
faa_refs: []
source_file: "mark downs/manuals/4. estimate/myaircraft_estimates_deposits_approvals_sop_codex.md"
---

# myaircraft.us Estimates / Deposits / Owner Approvals SOP and Codex Specification

**Section:** 4 of 8 - Estimates / Deposits / Owner Approvals  
**Audience:** product, design, engineering, QA, SOP/manual authors, Codex/Claude Code agents  
**Purpose:** Define the estimate module as an aircraft-linked, AI-first commercial quoting workflow for labor, parts, deposits, owner approval, and conversion into work orders.

---

## 1. Executive Summary

The Estimate module controls the **planned commercial scope** of work before maintenance execution begins. It is where the shop quotes labor, parts, outside services, supplies, taxes, deposits, owner approval, and terms.

The estimate is **not** the final work record. It is the plan. The work order is the execution truth. The invoice is generated from reviewed actual work-order labor, installed parts, approved charges, taxes, and deposit credits.

The estimate workflow must be **AI-first** but human-approved:

- The user selects or inherits aircraft context.
- Open aircraft squawks are automatically available.
- The user dictates or uploads scope evidence.
- AI drafts estimate scope and line items.
- The lead/admin reviews and approves before owner delivery.
- Owner approves, pays deposit, asks questions, or declines.
- Approved estimate can convert into a work order setup.

---

## 2. Source-of-Truth Doctrine

### 2.1 Estimate Source-of-Truth Rule

Estimate owns:

- Planned commercial scope
- Planned labor/parts/outside/supply line items
- Deposit request
- Owner approval
- Estimate terms
- Estimate validity period
- Owner questions and responses related to the quote
- Estimate-to-work-order conversion reference

Estimate does **not** own:

- Actual completed work
- Actual installed parts
- Final labor hours
- Final invoice truth
- Signed logbook record

### 2.2 Work Order vs Estimate Rule

The estimate is the plan. The work order is reality.

If estimated labor is 12 hours but actual logged labor is 13.5 hours, final billing must come from approved work-order actuals and change-order/approval rules, not blindly from the original estimate.

### 2.3 Invoice Rule

Invoice should use:

- Approved actual labor
- Installed/used parts
- Approved outside services
- Taxes/fees
- Deposits/payment credits
- Approved change orders

Do not invoice estimated items that were not used unless intentionally marked billable by authorized staff.

---

## 3. Core Principles

1. Estimates must be aircraft-linked before official send or approval.
2. Aircraft-created estimates auto-fill and lock aircraft, owner, creator, role, source, tach/Hobbs/location.
3. Global estimates require aircraft selection or aircraft creation before official save/send.
4. Open squawks are automatically available from the selected aircraft.
5. A selected squawk can generate estimate scope and line items.
6. Estimates can still be created without squawks for normal quotes.
7. Estimate creation should default to AI-first capture: dictate, photo, file, selected squawks, AI draft.
8. AI output is draft only; human review is mandatory before owner delivery.
9. Every estimate line must show a source label: template, squawk, inventory, shop rule, AI, manual, work order, or outside service.
10. Deposit is a payment/credit, not a labor/part line item.
11. Owner approval must be audited.
12. Owner-facing view must be clean and not expose internal notes, cost basis, AI draft warnings, or internal chat.
13. Approved estimate can create a work order, but cannot substitute for the work order execution record.
14. Declined, expired, archived, or superseded estimates must remain traceable.
15. Edits after owner approval must create revision records or change orders.

---

## 4. User Entry Points

### 4.1 From Aircraft

This is the preferred path when a user is already viewing an aircraft.

System behavior:

- Aircraft is auto-filled and locked.
- Owner/customer is auto-filled and locked.
- Created-by is auto-filled and locked.
- Role is auto-filled from user profile.
- Source is set to Aircraft page.
- Tach/Hobbs/total time/location are pulled into AI context.
- Open squawks are listed.
- User selects squawks or creates estimate without squawks.

### 4.2 From Squawk

When the user creates estimate from a squawk:

- Aircraft is locked from squawk.
- Squawk is selected automatically.
- Squawk title, description, severity, photos, video, voice transcript, and AI draft are available.
- AI suggests estimate lines based on discrepancy and shop pricing.

### 4.3 From Work Order

This path is used for supplemental quotes or change estimates during work.

System behavior:

- Work order, aircraft, owner, and related tasks are locked.
- Existing work order line items and actual findings can inform the quote.
- Owner approval links back to work order and activity timeline.

### 4.4 From Estimates Module

When created globally:

- User must choose aircraft first.
- If aircraft does not exist, user enters tail number and creates aircraft profile.
- Owner/payee must be selected or created.
- Only then can estimate become official/sendable.

### 4.5 Manual / Custom Estimate

Manual estimates are allowed but still require aircraft and owner before official send.

Use cases:

- General quote
- Parts quote
- Pre-buy quote
- Shop fee estimate
- Non-squawk service quote

---

## 5. Required Estimate Dashboard UI

The Estimate Dashboard is the global queue for all quotes across the shop.

### Required Widgets

- Draft estimates
- Sent estimates
- Awaiting owner approval
- Deposit pending
- Approved estimates
- Declined estimates
- Expired estimates
- Estimates ready to convert to work order

### Required Search/Filters

- Estimate ID
- Aircraft tail number
- Owner/customer
- Squawk ID
- Work order ID
- Status
- Created by
- Date range
- Deposit required
- Deposit paid
- Approval status

### Required Table Columns

| Column | Description |
|---|---|
| Estimate ID | EST-#### |
| Aircraft | Tail and model |
| Owner | Customer/payee |
| Scope | Short commercial title |
| Source | Aircraft, squawk, WO, manual |
| Total | Estimated total |
| Deposit | Required/paid/pending |
| Status | Draft/sent/approved/declined/expired |
| Next Action | Send, remind, convert, archive |

---

## 6. Auto Context Requirements

When estimate starts from aircraft, show a pre-contextualized form instead of blank fields.

### Locked Fields

- Aircraft
- Owner/customer
- Created by
- User role
- Source
- Tach
- Hobbs
- Total time
- Location

### Editable Fields

- Estimate type
- Price book
- Tax profile
- Valid until
- Terms
- Selected squawks
- AI scope input
- Line items
- Deposit settings
- Send/approval actions

### System Rule

The user should not be forced to re-enter data the platform already knows.

---

## 7. Squawk Pull-In Rules

Open squawks for the selected aircraft should appear automatically.

User can:

- Include selected squawks
- Exclude squawks
- Create estimate without squawks
- Convert selected squawk into scope text
- Convert selected squawk into line item suggestion
- Preserve link between estimate line and source squawk

A squawk included in an estimate must remain linked to the estimate and aircraft timeline.

---

## 8. AI-First Estimate Creation

### Capture Inputs

- Dictation/prompt
- Photos
- Videos
- Files
- Selected squawks
- Aircraft context
- Shop rate table
- Price book
- Inventory availability
- Work order context if applicable
- Template scope if selected

### AI Draft Outputs

AI should suggest:

- Estimate title
- Customer-facing scope
- Internal scope note
- Labor line items
- Part line items
- Outside service lines
- Shop supply lines
- Tax/fee treatment
- Deposit recommendation
- Inventory warnings
- Owner approval summary

### AI Safety Rule

AI may draft. Human must approve. Do not send owner-facing estimate until authorized user reviews and approves.

---

## 9. Line Item Requirements

Each estimate line must include:

- Type: labor, part, outside service, supply, tax, fee, discount
- Description
- Quantity
- Unit rate
- Amount
- Source label
- Billable yes/no
- Owner-visible yes/no
- Inventory status if part
- Linked squawk/task/source if applicable

### Source Labels

- Template
- Squawk
- AI/Inventory
- Shop Rule
- Manual
- Work Order
- Outside Vendor
- Price Book

### Inventory Warning

If a part is suggested but not confirmed available, system should show warning:

> Verify part availability before sending estimate.

---

## 10. Deposit and Payment Request

Deposit is optional but must be structured clearly.

### Deposit Fields

- Deposit required: yes/no
- Amount
- Due timing
- Payment options
- Override reason if no deposit required when policy expects one

### Payment Options

- Card / Stripe
- Zelle with proof upload
- Cash manually recorded
- Check manually recorded
- ACH / manual method
- No deposit with authorized override

### Deposit Rule

Deposit is a payment/credit record. It is not a normal estimate line item.

When invoice is generated later, the deposit appears as applied credit/payment.

---

## 11. Owner Approval Portal

Owner should see a clean, customer-facing estimate.

### Owner Sees

- Aircraft
- Estimate ID
- Scope title
- Customer-facing scope bullets
- Estimated total
- Deposit requested
- Balance after deposit
- Estimated completion date
- Approval button
- Pay deposit button
- Ask question button
- Terms and expiration date

### Owner Must Not See

- Internal chat
- Internal notes
- Cost basis
- Draft AI warnings
- Mechanic-only comments
- Vendor cost if hidden
- Unapproved draft line items

### Approval Audit

Owner approval must capture:

- Owner identity or guest identity
- Timestamp
- IP address
- Device/browser metadata
- Approved amount
- Approved scope
- Terms accepted
- Deposit status
- Related estimate ID
- Related aircraft ID

---

## 12. Status Model

Recommended estimate statuses:

- Draft
- Internal Review
- Ready to Send
- Sent
- Viewed
- Owner Question
- Awaiting Approval
- Awaiting Deposit
- Approved
- Deposit Paid
- Declined
- Expired
- Superseded
- Converted to Work Order
- Archived

---

## 13. Conversion to Work Order

Approved estimate can create work order setup.

When converting:

- Aircraft and owner carry forward.
- Selected squawks carry forward.
- Approved estimate lines become planned work-order line items.
- Deposit reference carries forward.
- Estimate approval record remains linked.
- Work order creation flow continues with tasks/checklists/AD/SB as appropriate.

### Conversion Rule

Estimate does not create completed work. It creates work-order setup.

---

## 14. Change Orders and Revisions

If scope changes after owner approval:

- Create a revision or change order.
- Preserve original approved estimate.
- Show what changed: labor, parts, outside service, tax, deposit, due date.
- Request additional owner approval where required.
- Store audit event.

Do not silently edit approved estimates.

---

## 15. Permissions

| Role | Create Draft | Edit Lines | Send to Owner | Override Deposit | Convert to WO | View Financials | Owner Approval |
|---|---:|---:|---:|---:|---:|---:|---:|
| Admin | Yes | Yes | Yes | Yes | Yes | Yes | No |
| Lead Mechanic | Yes | Yes | Yes | Yes | Yes | Limited/Yes | No |
| A&P Mechanic | Yes | Limited | No/Permission | No | No/Permission | No | No |
| Parts Manager | Add parts | Parts only | No | No | No | Cost-limited | No |
| Apprentice | Draft notes only | No | No | No | No | No | No |
| Owner | No | No | Receives | Pays | No | Own estimate only | Yes |

---

## 16. Audit Requirements

Every important event must create immutable audit_event record:

- Draft created
- Context locked
- Squawk selected/deselected
- AI draft generated
- AI line accepted/edited/deleted
- Deposit requested
- Estimate sent
- Owner opened estimate
- Owner asked question
- Owner approved/declined
- Deposit paid/proof uploaded
- Admin verified manual payment
- Estimate converted to work order
- Estimate revised/superseded
- Estimate exported/shared

Audit event fields:

- actor_id
- organization_id
- aircraft_id
- estimate_id
- action
- timestamp
- source context
- before/after summary
- IP/device metadata where applicable
- linked record IDs

---

## 17. Mobile and iPad Requirements

### Mobile

Mobile estimate creation should not show the dense line table first.

Mobile sequence:

1. Context locked
2. Select squawks
3. Dictate scope
4. Review AI draft
5. Review deposit
6. Send to owner

### iPad

iPad should support split-pane review:

- Left: context and squawks
- Middle: AI draft and line items
- Right: owner preview/deposit

### Offline Drafting

Mechanic-facing capture should support offline draft for:

- Dictation transcript
- Photos/files
- Notes
- Selected squawks
- Draft scope

Official send requires online sync.

---

## 18. Data Model Requirements

### estimate

- id
- organization_id
- aircraft_id
- owner_id
- created_by
- source_type
- source_id
- status
- estimate_type
- price_book_id
- tax_profile_id
- terms
- valid_until
- deposit_required
- deposit_amount
- deposit_due_policy
- approval_status
- approved_at
- approved_by_identity
- converted_work_order_id

### estimate_line

- id
- estimate_id
- source_type
- source_id
- type
- description
- quantity
- unit_rate
- amount
- billable
- owner_visible
- inventory_part_id
- inventory_status
- tax_code
- sort_order

### estimate_ai_draft

- id
- estimate_id
- prompt
- transcript
- attachments
- model_output_json
- confidence
- warnings
- accepted_by
- accepted_at

### owner_approval

- id
- estimate_id
- owner_id or guest_identity
- approved_scope_snapshot
- approved_amount
- approved_terms
- deposit_status
- timestamp
- ip_address
- device_metadata
- signature_or_typed_name

### deposit_payment

- id
- estimate_id
- owner_id
- method
- amount
- status
- proof_attachment_id
- external_payment_reference
- verified_by
- verified_at
- applies_to_invoice_id

---

## 19. Acceptance Criteria

1. Aircraft-created estimate locks aircraft/owner/creator/context.
2. Global estimate cannot be sent without aircraft and owner.
3. Open aircraft squawks appear automatically.
4. User can include or exclude squawks.
5. Estimate can be created without squawks.
6. AI scope draft can be generated from dictation/files/squawks.
7. AI line items are editable before send.
8. Every line item shows source.
9. Deposit is represented as payment/credit, not line item.
10. Owner can approve, pay deposit, or ask question.
11. Owner approval audit exists.
12. Approved estimate can convert to work order setup.
13. Converted work order links back to estimate.
14. Work order actuals later control invoice truth.
15. Edits after approval create revisions/change orders.
16. Owner-facing view hides internal data.
17. Mobile flow hides dense tables until review.
18. Every send/share/export creates audit event.

---

## 20. QA Scenarios

### Scenario A - Aircraft-created Estimate

1. Open N123AB aircraft page.
2. Click + Create > Estimate.
3. Verify aircraft/owner/creator/source locked.
4. Verify open squawks listed.
5. Select SQ-0221.
6. Dictate scope.
7. Generate AI estimate.
8. Confirm line sources include SQ-0221 and Template.
9. Add deposit.
10. Send to owner.

Expected: estimate is linked to aircraft timeline, owner, squawk, and approval flow.

### Scenario B - Global Estimate Without Aircraft

1. Open Estimates module.
2. Click + Estimate.
3. Try to send without aircraft.

Expected: system blocks send and requests aircraft selection or aircraft creation.

### Scenario C - Owner Approval and Deposit

1. Owner opens estimate link.
2. Owner approves.
3. Owner pays card deposit.

Expected: owner approval audit and deposit payment record are created.

### Scenario D - Convert to Work Order

1. Approved estimate exists.
2. Click Convert to Work Order.

Expected: selected squawks and approved lines prefill work-order creation; estimate remains source record.

### Scenario E - Post-Approval Edit

1. Approved estimate exists.
2. User changes labor from 12 to 14 hours.

Expected: system creates revision/change order and does not silently overwrite approved estimate.

---

## 21. Codex Implementation Directives

When implementing this module, Codex/Claude must:

1. Treat estimate as commercial plan, not work execution truth.
2. Enforce aircraft_id before official send.
3. Lock aircraft context when launched from aircraft.
4. Pull open squawks into estimate creation.
5. Implement AI-first draft workflow but require human approval.
6. Store line item source labels.
7. Keep deposit as payment/credit record.
8. Create owner approval audit records.
9. Link approved estimate to work-order setup, not completed work.
10. Preserve approved versions and use revisions/change orders after approval.
11. Hide internal data from owner portal.
12. Audit all create/edit/send/approval/payment/conversion/share/export actions.

---

## Appendix A - Original Uploaded Baseline

The uploaded estimate specification was incorporated and expanded. Its key rule remains authoritative:

> Estimate owns planned scope, approval, and deposit request. Work order owns actual work. Invoice uses approved actuals.


---

## Appendix B - Uploaded Baseline Text

# Estimates / Deposits / Owner Approvals - Codex Implementation Specification

## Purpose
Estimates are the planned commercial scope. They quote labor/parts, request deposit, and capture owner approval before conversion to work order when required.

## Source-of-Truth Rule
Estimate owns planned scope, approval, and deposit request. Work order owns actual work. Invoice uses approved actuals.

## Core Principles

- Estimate is the plan; work order actuals later control invoice truth.
- If estimate starts from aircraft, aircraft/owner/creator/times/location/open squawks are auto-filled and locked.
- Estimate creation is AI-first: dictate scope, attach files/photos, select squawks, AI drafts line items.
- Deposit is a payment/credit, not a labor/part line item.
- Owner approval must capture identity, timestamp, IP/device metadata, scope, amount, terms, and deposit status.

## User Workflow

1. Open estimates dashboard
2. Click + Estimate
3. If global: select aircraft or create from tail lookup
4. If aircraft context: lock aircraft/owner/creator
5. Select open squawks or create without squawks
6. Dictate/attach scope
7. AI drafts labor/parts/outside/supplies/tax
8. Human edits/approves
9. Request deposit
10. Send to owner
11. Owner approves/pays/asks question
12. Convert to work order or archive

## UI Requirements

### Estimate Dashboard
- Draft, sent, approved, declined, deposit pending
- Search by tail, owner, squawk, work order
- Global list and aircraft-specific tab

### Auto Context
- Aircraft, owner, creator, role, source locked from aircraft
- Tach/Hobbs/location pulled to AI context
- Open squawks auto-listed

### AI Scope
- Dictation/prompt
- Photo/file attachments
- Selected squawks become scope and line sources

### Line Items
- Labor, parts, outside service, supplies, tax
- Each line shows source: template/squawk/inventory/shop rule
- Inventory check warnings

### Deposit & Approval
- Card, Zelle proof, cash/check/manual
- Owner portal approve/pay/ask question
- Approval audit stored

### Convert
- Approved estimate can create work order setup
- Deposit later applies to invoice

## Data Model Requirements

- estimate: aircraft_id, owner_id, status, source, created_by, terms, valid_until, deposit_required, deposit_amount, approval_status
- estimate_line: source, type, description, qty, rate, amount, inventory_status
- owner_approval: identity, timestamp, IP, device metadata, approved_amount, approved_scope, terms

## Permissions

- Lead/Admin create/send; Owner approves; Mechanic may draft if permission; only authorized roles override deposit/approval.

## Acceptance Criteria

- Aircraft-created estimate locks aircraft context
- AI draft can be edited
- Deposit is credit/payment record
- Owner approval audit exists
- Approved estimate can create WO

## Audit Requirements
- Every important create, edit, route, approval, signature, payment, export, and share action MUST create an immutable audit event.
- Audit events MUST include actor, target, action, timestamp, source context, and linked aircraft where applicable.
- Signed and exported records MUST use revision/version records rather than silent overwrite.

## Mobile/iPad Requirements
- Mobile must prioritize one-hand capture and hide dense tables behind review screens.
- iPad must support split-pane review where useful.
- Offline-tolerant drafting should be used for mechanic-facing capture: notes, photos, checklist taps, timers, and drafts.

