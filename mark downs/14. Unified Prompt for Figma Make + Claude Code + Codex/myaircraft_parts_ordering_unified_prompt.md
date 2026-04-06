# myaircraft.us — Unified Prompt for Figma Make + Claude Code + Codex

Use this prompt as the **single source of truth** for the next UI/UX and product wiring pass.

I am also attaching the latest screenshots zip. **Study the zip first** and preserve the current information architecture, workflows, and core logic. Do **not** break or replace working flows. This is a **targeted but premium overhaul** that keeps the current app structure and makes everything cleaner, more visual, more connected, and more realistic.

---

## 1) Core instruction

Rework the current myaircraft.us app so it feels like a modern, premium, aviation-first records and maintenance platform.

### Keep this existing top-level navigation exactly:
- Dashboard
- Workspace
- Aircraft
- Ask
- Documents
- Maintenance
- Settings

Do **not** change the main logic of the product. The goal is to:
- keep the same flow,
- clean up the UI,
- reduce visual confusion,
- make actions easier to understand,
- add stronger workspace-to-maintenance wiring,
- and introduce a fully connected **online part ordering workflow**.

This should feel closer to a polished aviation SaaS product: clean, premium, calm, practical, image-supported where useful, and highly task-oriented.

---

## 2) Main feature to add now: Online Part Ordering

Inside **Maintenance**, add a robust **Online Part Ordering** capability.

This should be designed as if the app will connect later to:
- ChatGPT Atlas, and/or
- a browser/search automation layer,
- and later external supplier APIs.

For now, design and structure the experience so the backend can be connected later. Treat Atlas/browser/API as the future search engine behind the scenes.

### Intent
A mechanic or user should be able to:
1. identify a part from aircraft context, manual/catalog context, or chat/workspace context,
2. view the probable part number,
3. inspect part detail with image and compatibility,
4. search live online availability,
5. compare vendors,
6. filter by cheapest / fastest / closest / preferred supplier,
7. order or mark for ordering,
8. attach the ordered part directly to a work order,
9. reflect that part order across the workspace, catalog, and maintenance sections automatically.

---

## 3) Product logic that must be wired

### A. Part discovery from anywhere
A user can start from any of these entry points:
- Maintenance > Parts
- Workspace command bar
- Aircraft detail page
- Ask/chat interface
- Catalog/manual/IPC-style part lookup flow
- Work order detail page

Examples of user intent:
- “Find me the part number for this wing component.”
- “Order brake pads for this aircraft.”
- “Show available vendors for this part number.”
- “Attach this ordered part to Work Order #WO-1042.”
- “Search a replacement alternator for N123AB.”

### B. Workspace command behavior
In the **Workspace top action bar**, add an action such as:
- Order a Part

When clicked, it should open a structured flow inside the workspace panel / side panel / modal.

Also allow natural language entry in workspace/chat such as:
- order a part
- find part number
- search by serial / IPC / description
- attach to work order

### C. Part lookup behavior
If the user is asking from aircraft context, the system should use available aircraft context first:
- selected aircraft,
- selected section/system,
- current maintenance issue,
- related manual/catalog page,
- recent work order,
- previously used parts.

The flow should prefer:
1. aircraft context,
2. parts catalog / illustrated parts catalog / manual context,
3. known historical/internal part records,
4. online lookup.

### D. Part detail state
When a part is found, show a **Part Detail card / drawer** with:
- part number
- description
- aircraft compatibility
- manufacturer / PMA / alternate part references if available
- image thumbnail
- stock / availability status
- estimated lead time
- price range
- vendor list
- tags like OEM / PMA / Overhauled / New / Used / Exchange
- CTA buttons:
  - Search Online
  - Compare Vendors
  - Add to Work Order
  - Add to Parts Order
  - Save to Catalog

### E. Online vendor comparison
When the user clicks order/search, the app should present an online comparison view designed for future dynamic search.

Show vendor cards/table with fields like:
- vendor name
- price
- condition
- availability
- ETA / shipping speed
- location
- certification/trace notes
- supplier rating / trust score
- preferred vendor tag
- order CTA

### F. Filters that must exist
- Cheapest
- Fastest
- Closest location
- Preferred supplier
- In stock only
- Condition
- Certification / trace docs available
- Shipping time
- New / overhauled / used / exchange

### G. Attach to work order
When a user decides to order or mark a part, they must be able to:
- attach it to an existing work order,
- create a new work order,
- attach it to a pending maintenance issue,
- or keep it in a “needs approval / pending order” state.

