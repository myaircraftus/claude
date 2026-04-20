Redesign and refine the current **myaircraft.us** mechanic and maintenance experience based on the existing concept screens.

## Important instruction
Do NOT redesign this from scratch.
This is a **refinement and correction pass** on the current product direction.

Preserve the existing design language and overall product identity:
- premium
- minimal
- aviation-grade
- modern SaaS
- blue / clean / enterprise styling
- calm professional layout
- less text-heavy
- highly organized

But improve the logic, clarity, functionality, and cleanliness of the flows.

The current design direction is becoming clearer, so now the goal is:
- make the mechanic portal smarter
- make aircraft/customer linking clearer
- make estimate creation actually functional
- make work order creation and work order layout much cleaner
- make the activity thread feel like a simple messaging app
- add missing logbook entry and invoice behaviors
- improve customer approval flow
- make parts and extra-hours approvals clearer
- make everything feel more polished, practical, and production-ready

---

# Core product principles to reflect

## 1. Aircraft-centered but mechanic-usable
The mechanic can also add aircraft.

When a mechanic adds an aircraft:
- he enters the tail number
- FAA / aircraft data is automatically pulled
- if the customer already exists in the system, it should suggest or auto-link that customer
- if customer is not already in the system, the mechanic should be able to create a new customer:
  - name
  - email
  - phone
- after adding customer, mechanic should have option:
  - invite customer to platform
  - keep customer as external/manual customer only

Design this aircraft-add flow clearly.

This is important:
The mechanic should be able to work both ways:
- with customers already in the platform
- with customers not yet in the platform

So the product must support both:
- fully connected internal workflow
- semi-manual outside customer workflow

---

## 2. Mechanic can add his own squawks
The mechanic portal currently shows incoming squawks, but it also needs a clear **Add Squawk** action.

Design a squawk creation flow where mechanic can:
- pick aircraft
- type issue in plain English
- dictate issue
- optionally add photo
- optionally add video
- AI structures the squawk automatically into:
  - title
  - category
  - severity
  - aircraft linkage
  - history item

This should feel very easy and lightweight.

The squawk queue should support both:
- customer-submitted squawks
- mechanic-added squawks

---

## 3. Estimates need to be fully functional
The estimate system must feel like a real working CRM + estimate generator.

### New estimate behavior
The **New Estimate** button must open an actual estimate flow.

Estimate can be created from:
- selected squawks
- manually
- from inside an aircraft
- from mechanic workflow directly

### Estimate creation experience
Design a better estimate creation flow:
- aircraft is selected
- customer is selected or linked
- selected squawks appear if applicable
- mechanic can type or dictate additional scope
- AI drafts estimate
- mechanic can edit labor lines
- mechanic can edit parts lines
- mechanic can add assumptions / notes
- valid-for period
- labor rate
- share/send options

### Estimate detail page improvement
The estimate page should not feel static.
It should behave like a thread-based estimate workspace.

The estimate detail should support:
- conversation / thread history
- internal notes
- customer-facing notes
- image/video attachment
- audio/dictation notes
- email/send action
- push to customer dashboard if customer exists in platform
- reminder scheduling
- reminder actions like:
  - remind in 3 days
  - 1 week
  - 2 weeks
  - custom follow-up

This should feel like a lightweight CRM embedded in the estimate.

### Estimate communication
Whenever note / update / reminder / send action occurs:
- it should be logged in estimate history
- if customer is in system, customer should receive it in dashboard
- customer should also get email
- estimate should support back-and-forth conversation history

---

## 4. Mechanic portal structure needs refinement
The current mechanic portal direction is good, but refine it.

Keep left navigation clean and minimal with:
- Dashboard
- Aircraft
- Squawks
- Estimates
- Work Orders
- Invoices
- Logbook Entries
- Customers
- Team

But improve the views so each section actually feels operational.

### Aircraft list in mechanic portal
Each aircraft card/list row should show:
- tail number
- make/model
- linked customer
- aircraft health / status tag
- count of open squawks
- count of active work orders
- recent activity
- click to open aircraft cockpit

### If no customer exists
Show subtle state:
- “Customer not linked”
- add customer
- invite customer

---

# Work order redesign — very important

## Goal
The work order must become much cleaner, more readable, less cluttered, and more message-driven.

The current work order is getting too busy and a little messy.
Clean it up.

## Important instruction
The work order should feel like:
- WhatsApp
- iMessage
- a clean collaborative service thread
- simple, neat, tidy
- but still structured and professional

It should NOT feel overloaded with too many competing sections at once.

---

## 5. Work order creation flow
The mechanic must be able to create a work order from:
- approved estimate
- selected squawks
- manual complaint entry
- inside an aircraft
- maintenance section
- mechanic portal

