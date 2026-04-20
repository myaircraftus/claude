Design a premium, minimal, modern aviation SaaS web app for **myaircraft.us**.

## Core product principle
The **aircraft is the main source of truth**.

Everything in the platform should be structured around one aircraft record:
- aircraft details
- operation type
- documents
- reminders
- squawks
- maintenance requests
- estimates
- work orders
- invoices
- logbook entries
- intelligence
- user assignments and permissions

Do NOT design this as disconnected modules.
Design it as an **aircraft-centered system** where each aircraft acts like its own operating hub.

---

## Visual direction
Create a UI that is:
- minimal
- premium
- clean
- less text-heavy
- highly structured
- not cluttered
- modern enterprise SaaS
- aviation-grade and trustworthy
- easy to scan quickly
- desktop-first
- realistic for aircraft owners, mechanics, pilots, instructors, operators, and auditors

Use:
- clear spacing
- soft card structure
- strong hierarchy
- practical action buttons
- concise labels
- subtle aviation/professional colors
- minimal noise
- more dashboards, timelines, side panels, pills, status chips, and action bars
- fewer heavy tables unless needed

Avoid:
- crowded layouts
- giant text blocks
- overly generic CRM look
- too many disconnected pages
- overly playful visuals

---

## Product architecture to reflect in design

# 1. Aircraft onboarding is the foundation
When a user adds an aircraft, the system should ask for:

- tail number
- operation type
- current Hobbs
- current Tach
- optional custom owner/operator details if needed

The system already pulls aircraft details from the FAA using the tail number.

### Operation type selection
Allow one or multiple operation selections such as:
- Part 91
- Part 135
- Part 141
- Part 61
- flight school
- charter
- private owner
- lease / managed aircraft
- corporate operation
- maintenance / shop-managed aircraft

The selected operation type drives:
- which reminder templates appear
- which document categories appear
- which roles can be assigned
- which intelligence / reports are shown

Design this onboarding flow clearly and simply.
Show how operation type changes the aircraft setup automatically.

---

# 2. Aircraft home / aircraft overview page
Design the main aircraft page as the control center.

## Aircraft overview should include:
- aircraft header with tail number, make/model, serial, operation type
- Hobbs and Tach display
- owner / operator info
- assigned users summary
- document completeness
- reminder health
- squawk status
- active maintenance status
- intelligence summary
- recent activity feed

## Top-level tabs or sections
Design the aircraft view with clean top navigation or section switching for:

- Overview
- Documents
- Reminders
- Squawks
- Maintenance
- Intelligence
- Assignments
- Activity

This should feel like a clean aircraft operating dashboard.

---

# 3. Reminders system redesign
This is very important.

Design a full **Reminders** experience that supports both:
- auto-generated reminders
- manually created reminders

## Reminder inputs / logic
Reminder types can be:
- date/time based
- Hobbs based
- Tach based
- recurring interval based
- custom AI-categorized reminder

## Reminder categories
Create a robust reminder library for general aviation and regulated operations.

### Core reminder groups to visually support
- Annual inspection
- 100-hour inspection
- 50-hour inspection
- ELT inspection / battery
- Pitot-static / transponder / altimeter
- Registration renewal
- Airworthiness-related renewals
- Oil change intervals
- AD compliance reminders
- SB / service interval reminders
- Engine inspections / overhauls
- Propeller inspections / overhauls
- Avionics checks
- Battery / tire / brake / consumable intervals
- IFR certification items
- training or operational compliance reminders depending on operation type
- charter / school / operations-specific reminders
- custom reminders

Do not show this as one giant ugly list.
Instead design:

## Reminder dashboard
At the top show:
- critical reminders due soon
- overdue count
- upcoming in 7 / 30 / 90 days
- hours remaining / days remaining
- graph or timeline visualization
- priority cards

Then below that:
- categorized reminder list
- filter by category
- filter by due type
- sort by critical / due soon / overdue / custom
- add custom reminder button
- AI reminder creation option

### Important UX behavior
Allow a user to click:
- Add custom reminder
- or “Describe reminder in plain English”

Example:
“Create a reminder every 50 Hobbs hours for oil change”
AI should categorize and structure it.

### Maintenance action from reminders
Every reminder should support:
- view details
- mark complete
- snooze / edit
- request maintenance

This is important:
A reminder can be converted into a maintenance request.

---

# 4. Squawks system
Design **Squawks** as a dedicated aircraft-level section.

## Squawk sources
Squawks can be added by:
- owner
- pilot
- mechanic
- instructor
- operator

## Squawk entry experience
Make squawk entry fast and lightweight.

Allow:
- plain-English entry
- category tagging
- grounded / not grounded flag
- severity
- upload photo
- upload video
- attach notes

AI should transform rough input into a properly categorized squawk.

