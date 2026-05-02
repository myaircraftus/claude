# Final Comparison — aircraft.us vs EBIS + CoastApp + Telemetry + AI

_What you already have, what's missing, and where each missing feature came from._

## The product thesis

We're not building "another CMMS." We're building the **Tesla of aviation maintenance**: AI-first, telemetry-synced, multi-location, persona-aware. Three things make us uncatchable:

1. **Tach time is never typed.** Airbly hardware → FlightSchedule Pro → ADSB inference, in priority order. Confidence-scored.
2. **The AI is the home screen.** Action cards, not dashboards. "Annual due in 18 hours of flight" with a "Schedule" button — not a pie chart of WO status.
3. **Three personas, one app.** Owner / Mechanic / Shop. Same data, completely different surfaces.

---

## What aircraft.us already has (don't rebuild these)

✅ Aircraft list & detail
✅ Work Orders (status, labor lines, parts lines, outside services, totals)
✅ Invoices (status + payment status, tax, line items)
✅ Logbook entries (signed/draft/archived, digital signature)
✅ Customers
✅ Parts search (Atlas mock)
✅ Documents (upload, OCR, marketplace)
✅ Maintenance Entry
✅ AI Chat Workspace (artifacts: WO/invoice/logbook/parts)
✅ Dashboard (KPI cards)
✅ Marketplace (manuals, revenue split, attestation)
✅ Settings, Login/Signup, Public marketing pages

---

## Architectural foundations to build FIRST (Phase 0)

These four go in before any feature work — every later feature depends on them:

| # | Foundation | Why first |
|---|---|---|
| **0.1** | **Multi-Org / Multi-Location data model** | Every entity gets `orgId` + `locationId` from day one. Avoids a massive migration later. Enables fleet owners + multi-base shops. |
| **0.2** | **Persona system** (Owner / Mechanic / Shop) | Same app, three radically different surfaces. Read once, branch UI everywhere via `usePersona()`. |
| **0.3** | **AI Orchestration brain** | Background worker + LLM + tool calls + signal bus. The brain everything plugs into. |
| **0.4** | **Notification system** | One pipeline (in-app / email / push / SMS) for reminders, AI cards, expirations. |

## What's missing — final list (42 features across 9 phases)

Ranked by impact for an MRO/aviation product. Each row says where it came from (E = EBIS, C = Coast, both).

