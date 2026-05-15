---
sop_id: "SOP-03"
title: "Squawks / Discrepancy Intake"
module: "squawks"
version: "1.0.0"
status: "active"
last_updated: "2026-05-14"
faa_refs: ["14 CFR 43.9", "14 CFR 43.11"]
source_file: "mark downs/manuals/3. squawk/myaircraft_squawks_sop_codex.md"
---

# myaircraft.us Squawks / Discrepancy Intake System - Universal SOP and Codex Specification

Version: 1.0  
Prepared for: myaircraft.us  
Scope: Squawk dashboard, AI-first squawk capture, evidence, routing, owner visibility, work-order/estimate linkage, resolution, audit, mobile/iPad behavior, and reporting.

---

## 1. Executive Summary

The Squawks module is the discrepancy intake and routing system for myaircraft.us. A squawk is not a loose note and it is not a simple text field. It is a structured discrepancy record that begins with an aircraft condition, complaint, inspection finding, owner report, mechanic observation, checklist failure, uploaded document, or AI intake. It then moves through verification, evidence capture, routing, work execution, estimate approval, owner communication, and final resolution.

The squawk module must be AI-first and aircraft-first. If a squawk is created from an aircraft page, aircraft, owner context, logged-in reporter, location, date/time, open work orders, open estimates, and existing squawks are pre-filled. The mechanic should start by dictating the issue, adding photos or video, attaching files, and letting AI draft the structured squawk. Manual entry remains available, but it must not be the default hangar workflow.

Core operating rule: **A squawk starts as a discrepancy, then becomes resolved work, deferred work, customer-approved work, or closed/no-action. It should never be lost.**

---

## 2. Source-of-Truth Doctrine

### 2.1 What the squawk owns

The squawk owns the initial discrepancy and its traceability. It must store:

- Squawk ID.
- Aircraft ID.
- Reporter / created-by user.
- Source channel.
- Date/time.
- Location/shop/hangar if available.
- Title.
- Category.
- Severity.
- Description.
- AI draft version.
- Human verification state.
- Evidence attachments.
- Owner visibility flag.
- Routing decision.
- Linked work order / estimate / task / checklist item / invoice / logbook entry if created.
- Resolution reason.
- Immutable activity/audit events.

### 2.2 What the squawk does not own

The squawk does not own the completed maintenance record. Once routed:

- Work order owns actual work execution, labor, parts, tasks, checklists, and corrective actions.
- Estimate owns planned commercial scope, owner approval, deposit request, and quote line items.
- Invoice owns final billing, payment records, deposit credits, receipts, and balance.
- Logbook entry owns final FAA-style maintenance/inspection record language and signature.
- Aircraft master record owns permanent aircraft-specific history and timeline projection.

### 2.3 Non-copy rule

Never copy squawk text into downstream records without preserving the originating `squawk_id`. Downstream work orders, estimates, tasks, checklist items, owner approvals, activity records, and reports must retain source links.

---

## 3. UI Architecture

### 3.1 Squawks global dashboard

The left menu item **Squawks** opens the global squawk dashboard. This is the operational queue across the shop.

Required UI elements:

- Search bar for squawk ID, tail number, owner, category, description, source text, and attachment metadata.
- Filters:
  - All aircraft.
  - My assigned aircraft.
  - Open.
  - High priority.
  - Linked to work order.
  - Awaiting estimate / owner approval.
  - Deferred.
  - Closed.
  - Created from AI/paper intake.
- Status counters:
  - Open squawks.
  - High priority.
  - Linked to work order.
  - Awaiting approval.
  - Deferred.
  - Closed this month.
  - AI/paper review.
- Table/list rows:
  - Squawk ID.
  - Aircraft tail.
  - Summary/title.
  - Severity.
  - Status.
  - Next action.
  - Source.
  - Created date.

### 3.2 Aircraft-specific squawks tab

When opened under an aircraft master record, the Squawks tab must be aircraft-filtered automatically.

Rules:

- Aircraft is locked.
- New squawk creation pre-fills aircraft and owner context.
- Existing squawks display as aircraft-specific queue.
- Linked work orders, estimates, logbook entries, and invoices appear in the row/detail view.

