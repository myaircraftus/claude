---
sop_id: "SOP-00"
title: "Conventions, Terminology & Glossary"
module: "conventions"
version: "1.0.0"
status: "active"
last_updated: "2026-05-21"
faa_refs: []
source_file: "mark downs/manuals/myaircraft_universal_product_sop_manual.docx"
---

# myaircraft.us Conventions, Terminology & Glossary — Universal SOP

**Audience:** every reader of every other SOP — product, engineering, QA, support, owners reading the portal, investors.
**Purpose:** the cross-cutting definitions that hold the rest of the SOP library together. If a term used in another SOP is ambiguous, this document is the tiebreaker.

---

## 1. Why this document exists

The other 13+ SOPs are operational specifications for specific modules. They use shared vocabulary — *aircraft*, *owner*, *work order*, *signed*, *org-scoped*, *RLS*, *ATA chapter*, *Hobbs*, *tach*, *AD*, *IA*, *A&P*. If each SOP defines those terms independently, the platform drifts: an "owner" means something subtly different in SOP-04 than in SOP-12; a "signed entry" is defined three different ways across SOP-07 / SOP-08 / SOP-10.

This SOP is the single source of truth for that vocabulary. Every other SOP MUST defer to this one when it uses any term defined here. New SOPs MUST NOT redefine a term that exists here — extend or link instead.

---

## 2. Persona terminology

The platform recognizes a small, fixed set of personas. UI labels, role gates, audit logs, and analytics all reference these.

| Canonical name | Role string | Description | Defined in |
|---|---|---|---|
| Owner | `owner` | Aircraft owner / payee / portal user (often the same person, sometimes not — see SOP-12 §2) | SOP-12 |
| Apprentice | `apprentice` | Mechanic-in-training; cannot sign | SOP-10 |
| A&P Mechanic | `mechanic` | FAA-certified Airframe + Powerplant | SOP-10 |
| IA (Inspection Authorization) | `ia` | A&P with §65.91 IA — signs annuals + major repairs | SOP-10 |
| Lead Tech / Shop Foreman | `lead` | Senior mechanic with supervision authority | SOP-10 |
| Service Writer / Admin | `admin` | Customer-facing, scheduling, billing setup | SOP-10 |
| Parts Specialist | `parts` | Inventory only | SOP-10 / SOP-09 |
| Billing | `billing` | Financial reports + AR/AP | SOP-10 |

UI persona overlays (different concept from role): `owner`, `shop`, `admin`. The user picks via the topbar persona switcher. The role gates what you CAN do; the persona controls what you SEE.

**Never write:** "mechanic" lowercase when you mean the role string. **Always write:** `mechanic` in code/copy when referring to the role. Use "the mechanic" or "the A&P" in human-facing prose.

---

## 3. Aircraft terminology

| Term | Definition |
|---|---|
| **Tail number** (a.k.a. **N-number**) | The FAA registration. Format `N` + digits + optional letters: `N401LP`. Always display uppercase. |
| **Make / model** | Manufacturer + designator: `Cessna 172`. Two separate fields in our data model. |
| **Serial number** | Manufacturer's serial. Free text, often alphanumeric. |
| **Type certificate** | The FAA TC the aircraft was built under. Reference only. |
| **Hobbs time** | Hour meter (typically runs only when the engine oil pressure is up). Used for billing time and some inspection intervals. |
| **Tach time** | Tachometer time. Distinct from Hobbs. Some inspections (notably engine TBO) are tach-based. |
| **Total time** (a.k.a. **Total Airframe Time / TAT**) | Cumulative hours on the airframe since new. |
| **TBO** | Time Between Overhauls. Usually engine-specific. |
| **SMOH** | Since Major OverHaul. Engine hours since last overhaul. |
| **TSN** | Time Since New (for component-level tracking). |
| **AOG** | "Aircraft On Ground" — out of service, generally not flyable. |

**Always show a meter reading with its source.** "Hobbs 1932.3" not "1932.3 hours" alone — tach and Hobbs are different.

---

## 4. Maintenance terminology

| Term | Definition | Reference |
|---|---|---|
| **Squawk** | A reported discrepancy or problem (e.g., "engine rough on descent") | SOP-03 |
| **Work order (WO)** | The active job that addresses one or more squawks or scheduled tasks | SOP-05 / SOP-06 |
| **Estimate** | Quote to the customer before work begins | SOP-04 |
| **Invoice** | Bill after the work is done | SOP-06 |
| **Logbook entry** | The signed compliance record per 14 CFR Part 43 | SOP-07 |
| **Annual inspection** | 14 CFR §91.409(a)(1) — required every 12 calendar months; signed by IA | SOP-07 / SOP-10 |
| **100-hour inspection** | 14 CFR §91.409(b) — required for aircraft used for hire; signed by A&P | SOP-07 |
| **Preventive maintenance** | 14 CFR Part 43 App A items — limited set of work owner-permissive | SOP-07 |
| **Major repair / Major alteration** | Per 14 CFR Part 43 App A — requires IA sign-off and FAA Form 337 | SOP-07 |
| **Form 337** | Major repair/alteration record submitted to FAA | SOP-07 |
| **AD (Airworthiness Directive)** | Mandatory FAA-issued maintenance requirement | SOP-11 |
| **SB (Service Bulletin)** | Manufacturer recommendation; sometimes mandated by AD | SOP-11 |
| **STC (Supplemental Type Certificate)** | FAA approval for a modification | SOP-11 |
| **8130-3** | Authorized Release Certificate ("yellow tag") for a part | SOP-09 |
| **ATA chapter** | System-level classification, 2-digit (00–99). E.g., ATA 32 = Landing Gear. | SOP-11 |
| **JASC code** | FAA's 4-digit system/component code. E.g., JASC 3240 = Wheels and Brakes. | SOP-11 |