### Work order creation behavior
If aircraft already has:
- squawks
- estimate
- customer
then the work order should intelligently pull relevant info in.

If not, it should still work from plain-English complaint input.

### Creation UI
Design a smarter work order creation modal / panel:
- aircraft selector
- customer auto-linked or add/select customer
- source estimate if any
- source squawks if any
- customer complaint / work requested
- dictation option
- AI prepares initial work order scope

This must feel more intelligent than a plain blank modal.

---

## 6. Work order detail — clean up and simplify
Refine the work order page heavily.

### Remove clutter
Inside the work order page, do NOT clutter the top with unnecessary duplicate commercial tabs that belong elsewhere.

The work order page should feel like:
- one clear work order
- one clean thread
- one clean progress/status area
- one simple action bar

Avoid making it feel like mini-estimates and mini-invoices are crowding the same screen in a messy way.

### Work order header should include only the essentials
- WO number
- aircraft tail number
- make/model
- customer name
- assigned mechanic(s)
- status
- progress %
- due date
- total logged hours
- clean primary actions

Primary actions:
- notify customer
- AI summary
- create invoice
- generate logbook entry
- close work order

---

## 7. Work order tabs / sections
Refine the tabs to be clearer and complete.

The work order should include these tabs:
- Activity
- Line Items
- Media
- AI Summary
- Owner View
- Logbook Entry
- Invoice

These should feel like clean segmented tabs, not cramped navigation.

### Important behavior
- Logbook Entry tab should open/work from this work order context
- Invoice tab should open/work from this work order context
- both should inherit aircraft, customer, and work order data automatically

---

## 8. Activity thread must feel like messaging
This is one of the most important refinements.

The activity section should feel like a clean chat / service thread.

### Thread content types
Support:
- note
- internal note
- customer-visible update
- status change
- hours logged
- part requested
- part ordered
- part approved
- photo uploaded
- video uploaded
- approval request
- AI summary message
- system events

### Composer redesign
Instead of too many separate hard buttons, make the composer cleaner.

Use a messaging-style composer with:
- text box
- dictation / mic
- plus button for attachments/actions

The **plus button** should open a neat action menu like WhatsApp/iMessage.

Actions under plus:
- add note
- log hours
- upload photo
- upload video
- add part
- request part
- request approval
- start timer
- stop timer

Keep it elegant and simple.

---

## 9. Hours logging / timer flow
The work order needs both:
- manual hour entry
- timer mode

Design this clearly.

Mechanic should be able to:
- start timer
- stop timer
- manually log hours
- categorize hours
- have hours reflected in thread and AI summary

This should be easy and visible, not hidden.

---

## 10. Parts flow redesign
The parts behavior needs to be clearer.

### Add Part action
When mechanic clicks add part, show two clear options:
1. Search part
2. Add part manually

### Search part path
If mechanic chooses search part:
- open part search UI
- search external connected source / catalog / Google-shopping-like search
- return results
- allow user to add selected part into job
- store into parts library for this work order

### Manual add path
If manual:
- part number
- description
- qty
- unit cost
- notes
- source / shelf / external / owner-supplied

### Parts states
Design parts state logic clearly:
- requested
- awaiting approval
- approved
- ordered
- added from shelf
- owner will purchase
- shop will purchase
- installed

### Approval flow
If owner approval is needed:
- owner should receive approval card
- can approve / reject
- should see exactly what is being requested

---

## 11. Extra hours / extra work approval flow
Customer view needs to be more dynamic.

If mechanic or lead mechanic adds:
- extra hours
- extra labor scope
- extra parts
- additional work
owner should receive a proper approval request.

Design approval cards in customer-safe view for:
- approve
- reject
- ask question

These approval requests should be very visible and easy to understand.

The owner view must not just be a static summary.
It should be an active approval / update surface.

---

## 12. AI summary and close-work-order flow
Design the close-work-order flow more carefully.

### Proposed sequence
1. mechanic clicks close work order
2. system requires AI summary review
3. AI summarizes full thread:
   - work completed
   - parts used
   - parts ordered
   - approvals
   - total hours
   - recommended line items
   - recommended customer update
4. mechanic can:
   - edit summary
   - dictate final notes
   - add missing details
5. if there is a head mechanic workflow:
   - summary goes for approval
   - head mechanic approves / edits / sends back
6. final close work order
7. line items finalize
8. create logbook entry
9. create invoice

Design this as a clean step-by-step closure flow.

If same person is both mechanic and approver, still support the sequence cleanly without making it confusing.

---

## 13. Line items behavior after close
Once work order is being finalized:
- line items should be surfaced clearly
- AI-prepared line items should appear
- mechanic or head mechanic can edit them
- rates / hours / parts should be visible
- accepted final billable structure should be confirmed before invoicing