### 3.3 Squawk detail page

Clicking any squawk opens the detail page.

Required sections:

- Header:
  - Squawk ID.
  - Status.
  - Severity.
  - Owner visibility.
  - Aircraft.
  - Created by.
  - Source.
- Description:
  - AI-generated or human-entered title.
  - Current verified description.
  - Original transcript if dictation was used.
- Evidence:
  - Photos.
  - Videos.
  - Voice notes/transcripts.
  - Uploaded files.
  - Paper/OCR source if imported.
- Linked records:
  - Work order.
  - Estimate.
  - Task.
  - Checklist item.
  - Owner approval.
  - Logbook entry if later referenced.
- Decision actions:
  - Edit.
  - Add to existing work order.
  - Create estimate.
  - Create work order.
  - Ask owner approval.
  - Defer.
  - Close / duplicate / not reproducible.

---

## 4. AI-First Squawk Creation

### 4.1 Default creation behavior

The default squawk creation screen must prioritize capture over form filling.

When the user clicks **Add Squawk**:

1. Auto context appears.
2. Dictation panel appears as the primary input.
3. Evidence buttons are prominent.
4. AI draft preview is generated.
5. Mechanic verifies and saves.

### 4.2 Auto context

If created from aircraft:

- Aircraft is pre-filled and locked.
- Owner/customer context is known.
- Reporter/created-by is the logged-in user.
- Date/time is automatic.
- Location/hangar is pulled from aircraft/shop context.
- Open work orders are available.
- Open estimates are available.
- Existing squawks are available for duplicate detection.

If created from global Squawks:

- User must select aircraft before official save.
- If aircraft does not exist, the aircraft creation/tail lookup path is launched.
- Draft may exist temporarily without aircraft, but official squawk cannot.

### 4.3 Capture evidence

Supported evidence types:

- Voice dictation.
- Photo.
- Video.
- File upload.
- PDF/Word document.
- Paper squawk sheet scan.
- Owner-submitted message/photo.
- Checklist failure.
- AI intake from uploaded document.

Every evidence object must store:

- Attachment ID.
- Squawk ID.
- Uploaded by.
- Timestamp.
- File type.
- Internal-only or owner-visible flag.
- Source metadata.
- OCR/transcript if applicable.

### 4.4 AI draft behavior

AI should generate:

- Suggested title.
- Suggested description.
- Suggested category.
- Suggested severity.
- Suggested duplicate matches.
- Suggested next step.
- Possible owner-facing summary.
- Confidence score.
- Warnings when evidence is insufficient.

AI must not finalize the squawk without human verification.

### 4.5 Human verification

Before official save, the mechanic/lead verifies:

- Aircraft.
- Severity.
- Category.
- Owner visibility.
- Description.
- Evidence.
- Suggested routing.

The official save stores:

- AI draft version.
- Human verifier.
- Verified timestamp.
- Original transcript and evidence.
- Activity event.

---

## 5. Squawk Lifecycle

Statuses:

- Draft.
- Open.
- Needs Review.
- High Priority.
- Routed to Estimate.
- Awaiting Owner Approval.
- Added to Work Order.
- In Progress.
- Waiting for Parts.
- Deferred.
- Resolved.
- Closed - Duplicate.
- Closed - Not Reproducible.
- Closed - Owner Declined.
- Archived.

Required closure reasons:

- Resolved by work order.
- Deferred with approved reason.
- Duplicate of another squawk.
- Not reproducible after inspection.
- Owner declined work.
- Entered in error.
- No maintenance action required.

A closure event must include:

- User.
- Timestamp.
- Reason.
- Linked work order/estimate if applicable.
- Notes.
- Attachments if relevant.
- Audit event ID.

---

## 6. Routing Rules

### 6.1 Add to existing work order

Use when aircraft has an active work order and the discrepancy should be handled under that work scope.

System behavior:

- Link `squawk_id` to `work_order_id`.
- Create task or checklist item if user chooses.
- Add evidence to work-order attachments.
- Add activity event.
- Preserve original squawk record.

### 6.2 Create estimate

