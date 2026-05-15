---
sop_id: "SOP-08"
title: "Reports / Global Search"
module: "reports"
version: "1.0.0"
status: "active"
last_updated: "2026-05-14"
faa_refs: []
source_file: "mark downs/manuals/8 report/myaircraft_reports_global_search_sop_codex.md"
---

# myaircraft.us Reports / Global Search SOP + Codex Implementation Specification

Version: 1.0  
Module: Reports / Global Search  
Status: Approved baseline for current UI. Designed to be extended as Parts, Compliance, Inspections, and additional modules mature.

---

## 1. Purpose

The Reports module is the consolidated command center for filtering, comparing, exporting, scheduling, and packaging operational, aircraft, financial, compliance, audit, and owner-facing records.

Reports is not another place to edit facts. It packages facts that already belong to aircraft, squawk, estimate, work order, invoice, payment, logbook, inventory, compliance, attachment, and audit modules.

## 2. Source-of-Truth Rule

**Reports packages facts owned by other modules; it must not become a second editable source of truth.**

- Aircraft page owns the permanent aircraft-specific history.
- Work orders own actual work, actual labor, actual parts, tasks, checklist execution, and activity.
- Estimates own planned scope, owner approval, deposit request, and commercial intent.
- Invoices own billed charges, payment status, deposit credits, receipts, and balance due.
- Logbook entries own final human-signed maintenance record language and signature certificates.
- Reports create snapshots, exports, schedules, and summaries.

If a report reveals incorrect data, the user must open the owning module and correct the source record. Reports may show the correction path, but must not silently overwrite source facts.

## 3. Core Design Principles

1. **Report center, not record center.** Reports are for comparison, export, packaging, and review.
2. **Aircraft-first filtering.** Every report that touches maintenance records should allow aircraft/tail filtering and should link back to the Aircraft Master Record.
3. **Owner-safe exports by default.** Owner-facing reports must hide internal chat, internal notes, cost/margin data, draft AI content, staff-only audit logs, and unresolved diagnostic uncertainty unless explicitly approved.
4. **Audited exports.** Every exported report stores generated_by, timestamp, filters, file hash, recipients, share status, and source modules included.
5. **Scheduled reporting.** Recurring reports must store schedule, recipients, filters, owner-safe mode, last run, next run, and failure state.
6. **Global search is an index, not a report.** Search spans the same entities but returns source records, not compiled packages.
7. **Modular extensibility.** Reports must support future expansion for Parts, Inventory, Compliance, Inspections, AD/SB, Mechanics, Owner Portal, and Accounting integrations.

## 4. Primary User Workflows

### 4.1 Run a saved report
1. Open Reports.
2. Select a saved report from the Reports Dashboard.
3. Review default filters and scope.
4. Preview report.
5. Resolve warnings if required.
6. Export, email, print, share link, or schedule.
7. Store report_run, report_export, and audit_event.

### 4.2 Build a new report
1. Click + New Report.
2. Choose report type.
3. Select scope: single aircraft, fleet, owner, mechanic, date range, work order, invoice group, compliance group, or signed records.
4. Select included sections.
5. Choose output format: PDF, Excel, CSV, email, text/share link, owner portal publication.
6. Preview.
7. Export or save as template.
8. Store generated report metadata and immutable audit event.

### 4.3 Aircraft Full History Package
1. Select report type: Aircraft Full History Package.
2. Select aircraft.
3. Choose sections: aircraft profile, squawks, work orders, estimates, invoices/payments, logbook, AD/SB, documents, attachments.
4. Choose owner-safe or internal mode.
5. Preview package.
6. Export PDF, email owner, print, or share link.
7. Store export hash and recipients.

### 4.4 Owner-facing report export
1. Select owner-safe toggle.
2. System hides internal-only content.
3. User previews exactly what the owner will see.
4. User sends by email, text link, PDF, or portal.
5. Owner view/open/download events become audit events.

### 4.5 Scheduled report
1. Select report template.
2. Set recurrence: daily, weekly, monthly, quarterly, custom.
3. Set recipients.
4. Select output format and owner-safe setting.
5. Enable schedule.
6. Each run stores report_run, report_export, and audit_event.

## 5. UI Requirements

### 5.1 Reports Dashboard
The dashboard is the reporting command center.

Required widgets:
- Saved reports.
- Scheduled reports.
- Operational widgets.
- Financial widgets.
- Compliance widgets.
- Search bar for report names, aircraft, owner, work order, invoice, AD/SB, and logbook keywords.
- Quick actions: + New Report, Schedule, Export, Saved Views.

Required report rows:
- Report name.
- Category.
- Scope.
- Last run.
- Action.
- Status/warning indicator.

### 5.2 Report Builder
Required controls:
- Report type.
- Scope.
- Aircraft/owner/mechanic/work order selector as applicable.
- Date range.
- Included sections.
- Owner-safe toggle.
- Output format.
- Preview.
- Save template.
- Schedule.
- Export.

