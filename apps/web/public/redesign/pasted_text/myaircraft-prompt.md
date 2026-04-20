# MYAIRCRAFT.US — CHAT-FIRST AIRCRAFT MAINTENANCE OPERATING SYSTEM
## Master Build Prompt for Claude / Codex / Claude Code

You are designing and implementing a production-grade, chat-first aviation maintenance platform for **myaircraft.us**.

This is **not** a traditional dashboard-first CMMS/MRO product.

The system must be built around **one single source of truth: the chat bar**.

The mechanic, IA, shop manager, owner, and admin should be able to operate most of the software by simply talking to the system in natural language.

The interface behavior should feel like:
- ChatGPT-style conversation thread on the left/center
- Context-aware generated artifact pane on the right
- The selected aircraft always acts as the current operating context
- Chat can generate, edit, save, and trigger actions across the system
- All actions are logged with full audit history

The user should not need to jump through many menus.
The chat is the command surface.
The right panel is the live generated workspace.
The database and workflows are the hidden operational engine.

---

# 1. CORE PRODUCT VISION

Build a **chat-native aircraft maintenance management system** where a mechanic can:

- select an aircraft in the chat header
- type: “prepare a logbook entry”
- have the system instantly draft the entry in the right-side panel
- auto-fill everything it already knows
- ask for only the missing required items
- allow editing before finalization
- save/share/export/email/sign the final entry

Likewise, the mechanic should be able to type:
- “generate a work order”
- “add 2.5 labor hours”
- “add oil filter part number XYZ”
- “find alternator for this aircraft”
- “add that part to the work order”
- “generate invoice”
- “mark invoice pending”
- “create corresponding logbook entry”
- “email customer”
- “share by secure link”

All of this must happen primarily from chat.

The system should be usable by:
- A&P mechanics
- IA mechanics
- repair stations
- Part 91 owners/operators
- Part 135 operators
- small aviation shops
- fleet operators
- flight schools
- owner-assisted maintenance users with permissions
- managers/admins
- customers/owners via restricted portals or links

The system should be designed with the seriousness and structure expected in real aviation maintenance environments.

---

# 2. PRIMARY DESIGN PRINCIPLE

## “Chat is the source of truth.”

Every operational workflow must be designed so that the user can start and complete it through chat, while the UI generates the correct structured artifacts in the background.

The UI should not force the user to manually navigate deep forms unless absolutely necessary.

Instead:

- the user speaks naturally
- the AI interprets intent
- the system opens the correct right-side workspace
- structured fields are populated automatically
- missing required fields are requested inline
- the user confirms or edits
- the system saves the result to the correct records

---

# 3. UI / UX ARCHITECTURE

## Main layout

### A. Top context bar
Must include:
- Selected aircraft
- Tail number
- aircraft make/model/serial
- customer/owner name
- current work order status if active
- quick switcher for aircraft
- mechanic identity / role
- indicator if aircraft is currently in an active maintenance thread

### B. Left sidebar
Must include:
- Recent chat threads
- Search conversations
- Rename thread
- Pin important thread
- Save thread to customer
- Save thread to aircraft
- Save thread to work order
- Share thread by secure link
- Email thread summary
- New chat
- New aircraft-scoped chat
- New customer-scoped chat
- New global search thread

### C. Center panel
Main conversational thread:
- ChatGPT-style interface
- natural language interactions
- AI replies with actions, summaries, follow-up questions, and generated objects
- threaded history maintained
- assistant messages can contain action buttons
- each thread can be linked to aircraft/customer/work-order/invoice/logbook

### D. Right-side context pane
Dynamic artifact/workspace panel that changes based on chat intent:
- Logbook entry editor
- Work order editor
- Invoice editor
- Customer card
- Parts lookup table
- Inspection checklist
- Signature panel
- Compliance reminder panel
- Form assistant panel
- Attachments / records browser
- Audit timeline
- Share/export modal preview

This panel must update live as the conversation evolves.

---

# 4. AIRCRAFT CONTEXT MODEL

When an aircraft is selected, the AI must immediately load and use aircraft context such as:
- tail number
- make/model/serial
- engine/prop/appliance details
- total time if available
- hobbs/tach if latest values exist
- customer/owner/operator
- maintenance program type
- open discrepancies
- active work orders
- prior entries
- recurring inspections
- AD/SB references if available
- related documents
- parts catalog eligibility
- aircraft-specific templates
- customer preferences
- shop preferences
- assigned mechanic permissions

The selected aircraft should function like a persistent working memory context for that thread.

---

# 5. LOGBOOK ENTRY SYSTEM — REQUIRED BEHAVIOR