Use when owner approval, deposit, or commercial quote is required first.

System behavior:

- Link estimate to squawk.
- AI can convert squawk description into estimate scope.
- AI can propose labor/parts lines.
- Owner-facing text must be sanitized.
- Approval audit is stored in estimate and linked back to squawk.

### 6.3 Create work order

Use when work is authorized and no estimate approval is required.

System behavior:

- Create work order with aircraft context.
- Add squawk as linked child record.
- Convert to task/checklist item if selected.
- Preserve status history.

### 6.4 Ask owner approval

Use when the shop wants authorization before estimate/work-order routing.

Owner approval request must include:

- Sanitized squawk summary.
- Optional photo(s) marked owner-visible.
- Requested authorization.
- Scope/amount if known.
- Approval or decline buttons.
- Audit capture: owner identity, timestamp, IP/device metadata, approved scope and amount if applicable.

### 6.5 Defer

Use when the item is safe to track for later or outside current scope.

Deferral requires:

- Reason.
- Deferred until date/condition.
- Authorized role.
- Safety note.
- Owner visibility decision.
- Follow-up reminder.

### 6.6 Close / duplicate / not reproducible

Closing requires a reason and cannot silently delete the squawk.

Rules:

- Duplicate must link to master squawk.
- Not reproducible must record inspection attempt.
- Owner declined must link owner decision.
- Entered in error must preserve audit trail.

---

## 7. Owner Visibility

Owner visibility is explicit and permissioned.

Squawk fields that can be owner-visible:

- Sanitized title.
- Sanitized description.
- Selected photos/files.
- Status summary.
- Estimate/approval request.
- Work order progress if enabled.
- Completion note.

Owner must not see by default:

- Internal mechanic notes.
- Internal chat.
- Draft AI output.
- Technician uncertainty phrased internally.
- Vendor cost.
- Staff-only audit details.
- Unapproved diagnostic speculation.

---

## 8. Activity, Notes, and Audit

Every significant squawk event creates activity:

- Squawk created.
- AI draft generated.
- Human verified.
- Evidence attached.
- Severity changed.
- Owner visibility changed.
- Routed to estimate.
- Routed to work order.
- Deferred.
- Closed.
- Reopened.
- Owner approval requested.
- Owner approved/declined.

Activity is immutable. Corrections create new entries.

---

## 9. Mobile and iPad Requirements

Mobile must open directly to:

1. Dictate.
2. Photo/video.
3. Review AI draft.
4. Create / route.

Mobile must not present a dense desktop form first.

Required mobile capabilities:

- One-hand capture.
- Large tap targets.
- Offline draft cache.
- Photo/video compression.
- Voice transcription.
- Evidence upload retry.
- Conflict handling when reconnecting.
- Quick route to active work order.

---

## 10. Data Model Requirements

Primary entities:

- `squawk`.
- `squawk_evidence`.
- `squawk_ai_draft`.
- `squawk_route`.
- `squawk_status_history`.
- `squawk_owner_visibility`.
- `squawk_resolution`.
- `audit_event`.

Required `squawk` fields:

- `id`.
- `aircraft_id`.
- `created_by_user_id`.
- `reported_by_user_id`.
- `source_type`.
- `title`.
- `description`.
- `category`.
- `severity`.
- `status`.
- `owner_visible`.
- `current_route_type`.
- `linked_work_order_id`.
- `linked_estimate_id`.
- `linked_task_id`.
- `linked_checklist_item_id`.
- `created_at`.
- `updated_at`.
- `verified_by_user_id`.
- `verified_at`.

---

## 11. Permissions

Roles:

- Apprentice.
- Mechanic.
- A&P.
- IA.
- Lead mechanic.
- Parts manager.
- Admin/billing.
- Owner/customer.
- Shop owner/platform admin.

Permission expectations:

- Apprentice may create draft squawk, add evidence, and complete assigned capture if allowed.
- Mechanic/A&P may create and verify squawks, attach evidence, and route to work order if authorized.
- IA may review compliance-sensitive squawks and AD/SB-related discrepancies.
- Lead may change severity, owner visibility, route, defer, close, and reopen.
- Admin may view billing-related squawks and create estimate/invoice links where authorized.
- Owner may submit squawks through owner portal and view only owner-visible squawk data.