The builder must not require users to hunt through individual modules to create basic reports.

### 5.3 Aircraft Full History Report Preview
Must show:
- Aircraft summary.
- Owner/customer.
- Total time/tach/Hobbs if available.
- Open squawks.
- Active work orders.
- Estimates and approvals.
- Invoices and payments.
- Logbook entries.
- AD/SB status.
- Attachments.
- Export/Email/Print/Share actions.

### 5.4 Operational Reports
Required report types:
- Work Order Aging.
- Task Assignment.
- Checklist Completion.
- Squawk Status.
- Mechanic Labor.
- Parts Usage.
- Owner Communication.
- Daily Shop Snapshot.
- Ready for IA Review.
- Ready to Invoice.
- Blocked Work Orders.
- Waiting on Parts.
- Waiting on Customer Approval.

### 5.5 Financial Reports
Required report types:
- Unpaid invoices.
- Deposits collected.
- Deposits pending verification.
- Estimate conversion.
- Work order actual vs estimate.
- Payment methods.
- Revenue by aircraft.
- Revenue by owner/customer.
- Parts margin.
- Tax/fees summary.
- Payment aging.
- Manual payment audit.

### 5.6 Compliance, Logbook, and Audit Reports
Required report types:
- AD/SB compliance report.
- Logbook entry register.
- Signature certificate log.
- Maintenance record package.
- Revision history.
- Paper import/OCR audit.
- Owner approval audit.
- Export history.
- Inspection due/done report.
- Component logbook report.
- Signed record hash verification report.

### 5.7 Global Search
Global Search must find:
- Aircraft by tail, make/model, serial, owner.
- Squawks by description, severity, source, media metadata.
- Work orders by number, task, checklist, line item, mechanic, owner.
- Estimates by ID, aircraft, owner, squawk, approval, deposit.
- Invoices/payments by ID, aircraft, owner, payment reference, balance.
- Logbook entries by aircraft, signer, certificate, entry type, AD/SB, source work order.
- Documents/attachments by filename, OCR text, tag, source entity.
- Audit events by actor, target, action, timestamp.

Search results must link to the owning record, not to a disconnected report copy.

## 6. Owner-Safe Export Rules

Owner-safe reports must hide by default:
- Internal mechanic chat.
- Internal notes.
- Draft AI summaries.
- Draft logbook entries.
- Staff-only audit details.
- Cost/margin and vendor cost.
- Diagnostic uncertainty not approved for customer-facing release.
- Private staff names if shop settings require role-only display.

Owner-safe reports may include:
- Aircraft identity.
- Customer-facing work summary.
- Approved estimate/invoice/payment data.
- Owner-approved photos/documents.
- Final signed logbook entries.
- Final invoices and receipts.
- Customer-facing status updates.
- Published attachments.

## 7. FAA-Aligned Reporting Requirements

Reports must support retrieval and packaging of maintenance records, but reports do not replace the legal maintenance record or signed logbook entry.

### 7.1 Maintenance record fields
For non-inspection maintenance records, the system must preserve report access to fields required by 14 CFR 43.9:
- Description of work or reference to acceptable data.
- Date completed.
- Name of person performing the work if different from the approver.
- Signature, certificate number, and kind of certificate of the person approving the work for return to service.

### 7.2 Inspection record fields
For inspection records, the system must preserve report access to fields required by 14 CFR 43.11:
- Type of inspection and extent.
- Date and aircraft total time in service.
- Signature, certificate number, and certificate type of the approving/disapproving person.
- Airworthy or disapproval/discrepancy language where applicable.
- Inspection program language where applicable.

### 7.3 Owner/operator retention and current status
Reports must help the shop/owner retrieve records needed for owner/operator maintenance-record obligations under 14 CFR 91.417, including maintenance/alteration/inspection records, current status of life-limited parts, AD status, time since overhaul, current inspection status, and major alteration/repair information where applicable.

### 7.4 AC 43-9D alignment
AC 43-9D states that maintenance records may be kept in any format that provides record continuity, includes required content, lends itself to new entries, provides for signature entry, and is intelligible. Reports should therefore preserve continuity, source links, signatures, hashes, revision history, and intelligible exports.

### 7.5 Electronic reports and certificate packages
When reports include signed logbook entries or signature certificates:
- Include the final signed record.
- Include the signature certificate/audit information where owner-safe and appropriate.
- Include source work order/logbook references.
- Include revision number and record hash.
- Do not promise browser MAC address capture. Use IP address, browser/device metadata, signer identity, MFA/reauthentication event, hashes, and immutable audit trail.

## 8. Data Model Requirements

### 8.1 report_template
- id
- name
- description
- category
- default_scope
- default_filters_json
- default_sections_json
- owner_safe_default
- output_formats_allowed
- created_by
- created_at
- updated_at
- permissions_json

### 8.2 report_run
- id
- report_template_id nullable
- report_type
- generated_by
- scope_type
- scope_id nullable
- filters_json
- sections_json
- owner_safe
- started_at
- completed_at
- status
- warnings_json
- row_count
- source_snapshot_json