Example:
“Left brake feels soft after landing, possible drag, uploaded photo”
should become a structured squawk item.

## Squawk views
Design:
- open squawks
- incoming squawks
- grounded squawks
- resolved squawks
- squawk timeline/history

## Bulk action
A key requirement:
One aircraft may have many squawks.
Allow owner or mechanic to:
- select multiple squawks
- combine them
- request maintenance from selected squawks

This should generate a maintenance request for a mechanic.

---

# 5. Assignments / permissions
Each aircraft should support aircraft-level user assignments.

Design a clean **Assignments** section for each aircraft.

Users can be invited and assigned roles such as:
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
- read-only external reviewer

The assigned role determines:
- what documents they can see
- what reports they can see
- whether they can submit squawks
- whether they can create estimates/work orders/invoices/logbook entries
- whether they can approve work / hours / parts

Show this as a clean permission matrix or role cards, not a messy admin screen.

---

# 6. Aircraft documents should adapt by operation type
Design the **Documents** area so it changes depending on operation type.

The system should auto-build the expected document structure based on:
- aircraft type
- operation type
- role / access
- intelligence requirements

For example:
a Part 135 aircraft should show more operational/compliance-related categories than a simple private Part 91 aircraft.

Design:
- document category cards
- completeness indicators
- upload state
- missing documents
- AI classified documents
- operation-specific document grouping

This should feel intelligent and organized.

---

# 7. Intelligence area should adapt per aircraft
Design an **Intelligence** section for each aircraft.

This area should change depending on operation type and available records.

Example intelligence modules:
- aircraft overview
- engines / props
- inspection status
- maintenance timeline
- missing records
- premium packet
- lender summary
- insurance summary
- operational compliance summary

This should look like a premium analytics/intelligence workspace, not a boring report page.

---

# 8. Owner maintenance flow
Design owner-side maintenance flow under the aircraft.

Owners should be able to:
- view reminders
- request maintenance from reminders
- view squawks
- submit squawks
- combine squawks into maintenance requests
- choose an assigned mechanic
- add/invite a mechanic if none exists
- view estimates
- approve estimates
- view work orders
- approve extra hours or parts
- view invoices
- pay invoices
- receive logbook entries and completed records

Design the owner experience as transparent, simple, and reassuring.

---

# 9. Mechanic workspace redesign
Now design a dedicated mechanic portal that is still aircraft-centered.

The mechanic should mainly see:
- assigned aircraft
- squawks
- estimates
- work orders
- invoices
- logbook entries
- customers

But every action still leads back to a specific aircraft.

## Mechanic left navigation or main structure
Design a simple mechanic workspace with sections:
- Aircraft
- Squawks
- Estimates
- Work Orders
- Invoices
- Logbook Entries
- Customers
- Team / Mechanics

Minimal and clean.

---

# 10. Mechanic aircraft view
When a mechanic opens an aircraft, design the page so they can immediately see:
- aircraft summary
- open squawks
- active estimates
- active work orders
- recent invoices
- logbook entry history
- owner/customer info
- documents relevant to maintenance
- active reminders relevant to service

This should feel like a mechanic’s operational cockpit for that aircraft.

---

# 11. Squawk-to-estimate flow
Design the mechanic flow so they can:
- review incoming squawks
- add their own squawks
- select one or many squawks
- create an estimate from them

The estimate creation should be AI-assisted.

## Estimate creation UX
When mechanic clicks “Create Estimate”:
show a plain-English AI drafting flow.

Mechanic can:
- type
- talk
- revise
- add items
- mention inspection type
- mention parts
- mention labor

AI then generates:
- labor line items
- parts line items
- assumptions/notes
- estimate summary

The mechanic can:
- edit estimate
- save draft
- email/send
- share link
- download PDF
- print

---

# 12. Estimate management redesign
Design a full estimate list and estimate detail workspace.

## Estimate list
Left-side or split-panel list with:
- estimate number
- aircraft tail number
- customer
- short description
- status
- age of estimate
- filters for draft / sent / approved / expired / rejected

## Estimate detail page
Must include:
- AI-generated estimate
- line items
- notes
- thread/history
- sent emails/messages
- reminders/follow-ups
- customer responses
- internal notes
- approval state

This should behave partly like a CRM thread tied to one estimate.

If customer replies by email or dashboard, record it in the estimate thread.

Allow:
- send reminder
- add follow-up
- add internal note
- mark approved manually
- convert to work order

---

# 13. Work order generation and work order redesign
Work order should be created from approved estimate, or manually if needed.

When generating the work order, AI should:
- read aircraft
- read operation context
- read squawks
- read estimate
- read notes
- generate work scope
- generate checklist
- generate line items
- suggest parts
- prepare plan of work