Once attached, show:
- part ordered status,
- PO/request status,
- vendor,
- expected arrival,
- linked work order,
- linked aircraft,
- linked maintenance task,
- quantity,
- cost,
- requested by / approved by.

### H. Cross-module syncing
This is critical.

If a part is ordered from **Workspace**, it must also show up in:
- Maintenance > Parts
- relevant Work Order
- aircraft-specific maintenance history if attached
- catalog / saved parts references
- pending items / reminders if not yet received

If a part is added from **Maintenance > Parts**, it should also be accessible from:
- Workspace
- Ask/chat
- work order context
- aircraft detail pages

Everything should feel like **one connected system**, not separate screens.

---

## 4) New UI screens / states to design

Keep the current architecture but add/refine the following.

### Maintenance > Parts (upgrade existing)
Transform the current parts screen into a stronger command center with:
- top summary cards:
  - Open Part Requests
  - Ordered This Week
  - Waiting for Arrival
  - Attached to Work Orders
  - Total Parts Spend
- table/list with rows for each part request/order
- row statuses such as:
  - Draft
  - Needs Review
  - Ready to Order
  - Ordered
  - Shipped
  - Delivered
  - Attached to Work Order
  - Closed
- quick filters and segmented tabs:
  - All
  - Requests
  - Ordered
  - Pending Arrival
  - Attached
  - Archived
- CTA buttons:
  - New Part Request
  - Search Online
  - Import Part Number
  - Attach to Work Order

### New view: Part Search / Comparison
A dedicated search results layout showing:
- left filter rail
- central result list/table/cards
- right detail preview for selected vendor/part
- ability to compare 2–4 suppliers side by side

### New view: Part Detail Drawer
Open from any part row or part number click.
This drawer should show:
- image
- part metadata
- aircraft compatibility
- vendor options
- order timeline
- related work orders
- notes
- sourcing history
- action buttons

### New view: Create / Add to Work Order
From any part result, open a compact workflow:
- choose work order
- quantity
- urgency
- reason / squawk
- expected install date
- approval state
- save

### Workspace enhancement
In the workspace top bar add actions like:
- Ask AI
- Prepare Entry
- Create Work Order
- Order a Part
- Find Part Number

When **Order a Part** is launched from workspace, the experience should keep workspace context and not feel like jumping to a totally unrelated module.
Use a side panel, overlay, or split-view workflow.

---

## 5) Ask / AI behavior to support part ordering

Inside Ask / Workspace / Aircraft AI context, support these flows:
- identify a part from plain-English description
- find likely part number from aircraft and system context
- show supporting catalog/manual source
- preview part image if available
- ask: “Do you want to order this part?”
- if yes, open vendor search/comparison
- ask whether to attach to work order
- if work order exists, suggest relevant one(s)
- if no work order exists, allow creation inline

### Example conversational sequence
1. User: “Find me the part number for the left wing inspection panel latch.”
2. System identifies likely part.
3. Show part card with image and source confidence.
4. Prompt: “Do you want to order this part?”
5. User says yes.
6. System shows vendor comparison.
7. User chooses cheapest or fastest.
8. System asks: “Attach to work order?”
9. User picks existing pending work order.
10. System updates part orders, work order, and maintenance records.

This logic must be reflected visually in the UI.

---

## 6) Important backend-ready logic notes for engineering

Design with these future connection assumptions:
- Atlas / browser automation / supplier APIs will power live search.
- Supplier results may be normalized into a common structure.
- The UI must support asynchronous states:
  - searching
  - partial matches
  - no exact match
  - substitutes found
  - vendor unavailable
  - approval required
  - order failed / retry
- There should be internal object relationships:
  - aircraft
  - part
  - part_request
  - vendor_result
  - purchase_order / order_reference
  - work_order
  - maintenance_entry

### Suggested object relationships
- A **part request** may originate from chat/workspace/manual/work-order.
- A **vendor result** belongs to a part request.
- An **ordered part** can be linked to one or more work orders.
- A **work order** can contain multiple ordered parts.
- A **part** should have both catalog identity and purchasing state.

---

## 7) UX rules

### General
- Less text, more hierarchy.
- Keep information dense but visually calm.
- Use cards, segmented controls, status pills, side drawers, and action bars.
- Prioritize what a mechanic needs now.
- Use clean empty states and clear next actions.
- Make it obvious what is searchable, what is ordered, and what is attached.

### Visual tone
- Premium, aviation SaaS, operational, trustworthy.
- Clean whites, soft neutrals, structured spacing.
- Preserve current brand direction unless the provided screenshots imply a refined palette.
- Avoid clutter and oversized paragraphs.
- Use more visual structure than raw text blocks.

