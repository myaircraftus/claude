# myaircraft.us — Full Developer Handout
## All Functions, Buttons, Logic & Integration Points

**Stack:** React 18 + TypeScript · React Router (Data Mode) · Tailwind CSS v4 · Motion (Framer Motion) · Lucide React · Sonner (toasts) · localStorage persistence  
**Entry:** `/src/app/App.tsx` → `RouterProvider` → `/src/app/routes.tsx`

---

## TABLE OF CONTENTS

1. [Routing Map](#1-routing-map)
2. [Design System / Tokens](#2-design-system--tokens)
3. [Global State — DataStore](#3-global-state--datastorecontext)
4. [AppLayout — Shell & Navigation](#4-applayout)
5. [PublicLayout — Marketing Shell](#5-publiclayout)
6. [Dashboard](#6-dashboard)
7. [Documents Page](#7-documentspage)
8. [Marketplace Page](#8-marketplacepage)
9. [Chat Workspace](#9-chatworkspace)
10. [Chat Engine (AI Logic)](#10-chatengine)
11. [Artifact Panel](#11-artifactpanel)
12. [Parts Lookup Panel](#12-partslookuppanel)
13. [Enhanced Artifact Panel](#13-enhancedartifactpanel)
14. [Work Orders Page](#14-workorderspage)
15. [Invoices Page](#15-invoicespage)
16. [Logbook Page](#16-logbookpage)
17. [Aircraft List Page](#17-aircraftlist)
18. [Aircraft Detail Page](#18-aircraftdetail)
19. [Ask Page](#19-askpage)
20. [Maintenance Entry Page](#20-maintenanceentry)
21. [Settings Page](#21-settingspage)
22. [Login / Signup Pages](#22-login--signup-pages)
23. [Public Pages](#23-public-pages)
24. [Data Types Reference](#24-data-types-reference)
25. [Mock Data Reference](#25-mock-data-reference)
26. [What Is Wired vs. What Needs Backend](#26-wired-vs-needs-backend)

---

## 1. ROUTING MAP

**File:** `/src/app/routes.tsx`

```
/ (PublicLayout)
  ├── /                   → HomePage
  ├── /pricing            → PricingPage
  └── /scanning           → ScanningPage

/login                    → LoginPage
/signup                   → SignupPage

/app (AppLayout — requires authenticated shell)
  ├── /app                → Dashboard
  ├── /app/aircraft       → AircraftList
  ├── /app/aircraft/:id   → AircraftDetail
  ├── /app/ask            → AskPage
  ├── /app/documents      → DocumentsPage
  ├── /app/maintenance    → MaintenanceEntry
  ├── /app/settings       → SettingsPage
  ├── /app/workspace      → ChatWorkspace
  └── /app/marketplace    → MarketplacePage
```

**Note:** No auth guard is implemented yet. All `/app/*` routes are accessible without login.

---

## 2. DESIGN SYSTEM / TOKENS

**File:** `/src/styles/theme.css`

| Token | Value | Usage |
|---|---|---|
| `--primary` | `#0c2d6b` | Buttons, links, accents |
| `--sidebar` | `#0c2d6b` | Left nav background |
| `--sidebar-accent` | `#163a7a` | Active nav items, aircraft selector |
| `--background` | `#f8f9fb` | Page background |
| `--foreground` | `#0f172a` | Body text |
| `--muted` | `#f1f3f8` | Input backgrounds, subtle fills |
| `--muted-foreground` | `#64748b` | Secondary text, labels |
| `--border` | `rgba(15,23,42,0.08)` | All card/input borders |
| `--destructive` | `#dc2626` | Delete/error states |
| `--radius` | `0.75rem` | Base border radius |

**Motion library:** `import { motion, AnimatePresence } from "motion/react"` — used throughout for fade-in cards, slide-in modals, staggered list items.

---

## 3. GLOBAL STATE — DataStoreContext

**File:** `/src/app/components/workspace/DataStore.tsx`  
**Provider wraps:** All `/app/*` routes via AppLayout (currently not wrapped — **ACTION NEEDED: wrap Outlet in DataStoreProvider**)

### How to consume
```tsx
const { workOrders, addWorkOrder, updateWorkOrder } = useDataStore();
```

### Persistence
All data is **localStorage** only. Keys:
- `myaircraft_workspace_data_v1_logbook`
- `myaircraft_workspace_data_v1_workorders`
- `myaircraft_workspace_data_v1_invoices`
- `myaircraft_workspace_data_v1_customers`

### State Shape

| State | Type | Default |
|---|---|---|
| `logbookEntries` | `LogbookEntry[]` | `[]` |
| `workOrders` | `WorkOrder[]` | `[]` |
| `invoices` | `Invoice[]` | `[]` |
| `customers` | `Customer[]` | 2 seeded customers |

### All Exposed Functions

#### Logbook Entries
| Function | Signature | Returns | Notes |
|---|---|---|---|
| `addLogbookEntry` | `(entry: Omit<LogbookEntry, 'id'|'createdAt'|'updatedAt'>)` | `LogbookEntry` | Auto-generates id, timestamps |
| `updateLogbookEntry` | `(id: string, updates: Partial<LogbookEntry>)` | `void` | Updates `updatedAt` |
| `deleteLogbookEntry` | `(id: string)` | `void` | Hard delete from state |

#### Work Orders
| Function | Signature | Returns |
|---|---|---|
| `addWorkOrder` | `(wo: Omit<WorkOrder, 'id'|'createdAt'|'updatedAt'>)` | `WorkOrder` |
| `updateWorkOrder` | `(id: string, updates: Partial<WorkOrder>)` | `void` |
| `deleteWorkOrder` | `(id: string)` | `void` |

#### Invoices
| Function | Signature | Returns |
|---|---|---|
| `addInvoice` | `(invoice: Omit<Invoice, 'id'|'createdAt'|'updatedAt'>)` | `Invoice` |
| `updateInvoice` | `(id: string, updates: Partial<Invoice>)` | `void` |
| `deleteInvoice` | `(id: string)` | `void` |

#### Customers
| Function | Signature | Returns |
|---|---|---|
| `addCustomer` | `(customer: Omit<Customer, 'id'|'createdAt'>)` | `Customer` |
| `updateCustomer` | `(id: string, updates: Partial<Customer>)` | `void` |

#### Parts Search
| Function | Signature | Returns | Notes |
|---|---|---|---|
| `searchParts` | `(query: string, aircraft: string)` | `PartSearchResult[]` | **MOCK ONLY** — simulates Atlas API. Returns 10-item catalog filtered by P/N or description. If no match, returns top 3. Must replace with real API call. |

#### Data Management
| Function | Signature | Returns |
|---|---|---|
| `exportAllData` | `()` | `string` (JSON) |
| `importData` | `(jsonString: string)` | `void` |
| `clearAllData` | `()` | `void` |

---

## 4. APPLAYOUT

**File:** `/src/app/components/AppLayout.tsx`  
**Route:** Wraps all `/app/*` children via `<Outlet />`

### State
| State | Type | Default | Purpose |
|---|---|---|---|
| `collapsed` | `boolean` | `false` | Sidebar collapse toggle |
| `demoBannerVisible` | `boolean` | `true` | Blue Canyon Aviation demo banner |

### Navigation Items (navItems array)
```
Dashboard     → /app
Workspace     → /app/workspace
Aircraft      → /app/aircraft
Ask           → /app/ask
Documents     → /app/documents
Maintenance   → /app/maintenance
Marketplace   → /app/marketplace
Settings      → /app/settings
```

Active state: `location.pathname === item.href` OR `pathname.startsWith(item.href)` (except `/app` exact match only)

### Buttons / Interactive Elements

| Element | Action | Location |
|---|---|---|
| **Plane logo icon** | Toggles `collapsed` state (expands/collapses sidebar) | Sidebar header |
| **Aircraft selector block** | Visual only — no action wired. **TODO:** open aircraft switcher modal | Sidebar, below logo |
| **Nav links** | `Link` to respective route, highlights active | Sidebar nav list |
| **Bell icon** | Decoration only — shows red dot badge. **TODO:** notifications panel | Top bar |
| **LogOut icon** | `Link to="/"` — navigates to marketing homepage | Top bar |
| **Search input** | Decoration only. **TODO:** global search functionality | Top bar |
| **Open tutorial** button | Decoration only in demo banner. **TODO:** open tutorial flow | Demo banner |
| **Switch persona** button | Decoration only. **TODO:** persona switcher | Demo banner |
| **Marketplace** link | `Link to="/app/marketplace"` | Demo banner |
| **X (close) button** | Sets `demoBannerVisible = false` — permanently hides banner until page refresh | Demo banner |

### Demo Banner
- Background: `bg-gradient-to-r from-[#0c2d6b] to-[#1E3A5F]`
- Text: "Blue Canyon Aviation is open in the Owner lane. Sample records only."
- Animated with `motion.div` height collapse on dismiss

### Main Content Area
- `overflow-hidden` when on `/app/workspace` or `/app/maintenance` (full-height panels)
- `overflow-auto` on all other routes

---

## 5. PUBLICLAYOUT

**File:** `/src/app/components/PublicLayout.tsx`  
Marketing site shell with nav, hero, footer. Contains `<Outlet />` for child public pages.

---

## 6. DASHBOARD

**File:** `/src/app/components/Dashboard.tsx`  
**Route:** `/app`

### Static Data
- `stats` array: 4 KPI cards (Aircraft, Documents Indexed, Upcoming Reminders, Open Squawks)
- `aircraft` array: 3 seeded aircraft with status, nextDue, docs count, lastActivity
- `recentActivity` array: 4 activity items

### Buttons
| Button | Action |
|---|---|
| **Open Workspace** | `Link to="/app/workspace"` |
| **Ask Your Aircraft** | `Link to="/app/ask"` |
| Aircraft card **View Details** links | `Link to="/app/aircraft/{tail}"` — **TODO:** wire up dynamically |

---

## 7. DOCUMENTSPAGE

**File:** `/src/app/components/DocumentsPage.tsx`  
**Route:** `/app/documents`

### State
| State | Type | Default |
|---|---|---|
| `search` | `string` | `""` |
| `activeType` | `string` | `"All"` |
| `showUpload` | `boolean` | `false` |
| `form` | `UploadForm` | See form defaults below |
| `submitSuccess` | `boolean` | `false` |

### UploadForm Shape
```typescript
{
  title: string          // Document title (required)
  docType: string        // From DOC_TYPES list
  visibility: "private" | "team"
  aircraft: string       // Optional — from AIRCRAFT list or empty
  notes: string          // Optional free text
  bookType: "historical" | "present"  // Shown for non-manual types only
  manualAccess: "private" | "free" | "paid"  // Shown ONLY when docType is manual
  price: string          // Number string — shown when manualAccess = "paid"
  file: string           // Filename from file input
  attest: boolean        // Rights attestation — required for free/paid
}
```

### Document Type Categories
**Manual types** (trigger community publishing section):
- `"Maintenance Manual"`, `"Service Manual"`, `"Parts Catalog"`

**All document types** (DOC_TYPES):
- Logbook Entry, Inspection Report, AD Compliance, Certificate, Service Bulletin, Report, Maintenance Manual, Service Manual, Parts Catalog, Other

### Filter Logic
```typescript
filtered = documents.filter(d =>
  `${d.name} ${d.aircraft}`.toLowerCase().includes(search.toLowerCase())
  && (activeType === "All" || d.type === activeType)
)
```

### Revenue Calculation (for paid manuals)
```typescript
gross = parseFloat(form.price)
netAfterStripe = Math.max(0, gross - (gross * 0.029 + 0.30))  // Stripe 2.9% + $0.30
uploaderShare = (netAfterStripe * 0.50).toFixed(2)
platformShare = (netAfterStripe * 0.50).toFixed(2)
```

### Buttons & Interactions

| Element | Action |
|---|---|
| **Upload Documents** | Opens upload modal (`showUpload = true`) |
| **Type filter pills** | Sets `activeType` state, filters document list |
| **Eye icon** (per doc row) | **TODO:** open document viewer/preview |
| **Download icon** (per doc row) | **TODO:** trigger file download |
| **Visibility toggle** (Private / Shared with team) | Sets `form.visibility` |
| **Aircraft dropdown** | Sets `form.aircraft` — empty = not aircraft-specific |
| **Book type toggle** (Historical / Present) | Sets `form.bookType` — shown only for non-manual doc types |
| **Manual access options** (Private / Free / Paid) | Sets `form.manualAccess` — shown only when docType is manual |
| **Price input** | Sets `form.price` — shown only when `manualAccess = "paid"` |
| **Rights attestation checkbox** | Sets `form.attest` — required for free/paid community listing |
| **File drop zone / click** | Triggers hidden `<input type="file">` via `fileRef.current?.click()` |
| **Upload & Process button** | Calls `handleSubmit()` — shows success animation, resets form after 2.2s |
| **Modal overlay click** | Closes modal if clicking outside modal card |
| **X (close)** | Closes upload modal |

### Submit Validation
Button enabled only when: `form.title.trim() && form.file`

### Submit Logic (`handleSubmit`)
1. Sets `submitSuccess = true`
2. Shows success animation (checkmark)
3. After 2200ms: resets `submitSuccess`, `showUpload`, `form` to defaults
- **TODO:** Replace with real API call to upload file + save document record

---

## 8. MARKETPLACEPAGE

**File:** `/src/app/components/MarketplacePage.tsx`  
**Route:** `/app/marketplace`

### State
| State | Type | Default |
|---|---|---|
| `tab` | `"browse" \| "seller" \| "moderation"` | `"browse"` |
| `search` | `string` | `""` |
| `typeFilter` | `string` | `"all"` |
| `showPublish` | `boolean` | `false` |
| `publishForm` | `PublishForm` | See defaults |
| `submitSuccess` | `boolean` | `false` |
| `ingestedIds` | `Set<string>` | `new Set()` |
| `showExclusionsOpen` | `boolean` | `false` |

### PublishForm Shape
```typescript
{
  docType: string         // "Maintenance manual" | "Service manual" | "Parts catalog"
  revision: string        // e.g. "Rev C / 2024.1"
  title: string           // Listing title (required)
  make: string            // Aircraft manufacturer (required)
  model: string           // Aircraft model (required)
  description: string     // Listing description
  pdfFile: string         // Filename from file input
  pricing: "free" | "paid"
  price: string           // Number string — used when pricing = "paid"
  launchMode: "publish" | "draft"
  attest1: boolean        // Rights + permission attestation
  attest2: boolean        // Not POH/AFM/logbook attestation
  attest3: boolean        // Content moderation/takedown acknowledgment
}
```

### Seed Data (LISTINGS)
4 seeded listings: 3 × $50 paid, 1 × Free. Fields: `id, price, status, title, make, models, description, type, pages, visibility, rating, reviews, revision, sellerId, sellerName`

`sellerId = "me"` → appears in Seller Dashboard tab

### Browse Tab Logic
```typescript
filtered = LISTINGS.filter(l =>
  (!search || title/models/make.includes(search))
  && (typeFilter === "all" || l.type === typeFilter)
)
```

### Buttons & Interactions

**Header:**
| Button | Action |
|---|---|
| **List a manual** | Sets `showPublish = true` |

**Tab bar:**
| Tab | Sets `tab` to |
|---|---|
| Browse manuals | `"browse"` |
| Seller dashboard | `"seller"` |
| Moderation queue | `"moderation"` |

**Browse Tab — Listing cards:**
| Button | Action |
|---|---|
| **View details** | **TODO:** open listing detail modal/page |
| **Get access** (paid, not owned) | **TODO:** Stripe checkout flow |
| **Open and ingest** (free) | Adds listing id to `ingestedIds` Set — button changes to "Ingested" with checkmark |
| **Publish listing** CTA | Sets `showPublish = true` |

**Seller Dashboard Tab:**
| Button | Action |
|---|---|
| **Add new listing** | Sets `showPublish = true` |
| Row **ExternalLink** icons | **TODO:** open listing edit page |

**Moderation Queue Tab:**
| Button | Action |
|---|---|
| **Approve** (per row) | **TODO:** update listing status to published in DB |
| **Reject** (per row) | **TODO:** reject + notify uploader |

**Publish Modal:**
| Element | Action |
|---|---|
| **Document type select** | Sets `publishForm.docType` |
| **Revision input** | Sets `publishForm.revision` |
| **Title input** | Sets `publishForm.title` |
| **Make input** | Sets `publishForm.make` |
| **Model input** | Sets `publishForm.model` |
| **Description textarea** | Sets `publishForm.description` |
| **PDF file drop zone** | Triggers `fileRef.current?.click()` → sets `publishForm.pdfFile` |
| **Free / Paid pricing toggle** | Sets `publishForm.pricing` |
| **Price input** | Sets `publishForm.price` (shown when pricing=paid) |
| **Launch mode toggle** | Sets `publishForm.launchMode` |
| **Attestation checkboxes (3×)** | Set `attest1`, `attest2`, `attest3` |
| **What belongs / exclusions collapsible** | Toggles `showExclusionsOpen` |
| **Publish listing / Save as draft** button | Calls `handleSubmitPublish()` |
| **Overlay click / X close** | Closes modal, resets form |

### Submit Validation
```typescript
canSubmit = title.trim() && make.trim() && model.trim() && attest1 && attest2 && attest3
```

### Submit Logic (`handleSubmitPublish`)
1. Sets `submitSuccess = true`
2. Shows success screen
3. After 2500ms: resets everything, closes modal
- **TODO:** Replace with real API call (upload PDF to S3, create marketplace_listing record in DB)

### Revenue Preview Calculation
Same formula as DocumentsPage:
```typescript
gross = parseFloat(price)
netAfterStripe = Math.max(0, gross - (gross * 0.029 + 0.30))
uploaderShare = (net * 0.50).toFixed(2)
platformShare = (net * 0.50).toFixed(2)
```

---

## 9. CHATWORKSPACE

**File:** `/src/app/components/workspace/ChatWorkspace.tsx`  
**Route:** `/app/workspace`

### State
| State | Type | Default |
|---|---|---|
| `threads` | `ChatThread[]` | 3 seeded demo threads |
| `activeThreadId` | `string` | First thread id |
| `selectedAircraft` | `string` | `"N12345"` |
| `inputValue` | `string` | `""` |
| `showAircraftPicker` | `boolean` | `false` |
| `artifact` | `{type: ArtifactType, data: any} \| null` | `null` |
| `showSidebar` | `boolean` | `true` |
| `showArtifact` | `boolean` | `true` |
| `isTyping` | `boolean` | `false` |
| `threadMenu` | `string \| null` | `null` (open thread context menu id) |

### Functions

#### `sendMessage()`
1. Validates `inputValue.trim()` and `activeThread` exist
2. Creates `userMsg: ChatMessage` with `role: "user"`
3. Appends user message to active thread
4. Clears input, sets `isTyping = true`
5. After `800-2000ms` random delay:
   - Calls `generateResponse(userMsg.content, aircraftContext)` from chatEngine
   - Appends AI response to thread
   - If response has `.artifact` → opens artifact panel (`setArtifact`, `setShowArtifact`)
   - Auto-titles thread from first user message if title still contains "New Thread"
   - Sets `isTyping = false`

#### `newThread()`
1. Creates new thread via `createThread("aircraft", selectedAircraft)` from chatEngine
2. Prepends to threads array
3. Sets as active thread
4. Clears artifact panel

#### `handleKeyDown(e)`
- `Enter` (no Shift) → calls `sendMessage()`
- `Shift+Enter` → new line (default textarea behavior)

#### `renderContent(text: string): string`
Light markdown → HTML renderer:
- `**bold**` → `<strong>`
- `*italic*` → `<em>`
- `\n` → `<br/>`
- Pipe-delimited lines → `<table>` with header/body detection (skips `---` separator rows)

#### `ScopeIcon({ scope })`
Renders icon based on thread scope:
- `"aircraft"` → Plane
- `"work-order"` → FileText  
- `"customer"` → User
- `"general"` → MessageSquare

### ThreadItem Sub-component
Props: `{thread, active, onClick, menuOpen, onToggleMenu, onPin, onArchive, onDelete}`

| Button/Action | Effect |
|---|---|
| **Thread click** | `onClick()` → sets active thread |
| **⋯ menu icon** (hover) | `onToggleMenu()` → shows/hides context menu |
| **Pin / Unpin** | `onPin()` → toggles `thread.pinned` in state |
| **Archive** | `onArchive()` → sets `thread.archived = true` |
| **Share Thread** | Decoration only. **TODO:** share link generation |
| **Email Summary** | Decoration only. **TODO:** email summary flow |
| **Delete** | `onDelete()` → removes thread from array, selects next available thread |

### Workspace Buttons

| Button | Action |
|---|---|
| **New Chat** | `newThread()` |
| **Thread search input** | Decoration only. **TODO:** filter threads by title |
| **MessageSquare (sidebar toggle)** | Toggles `showSidebar` |
| **Aircraft selector dropdown** | Shows aircraft picker — `setShowAircraftPicker(true)` |
| **Aircraft option** | Sets `selectedAircraft`, closes picker |
| **PanelRightClose / PanelRightOpen** | Toggles `showArtifact` |
| **Artifact chip in message** | Sets `artifact` to message's artifact, `setShowArtifact(true)` |
| **Action buttons in message** (primary/secondary/ghost) | Decoration only. **TODO:** wire to actual actions |
| **Send button** | `sendMessage()` |
| **Textarea** | `setInputValue`, triggers `handleKeyDown` |

### Pinned vs Recent Section Logic
```typescript
pinned section: threads.filter(t => t.pinned && !t.archived)
recent section: threads.filter(t => !t.pinned && !t.archived)
// archived threads: not shown
```

---

## 10. CHATENGINE

**File:** `/src/app/components/workspace/chatEngine.ts`

### Types
```typescript
type ArtifactType = 
  "logbook-entry" | "work-order" | "invoice" | "parts-lookup" |
  "customer-card" | "signature" | "compliance-checklist" | 
  "inspection-checklist" | "thread-summary" | "estimate" | null

interface ChatMessage { id, role, content, timestamp, artifact?, artifactData?, actions? }
interface ChatAction { label, icon?, action, variant?: "primary"|"secondary"|"ghost" }
interface AircraftContext { tailNumber, make, model, serial, year, engine, propeller,
  totalTime, hobbs, tach, owner, ownerCompany, maintenanceProgram,
  lastAnnual, nextAnnual, openSquawks, activeWorkOrders }
interface ChatThread { id, title, aircraft?, customer?, workOrder?,
  pinned, archived, messages, createdAt, updatedAt,
  scope: "aircraft"|"customer"|"work-order"|"general" }
```

### Mock Aircraft DB (`AIRCRAFT_DB`)
Three seeded aircraft contexts keyed by tail number:
- `N12345` — Cessna 172S Skyhawk SP (2006), Lycoming IO-360-L2A, owner: John Mitchell
- `N67890` — Piper PA-28-181 Archer III (2001), Lycoming O-360-A4M, owner: Horizon Flights Inc.
- `N24680` — Beechcraft A36 Bonanza (1998), Continental IO-550-B, owner: Steve & Karen Williams

### Intent Detection (`INTENT_MAP`)
Runs regex patterns against user input in order. First match wins.

| Intent | Trigger Patterns (examples) | Artifact Produced |
|---|---|---|
| **Logbook entry** | "prepare logbook entry", "create maintenance entry", "return to service", "log this work" | `"logbook-entry"` |
| **Work order** | "generate work order", "create work order", "start job", "new work sheet" | `"work-order"` |
| **Invoice** | "generate invoice", "create invoice", "bill customer", "summarize charges" | `"invoice"` |
| **Parts lookup** | "find alternator", "search part", "look up brake", "parts catalog", "IPC" | `"parts-lookup"` |
| **Customer card** | "show customer", "view customer history", "create customer", "customer profile" | `"customer-card"` |
| **Active work orders** | "show active work orders", "list open jobs" | `null` (table in chat) |
| **Overdue invoices** | "show overdue invoices", "who hasn't paid", "unpaid balance" | `null` (table in chat) |
| **Inspection checklist** | "inspection checklist", "annual checklist", "100-hour checklist" | `"inspection-checklist"` |

### Logbook Entry Sub-intent Detection
Within the logbook intent, further detection determines entry type:
- `/annual/i` → "Annual Inspection Signoff"
- `/100.?h/i` → "100-Hour Inspection Signoff"
- `/oil\s?(change|service)/i` → "Oil Change"
- `/\bAD\b|airworthiness directive/i` → "AD Compliance"
- Default → "Standard Maintenance"

### Inline Command Patterns (`INLINE_COMMANDS`)
Matched AFTER intent map for work-order modification commands:

| Pattern | Response |
|---|---|
| `"add 2.5 hours labor"` | Confirms labor line addition |
| `"add part [P/N]"` | Confirms part addition |
| `"set squawk to [text]"` | Updates squawk text |
| `"mark awaiting parts"` / `"mark closed"` | Confirms status change |
| `"summarize work order"` | Returns full cost summary with generate invoice/entry CTA |

### Fallback Responses (`getFallbackResponse`)
Special keyword catches before generic fallback:
- `"last annual"` → returns last/next annual dates + days remaining
- `"total time"` → returns TT, Hobbs, Tach
- `"open squawk"` → lists open squawks or confirms clean
- `"hello/hi/hey"` → welcome message with capability list

### Counters (module-level)
```typescript
let woCounter = 1048   // Increments on each work order generation → WO-2026-XXXX
let invCounter = 2031  // Increments on each invoice generation → INV-2026-XXXX
```
**Note:** These reset on page refresh. Must be moved to DB sequence for production.

### `generateResponse(input, aircraft): ChatMessage`
Main export. Runs intent map → inline commands → fallback. Returns fully formed `ChatMessage`.

### `createThread(scope, aircraft?): ChatThread`
Creates new thread with system welcome message. Used by `newThread()` in ChatWorkspace.

---

## 11. ARTIFACTPANEL

**File:** `/src/app/components/workspace/ArtifactPanel.tsx`  
**Used by:** ChatWorkspace (right panel)

Routes to sub-panel based on `type` prop:
- `"logbook-entry"` → `LogbookEntryPanel`
- `"work-order"` → `WorkOrderPanel`
- `"invoice"` → `InvoicePanel`
- `"parts-lookup"` → `PartsLookupPanel` (embedded)
- `"customer-card"` → `CustomerPanel`
- `"inspection-checklist"` → `InspectionChecklistPanel`
- `"compliance-checklist"` → `ComplianceChecklistPanel`
- `null` + unknown → placeholder div

### LogbookEntryPanel
**State:** `body` (entry text), `signed` (boolean), `showSign` (boolean)

| Element | Action |
|---|---|
| Status badge | Shows DRAFT / SIGNED / status from data |
| **Refresh icon** | Decoration. **TODO:** regenerate entry wording via AI |
| **Copy icon** | Decoration. **TODO:** copy entry text to clipboard |
| Entry body textarea | Editable, disabled when `signed = true` |
| **Missing fields warning** | Shows amber warning if `data.missingFields` array non-empty |
| **Sign Entry button** | Sets `showSign = true` → opens SignatureModal |
| Signature display | Shows cursive name + timestamp + cert# when `signed = true` |
| **ComplianceNextSteps** | Checkbox list of required/optional next steps (static, no save) |
| **Download PDF** | Decoration. **TODO:** generate and download PDF |
| **Share Link** | Decoration. **TODO:** generate shareable URL |
| **Email** | Decoration. **TODO:** email to aircraft owner |
| **Print** | Decoration. **TODO:** print dialog |

### SignatureModal
**Sub-component inside LogbookEntryPanel**  
**State:** `drawing`, `hasSignature`, `consent`, `mode: "draw"|"type"`

| Element | Action |
|---|---|
| **Draw Signature / Type Signature toggle** | Sets `mode` |
| Canvas (draw mode) | `onMouseDown` → `startDraw()`, `onMouseMove` → `draw()`, `onMouseUp/Leave` → `endDraw()` |
| **Clear** button | `clearSig()` — clears canvas, resets `hasSignature` |
| Type mode | Displays mechanic name in cursive font (read-only preview) |
| Consent checkbox | Sets `consent` |
| **Cancel** | `onCancel()` |
| **Sign & Seal** | `onSign()` — disabled unless `consent=true` AND (`mode="type"` OR `hasSignature=true`) |

### ComplianceNextSteps
Renders checklist based on `type` prop. Extra items added for Annual and AD entries. Checkboxes are visual only — state not persisted.

### WorkOrderPanel
**State:** `status`, `squawk`, `laborLines[]`, `partsLines[]`

| Element | Action |
|---|---|
| Status dropdown | `setStatus` — visual only, **TODO:** persist to DataStore |
| Squawk textarea | `setSquawk` |
| **Add** labor button | Appends `{desc:"", hours:0, rate:125}` to `laborLines` |
| Labor row inputs | Edit description, hours inline |
| Labor row **trash** | Removes line from array |
| **Add** parts button | Appends `{pn:"", desc:"", qty:1, price:0}` to `partsLines` |
| Parts row inputs | Edit P/N, description, qty inline |
| Parts row **trash** | Removes line from array |
| Totals section | Computed: `laborLines.reduce(hrs*rate)` + `partsLines.reduce(qty*price)` |
| **Generate Entry** | Decoration. **TODO:** trigger logbook entry generation pre-filled from WO |
| **Generate Invoice** | Decoration. **TODO:** trigger invoice generation from WO totals |

### InvoicePanel
**State:** `lines[]` (3 pre-seeded), `taxRate = 0.0825`

| Element | Action |
|---|---|
| **Add** line button | Appends `{desc:"", qty:1, rate:0}` |
| Line item inputs | Edit description, qty, rate inline |
| Line **trash** | Removes line |
| Totals | `subtotal + tax(8.25%)` auto-calculated |
| **Send Invoice** | Decoration. **TODO:** email/send flow |
| **Download PDF** | Decoration |
| **Mark Paid** | Decoration. **TODO:** update payment status |

### CustomerPanel
Displays customer info grid. Buttons: **Email Customer**, **Create Work Order**, **View All Invoices** — all decoration, **TODO**.

### InspectionChecklistPanel
Section-based checklist view. Each section has `items` count and `completed` count (from `data.sections`). Checkboxes visual only.

---

## 12. PARTSLOOKUPPANEL

**File:** `/src/app/components/workspace/PartsLookupPanel.tsx`  
**Used by:** EnhancedArtifactPanel, ArtifactPanel (via parts-lookup type)

### Props
```typescript
{
  initialQuery?: string    // Pre-fills search on mount
  aircraft?: string        // Default "N12345" — context for fit confirmation
  onAddToWorkOrder?: (part: PartSearchResult) => void  // Callback
  onClose?: () => void
}
```

### State
| State | Default |
|---|---|
| `query` | `initialQuery` prop |
| `results` | Populated from `initialQuery` if provided |
| `loading` | `false` |
| `selectedPart` | `null` |
| `sortBy` | `"price-low"` |
| `filterCondition` | `"all"` |

### Functions

#### `handleSearch()`
1. Validates `query.trim()` not empty
2. Sets `loading = true`
3. After **600ms** simulated delay: calls `searchParts(query, aircraft)` from DataStore
4. Sets `results`, `loading = false`

#### `handleKeyPress(e)`
`Enter` key → `handleSearch()`

#### `handleAddToWorkOrder(part)`
Calls `onAddToWorkOrder(part)` prop callback if provided. **TODO:** wire to actual work order state.

#### Sort Logic
```typescript
sortedResults = [...results].sort((a,b) =>
  sortBy === "price-low" ? a.price - b.price :
  sortBy === "price-high" ? b.price - a.price :
  a.vendor.localeCompare(b.vendor)
)
```

#### Filter Logic
```typescript
filteredResults = sortBy === "all" ? sorted : sorted.filter(r => r.condition === filterCondition)
```

### Buttons
| Element | Action |
|---|---|
| **Search button** | `handleSearch()` |
| **Search input** | Updates `query`, Enter triggers search |
| **Condition filter select** | Sets `filterCondition` |
| **Sort select** | Sets `sortBy` |
| **Part card click** | Sets `selectedPart` → expands action buttons |
| **Add to Work Order** | `handleAddToWorkOrder(part)` |
| **ExternalLink icon** | Decoration. **TODO:** open vendor product page |
| **X close** | `onClose()` prop |

### Badge Color Logic
```typescript
conditionBadgeClass(condition):
  "New" → emerald
  "New-PMA" → blue
  "Overhauled" → amber
  "Serviceable" → slate
  "Used" → slate muted

fitBadgeClass(fit):
  includes "Confirmed" → emerald + CheckCircle icon
  includes "Likely" → amber + Info icon
  else → red + AlertTriangle icon
```

### Footer Stats (shown when results > 0)
- Avg Price, Lowest Price (emerald), Highest Price — all computed from `filteredResults`

---

## 13. ENHANCEDARTIFACTPANEL

**File:** `/src/app/components/workspace/EnhancedArtifactPanel.tsx`  
**Alternative artifact panel** — saves directly to DataStore

### Props
```typescript
{ type: ArtifactType, data: any, onClose: () => void }
```

### `handleSave()`
Routes by `type`:
- `"logbook-entry"` → constructs `LogbookEntry` object, calls `addLogbookEntry()` or `updateLogbookEntry()` (checks `data.id`)
- `"work-order"` → constructs `WorkOrder`, calls `addWorkOrder()` or `updateWorkOrder()`
- `"invoice"` → constructs `Invoice`, calls `addInvoice()` or `updateInvoice()`
- Shows `toast.success()` or `toast.error()` via Sonner

### Buttons
| Button | Action |
|---|---|
| **Save (disk icon)** in header | `handleSave()` |
| **Download** | Decoration. **TODO:** PDF generation |
| **Share** | Decoration. **TODO:** share link |
| **X close** | `onClose()` |
| **Save to Database** (footer) | `handleSave()` |
| **Email** (footer) | Decoration. **TODO** |
| **Print** (footer) | Decoration. **TODO** |
| Parts-lookup type | Embeds `<PartsLookupPanel>` — no save/download/print shown |

---

## 14. WORKORDERSPAGE

**File:** `/src/app/components/WorkOrdersPage.tsx`  
**Route:** `/app/maintenance` (currently) — **TODO:** add dedicated `/app/work-orders` route

### State
| State | Default |
|---|---|
| `searchQuery` | `""` |
| `statusFilter` | `"all"` |

### Data Source
`useDataStore()` → `workOrders[]`, `deleteWorkOrder`

### Filter Logic
```typescript
filteredOrders = workOrders.filter(wo =>
  (woNumber + aircraft + customer + squawk).includes(searchQuery)
  && (statusFilter === "all" || wo.status === statusFilter)
)
```

### Stats (computed)
- `total`: `workOrders.length`
- `open`: status is "Open" or "In Progress"
- `awaitingParts`: status is "Awaiting Parts"
- `readyForSignoff`: status is "Ready for Signoff"

### Status Color Map
```
Draft         → slate-100/slate-600
Open          → blue-50/blue-700
In Progress   → indigo-50/indigo-700
Awaiting Parts → amber-50/amber-700
Ready for Signoff → emerald-50/emerald-700
Closed        → slate-100/slate-600
```

### Buttons
| Button | Action |
|---|---|
| **New Work Order** | `Link to="/app/workspace"` — opens workspace to create via AI |
| **Search input** | Sets `searchQuery` |
| **Status filter select** | Sets `statusFilter` |
| **Download icon** | Decoration. **TODO:** export work orders to CSV/PDF |
| **Printer icon** | Decoration. **TODO:** print list |
| Row **Eye icon** | Decoration. **TODO:** open work order detail view |
| Row **Edit icon** | Decoration. **TODO:** open edit form |
| Row **Trash icon** | `confirm()` dialog → `deleteWorkOrder(wo.id)` |

---

## 15. INVOICESPAGE

**File:** `/src/app/components/InvoicesPage.tsx`  
**Route:** Not yet in routes.tsx — **TODO:** add `/app/invoices` route

### State
| State | Default |
|---|---|
| `searchQuery` | `""` |
| `statusFilter` | `"all"` |
| `paymentFilter` | `"all"` |

### Data Source
`useDataStore()` → `invoices[]`, `deleteInvoice`

### Filter Logic
```typescript
filteredInvoices = invoices.filter(inv =>
  (invoiceNumber + customer + aircraft).includes(searchQuery)
  && (statusFilter === "all" || inv.status === statusFilter)
  && (paymentFilter === "all" || inv.paymentStatus === paymentFilter)
)
```

### Stats (computed)
- `total`, `totalAmount`
- `unpaid` count + `unpaidAmount`
- `overdue` count + `overdueAmount`
- `paid` count + `paidAmount`

### Invoice Status Values
`"Draft" | "Sent" | "Paid" | "Overdue" | "Cancelled"`

### Payment Status Values
`"Unpaid" | "Partial" | "Paid"`

### Buttons
| Button | Action |
|---|---|
| **New Invoice** | `Link to="/app/workspace"` |
| **Search input** | Sets `searchQuery` |
| **Status filter** | Sets `statusFilter` |
| **Payment filter** | Sets `paymentFilter` |
| **Download / Printer icons** | Decoration. **TODO** |
| Row **Eye** | Decoration. **TODO** |
| Row **Mail** | Decoration. **TODO:** email invoice to customer |
| Row **Edit** | Decoration. **TODO** |
| Row **Trash** | `confirm()` → `deleteInvoice(inv.id)` |

---

## 16. LOGBOOKPAGE

**File:** `/src/app/components/LogbookPage.tsx`  
**Route:** Not yet in routes.tsx — **TODO:** add `/app/logbook` route

### State
| State | Default |
|---|---|
| `searchQuery` | `""` |
| `statusFilter` | `"all"` |
| `aircraftFilter` | `"all"` |

### Data Source
`useDataStore()` → `logbookEntries[]`, `deleteLogbookEntry`

### Filter Logic
```typescript
filteredEntries = entries.filter(e =>
  (aircraft + type + body + mechanic).includes(searchQuery)
  && (statusFilter === "all" || e.status === statusFilter)
  && (aircraftFilter === "all" || e.aircraft === aircraftFilter)
)
```

### Aircraft Filter Options
Dynamically populated from `Array.from(new Set(entries.map(e => e.aircraft)))`

### Entry Statuses
`"draft" | "signed" | "archived"`

### Buttons
| Button | Action |
|---|---|
| **New Entry** | `Link to="/app/workspace"` |
| **Aircraft filter** | Sets `aircraftFilter` |
| **Status filter** | Sets `statusFilter` |
| **Download / Printer** | Decoration. **TODO** |
| Entry card **Eye** | Decoration. **TODO** |
| Entry card **Edit** (draft only) | Decoration. **TODO** |
| Entry card **Download PDF** | Decoration. **TODO** |
| Entry card **Print** | Decoration. **TODO** |
| Entry card **Trash** (draft only) | `confirm()` → `deleteLogbookEntry(entry.id)` |

### Signed Entry Display
When `entry.status === "signed" && entry.signature`:
- Shows emerald "DIGITALLY SIGNED & SEALED" badge
- Displays mechanic name in cursive font
- Shows signature date + certificate number

---

## 17. AIRCRAFTLIST

**File:** `/src/app/components/AircraftList.tsx`  
**Route:** `/app/aircraft`

Displays list of aircraft. **TODO:** Read from DataStore or API. Currently static seed data.

---

## 18. AIRCRAFTDETAIL

**File:** `/src/app/components/AircraftDetail.tsx`  
**Route:** `/app/aircraft/:id`

Aircraft detail view with documents, logbook, squawks. **TODO:** dynamic data from `:id` param.

---

## 19. ASKPAGE

**File:** `/src/app/components/AskPage.tsx`  
**Route:** `/app/ask`

Simplified question-and-answer interface (not full workspace). **TODO:** wire to AI backend.

---

## 20. MAINTENANCEENTRY

**File:** `/src/app/components/MaintenanceEntry.tsx`  
**Route:** `/app/maintenance`

Full-height maintenance entry form. Uses `overflow-hidden` on the AppLayout main area.

---

## 21. SETTINGSPAGE

**File:** `/src/app/components/SettingsPage.tsx`  
**Route:** `/app/settings`

User/organization settings. **TODO:** wire to user profile API.

---

## 22. LOGIN / SIGNUP PAGES

**Files:** `LoginPage.tsx`, `SignupPage.tsx`  
**Routes:** `/login`, `/signup`

Currently form UI only. **TODO:** wire to Supabase Auth or JWT backend. No auth guard on any route.

---

## 23. PUBLIC PAGES

| File | Route | Notes |
|---|---|---|
| `HomePage.tsx` | `/` | Marketing landing page with animations |
| `PricingPage.tsx` | `/pricing` | Pricing tiers |
| `ScanningPage.tsx` | `/scanning` | Document scanning feature page |
| `PublicLayout.tsx` | `/` wrapper | Navigation + footer shell |

---

## 24. DATA TYPES REFERENCE

### LogbookEntry
```typescript
{
  id: string
  aircraft: string          // Tail number e.g. "N12345"
  makeModel: string         // e.g. "Cessna 172S"
  serial: string
  engine: string
  date: string              // ISO date string
  type: string              // e.g. "Oil Change", "Annual Inspection Signoff"
  body: string              // Full maintenance record text
  mechanic: string
  certificateNumber: string
  status: "draft" | "signed" | "archived"
  totalTime: number
  hobbs?: number
  tach?: number
  signature?: string
  signatureDate?: string
  createdAt: string         // ISO timestamp
  updatedAt: string
}
```

### WorkOrder
```typescript
{
  id: string
  woNumber: string          // e.g. "WO-2026-1049"
  aircraft: string
  makeModel: string
  serial: string
  customer: string
  company?: string
  mechanic: string
  openedDate: string
  closedDate?: string
  status: "Draft"|"Open"|"In Progress"|"Awaiting Parts"|"Ready for Signoff"|"Closed"
  squawk: string            // Customer complaint
  discrepancy: string       // Mechanic finding
  correctiveAction: string
  findings: string
  laborLines: LaborLine[]
  partsLines: PartsLine[]
  outsideServices: OutsideService[]
  internalNotes: string
  customerNotes: string
  totalLabor: number
  totalParts: number
  totalOutside: number
  grandTotal: number
  linkedInvoice?: string
  linkedLogbookEntry?: string
  createdAt: string
  updatedAt: string
}
```

### LaborLine
```typescript
{ id: string, desc: string, hours: number, rate: number, total: number }
```

### PartsLine
```typescript
{
  id: string, pn: string, desc: string, qty: number, price: number, total: number
  vendor?: string, condition?: string
  status?: "Ordered"|"Received"|"Installed"|"Backordered"
}
```

### OutsideService
```typescript
{ id: string, desc: string, vendor: string, cost: number, status?: "Pending"|"Completed"|"Cancelled" }
```

### Invoice
```typescript
{
  id: string, invoiceNumber: string, aircraft: string, customer: string, company?: string
  issuedDate: string, dueDate: string
  status: "Draft"|"Sent"|"Paid"|"Overdue"|"Cancelled"
  laborLines: LaborLine[], partsLines: PartsLine[], outsideServices: OutsideService[]
  subtotalLabor: number, subtotalParts: number, subtotalOutside: number
  taxRate: number, tax: number, shipping: number, total: number
  notes: string
  paymentStatus: "Unpaid"|"Partial"|"Paid"
  amountPaid: number
  linkedWorkOrder?: string
  createdAt: string, updatedAt: string
}
```

### PartSearchResult
```typescript
{
  id: string, pn: string, altPn?: string, desc: string, vendor: string
  price: number
  condition: "New"|"New-PMA"|"Overhauled"|"Serviceable"|"Used"
  fit: "Confirmed"|"Likely fit — verify"|"Check compatibility"
  stock: string, leadTime?: string, imgUrl?: string
}
```

### Customer
```typescript
{
  id: string, name: string, company?: string, email: string, phone: string, address: string
  aircraft: string[]           // Array of tail numbers
  totalWorkOrders: number, openInvoices: number, totalBilled: number, outstandingBalance: number
  lastService: string
  preferredContact: "Email"|"Phone"|"Text"
  notes: string, tags: string[]
  createdAt: string
}
```

---

## 25. MOCK DATA REFERENCE

### Parts Catalog (DataStore.searchParts)
10 seeded parts — searched by P/N or description substring:

| P/N | Description | Vendor | Price | Condition |
|---|---|---|---|---|
| CH48110-1 | Oil Filter — Champion | Aircraft Spruce | $42.50 | New |
| ELT-406AF | ELT 406 MHz — ACR | Chief Aircraft | $485.00 | New |
| ALX-9120 | Alternator 60A — OEM | Aircraft Spruce | $1,285.00 | New |
| RA-2126A | Alternator 60A — PMA | Preferred Airparts | $895.00 | New-PMA |
| ALX-9120-OH | Alternator 60A — OH | Southeast Components | $425.00 | Overhauled |
| BRK-30026-5 | Brake Disc — Cleveland | Aircraft Spruce | $285.00 | New |
| BRK-30026-5L | Brake Disc — PMA | McFarlane Aviation | $195.00 | New-PMA |
| REM38E | Spark Plug — Champion | Aircraft Spruce | $28.50 | New |
| AVAT-12-28 | Battery 12V — Concorde | Chief Aircraft | $385.00 | New |
| TIRE-600-6 | Tire 6.00-6 — Michelin | Aircraft Spruce | $145.00 | New |

### Marketplace Listings (MarketplacePage)
4 seeded listings — see LISTINGS array in MarketplacePage.tsx

### Customers (DataStore)
2 seeded customers: John Mitchell (N12345), Steve Williams (N24680)

---

## 26. WIRED vs. NEEDS BACKEND

### ✅ Fully Wired (Frontend State)
- All CRUD operations for WorkOrders, Invoices, LogbookEntries, Customers via DataStore
- localStorage persistence across all entities
- Chat workspace thread management (create, pin, archive, delete)
- AI intent detection and response generation (mock)
- Parts search with filter/sort
- Logbook entry signature flow (canvas draw + type modes)
- Document upload modal full form logic (visibility, book type, manual monetization)
- Marketplace browse, seller stats, moderation queue (all mock data)
- Marketplace publish form with revenue preview + attestation
- Demo workspace banner with dismiss
- Revenue split calculator (50/50 after Stripe)

### 🔧 Needs Backend Implementation

**Authentication**
- [ ] Login / Signup → Supabase Auth or JWT
- [ ] Auth guard on all `/app/*` routes
- [ ] User profile (mechanic certificate #, role, org)

**Documents**
- [ ] File upload to S3 / Supabase Storage
- [ ] Document OCR processing pipeline
- [ ] Document record save to DB

**Marketplace**
- [ ] PDF upload to S3 with rights management
- [ ] `marketplace_listings` table with moderation states
- [ ] Stripe Connect for uploader payouts (50/50 split)
- [ ] Entitlement system (permanent library access after purchase)
- [ ] Signed download URLs (expiring)
- [ ] Moderation workflow (pending → approved/rejected)
- [ ] Ingest flow (purchased manual → aircraft workspace)

**Parts**
- [ ] Replace `searchParts()` mock with real Atlas API call
- [ ] Parts ordering flow (add to cart → place order)
- [ ] Order status tracking tied to work order PartsLines

**Work Orders / Invoices / Logbook**
- [ ] Persist all DataStore state to Supabase DB
- [ ] PDF generation for logbook entries, work orders, invoices
- [ ] Email delivery (SendGrid or Supabase Edge Functions)
- [ ] Digital signature cryptographic sealing + audit trail

**Chat AI**
- [ ] Replace mock `generateResponse()` with real LLM (OpenAI, Anthropic)
- [ ] Thread persistence to DB
- [ ] Aircraft context retrieval from real records
- [ ] Tool calls: auto-create work orders / logbook entries from AI output

**Notifications**
- [ ] Bell icon → notification panel (Supabase Realtime or polling)
- [ ] Overdue invoice reminders
- [ ] AD compliance alerts

**Aircraft Selector (Sidebar)**
- [ ] Wire aircraft selector to real fleet list
- [ ] Aircraft switcher persists selected aircraft across session

---

*Generated: April 4, 2026 — myaircraft.us codebase snapshot*
