---
sop_id: "SOP-02"
title: "Aircraft Master Workspace"
module: "aircraft"
version: "1.0.0"
status: "active"
last_updated: "2026-05-14"
faa_refs: ["14 CFR 43.9", "14 CFR 91.417"]
source_file: "mark downs/manuals/2. aircraft master /final new one /myaircraft_aircraft_workspace_ui_sop_codex.md"
---

# myaircraft.us Aircraft Workspace UI SOP and Implementation Manual

**Version:** 2.0 Final UI Direction  
**Module:** Aircraft Workspace, Aircraft Onboarding, Due List, Time Tracking, Compliance, Work Orders, Estimates, Parts, Reports  
**Primary design decision:** The Aircraft page becomes a selected-aircraft workspace. The user starts from the aircraft list, selects one aircraft, and lands inside a complete aircraft-specific command center.  
**Source-of-truth rule:** Aircraft identity, aircraft time, ATA/JASC taxonomy, due items, work orders, estimates, parts, squawks, logbooks, documents, and compliance must be linked by `aircraft_id`. The aircraft workspace displays linked records; it must not create duplicate truth.

---

## 1. Executive Decision

The approved UI direction is simple: onboard by N-number, generate a clean aircraft placeholder image, then let the owner or mechanic replace the image later.

Do not require aircraft photo upload during onboarding. That adds friction and creates licensing problems if images are scraped from third-party listing sites. Use a generated silhouette based on aircraft type and overlay the N-number. Later, the user can select **Actions > Manage Photo** to upload a real aircraft photo.

The product should prioritize:

1. fast aircraft creation,
2. accurate aircraft identity,
3. reliable aircraft time tracking,
4. due-list generation,
5. work-order/estimate linkage,
6. compliance visibility,
7. AI-assisted maintenance planning.

A pretty aircraft photo is useful, but it is not operationally critical.

---

## 2. Regulatory and Data Reference Notes

This product should support maintenance workflow discipline, but it must not claim to replace FAA-required professional judgment, mechanic signoff, or owner/operator responsibility.

Important reference points:

- FAA Registry data is suitable for aircraft identity lookup: N-number, make/model, serial number, engine reference, registration fields, and related public registry data. FAA Registry data is not a maintenance configuration database and does not provide aircraft photos.
- FAA JASC is the preferred public FAA-style maintenance classification reference. JASC is a modified ATA-style four-digit system/component table.
- Maintenance record workflows should support the information patterns required by 14 CFR Part 43 maintenance/inspection entries and 14 CFR 91.417 maintenance records, where applicable.
- ADS-B-derived time must be treated as an estimate. It must not overwrite mechanic-verified tach, Hobbs, total time, cycle, or logbook values.

Implementation principle: **make compliance easier to document; do not automatically certify compliance.**

---

## 3. Aircraft Workspace Concept

The Aircraft Workspace is the operational home for one aircraft.

It displays:

- identity,
- silhouette/photo,
- owner/payee/operator,
- verified and estimated time,
- due list,
- AI maintenance outlook,
- work orders,
- squawks,
- estimates,
- invoices,
- logbook entries,
- documents,
- compliance,
- timeline,
- reports.

Global modules still exist. The Aircraft Workspace is a filtered, aircraft-specific command center.

### 3.1 Approved Navigation Pattern

1. User clicks **Aircraft** from the left navigation.
2. User sees the aircraft fleet list.
3. User selects an aircraft row/card.
4. UI opens that aircraft's workspace.
5. Top-left **Back to Aircraft** returns to the fleet list.
6. Aircraft tabs remain inside the selected aircraft context.
7. The **Actions** button creates records already linked to this aircraft.

Do not make users jump to separate global pages to understand one aircraft.

---

## 4. Screen Inventory

The final aircraft UI should include these screens:

1. Aircraft Fleet List
2. Add Aircraft - Find Aircraft
3. Add Aircraft - Owner / Payee
4. Add Aircraft - Aircraft Details
5. Add Aircraft - Time & Integrations
6. Add Aircraft - AI Due List Setup
7. Aircraft Detail - Overview
8. Aircraft Detail - Actions Menu
9. Aircraft Detail - Due List
10. Aircraft Detail - Work Orders
11. Aircraft Detail - Squawks
12. Aircraft Detail - Estimates
13. Aircraft Detail - Invoices
14. Aircraft Detail - Logbook
15. Aircraft Detail - Documents
16. Aircraft Detail - Compliance
17. Aircraft Detail - Timeline
18. Aircraft Time Source & Integration Management
19. Owner-facing Aircraft View
20. Reports and AI Assistant panels

