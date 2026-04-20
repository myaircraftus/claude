# myaircraft.us — Unified Codex Implementation Spec

Use the attached Figma Make direction as the UI reference and preserve that visual/interaction style as closely as practical. Implement the following as the product/engineering source of truth. Prioritize aircraft-centered architecture, shared linked records, low-friction AI-assisted workflows, and elimination of redundant data entry.

---

# myaircraft.us — Aircraft-Centered Operating System
## Master Codex Implementation Brief

## Core instruction
Implement the product as an **aircraft-centered operating system**, not as disconnected modules.

The **Aircraft** is the root entity and primary container.
Everything hangs off the aircraft record.

That means the following must be children or contextually linked to an aircraft:
- aircraft profile
- operation type
- Hobbs
- Tach
- owner/operator info
- assigned users and permissions
- documents
- reminders
- squawks
- maintenance requests
- estimates
- work orders
- invoices
- logbook entries
- intelligence / reports
- activity history

Do not build separate disconnected areas that duplicate aircraft context unnecessarily.
Always prefer reusing aircraft context instead of asking users to re-enter information.

---

## Product architecture principles

### 1. Aircraft is the source of truth
Every estimate, work order, invoice, reminder, squawk, maintenance request, and logbook entry must always be traceable back to one aircraft.

### 2. Operation type drives system behavior
When the aircraft is onboarded, the selected operation type must drive:
- which document categories are expected
- which reminders are pre-generated
- which user roles are available/relevant
- which intelligence modules appear
- which maintenance/compliance dashboards are emphasized

### 3. Minimize redundancy
Avoid asking for the same data in multiple places when it already exists in aircraft context.

Examples:
- if aircraft already has owner data, do not ask again in estimate/work order/invoice unless override is needed
- if work order is created from estimate, copy and link, do not rebuild from scratch
- if invoice is created from work order, preload everything
- if logbook entry is created from work order, preload everything
- if aircraft operation type is already known, do not ask again elsewhere

### 4. AI must reduce friction, not add gimmicks
Wherever plain-English input can replace manual structured entry, use AI/LLM assistance.
However, AI outputs must always become editable structured records.

### 5. Shared context across roles
Owner view, mechanic view, lead mechanic view, and admin view should all reference the same aircraft/job data with role-based permissions and filtered visibility.

---

## Root entities

### Aircraft
Required fields:
- tail number
- make
- model
- serial number if available
- operation type (one or many)
- current Hobbs
- current Tach
- owner / operator assignment
- current status
- assignment roster
- created at / updated at

Derived/linked:
- FAA pulled data
- document requirements
- reminder templates
- intelligence modules
- squawks
- maintenance records
- billing records
- activity feed

### Operation type
Aircraft may support single or multiple operational contexts.

Support:
- Part 91
- Part 135
- Part 141
- Part 61
- flight school
- charter
- private owner
- lease / managed aircraft
- corporate operation
- maintenance-managed aircraft

Operation type affects:
- document schema
- reminder library
- assignment role presets
- intelligence / reports shown
- compliance emphasis

### Assignments
Aircraft-level assignments must support inviting and assigning users.

Possible roles:
- owner
- operator
- pilot
- instructor / CFI
- mechanic
- lead mechanic
- IA
- maintenance manager
- operations director
- FAA inspector
- insurance reviewer
- lender / auditor
- read-only reviewer
- invoicing/admin staff

Each role determines:
- document visibility
- reminder visibility
- squawk permissions
- maintenance permissions
- estimate/work order/invoice permissions
- approval permissions
- logbook entry permissions
- intelligence/report access

---

## Aircraft onboarding flow

## Goal
Aircraft onboarding must be intelligent and low-friction.

### Inputs
When aircraft is added:
- tail number
- operation type
- Hobbs
- Tach
- optional override owner/operator details if needed

