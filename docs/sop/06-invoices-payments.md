---
sop_id: "SOP-06"
title: "Invoices / Payments"
module: "invoices"
version: "1.0.0"
status: "active"
last_updated: "2026-05-14"
faa_refs: []
source_file: "mark downs/manuals/6. invoicing/myaircraft_invoices_payments_sop_codex.md"
---

# myaircraft.us - Invoices / Payments SOP + Codex Implementation Specification

## 1. Purpose
The Invoices and Payments module is the billing source of truth for myaircraft.us. It creates, reviews, sends, signs, tracks, and closes invoices connected to aircraft, work orders, estimates, deposits, owners, payments, receipts, and aircraft timeline history.

Invoices must be easy for the shop to generate, easy for the owner to understand, and strict enough to prevent billing from stale estimates or unverified charges.

## 2. Source-of-Truth Rule
**Invoice owns billed charges and payment status. Work Order owns actual work. Estimate owns planned scope and owner approval. Aircraft owns the complete aircraft-specific timeline.**

An invoice must not silently bill unused estimate assumptions. If the invoice is created from a work order, the default billing basis is the approved actual labor, installed parts, approved shop supplies, outside services, tax/fees, deposit credits, and authorized adjustments recorded on that work order.

## 3. Core Principles
- Invoice creation is context-aware, not a blank form.
- From Work Order: auto-pull aircraft, owner/payee, approved actuals, installed parts, source reference, taxes, deposits/credits, and balance due.
- From Aircraft: lock aircraft and owner, then allow user to choose an existing work order, an estimate, or custom/manual invoice.
- From Invoices module: require aircraft selection first. If aircraft is missing, create aircraft from tail lookup and add payee details before official invoice save.
- From Custom/manual invoice: still require aircraft and payee; manual line items must be clearly marked as manual.
- Deposits are payment credits, not normal labor/part invoice lines.
- Every payment method requires audit fields.
- Owner-facing invoice must hide internal cost data, internal notes, staff chat, and draft AI content.
- Every send, share, print, signature, payment, receipt, and mark-paid action creates immutable audit history.

## 4. User Entry Paths
### 4.1 From Work Order
Use when work has been completed or billing is ready from a work order.

System behavior:
1. Lock aircraft.
2. Lock owner/payee.
3. Lock source as work order.
4. Pull approved actual labor.
5. Pull installed parts and shop supplies.
6. Pull outside services, if present.
7. Apply deposit credits from approved estimate or work order.
8. Calculate tax/fees.
9. Generate invoice draft.
10. User reviews, signs/approves, and sends.

### 4.2 From Aircraft
Use when billing starts inside the aircraft record.

System behavior:
1. Lock aircraft.
2. Pull owner/payee from aircraft profile.
3. Present source choices: work order, estimate, custom/manual.
4. If work order selected, pull actuals.
5. If estimate selected, pull planned lines but require user review.
6. If custom, open manual line entry.

### 4.3 From Invoices Module
Use for global billing workflow.

System behavior:
1. User clicks + Create Invoice.
2. User selects aircraft first.
3. If aircraft does not exist, use tail lookup and create aircraft.
4. User selects payee.
5. User chooses source: work order, estimate, custom/manual.
6. System routes to the correct invoice builder.

### 4.4 Custom / Manual Invoice
Use for standalone sale, parts sale, non-work-order billing, or correction invoice.

Required:
- Aircraft
- Payee name
- Email or phone
- Invoice type
- Manual line items
- Tax/fee profile
- Audit reason if bypassing work order

## 5. Invoice Dashboard / Queue
The invoice dashboard shows all invoices across the shop. The aircraft page shows aircraft-specific invoices only.

Required dashboard filters:
- Invoice number
- Aircraft/tail number
- Owner/payee
- Source record
- Status
- Date range
- Due date
- Payment status
- Overdue
- Payment method