### Table behavior
For maintenance and parts tables:
- sticky headers
- status chips
- quick sort
- bulk actions
- row click opens detail drawer
- inline quick actions for attach / search / order / mark received

### Mobile/responsive thought
Even if desktop-first, structure components so they can stack later.

---

## 8) Specific dashboard/workspace coordination to preserve

Current login/dashboard/app flow should stay intact.
Do not disturb the main structure.

Use the current app sections from the screenshots and preserve the same core flow:
- Dashboard
- Workspace
- Aircraft
- Ask
- Documents
- Maintenance
- Settings

### Important note
This is **not** a total product rewrite.
This is a **refined overhaul**:
- preserve working logic,
- keep the same navigation,
- improve clarity,
- make actions more obvious,
- and wire the new part ordering flow through the existing ecosystem.

---

## 9) Figma-specific output instruction

For the Figma version, focus on **UI/UX validation**.

Create or revise frames for:
1. Maintenance > Parts upgraded main page
2. Workspace with “Order a Part” action active
3. Part Search / Compare Vendors screen
4. Part Detail drawer
5. Attach to Work Order modal/flow
6. Part ordered state reflected inside linked work order
7. Cross-module state examples showing same part in workspace + maintenance + work order context

### Figma design goal
Make it immediately understandable from visuals alone:
- where the part came from,
- what the part is,
- whether it is available,
- where to order it,
- whether it is already attached to a work order,
- and where the user goes next.

Use realistic aviation/parts terminology and clean enterprise SaaS patterns.

---

## 10) Claude Code / Codex implementation instruction

Implement the UI overhaul using the **existing app structure** and current routes/components where possible.

### Do not break:
- current navigation
- current data relationships already implemented
- current workspace behavior unless enhancing it
- current maintenance flows

### Do:
- refactor the UI into cleaner reusable components
- add new parts ordering states and components
- wire shared state across workspace, maintenance parts, and work orders
- keep the logic modular so future live integrations can plug in cleanly

### Build these shared components
- PartRequestCard
- PartSearchCommand
- VendorComparisonTable
- PartDetailDrawer
- AttachToWorkOrderModal
- PartStatusBadge
- SupplierFilterBar
- OrderedPartTimeline
- LinkedObjectsPanel

### Shared state / architecture intent
A part request created from workspace should immediately be readable by:
- maintenance parts page
- work order module
- aircraft context
- ask/chat history

This can be local mocked state for now if backend is incomplete, but structure it as if it will later connect to real APIs.

---

## 11) Suggested statuses and labels

### Part request statuses
- Draft
- Identified
- Ready to Source
- Sourcing
- Options Found
- Awaiting Approval
- Ordered
- Shipped
- Delivered
- Received
- Attached to Work Order
- Installed
- Closed

### Priority labels
- AOG
- Urgent
- Routine
- Deferred

### Source labels
- Workspace
- Ask
- Aircraft Detail
- Work Order
- Catalog
- Manual Lookup
- Historical Match
- Online Search

---

## 12) Empty states and edge cases

Design for:
- no exact part match found
- multiple likely part matches
- no vendors in stock
- substitute part available
- manual approval required
- part already ordered recently
- part linked to multiple aircraft/work orders
- missing aircraft context
- user starts from generic chat with no aircraft selected

When no aircraft is selected, prompt intelligently:
- Select aircraft
- Continue with generic part search
- Search by part number only

---

## 13) Microcopy direction

Tone should be practical, calm, and assistant-like.

Examples:
- “We found 3 likely matches.”
- “Best price available from 4 vendors.”
- “Fastest delivery arrives tomorrow.”
- “This part is already attached to WO-1042.”
- “Do you want to add this to a work order?”
- “No exact match found. Try a broader search or review alternate parts.”

---

## 14) What to study from attachments before changing anything

Study the attached screenshots zip first.
Maintain the current skeleton and routes.
Use the screenshots to understand:
- current dashboard structure
- workspace interaction pattern
- maintenance tabs and pages
- aircraft detail pattern
- overall spacing, sidebar, and top-level app shell

Then layer the new premium part-ordering system into that existing product logic.

---

## 15) Final instruction

Deliver this as a **clean, connected, premium update** to the current myaircraft.us product.

This should feel like:
- one system,
- one workflow,
- one source of truth,
- with parts ordering fully connected to maintenance, workspace, and work orders.

Preserve the current navigation and core logic.
Enhance the UI heavily.
Add the part ordering workflow thoroughly.
Make every part-related action visible, understandable, and connected.