---

## 5. Data isolation terminology

| Term | Definition |
|---|---|
| **Organization (org)** | A maintenance shop, a fleet operator, or a single-owner's records — the tenant boundary |
| **Org-scoped** | Data row's `organization_id` matches the user's membership; RLS enforces |
| **RLS (Row-Level Security)** | Supabase PostgreSQL feature that enforces tenant isolation at the database layer |
| **Service role** | The Supabase service-role key bypasses RLS; used only in trusted server contexts |
| **Tenant slug** | The org's URL identifier (e.g., `horizon-flights`) |
| **Reserved segment** | A top-level URL path that is a real route, NOT a tenant slug (`/dashboard`, `/api`, `/sop-library`, …) |
| **Owner-visible** | Boolean flag on documents / squawks / etc. — indicates the row is visible in the owner portal |
| **Customer-facing description** | The version of a line-item or note that an owner sees (vs the internal version) |

See SOP-13 §4 (Multi-Tenancy Architecture) for the proof.

---

## 6. AI / RAG terminology

| Term | Definition |
|---|---|
| **Chunk** | A token-bounded segment of a document, embedded as a vector for retrieval. Stored in `document_chunks`. |
| **Embedding** | A numeric vector that represents semantic meaning. We use OpenAI `text-embedding-3-small` (1536 dims). |
| **HyDE** | Hypothetical Document Embeddings — embed a hypothetical answer instead of the question for better recall. SOP-13 §8.4. |
| **BM25** | A keyword-ranking algorithm. We use PostgreSQL `tsvector`. |
| **Rerank** | A cross-encoder pass that re-scores retrieval candidates by joint relevance. We use Cohere Rerank v3.5. |
| **Page tree** | The hierarchical structure of a document — document → chapter → page → entry. Stored in `page_tree_nodes`. |
| **Tree backfill** | The one-off operation that built `page_tree_nodes` for documents uploaded before tree-builder wiring landed. |
| **Doc type filter** | A soft filter on retrieval that demotes (not excludes) chunks whose document doesn't match the inferred type. |
| **Query router** | The classifier that picks a retrieval strategy. Currently in SHADOW mode — its decision is logged but not enforced. |
| **Citation** | A `[N]` marker in an answer that points to a specific chunk. |
| **Insufficient evidence** | The AI's "I don't know" response when retrieval didn't return enough confidence. |

---

## 7. Status enum terminology

The platform deliberately uses a SMALL number of status enums across modules. New modules MUST reuse these where possible.

### 7.1 Document statuses

`pending` → `parsing` → `ocr_running` → `chunking` → `embedding` → `completed` | `failed`

### 7.2 Work order statuses

`draft` → `awaiting_approval` → `approved` → `in_progress` → `awaiting_parts` | `awaiting_owner` → `completed` → `closed`

Plus `cancelled` and `archived` (terminal).

### 7.3 Estimate statuses

`draft` → `sent` → `awaiting_approval` → `approved` | `declined` → `superseded` (when replaced by a change order) | `expired`

### 7.4 Invoice statuses

`draft` → `sent` → `partial` → `paid_in_full` | `overdue` | `disputed` | `void`

### 7.5 Logbook entry statuses

`draft` → `final` → `signed` (terminal — immutable once signed)

Plus `voided` (terminal — never displays).

### 7.6 Squawk statuses

`open` → `in_diagnosis` → `awaiting_parts` → `in_progress` → `resolved` → `closed`

Plus `verified` (after fly-off check), `deferred`, `cancelled`.

---

## 8. UI conventions

### 8.1 Naming

- Buttons use **Title Case** for primary actions, **sentence case** for secondary.
- Sidebar items use **Title Case Singular** ("Work Order", not "Work orders").
- Form labels use **sentence case** ("Aircraft tail number", not "Aircraft Tail Number").
- Empty-state copy is a sentence: "No work orders yet."
- Error messages MUST be specific. "Couldn't load aircraft list" beats "Something went wrong."

### 8.2 Display formatting