### Behavior
- use tail number to pull available aircraft registry / FAA details
- ask operation type clearly
- after operation type selection, auto-configure:
  - document categories
  - reminder categories/templates
  - intelligence modules
  - suggested assignment roles

### AI/LLM role during onboarding
Use AI to:
- interpret ambiguous operation type descriptions
- map aircraft into correct reminder template sets
- map aircraft into correct document schema
- suggest role types that fit that operation
- reduce manual setup burden

### Important implementation rule
Only show relevant expected document groups and reminder groups for the selected operation types.
Do not overwhelm users with all possible aviation categories if not relevant.

---

## Aircraft main sections

Each aircraft should have clean top-level sections such as:
- Overview
- Documents
- Reminders
- Squawks
- Maintenance
- Intelligence
- Assignments
- Activity

The system should allow these sections to share context.
Do not rebuild separate mini-apps inside each one.

---

## Documents system

### Objective
Documents must adapt to aircraft type, operation type, and role permissions.

### Requirements
- auto-generate expected document structure based on operation type
- allow manual upload and scanner upload
- AI should classify uploaded documents into correct categories
- show completeness state
- show missing documents
- show operation-specific categories only
- logbook entries generated by mechanics should automatically file into correct aircraft document categories

### Behavior
If operation type changes or expands:
- intelligently update available document categories
- preserve previously uploaded documents
- do not delete prior categories blindly
- mark new required categories where appropriate

---

## Reminders system

### Objective
Build a full reminder engine linked to aircraft, operation type, and records.

### Reminder trigger types
Support:
- date based
- recurring date based
- Hobbs based
- Tach based
- recurring interval based
- manually defined
- AI plain-English created reminders

### Reminder categories
Include robust GA + operations categories, including:
- annual inspection
- 100-hour inspection
- 50-hour inspection
- ELT inspection / ELT battery
- pitot-static / transponder / altimeter
- registration renewal
- airworthiness-related dates
- oil changes
- AD compliance
- SB compliance / service intervals
- engine inspections / overhaul intervals
- propeller inspections / overhaul intervals
- avionics checks
- brakes / tires / battery / consumables
- IFR-related certification items
- operation-specific training / compliance items
- charter / school / operational reminders
- custom reminders

### Reminder dashboard
Must include:
- overdue reminders
- critical due soon reminders
- upcoming 7/30/90-day view
- hours remaining / days remaining
- graph / timeline / health summary
- category filters
- due type filters
- severity sorting
- add custom reminder
- AI reminder creation

### Reminder actions
Each reminder must support:
- view
- edit
- snooze
- mark complete
- request maintenance

### Important
A reminder can become a maintenance request.
That flow must be native, not bolted on.

---

## Squawks system

### Objective
Squawks must be aircraft-native, synchronized, and simple to create.

### Squawk sources
Allow squawks from:
- owner
- pilot
- instructor
- operator
- mechanic
- lead mechanic

### Squawk entry
Allow:
- plain-English text
- category
- severity
- grounded / not grounded flag
- photo upload
- video upload
- notes

### AI/LLM behavior
When user enters rough text, AI should:
- normalize title
- infer probable category
- infer severity suggestion
- structure the issue cleanly
- preserve original text in history

### Squawk views
Support:
- incoming squawks
- open squawks
- grounded squawks
- resolved squawks
- squawk history

### Multi-select flow
Users must be able to:
- select one or many squawks
- combine them
- request maintenance from selected squawks

This must create a maintenance request linked to the aircraft and chosen squawks.

---

## Maintenance commercial objects

The commercial/operational maintenance layer has four main mechanic-facing objects:
- Squawks
- Estimate
- Work Order
- Invoice
- Logbook Entry

But all must remain aircraft-linked.

### Estimate
- can exist independently
- may be created from squawks
- may be created manually
- may convert into work order
- has its own communication/history thread