This is a major core feature.

## Trigger
When user types:
- “prepare a logbook entry”
- “make an entry”
- “create return to service entry”
- “generate annual inspection entry”
- “log this work”
- “create discrepancy correction entry”
- similar language

## Expected behavior
1. Detect selected aircraft automatically
2. Retrieve known data already available
3. Infer likely entry type
4. Open **Logbook Entry Workspace** in right panel
5. Draft the entry using known data
6. Highlight missing required values
7. Ask chat follow-up questions only for missing required items
8. Keep all mechanic-provided details in memory during the thread
9. Allow direct text editing in right panel
10. Allow “regenerate cleaner wording” without losing factual content
11. Allow “show plain version” and “show detailed version”
12. Allow “show owner-friendly explanation”
13. Allow “show regulatory wording only”
14. Once complete, allow finalization

## Missing-data logic
If details are missing, the system should ask:
- Hobbs?
- Tach?
- total time?
- date of completion?
- reference manual/ICA/STC if needed?
- parts used?
- work order reference?
- signoff authority?
- certificate number?
- inspection status?
- return-to-service statement?
- follow-up forms needed?

It should ask for only what is necessary, not everything.

## Template engine
The system must support a rich library of templates and generation modes, including:
- standard maintenance entry
- preventive maintenance entry
- inspection entry
- annual inspection signoff
- 100-hour inspection signoff
- discrepancy found entry
- discrepancy corrected entry
- oil change entry
- tire/brake service entry
- battery service entry
- avionics install entry
- ELT inspection entry
- transponder/static test reference entry
- AD compliance entry
- SB compliance entry
- component replacement entry
- engine work entry
- propeller work entry
- alteration entry support
- major repair / alteration support package
- return to service statement
- owner-supplied parts notation if applicable
- shop custom templates

## Output actions
After finalization, offer:
- Save to digital logbook
- Save draft only
- Share by secure link
- Download PNG
- Download PDF
- Email
- Copy text
- Attach to work order
- Attach to invoice
- Attach to customer record
- Print
- Generate companion form checklist

---

# 6. SIGNATURE SYSTEM FOR LOGBOOK ENTRIES

The signature system must feel premium and trustworthy.

## Requirements
- “Sign here” panel in right-side workspace
- Draw signature on screen
- optional typed signature style
- signature rendered in blue ink visually
- pull mechanic full legal name from profile
- pull A&P / IA / certificate information from profile
- show consent checkbox before signing
- show exact statement of what is being signed
- bind signature to the exact document version/hash
- capture timestamp
- capture user account identity
- capture IP address
- capture browser/session metadata
- capture optional location only with permission
- generate audit certificate / signature certificate
- permanently associate certificate with saved document
- include certificate when sharing/exporting/emailing
- maintain immutable version history

## Important implementation note
Do not depend on MAC address as a primary proof mechanism.
If device metadata is available, store it as supplemental metadata only.
Location data must be opt-in and privacy-controlled.

## Signature certificate contents
- document ID
- document hash
- signer full name
- certificate/license number from profile
- role
- signature timestamp
- timezone
- IP address
- session ID
- device/browser metadata
- optional consented location
- consent version accepted
- document version signed
- audit trail events
- verification URL / verification token

## Signature workflow
1. User clicks Sign
2. Consent modal opens
3. User confirms intent
4. User signs
5. System seals document version
6. Certificate generated
7. Document becomes “Signed Final”
8. All exports include certificate package

---

# 7. COMPLIANCE ASSIST PANEL UNDER THE ENTRY

Below each drafted entry, the system must show a smart “Next Required Steps” panel.

Examples:
- “FAA Form 337 may be required”
- “Attach weight and balance revision”
- “Update equipment list”
- “Store signed record in physical logbook”
- “Send digital copy to owner”
- “File copy in aircraft digital records”
- “Add work performed to invoice”
- “Attach supporting documents”
- “This entry should be cross-linked to Work Order #...”
- “Reminder: inspection due list should be recalculated”

This panel should be rules-driven plus LLM-assisted.

It should include:
- action name
- why it matters
- whether mandatory or recommended
- button to open related form/workflow
- reference link field
- submission/contact field when configured by organization

Do not hardcode only FAA logic.
Make it configurable by organization, operator type, and workflow profile.

---

# 8. WORK ORDER SYSTEM — CHAT-FIRST

Another major core feature.

## Trigger
User types:
- “generate a work order”
- “start a work order”
- “open a job”
- “create work sheet”
- “new work card”
- “start discrepancy job”