## Work order list
Show:
- WO number
- tail number
- customer
- short issue summary
- status
- percent complete
- due date
- assigned mechanic(s)

## Work order detail
This is the most important screen.

Design a clean, minimal work order workspace with:
- aircraft header
- tail number / make / model
- assigned mechanics
- owner
- due date
- progress percent
- clear status chips

### Statuses
- Draft
- Open
- In Progress
- Awaiting Parts
- Awaiting Approval
- Waiting for Customer
- Ready for Sign Off
- Closed
- Invoice Paid
- Archived

### Work order tabs/areas
Design tabs or segmented navigation for:
- Activity
- Line Items
- Parts
- Checklist
- AI Summary
- Owner View

---

# 14. Work order activity thread
The work order activity area should feel like a WhatsApp / iMessage / shared job thread for one aircraft job.

Participants:
- owner
- lead mechanic
- mechanic(s)
- IA / approving person
- shop staff as needed

Allow:
- message
- dictation
- note
- photo upload
- video upload
- log hours
- add part
- request approval
- ask owner question
- AI summarize

Everything should feel lightweight and conversational.

Important:
This activity thread should be the central collaboration layer.

---

# 15. Work order approvals and parts flow
Design approval flows for:
- extra hours
- extra work
- part approvals

Mechanic can request approval.
Lead mechanic or owner can approve depending on context.

Parts flow should support:
- part added
- part requested
- part approval pending
- part ordered
- owner will buy
- shop will buy
- from shelf inventory

Show these as elegant chips/cards inside the work order.

---

# 16. AI summary inside work order
Before closing work, mechanic can generate AI summary.

AI summary should:
- summarize all discussion
- summarize work completed
- summarize hours
- summarize parts used / ordered
- summarize approvals
- ask if anything is missing
- prepare final service report draft

Design this as a very clean review panel.

---

# 17. Invoice flow
Invoice may be created:
- from work order
- from line items
- manually without work order

Design full invoice workspace.

## Invoice list
Show:
- invoice number
- aircraft
- customer
- amount
- paid / unpaid / overdue / draft
- aging / delinquent days

## Invoice detail
Include:
- customer info
- linked aircraft
- linked work order if any
- labor items
- parts items
- rates
- total
- payment status
- share / email / print / PDF
- Stripe payment button

Owner should see invoices inside aircraft-level maintenance billing area and be able to pay there.

---

# 18. Logbook entry flow
Design a separate **Logbook Entries** section for mechanics.

Logbook entry can be created:
- from work order
- manually without work order

## From work order
AI reads:
- work order summary
- parts
- work performed
- approvals
- final notes

Then generates:
- editable maintenance logbook entry

Mechanic can:
- edit
- finalize
- sign digitally
- auto-fill name and certificate/license number from profile
- email/send
- share
- PDF/save

Once finalized:
- store in mechanic’s logbook entries section
- attach to the aircraft’s document structure automatically
- sync to owner’s aircraft records if owner is in system

## Manual logbook entry
Allow manual creation by selecting:
- aircraft / tail number
- work performed
- customer info if needed
- optional linked work order
- AI-generated draft from plain-English input

---

# 19. Owner aircraft maintenance visibility
Owners should have a simpler aircraft-level maintenance area that shows:
- open squawks
- active estimates
- active work orders
- approvals waiting
- invoices to pay
- final logbook entries / records received

This should feel clean and calm, not technical and overloaded.

---

# 20. Design deliverables
Create high-fidelity screens for all of the following:

## Aircraft / owner side
1. Aircraft onboarding flow
2. Aircraft overview dashboard
3. Reminders dashboard
4. Reminder detail / add custom reminder
5. Squawks list and squawk creation
6. Assignments / invite user / role permissions
7. Documents page adaptive by operation type
8. Intelligence page
9. Owner maintenance billing view

## Mechanic side
10. Mechanic dashboard
11. Mechanic aircraft view
12. Squawk-to-estimate flow
13. Estimate list + estimate detail thread
14. Work order list
15. Work order detail with activity/chat
16. Work order checklist / line items / parts / approvals
17. AI summary review screen
18. Invoice list + invoice detail
19. Logbook entry generation screen
20. Manual invoice / manual logbook entry flow

---

## Important design constraints
- keep everything minimal and cleaner than the current concept
- stronger hierarchy
- fewer visual distractions
- fewer oversized empty spaces
- simpler and more premium action bars
- aircraft-centered information architecture must be obvious
- do not make maintenance feel separate from aircraft
- AI should feel embedded and useful, not gimmicky
- design should clearly show synchronization between owner and mechanic views
- use realistic aviation sample data
- use realistic statuses, reminders, squawks, documents, and jobs
- make it feel like a serious aviation records + maintenance operating platform

The final output should look like a polished production-ready product concept for myaircraft.us.