### Work Order
- may come from approved estimate
- may be created manually
- is the main live execution workspace
- includes thread, status, approvals, labor, parts, checklist, AI summaries

### Invoice
- may be created directly
- may be created from estimate
- may be created from work order
- owner can pay invoice
- payment status must sync back to aircraft maintenance billing view

### Logbook Entry
- may be created from work order
- may be created manually
- must use logged mechanic identity / certificate info
- must auto-file into aircraft document structure
- must sync to owner aircraft records where applicable

---

## Mechanic portal structure

Mechanic workspace should stay aircraft-centered but provide shortcut lists.

Main mechanic sections:
- Aircraft
- Squawks
- Estimates
- Work Orders
- Invoices
- Logbook Entries
- Customers
- Team / Mechanics

Every object should still deeply link back to aircraft.

### Mechanic aircraft view
When mechanic opens an aircraft, show:
- aircraft summary
- open squawks
- active estimates
- active work orders
- invoice history
- logbook entries
- owner/customer details
- relevant documents
- reminders relevant to maintenance

---

## Owner-side maintenance visibility

Within aircraft, owner should see:
- reminders
- squawks
- maintenance requests
- estimates
- work orders
- invoice/payment area
- final logbook entries / completed records

Owner should be able to:
- submit squawks
- request maintenance from reminder or squawk
- choose/invite mechanic if needed
- approve estimates
- approve extra hours/parts/work
- view work progress
- pay invoices
- receive completed records

---

## Success criteria
This implementation is successful if:
- aircraft is clearly the primary object everywhere
- operation type intelligently adapts documents/reminders/intelligence/roles
- owners and mechanics work from the same aircraft context
- reminders and squawks naturally flow into maintenance
- estimates, work orders, invoices, and logbook entries are linked without duplication
- AI reduces manual entry and improves speed
- work order becomes the live service workspace
- generated records automatically file into aircraft history

---

# myaircraft.us — Workflow, AI, and Behavior Rules
## Codex Implementation Logic

## Non-negotiable instruction
Use engineering judgment to remove redundant steps and simplify flows.
Do not implement literal duplication if the same outcome can be achieved more cleanly through shared aircraft context.

Prefer:
- one source of truth
- inherited aircraft context
- linked records
- progressive disclosure
- AI-assisted structuring
over:
- repeated forms
- manual copy-paste workflows
- duplicated storage
- parallel disconnected UIs

---

## AI / LLM insertion points

Use AI/LLM wherever it meaningfully reduces friction.

### 1. Aircraft onboarding AI
When user adds aircraft and selects operation type, AI should:
- interpret operation type selection or plain-English operational description
- map aircraft to correct reminder templates
- map aircraft to correct document categories
- map aircraft to relevant intelligence modules
- suggest suitable assignment roles

### 2. Reminder AI
Allow user to describe custom reminder in plain English.
AI should:
- parse trigger type
- detect whether date/Hobbs/Tach/interval based
- categorize it
- create structured reminder
- suggest recurrence or due logic if obvious

### 3. Squawk AI
When user enters free text squawk:
- create short clean title
- infer category
- infer urgency / grounded suggestion
- preserve raw text
- support media attachment linkage

### 4. Estimate AI
When mechanic creates estimate from plain English:
- interpret work requested
- pull aircraft context
- pull selected squawks if any
- suggest labor lines
- suggest parts lines
- generate assumptions/notes
- create editable estimate draft

### 5. Work order generation AI
When estimate is approved or work order is manually created:
- read aircraft context
- read operation type
- read squawks
- read estimate notes
- generate scope of work
- generate checklist where applicable
- generate line items
- suggest parts
- generate plan of work

### 6. Work order thread AI
Within activity thread, AI should extract:
- work performed
- hours hints
- research/admin effort
- parts referenced
- parts status
- approval requests
- delays
- owner update drafts
- line item suggestions