---

## 5. Aircraft Fleet List

Purpose: help mechanics, shops, owners, and admins find an aircraft quickly and understand status before entering the workspace.

Required elements:

- left app navigation,
- page title: Aircraft,
- search by N-number, make/model, serial number, owner, payee, base,
- filter button,
- add aircraft button,
- aircraft card/list row,
- silhouette or photo,
- tail number,
- make/model,
- serial number,
- verified tach,
- estimated tach where available,
- Hobbs if tracked,
- status,
- owner/payee,
- base airport,
- operation profile,
- due state indicator.

Clicking a row opens the aircraft detail workspace.

![Aircraft Fleet List](assets/01_aircraft_fleet_list.png)

---

## 6. Aircraft Onboarding Flow

### 6.1 Step 1 - Find Aircraft

The first screen asks for N-number.

Fields/actions:

- Tail number / N-number input.
- Lookup button.
- Help text: "We search the FAA Registry and prefill aircraft details. You can verify and edit before saving."
- Loading state.
- Not found state.
- Duplicate aircraft state if the N-number already exists.

Expected lookup results:

- N-number,
- manufacturer,
- model,
- serial number,
- year if available,
- aircraft category/class when available,
- engine reference if available,
- registered owner where available,
- registration status where available.

System must generate a placeholder silhouette from aircraft type and overlay the N-number. Do not require a real image.

### 6.2 Step 2 - Owner / Payee

The registered owner and maintenance payer are separate concepts.

Fields:

- use registered owner as payer: yes/no,
- organization/person name,
- email,
- phone,
- address,
- billing contact,
- owner portal access toggle,
- role: owner, operator, aircraft manager, payer.

The customer/payee record should be reusable across aircraft.

### 6.3 Step 3 - Aircraft Details

Fields:

- make,
- model,
- serial number,
- year,
- category,
- class,
- engine type,
- engine count,
- propeller type,
- landing gear type,
- seats,
- base airport,
- registration date,
- operation type,
- primary use,
- flight school yes/no,
- Part 91 / Part 135 / Part 121 / Part 141 / custom operation.

User must be able to edit auto-filled values.

### 6.4 Step 4 - Time & Integrations

Aircraft time is critical and must be modeled carefully.

Fields:

- verified tach,
- verified Hobbs,
- total time,
- cycles,
- landings,
- engine time if needed,
- prop time if needed,
- verification date,
- verification source,
- source confidence,
- notes.

Integration options:

- manual updates,
- Airbly or aircraft tracking integration,
- scheduling software integration,
- ADS-B estimate fallback.

Critical rule: `verified_tach` and `estimated_tach` are separate. ADS-B must never overwrite verified values.

### 6.5 Step 5 - AI Due List Setup

AI generates a candidate due list based on:

- aircraft type,
- operation profile,
- known FAA/maintenance rules,
- user-selected operation type,
- manufacturer/service program inputs if provided,
- ATA/JASC taxonomy,
- current verified/estimated time,
- documents uploaded later,
- manually entered inspection history.

The system must display AI-generated due items as **suggested** until accepted by the mechanic/owner/admin.

Suggested item statuses:

- suggested,
- accepted,
- dismissed,
- needs more information,
- verified.

![Onboarding Flow](assets/04_onboarding_flow.png)

---

## 7. Aircraft Detail Overview

The overview is the first landing page after selecting an aircraft.

Top area:

- Back to Aircraft,
- aircraft silhouette/photo,
- N-number,
- make/model,
- serial number,
- base,
- owner/payee,
- operation type,
- status,
- edit button,
- actions button.

Tabs:

- Overview,
- Due List,
- Work Orders,
- Squawks,
- Logbook,
- Invoices,
- Documents,
- Compliance,
- Timeline.

Overview cards:

- Time & Utilization,
- Compliance Health,
- AI Insights,
- Upcoming Due,
- Active Work,
- Open Squawks,
- Recent Activity.

![Aircraft Detail Overview](assets/02_aircraft_detail_overview.png)

---

## 8. Aircraft Actions Menu

The **Actions** menu must be context-aware. It should always apply to the selected aircraft.

Required actions:

1. Update Aircraft Times
2. Create Due Item / Reminder
3. Generate AI Due List
4. Create Work Order
5. Create Estimate
6. Add Squawk
7. Create Invoice
8. Add Logbook Entry
9. Upload Documents
10. Manage Photo
11. Run Compliance Review
12. Share with Owner
13. Export Aircraft Record
14. Archive / Deactivate Aircraft, permission-gated

### 8.1 Action Behavior

**Update Aircraft Times** opens the time update modal and records a time ledger entry.