---

## 12. FAA and Recordkeeping Alignment

This squawk SOP is a product and workflow specification, not legal advice. Squawks are discrepancy intake records. They are not automatically maintenance record entries. When a squawk results in maintenance, inspection, repair, alteration, or return-to-service action, the downstream work order and logbook workflows must support the required maintenance and inspection record fields.

Implementation must support the FAA-style recordkeeping chain:

- Squawk captures discrepancy.
- Work order captures actual work performed.
- Checklist captures inspection/task results.
- Line items capture labor/parts used.
- Logbook captures final maintenance or inspection record wording and signer information.
- Audit captures source and revision history.

Regulatory anchors to support in downstream workflows:

- 14 CFR 43.9 maintenance record entries.
- 14 CFR 43.11 inspection record entries.
- FAA AC 120-78B for electronic signatures/electronic recordkeeping guidance.
- FAA AC 43-9D for maintenance recordkeeping guidance.

---

## 13. Acceptance Criteria

1. Squawks module opens global queue.
2. Aircraft squawk tab opens aircraft-filtered queue.
3. Add Squawk from aircraft pre-fills aircraft, owner context, reporter, location, and date/time.
4. Add Squawk from global module requires aircraft before official save.
5. Default creation mode is dictation/evidence-first.
6. AI drafts title, category, severity, description, next step, confidence, and duplicate warning.
7. Human verification is required before official save.
8. Evidence supports photo, video, voice, file, paper/OCR, and owner-submitted media.
9. Existing squawk detail shows status, evidence, owner visibility, linked records, and history.
10. Edit squawk requires reason and stores version/activity.
11. Squawk can route to work order, estimate, new work order, owner approval, deferral, or closure.
12. Closure requires reason.
13. No squawk can be deleted without audit-preserving action.
14. Owner visibility is explicit and sanitized.
15. Mobile flow opens to dictate/photo, not dense form.
16. Offline mobile drafts are supported.
17. Aircraft timeline updates when squawk is created, routed, deferred, or closed.
18. Reports can show aging, high priority, unresolved, deferred, owner approval pending, and route status.

---

## 14. Codex Implementation Guidance

Build this module as a source-linked discrepancy system. Do not implement squawks as plain text notes.

Prioritize these implementation pieces:

1. Data model with aircraft-required official save rule.
2. Evidence upload and transcript storage.
3. AI draft endpoint and human verification state.
4. Routing engine to estimate/work order/approval/defer/close.
5. Activity/audit events for all state changes.
6. Owner-visible projection separate from internal squawk record.
7. Aircraft timeline integration.
8. Mobile one-hand capture and offline draft sync.

Core routes:

- `/squawks` global queue.
- `/aircraft/:aircraftId/squawks` aircraft-specific queue.
- `/squawks/new` global create.
- `/aircraft/:aircraftId/squawks/new` aircraft-context create.
- `/squawks/:squawkId` detail.
- `/squawks/:squawkId/edit` edit.
- `/squawks/:squawkId/route` route.
- `/squawks/:squawkId/evidence` evidence upload.

State machine must enforce allowed transitions.

---

## 15. QA Test Scenarios

- Create from aircraft with dictation and photo.
- Create from global module and require aircraft before official save.
- AI detects likely duplicate.
- AI suggests high severity from dictation and photo.
- Mechanic edits AI draft and saves.
- Owner visibility remains internal by default.
- Lead shares sanitized owner update.
- Route to existing work order and create task.
- Route to estimate and create line item.
- Defer with required reason and date.
- Close duplicate with link to master squawk.
- Reopen closed squawk with reason.
- Upload evidence while offline and sync later.
- Confirm aircraft timeline receives events.
- Confirm report counts update.

---

## 16. Sources

- eCFR 14 CFR 43.9: https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-43/section-43.9
- eCFR 14 CFR 43.11: https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-43/section-43.11
- FAA AC 120-78B: https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_120-78B_FAA_Web.pdf
- FAA AC 43-9D: https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_43-9D.pdf