### 8.3 report_export
- id
- report_run_id
- format
- file_uri
- file_hash
- file_size
- recipients_json
- share_url
- share_expires_at
- owner_visible
- created_by
- created_at
- audit_event_id

### 8.4 scheduled_report
- id
- report_template_id
- schedule_rule
- timezone
- recipients_json
- owner_safe
- output_format
- enabled
- last_run_at
- next_run_at
- last_status
- created_by

### 8.5 saved_view
- id
- module
- name
- user_id
- filters_json
- columns_json
- sort_json
- is_shared

### 8.6 search_index_entry
- id
- entity_type
- entity_id
- aircraft_id nullable
- owner_id nullable
- work_order_id nullable
- searchable_text
- tags_json
- attachment_metadata_json
- permissions_json
- updated_at

## 9. Permissions Matrix

| Role | Operational | Financial | Compliance | Audit | Owner-Safe Export | Schedule |
|---|---:|---:|---:|---:|---:|---:|
| Owner/Admin | Full | Full | Full | Full | Yes | Yes |
| Lead Mechanic | Full | Limited | Full | Partial | Yes | Limited |
| IA | Compliance | No | Full | Signature logs | Yes | No |
| Mechanic | Own tasks | No | Assigned only | Own actions | No | No |
| Billing/Admin | WO billing | Full | No | Payment audit | Yes | Yes |
| Customer/Owner | Portal only | Own invoices | Final records | No | Received only | No |

## 10. Audit Requirements

Every important create, edit, route, approval, signature, payment, export, share, schedule, and report-run action must create an immutable audit event.

Minimum audit event fields:
- audit_event_id
- actor_user_id
- actor_role
- target_entity_type
- target_entity_id
- action
- timestamp
- source_context
- linked_aircraft_id where applicable
- request_ip
- device/browser metadata
- filters_json for report runs
- output_hash for exports
- recipients/share metadata for external delivery

## 11. Acceptance Criteria

1. Reports dashboard displays saved, scheduled, operational, financial, compliance, and audit reports.
2. Report Builder supports major modules and aircraft-specific packages.
3. Owner-safe exports hide internal data by default.
4. Export audit exists for every export/share/email/print/download event.
5. Scheduled reports are supported with recurrence, recipients, last run, next run, and failure status.
6. Global Search searches major records and links to owning modules.
7. Aircraft Full History Package can include aircraft, squawks, estimates, work orders, invoices, payments, logbook, AD/SB, documents, and attachments.
8. Compliance reports preserve FAA-required fields by linking back to signed logbook/work-order records.
9. Financial reports use invoice/payment source records, not estimate-only assumptions.
10. Reports can be extended later for parts, compliance, inspections, and inventory without redesign.

## 12. QA Scenarios

### Scenario A - Owner-safe aircraft package
- User selects Aircraft Full History Package.
- Enables Owner-safe.
- Internal chat, internal notes, draft AI text, margin/cost data are hidden.
- Final invoices, receipts, published attachments, and signed logbook entries remain visible.

### Scenario B - Work order actual vs estimate
- Estimate shows 12 labor hours planned.
- Work order actual shows 14.2 approved hours.
- Report displays variance and links to work order actuals.
- Invoice report uses approved actuals, not original estimate.

### Scenario C - Signed logbook export
- User exports Logbook Entry Register.
- Report includes signer, certificate number/type, signature certificate metadata, revision, and hash.
- Report links to final signed entry.
- Draft entries appear only if internal mode is selected.

### Scenario D - Scheduled unpaid invoice report
- Admin creates weekly unpaid invoice report.
- System emails PDF/CSV every Monday.
- Each run stores report_run, report_export, and audit_event.

### Scenario E - Global search
- User searches "valve cover gasket".
- Results include squawk, estimate line, work order part, invoice line, logbook text, and attachment metadata.
- Each result opens the owning module.

## 13. Codex Implementation Instructions

- Implement Reports as a package/export layer over source modules.
- Never store copied editable facts in reports.
- Use service functions that query source entities and return report DTOs.
- Store report runs and exports as immutable snapshots with hashes.
- Build owner-safe filtering as a required transform, not an optional UI-only hide.
- Implement Global Search with permission-aware indexing.
- Build extension points for future Parts, Inventory, Compliance, and Inspections reports.
- Treat schedule execution as idempotent: reruns produce new report_run records.
- Implement export audit logging before exposing files externally.

## 14. Future Expansion Backlog

The Reports module is expected to be revisited as additional UI sections are finalized. Additive future reports should include:
- Parts inventory valuation.
- Parts consumption by aircraft/work order.
- Purchase order and vendor reports.
- Inspection due/overdue dashboards.
- AD/SB recurring compliance status.
- Mechanic utilization and certification reports.
- Customer lifetime value and payment aging.
- Document completeness reports.
- Offline capture sync audit.
- FAA package builder for specific inspection or maintenance events.