## Behavior
1. Detect aircraft context
2. Open **Work Order Workspace** in right panel
3. Generate standard work order shell
4. Auto-fill aircraft/customer/mechanic/date
5. Create unique work order number
6. Set status = Draft / Open
7. Let mechanic continue working from chat

## During the thread
The mechanic should be able to say:
- add 1.5 hours labor
- add part number ABC123
- add gasket kit
- mark part ordered
- add vendor
- set customer complaint
- add discrepancy
- add corrective action
- add notes
- add photo
- attach invoice pdf
- add outside service
- add serial number removed/installed
- mark awaiting parts
- mark work complete
- summarize work order

The AI must update the structured work order in the right panel in real time.

## Work order fields
- work order number
- aircraft
- customer
- opened date/time
- mechanic assigned
- status
- squawk / complaint
- discrepancy
- troubleshooting notes
- findings
- corrective action
- labor lines
- parts lines
- outside services
- references/manuals
- attachments
- recommended follow-up
- internal notes
- customer-visible notes
- billing summary
- tax/shipping if applicable
- signoff linkage
- linked logbook entry
- linked invoice
- linked parts sourcing records
- linked conversations
- linked documents

## Statuses
- Draft
- Open
- Awaiting Approval
- Awaiting Parts
- In Progress
- Waiting on Customer
- Ready for Signoff
- Closed
- Invoiced
- Paid
- Archived

---

# 9. AUTOMATIC LOGBOOK ENTRY FROM WORK ORDER

This must be seamless.

Once work is done, the mechanic can click:
- “Generate logbook entry from this work order”

The AI must:
1. Analyze work performed
2. Draft compliant maintenance wording
3. Avoid including internal billing language
4. Distinguish between customer summary vs official record language
5. Pull relevant references
6. Ask for any missing mandatory signoff details
7. Open the logbook entry in right panel
8. Keep linkage between work order and entry

There should also be:
- “Generate concise entry”
- “Generate detailed entry”
- “Generate discrepancy correction entry”
- “Generate return-to-service language”

---

# 10. INVOICE SYSTEM

The mechanic or shop must be able to generate invoice directly from chat and from work order.

## Trigger phrases
- generate invoice
- bill customer
- create invoice
- prepare invoice
- summarize charges

## Invoice requirements
- invoice number
- customer
- aircraft
- linked work order
- labor subtotal
- parts subtotal
- outside services
- tax
- shipping
- total
- due date
- status
- notes
- payment status

## Actions
- Save
- Email
- Share secure link
- Print
- Download PDF
- Mark pending
- Mark partially paid
- Mark paid
- Record payment note
- Send reminder
- Attach to customer file

## Collections management
Need a basic A/R system:
- Pending
- Due today
- Overdue
- Partially paid
- Paid
- bad debt / writeoff note
- resend invoice
- reminder log
- customer payment timeline

The AI should be able to answer:
- show overdue invoices
- show open invoices for Horizon Flights
- remind me who has not paid
- send reminder for invoice 1023
- mark invoice paid by wire
- summarize unpaid balances by customer

---

# 11. CUSTOMER MANAGEMENT SYSTEM

The mechanic/shop should build a customer database naturally through usage.

## Customer sources
Customers can be created from:
- aircraft ownership record
- manual creation
- shared aircraft relationships
- invoices
- work orders
- shared mechanic access
- imported contacts
- email capture
- shared links accepted

## Customer profile fields
- name
- company
- contact person
- email
- phone
- billing address
- aircraft owned/operated
- notes
- preferred communication
- invoice history
- payment status summary
- work order history
- logbook/document history
- assigned mechanics
- permissions
- portal access
- tags

## Relationship model
Example:
If Horizon Flights owns an aircraft and grants Steve mechanic access,
Steve should appear as a mechanic relationship for that aircraft.
If Steve performs work and shares documents with Horizon Flights,
that interaction should enrich customer/aircraft records automatically.

## Customer actions from chat
- show customer history
- create customer
- email customer
- link this invoice to customer
- show all work for this customer
- show unpaid balance
- save this thread to customer file

---

# 12. PARTS LOOKUP + PARTS SOURCING SYSTEM

This must also be chat-native.

## User examples
- find alternator for this aircraft
- look up part number for left brake disc
- search IPC for flap roller
- find cheapest available source
- show vendors for this part
- add selected part to work order
- order reminder for this part
- attach quote to work order