- Dates: ISO-ish — `2026-05-21` (slash version `5/21/2026` only inside customer-facing PDFs by request)
- Date+time: `Jan 5, 2026 · 14:32 UTC` (lower-case meridiem if 12-hour)
- Money: `$4,827.50` (always 2 decimals, always with thousands separator)
- Hours: `1932.3` (always 1 decimal)
- Tail numbers: **uppercase**, no spaces (`N401LP`)
- JASC / ATA codes: render with both label and code (`Wheels and Brakes (ATA 32 · JASC 3240)`)

### 8.3 Color tokens (Tailwind preset)

| Token | Use | Hex |
|---|---|---|
| `brand-50` … `brand-700` | Brand accents, links | Sky-blue scale |
| `emerald-*` | Success, paid, signed, completed | |
| `amber-*` | Warning, awaiting approval, draft | |
| `rose-*` | Errors, AOG, declined, voided | |
| `violet-*` | AI features, simulator, suggestions | |
| `slate-*` | Neutral text, borders, surfaces | |

### 8.4 Iconography

- We use Lucide React. Never mix icon libraries.
- An icon-only button MUST have `aria-label` (a11y).

---

## 9. Reserved file paths

| Path | Purpose |
|---|---|
| `docs/sop/*.md` | The SOP markdown files served by `/sop-library` |
| `docs/incident-response-runbook.md` | Live incident playbook |
| `docs/disaster-recovery-runbook.md` | DR procedure |
| `docs/myaircraft-architecture.md` | Pre-2026-05-19 architecture doc |
| `docs/myaircraft-architecture-updates-2026-05-21.md` | Architecture-updates ledger |
| `docs/SOP_MASTER_BUILD_PLAN.md` | Build plan for the SOP knowledge base |
| `mark downs/manuals/` | Historical / source material (.docx + .pdf originals) — read-only reference |
| `apps/web/lib/sop/parser.ts` | The SOP markdown parser |
| `apps/web/app/sop-library/` | The viewer |
| `apps/web/app/api/sop/` | SOP API surface |

---

## 10. Document control & authorship

Every SOP frontmatter block carries these fields. Always.

```yaml
---
sop_id: "SOP-NN"              # SOP-00 through SOP-99
title: "Human-readable title"
module: "machine-key"          # See §2 of any SOP for category → color
version: "1.0.0"               # Semver-style; major = breaking spec change
status: "active"               # active | draft | deprecated
last_updated: "YYYY-MM-DD"
faa_refs: ["14 CFR 43.9", ...] # Optional — empty array if none
source_file: "..."             # Origin of the content for provenance
---
```

The viewer at `/sop-library` reads these fields directly. Missing fields will not break the viewer but the card will look incomplete.

**Versioning policy:**
- Patch (1.0.x): typo fixes, copy edits, table reordering
- Minor (1.x.0): added section, added acceptance criterion, new diagram
- Major (x.0.0): changed the contract — added a "must not" that previously was permitted, renamed a status, changed an enum value, changed RLS scope

Major version bumps MUST be reviewed by an admin before merging.

---

## 11. Acronyms — quick reference

- **A&P** — Airframe & Powerplant (FAA mechanic certificate)
- **AD** — Airworthiness Directive
- **AOG** — Aircraft On Ground
- **ATA** — Air Transport Association (chapter scheme)
- **BM25** — Best Matching 25 (full-text ranking)
- **CFR** — Code of Federal Regulations
- **DPA** — Data Processing Agreement (GDPR vendor contract)
- **FAA** — Federal Aviation Administration
- **FBO** — Fixed-Base Operator
- **GDPR** — General Data Protection Regulation
- **HyDE** — Hypothetical Document Embeddings
- **IA** — Inspection Authorization
- **JASC** — Joint Aircraft System/Component code
- **JWT** — JSON Web Token
- **LLM** — Large Language Model
- **MRO** — Maintenance, Repair, Overhaul
- **OCR** — Optical Character Recognition
- **PII** — Personally Identifiable Information
- **PMI** — Principal Maintenance Inspector (FAA)
- **PWA** — Progressive Web App
- **RAG** — Retrieval-Augmented Generation
- **RLS** — Row-Level Security (PostgreSQL feature)
- **RPO** — Recovery Point Objective
- **RTO** — Recovery Time Objective
- **SB** — Service Bulletin
- **SLA** — Service Level Agreement
- **SMOH** — Since Major OverHaul
- **SOC2** — Service Organization Controls 2 (audit framework)
- **STC** — Supplemental Type Certificate
- **TAT** — Total Airframe Time
- **TBO** — Time Between Overhauls
- **TC** — Type Certificate
- **TSN** — Time Since New
- **WO** — Work Order

---

## 12. Cross-references

Every SOP carries a "References" section at the end pointing back at related SOPs. If you find yourself defining something that's already in another SOP, link instead of copy. Repetition is the slow death of a knowledge base.

---

**Document control:**
- SOP ID: SOP-00
- Version: 1.0.0
- Status: active
- Last updated: 2026-05-21
- Authors: Claude (Opus 4.7) — derived from `myaircraft_universal_product_sop_manual.docx` + cross-SOP terminology audit
- Next review: 2026-08-21