### 7. AI summary
Before completion or at any time, AI should summarize:
- work completed
- blockers
- outstanding approvals
- parts used/ordered/requested
- hours by category
- customer-safe update
- internal billing justification
- recommended next actions

### 8. Logbook entry AI
When generating logbook entry from work order:
- read final work summary
- read approved work
- read parts/materials as needed
- generate editable compliant logbook entry draft
- allow review/edit/finalize before signature

---

## Aircraft-to-maintenance workflow

### Flow A — Reminder to maintenance request
1. reminder exists
2. owner clicks request maintenance
3. choose assigned mechanic or invite new mechanic
4. create maintenance request linked to:
   - aircraft
   - reminder
   - chosen mechanic
5. mechanic receives request in aircraft context

### Flow B — Squawk to maintenance request
1. owner/pilot/mechanic adds squawk
2. squawk is structured and saved to aircraft
3. one or multiple squawks can be selected
4. request maintenance from selected squawks
5. mechanic receives maintenance request linked to:
   - aircraft
   - selected squawks

### Flow C — Squawk to estimate
1. mechanic opens aircraft or squawks section
2. selects one or multiple squawks
3. clicks create estimate
4. AI drafts estimate
5. mechanic edits / sends / shares
6. estimate appears in:
   - mechanic estimate workspace
   - owner aircraft billing/estimate area
   - thread/history for that estimate

### Flow D — Estimate approval
Estimate can be approved by:
- owner in dashboard
- owner by responding to email / link flow if system can confirm
- mechanic manually marking approved after offline/phone approval

Approval state must be logged with:
- actor
- method
- timestamp

### Flow E — Estimate to work order
1. approved estimate exists
2. create work order
3. copy/link estimate data
4. carry over linked squawks/notes/context
5. AI generates scope/checklist/line items/parts suggestions
6. assign mechanic(s)
7. notify owner that work order has started

---

## Estimate behavior rules

### Estimate is not just a PDF
Estimate must have:
- data
- thread/history
- send/share state
- reminders/follow-ups
- customer responses
- internal notes

### Estimate thread rules
If customer responds through:
- dashboard
- linked communication flow
- email integration if available
that response should attach to estimate history where possible

### Estimate actions
Support:
- draft
- send
- resend
- share link
- print
- PDF
- add follow-up
- add note
- mark approved manually
- convert to work order

---

## Work order behavior rules

## Core concept
The work order is the live job workspace and primary execution record.

### Work order statuses
Support:
- Draft
- Open
- In Progress
- Awaiting Parts
- Awaiting Approval
- Waiting Customer
- Ready for Sign Off
- Closed
- Invoice Paid
- Archived

### Status behavior
- every status change logs actor + timestamp
- AI may suggest status changes but user must remain able to override
- owner-visible status must respect permission and workflow rules

### Work order participants
Possible participants:
- owner
- lead mechanic
- mechanic(s)
- IA / approver
- admin/invoicing staff

### Work order main tabs/areas
Support:
- Activity
- Line Items
- Parts
- Checklist
- AI Summary
- Owner View

---

## Work order activity thread rules

### Purpose
The thread is the lightweight collaboration layer and running service history.

### Allowed actions in thread
- text message
- dictation
- note
- photo upload
- video upload
- request approval
- request part approval
- owner question
- AI summary trigger

### Separate quick actions
Keep log hours and add part as structured quick actions, not just buried in chat.
However, AI may still infer labor/parts suggestions from chat.

### Thread visibility model
Support:
- internal-only notes
- owner-visible messages
- system-generated updates
- AI-generated summaries

### Important
Do not mix internal-only messages into customer-safe owner view.

---

## Hours and labor behavior

### Goal
Capture labor more accurately without forcing mechanics into heavy admin.

### Labor categories
Support or infer:
- wrench time
- diagnostic time
- research time
- communication/admin time
- parts coordination time
- waiting/block time if useful