| # | Feature | Source | Why it matters |
|---|---|---|---|
| **1** | **Meter Profiles & Aircraft Times** | E | Without meters, you can't drive anything by hours/cycles. Foundation of everything else. |
| **2** | **Compliance / Maintenance Tracking** | E | Recurring inspections (Annual, 100hr, AD, life-limited parts) by calendar + meter intervals. The core MRO loop. |
| **3** | **Inspections as a first-class module** + Procedures/Checklists templates | C + E | Reusable inspection forms attached to WOs (Annual checklist, 100-hr checklist). Coast does this beautifully. |
| **4** | **Customer Approvals portal** | E | Customer-facing approval page for quoted work. Biggest commercial differentiator. |
| **5** | **Continued Items (deferred maintenance)** | E | Defer found work to next visit, surface on aircraft, move between WOs. |
| **6** | **Parts Inventory + Purchase Orders** (auto-flow) | C | Real inventory with min-on-hand, auto-decrement from WOs, auto-add from POs, low-stock email. |
| **7** | **Vendor Management** | C + E | Track parts vendors and OSR providers as a real entity, link to POs, WOs, parts. |
| **8** | **Per-WO Live Time Clock** | C + E | Tech clocks in/out *per Work Order* with live timer. Hourly rate. Overtime. |
| **9** | **Multi-view system per module** (Calendar / Table / Board / Saved Views) | C | Coast lets users save custom views per module. Productivity multiplier. |
| **10** | **Mechanic Scheduler (shifts)** ⭐ NEW | C | Calendar of who works when. Feeds the WO assignee picker so you don't book a tech who's off. |
| **11** | **Time Off Requests** ⭐ NEW | C | PTO / sick / personal / holiday with approval flow. Blocks WO assignment on those days. |
| **12** | **Daily Clock In/Out** ⭐ NEW | C | General shop attendance clock (separate from per-WO clock #8). Wraps the per-WO entries for payroll/reporting. |
| **13** | **Tool Management & Calibration** ⭐ NEW | E | Torque wrenches, mag testers, lifts — register tools, log calibration cycles, block usage when overdue. IA-grade requirement. |
| **14** | **Document Expiration & Reminders (Owner + Mechanic personas)** ⭐ NEW | E | Existing Documents module + expiration dates + reminder offsets + persona-specific categories (Owner: registration, insurance, lease; Mechanic: A&P, IA, repair-station cert). |
| **15** | **Per-aircraft Billing / Tax / Contract Pricing** | E | Override default rates per tail. Aircraft discounts. Split billing. |
| **16** | **Cores / Rotables + Serialized Components** | E | Distinguish consumables vs rotables vs serialized parts (engines, props). Cores tracking. |
| **17** | **QuickBooks Online integration** | E | #1 commercial gating factor for MRO buyers. |

⭐ Items 10–12 are the **Workforce layer** (Coast's Scheduler + Time Off + Clocking). I'd originally cut these as "HR overkill" — added back because for an MRO shop they're inseparable from Work Order assignment: you can't assign a job to a tech who's off-shift or on PTO.

⭐ Items 13–14 are the **Tools + Time-aware Documents layer**. Tools have calibration cycles that legally gate Work Orders. Documents extend the existing module with persona-tagged categories (Owner vs Mechanic vs Shop) and expiration tracking with reminder offsets — so insurance, registration, A&P certs, IA renewals, and lease agreements all surface before they lapse.

### Phase 4 — Telemetry & Tach-Time Sync (the "no manual readings ever" layer) 🆕

| # | Feature | Source | Why it matters |
|---|---|---|---|
| **18** | **Airbly Integration** | Hardware (~$799 + $15-30/mo, customer-paid) | Gold-standard Hobbs/Tach direct from the engine. Zero manual entry. |
| **19** | **FlightSchedule Pro Integration** | FSP API | Mid-tier sync for flight schools that already pay for FSP. |
| **20** | **ADSB Fallback** (ADSB Exchange primary, FlightAware backup) | Public ADS-B | When owner has no Airbly: track via tail number, infer Hobbs from airborne time + 0.4 hr/cycle. |
| **21** | **Tach-Time Inference Engine** | — | Multi-source priority logic, dedupes, attaches confidence scores (Airbly = 0.95+, ADSB = 0.55-0.75). |

**Cost research:** ADSB Exchange (~$30-100/mo flat) is cheaper at scale than FlightAware (pay-per-query). Use ADSB Exchange as primary fallback, FlightAware as secondary.

**Tach inference research:** Engine runs longer than ADSB-tracked airborne time. Real formula: `Hobbs ≈ ADSB_time + 0.4 hours × flight_cycles` (taxi+runup+cooldown buffer). Tach ≈ Hobbs × 0.85 for piston, × 0.95 for turbine. We surface a confidence badge on every reading so owners know what's measured vs estimated.

### Phase 5 — AI-First Experience (the Tesla layer) 🆕

| # | Feature | Why it matters |
|---|---|---|
| **22** | **Smart Home Screen** (replaces Dashboard) | Stack of action cards by persona — "Annual due in 18 hours" with a "Schedule" button, not a pie chart. |
| **23** | **AI Inbox / Action Cards** | Universal "to act on" feed driven by the AI brain. Snooze, dismiss, resolve. |
| **24** | **Predictive Maintenance ML** | Compression trends, oil consumption, battery voltage — predict failures before they happen. |
| **25** | **Voice & Camera Input** | "Create work order for N12345 left brake" → done. Scan a part tag → adds to WO. Scan a logbook page → drafts an entry. |
| **26** | **AI Inspector** (auto-audits closed WOs) | Catches missing signoffs, unexplained labor overruns, missing photos before they become compliance issues. |
| **27** | **Smart Customer Approvals** (AI-generated explanations) | Customer sees "Cyl #3 dropped 78→64, below 70 = unairworthy" not "Replace cyl $1,400." Approves faster. |
| **28** | **QBO Auto-Reconciliation** | When QBO payment posts, AI matches to invoice and updates payment status. Two-way sync. |

### Phase 6 — Org Admin (formalize what's loose now) 🆕

| # | Feature | Why it matters |
|---|---|---|
| **29** | **Switch Org / Org Info / Settings / Billing / Directory / Invite / Bookmarks / Bulk Update / Trash / Profile** | Coast's full workspace dropdown. The plumbing of a real multi-tenant SaaS. |

### Phase 3 — Commercial Layer (existing, unchanged)

| # | Feature | Source | Why it matters |
|---|---|---|---|
| **30** | **Per-aircraft Billing/Tax/Contract Pricing** + **Cores/Rotables** + **QuickBooks one-way push** | E | Originally items 15-17 — now last because Phase 4-5 deliver more wow earlier. |

---

## Coast-only patterns to also adopt (smaller wins)

- **Reminders + Start Date + Due Date** trio on every entity (not just WOs).
- **Parent Asset / Parent Location** hierarchy (fleet → aircraft → engine; airport → hangar → bay).
- **Auto-WO from meter threshold** ("Create work order every 100 hours" on an aircraft).
- **Procedures / Forms / Checklists** as reusable templates attached to WOs and Inspections.
- **Bulk Update Queue** (batch edit) and **system-wide Trash** with restore.
- **Configurable dashboard widgets** (drag-arrange, favorite tiles).

---

## What you do NOT need to copy

- Coast's **internal team workspaces / chat** — your AI Workspace already covers conversations.
- EBIS's **GSE/EAM/CMMS** generic asset module — your product is aviation-specific; doubling into general assets dilutes positioning.
- EBIS's **EBIS 3.2 → 5 migration tooling** — only matters if you have a legacy version to migrate from.

_(Earlier draft excluded Coast's Scheduler/Time-Off/Clocking — that was wrong. They're now Phase 2.5.)_

---

## Suggested build order (7 phases, ~46 weeks)

**Phase 0 — Foundations (~7 weeks)** 🆕 must-do-first
- Multi-Org / Multi-Location data model
- Persona system (Owner / Mechanic / Shop)
- AI Orchestration brain
- Notification system

**Phase 1 — Aviation foundation (~8 weeks)**
- Meter Profiles · Compliance · Inspections + Procedures · Continued Items · Customer Approvals

**Phase 2 — Operations layer (~6 weeks)**
- Parts Inventory + POs · Vendor Management · Per-WO Time Clock · Multi-view system

**Phase 2.5 — Workforce (~3 weeks)**
- Mechanic Scheduler · Time Off · Daily Clock In/Out

**Phase 2.6 — Tools + Time-aware Documents (~3 weeks)**
- Tool Management & Calibration · Document Expiration & Reminders

**Phase 4 — Telemetry & Sync (~6 weeks)** 🆕 the "no manual entry" promise
- Airbly · FlightSchedule Pro · ADSB Fallback · Tach Inference Engine

**Phase 5 — AI-First Experience (~10 weeks)** 🆕 the Tesla layer
- Smart Home Screen · AI Inbox · Predictive ML · Voice/Camera · AI Inspector · Smart Approvals · QBO Auto-recon

**Phase 6 — Org Admin (~2 weeks)** 🆕
- Switch Org / Info / Settings / Billing / Directory / Invite / Bookmarks / Bulk Update / Trash / Profile

**Phase 3 — Commercial (~4 weeks)** moved to last
- Per-aircraft Pricing · Cores/Rotables · QuickBooks one-way push

### MVP cut

**First shippable demo at sprint 17 (~30 weeks)** — Phase 0 + Phase 1–2.6 + Phase 4 + Smart Home Screen. That's enough to show the wow story: voice in, AI cards, auto-tach. The rest is polish.

The implementation spec for Claude Code is in `Claude_Code_Implementation_Spec.md`.

---

## Why this beats every competitor

| Competitor | What they have | What we have they don't |
|---|---|---|
| **EBIS Cloud** | Most complete CMMS for aviation | AI brain · Tesla home screen · Telemetry auto-sync · Voice/Camera input · Predictive ML · Persona system · Modern stack |
| **Coast** | Beautiful UX, multi-view, hierarchies | Aviation-specific (compliance, RII, FAA-aware) · Telemetry · AI orchestration · Owner persona · Marketplace |
| **FlightLogg.in / Plane-Maintain.it / etc.** | Owner-facing logbook | Shop-facing operations · Compliance engine · Customer Approvals · QBO sync · Multi-persona |
| **CAMP / TraxxAll** | Enterprise corporate aviation | Smaller-shop pricing · Modern UX · AI · Marketplace · Voice |

The four wedges nobody else combines:
1. **Telemetry-first** — auto-tach via Airbly + ADSB.
2. **AI-native** — every screen has an AI suggestion, not a form.
3. **Persona-aware** — owner sees what an owner needs; mechanic sees what a mechanic needs.
4. **Marketplace + Maintenance** — owners can monetize manuals and the same app is their MRO system.