Design this so it can happen:
- inside a review panel in the activity flow
- and also in the dedicated Line Items tab

Both should feel synchronized, not duplicated.

---

## 14. Logbook entry behavior from work order
This is missing and important.

### Work order to logbook entry
When user opens Logbook Entry from work order:
- aircraft is already known
- work order context is already known
- AI summary is already known
- AI should prepare a recommended maintenance logbook entry
- suggest if this relates to:
  - annual
  - 100-hour
  - return to service
  - corrective maintenance
  - inspection item
  - etc.

### Logbook entry page should support
- editable AI draft
- free manual edit
- signature area
- auto-fill mechanic identity
- auto-fill certificate/license info from profile
- save
- share
- email
- print
- download PDF
- send and save

### Send and save behavior
When mechanic clicks send and save:
- email customer
- save to customer-side record/logbook area
- save in mechanic-side logbook entry list
- attach into aircraft documents / aircraft logbook area

This should be very explicit in the UI.

---

## 15. Invoice behavior from work order
The invoice flow needs to work the same way.

When user creates invoice from work order:
- line items auto-populate
- customer and aircraft are already linked
- labor and parts come in automatically
- user can edit before finalizing

Invoice page must support:
- email
- share
- print
- PDF
- mark paid manually
- Stripe payment button
- alternate payment tracking

### Manual payment behavior
If payment came outside platform:
- mechanic/admin can mark paid manually

### If customer is on platform
Customer should receive:
- invoice in dashboard
- email copy
- pay button
- status updates

---

## 16. Manual invoice and manual logbook entry still need to exist
Mechanic should also be able to create:
- standalone invoice
- standalone logbook entry
- standalone work order

Even if:
- customer is not in system
- aircraft was not fully linked before
- workflow started outside platform

Design these flows so the mechanic can still work flexibly.

For manual flow:
- select/add aircraft
- select/add customer
- optionally invite customer
- optionally link to work order
- otherwise proceed manually

This is important:
The platform should support both:
- fully connected internal workflow
- practical real-world partial workflow

---

## 17. Customer area / customer experience
Refine the customer-facing behavior.

Customer should be able to receive:
- estimate
- work order updates
- approval requests
- invoice
- logbook entry
- final records

Customer dashboard should support:
- open/update estimate thread
- approve/reject
- view work order progress
- approve extra work/hours/parts
- pay invoice
- view/download logbook entry
- print records if needed

---

## 18. Keep what is already working
Do not discard the good direction already present.

Keep and improve:
- split-pane navigation
- clean left portal navigation
- aircraft list in mechanic portal
- estimate split-pane idea
- invoice split-pane idea
- AI estimate creator side panel concept
- owner view idea
- AI summary card idea
- progress bars
- status chips
- premium aviation dashboard feel

But make it:
- clearer
- more functional
- less cluttered
- more complete
- more elegant

---

## 19. Screens to generate / refine
Generate polished refined versions of these screens:

### Mechanic portal
1. Aircraft list with add-aircraft flow
2. Add aircraft modal with customer-link/add-customer/invite-customer logic
3. Squawk queue with add squawk action
4. Add squawk modal with AI structuring
5. AI estimate creator
6. Estimate list + estimate thread/CRM detail
7. Work order list
8. Refined work order detail with cleaner WhatsApp/iMessage-style activity thread
9. Parts add/search flow
10. Approval flow cards inside work order
11. AI close-work-order / summary review flow
12. Line item finalization flow
13. Work-order-based logbook entry page
14. Work-order-based invoice page
15. Manual invoice flow
16. Manual logbook entry flow

### Customer side
17. Dynamic owner/customer view of work order
18. Approval cards for extra work/hours/parts
19. Invoice received / pay flow
20. Logbook entry received / save / print flow

---

## 20. Visual quality requirements
Make the refined UI:
- cleaner than current
- tidier than current
- more minimal
- more premium
- better aligned
- fewer redundant bars and controls
- fewer confusing tabs
- more elegant activity thread
- more obvious primary actions
- more production-ready
- clearly synchronized between mechanic and customer

### Work order specifically
The work order must look:
- neat
- simple
- tidy
- readable
- messaging-driven
- operationally clear
- not dirty
- not crowded
- not overcomplicated

Think:
“aviation maintenance operations in a clean iMessage / WhatsApp style workspace”

---

## 21. Final instruction
Use the current concept as the base.
Do a refinement pass that improves logic, interaction, completeness, and cleanliness.

Preserve the brand and overall style.
Do not flatten it into generic enterprise software.
Make it feel like a polished, intelligent aircraft maintenance operating system for real mechanics and aircraft owners.