Statuses:
- Draft
- Ready to Send
- Sent
- Viewed
- Due
- Partially Paid
- Paid
- Overdue
- Void
- Refunded
- Written Off

Dashboard widgets:
- Draft invoices
- Sent invoices
- Due invoices
- Overdue invoices
- Paid invoices
- Deposits unapplied
- Manual payments requiring verification
- Zelle proof pending review

## 6. Create Invoice - Source Selection UI
The source selection screen prevents wrong billing paths.

Required source cards:
1. From Work Order - best for maintenance billing.
2. From Aircraft - aircraft and owner locked; choose source.
3. From Estimate - use with caution; planned quote lines require review.
4. Custom / Manual Invoice - manual lines with required aircraft/payee.
5. New Aircraft Path - tail lookup and payee intake when aircraft missing.

Validation rules:
- No official invoice can be saved without aircraft_id.
- No owner-facing invoice can be sent without payee contact.
- No work-order invoice can include work-order lines not approved for billing.
- No deposit can be treated as revenue line item.

## 7. Auto-Mapped Invoice Draft
When generated from a work order, the invoice draft must include:
- Aircraft
- Owner/payee
- Source work order ID
- Approved actual labor
- Installed parts
- Shop supplies
- Outside services
- Tax/fees
- Deposit credits
- Balance due
- Due date
- Terms
- Internal review status

Each invoice line must show source:
- WO Actual
- Installed Part
- Shop Rule
- Outside Service
- Manual
- Estimate Reference
- Adjustment
- Deposit Credit

## 8. Manual Invoice / New Aircraft Path
If the user starts globally and the aircraft is not already in the system:
1. Enter tail number.
2. Run tail lookup.
3. Auto-fill aircraft make/model/serial/year where available.
4. User confirms aircraft profile.
5. User adds payee name, email, phone.
6. System creates aircraft and customer/payee relationship.
7. User adds manual invoice lines.
8. User reviews tax/fees and due date.
9. User signs/approves and sends.

## 9. Payment Methods
Supported methods:
- Card / Stripe or equivalent hosted checkout
- Zelle proof upload
- Cash
- Check
- ACH/manual
- Other manual payment reference

### Card
- Owner pays through secure payment link.
- Payment status updates automatically when possible.
- Receipt is generated.
- Payment event appears on invoice and aircraft timeline.

### Zelle
- Owner uploads proof.
- Admin verifies proof.
- Admin marks payment as verified.
- Receipt is generated only after verification.

### Cash
- Admin/mechanic records amount, date, receiver, and notes.
- Optional photo/receipt upload.
- Manual payment audit required.

### Check
- Record check number, date, amount, bank notes, received by.
- Optional deposit/clearance status.

### ACH / Other
- Record method, reference number, date, amount, and proof.

## 10. Send, Share, Print, Sign
Invoice actions:
- Email invoice
- Text secure payment link
- Print invoice
- Share secure link
- Download PDF
- Add digital signature/approval
- Send again
- Void
- Record payment
- Mark paid
- Issue receipt

Digital signature/approval must capture:
- Approver user ID
- Full name
- Role
- Timestamp
- IP address
- Device/browser metadata
- Invoice ID
- Invoice version
- PDF/rendered invoice hash
- Source record references

## 11. Invoice Detail / Payment Closeout
Invoice detail page must show:
- Invoice number
- Aircraft
- Owner/payee
- Source type and source ID
- Status
- Line items
- Subtotal
- Tax/fees
- Deposit credits
- Payments
- Balance due
- Timeline
- Share/send history
- Receipt history
- Audit log

Closeout actions:
- Record payment
- Verify Zelle proof
- Mark paid
- Send receipt
- Refund deposit
- Void invoice
- Export PDF
- Print
- Share link

## 12. Owner View
Owner-facing invoice must include:
- Aircraft
- Invoice number
- Clean line-item summary
- Total
- Deposits/credits applied
- Balance due
- Due date
- Payment options
- Pay button
- Download PDF
- Ask question
- Receipt after payment