## Required behavior
1. Detect aircraft context
2. Search parts catalog / IPC / configured catalogs
3. Show candidate parts with confidence
4. Let user refine
5. Search vendor sources
6. Return part number, description, condition if available, price if available, vendor/contact if available
7. Allow one-click “Add to Work Order”
8. Ask quantity/price if missing
9. Update work order automatically
10. Save sourcing evidence to work order or parts history

## Parts result card should show
- part number
- alternate part numbers
- description
- applicability / fit confidence
- source/vendor
- price if known
- condition
- stock indicator
- link/call/email actions where available
- add-to-work-order button
- save-for-later button

## AI rules
- never silently assume exact fit when uncertain
- always show fit confidence and source confidence
- separate “catalog result” from “marketplace/vendor result”
- allow “mechanic confirmation required” state
- preserve sourcing history in thread

---

# 13. CHAT THREAD MODEL

The product should feel like a serious AI workspace, not disposable chat.

## Thread requirements
- recent threads
- aircraft-scoped threads
- customer-scoped threads
- work-order threads
- general research threads
- rename thread
- pin thread
- archive thread
- duplicate thread
- share thread
- email thread transcript
- save thread to aircraft file
- save thread to customer file
- save thread to work order
- convert thread to job summary

## Important
Threads are not just chat history.
They are operational memory objects that can be linked to records.

---

# 14. PERMISSIONS & ROLES

Roles should include at minimum:
- Owner / Account Admin
- Shop Admin
- Mechanic
- IA
- Front Desk / Billing
- Customer / Owner viewer
- Read-only auditor
- Parts manager

Permissions should control:
- who can sign
- who can finalize entries
- who can create invoices
- who can mark paid
- who can share records
- who can access all aircraft vs assigned aircraft
- who can see internal notes
- who can delete drafts
- who can view signature certificates
- who can export records
- who can edit final records through amendment workflow only

---

# 15. AUDIT TRAIL / TRUST LAYER

Every meaningful action must create an immutable audit event.

Track:
- created by
- edited by
- field changes
- prompt used
- generated version ID
- final approved version
- signed version
- export events
- email events
- share link events
- viewed events for shared links
- payment status changes
- document seal hash
- consent acceptance events

Need:
- human-readable timeline
- machine-verifiable record hash chain if feasible
- version compare
- “who changed what”
- tamper-evident storage strategy

---

# 16. DOCUMENT OUTPUTS

For logbook entries, work orders, invoices, summaries, and certificates support:
- in-app saved record
- print layout
- PDF
- PNG where useful
- secure share link
- email delivery
- downloadable certificate package
- customer-facing simplified summary
- internal detailed version

Shared/exported documents should preserve:
- linked aircraft
- linked customer
- version number
- signed status
- audit certificate reference

---

# 17. ARTIFACT TYPES GENERATED FROM CHAT

The assistant should be able to open/generate all of these on the right side:
- Logbook Entry
- Work Order
- Invoice
- Estimate
- Customer Summary
- Parts Search Results
- Signature Certificate
- Compliance Checklist
- Follow-up Reminder Card
- Inspection Checklist
- Document Request List
- Thread Summary
- Billing Summary
- Return-to-Service Draft
- Major Repair/Alteration Support Package
- Discrepancy Resolution Card

---

# 18. AI ORCHESTRATION LAYER

Build a robust orchestration layer behind chat.

## The chat assistant must:
- interpret intent
- detect current scope (aircraft, work order, customer, billing, parts, records)
- decide whether to answer conversationally or open a structured artifact
- extract entities
- fill structured forms
- ask for missing required fields
- keep thread memory
- maintain fact vs suggestion separation
- prevent hallucinated regulatory wording when facts are missing
- show confidence where uncertainty exists

## Important
The assistant must never invent:
- part numbers
- serial numbers
- times
- certificate numbers
- completed work not actually confirmed
- regulatory forms that are not actually required

Instead it should mark:
- missing
- unknown
- assumed pending confirmation
- user-confirmed
- system-derived

---

# 19. DATA MODEL

Design a clean relational + event-based data model covering:

## Core entities
- Users
- Profiles
- Roles
- Mechanics
- Customers
- Aircraft
- Engines
- Props
- Components
- WorkOrders
- WorkOrderLines
- LaborLines
- PartsLines
- Invoices
- Payments
- LogbookEntries
- EntryTemplates
- SignatureCertificates
- Documents
- Attachments
- Conversations
- ConversationLinks
- PartsSearches
- Vendors
- AuditEvents
- ComplianceTasks
- ShareLinks
- Notifications

## Entity linking
Need many-to-many support where appropriate:
- one customer, many aircraft
- one aircraft, many mechanics
- one work order, many parts
- one work order, one or more draft entries
- one final entry, one signature certificate
- one invoice, one work order, one customer
- one conversation linked to many objects

