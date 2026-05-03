# aircraft.us — Claude Code Implementation Spec

_Build aircraft.us into the Tesla/Apple of aviation maintenance: AI-first, telemetry-synced, multi-location, persona-aware. **50 features across 10 phases (0, 1, 2, 2.5, 2.6, 3, 4, 5, 6, 7).**_

## The product thesis (read this before anything else)

> **Less app, more outcome.** The user shouldn't have to log a meter reading, write a work order, or check if a cert is expiring. The system already knows. The user just confirms the AI's suggestion or barks a voice command. Like a Tesla — most of what the car needs to do, it just does. The owner taps to confirm.

Three ideas everything else flows from:

1. **Tach time should never be typed.** It comes from Airbly hardware (best), FlightSchedule Pro (good), or ADSB inference (fallback) — automatically. A user typing meter readings is a failure of the system.
2. **The AI is the home screen.** Instead of a dashboard of widgets, you see a stack of action cards — "Annual due in 14 hours of flight", "Insurance expires in 30 days", "Compression trending down on cylinder 3". Tap → done.
3. **One app, three personas.** Owner / Mechanic / Shop. Same data, different surfaces. The AI knows which persona is logged in and shows only what matters to them.

Everything below is engineered to that bar.

## Read this first

**Existing codebase facts (don't fight them):**
- React 18 + TypeScript + Tailwind v4 + Motion + Lucide + Sonner.
- Routing in `/src/app/routes.tsx`. App shell in `/src/app/components/AppLayout.tsx`.
- Global state in `/src/app/components/workspace/DataStore.tsx` (Context + localStorage).
- All entities follow same shape: `id`, `createdAt`, `updatedAt`, plus `addX/updateX/deleteX` functions.
- localStorage keys: `myaircraft_workspace_data_v1_*`.

**Implementation rules for every feature below:**
1. **Add, don't replace.** Every new entity is a new type + new DataStore methods + new route. Don't modify existing types unless explicitly noted.
2. **Follow the existing pattern exactly:** `addX(payload) → returns X with auto-generated id/createdAt/updatedAt`, `updateX(id, patch)`, `deleteX(id)`.
3. **One new localStorage key per entity:** `myaircraft_workspace_data_v1_<entity>`.
4. **Routes go under `/app/...`** in `routes.tsx`. Add to `navItems` in `AppLayout.tsx` only if user-facing.
5. **No backend yet** — keep all data in localStorage. Mark TODOs where backend is needed.
6. **Reuse existing UI primitives:** card containers (`rounded-xl border border-[--border] bg-white`), motion fade-ins, Sonner toasts for success/errors, Lucide icons.

---

# PHASE 0 — Architectural Foundations (do these BEFORE anything else)

These four cross-cutting capabilities go in first because every later feature depends on them. Building them up front means we don't refactor 17 modules later.

---

## Feature 0.1 — Multi-Location & Multi-Org data model

**Why:** Owners with multiple aircraft at multiple airports/hangars. Shops with multiple bases. Without this baked in from sprint 1, you'll do an enormous migration later.

**Types to add to `DataStore.tsx`**

```typescript
interface Organization {
  id: string
  name: string
  type: "owner" | "shop" | "flight-school" | "fbo" | "operator"
  homeBase: string                // ICAO/IATA airport code
  billingEmail: string
  stripeCustomerId?: string
  plan: "free" | "starter" | "pro" | "enterprise"
  createdAt: string
}

interface Location {
  id: string
  orgId: string
  name: string                    // "KAPA Hangar 14"
  airportCode: string             // "KAPA"
  type: "hangar" | "tie-down" | "ramp" | "shop" | "office"
  address: string
  parentLocationId?: string       // hierarchy: airport → hangar → bay
  createdAt: string
}

interface Membership {
  id: string
  userId: string
  orgId: string
  role: "owner" | "admin" | "manager" | "mechanic" | "tech" | "viewer"
  persona: "owner" | "mechanic" | "shop"   // drives UI
  createdAt: string
}
```

**Universal change to every existing entity:**
Add **`orgId: string`** and **`locationId?: string`** to every entity (Aircraft, WorkOrder, Invoice, LogbookEntry, Customer, Document, every Phase 1–3 type). Persistence keys change to include `orgId`:

```
myaircraft_workspace_data_v1_<orgId>_<entity>
```

**Routes**
- `/app/locations` — list, create, edit
- `/app/org/switch` — org switcher modal
- Every list view auto-filters by current org + (optionally) current location.

**Acceptance**
- User belongs to two orgs, switches between them, sees completely different data. Within an org, can filter every list view by location.

---

## Feature 0.2 — Persona system (Owner / Mechanic / Shop)

**Why:** Same app, three radically different UIs. An owner shouldn't see W/O profitability. A mechanic shouldn't see lease agreements. The persona is set on the Membership and drives navigation, dashboards, defaults, and AI prompts.

**Implementation**

```typescript
// /src/app/persona.ts
export type Persona = "owner" | "mechanic" | "shop"

export const PERSONA_CONFIG: Record<Persona, PersonaConfig> = {
  owner: {
    homeRoute: "/app/my-aircraft",
    sidebarSections: ["MY AIRCRAFT", "DOCUMENTS", "MAINTENANCE", "FINANCES"],
    hiddenModules: ["work-orders-financials", "labor-rates", "shop-pricing"],
    aiSystemPrompt: "You are an AI co-pilot for an aircraft owner. Speak in plain English. Translate maintenance jargon. Surface upcoming items, costs, and compliance.",
    homeCardPriorities: ["expiring-docs", "upcoming-compliance", "open-squawks", "next-flight"],
  },
  mechanic: {
    homeRoute: "/app/my-day",
    sidebarSections: ["MY DAY", "WORK ORDERS", "INSPECTIONS", "PARTS", "TOOLS"],
    hiddenModules: ["org-billing", "owner-finances"],
    aiSystemPrompt: "You are an AI assistant for an A&P mechanic. Be technically precise. Reference FARs, ADs, SBs. Suggest next steps.",
    homeCardPriorities: ["assigned-wos", "tool-calibrations-due", "shift-status", "expiring-certs"],
  },
  shop: {
    homeRoute: "/app/dashboard",
    sidebarSections: ["DASHBOARD", "WORK ORDERS", "SCHEDULING", "PARTS", "INVOICING", "REPORTS", "ADMIN"],
    hiddenModules: [],
    aiSystemPrompt: "You are an AI operations manager for an aviation maintenance shop. Optimize for throughput, profitability, and compliance.",
    homeCardPriorities: ["overdue-wos", "today-shifts", "low-stock-parts", "pending-approvals", "kpis"],
  },
}
```

Use `usePersona()` hook everywhere. Sidebar, AppLayout, ChatWorkspace, all read from this config.

**Acceptance**
- Same user with three Memberships in three orgs sees three different UIs without any code branching beyond `usePersona()`.

---

## Feature 0.3 — AI Orchestration foundation (the brain)

**Why:** This is the differentiator. Every feature plugs into the AI brain rather than being a standalone form-filler. Build the brain first.

**Architecture**

```
┌─────────────────────────────────────────────────┐
│  Action Cards (Home Screen)                     │
│  ↑                                              │
│  AI Orchestrator (background worker + LLM)      │
│  ↑                                              │
│  Signals (events from every module)             │
│  ↑                                              │
│  Tools (typed function calls AI can invoke)     │
└─────────────────────────────────────────────────┘
```

**Files to create**

```
/src/app/ai/AIOrchestrator.ts           // background loop that watches signals
/src/app/ai/AISignals.ts                // event bus
/src/app/ai/AITools.ts                  // function tools the LLM can call
/src/app/ai/AIPromptLibrary.ts          // versioned prompts per task
/src/app/ai/ActionCard.tsx              // home-screen card component
/src/app/ai/AIInbox.tsx                 // stack of action cards
/src/server/ai/                         // backend (Anthropic/OpenAI integration)
```

**Types**

```typescript
interface AISignal {
  id: string
  type: "meter-reading" | "wo-closed" | "doc-uploaded" | "compliance-due"
        | "low-stock" | "tool-overdue" | "approval-response" | "anomaly"
  orgId: string
  payload: Record<string, unknown>
  timestamp: string
}

interface ActionCard {
  id: string
  orgId: string
  persona: Persona
  priority: "urgent" | "high" | "normal" | "low"
  category: "compliance" | "expiration" | "maintenance" | "approval" | "anomaly" | "insight"
  title: string                        // AI-generated, plain English
  body: string                         // 1-2 sentence explanation
  evidence: string[]                   // why the AI thinks this matters
  suggestedActions: SuggestedAction[]  // tap-to-do
  confidence: number                   // 0-1
  source: "rule" | "llm" | "ml"
  createdAt: string
  dismissedAt?: string
  resolvedAt?: string
}

interface SuggestedAction {
  label: string                        // "Schedule annual"
  toolCall: { tool: string; args: Record<string, unknown> }
  destructive?: boolean
}

interface AITool {
  name: string                         // "createWorkOrder"
  description: string
  paramsSchema: object                 // JSON schema
  handler: (args: any, ctx: AIContext) => Promise<unknown>
  permissions: Persona[]               // who can invoke
}
```

**Available tools** (each is a typed function the LLM can call)

| Tool | Purpose |
|---|---|
| `createWorkOrder` | Build a WO from natural language |
| `addMeterReading` | Log a meter reading |
| `searchParts` | Find parts in inventory or external |
| `addPartToWorkOrder` | Add part line to a WO |
| `createInspection` | Spin up an inspection from a procedure |
| `signLogbookEntry` | Generate a logbook entry |
| `markComplianceComplete` | Close a compliance item |
| `sendApprovalRequest` | Email customer with approval link |
| `getAircraftStatus` | Read all current state for one tail |
| `predictNextDue` | ML prediction: when will item X be due based on flight rate |
| `analyzeCompressionTrend` | ML on cylinder readings |
| `summarizeMaintenanceHistory` | LLM summary for a given period |

**Orchestrator loop (runs every minute):**
```
1. Drain new signals
2. For each signal, look up rule-based matches → emit ActionCard
3. Every 10 minutes, run LLM pass over recent signals → emit insight ActionCards
4. Every hour, run ML predictions → emit anomaly cards
5. Dedupe + prioritize
6. Push to user's AI Inbox
7. Mark dismissed/resolved cards as such
```

**Backend required.** Mark TODO clearly. Frontend just renders ActionCards from a synced state.

**Acceptance**
- Logging a meter reading triggers a signal. Within seconds an ActionCard appears: "Annual inspection due in 18 hours of flight at your current rate (about 12 days)." Tap → opens WO creation pre-filled.

---

## Feature 0.4 — Notification system (in-app + email + push)

**Why:** Reminders, expirations, AI cards, approval responses — all need a single notification pipeline.

**Types**

```typescript
interface Notification {
  id: string
  orgId: string
  userId: string
  channel: "in-app" | "email" | "push" | "sms"
  category: string                     // matches ActionCard category
  title: string
  body: string
  link: string                         // deep link in app
  read: boolean
  sentAt: string
  readAt?: string
}

interface ReminderSpec {
  offset: string                       // "30 days before", "1 day after"
  channels: ("in-app" | "email" | "push" | "sms")[]
}
```

**Implementation**
- Centralized `NotificationCenter` (header bell badge).
- Settings → Notifications: per-category channel preferences.
- TODO backend: SendGrid for email, Web Push for browser, Twilio for SMS (Pro tier).

**Acceptance**
- A document's expiration reminder fires at 30 days, 14 days, 7 days. User receives in-app + email per their preferences. Read state syncs.

---

# PHASE 1 — Aviation Foundation

## Feature 1.1 — Meter Profiles & Aircraft Times

**Why:** Every aviation maintenance event is driven by hours/cycles, not just calendar. Meters are the input.

**Files to create**

```
/src/app/components/meters/MetersPage.tsx           // route /app/meters
/src/app/components/meters/MeterProfileForm.tsx     // create/edit profile
/src/app/components/meters/MeterReadingForm.tsx     // log a reading
/src/app/components/meters/AircraftMeterPanel.tsx   // embed in AircraftDetail
```

**Types to add to `DataStore.tsx`**

```typescript
interface MeterProfile {
  id: string
  name: string                    // e.g. "Piston Single", "Turbine"
  meters: MeterDef[]
  createdAt: string
  updatedAt: string
}

interface MeterDef {
  id: string
  name: string                    // "Hobbs", "Tach", "Cycles"
  unit: string                    // "hours", "cycles", "landings"
  decimalPlaces: number           // 1, 2, 0
}

interface MeterReading {
  id: string
  aircraft: string                // tail number
  meterDefId: string              // which meter from the profile
  value: number
  date: string                    // ISO date the reading was taken
  source: "manual" | "automatic" | "imported"
  recordedBy: string              // user
  createdAt: string
  updatedAt: string
}
```

**DataStore changes**
- Add `meterProfiles`, `meterReadings` state.
- Add `addMeterProfile / updateMeterProfile / deleteMeterProfile`.
- Add `addMeterReading / updateMeterReading / deleteMeterReading`.
- Add helper `getCurrentMeterReading(aircraft, meterDefId): number | null`.
- Aircraft entity gains an optional `meterProfileId: string` field.

**Routes**
- `/app/meters` → MetersPage (list of meter profiles)

**Integration with existing code**
- `AircraftDetail.tsx`: add an "Aircraft Times" tab that renders `AircraftMeterPanel` (current meter values + edit + history list).
- Update `LogbookEntry` interface: keep `totalTime/hobbs/tach` (back-compat) but new entries should auto-fill from `getCurrentMeterReading()`.

**Acceptance**
- User can create a meter profile, assign it to an aircraft, log readings, edit historical readings, and see history.

---

## Feature 1.2 — Compliance / Maintenance Tracking

**Why:** Recurring inspections (Annual, 100hr, ADs, life-limited parts). The MRO loop.

**Files to create**

```
/src/app/components/compliance/CompliancePage.tsx           // route /app/compliance — list + due list
/src/app/components/compliance/ComplianceItemForm.tsx       // create/edit item
/src/app/components/compliance/ComplianceDueList.tsx        // upcoming items per aircraft
/src/app/components/compliance/AircraftCompliancePanel.tsx  // embed in AircraftDetail
```

**Types to add**

```typescript
interface ComplianceItem {
  id: string
  aircraft: string                // tail
  title: string                   // "Annual Inspection", "ELT Battery"
  itemType: "inspection" | "component"
  source: "AD" | "SB" | "Manufacturer" | "Custom" | "Life-Limited"
  intervalCalendarMonths?: number
  intervalHours?: number
  intervalCycles?: number
  // Whichever-comes-first logic: if multiple are set, due is min(all)
  toleranceCalendarDays?: number  // grace period
  toleranceHours?: number
  lastCompletedDate?: string      // ISO
  lastCompletedHours?: number     // value at last completion
  lastCompletedCycles?: number
  nextDueDate?: string            // computed
  nextDueHours?: number           // computed
  nextDueCycles?: number          // computed
  status: "current" | "due-soon" | "overdue" | "deferred"
  notes: string
  linkedWorkOrders: string[]      // WO ids that completed this
  requiresRII: boolean            // Required Inspection Item — needs second signoff
  createdAt: string
  updatedAt: string
}
```

**DataStore changes**
- Add `complianceItems` state + add/update/delete + a recompute helper that runs on every meter reading insert.
- Helper `getDueList(aircraft, lookAheadDays, lookAheadHours): ComplianceItem[]`.

**Routes**
- `/app/compliance` → CompliancePage with Due List as default view.

**Integration**
- `Dashboard.tsx`: add a "Compliance — Due Soon" widget.
- `AircraftDetail.tsx`: add "Compliance" tab showing items + due list for that tail.
- When a Work Order closes, prompt to mark linked compliance items complete (auto-recompute next-due).

**Acceptance**
- User creates a compliance item with calendar + hour interval, logs a meter reading, sees the next-due value recompute. Item status flips to "overdue" when past due.

---

## Feature 1.3 — Inspections module + Procedures / Checklists

**Why:** Reusable inspection templates (Annual, 100hr) attached to WOs and as standalone records. Coast nailed this.

**Files to create**

```
/src/app/components/inspections/InspectionsPage.tsx       // route /app/inspections
/src/app/components/inspections/InspectionForm.tsx
/src/app/components/inspections/ProceduresPage.tsx        // route /app/procedures (template library)
/src/app/components/inspections/ProcedureBuilder.tsx      // create/edit procedure templates
/src/app/components/inspections/ProcedureRunner.tsx       // execute a procedure on a WO/inspection
```

**Types to add**

```typescript
interface Procedure {
  id: string
  name: string                    // "Cessna 172 Annual Inspection"
  description: string
  sections: ProcedureSection[]
  appliesTo: string[]             // make/model strings (optional filter)
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface ProcedureSection {
  id: string
  title: string                   // "Engine", "Airframe"
  items: ProcedureItem[]
}

interface ProcedureItem {
  id: string
  text: string                    // "Inspect spark plugs"
  inputType: "checkbox" | "pass-fail" | "value" | "photo" | "signature"
  reference?: string              // FAR reference, manual page
  requiresPhoto?: boolean
}

interface Inspection {
  id: string
  aircraft: string
  procedureId: string             // which template
  status: "draft" | "in-progress" | "complete" | "complete-requires-attention"
  assignee: string
  dueDate?: string
  startDate?: string
  completedDate?: string
  results: InspectionResult[]     // per-item results
  linkedWorkOrder?: string
  linkedComplianceItems: string[]
  createdAt: string
  updatedAt: string
}

interface InspectionResult {
  procedureItemId: string
  value: string | boolean | number
  passed?: boolean
  photoUrls: string[]
  comments: string
  completedBy?: string
  completedAt?: string
}
```

**DataStore changes**
- Add `procedures`, `inspections` state + CRUD.

**Routes**
- `/app/procedures` → template library
- `/app/inspections` → inspection list + statuses

**Integration**
- `WorkOrder` gains optional `linkedInspections: string[]`.
- WorkOrderPanel adds "Attach Procedure" button → choose from procedure library → creates an Inspection card linked to the WO.

**Acceptance**
- User creates a procedure with sections + items, runs it as an Inspection on an aircraft, completes items with photos/values, sees status flip to complete.

---

## Feature 1.4 — Continued Items (deferred maintenance)

**Why:** Found-but-deferred work that should follow the aircraft, not the WO.

**Files to create**

```
/src/app/components/continued/ContinuedItemsPanel.tsx    // embed in AircraftDetail
/src/app/components/continued/ContinuedItemForm.tsx
```

**Types to add**

```typescript
interface ContinuedItem {
  id: string
  aircraft: string
  description: string
  discoveredOnWorkOrder: string   // origin WO id
  discoveredDate: string
  status: "open" | "in-progress" | "completed" | "wont-fix"
  resolvedOnWorkOrder?: string    // WO that finally fixed it
  priority: "low" | "medium" | "high" | "urgent"
  notes: string
  createdAt: string
  updatedAt: string
}
```

**DataStore changes**
- Add `continuedItems` state + CRUD + helper `getOpenContinuedForAircraft(tail)`.

**Integration**
- WorkOrderPanel: add "Mark as Continued" button on each line item → creates a `ContinuedItem` linked to the WO.
- AircraftDetail: new "Continued Items" tab.
- When creating a new WO, show open continued items for that aircraft as a checklist to optionally pull into the new WO. On "pull in", set `resolvedOnWorkOrder` once that new WO closes.

**Acceptance**
- Continued items follow the aircraft, are visible on the aircraft record, and can be moved into a new WO.

---

## Feature 1.5 — Customer Approvals portal

**Why:** Customer-facing approval flow on quoted work. Single biggest commercial differentiator.

**Files to create**

```
/src/app/components/approvals/ApprovalsPage.tsx               // route /app/approvals (operator side)
/src/app/components/approvals/ApprovalForm.tsx                // build approval package from WO
/src/app/public/CustomerApprovalView.tsx                      // route /approve/:token (customer side, public)
```

**Types to add**

```typescript
interface ApprovalRequest {
  id: string
  workOrder: string
  customer: string
  aircraft: string
  publicToken: string             // unguessable URL token
  items: ApprovalLineItem[]
  status: "draft" | "sent" | "partially-responded" | "completed" | "expired"
  sentDate?: string
  respondedDate?: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
}

interface ApprovalLineItem {
  id: string
  description: string
  estimatedCost: number
  laborHours: number
  partsCost: number
  photoUrls: string[]
  customerResponse?: "approved" | "denied" | "deferred"
  customerComment?: string
  respondedAt?: string
}
```

**DataStore changes**
- Add `approvalRequests` state + CRUD + helpers `generateApprovalToken()`, `respondToApprovalItem(token, itemId, response, comment)`.

**Routes**
- `/app/approvals` → list (operator side)
- `/approve/:token` → public customer view (no auth, just token)

**Integration**
- WorkOrderPanel: "Send for Customer Approval" button → builds an `ApprovalRequest` from selected line items.
- WO status validation: items in approval status "denied" can't be billed; "deferred" items become Continued Items automatically.

**Acceptance**
- Operator sends approval, customer opens public link, approves/denies/defers each line, operator sees responses in real time, denied items don't get worked, deferred items show up on the aircraft as Continued Items.

---

# PHASE 2 — Operations Layer

## Feature 2.1 — Parts Inventory + Purchase Orders

**Why:** Real inventory control, not just one-off parts on WOs. Auto-flow keeps counts honest.

**Files to create**

```
/src/app/components/parts/PartsInventoryPage.tsx     // route /app/parts
/src/app/components/parts/PartForm.tsx
/src/app/components/parts/PurchaseOrdersPage.tsx     // route /app/purchase-orders
/src/app/components/parts/PurchaseOrderForm.tsx
```

**Types to add**

```typescript
interface InventoryPart {
  id: string
  partNumber: string
  altPartNumbers: string[]
  description: string
  category: string
  qtyOnHand: number
  minOnHand: number               // reorder threshold
  unitCost: number
  unitPrice: number               // sell price
  vendor?: string
  location?: string
  partClass: "consumable" | "rotable" | "serialized"   // see Feature 3.2
  files: string[]
  alertEmails: string[]           // low-stock alert recipients
  createdAt: string
  updatedAt: string
}

interface PurchaseOrder {
  id: string
  poNumber: string                // e.g. "PO-2026-0001"
  status: "draft" | "open-request" | "ordered" | "partially-fulfilled" | "fulfilled" | "cancelled"
  vendor: string
  requestedBy: string
  requestedDate: string
  fulfilledDate?: string
  lines: POLine[]
  approximateCost: number
  description: string
  receiptUrls: string[]
  createdAt: string
  updatedAt: string
}

interface POLine {
  id: string
  partId: string                  // FK to InventoryPart
  qtyOrdered: number
  qtyReceived: number
  unitCost: number
}
```

**DataStore changes**
- Add `inventoryParts`, `purchaseOrders` state + CRUD.
- **Auto-flows:**
  - When a WO line item is added with a known partId → decrement `qtyOnHand` on that part (when WO status moves to "In Progress" or beyond — pick one rule and document it).
  - When a PO is fulfilled → increment `qtyOnHand` for each line.
  - When `qtyOnHand <= minOnHand` → toast warning + (TODO: send email to `alertEmails`).

**Routes**
- `/app/parts` and `/app/purchase-orders`.

**Integration**
- `searchParts()` mock should also return matching `InventoryPart` records first, before falling back to the Atlas catalog.
- WorkOrderPanel parts row: add "From Inventory?" toggle; if yes, pick from inventory → auto-decrement on save.

**Acceptance**
- Adding a part to a WO decrements inventory; receiving a PO increments it; low-stock parts surface a warning.

---

## Feature 2.2 — Vendor Management

**Why:** Vendors back-reference parts, POs, OSR work, and warranties.

**Files to create**

```
/src/app/components/vendors/VendorsPage.tsx     // route /app/vendors
/src/app/components/vendors/VendorForm.tsx
```

**Types to add**

```typescript
interface Vendor {
  id: string
  name: string
  vendorType: "parts" | "osr" | "service" | "freight" | "other"
  address: string
  phone: string
  website: string
  contactName: string
  contactEmail: string
  description: string
  approved: boolean               // for "approved-vendor-only" enforcement
  createdAt: string
  updatedAt: string
}
```

**Routes**
- `/app/vendors`

**Integration**
- POLine.vendor and InventoryPart.vendor become Vendor IDs.
- Outside Services on WOs link to a Vendor.

**Acceptance**
- Vendors list view, create/edit, link from PO and WO outside-services.

---

## Feature 2.3 — Live Time Clock on Work Orders

**Why:** Real labor tracking — tech clocks in/out per WO.

**Files to create**

```
/src/app/components/timeclock/TimeClockPanel.tsx    // embed in WorkOrderPanel
/src/app/components/timeclock/TimeEntryForm.tsx
```

**Types to add**

```typescript
interface TimeEntry {
  id: string
  workOrder: string
  workOrderItem?: string          // optional per-item granularity
  technician: string
  startTime: string               // ISO
  endTime?: string                // null = clocked in / running
  hourlyRate: number
  workType: "labor" | "ojt" | "warranty" | "rework"
  isOvertime: boolean
  notes: string
  createdAt: string
  updatedAt: string
}
```

**DataStore changes**
- Add `timeEntries` state + CRUD + helpers `clockIn(workOrder, technician, hourlyRate)`, `clockOut(timeEntryId)`, `getOpenEntries(technician)`.

**Integration**
- WorkOrderPanel adds a "Time Clock" section: shows running timer (if open entry exists), Clock In / Clock Out buttons, list of past entries with computed hours.
- WorkOrder.totalLabor recomputes from `timeEntries` in addition to manual `laborLines`.
- Header shows a small running-timer chip if user is clocked in.

**Acceptance**
- Tech clicks Clock In on a WO, timer runs, clicks Clock Out, hours roll into the WO total.

---

## Feature 2.4 — Multi-view system per module

**Why:** Coast's killer feature. Same data, multiple shapes (Calendar / Table / Board / Saved Views).

**Files to create**

```
/src/app/components/views/ViewSelector.tsx          // dropdown component
/src/app/components/views/CalendarView.tsx
/src/app/components/views/TableView.tsx
/src/app/components/views/BoardView.tsx             // kanban
/src/app/components/views/ViewSettings.tsx          // save/edit a view
```

**Types to add**

```typescript
interface SavedView {
  id: string
  module: "work-orders" | "invoices" | "logbook" | "compliance" | "inspections" | "parts" | "purchase-orders" | "vendors"
  name: string
  viewType: "list" | "calendar" | "table" | "board"
  filters: Record<string, unknown>
  sort: { field: string; direction: "asc" | "desc" } | null
  groupBy?: string
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}
```

**DataStore changes**
- Add `savedViews` state + CRUD + helper `getViewsForModule(module)`.

**Integration**
- Replace existing single list views in WorkOrdersPage / InvoicesPage / LogbookPage / new modules with a ViewSelector dropdown that switches between view components.
- Default views ship pre-seeded for each module (e.g. WO has Status List, Priority List, Calendar, Board, Overdue, Assigned to me).

**Acceptance**
- User switches a module between list/calendar/table/board, saves a custom filtered view, picks it later.

---

# PHASE 2.5 — Workforce Layer (mechanic scheduling, PTO, daily clock)

_Coast's Scheduler / Time Off / Clocking In-Out modules — adapted for an MRO shop. These three features share one data domain: who's working, when, and on what._

---

## Feature 2.5.1 — Mechanic Scheduler (shifts)

**Why:** When you go to assign N12345's annual to a tech, you need to know who's on shift Tuesday morning, who has a half-day, and who's already booked. This is the input to good Work Order scheduling.

**Files to create**

```
/src/app/components/scheduler/SchedulerPage.tsx       // route /app/scheduler
/src/app/components/scheduler/ShiftForm.tsx           // create/edit a shift
/src/app/components/scheduler/ShiftCalendar.tsx       // Month/Week calendar
/src/app/components/scheduler/MyShiftsView.tsx        // tech's own shifts
/src/app/components/scheduler/ShiftCoversList.tsx     // shift swap requests
```

**Types to add to `DataStore.tsx`**

```typescript
interface Shift {
  id: string
  name: string                    // "Morning shift", "On-call"
  technician: string              // user id (assignee)
  roles: string[]                 // optional skill tags: "IA", "Avionics", "Engine"
  startDate: string               // ISO datetime
  endDate: string                 // ISO datetime
  status: "scheduled" | "in-progress" | "completed" | "missed" | "swapped"
  reminders: ReminderSpec[]       // see cross-cutting
  checklist?: ShiftChecklistItem[]   // pre-shift / post-shift checklist
  notes: string
  createdAt: string
  updatedAt: string
}

interface ShiftChecklistItem {
  id: string
  text: string                    // "Inspect tow vehicle"
  completed: boolean
  completedAt?: string
}

interface ShiftCover {
  id: string
  originalShift: string           // shift id
  requestedBy: string             // tech who can't make it
  coveringTech?: string           // who agreed to cover
  status: "open" | "claimed" | "approved" | "rejected"
  reason: string
  createdAt: string
  updatedAt: string
}
```

**DataStore changes**
- Add `shifts`, `shiftCovers` state + CRUD.
- Add helpers:
  - `getShiftsForTechnician(techId, dateRange): Shift[]`
  - `getActiveTechniciansAt(timestamp): string[]` ← used by Work Order assignment
  - `requestShiftCover(shiftId, reason)` and `claimShiftCover(coverId)`

**Routes**
- `/app/scheduler` → SchedulerPage (default view: ShiftCalendar — Month or Week)

**Views (use Feature 2.4's multi-view system):**
- Shift Calendar (Month/Week toggle)
- Your Shifts (filtered to current user)
- Shift Covers list

**Integration with existing code**
- `WorkOrderPanel` Assignee picker: when picking a tech, show shift status — "Andy is on shift today 8am-4pm" or "Andy is off today" — pulled from `getActiveTechniciansAt()`.
- `Dashboard.tsx`: add an optional "Today's Shifts" widget.
- Sidebar: add **"Scheduler"** entry under a new **WORKFORCE** sidebar group.

**Acceptance**
- Manager creates a recurring morning shift for a tech, sees it on the calendar, the WO assignee picker reflects who's on shift now.

---

## Feature 2.5.2 — Time Off Requests

**Why:** Time-off blocks can't conflict with scheduled WOs. Without this, you'll book a tech for an annual on the day they're on PTO.

**Files to create**

```
/src/app/components/timeoff/TimeOffPage.tsx         // route /app/time-off
/src/app/components/timeoff/TimeOffForm.tsx         // employee submits request
/src/app/components/timeoff/TimeOffApprovalList.tsx // manager approves/denies
```

**Types to add**

```typescript
interface TimeOffRequest {
  id: string
  employee: string                // user id
  type: "Holiday" | "Medical" | "Personal" | "Bereavement" | "Jury Duty"
  startDate: string               // ISO date
  endDate: string                 // ISO date
  status: "draft" | "pending" | "approved" | "denied" | "cancelled"
  notifyUsers: string[]           // who to alert on approval
  reason: string
  managerComment?: string
  decidedBy?: string              // manager id
  decidedAt?: string
  createdAt: string
  updatedAt: string
}
```

**DataStore changes**
- Add `timeOffRequests` state + CRUD.
- Helper `isTechOnTimeOff(techId, date): boolean` — used by Scheduler and WO assignment.

**Routes**
- `/app/time-off` → TimeOffPage (tabs: My Requests · Team Requests · Calendar overlay)

**Integration**
- `Scheduler`: approved time-off blocks render as gray bars on the calendar.
- `WorkOrderPanel` Assignee picker: greys out / warns "Tech on PTO this date."
- Sidebar: add **"Time Off"** under WORKFORCE group.

**Acceptance**
- Tech requests 3 days off, manager approves, those 3 days show as PTO on the Scheduler, WO assignment for those days flags a conflict.

---

## Feature 2.5.3 — Daily Clock In/Out (general shop clock)

**Why:** Distinct from the **per-WO Time Clock** in Feature 2.3. This is the daily start/end of the workday — used for payroll and shop attendance. Per-WO entries roll up *inside* a daily clock-in/clock-out.

**Files to create**

```
/src/app/components/clock/ClockInOutPage.tsx     // route /app/clock — admin view of all
/src/app/components/clock/ClockInWidget.tsx      // header widget (clock in/out button + running total)
```

**Types to add**

```typescript
interface ClockEvent {
  id: string
  employee: string
  status: "clocked-in" | "on-break" | "clocked-out"
  clockInAt: string               // ISO
  clockOutAt?: string             // null = still clocked in
  breaks: BreakInterval[]
  totalHours?: number             // computed when clocked out
  shift?: string                  // optional link to a Shift if any
  notes: string
  imageUrl?: string               // optional check-in photo (Coast supports this)
  createdAt: string
  updatedAt: string
}

interface BreakInterval {
  start: string
  end?: string
  reason?: string                 // "Lunch", "Smoke", etc.
}
```

**DataStore changes**
- Add `clockEvents` state + CRUD.
- Helpers `clockInEmployee(empId, shiftId?)`, `startBreak(eventId)`, `endBreak(eventId)`, `clockOutEmployee(eventId)`.
- Helper `getCurrentClockState(empId): ClockEvent | null` — used by header widget.

**Routes**
- `/app/clock` → ClockInOutPage (admin sees everyone's events; tech sees own)

**Integration**
- `AppLayout` top bar: replace decorative bell with a **ClockInWidget** showing "Clocked in 4h 23m" or "Clock In" button.
- **Bridge to per-WO Time Clock (Feature 2.3):** when a tech clocks in via this daily clock, all subsequent per-WO `TimeEntry` rows automatically reference the active `ClockEvent`. Clocking out auto-closes any running per-WO timer.
- Reporting: daily clock totals feed a "Hours by Employee by Week" report alongside Coast's Timetracking Report equivalent.
- Sidebar: add **"Clock In/Out"** under WORKFORCE group.

**Acceptance**
- Tech clocks in at 8am, opens a WO and clocks into it for 2 hours, opens another WO for 3 hours, takes lunch, clocks out at 5pm. The daily ClockEvent shows ~8 hours minus break, and the two WOs each show their per-WO labor.

---

## Phase 2.5 cross-feature wiring

These three features deeply integrate. Build all three in one phase rather than spread out. Final shape:

```
Shift           ─┐
                 ├──> Scheduler page (calendar)
TimeOffRequest  ─┘
                 ├──> WO Assignee picker (availability check)
ClockEvent      ─┐
                 └──> ClockInWidget (header) + Reports
                       └──> wraps per-WO TimeEntry (Feature 2.3)
```

**Sidebar grouping (final, with Workforce added):**

```
WORKFORCE
  Scheduler
  Clock In/Out
  Time Off

MAINTENANCE
  Work Orders
  Inspections
  Compliance
  Continued Items
  Approvals

INVENTORY
  Parts
  Purchase Orders
  Vendors

(rest unchanged)
```

---

# PHASE 2.6 — Tool Management & Document Expiration

_Two add-on features that don't fit Workforce or Commercial cleanly: shop tool calibration tracking, and time-aware documents (expirations + reminders) for both Owner and Mechanic personas._

---

## Feature 2.6.1 — Tool Management & Calibration

**Why:** Aviation shops own torque wrenches, mag testers, borescopes, calipers, lifts, and jigs. Each has a calibration cycle. If a calibrated tool is used past its due date, the work is non-compliant. EBIS calls this out as a Pro-tier module; Coast doesn't have it. You need it for IA-grade shops.

**Files to create**

```
/src/app/components/tools/ToolsPage.tsx               // route /app/tools
/src/app/components/tools/ToolForm.tsx                // create/edit tool
/src/app/components/tools/ToolDetail.tsx              // route /app/tools/:id
/src/app/components/tools/CalibrationLogForm.tsx      // log a new calibration event
/src/app/components/tools/CalibrationDueList.tsx      // dashboard / report
/src/app/components/tools/ToolCheckoutPanel.tsx       // who has the tool now
```

**Types to add to `DataStore.tsx`**

```typescript
interface Tool {
  id: string
  serialNumber: string
  name: string                    // "Torque Wrench 50–250 ft-lb"
  category: "torque" | "measuring" | "test-equipment" | "jig" | "lift" | "borescope" | "other"
  manufacturer: string
  model: string
  purchaseDate?: string
  purchaseCost?: number
  location?: string               // where it's stored
  status: "in-use" | "available" | "out-for-calibration" | "out-of-service" | "lost" | "retired"
  // Calibration spec
  calibrationRequired: boolean
  calibrationIntervalMonths?: number   // e.g. 12 for annual
  calibrationIntervalUses?: number     // some tools by # uses
  toleranceDays?: number               // grace period
  lastCalibrationDate?: string
  lastCalibrationBy?: string           // vendor or in-house
  lastCalibrationCertNumber?: string
  nextCalibrationDate?: string         // computed
  // Checkout
  checkedOutBy?: string                // user id
  checkedOutAt?: string
  checkedOutToWorkOrder?: string
  // Files
  certificateUrls: string[]            // calibration cert PDFs, photos
  manualUrl?: string                   // tool manual
  notes: string
  createdAt: string
  updatedAt: string
}

interface CalibrationEvent {
  id: string
  toolId: string
  date: string
  performedBy: string             // vendor id or "in-house"
  certificateNumber: string
  result: "pass" | "fail" | "adjusted"
  cost: number
  notes: string
  certificateUrl?: string
  nextDueDate: string             // set the new next-due value
  createdAt: string
}

interface ToolCheckoutEvent {
  id: string
  toolId: string
  user: string
  workOrder?: string
  checkedOutAt: string
  returnedAt?: string
  conditionAtReturn?: "ok" | "damaged" | "needs-recalibration"
  notes: string
}
```

**DataStore changes**
- Add `tools`, `calibrationEvents`, `toolCheckouts` state + CRUD.
- Helper `getCalibrationDueList(lookAheadDays): Tool[]` — returns tools with `nextCalibrationDate` within window.
- Helper `getOverdueTools(): Tool[]` — tools past their next-due date.
- Helper `checkOutTool(toolId, userId, workOrderId?)` and `returnTool(checkoutId, condition)`.
- When a `CalibrationEvent` is added, auto-update `Tool.lastCalibrationDate` + recompute `nextCalibrationDate`.

**Routes**
- `/app/tools` → ToolsPage (list with status badges, filterable by calibration due)
- `/app/tools/:id` → ToolDetail (calibration history, checkout history, files)

**Views (use Feature 2.4's multi-view system):**
- All Tools (list)
- Calibration Due (next 30/60/90 days)
- Overdue (past calibration date — blocks usage)
- Checked Out
- By Category (Board view grouped by category)

**Integration with existing code**
- `WorkOrderPanel`: add a **"Tools Used"** section. Picking a tool that's overdue on calibration → red warning + block save with "Tool requires calibration before use."
- `AppLayout` sidebar: add **"Tools"** under MAINTENANCE section (or put in INVENTORY group from Feature 2.5 sidebar reshuffle).
- `Dashboard.tsx`: add an optional "Tools — Calibration Due Soon" widget.
- Reminder/notification: when a tool hits its `toleranceDays` window before due, push an in-app notification (uses cross-cutting Reminders system).

**Acceptance**
- User registers a torque wrench with a 12-month cal interval, logs a calibration event, sees `nextCalibrationDate` auto-set 12 months out. Next month, the tool appears in the Calibration Due list. After expiration, attempting to add it to a WO blocks save.

---

## Feature 2.6.2 — Document Expiration & Reminders (with persona categories)

**Why:** You already have a Documents module, but it treats everything as static files. Real life has expiring documents:
- **Owner persona:** aircraft registration, airworthiness certificate, insurance, lease agreements, pilot medical, flight reviews.
- **Mechanic persona:** A&P certificate, IA renewal, repair-station certificate, training records, drug-test compliance, hangar lease, tool calibration certs.

Each one has an expiration date and needs a reminder before it lapses.

**Files to create / modify**

```
/src/app/components/documents/DocumentExpirationPanel.tsx   // dashboard widget + reminders
/src/app/components/documents/DocumentCategoriesConfig.tsx  // configurable categories per persona
// modify existing:
/src/app/components/DocumentsPage.tsx        // add expiration fields to upload modal
```

**Types to extend (modify the existing `Document` interface — additive)**

```typescript
// Existing fields stay. Add:
interface Document {
  // ... existing fields
  category: string                // expanded — see persona-specific categories below
  persona: "owner" | "mechanic" | "shop"   // which persona this document belongs to
  // Expiration tracking
  hasExpiration: boolean
  expirationDate?: string         // ISO
  effectiveDate?: string          // when it kicks in
  reminderOffsets: ReminderSpec[] // [{ offset: "30 days before", channel: "in-app" | "email" }]
  expirationStatus?: "current" | "expiring-soon" | "expired"   // computed from expirationDate
  renewalTrackingId?: string      // links to a "renewal" task/WO when scheduled
  // Authority / audit
  issuedBy?: string               // FAA, insurance company, lessor, A&P school
  documentNumber?: string         // cert number, policy number, registration #
  notes: string
}
```

**New category lists (configurable but seeded)**

```typescript
// /src/data/documentCategories.ts
export const OWNER_DOC_CATEGORIES = [
  "Aircraft Registration",
  "Airworthiness Certificate",
  "Insurance Policy",
  "Lease Agreement",
  "Annual Inspection Sign-off",
  "Pilot Medical",
  "Flight Review (BFR)",
  "ELT Battery Certificate",
  "Transponder Cert",
  "Pitot-Static Cert",
  "VOR Check",
  "Other",
] as const

export const MECHANIC_DOC_CATEGORIES = [
  "A&P Certificate",
  "IA Authorization",
  "Repair Station Certificate",
  "Training Record",
  "Drug & Alcohol Compliance",
  "Hangar Lease",
  "Shop Insurance",
  "Tool Calibration Certificate",
  "Vendor Approval Letter",
  "Continuing Education",
  "OSHA Training",
  "Other",
] as const

export const SHOP_DOC_CATEGORIES = [
  "Business License",
  "Tax ID Letter",
  "EPA Permit",
  "Hazmat Storage Permit",
  "Workers Comp Policy",
  "Lease Agreement",
  "Service Contract",
  "Other",
] as const
```

**DataStore changes**
- Helper `getExpiringDocuments(persona, lookAheadDays): Document[]`.
- Helper `recomputeDocumentStatus(doc): Document` — sets `expirationStatus` based on today vs `expirationDate` and `reminderOffsets`.
- On upload save, run `recomputeDocumentStatus()`.

**UI changes to existing `DocumentsPage.tsx`**

Existing upload form already has `docType`, `aircraft`, `manualAccess`, etc. **Add to the `UploadForm` shape:**

```typescript
{
  // ... existing
  persona: "owner" | "mechanic" | "shop"     // NEW — defaults based on logged-in user role
  hasExpiration: boolean                     // NEW
  expirationDate: string                     // NEW
  effectiveDate: string                      // NEW
  reminders: string[]                        // NEW — multi-select: "30 days", "14 days", "7 days", "1 day"
  documentNumber: string                     // NEW
  issuedBy: string                           // NEW
}
```

**Add a Documents page top-bar:**
- Persona tabs: **My Documents (Owner) · Shop Documents · Mechanic Certifications** (visible based on user role).
- Filter chips: All · Current · Expiring Soon · Expired.
- New default view: "Expiring Soon" sort — soonest expiration first, with a colored badge:
  - **Green** = current
  - **Amber** = within reminder window (e.g. 30 days)
  - **Red** = expired

**New Routes (optional, or just tabs on existing /app/documents):**
- `/app/documents/expiring` → filtered view of docs in reminder window or expired

**Integration with existing code**
- `Dashboard.tsx`: add a **"Documents Expiring Soon"** widget — counts of green/amber/red. Click → opens documents page filtered.
- `AircraftDetail.tsx`: add a **"Documents & Certificates"** tab showing all documents with `aircraft = this.tail`, sorted by expiration with status badges.
- `Settings`: add a **"Document Reminders"** section where user can edit default reminder offsets per category (e.g. "30, 14, 7 days for Insurance").
- Reminder system (cross-cutting): when a document hits its first `reminderOffset`, push in-app notification + (TODO backend) email.

**Acceptance**
- Owner uploads "Aircraft Insurance Policy" with expiration 6 months out and reminders at 30/14/7 days. Documents page shows it in green. Aircraft detail shows it. 30 days before expiry, status flips to amber + dashboard widget count updates + in-app notification fires. After expiration date, status flips to red.

---

## Phase 2.6 cross-feature wiring

Tools and Documents share the same time-based reminder pattern — they both use the cross-cutting **Reminders + Start + Due** trio added to every entity. Calibration certificates (a kind of document) link both modules:

```
Tool ──── has many ────► CalibrationEvent ──── attaches ────► Document (Calibration Cert)
                                                                  │
                                                                  └── has expirationDate matching nextCalibrationDate
```

Implementation tip: when a `CalibrationEvent` is logged with a `certificateUrl`, auto-create a `Document` record with `category: "Tool Calibration Certificate"`, `persona: "shop"`, and `expirationDate = nextCalibrationDate`. That way the calibration cert flows into the same expiration tracking the rest of the documents use.

---

# PHASE 4 — Telemetry & Tach-Time Sync (the "no manual readings ever" layer)

This phase eliminates manual meter entry by integrating with three data sources, in priority order. The system picks the best available source per aircraft and shows a confidence indicator.

```
Priority 1: AIRBLY (hardware, customer-paid)        ← Gold standard, ±0.1 hr
Priority 2: FLIGHTSCHEDULE PRO (for schools)        ← Good, ±0.2 hr
Priority 3: ADSB EXCHANGE / FLIGHTAWARE (fallback)  ← Inferred, ±15-25%
Priority 4: Manual entry                            ← Last resort
```

---

## Feature 4.1 — Airbly Integration (primary)

**Why:** Airbly hardware reports actual engine-on Hobbs and tach times directly from the aircraft. This is what makes the "no manual entry ever" promise real.

**Files to create**

```
/src/server/integrations/airbly/             // backend (REQUIRED — has API key)
  client.ts                                  // Airbly REST client
  syncWorker.ts                              // polls every 5-15 min
  webhookHandler.ts                          // if Airbly supports push
/src/app/components/integrations/AirblySetup.tsx
/src/app/components/integrations/AirblyStatus.tsx     // live "last sync" indicator
```

**Types**

```typescript
interface AirblyDevice {
  id: string
  orgId: string
  aircraft: string                  // tail
  airblyDeviceId: string            // serial from Airbly
  apiKeyRef: string                 // server-side reference
  lastSyncAt?: string
  lastSyncStatus: "ok" | "stale" | "error"
  syncFrequencyMinutes: number      // default 15
  capabilities: AirblyCapability[]  // what this model reports
  createdAt: string
}

type AirblyCapability =
  | "gps-position"
  | "hobbs-time"
  | "tach-time"
  | "engine-start-stop"
  | "oil-pressure"
  | "egt"
  | "voltage"

interface FlightEvent {
  id: string
  orgId: string
  aircraft: string
  source: "airbly" | "fsp" | "adsb-exchange" | "flightaware" | "manual"
  startTime: string                 // engine-on or wheels-up depending on source
  endTime?: string
  startLat?: number
  startLng?: number
  endLat?: number
  endLng?: number
  hobbsBefore?: number
  hobbsAfter?: number
  tachBefore?: number
  tachAfter?: number
  flightDurationHours?: number      // computed
  groundDurationHours?: number      // for Airbly, taxi time
  confidence: number                // 0-1
  raw: Record<string, unknown>      // raw payload for debugging
  createdAt: string
}
```

**Background sync worker (server-side)**
1. Every 15 minutes, for each `AirblyDevice`, hit Airbly REST API → pull events since last sync.
2. For each event, normalize into `FlightEvent`.
3. Auto-create `MeterReading` records for affected meters (hobbs, tach).
4. Emit AISignal `meter-reading` so the AI Orchestrator can react.

**Setup UX (Owner persona)**
- AircraftDetail → "Sync" tab → "Connect Airbly".
- Walks user through pairing: enter Airbly device serial + API key (or OAuth if Airbly supports it).
- Shows live status: "Last synced 4 min ago — 47.3 Hobbs, 38.1 Tach."

**Acceptance**
- Owner pairs Airbly, takes a flight, returns. Within 15 minutes the aircraft's Hobbs has auto-incremented, a FlightEvent is logged, and an AI insight card appears: "1.4-hour flight today. Annual now due in 17 hours."

---

## Feature 4.2 — FlightSchedule Pro Integration (mid-tier)

**Why:** Flight schools that already pay for FSP use it as their source of truth. We sync from theirs rather than making them double-enter.

**Implementation summary**
- Same `FlightEvent` model, source = `"fsp"`.
- `/src/server/integrations/fsp/` with REST client + sync worker.
- Setup UX in same "Sync" tab — paste FSP API key, choose which aircraft to sync, set frequency.

**Acceptance**
- A school connects FSP, every dispatched/closed flight in FSP syncs to aircraft.us within 5 minutes and updates Hobbs/Tach.

---

## Feature 4.3 — ADSB Fallback (FlightAware + ADSB Exchange)

**Why:** The owner who doesn't buy Airbly or use FSP. We track the aircraft via public ADS-B data and **infer** Hobbs/Tach.

**Cost-optimized strategy:**
- **Primary:** ADSB Exchange (`adsbexchange.com/api`) — flat-fee subscription, predictable cost.
- **Backup:** FlightAware AeroAPI — only fall through when ADSB Exchange has no data for a flight.

**Files**

```
/src/server/integrations/adsb/
  adsbExchangeClient.ts
  flightAwareClient.ts
  flightDetector.ts          // groups raw position pings into flights
  tachInference.ts           // ADSB → Hobbs/Tach math
```

**Tach inference math (the secret sauce)**

For piston aircraft, the rule is `Hobbs = (airborne time) + (taxi/runup buffer per cycle)`. Research shows:
- Average buffer per flight cycle: **0.4 hours** (24 minutes — taxi out + runup + hold + taxi in).
- Tach is roughly **85%** of Hobbs at typical cruise RPM.

Formula:
```typescript
function inferHobbsFromADSB(airborneHours: number, flightCycles: number): number {
  // Engine ran longer than airborne by ~0.4 hours per cycle
  return airborneHours + (0.4 * flightCycles)
}

function inferTachFromHobbs(hobbsHours: number, aircraftClass: string): number {
  const ratios = {
    "piston-single": 0.85,
    "piston-twin": 0.83,
    "turbine": 0.95,         // turbines run closer to 1:1
    "default": 0.85,
  }
  return hobbsHours * (ratios[aircraftClass] || ratios.default)
}
```

**Confidence indicator on every inferred reading:**

| Source | Confidence | UI badge |
|---|---|---|
| Airbly hardware | 0.95–1.0 | Green "Verified" |
| FlightSchedule Pro | 0.80–0.95 | Green "Synced" |
| ADSB inferred | 0.55–0.75 | Amber "Estimated" |
| Manual entry | varies | Blue "Logged" |

The user always knows which is which. Owner can edit/override an inferred reading and it auto-flips to "Confirmed."

**Owner-facing behavior (no setup needed):**
- We **automatically** track the aircraft by tail number via ADSB Exchange — no Airbly required.
- Each detected flight produces an estimated FlightEvent + estimated meter reading.
- Owner gets an AI card: "We detected a 1.4-hour flight today (estimated). Confirm or edit Hobbs?"

**Acceptance**
- Owner adds a tail number with no Airbly. Takes a flight. ADSB Exchange picks up the flight. Within 30 minutes an estimated FlightEvent appears with an "Estimated" badge. Owner taps "Confirm" or types the actual Hobbs to override.

---

## Feature 4.4 — Tach-Time Inference Engine (orchestration)

**Why:** Multi-source priority logic — pick the best source available per aircraft, fall through gracefully, dedupe events when multiple sources see the same flight.

**Files**

```
/src/server/telemetry/inferenceEngine.ts
/src/server/telemetry/sourcePriority.ts
/src/server/telemetry/deduper.ts
```

**Logic**

```
For each Aircraft per day:
  if hasAirblyDevice and airblyOnline:
      use airbly events
  else if hasFSPSync:
      use FSP events
  else:
      use ADSB Exchange (fallback to FlightAware if ADSB Exchange fails)

  Dedupe: if multiple sources see same flight (within 10 min start time):
      keep highest-priority source
      flag others as "verified by N sources"

  Persist FlightEvents.
  Roll up to MeterReading deltas.
  Emit AI signal.
```

**Settings exposure (Org Settings → Sync)**
- Per-aircraft: which sources are enabled, sync frequency, tach inference parameters (allow shop to override the 0.4-hour buffer if their flights are atypical, e.g. ag operations with very short cycles).

**Acceptance**
- Aircraft has both Airbly and is also picked up by ADSB Exchange. The system uses Airbly's reading and shows "Verified by 2 sources" on the meter reading.

---

# PHASE 5 — AI-First Experience (the Tesla layer)

This is what makes us extraordinary. Every Phase 1–4 feature plugs into this. The AI is the primary UI; forms are the fallback.

---

## Feature 5.1 — Smart Home Screen (replaces Dashboard)

**Why:** Tesla doesn't open to a dashboard of widgets — it opens to a stack of "what matters now" cards.

**Files**

```
/src/app/components/home/SmartHome.tsx           // new home page
/src/app/components/home/AircraftCard.tsx        // tile per aircraft
/src/app/components/home/ActionCardStack.tsx     // AI Inbox embedded
```

**Layout (Owner persona)**

```
┌─────────────────────────────────────┐
│ Good morning, Andy.                 │
│ N12345 is ready. ⛽ 38.5 Hobbs.    │  ← AI greeting + headline status
├─────────────────────────────────────┤
│ ⚠ Annual due in 18 hours           │  ← top action card
│  Schedule annual    Snooze 1w      │
├─────────────────────────────────────┤
│ 🛩 N12345 Cessna 172                │  ← live aircraft tile
│   Hobbs 38.5  Tach 32.7            │
│   Open squawks: 0                  │
│   Last flight: 2.1 hr today        │  ← from Airbly/ADSB
│   Insurance: 142 days              │
├─────────────────────────────────────┤
│ 📄 3 documents expiring this month │  ← grouped action card
└─────────────────────────────────────┘
```

**Layout (Mechanic persona)**

```
┌─────────────────────────────────────┐
│ Good morning, Mike. Clocked in?    │  ← single tap clock-in
├─────────────────────────────────────┤
│ Today's WOs (3)                    │
│   N12345 Annual    [Open]          │
│   N67890 100hr     [Continue]      │
│   N24680 Squawk    [Start]         │
├─────────────────────────────────────┤
│ ⚠ Tool calibration: torque wrench  │
│   Due in 14 days                   │
├─────────────────────────────────────┤
│ Cert renewal: A&P expires 90 days  │
└─────────────────────────────────────┘
```

**Acceptance**
- Different personas see different home screens, all driven by the AI Orchestrator's ActionCard stream.

---

## Feature 5.2 — AI Inbox / Action Cards (the universal "to-do" feed)

Already specced as part of 0.3, but materialized here as the **single source of truth for "what to act on."**

- Filterable by category, urgency, aircraft.
- Snooze / dismiss / resolve.
- Resolved cards trigger downstream tool calls automatically.
- Cards never duplicate — orchestrator dedupes.

---

## Feature 5.3 — Predictive Maintenance ML

**Why:** Don't just track compression — *predict* when a cylinder will fail.

**Models** (all run server-side, results cached)

| Model | Input | Output |
|---|---|---|
| Compression Trend | Last N cylinder readings | Days until below 65/80 (replacement threshold) |
| Oil Consumption | Oil added vs hours flown | Quarts-per-hour trend, anomaly flag |
| Battery Health | Voltage at start over time | Days until replacement |
| Component Failure | Hours-since-overhaul + manufacturer SB data | Risk score 0-100 |

Each model output → AI Orchestrator → ActionCard with evidence ("Cylinder 3 trend shows 78 → 76 → 74 over last 30 days; predicted to fall below 70 in 14 days. Schedule borescope.")

**Acceptance**
- Owner logs three compression readings showing a downward trend; an ML-driven action card appears with the prediction and a "Schedule borescope" CTA.

---

## Feature 5.4 — Voice & Camera Input

**Why:** "Tesla-simple." Talking to the app or pointing the camera at something should work.

**Voice (every screen has a mic icon)**
- "Create work order for N12345 left brake dragging" → fills the form.
- "What's the next item due on N12345?" → shows answer card.
- "Log 38.5 hobbs on N12345" → confirmation modal → save.

**Camera**
- **Scan a part:** point at part number on a tag, OCR + match → adds to WO.
- **Scan a logbook page:** OCR + LLM parse → creates `LogbookEntry` draft for review.
- **Scan a doc:** OCR + AI categorization → auto-detects expiration date and category.

**Files**

```
/src/app/ai/VoiceInput.tsx
/src/app/ai/CameraInput.tsx
/src/server/ai/whisperBridge.ts          // STT
/src/server/ai/visionBridge.ts           // OCR + vision LLM
```

**Acceptance**
- Mechanic walks up to a part bin, says "Scan oil filter for N12345," camera opens, OCR reads the P/N, LLM matches it to inventory, single tap adds to the open WO.

---

## Feature 5.5 — AI Inspector (audits completed work)

**Why:** Quality control without a senior inspector reviewing every closed WO.

**Logic**
- When a WO closes or an Inspection completes, the AI Inspector reviews:
  - Are all required compliance items signed off?
  - Did labor exceed estimate without explanation?
  - Are referenced parts actually in inventory and decremented?
  - Are required RII signoffs present?
  - Are any photos missing where required?
- Output: an ActionCard for the shop manager with findings (or "All checks passed").

---

## Feature 5.6 — Smart Customer Approvals (LLM-generated explanations)

**Why:** Customers approve faster when they understand *why* the work matters.

**Enhancement to Feature 1.5 (Customer Approvals):**
- When operator builds an approval package, AI auto-writes a plain-English explanation of each line item: not just "Replace #3 cylinder $1,400" but "Cylinder #3 compression has dropped from 78/80 to 64/80 over your last 3 flights. Below 70 the FAA considers it unairworthy. Replacement now prevents an emergency landing risk and the part is in stock — typical turnaround 2 days."
- Customer-facing portal also has a "Ask a question" box where the AI answers from the WO context.

---

## Feature 5.7 — Auto-Reconciliation with QuickBooks

**Why:** The QBO sync (Feature 3.3) is one-way push by default. AI auto-reconciliation closes the loop: when a payment posts in QBO, AI matches it to an invoice and updates payment status here.

**LLM tool:** `matchQboPaymentToInvoice(qboPayment) → invoiceId`. Confidence threshold; below threshold surfaces an ActionCard for human resolution.

---

## Feature 5.8 — Persona-Aware Default Behaviors

The AI Orchestrator's behavior changes based on persona (already wired via 0.2):

| Behavior | Owner | Mechanic | Shop |
|---|---|---|---|
| Action cards prioritize | Compliance, expirations, costs | Assigned WOs, tools, certs | Throughput, profit, low-stock |
| Voice intent priors | "What's due?" "How much will it cost?" | "Add part" "Sign off" "Clock in" | "Pipeline" "Status" "Reports" |
| Notification tone | Plain English | Technical/FAR-aware | Operations-focused |

---

# PHASE 6 — Org Admin & Multi-Tenancy

Materializes the workspace dropdown features observed in Coast (you sent the screenshot).

---

## Feature 6.1 — Switch Organization

UI: org dropdown in header (matches Coast's pattern). Lists all orgs the user has Membership in. Switching changes the active `orgId` in app state, all queries re-scope.

## Feature 6.2 — Organization Info & Settings

`/app/org/info` — org name, type, home base, address, logo, contact email.
`/app/org/settings` — defaults: labor rates, tax profile, document categories, reminder offsets, notification preferences, AI behavior toggles ("aggressive predictions" vs "conservative").

## Feature 6.3 — Billing (Stripe)

`/app/org/billing` — plan tier (Free / Starter / Pro / Enterprise), seat count, payment method, invoice history. Backend integrates Stripe Customer + Subscription.

## Feature 6.4 — Directory (team members)

`/app/org/directory` — list of all Memberships. Roles, persona, last active. Manager actions: change role, change persona, deactivate.

## Feature 6.5 — Invite

`/app/org/invite` — invite by email, choose role + persona. Magic-link signup.

## Feature 6.6 — Bookmarks

`/app/org/bookmarks` — pinned items (favorite WOs, aircraft, reports). Sidebar exposes a "Pinned" group when bookmarks exist.

## Feature 6.7 — Bulk Update Queue

Already in cross-cutting earlier — formalize the page at `/app/org/bulk-updates`.

## Feature 6.8 — Trash / Soft Delete

Already in cross-cutting earlier — page at `/app/org/trash` with restore + permanent delete.

## Feature 6.9 — Profile & Notification preferences

`/app/profile` — user-level. Avatar, name, email, password, 2FA, per-channel notification preferences, persona preference (default landing).

---

# PHASE 7 — Aircraft Operating Economics

_Owner-facing P&L. AI receipt extraction. True per-hour cost. Tax-time reports. The unfair advantage._

This phase makes aircraft.us not just MRO software for mechanics, but the only platform where aircraft owners can actually answer "am I making money?" with real data. 8 sprints. ~9 sprint-weeks of Claude Code time.

## Feature 7.1 — Cost Categories + Cost Entries Data Model

**Why:** Foundation for everything else in Phase 7.

**Files:**
- /supabase/migrations/078_cost_categories_and_entries.sql
- /apps/web/types/index.ts (extend)
- /apps/web/lib/costs/categories.ts (seed list)
- /app/(app)/costs/page.tsx (list/filter view)

**Types to add:** CostCategory enum (fuel/oil/tiedown/hangar/insurance/annual_inspection/100_hour/engine_overhaul_reserve/prop_overhaul_reserve/avionics_database/parts/labor/outside_service/tax_property/tax_use/loan_payment/depreciation/training/subscription_software/other), CostBucket enum (variable_per_hour/scheduled_per_hour/annual_fixed/monthly_fixed/one_time/loan/depreciation), CostEntry interface (id/orgId/aircraftId/category/bucket/vendor FK/description/amount/currency/date/isEstimate/source/sourcePriority 1-5/documentId/extractionResultId/approved/notes/createdAt/updatedAt).

**DataStore:** addCostEntry/updateCostEntry/deleteCostEntry + helpers: getCostsForAircraft/getCostsByCategory/getTotalCostsYTD.

**Acceptance:** User creates manual cost entry "Fuel $87.40 for N12345" → row appears in /costs filtered to that aircraft.

## Feature 7.2 — Cost Intake (Manual + Upload + Email)

**Why:** Most owners won't enter costs manually. Forward bills, upload photos, AI handles rest.

**Files:**
- /app/(app)/costs/intake/page.tsx
- /app/api/costs/upload/route.ts
- /app/api/costs/email-webhook/route.ts (SendGrid Inbound Parse)
- /app/api/costs/manual/route.ts
- /components/costs/CostIntakeForm.tsx
- /components/costs/IntakeQueueList.tsx
- /supabase/migrations/079_intake_documents.sql

**Types:** IntakeDocument (id/orgId/uploadedBy/source 'upload'|'email'|'manual'/filename/storageUrl/emailFrom/emailSubject/status 'received'|'extracting'|'extracted'|'review'|'posted'|'rejected'/extractionStartedAt/extractionCompletedAt/resultingCostEntryIds/errorMessage/createdAt).

**Email-to-cost:** Each org gets unique forwarding address (e.g. <orgId>@bills.aircraft.us). SendGrid Inbound Parse → webhook → IntakeDocument creation → triggers extraction.

**Acceptance:** User uploads fuel receipt PDF → IntakeDocument row created with status='received' → appears in queue.

## Feature 7.3 — AI Extraction (Claude Vision)

**Why:** THE differentiator. Forward bills, AI structures them. Zero manual data entry.

**Files:**
- /lib/ai/extractors/cost-receipt.ts (general fuel/oil/parts)
- /lib/ai/extractors/maintenance-invoice.ts (MX sheet — labor + parts)
- /lib/ai/extractors/insurance-declaration.ts (annual policy)
- /lib/ai/extractors/router.ts (decides extractor by doc type)
- /app/api/costs/intake/[id]/extract/route.ts
- /supabase/migrations/080_extraction_results.sql

**Types:** ExtractionResult (id/intakeDocumentId/extractor type/modelUsed/rawText/parsedFields with vendor/aircraftMatched/aircraftMatchConfidence 0-1/date/lineItems[]/totalAmount/notes/extractionConfidence overall/costTokens with input/output/estimated_cost_usd/durationMs/status 'success'|'partial'|'failed'|'manual_review_needed'/createdAt).

**Extraction logic:** Claude vision API with structured-output schema. If aircraft can't be matched → flag for review. If total mismatches line-item sum → flag. Confidence ≥0.85 → auto-create cost_entries with approved=false (queued). <0.85 → manual review flag.

**Use lib/ai/anthropic.ts from sprint 5.6.** Reuse the Anthropic client wrapper.

**Acceptance:** Upload real fuel receipt photo → within 30s, AI extracts vendor/date/amount/aircraft/category=fuel → cost_entries row in review queue.

## Feature 7.4 — True Operating Cost Calculator

**Why:** Core math. Compute each aircraft's true per-hour cost.

**Files:**
- /lib/costs/calculator.ts
- /lib/costs/reserves.ts
- /components/costs/CostBreakdownCard.tsx
- /app/api/aircraft/[id]/operating-cost/route.ts

**Math:** computeTrueOperatingCost takes aircraftId + lookbackPeriod. Sums flight hours from flight_events. Variable: fuelCost + oilCost = total/flight hours. Scheduled per hour: engineReserve = engineOverhaulCost / engineTBO (default $30K/2000hr=$15/hr), propReserve similar. Annual fixed amortized: insurancePerHour = annualInsurance/annualizedHours, hangarPerHour = monthly*12/annualizedHours, annualInspectionPerHour = avg/annualizedHours. Loan + depreciation amortized.

Returns: fuelPerHour/oilPerHour/engineReservePerHour/propReservePerHour/insurancePerHour/hangarPerHour/annualInspectionPerHour/loanPerHour/depreciationPerHour, plus wetCostPerHour (sum) and dryCostPerHour (sum minus fuel), plus confidence score (0.85 if enough data, 0.55 if not), plus breakdown for UI.

**Acceptance:** N20957 with 142 flight hours → API returns wetCostPerHour with all components broken out.

## Feature 7.5 — Aircraft Profitability Dashboard

**Why:** Make math visible. "Is this plane making money?"

**Files:**
- /app/(app)/aircraft/[id]/economics/page.tsx
- /components/economics/ProfitabilityCard.tsx
- /components/economics/CostBreakdownChart.tsx (Recharts)
- /components/economics/RevenueVsCostChart.tsx
- /components/economics/ReserveStatusCard.tsx

**UI:** Per-aircraft card showing Revenue/True Cost/Net Profit/Per Hour, color-coded green if profit ≥0 else red. Cost breakdown pie/bar chart. Revenue vs Cost line chart over 12 months. Reserve status cards: engine TBO remaining, prop overhaul remaining.

**Linked from:** AircraftDetail header tab.

**Acceptance:** Owner opens N20957 → sees real revenue/cost/profit/per-hour, color-coded, with charts.

## Feature 7.6 — AI Aircraft Analysis

**Why:** Plain-English summary per aircraft.

**Files:**
- /lib/ai/analyzers/aircraft-analysis.ts
- /app/api/aircraft/[id]/analysis/route.ts
- /components/economics/AIAnalysisCard.tsx

**Logic:** Given aircraft revenue YTD + costs by category + flight hours + maintenance history + Hobbs/Tach + comparable rates in region (if available), Claude generates 3-paragraph plain-English summary with: (1) overall profitability story, (2) 2-3 specific observations (underfunded reserves, fuel trending up, rate vs market), (3) recommendations.

**Cache:** 24-hour cache per aircraft. Refresh button triggers new call.

**Use lib/ai/anthropic.ts.**

**Acceptance:** Click "Generate Analysis" on aircraft economics page → within 30s, AI summary card renders with 3 paragraphs.

## Feature 7.7 — Tax-Time P&L PDF Report

**Why:** Owners pay accountants $500-2000 to do this manually. We do it in one click.

**Files:**
- /app/(app)/reports/tax-pnl/page.tsx
- /lib/reports/tax-pnl-generator.ts
- /lib/reports/pdf-generator.ts (using @react-pdf/renderer)
- /app/api/reports/tax-pnl/[year]/route.ts

**PDF contents:** Per aircraft, full-year P&L statement matching IRS Schedule C / aircraft business categories. Revenue (rental, charter, dry lease). Operating expenses (fuel, oil, maintenance breakdowns, parts, insurance, hangar, database subs, training, property tax). MACRS depreciation schedule (5-year for aircraft). Net income. Net per flight hour. Supporting documents count + linked.

**Year picker** + Generate button + history of past reports.

**Acceptance:** Owner picks 2025 → clicks Generate → 10s later PDF downloads with full statement.

## Feature 7.8 — Source Priority Framework

**Why:** Generalizes 4.3 confidence-scoring system-wide. Uploaded receipts beat estimates, official logbooks beat ADSB-inferred, etc.

**Files:**
- /lib/source-priority.ts (the constants + helper functions)
- /supabase/migrations/081_source_overrides.sql
- /lib/source-priority/audit.ts (audit log)
- Refactor sprint 4.3 confidence scores to use this framework

**Constants:** SOURCE_PRIORITY = { official:5, uploaded:4, connected:3, tracked:2, estimated:1 }

**Types:** SourceOverride (id/orgId/entityType 'meter_reading'|'cost_entry'|'aircraft_field'|'compliance_item'/entityId/fieldName/oldValue/newValue/oldSource/oldPriority/newSource/newPriority/documentId/triggeredBy/notes/createdAt).

**Logic:** When new data arrives, check existing for same entity+field. If new priority > existing → automatic override + audit log. If ≤ existing → log as "alternate source" but don't override. UI shows badge per field: Verified (uploaded) / Synced (Airbly) / Estimated (ADSB).

**Acceptance:** Estimated fuel YTD = $4,260. Owner uploads receipt totaling $4,470. System creates source_overrides row, updates cost to $4,470, audit log shows swap.

---

# PHASE 3 — Commercial Layer

## Feature 3.1 — Per-aircraft Billing / Tax / Contract Pricing

**Why:** MRO buyers expect per-tail rate overrides.

**Types to add**

```typescript
interface AircraftPricing {
  aircraft: string                // tail number
  contractRates: ContractRate[]
  defaultDiscountPct: number      // applies to all parts/labor
  taxOverride?: TaxProfile
  billingProfile?: BillingProfile
  splitBilling?: SplitBilling
  createdAt: string
  updatedAt: string
}

interface ContractRate {
  department: "airframe" | "engine" | "avionics" | "interior" | "shop"
  laborRate: number
}

interface TaxProfile {
  rate: number
  jurisdiction: string
  exempt: boolean
  exemptionId?: string
}

interface BillingProfile {
  termDays: number                // net 15, net 30
  poRequired: boolean
  emailInvoiceTo: string[]
}

interface SplitBilling {
  customers: { customerId: string; percentage: number }[]
}
```

**DataStore changes**
- Add `aircraftPricing` keyed by tail.

**Integration**
- WO and Invoice generation: when computing labor totals, look up `aircraftPricing` and apply contract rates / discount / tax override / split-billing logic.
- AircraftDetail: new "Pricing" tab to edit overrides.

**Acceptance**
- An aircraft with a contract rate of $145 for Avionics and a 10% discount produces a WO with those values applied automatically.

---

## Feature 3.2 — Cores / Rotables + Serialized Components

**Why:** Different lifecycles for different parts classes.

**Already partially scoped** in Feature 2.1's `InventoryPart.partClass`. Now add component records:

**Types to add**

```typescript
interface SerialComponent {
  id: string
  partNumber: string
  serialNumber: string
  description: string
  componentClass: "engine" | "propeller" | "magneto" | "alternator" | "starter" | "other"
  installedOnAircraft?: string    // current installation
  installedDate?: string
  installedHours?: number
  hoursSinceOverhaul: number
  hoursSinceNew: number
  removalHistory: ComponentMove[]
  status: "installed" | "in-stock" | "in-overhaul" | "scrapped"
  createdAt: string
  updatedAt: string
}

interface ComponentMove {
  date: string
  fromAircraft?: string
  toAircraft?: string
  fromStatus: string
  toStatus: string
  workOrder?: string
  notes: string
}

interface CoreObligation {
  id: string
  workOrder: string
  customer: string
  partNumber: string
  description: string
  coreCharge: number              // $ deposit
  dueDate: string                 // when core must be returned
  status: "pending" | "received" | "overdue" | "waived"
  receivedDate?: string
  notes: string
  createdAt: string
  updatedAt: string
}
```

**DataStore changes**
- Add `serialComponents`, `coreObligations` state + CRUD.

**Integration**
- AircraftDetail: "Engines & Props" tab shows current SerialComponents installed + history.
- WorkOrderPanel: when adding a rotable line item with a core charge, auto-create a `CoreObligation`.

**Acceptance**
- Engine record persists across aircraft moves; cores roll up into a "Cores Pending" widget on Dashboard.

---

## Feature 3.3 — QuickBooks Online integration

**Why:** Commercial gating factor.

**Files to create**

```
/src/app/components/integrations/QBOSettings.tsx          // route /app/settings/integrations/qbo
/src/app/components/integrations/QBOSyncStatus.tsx
/src/app/components/integrations/QBOFieldMapping.tsx
/src/server/qbo/                                          // (NEW backend folder — will need server)
```

**Backend required** — flag this clearly. Frontend only stores config and triggers sync calls.

**Types to add**

```typescript
interface QBOConfig {
  enabled: boolean
  realmId: string                 // QBO company id
  accessTokenRef: string          // server-side reference, never store token in localStorage
  workOrderProfile: QBOProfile
  otcProfile: QBOProfile
  poProfile: QBOProfile
  defaultIncomeAccount: string
  defaultExpenseAccount: string
  defaultTaxCode: string
  lastSyncAt?: string
}

interface QBOProfile {
  itemMapping: Record<string, string>     // local category → QBO item id
  classMapping?: Record<string, string>   // local department → QBO class
  customerSyncDirection: "to-qbo" | "from-qbo" | "two-way"
}
```

**Routes**
- `/app/settings/integrations/qbo` → setup + sync controls.

**Integration**
- Settings page gets an Integrations sub-section.
- Invoice / WO close → optionally push to QBO via backend.

**Acceptance** (frontend only for now)
- User connects QBO (OAuth flow placeholder), maps fields, sees sync status and last-sync timestamp.

---

# Cross-cutting concerns

## Reminders + Start + Due trio (Coast pattern)

Add these three optional fields to **every** entity that has actionable timing:
```typescript
dueDate?: string
startDate?: string
reminders?: ReminderSpec[]   // [{ offset: "1 day before" | "10 minutes before" | "1 day after", channel: "in-app" | "email" }]
```

Already implicitly on WO. Add to: Inspection, ComplianceItem, ContinuedItem, ApprovalRequest, PurchaseOrder.

## Asset / Location hierarchy

Add `parentId?: string` to:
- Aircraft (for fleet → aircraft → engine when SerialComponents land)
- Vendor (for vendor → branch)
- Location (when you add a Locations entity if needed)

## Bulk Update Queue + Trash

Two utility features that don't need their own routes — embed in Settings:
- **Trash:** soft-delete instead of hard-delete. Add `deletedAt?: string` to every entity. `deleteX(id)` sets it; create `restoreX(id)` and `permanentDelete(id)`. Trash page lists everything with `deletedAt`.
- **Bulk Update Queue:** when user multi-selects rows in any list view, offer "Bulk update status / assignee / category". Implement as a generic helper that takes `(module, ids, patch)`.

## Configurable Dashboard widgets

Refactor `Dashboard.tsx`:
- Each KPI tile becomes a `<DashboardWidget />` with `kind`, `title`, `module`, `filter`, `position`.
- User can drag to reorder, favorite (Coast's "Favorites" tab), and add new widgets from a library.
- Persist to a new `dashboardLayout` localStorage key per user.

---

# Implementation order — ship-friendly

| Sprint | Features | Time |
|---|---|---|
| **0a** | 0.1 Multi-Org / Multi-Location data model | 2 weeks |
| **0b** | 0.2 Persona system | 1 week |
| **0c** | 0.3 AI Orchestration foundation | 3 weeks |
| **0d** | 0.4 Notification system | 1 week |
| 1 | 1.1 Meter Profiles | 1 week |
| 2 | 1.2 Compliance | 2 weeks |
| 3 | 1.3 Inspections + Procedures | 2 weeks |
| 4 | 1.4 Continued Items | 1 week |
| 5 | 1.5 Customer Approvals | 2 weeks |
| 6 | 2.1 Parts Inventory + POs | 2 weeks |
| 7 | 2.2 Vendor Management | 1 week |
| 8 | 2.3 Per-WO Time Clock | 1 week |
| 9 | 2.4 Multi-view system | 2 weeks |
| 10 | 2.5 Workforce: Scheduler + Time Off + Daily Clock | 3 weeks |
| 11 | 2.6.1 Tool Management & Calibration | 2 weeks |
| 12 | 2.6.2 Document Expiration & Reminders | 1 week |
| **13** | **4.1 Airbly Integration** | 2 weeks |
| **14** | **4.2 FlightSchedule Pro Integration** | 1 week |
| **15** | **4.3 ADSB Fallback (Exchange + FlightAware)** | 2 weeks |
| **16** | **4.4 Tach-Time Inference Engine** | 1 week |
| **17** | **5.1 Smart Home Screen** | 2 weeks |
| **18** | **5.2 AI Inbox / Action Cards** | _included in 0.3_ |
| **19** | **5.3 Predictive Maintenance ML** | 3 weeks |
| **20** | **5.4 Voice & Camera Input** | 2 weeks |
| **21** | **5.5 AI Inspector** | 1 week |
| **22** | **5.6 Smart Customer Approvals (AI explanations)** | 1 week |
| **23** | **5.7 QBO Auto-Reconciliation** | 1 week |
| **24** | **6.1–6.9 Org Admin pages (batch)** | 2 weeks |
| 25 | 3.1 Per-aircraft Pricing | 1 week |
| 26 | 3.2 Cores/Rotables | 2 weeks |
| 27 | 3.3 QuickBooks (one-way push) | 1 week |
| 28 | Cross-cutting (reminders, hierarchy, trash, bulk, dashboard) | 2 weeks |

**Total: ~46 weeks of focused work** for the full Tesla/Apple-grade product. **First shippable MVP at sprint 17** (~30 weeks) — Phase 0–2.6 + Phase 4 + Smart Home Screen.

## Phasing strategy

| Stage | Weeks | What ships | Why |
|---|---|---|---|
| **MVP** | 0–17 | Foundation + aviation core + telemetry + smart home | The "wow" demo: voice in, AI cards, auto-tach. Sellable. |
| **V1** | 18–24 | All AI experience features + Org admin | Tesla-grade polish. |
| **V2** | 25–28 | Commercial layer + cross-cutting polish | Enterprise-ready. |

---

# Routes summary (final state)

```
/                              → HomePage
/pricing                       → PricingPage
/scanning                      → ScanningPage
/login, /signup                → auth
/approve/:token                → CustomerApprovalView (PUBLIC)

/app                           → Dashboard
/app/aircraft                  → AircraftList
/app/aircraft/:id              → AircraftDetail (tabs: Overview, Times, Compliance, Continued, Engines, Pricing)
/app/ask                       → AskPage
/app/documents                 → DocumentsPage
/app/maintenance               → MaintenanceEntry
/app/marketplace               → MarketplacePage
/app/workspace                 → ChatWorkspace
/app/work-orders               → WorkOrdersPage          (NEW dedicated route)
/app/invoices                  → InvoicesPage            (NEW dedicated route)
/app/logbook                   → LogbookPage             (NEW dedicated route)
/app/meters                    → MetersPage              (Phase 1)
/app/compliance                → CompliancePage          (Phase 1)
/app/inspections               → InspectionsPage         (Phase 1)
/app/procedures                → ProceduresPage          (Phase 1)
/app/approvals                 → ApprovalsPage           (Phase 1)
/app/parts                     → PartsInventoryPage      (Phase 2)
/app/purchase-orders           → PurchaseOrdersPage      (Phase 2)
/app/vendors                   → VendorsPage             (Phase 2)
/app/scheduler                 → SchedulerPage           (Phase 2.5 — Workforce)
/app/time-off                  → TimeOffPage             (Phase 2.5 — Workforce)
/app/clock                     → ClockInOutPage          (Phase 2.5 — Workforce)
/app/tools                     → ToolsPage               (Phase 2.6 — Tools)
/app/tools/:id                 → ToolDetail              (Phase 2.6 — Tools)
/app/documents/expiring        → DocumentsPage filtered  (Phase 2.6 — Doc reminders)

/app/locations                 → LocationsPage           (Phase 0 — Multi-loc)
/app/aircraft/:id/sync         → SyncSettingsTab         (Phase 4 — Telemetry)
/app/integrations/airbly       → AirblySetup             (Phase 4)
/app/integrations/fsp          → FlightScheduleProSetup  (Phase 4)
/app/integrations/adsb         → ADSBSettings            (Phase 4)

/app/my-aircraft               → SmartHome (Owner)       (Phase 5)
/app/my-day                    → SmartHome (Mechanic)    (Phase 5)
/app/inbox                     → AIInbox                 (Phase 5)

/app/org/info                  → OrgInfoPage             (Phase 6)
/app/org/settings              → OrgSettingsPage         (Phase 6)
/app/org/billing               → BillingPage             (Phase 6)
/app/org/directory             → DirectoryPage           (Phase 6)
/app/org/invite                → InvitePage              (Phase 6)
/app/org/bookmarks             → BookmarksPage           (Phase 6)
/app/org/bulk-updates          → BulkUpdatesPage         (Phase 6)
/app/org/trash                 → TrashPage               (Phase 6)
/app/profile                   → ProfilePage             (Phase 6)

/app/settings                  → SettingsPage
/app/settings/integrations/qbo → QBOSettings             (Phase 3)
```

---

# Final checklist before each PR

- [ ] New entity added to DataStore with full CRUD
- [ ] New localStorage key follows `myaircraft_workspace_data_v1_*` convention
- [ ] New route added to `routes.tsx` and (if user-facing) to `navItems` in `AppLayout.tsx`
- [ ] New types exported from a single types file (consider creating `/src/types/index.ts` if not already there)
- [ ] Reuses existing UI primitives (rounded-xl card, Tailwind tokens, motion, lucide, sonner)
- [ ] No breaking changes to existing types (use optional fields only)
- [ ] TODO comments where backend will be needed
- [ ] Empty/loading/error states for every list view
- [ ] Acceptance criteria from this spec verified manually

---

That's the full spec. Hand this file to Claude Code one section at a time — pick a sprint, start coding.