Owner must not see:
- Internal notes
- Internal chat
- Staff comments
- Vendor cost
- Draft AI text
- Internal margin
- Unapproved adjustments

## 13. Data Model Requirements
### invoice
- id
- aircraft_id
- owner_id/payee_id
- source_type
- source_id
- status
- issue_date
- due_date
- subtotal
- tax_total
- fees_total
- deposit_credit_total
- payment_total
- balance_due
- terms
- memo
- signed_by
- signed_at
- version
- hash

### invoice_line
- id
- invoice_id
- source_type
- source_id
- type
- description
- qty
- rate
- amount
- tax_category
- billable
- approved_for_billing
- linked_task_id
- linked_part_id
- linked_labor_id

### payment
- id
- invoice_id
- aircraft_id
- owner_id
- method
- amount
- status
- received_by
- received_at
- processor_reference
- manual_reference
- notes

### payment_proof
- id
- payment_id
- file_id
- proof_type
- uploaded_by
- verified_by
- verified_at
- verification_status

### receipt
- id
- payment_id
- invoice_id
- receipt_number
- delivered_to
- delivered_at
- pdf_hash

### share_event
- id
- invoice_id
- channel
- recipient
- sent_by
- sent_at
- opened_at
- delivery_status

### audit_event
- id
- actor_id
- target_type
- target_id
- action
- source_context
- aircraft_id
- timestamp
- metadata
- record_hash

## 14. Permissions
Roles:
- Admin / Billing
- Shop Owner
- Lead Mechanic
- Mechanic
- Parts Manager
- Owner / Customer

Permission rules:
- Admin/Billing can create, send, void, record payment, refund, export.
- Shop Owner can see financial analytics and override billing rules.
- Lead can create invoice from work order if configured.
- Mechanic can view related invoices but cannot mark paid unless authorized.
- Owner can view, pay, download receipt, and message shop.
- Manual payment recording requires Admin/Billing or configured Lead permission.

## 15. Audit Requirements
Every important action must create immutable audit event:
- invoice created
- source selected
- line imported
- line edited
- manual line added
- deposit credit applied
- signature/approval added
- email sent
- SMS sent
- link opened
- PDF downloaded
- printed
- payment received
- Zelle proof uploaded
- Zelle proof verified
- invoice paid
- receipt sent
- invoice voided/refunded

Signed/exported invoices require revision/version records, not silent overwrite.

## 16. Acceptance Criteria
- From Work Order invoice uses approved actuals.
- From Aircraft invoice locks aircraft and owner.
- From Invoices module requires aircraft first.
- If aircraft missing, tail lookup/create-aircraft flow is available.
- Custom invoice requires aircraft and payee.
- Deposit applies as credit/payment record.
- Zelle proof upload and review exists.
- Card payment creates receipt and timeline event.
- Manual payment captures recorder, amount, date, method, reference.
- Owner-facing invoice hides internal data.
- Payment and invoice events appear on aircraft timeline.
- Every send/share/payment/signature event is audited.

## 17. Mobile / iPad Requirements
Mobile:
- Show invoice status first.
- Show balance due and pay/record-payment actions.
- Hide dense line tables behind Review Lines.
- Allow quick send link, record payment, upload Zelle proof.

iPad:
- Use split-pane invoice list + invoice detail.
- Support side-by-side work order/source review and invoice preview.

## 18. Implementation Instruction to Codex / Claude Code
Build the invoice module as a context-aware billing workflow.

Do not implement a generic invoice form as the primary UX. Implement source-aware invoice creation:
1. Work order invoice builder.
2. Aircraft invoice builder.
3. Estimate invoice builder.
4. Custom invoice builder.
5. New-aircraft tail lookup invoice builder.

Preserve source links. Every invoice line must know why it exists. Every payment must know how it was received. Every exported invoice must be versioned and auditable.