### Inputs
Labor can come from:
- explicit structured log hours action
- inferred AI suggestion from thread
- manual line item edits by lead mechanic/admin

### Rule
AI suggestions must never silently overwrite user-entered labor.
They must appear as suggestions or draft updates.

---

## Approvals behavior

### Approval types
Support approvals for:
- extra hours
- extra work
- extra parts
- owner authorization
- lead mechanic / IA internal approval

### Routing
- mechanic can request approval from lead mechanic / IA
- lead mechanic can request approval from owner
- approval must be logged
- approved items may update line items and work scope

### Rule
Only approved or explicitly accepted additions should move into final billable line items automatically.
Pending requests should remain visibly pending.

---

## Parts behavior

### Parts actions
Support:
- part added from shelf/inventory
- part requested
- part approval pending
- part ordered
- owner will buy
- shop will buy

### Part search
Allow:
- search for part
- add part manually
- mark source/status

### Rules
- mechanic may request part
- depending on permissions, lead mechanic or owner decides who buys
- parts state should be reflected in work order and line items
- owner-facing messaging should make responsibility clear

---

## AI summary and completion flow

### Before final completion
Mechanic or lead mechanic should be able to trigger AI summary.

AI summary should:
- summarize full job thread
- summarize completed work
- summarize hours
- summarize parts
- summarize approvals
- identify missing details
- ask whether anything else must be added

### Finalization logic
After review:
- allow submit final service summary
- use approved/confirmed information to update final line items
- enable invoice generation
- enable logbook entry generation

---

## Invoice behavior

### Invoice creation paths
- manual standalone invoice
- from estimate
- from work order
- from final line items

### Invoice auto-population
If created from work order:
- preload labor
- preload parts
- preload notes as draft
- preload customer / aircraft context

### Invoice actions
Support:
- save draft
- finalize
- share
- email
- print
- PDF
- payment link / Stripe payment
- mark paid or sync payment status

### Owner view
Owner should see invoice in aircraft maintenance billing section and be able to pay.

---

## Logbook entry behavior

### Core rule
Logbook entry must always be associated with mechanic identity that generates/signs it.
Do not allow users to impersonate other mechanics’ signatures or certificate info.

### From work order
If work order exists:
- use work order data as primary source
- generate editable AI draft
- allow review
- allow finalize and digital sign

### Manual logbook entry
If created without work order:
- select aircraft
- use tail number and customer context if available
- optionally attach work order if one exists
- AI drafts entry from free text
- allow edit and finalize

### Save behavior
Once finalized:
- save under mechanic logbook entries
- attach into aircraft document structure automatically
- sync into owner aircraft records if owner exists in platform
- log audit trail

---

## Synchronization logic

### Same aircraft, shared truth
If owner adds squawk, mechanic sees it.
If mechanic adds squawk, owner sees it if visibility rules allow.
If estimate is sent, owner sees it in aircraft billing area.
If work order is active, both sides reference same record with role-based views.
If invoice is generated, both sides reference same billing record.
If logbook entry is finalized, it appears in aircraft records.

### Rule
Do not duplicate records by role.
Use a shared record plus filtered views.

---

## Notifications and audit

Every important action must be logged.

Track at minimum:
- aircraft created
- operation type changed
- user assignment changes
- document upload/classification
- reminder creation/completion
- squawk creation/resolution
- maintenance request creation
- estimate creation/send/approval
- work order creation/status changes
- approval request/response
- part request/order/addition
- AI summary generation
- invoice creation/finalization/payment
- logbook entry generation/finalization

Each event should record:
- actor
- timestamp
- related aircraft
- related object
- visibility scope if applicable

---

## Anti-redundancy rules for Codex
Codex must implement these rules:

1. Never ask for aircraft/customer data again if already available in linked aircraft context.
2. Reuse shared object relationships rather than duplicating data blobs.
3. When one object is generated from another, preserve links and inheritance.
4. Prefer editable AI drafts over forcing manual structured forms first.
5. Keep owner, mechanic, and admin on shared underlying records with permission-based views.
6. Avoid making maintenance a separate product tree from aircraft.
7. Keep chat/thread lightweight, but ensure structured outputs are available for labor, parts, approvals, invoice, and logbook.
8. Use AI where it reduces clicks and typing, but keep all important commercial/legal outputs user-reviewable.

---

# myaircraft.us — UI, Engineering, and Build Guardrails
## Codex execution instructions

## Primary implementation goal
Follow the **Figma Make visual direction and flow**, but improve engineering coherence where needed.

Build the system so it feels:
- premium
- minimal
- operational
- aircraft-centered
- easy to scan
- role-aware
- AI-assisted
- realistic for aviation maintenance and records

Do not drift into generic admin-dashboard design.
Do not create redundant pages that duplicate aircraft context.

---

## UI architecture guidance

### Preferred app structure
Use a clean layout with:
- left sidebar = main navigation
- optional second pane = aircraft list / estimate list / work order list / invoice list
- main content = selected aircraft or selected record
- right utility panel only when needed for:
  - AI summary
  - metadata
  - approvals
  - owner preview
  - activity summary

This will keep the interface cleaner than top-heavy toolbars everywhere.

### Aircraft-centered navigation
System should make it obvious that aircraft is the root.

Examples:
- selecting aircraft updates downstream sections
- reminders, squawks, maintenance, documents, intelligence all feel like aircraft tabs
- mechanic shortcuts still route into aircraft-specific views

---

## Design system direction
Use:
- strong visual hierarchy
- fewer oversized empty regions
- cleaner action bars
- compact cards
- useful tabs
- status chips
- segmented controls
- practical buttons
- moderate density
- not overly compressed
- modern aviation/professional styling

Avoid:
- excessive text blocks
- generic CRM clutter
- giant unlabeled empty whitespace
- deeply nested hidden actions
- redundant separate modals for things already obvious in context

---

## Mandatory UI sections to implement

### Aircraft / owner-side
- aircraft onboarding
- aircraft overview
- documents
- reminders dashboard
- reminder detail / add custom reminder
- squawks list and add squawk
- assignments and invite user
- intelligence dashboard
- maintenance billing / estimates / invoices area
- owner view of work order progress and approvals

### Mechanic-side
- mechanic dashboard
- aircraft list / assigned aircraft
- mechanic aircraft view
- squawk queue
- estimate list + detail thread
- work order list + detail
- work order activity
- parts / checklist / line items
- AI summary panel
- invoice list + detail
- logbook entry list + detail
- manual invoice creation
- manual logbook entry creation

---

## Work order UI guardrails

### Work order must be the hero screen
The work order screen is the most important collaborative screen.

### Work order header must include
- work order number
- aircraft tail number
- make/model
- owner/customer
- assigned mechanic(s)
- due date
- progress
- status
- high-value quick actions

### Work order quick actions
- update status
- notify owner
- add part
- upload media
- AI summary
- create invoice
- generate logbook entry

### Work order tabs
- Activity
- Line Items
- Parts
- Checklist
- AI Summary
- Owner View

### Activity area
Must feel like a shared job thread, not a generic comment box.
Support:
- notes
- dictation
- media
- approvals
- system updates
- owner-visible messages
- internal notes

---

## Estimate UI guardrails

### Estimate list must show
- estimate number
- tail number
- customer
- status
- age
- short description

### Estimate detail must support
- AI-generated estimate draft
- line items
- notes
- communication thread
- send/share actions
- approval state
- follow-ups
- convert to work order

---

## Invoice UI guardrails

### Invoice list must show
- invoice number
- aircraft
- customer
- amount
- status
- days delinquent / aging

### Invoice detail must support
- linked work order if present
- linked estimate if present
- editable line items
- payment status
- Stripe payment
- send/share/pdf/print