**Create Due Item / Reminder** creates manual reminders, inspections, recurring due items, or future to-do items.

**Generate AI Due List** calls the AI due-list generator using aircraft profile, operation profile, time, taxonomy, and known maintenance planning rules.

**Create Work Order** creates a work order prefilled with aircraft, payer, current time snapshot, and optional due items/squawks.

**Create Estimate** creates estimate lines from due items, squawks, inspections, parts, and labor.

**Add Squawk** opens discrepancy intake and AI suggests ATA/JASC, severity, and recommended next step.

**Upload Documents** accepts registration, airworthiness certificate, logbooks, insurance, AD/SB documents, inspection sheets, photos, invoices, and manuals.

**Manage Photo** allows upload/replacement of the generated silhouette.

**Run Compliance Review** creates a compliance review session and identifies missing/unknown records.

![Aircraft Actions Menu](assets/03_aircraft_actions_menu.png)

---

## 9. Due List Tab

The Due List is a calculation and planning engine, not just a notes list.

Required filters:

- All,
- Overdue,
- Due Soon,
- Upcoming,
- Complied,
- Deferred,
- Needs Review,
- AI Suggested,
- Manual,
- Regulation,
- Manufacturer,
- Owner Reminder,
- ATA/JASC system,
- confidence.

Columns:

- status,
- item,
- category,
- ATA/JASC,
- due by,
- remaining,
- source,
- AI confidence,
- verification state,
- linked work order.

Due item types:

- annual inspection,
- 100-hour inspection,
- progressive inspection task,
- oil change,
- ELT battery/inspection,
- transponder check,
- pitot-static check,
- altimeter check,
- VOR check if applicable,
- AD compliance,
- SB tracking,
- life-limited component,
- engine/propeller event,
- owner reminder,
- shop reminder,
- custom recurring task.

### 9.1 Due Item Lifecycle

`Suggested -> Accepted -> Upcoming -> Due Soon -> Due Now -> Work Order -> Completed -> Logbook/Compliance -> Next Due Generated`

or

`Suggested -> Dismissed`

or

`Due -> Deferred`

Each due item must support:

- source type,
- source reference,
- recurrence rule,
- time basis,
- calendar basis,
- cycles basis,
- operation basis,
- verification state,
- linked estimate line,
- linked work order task,
- linked logbook/compliance event.

![Due List Tab](assets/05_due_list_tab.png)

---

## 10. Work Orders Tab

The Work Orders tab lists aircraft-specific work orders only.

Required filters:

- All,
- Open,
- In Progress,
- On Hold,
- Completed,
- Waiting Owner Approval,
- Waiting Parts,
- High Priority.

Columns:

- work order number,
- status,
- title,
- priority,
- assigned to,
- due date,
- linked due items,
- linked squawks,
- estimate/invoice status.

Required actions:

- New Work Order,
- add selected due items to work order,
- add selected squawks to work order,
- create estimate from work order,
- close work order,
- create logbook entry,
- update aircraft times at closeout.

Every work order must have `aircraft_id`. Work order tasks should have optional ATA/JASC at the line level.

---

## 11. Squawks Tab

The Squawks tab captures discrepancies and operational issues.

Required columns:

- squawk ID,
- status,
- description,
- reported by,
- assigned to,
- date,
- severity,
- ATA/JASC,
- linked work order.

AI behavior:

- summarize long squawk text,
- suggest severity,
- suggest ATA/JASC,
- suggest whether it should become a work order,
- detect similar/repeat squawks.

Human confirmation is required before AI classification becomes final.

---

## 12. Estimates Tab

The Estimates tab lists aircraft-specific estimates and pending approvals.

Required columns:

- estimate number,
- status,
- title,
- total,
- sent date,
- approval status,
- linked due items,
- linked work order,
- payer.

Estimate lines should support ATA/JASC and should be groupable by aircraft system.

Customer-facing estimate grouping should use plain-language systems:

- Inspection,
- Engine,
- Oil System,
- Landing Gear / Brakes,
- Electrical,
- Avionics,
- Interior,
- Documents / Compliance.

---

## 13. Invoices Tab

The Invoices tab lists aircraft-specific invoices and payment status.

Required columns:

- invoice number,
- status,
- amount,
- balance,
- due date,
- linked work order,
- linked estimate,
- payer.

Recommended alerts:

- unpaid invoice,
- invoice blocking release/pickup,
- paid but logbook not signed,
- estimate approved but work order not opened.

---

## 14. Logbook Tab

The Logbook tab shows maintenance, inspection, and return-to-service records.

Required columns:

- date,
- type,
- title,
- tach/Hobbs/TT at entry,
- mechanic/IA,
- signature state,
- linked work order,
- linked compliance item,
- attachments.

AI behavior:

- draft logbook entry from completed work order tasks,
- summarize corrective actions,
- identify missing required fields,
- detect inconsistency between task completion and signoff.

Guardrail: AI-generated logbook text must be reviewed and signed by authorized personnel.

---

## 15. Documents Tab

Documents should be attached to the aircraft and optionally linked to due items, work orders, estimates, invoices, squawks, compliance, or logbook entries.

Document categories:

- registration,
- airworthiness certificate,
- insurance,
- weight and balance,
- equipment list,
- logbooks,
- inspection checklist,
- AD/SB documents,
- manuals,
- photos,
- invoices,
- owner approvals,
- miscellaneous.

AI behavior:

- OCR document,
- summarize document,
- suggest document type,
- link document to aircraft systems,
- extract possible due dates, tach values, and compliance references.

---

## 16. Compliance Tab

The Compliance tab should summarize:

- AD compliance,
- inspection compliance,
- due-list compliance,
- document completeness,
- time tracking confidence,
- unknown/missing records,
- upcoming regulatory or scheduled events.

Compliance items must have:

- source,
- reference,
- status,
- due basis,
- last complied date/time,
- next due date/time,
- document/logbook link,
- reviewer,
- verification state.

![Compliance and Predictive Maintenance](assets/07_compliance_predictive.png)

---

## 17. Timeline Tab

Timeline shows aircraft-linked events chronologically.

Events:

- aircraft created,
- time updated,
- due item created/accepted/complied/deferred,
- squawk created/closed,
- estimate sent/approved/declined,
- work order opened/closed,
- invoice sent/paid,
- logbook drafted/signed,
- document uploaded,
- compliance reviewed,
- photo changed,
- owner shared/portal access changed.

Filters:

- all,
- time,
- due list,
- squawks,
- work orders,
- estimates,
- invoices,
- logbook,
- documents,
- compliance,
- owner activity,
- AI events.

---

## 18. Aircraft Time Source Model

Aircraft time is the backbone of due-list accuracy.

The system must store time as a ledger, not just a single field.

Recommended records:

```text
aircraft_time_entries
- id
- aircraft_id
- time_type
- value
- source
- source_record_id
- recorded_at
- effective_at
- confidence
- method
- notes
- created_by
```

Recommended snapshot:

```text
aircraft_time_snapshot
- aircraft_id
- verified_tach
- verified_hobbs
- verified_total_time
- estimated_tach
- estimated_hobbs
- estimated_total_time
- cycles
- landings
- last_verified_at
- last_verified_source
- estimate_source
- confidence_score
- needs_verification
```

Source trust ranking:

1. mechanic/logbook/work-order closeout verification,
2. Airbly or onboard tracker,
3. scheduling software actual flight logs,
4. owner/operator manual update,
5. ADS-B estimate fallback.

![Time Sources and Integrations](assets/06_time_sources_integrations.png)

---

## 19. AI Usage Requirements

AI should be visible and useful, but not reckless.

AI should support:

- AI due-list generation,
- predictive due forecasting,
- natural-language search,
- maintenance recommendations,
- document/logbook summarization,
- work order summary,
- estimate scope drafting,
- cost estimate assistance,
- squawk classification,
- repeat defect detection,
- compliance review checklist generation.

AI outputs must carry:

- generated_by_ai flag,
- confidence,
- source/context used,
- user confirmation state,
- audit trail.

Never silently convert AI suggestions into official compliance facts.

---

## 20. Taxonomy Wiring Requirements

ATA/JASC taxonomy must be available to:

- due items,
- future to-do/reminder items,
- work order tasks,
- estimates and estimate lines,
- parts,
- squawks,
- logbook entries,
- documents,
- compliance records,
- reports,
- dashboard cards,
- AI classifiers.

The UI should show plain language first and codes second:

`Landing Gear / Wheels & Brakes - ATA 32 · JASC 3240`

Do not force owners to understand codes. Mechanics/admins should be able to see and edit them.

---

## 21. Data Model Summary

Core tables/objects:

```text
aircraft
customers
aircraft_contacts
aircraft_media
ata_chapters
jasc_codes
aircraft_time_entries
aircraft_time_snapshot
maintenance_requirements
aircraft_due_items
squawks
work_orders
work_order_tasks
estimates
estimate_lines
invoices
invoice_lines
parts
logbook_entries
documents
compliance_items
aircraft_timeline_events
ai_suggestions
audit_events
```

Aircraft media:

```text
aircraft_media
- id
- aircraft_id
- media_type
- storage_url
- external_source_url
- source_name
- source_license_status
- attribution_text
- is_primary
- uploaded_by
- created_at
```

For default silhouettes, use:

```text
source_name = generated_placeholder
source_license_status = internal
is_primary = true
```

---

## 22. Owner-Facing Behavior

Owners should see a simplified aircraft workspace.

Owner view should show:

- aircraft photo/silhouette,
- current verified/estimated time,
- due soon/overdue reminders,
- open squawks,
- estimates needing approval,
- invoices,
- documents shared with owner,
- maintenance timeline,
- manual time update option,
- integrations.

Owner should be able to:

- update time manually,
- connect Airbly/scheduling integration,
- upload photo,
- upload documents,
- approve estimate,
- report squawk,
- view due list,
- ask AI maintenance questions.

Owner should not be able to:

- sign mechanic logbook entries,
- mark regulatory compliance complete unless permissioned,
- alter shop work order closeout records.

---

## 23. Acceptance Criteria

The implementation is complete when:

1. User can add aircraft by N-number.
2. FAA lookup pre-fills aircraft identity.
3. User can verify/edit aircraft data.
4. System creates a generated silhouette with N-number.
5. Photo upload is optional and available later.
6. Owner/payee can be separate from registered owner.
7. Aircraft time supports verified and estimated values separately.
8. ADS-B fallback is labeled estimated and does not overwrite verified time.
9. AI can generate candidate due items.
10. Due items have source, confidence, status, recurrence, and verification state.
11. Due items can create estimates/work orders and update compliance/logbook status.
12. Work orders, estimates, invoices, squawks, logbooks, documents, parts, and reports are aircraft-linked.
13. ATA/JASC taxonomy is available everywhere maintenance classification is needed.
14. Actions menu creates records with aircraft context locked.
15. Dashboard shows time, due list, compliance, active work, squawks, AI insights, and recent activity.
16. Owner view is simpler than mechanic/admin view.
17. All AI-generated official-looking outputs require human confirmation.

---

## 24. Codex Implementation Prompt

Build/refactor the Aircraft Workspace UI and backend support according to this SOP. Use the attached assets and existing myaircraft.us codebase. Do not treat this as a cosmetic-only redesign. Implement it as an aircraft-centered operational workspace.

Core instructions:

1. Create or refactor the Aircraft module so the flow is: Aircraft list -> selected aircraft workspace -> aircraft tabs.
2. Add aircraft onboarding by N-number using FAA Registry lookup where already supported or through the existing lookup service.
3. Generate a default aircraft-type silhouette with the N-number instead of requiring photo upload.
4. Add Actions menu with all context-aware aircraft actions described in this SOP.
5. Add tabs: Overview, Due List, Work Orders, Squawks, Logbook, Invoices, Documents, Compliance, Timeline.
6. Wire each tab to aircraft-linked records using `aircraft_id`.
7. Add aircraft time ledger and snapshot support if not already present.
8. Keep verified time separate from estimated time.
9. Add integration placeholders/cards for manual updates, Airbly, scheduling software, and ADS-B fallback.
10. Add AI due-list generation UI and data states: suggested, accepted, dismissed, needs more information, verified.
11. Ensure due items can link to estimates, work orders, logbook entries, and compliance records.
12. Wire ATA/JASC taxonomy into due items, work orders, estimate lines, parts, squawks, logbook entries, documents, compliance, reports, and AI classification.
13. Add compliance and predictive maintenance dashboard cards.
14. Add owner-facing simplified aircraft view if user-role routing exists; otherwise create placeholders and TODOs.
15. Add audit events for time updates, AI accepted suggestions, due-item lifecycle changes, work-order closeout, and compliance changes.
16. Add tests for onboarding, actions menu, due-list lifecycle, time-source separation, and aircraft-linked record creation.

Do not hardcode sample aircraft beyond seed/demo data. Preserve existing records and use migrations. Keep UI clean, dense, and professional. Plain-language labels should appear before ATA/JASC codes. AI suggestions must never silently become official records.

---

## 25. Final Product Doctrine

The final product should feel simple to the user:

- enter N-number,
- verify aircraft,
- define payer,
- enter time,
- choose operation,
- let AI suggest due items,
- review and accept,
- run aircraft from one workspace.

The internal system should be rigorous:

- aircraft identity from registry,
- generated silhouette by type,
- owner/payee separation,
- verified vs estimated time,
- ATA/JASC taxonomy,
- due-item lifecycle,
- work-order/estimate/logbook/compliance traceability,
- AI assistance with human confirmation.