---

# 20. SAFETY / REGULATORY UX RULES

Build the UI so it encourages correctness:
- separate draft from final
- require explicit confirmation before signing/finalizing
- show missing required fields clearly
- show unresolved assumptions clearly
- do not let the AI hide missing facts inside polished wording
- final records should become locked, with amendment workflow instead of silent edits
- provide “amended by” trail for post-final changes
- distinguish internal notes from official records
- distinguish customer-friendly language from official maintenance record language

---

# 21. SEARCH / UNIVERSAL COMMAND BAR BEHAVIOR

The chat bar is also the universal command/search/action surface.

User should be able to type:
- show active work orders
- show unpaid invoices
- find this part
- show last annual
- create discrepancy
- summarize all work on this aircraft
- email customer
- prepare estimate
- add part to job
- find all entries mentioning magneto
- show threads for N123AB
- open last invoice
- generate return to service entry

The assistant should decide whether to:
- answer in chat
- open a workspace
- perform a mutation
- ask a missing-data question
- show a search result list

---

# 22. TECHNICAL PRODUCT REQUIREMENTS

Build as a modern web app with:
- excellent performance
- mobile-responsive views where practical
- secure auth
- role-based permissions
- event-driven backend
- document versioning
- rich text structured editors
- queue/background processing for export/email/indexing
- full audit logging
- searchable artifacts
- vector/semantic retrieval for prior entries/templates
- configurable template library
- configurable compliance logic
- attachment support
- OCR-ready document ingestion support

Use a production-grade architecture, not a demo architecture.

---

# 23. SUGGESTED IMPLEMENTATION APPROACH

Recommended conceptual stack:
- chat orchestration layer
- structured action engine
- artifact generator service
- document renderer
- signature service
- audit/event service
- customer/aircraft/work order/invoice domain services
- parts lookup service
- search/index service
- permissions service
- notification/email/share service

The LLM should be one layer of the system, not the entire system.
Structured storage and deterministic workflows must back the AI.

---

# 24. DESIGN LANGUAGE

Visual feel should be:
- premium
- clean
- highly usable
- aviation-professional
- serious but easy
- modern AI-native
- minimal clutter
- right panel as a crisp live document workspace
- chat-first, not form-first

Avoid old-school ERP ugliness.

---

# 25. OUTPUT EXPECTATION FOR THIS BUILD

Produce the following:

## A. Product blueprint
A deeply thought-through architecture and feature design for the full platform.

## B. Information architecture
Screen map, interaction map, and object relationships.

## C. Data model
Detailed schema and relationships.

## D. UX flows
For:
- create logbook entry
- create work order
- add parts to work order
- generate invoice
- sign entry
- share/export/email document
- generate entry from work order
- manage customer history
- manage unpaid invoices
- parts lookup and add-to-job flow

## E. Chat intent/action model
Map natural-language intents to system actions.

## F. Right-panel artifact specs
Define each generated artifact and editable state.

## G. Audit/signature trust model
Detailed event tracking and certificate structure.

## H. Edge cases
Examples:
- no aircraft selected
- missing hobbs/tach
- uncertain part match
- work order closed but invoice not sent
- signed entry needs amendment
- customer has multiple aircraft
- mechanic lacks permission to sign
- part added with no price yet
- invoice paid partially
- one thread touching multiple jobs

## I. Build plan
Phased implementation roadmap:
- Phase 1 foundation
- Phase 2 core maintenance workflows
- Phase 3 billing/customer/parts
- Phase 4 trust/compliance/deeper intelligence
- Phase 5 integrations and scale

## J. UI copy examples
Short examples for assistant replies and prompts.

---

# 26. CRITICAL PRODUCT RULES

1. Chat is the source of truth.
2. Aircraft context is persistent within the thread.
3. Structured artifacts must open in the right panel.
4. AI should ask only for missing required items.
5. Draft and final states must be clearly separated.
6. Every major action must be auditable.
7. Signature certificates must be attached to signed outputs.
8. Work orders, invoices, and entries must cross-link automatically.
9. Customer history must accumulate naturally.
10. The system must feel like talking to a highly competent aviation maintenance coordinator + IA assistant.

---

# 27. FINAL INSTRUCTION

Do not give a shallow answer.

Think like:
- an elite aviation software architect
- an experienced A&P / IA
- a Part 135 maintenance process designer
- a repair station operations expert
- a practical UX designer
- a systems architect building for real-world use

The result should feel like a real product spec that could be handed to a serious engineering team and immediately used to build the platform.