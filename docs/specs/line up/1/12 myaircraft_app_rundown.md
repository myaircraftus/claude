# myaircraft.us — Complete Application Rundown
### Duplication Reference · Compiled April 2, 2026
**App URL:** https://myaircraft-claude.vercel.app
**Test Account:** info@myaircraft.us / Aryaman@2011
**Org:** Horizon Flights (Pro plan)
**Stack:** Next.js · Supabase · Vercel · AI/LLM backend · OCR pipeline

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Marketing / Landing Page](#2-marketing--landing-page)
3. [Authentication](#3-authentication)
4. [Dashboard](#4-dashboard)
5. [Aircraft List](#5-aircraft-list)
6. [Aircraft Detail — All Tabs](#6-aircraft-detail--all-tabs)
7. [Documents](#7-documents)
8. [Maintenance — Entry List](#8-maintenance--entry-list)
9. [Maintenance — Create Entry (Full Flow)](#9-maintenance--create-entry-full-flow)
10. [Reminders](#10-reminders)
11. [OCR Review Queue](#11-ocr-review-queue)
12. [Ask (AI Query)](#12-ask-ai-query)
13. [Query History](#13-query-history)
14. [Integrations Hub](#14-integrations-hub)
15. [Community Library](#15-community-library)
16. [Settings](#16-settings)
17. [Admin Panel](#17-admin-panel)
18. [Navigation & Sidebar Structure](#18-navigation--sidebar-structure)
19. [Role & Permission System](#19-role--permission-system)
20. [Data Models & Key Concepts](#20-data-models--key-concepts)
21. [Known Bugs & Rough Edges](#21-known-bugs--rough-edges)

---

## 1. Architecture Overview

```
myaircraft-claude.vercel.app
├── / (marketing single-page with anchor sections)
├── /signin
├── /dashboard
├── /aircraft
│   └── /[tailNumber]          (7-tab aircraft detail)
├── /documents
│   └── /review                (OCR review queue)
├── /maintenance
│   └── /new?draft=[id]        (entry editor with draft ID)
├── /reminders
├── /ask
├── /history
├── /integrations
├── /library
├── /settings                  (4-tab settings panel)
└── /admin                     (platform admin only)
```

**Key technology decisions:**
- **Next.js** (App Router) deployed on Vercel
- **Supabase** for auth (email/password + Google SSO) and PostgreSQL database
- **OCR Pipeline** — uploaded PDFs are processed; low-confidence extractions go to `/documents/review`
- **AI/LLM** — generates FAA-compliant logbook entry narrative from structured inputs; answers natural-language aircraft questions with document citations
- **FAA Registry Integration** — aircraft added by tail number auto-populate make/model/year from FAA database
- **Intersection-observer scroll animations** on marketing page (note: causes screenshot capture issues)

---

## 2. Marketing / Landing Page

**URL:** https://myaircraft-claude.vercel.app/
**Type:** Single-page; all nav items are anchor links (#how-it-works, #product, #solutions, #security, #pricing)

### Hero Section
- Headline: **"The intelligent maintenance platform for modern aviation"**
- Subheadline: "Stop managing aircraft records with spreadsheets and paper logbooks. myaircraft.us gives you AI-powered maintenance tracking, document intelligence, and compliance automation."
- CTAs: **"Start Free Trial"** (primary blue) + **"Watch Demo"** (outline)
- Background: Dark gradient with subtle grid pattern

### Navigation Bar
| Item | Target |
|------|--------|
| How It Works | #how-it-works |
| Product | #product |
| Solutions | #solutions |
| Security | #security |
| Pricing | #pricing |
| Sign In | /signin |
| Get Started | /signin |

### How It Works (3 steps)
1. **Upload Your Documents** — "Drag and drop your maintenance logs, POH, airworthiness directives, and service bulletins. Our OCR pipeline extracts and indexes everything automatically."
2. **Ask Anything** — "Query your aircraft records in plain English. Get instant, citation-backed answers from your own documents."
3. **Stay Compliant** — "Automated reminders for upcoming inspections, AD compliance tracking, and one-click FAA-compliant logbook entry generation."

### Product Features Section
- AI-Powered Document Intelligence
- FAA-Compliant Entry Generation
- Airworthiness Directive Tracking
- Smart Maintenance Reminders
- Multi-Aircraft Fleet Management
- Team Collaboration & Roles

### Solutions Section
**For Flight Schools** — "Manage your entire training fleet from one dashboard. Track maintenance across all aircraft, ensure AD compliance, and keep your records audit-ready."
**For Aircraft Owners** — "Stop juggling paper logbooks and spreadsheets. Keep all your maintenance records organized, searchable, and accessible from anywhere."
**For A&P Mechanics** — "Generate professional, FAA-compliant logbook entries in seconds. Document your work accurately and efficiently."

### Security Section
- End-to-end encryption
- SOC 2 compliant infrastructure
- Role-based access control
- Audit trails for every action

### Pricing Section
| Plan | Price | Key Limits |
|------|-------|------------|
| Free | $0/mo | 1 aircraft, 5 docs, 10 AI queries/mo |
| Pro | $99/mo | 10 aircraft, 50 GB storage, 1000 queries/mo |
| Enterprise | Custom | Unlimited everything, SSO, priority support |

---

## 3. Authentication

**URL:** /signin

### Sign In Page Layout
- Logo + "myaircraft.us" wordmark top center
- Headline: **"Welcome back"**
- Subheadline: "Sign in to your account"
- **"Continue with Google"** button (full-width, white with Google logo)
- Divider: "or"
- Email input field
- Password input field
- **"Sign In"** primary blue button
- Link: "Don't have an account? Sign up"

### Auth Methods
1. **Email/Password** — standard Supabase auth
2. **Google SSO** — OAuth via Supabase

### Session Handling
- JWT-based sessions via Supabase
- Redirects to `/dashboard` after successful auth
- Protected routes redirect to `/signin` if unauthenticated

---

## 4. Dashboard

**URL:** /dashboard

### Layout
Left sidebar (fixed, 168px wide) + main content area

### Dashboard Cards (top row)
| Card | Value Shown | Description |
|------|-------------|-------------|
| Total Aircraft | 3 | Count of aircraft in org |
| Documents | 1 | Total indexed documents |
| Upcoming Reminders | — | Reminders due soon |
| Active Squawks | — | Open maintenance items |

### Aircraft Status Section
Each aircraft shown as a card with:
- Tail number + aircraft name
- Status badge (e.g., "Airworthy")
- Last maintenance date
- Next due item
- Quick-action buttons

### Recent Activity Feed
- Timestamped log of recent actions (uploads, entries, queries)
- Shows actor, action type, and aircraft affected

### Quick Actions Panel
- **Upload Documents** button
- **New Maintenance Entry** button
- **Ask a Question** button

---

## 5. Aircraft List

**URL:** /aircraft

### Page Header
- Title: "Aircraft"
- **"Add Aircraft"** button (top right, blue)

### Aircraft Table
Columns: Tail Number · Name · Type · Status · Documents · Last Maintenance · Actions

**Demo fleet (3 aircraft):**

| Tail | Name | Type | Documents |
|------|------|------|-----------|
| N262EE | cessna 172 | Cessna 172 | — |
| N8812K | Piper PA-28-181 Archer III | Piper PA-28 | — |
| N4421H | Cessna 172S Skyhawk SP | Cessna 172S | 1 (POH) |

### Add Aircraft Modal
When "Add Aircraft" is clicked, a modal opens:
- **Tail Number** field — triggers FAA registry lookup on blur
- Auto-populates: Make, Model, Year, Engine type
- Additional fields: Nickname, Notes
- Submit = creates aircraft record scoped to org

---

## 6. Aircraft Detail — All Tabs

**URL:** /aircraft/[tailNumber]
**Example:** Aircraft detail for N8812K (Piper PA-28-181 Archer III)

The aircraft detail view has **7 tabs** across the top:

```
Overview | Documents | Ask | Timeline | ADs | Reminders | Entries | Settings
```

---

### Tab 1: Overview

**Left column — Aircraft Info card:**
- Registration: N8812K
- Make/Model: Piper PA-28-181 Archer III
- Year: 1994
- Serial Number: (populated from FAA)
- Engine: Lycoming O-360
- Total Time: (hours field)
- Tach Time: (hours field)

**Right column — Status cards:**
- Airworthiness status badge
- Next inspection due
- Open squawks count
- Recent activity summary

---

### Tab 2: Documents

Lists all documents attached to this aircraft.

**Document card fields:**
- Document title (AI-extracted or user-provided)
- Document type badge (POH, Logbook, AD, SB, etc.)
- Upload date
- Page count
- Status badge: Processing | Completed | Failed | Needs Review
- Actions: View · Download · Delete

**Upload flow (from Documents tab):**
1. Click **"Upload"** button (top right of page header)
2. → Navigates to `/documents/upload` with aircraft pre-selected
3. Upload UI: drag-and-drop zone + file picker
4. Select aircraft from dropdown
5. Select document type (POH, Logbook, AD, Service Bulletin, Parts Catalog, Other)
6. Optional: custom title
7. Submit → file enters OCR processing pipeline
8. Status shows "Processing" → moves to "Completed" or "Needs Review"

> **Note:** Direct navigation to `/documents/upload` throws a server-side error in the current build. The upload is accessible only via the Upload button from the documents list.

---

### Tab 3: Ask

Natural-language AI query scoped to this specific aircraft.

- Same 3-panel layout as global /ask
- Aircraft pre-selected in dropdown
- Answers reference this aircraft's documents only

---

### Tab 4: Timeline

Chronological event log for the aircraft:
- Maintenance entries
- Document uploads
- Reminder completions
- AD actions
- Each event shows: date, type icon, description, actor

---

### Tab 5: ADs (Airworthiness Directives)

- Lists applicable ADs for this aircraft type (pulled from FAA database by make/model)
- Columns: AD Number · Title · Effective Date · Compliance Status · Due Date
- Status options: Complied · Not Complied · N/A · Pending Review
- Click AD → opens detail panel with full AD text and compliance notes
- "Mark Complied" action per AD

---

### Tab 6: Reminders

Aircraft-scoped reminders (subset of global /reminders).

- Lists upcoming maintenance reminders
- Fields: Title, Due Date, Hours Remaining, Status
- Quick "Mark Complete" per reminder

---

### Tab 7: Entries

Lists all maintenance logbook entries for this aircraft.

- Columns: Date · Entry Type · Description (truncated) · Mechanic · Total Time
- Click row → opens entry in the maintenance entry editor
- **"New Entry"** button → navigates to `/maintenance/new?draft=[id]`

---

### Aircraft Settings (sub-page)

Accessible via the Settings tab in aircraft detail.

**Sections:**
1. **Aircraft Information** — Edit tail number, make, model, year, serial, engine
2. **Current Times** — Tach time, total airframe time (manual entry)
3. **Danger Zone** — Archive or permanently delete aircraft

---

## 7. Documents

**URL:** /documents

### Page Header
- Title: "Documents"
- Stats row: Total Documents · Indexed · Processing
- **"Upload"** button (top right, blue)

### Filter Bar
- Aircraft dropdown (All aircraft / specific tail)
- Type dropdown (All types / POH / Logbook / AD / Service Bulletin / Parts Catalog / Other)
- Status dropdown (All statuses / Processing / Completed / Needs Review / Failed)
- Search input (search by title)
- **"Filter"** apply button

### Documents Table
Columns: ☐ (select) · Title · Aircraft · Type · Pages · Status · Size · Uploaded

**Demo document:**
- N4421H Cessna 172S POH Excerpt — Aircraft: N4421H — Type: POH — Pages: 2 — Status: **Completed** — Size: 2.5 KB — Uploaded: Mar 29, 2026

### Document Actions (per row)
- Click row → opens document viewer (PDF viewer with extracted text panel)
- Bulk select + bulk delete via checkbox

### Document Detail View
When a document is clicked:
- Left: PDF viewer (paginated)
- Right: Extracted text / metadata panel
- Shows OCR confidence scores per section
- "Send to Review" if confidence is low

---

### Review Queue

**URL:** /documents/review

For documents flagged by the OCR pipeline (low confidence score or ambiguous extraction).

**Layout:**
- Left: list of flagged documents/pages
- Center: document image (scanned page)
- Right: extracted text fields with confidence scores

**Per field:**
- Extracted value (pre-filled by OCR)
- Confidence percentage (e.g., 94%)
- Manual override input
- Accept / Reject buttons

**Actions:**
- **Accept** — confirms OCR extraction, marks field as verified
- **Edit** — modify extracted value before accepting
- **Reject** — clears extraction, requires manual entry
- **"Approve All High Confidence"** bulk action button

---

## 8. Maintenance — Entry List

**URL:** /maintenance

### Page Header
- Title: "Maintenance"
- **"New Entry"** button (top right, blue)

### Filter Bar
- Aircraft dropdown
- Entry Type dropdown
- Date range picker
- Search input

### Entries Table
Columns: Date · Aircraft · Type · Description · Mechanic · Actions

**Demo entries visible:**
- Oil Change entry on N8812K
- Annual Inspection entry
- 100-Hour Inspection entry (appears as draft)

### Entry Row Actions
- Click row → opens entry in editor at `/maintenance/new?draft=[id]`
- Edit icon → same as click
- Delete icon → confirmation modal → permanent delete

---

## 9. Maintenance — Create Entry (Full Flow)

**URL:** /maintenance/new
(With existing draft: /maintenance/new?draft=[uuid])

This is the most complex flow in the application. There are **two modes**: AI Assist and Manual.

---

### Entry Editor Layout

```
┌─────────────────────────────────────────────────────────┐
│  [← Back]        New Maintenance Entry                  │
│                                                         │
│  [✨ AI Assist]  [📝 Manual]   ← Mode toggle tabs       │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Aircraft: [dropdown]    Date: [date picker]      │  │
│  │  Entry Type: [dropdown]                           │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  [Mode-specific content below]                          │
│                                                         │
│  [Save Draft]              [Generate Entry / Submit]    │
└─────────────────────────────────────────────────────────┘
```

---

### Mode A: AI Assist Tab

The AI Assist mode collects structured inputs and generates a FAA-compliant logbook narrative.

**Step 1 — Core Fields:**

| Field | Type | Options / Notes |
|-------|------|-----------------|
| Aircraft | Dropdown | All org aircraft (N262EE, N8812K, N4421H) |
| Date | Date picker | Defaults to today |
| Entry Type | Dropdown | See types below |

**Entry Type options:**
- Annual Inspection
- 100-Hour Inspection
- Oil Change
- Oil Filter Change
- Engine Repair
- Avionics Repair
- Airframe Repair
- Propeller Repair/Overhaul
- Landing Gear Service
- Brake Service
- Fuel System Service
- Electrical System Repair
- Preventive Maintenance
- AD Compliance
- Service Bulletin Compliance
- Return to Service
- Other Maintenance

**Step 2 — Work Description:**

| Field | Type | Description |
|-------|------|-------------|
| Work Performed | Large textarea | Plain-English description of work done |
| Parts Used | Multi-line text | Part numbers, descriptions |
| References | Text | FAA Advisory Circulars, SB numbers, MM references |

**Example filled values:**
- Work Performed: "Performed engine oil and filter change. Drained old oil, replaced with 6 quarts Phillips 66 X/C 20W-50, installed new Champion CH-48110 oil filter. Checked for leaks and verified oil level."
- Parts Used: "Phillips 66 X/C 20W-50 Aviation Oil (6 qt), Champion CH-48110 Oil Filter"
- References: "Piper Service Manual Section 12-20, Continental O-360 Operator's Manual"

**Step 3 — Mechanic Info:**

| Field | Type | Description |
|-------|------|-------------|
| Mechanic Name | Text input | Free text |
| Certificate Type | Dropdown | A&P, IA, Student (supervised), Owner (preventive maint.) |
| Certificate Number | Text input | FAA certificate number |
| Airframe Total Time | Number input | Hours (TTSN at time of work) |
| Engine Time | Number input | Hours since major overhaul (SMOH) |

**Certificate Type options:**
- A&P (Airframe & Powerplant)
- IA (Inspection Authorization)
- Student (supervised)
- Owner (preventive maintenance per FAR 43 Appendix A)

**The Generate Button:**

After all fields are filled, clicking **"Generate Entry"** sends the structured data to the AI backend. The AI:
1. Formats inputs into FAA-compliant logbook language
2. Adds proper regulatory citations (14 CFR Part 43, etc.)
3. Returns a professional multi-paragraph entry text

**Example AI-Generated Output:**
```
On [DATE], performed scheduled engine oil and filter change on aircraft N8812K
(Piper PA-28-181 Archer III, S/N: 2843394).

Work performed in accordance with Piper Service Manual Section 12-20 and
Lycoming O-360 Operator's Manual. Drained engine oil sump, replaced oil filter
with Champion CH-48110, and refilled with 6 quarts Phillips 66 X/C 20W-50
aviation oil (MIL-L-22851D). Engine run-up performed, checked for leaks.
Oil pressure and temperature verified within normal operating range.

Total aircraft time at completion: [TTSN] hours.
Engine time since major overhaul: [SMOH] hours.

I certify that the work described herein was performed in accordance with
14 CFR Part 43 and that the aircraft is approved for return to service.

[Mechanic Name]
A&P Certificate No. [NUMBER]
```

**Post-Generate Actions:**
- **Edit** — modify the generated text before saving
- **Regenerate** — re-run AI generation with same inputs
- **Save as Draft** — persists to database with `draft` status
- **Submit Entry** — finalizes entry (removes draft status, adds to aircraft record)

---

### Mode B: Manual Tab

Direct text entry with all fields visible simultaneously.

**Manual mode fields:**

| Field | Type | Description |
|-------|------|-------------|
| Aircraft | Dropdown | Same as AI mode |
| Date | Date picker | |
| Entry Type | Dropdown | Same options as AI mode |
| Logbook Entry | Large textarea | Full entry text written by user |
| Total Aircraft Time | Number | TTSN in hours |
| Mechanic Name | Text | |
| Certificate Number | Text | FAA certificate |
| Certificate Type | Dropdown | A&P / IA / Student / Owner |
| Signature | Text (placeholder) | Future: digital signature |

**Manual mode buttons:**
- **Save Draft** — saves without finalizing
- **Submit Entry** — finalizes entry

---

### Draft Behavior

When an entry is saved as draft:
- Entry appears in `/maintenance` list with a draft indicator
- Clicking the draft row navigates to `/maintenance/new?draft=[uuid]`
- The `?draft=` query parameter causes the editor to load all saved field values
- Draft can be edited and re-saved or submitted

---

## 10. Reminders

**URL:** /reminders

### Page Header
- Title: "Reminders"
- **"New Reminder"** button (top right)

### Reminder List
Columns: Title · Aircraft · Due Date · Hours Remaining · Status · Actions

**Status options:**
- Upcoming (blue)
- Due Soon (orange — within 30 days / 10 hours)
- Overdue (red)
- Completed (green)

### New Reminder Form (modal or inline)

| Field | Type | Description |
|-------|------|-------------|
| Title | Text | e.g., "Annual Inspection Due" |
| Aircraft | Dropdown | Select aircraft |
| Due Date | Date picker | Calendar date trigger |
| Due Hours | Number | Tach/Hobbs hours trigger |
| Recurring | Toggle | If on, auto-recreates on completion |
| Recurrence Interval | Number | Days or hours between occurrences |
| Notes | Textarea | Additional details |

### Reminder Row Actions
- **Mark Complete** — records completion date/hours, archives reminder (recreates if recurring)
- **Edit** — opens edit form
- **Delete** — confirmation modal

---

## 11. OCR Review Queue

**URL:** /documents/review

Handles documents where the OCR pipeline detected low confidence in text extraction.

### Page Layout

```
┌─────────────────┬──────────────────────────┬──────────────────┐
│  QUEUE LIST     │  DOCUMENT IMAGE VIEWER   │  EXTRACTED TEXT  │
│                 │                          │  WITH FIELDS     │
│  [Doc 1]        │  [Scanned page image]    │  Field 1: [val]  │
│  [Doc 2]        │                          │  Confidence: 94% │
│  [Doc 3]        │  Page X of Y             │  [Accept][Edit]  │
│                 │  [← Prev] [Next →]       │                  │
└─────────────────┴──────────────────────────┴──────────────────┘
```

### Review Actions (per field)
- **Accept** — confirm OCR value as correct
- **Edit** — modify OCR value in inline input
- **Reject** — discard OCR value, mark for manual entry

### Bulk Actions
- **"Approve All High Confidence"** — accepts all fields above threshold (e.g., 90%)
- **"Skip Document"** — moves to next document in queue

### After Review
- Document status changes from "Needs Review" → "Completed"
- Extracted data becomes searchable and available to AI Query

---

## 12. Ask (AI Query)

**URL:** /ask

### Page Layout (3-column)

```
┌──────────────────┬────────────────────────────┬──────────────────┐
│  LEFT PANEL      │  CENTER CHAT               │  RIGHT PANEL     │
│                  │                            │                  │
│  Aircraft:       │  [Ask your aircraft        │  Source Preview  │
│  [All aircraft ▼]│   anything icon]           │                  │
│                  │                            │  Click a         │
│  SUGGESTED       │  "Get citation-backed      │  citation to     │
│  QUESTIONS       │  answers from your own     │  preview the     │
│  ─────────────   │  records. Every answer     │  source document │
│  • When was      │  references the exact      │                  │
│    the last      │  document, page, and       │                  │
│    annual?       │  section."                 │                  │
│  • What oil is   │                            │                  │
│    approved?     │  [Text input ...........]  │                  │
│  • Show all ADs  │              [Ask →]       │                  │
│  • Total airframe│                            │                  │
│    time?         │                            │                  │
│  • Last oil      │                            │                  │
│    change?       │                            │                  │
│  • VFR fuel      │                            │                  │
│    reserves?     │                            │                  │
│                  │                            │                  │
│  RECENT          │                            │                  │
│  ─────────────   │                            │                  │
│  [3 past queries]│                            │                  │
└──────────────────┴────────────────────────────┴──────────────────┘
```

### Query Flow
1. User types question or clicks a suggested question
2. Aircraft dropdown filters which documents are searched
3. AI retrieves relevant passages from indexed documents
4. Response appears in chat with inline citations (e.g., [POH p.4-12])
5. Clicking a citation → right panel shows the source document page
6. Each answer includes: answer text + source list (document name, page, section)

### Suggested Questions (pre-loaded)
- When was the last annual inspection?
- What oil is approved for this engine?
- Show me all ADs applicable to this aircraft
- What is the total time on the airframe?
- When was the last engine oil change?
- What are the VFR fuel reserves per the POH?

---

## 13. Query History

**URL:** /history

### Page Header
- Title: "History"
- Filter bar: Aircraft dropdown + Confidence filter dropdown
- Shows: "3 queries" count

### Filter Options
- **Aircraft:** All aircraft / specific tail number
- **Confidence:** All confidence / High / Medium / Low / Insufficient evidence

### History List

Each entry shows:
- Query text (the question asked)
- Confidence badge (color-coded)
- Timestamp (date + time)
- Source count (e.g., "1 source", "0 sources")
- Bookmark icon (save query for later)
- Expand chevron (see full response inline)

**Demo entries:**
| Query | Confidence | Date | Sources |
|-------|------------|------|---------|
| What are the specific steps for a 100-hour inspection on a Cessna 172S? | Insufficient evidence | Apr 1, 2026, 3:25 AM | 0 |
| prepare 100 hours entry | Insufficient evidence | Apr 1, 2026, 3:25 AM | 1 |
| Show me all ADs applicable to this aircraft | Insufficient evidence | Mar 31, 2026, 10:57 PM | 0 |

> Note: "Insufficient evidence" means no documents in the org contained enough relevant content to answer confidently.

---

## 14. Integrations Hub

**URL:** /integrations

### Page Header
- Title: "Integrations Hub"
- Badge: **"Pro Feature"**
- Subtitle: "Connect your scheduling and operations software to sync aircraft data and auto-generate reminders based on actual flight activity."

### How It Works (3-step banner)
1. **Connect** — Enter your API key from your scheduling software
2. **Auto-Sync** — Aircraft times update automatically on flight completion
3. **Reminders** — Maintenance reminders stay accurate without manual entry

---

### Flight Schools Category (2 available)

**Flight Schedule Pro** — `Available`
- Tag: Flight Schools
- Description: "Sync your FSP fleet directly into myaircraft.us. Aircraft tach/Hobbs times update automatically on flight completion, keeping your hours-based reminders accurate without manual entry."
- Syncs: Aircraft list (from fleet) · Tachometer / Hobbs times · Flight activity (hours-based reminders) · Maintenance Items
- **[Connect]** button (blue, full-width)

**Flight Circle** — `Available`
- Tag: Flight Schools
- Description: "Connect Flight Circle to pull aircraft utilization data and keep tach times current. Ideal for clubs and small flight schools."
- Syncs: Aircraft list · Hobbs / tach times · Usage logs · Squawks / maintenance items
- **[Connect]** button

**MyFBO** — `Coming Soon`
- Tag: Flight Schools
- Description: "Integrate with MyFBO to synchronize fleet data, fuel tracking, and scheduled maintenance for your FBO operations."
- Syncs: Fleet aircraft · Fuel & expense tracking · Scheduled maintenance
- **[Notify me when available]** button

---

### Maintenance Category (0 available, Coming Soon)

**Savvy Aviation** — Coming Soon
- Syncs: Maintenance records · Squawks & discrepancies · Component times / cycles

---

### Charter/135 Category (0 available)

**Avianis** — Coming Soon
- Tag: Charter/135
- Syncs: Fleet data · Flight hours & cycles · Maintenance scheduling

---

### Business Aviation Category (0 available)

**FL3XX** — Coming Soon
- Syncs: Aircraft registry · Trip / flight logs · Hours & cycles

**Leon Software** — Coming Soon
- Syncs: Fleet aircraft · Flight times / FDPs · Maintenance requests

---

### Inbound Webhooks Section

**Webhook Endpoints** — Configure inbound webhooks from your scheduling software
- Expandable section (shows endpoint URL + auth token after expansion)

---

## 15. Community Library

**URL:** /library

### Page Header
- Title: "Community Library"
- Subtitle: "Shared maintenance manuals and parts catalogs from the community"
- **"Upload Manual"** button (top right, blue)

### Monetization Banner
> **"Earn from your uploads:"** Set a price and keep 50% of every sale. Free uploads help the community and build reputation.

### Filter Bar
- Search: "Search manuals, aircraft make, model..."
- Make dropdown: "All Makes"

### Category Tabs
- All (0) · Maintenance Manuals · Parts Catalogs · Free · Paid

### Empty State
- Icon: open book
- "No manuals in the library yet"
- "Be the first to share a maintenance manual or parts catalog with the community."
- **"Upload Manual"** button (centered)

---

## 16. Settings

**URL:** /settings

Four tabs: **Organization · Members · Integrations · Billing · Danger**

---

### Settings Tab 1: Organization

**Organization Details card:**
- Organization name: `Horizon Flights` (editable input + **Save** button)
- Slug: `horizon-flights` (read-only)
- Plan: **Pro** badge

---

### Settings Tab 2: Members

**Team Members card:**
- Count: "0 members"
- **"Invite"** button (with person+ icon)

Invite flow (modal):
- Email input
- Role selector (Owner / Admin / Mechanic / IA / Billing / Viewer / Auditor)
- Send Invite button

---

### Settings Tab 3: Integrations

**Google Drive card:**
- Status: "Not connected — Connect to import PDFs from Google Drive"
- **"Connect Google Drive"** button

---

### Settings Tab 4: Billing

**Current Plan card:**
- Plan: **Pro** — $99/mo
- **"Manage subscription"** link (opens Stripe customer portal)
- Usage metrics:
  - Queries this month: 0 / 1000
  - Storage: 0.00 GB / 50 GB
  - Aircraft: — / 10

---

### Settings Tab 5: Danger Zone

**Danger Zone card** (red border):
- "These actions are permanent and cannot be undone"
- **Delete organization** section:
  - "Permanently delete this organization, all aircraft, documents, and embeddings."
  - Type-to-confirm: `Horizon Flights`
  - **"Delete organization permanently"** button (red, disabled until text matches)

---

## 17. Admin Panel

**URL:** /admin

Only accessible to users with platform-level administrator privileges (separate from org owner).

### Access Denied State (for regular users)
- Red warning icon
- "Access Denied"
- "You do not have platform administrator privileges. Contact support if you believe this is an error."
- **"Return to dashboard →"** link

### Admin Features (when accessible — inferred from route name)
- Platform-wide user management
- Organization oversight
- System health monitoring
- Feature flag management

---

## 18. Navigation & Sidebar Structure

### Sidebar (always visible, left side, 168px)

**Top section:**
- myaircraft.us logo (top left)
- Organization name + collapse toggle: `Horizon Flights ∨`

**Aircraft section (dynamic):**
- Header: "AIRCRAFT"
- List of org aircraft with tail + name:
  - ✈ N262EE — cessna 172
  - ✈ N8812K — Piper PA-28-181 Archer III
  - ✈ N4421H — Cessna 172S Skyhawk SP
- Each aircraft is a direct link to that aircraft's detail page

**Navigation section:**
- 📊 Dashboard → /dashboard
- ✈ Aircraft → /aircraft
- 📄 Documents → /documents
- (separator)
- 🔧 Maintenance → /maintenance
- 🔔 Reminders → /reminders
- 📋 Review Queue → /documents/review
- (separator)
- 💬 Ask → /ask
- 🕒 History → /history
- (separator)
- ⚙ Integrations → /integrations
- 📚 Community Library → /library

**Bottom section:**
- ⚙ Settings → /settings
- ○ Admin → /admin

**Top right of header:**
- 🔔 Notification bell icon
- Avatar circle with user initial (A) — clicking opens user menu (Sign Out)

---

## 19. Role & Permission System

Roles are org-scoped. Each user in an org has one role.

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| **Owner** | Org creator, full access | All actions including delete org, billing |
| **Admin** | Full ops access | Manage users, all aircraft ops, no billing |
| **Mechanic** | A&P technician | Create/edit entries, upload docs, view all |
| **IA** | Inspection Authorization | Same as Mechanic + sign off on annual/100hr |
| **Billing** | Finance contact | View billing, manage subscription only |
| **Viewer** | Read-only | View all data, no write access |
| **Auditor** | Compliance audit | View all data + export reports, no write |

Platform-level `admin` (separate from org role) — grants access to `/admin` panel.

---

## 20. Data Models & Key Concepts

### Organization
```
organizations
  id            uuid
  name          string
  slug          string (unique)
  plan          enum (free | pro | enterprise)
  created_at    timestamp
```

### Aircraft
```
aircraft
  id            uuid
  org_id        uuid → organizations
  tail_number   string (e.g., "N8812K")
  make          string
  model         string
  year          int
  serial_number string
  engine_type   string
  tach_time     float (hours)
  total_time    float (hours)
  status        enum (airworthy | grounded | maintenance)
  created_at    timestamp
```

### Document
```
documents
  id            uuid
  org_id        uuid → organizations
  aircraft_id   uuid → aircraft
  title         string
  type          enum (POH | Logbook | AD | SB | Parts | Other)
  file_url      string (Supabase storage)
  page_count    int
  status        enum (processing | completed | needs_review | failed)
  size_bytes    int
  uploaded_at   timestamp
  embeddings    → vector embeddings table (for AI search)
```

### Maintenance Entry
```
maintenance_entries
  id            uuid
  org_id        uuid → organizations
  aircraft_id   uuid → aircraft
  date          date
  entry_type    enum (Annual | 100hr | Oil Change | ...)
  description   text (the logbook narrative)
  mechanic_name string
  cert_type     enum (AP | IA | Student | Owner)
  cert_number   string
  aircraft_time float (TTSN at time of work)
  engine_time   float (SMOH)
  status        enum (draft | submitted)
  created_at    timestamp
  updated_at    timestamp
```

### Reminder
```
reminders
  id            uuid
  org_id        uuid → organizations
  aircraft_id   uuid → aircraft
  title         string
  due_date      date (nullable)
  due_hours     float (nullable)
  recurring     boolean
  interval_days int (if recurring)
  interval_hours float (if recurring)
  status        enum (upcoming | due_soon | overdue | completed)
  completed_at  timestamp
```

### Query History
```
query_history
  id            uuid
  org_id        uuid → organizations
  aircraft_id   uuid (nullable — if scoped to aircraft)
  query_text    text
  response_text text
  confidence    enum (high | medium | low | insufficient)
  sources       jsonb (array of {doc_id, page, section})
  created_at    timestamp
```

---

## 21. Known Bugs & Rough Edges

| # | Location | Issue | Severity |
|---|----------|-------|----------|
| 1 | `/documents/upload` | Direct URL navigation throws server-side error ("Application error: a server-side exception has occurred") | High |
| 2 | `/documents/upload` | Clicking "Upload" button from Documents list also triggers the same server error | High |
| 3 | History queries | All 3 demo queries show "Insufficient evidence" — indicates documents haven't been indexed for vector search, or embeddings pipeline is disconnected | Medium |
| 4 | `/admin` | Route is visible in sidebar navigation for all users; should be hidden unless user has platform admin role | Low |
| 5 | Marketing page | Intersection-observer animations prevent below-fold content from rendering without scroll interaction | Low |
| 6 | Settings > Members | Shows "0 members" even for the logged-in owner — owner should appear in the member list | Low |
| 7 | Aircraft list | N262EE and N8812K show no documents even though maintenance entries exist | Low |

---

## Appendix A: Complete URL Map

| Route | Page | Auth Required |
|-------|------|---------------|
| / | Marketing landing page | No |
| /signin | Sign in / sign up | No |
| /dashboard | Main dashboard | Yes |
| /aircraft | Aircraft fleet list | Yes |
| /aircraft/[tail] | Aircraft detail (7 tabs) | Yes |
| /documents | Documents library | Yes |
| /documents/review | OCR review queue | Yes |
| /documents/upload | Upload new document | Yes (broken) |
| /maintenance | Maintenance entry list | Yes |
| /maintenance/new | Create entry (AI + Manual) | Yes |
| /maintenance/new?draft=[id] | Edit draft entry | Yes |
| /reminders | Reminder list | Yes |
| /ask | AI query interface | Yes |
| /history | Query history | Yes |
| /integrations | Integrations hub | Yes |
| /library | Community library | Yes |
| /settings | Org settings (4 tabs) | Yes |
| /admin | Platform admin (restricted) | Yes + platform admin |

---

## Appendix B: Key UI Patterns

### Color System
- **Primary blue:** `#2563EB` (buttons, active states, links)
- **Background:** White `#FFFFFF`
- **Sidebar bg:** Light gray `#F9FAFB`
- **Border:** `#E5E7EB`
- **Text primary:** `#111827`
- **Text secondary:** `#6B7280`
- **Success green:** Badge for "Completed" status
- **Warning orange:** "Due Soon" reminders, badge outlines
- **Danger red:** "Overdue", Danger Zone, error states
- **Pro badge:** Blue-purple gradient

### Button System
- **Primary:** Solid blue, white text, rounded-md, padding px-4 py-2
- **Secondary/Outline:** White bg, blue border+text, same sizing
- **Destructive:** Red bg (danger actions)
- **Ghost:** No border/bg, text only, for icon-adjacent actions

### Component Patterns
- **Cards:** White bg, 1px border, rounded-lg, shadow-sm
- **Modals:** Centered overlay, white card, backdrop blur
- **Tables:** Zebra-striped rows (subtle), hover highlight, sortable column headers
- **Status badges:** Small pill with color dot + label
- **Tabs:** Underline-style active indicator (blue line under active tab)
- **Sidebar active state:** Blue-tinted background row, bold text

### Form Patterns
- Labels above inputs (not floating/placeholder-as-label)
- Error states: red border + red helper text below field
- Required fields: asterisk in label
- Dropdowns: custom styled `<select>` with chevron icon

---

*Document compiled by automated session — myaircraft-claude.vercel.app — April 2, 2026*