---

## Logbook entry UI guardrails

### Must support both
- generate from work order
- manual creation

### Fields/behavior
- editable AI-generated draft
- mechanic identity auto-filled from logged-in user
- digital signature/finalization flow
- save/share/pdf/email
- automatic filing into aircraft documents

---

## Reminders UI guardrails

### Reminder dashboard top area
Include:
- overdue count
- due soon count
- 7/30/90 day cards
- hours remaining / days remaining
- graph/timeline/health visualization

### Reminder list area
Allow:
- sort
- filter
- category grouping
- custom reminders
- AI reminder creation

### Reminder detail actions
- edit
- snooze
- mark complete
- request maintenance

---

## Squawks UI guardrails

### Must support
- very fast entry
- rough plain English
- category suggestion
- grounded flag
- photo/video upload
- multi-select actions

### Bulk flow
Selected squawks should be able to create estimate or maintenance request without awkward repetition.

---

## Assignment / role system guardrails

### Aircraft-level permissions only
Permissions should be scoped by aircraft when relevant.

### Roles UI
Implement as:
- role cards
- permission matrix
- invite user flow
- visibility preview if useful

Avoid overly enterprise-looking complicated ACL interfaces.

---

## Engineering behavior expectations for Codex

### Use shared domain relationships
Recommended conceptual relationships:
- Aircraft has many Documents
- Aircraft has many Reminders
- Aircraft has many Squawks
- Aircraft has many Assignments
- Aircraft has many Maintenance Requests
- Aircraft has many Estimates
- Aircraft has many Work Orders
- Aircraft has many Invoices
- Aircraft has many Logbook Entries
- Aircraft has many Intelligence snapshots/modules
- Work Order may derive from Estimate
- Invoice may derive from Estimate and/or Work Order
- Logbook Entry may derive from Work Order
- Reminder may generate Maintenance Request
- Squawk may generate Maintenance Request and/or Estimate

### Keep derived object links
Derived records should keep references, not just copied text.

Examples:
- workOrder.sourceEstimateId
- estimate.sourceSquawkIds
- invoice.sourceWorkOrderId
- logbookEntry.sourceWorkOrderId
- maintenanceRequest.sourceReminderId
- maintenanceRequest.sourceSquawkIds

### Preserve auditability
AI-generated outputs should be reviewable and traceable.
Do not make silent destructive automations.

---

## Suggested build phases for Codex

### Phase 1 — Aircraft foundation
- aircraft root architecture
- onboarding with operation type
- assignment model
- documents structure
- reminders structure
- squawks structure
- aircraft overview and activity model

### Phase 2 — Maintenance core
- estimate model and UI
- work order model and UI
- invoice model and UI
- linked object relationships
- owner and mechanic shared views

### Phase 3 — AI assistance
- onboarding AI mapping
- reminder AI parser
- squawk AI structuring
- estimate AI drafting
- work order AI generation
- AI summaries
- labor/parts extraction assistance
- logbook entry AI drafting

### Phase 4 — Billing and records completion
- invoice payment flow
- owner billing dashboard
- logbook entry finalization
- auto-filing into aircraft documents
- completed record sync

### Phase 5 — polish and optimization
- permission refinements
- search/filtering
- role-aware visibility
- notification polish
- workflow smoothing
- reduction of duplicate UI steps

---

## Codex quality bar
Codex should aim to:
- preserve the Figma flow and visual structure as much as practical
- improve logic where user flow is repetitive
- remove redundant prompts and duplicate data entry
- use AI wherever it reduces friction
- keep all key outputs editable and auditable
- maintain one aircraft-centered source of truth
- make owner and mechanic experiences synchronized but role-appropriate

## Final instruction to Codex
Do not implement this literally in a bloated way.
Use judgment to consolidate redundant flows, reuse context, and create a smoother production-ready system while preserving all core product requirements.
