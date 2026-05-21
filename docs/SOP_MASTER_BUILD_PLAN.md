# myaircraft.us — SOP Knowledge Base Master Build Plan

**Author:** Claude (Opus 4.7) · **Date:** 2026-05-21
**Scope:** the union of PROMPT_SOP_Viewer.md, PROMPT_SOP_OwnerPersona.md, and PROMPT_SOP_FullStack_Admin_RAG.md — plus the user's additional asks (AI Simulator, diagrams, compliance, "anthropic-quality" polish).

---

## 0 · TL;DR for the user

**A lot of this is already shipped.** The SOP library viewer lives at `/sop-library`, it reads markdown files from `docs/sop/`, and 9 of the 11 module SOPs are already authored and live. What's actually missing breaks down into four phases:

| Phase | Deliverable | Status | This-session work |
|---|---|---|---|
| **1** | Two missing SOP markdown files (SOP-11 ATA/JASC, SOP-13 Full-Stack/Admin/RAG) | NEW content | ✅ Building tonight |
| **2** | Two more SOPs (SOP-10 Workforce, SOP-12 Owner Portal) | Need codebase exploration | Next session |
| **3** | Viewer enhancements: full-text search (Fuse.js), AI Query bar, AI Simulator, Mermaid diagrams | NEW UI features | Session after |
| **4** | Compliance pass + SOC2 control mapping + auditor-grade polish | NEW content + UI badges | Final session |

Total estimated effort across phases: ~20–30 hours of focused work. Phase 1 (tonight) is ~3–4 hours. Each phase ships independently and is useful on its own.

---

## 1 · What already exists (so we don't rebuild it)

### 1.1 The viewer

| Path | Lines | What it does |
|---|---|---|
| `apps/web/app/sop-library/page.tsx` | 27 | Server component — lists all SOPs |
| `apps/web/app/sop-library/[slug]/page.tsx` | 119 | Individual SOP reader |
| `apps/web/app/sop-library/sop-library-client.tsx` | 130 | Client-side index UI |
| `apps/web/app/sop-library/layout.tsx` | — | Wraps reader in a layout |
| `apps/web/app/sop-library/print-button.tsx` | — | Print-friendly view trigger |
| `apps/web/lib/sop/parser.ts` | 351 | Frontmatter + markdown parser, server-only |
| `apps/web/app/api/admin/sop/route.ts` | — | List API |
| `apps/web/app/api/admin/sop/[slug]/route.ts` | — | Single-SOP API |

The viewer reads markdown files from `<repo-root>/docs/sop/` (configured in `next.config.mjs` via `outputFileTracingIncludes` so Vercel includes them in the lambda bundle).

### 1.2 SOPs already authored and live

| Slug | Title | Source |
|---|---|---|
| `01-dashboard-create-menu` | Dashboard + Create Menu | `mark downs/manuals/1. dashboard mechanic/` |
| `02-aircraft-master-workspace` | Aircraft Master Record | `mark downs/manuals/2. aircraft master /` |
| `03-squawks` | Squawks (Discrepancies) | `mark downs/manuals/3. squawk/` |
| `04-estimates-deposits-approvals` | Estimate / Quote | `mark downs/manuals/4. estimate/` |
| `05-work-order-execution` | Work Order Execution | `mark downs/manuals/5. wo/` |
| `06-invoices-payments` | Invoicing & Payments | `mark downs/manuals/6. invoicing/` |
| `07-logbook-entries` | Logbook Entry | `mark downs/manuals/7. log book entry/` |
| `08-reports-global-search` | Reports & Global Search | `mark downs/manuals/8 report/` |
| `09-parts-inventory` | Parts & Inventory | `mark downs/manuals/9. parts/` |

Each file has consistent frontmatter:

```yaml
---
sop_id: "SOP-NN"
title: "..."
module: "..."
version: "1.0.0"
status: "active"
last_updated: "YYYY-MM-DD"
faa_refs: ["14 CFR 43.9", ...]
source_file: "..."
---
```

### 1.3 SOPs that PROMPT_SOP_Viewer.md asks for but don't exist yet

| Slug | Title | Where to source | Phase |
|---|---|---|---|
| `10-mechanic-workforce` | Mechanic & Workforce | `mark downs/manuals/SOP-WRK-001_Workforce_Suite.docx` | 2 |
| `11-ata-jasc-codes` | ATA/JASC Code Reference | `mark downs/manuals/ata:jasc code/codex_jasc_ata_taxonomy_prompt 2.md` | **1 (tonight)** |
| `12-owner-portal-experience` | Owner & Customer Portal | Write from codebase exploration per PROMPT_SOP_OwnerPersona.md | 2 |
| `13-fullstack-architecture-rag-admin` | Full-Stack, Admin, RAG | Write per PROMPT_SOP_FullStack_Admin_RAG.md (most material already in `docs/myaircraft-architecture-updates-2026-05-21.md`) | **1 (tonight)** |

The original PROMPT_SOP_Viewer.md also mentions `sop-04-customer-owner-masters` — that scope is **absorbed into SOP-12 (Owner Portal)** as the more comprehensive treatment.

### 1.4 What the viewer can already do

- ✅ List all SOPs as cards on `/sop-library`
- ✅ Render individual SOP markdown with TOC
- ✅ Frontmatter parsing (sop_id, title, FAA refs, version, status, last_updated)
- ✅ Server-side file loading (no client fetch)
- ✅ Tenant routing carve-out (`sop-library` is in `RESERVED_TOP_LEVEL_SEGMENTS`)
- ✅ Admin role gating (route already checks)
- ✅ Print button

### 1.5 What the viewer CAN'T do yet (Phase 3 work)

- ❌ Cross-SOP full-text search (Fuse.js)
- ❌ AI Query bar ("Ask anything about myaircraft.us procedures")
- ❌ **AI Simulator** (user's specific new ask)
- ❌ Mermaid diagrams (markdown-to-SVG)
- ❌ Section anchor links, scroll-spy TOC highlighting
- ❌ Cmd+K command palette
- ❌ Color-coding by module category (Operations / Aircraft / Commercial / People / System)

---

## 2 · Phase 1 deliverables (tonight)

### 2.1 SOP-11 — ATA/JASC Code Reference

**Source:** existing markdown at `mark downs/manuals/ata:jasc code/codex_jasc_ata_taxonomy_prompt 2.md` (626 lines).
**Work:** wrap with the canonical frontmatter, write a real opening section, normalize headings to match the viewer's TOC pattern, file at `docs/sop/11-ata-jasc-codes.md`.

### 2.2 SOP-13 — Full-Stack Architecture, Admin, AI/RAG Engine

The SOC2-grade master technical SOP per PROMPT_SOP_FullStack_Admin_RAG.md. Required sections:

| § | Section | Length target |
|---|---|---|
| 1 | Executive Summary | 2–3 pages |
| 2 | Technology Stack Reference | 1 page table |
| 3 | System Architecture Diagram | ASCII + Mermaid |
| 4 | Multi-Tenancy Architecture | RLS policies + reserved segments + cross-tenant analysis |
| 5 | Authentication & Authorization | Full session lifecycle, role system |
| 6 | Database Architecture | Every table grouped by domain |
| 7 | Document Ingestion Pipeline | 7-step technical breakdown |
| 8 | AI / RAG Query Engine | Query router, retrieval strategies, rerank, LLM gen |
| 9 | Admin Console | Every admin capability |
| 10 | API Design & Security | Every route + security measures |
| 11 | Deployment & Infrastructure | Vercel + Supabase + CI/CD |
| 12 | Observability & Monitoring | Logs, errors, RAG observability, alerting |
| 13 | Data Security & Encryption | SOC2-grade |
| 14 | Backup & Disaster Recovery | RTO/RPO |
| 15 | SOC2 Type II Compliance Posture | CC/A/C/PI/P criteria mapped to controls |
| 16 | Feature Flags & System Configuration | Every env var |
| 17 | Known Issues & Technical Debt | Honest list |
| 18 | Roadmap Integration | Architecture-supports-product story |
| 19 | Acceptance Criteria for the SOP | Meta — when is the SOP done |
| 20 | Codex / Claude Code Implementation Guidance | Per gap, what to build |

**Why this is achievable in one session:** I already wrote `docs/myaircraft-architecture-updates-2026-05-21.md` (the architecture updates doc) which has ~80% of the technical content. SOP-13 is a reformat with the SOC2 + compliance sections added.

### 2.3 Phase 1 PR

Single PR titled "docs(sop): SOP-11 ATA/JASC + SOP-13 Full-Stack Architecture / RAG / Admin" — drops both markdown files into `docs/sop/`. The existing viewer picks them up automatically (the loader scans the directory).

---

## 3 · Phase 2 deliverables (next session)

### 3.1 SOP-12 — Owner / Customer Portal Experience

Per PROMPT_SOP_OwnerPersona.md. Requires real codebase exploration:

1. Find all owner-facing routes (`grep -r "owner" app/`)
2. Map owner authentication path
3. Document owner-visible content controls
4. Document notification flows
5. Document payment flows
6. Document audit events
7. Write the full 21-section SOP per the prompt template

Estimated: 5–7 hours of focused work. Defer to next session — this needs uninterrupted depth and I'm too far into context to do it justice now.

### 3.2 SOP-10 — Mechanic & Workforce

Source: `mark downs/manuals/SOP-WRK-001_Workforce_Suite.docx`. Need a `docx → markdown` step:

```bash
pandoc 'mark downs/manuals/SOP-WRK-001_Workforce_Suite.docx' \
  -o docs/sop/10-mechanic-workforce.md \
  --wrap=none
```

Then write the proper frontmatter and normalize headings.

### 3.3 Catalog table update

Update PROMPT_SOP_Viewer.md's "11 files" list to 13 files (since we add SOP-12 + SOP-13).

---

## 4 · Phase 3 deliverables — viewer enhancements

### 4.1 Full-text search (Fuse.js)

- `npm install fuse.js`
- New file `apps/web/lib/sop/search.ts`
- Indexes title, section headings, paragraph text, table cells
- Threshold 0.3, min match 3 chars, include score + match indices
- Result groups by SOP, sorted by relevance
- UI: dropdown popover with up to 8 results
- Cmd+K opens search modal from anywhere in the admin area

### 4.2 AI Query bar

Existing `/api/query` (the same one the AI Ask uses) gets a NEW context prefix that tells it: "Answer from the SOP library only. Cite SOP section IDs." A new param `sop_only=true` in the query body would let the route filter retrieval to SOP markdown chunks (would require indexing the SOP files into the RAG store first — see §4.4).

Two-tier rollout:
- **v1**: client component that calls existing `/api/query` with SOP context prefix; falls back to "not available" if the endpoint doesn't return SOP-relevant content
- **v2**: index the SOP markdown into the chunks table with `doc_type='sop'`, then add `sop_only` filter to retrieval

### 4.3 **AI Simulator** (the user's specific new ask)

This is the headline feature. A practice surface where users can run through hypothetical workflows guided by AI:

```
┌─ AI Simulator ────────────────────────────────────────────────────┐
│                                                                   │
│  Pick a scenario:                                                 │
│    [ Annual inspection ]   [ Engine failure squawk ]              │
│    [ Pre-purchase ]        [ AD compliance ]                      │
│    [ Owner approval ]      [ Custom… ]                            │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ AI Coach:                                                    │  │
│  │ Scenario: N401LP is due for its annual. Owner has asked       │  │
│  │ you (the mechanic) to also look at a rough engine. Walk me   │  │
│  │ through what you'd do in myaircraft.us, step by step.        │  │
│  │                                                              │  │
│  │ Your turn ↓                                                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ [user types here]                                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Hints: [ Open work order ] [ Add squawk ] [ Create estimate ]   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Architecture:**
- Route: `/sop-library/simulator` (new page)
- Client component with chat UI (similar to existing Ask Logbook AI)
- Backend: `/api/sop/simulator` (new route)
  - System prompt: "You are an aviation maintenance trainer using the myaircraft.us platform. Guide the user through real workflows using the platform's actual routes, fields, and procedures. Reference SOP sections by ID."
  - Calls GPT-4o with conversation history
  - Cites SOP sections inline (clickable links to `/sop-library/<slug>#<section>`)
  - Tracks completion of canonical workflows (e.g. annual inspection has 8 expected steps)
  - Generates a "completion certificate" when a scenario is finished

**Why this is valuable:**
- Training for new mechanics — they learn by doing, not reading
- QA — staff can validate workflows match SOP
- Sales demos — investors can see the AI guiding through a real workflow
- Compliance evidence — "every staff member completed the AD-compliance simulator"

Estimated: 4–6 hours.

### 4.4 Mermaid diagrams

- `npm install mermaid` + react-markdown remark plugin
- Render fenced code blocks with `language=mermaid` as SVG diagrams
- Add diagrams to: SOP-13 (architecture), SOP-12 (owner portal flow), SOP-05 (work order lifecycle), SOP-06 (invoice lifecycle), SOP-08 (logbook entry sign chain)
- Diagrams are diff-friendly text in markdown — version-controllable

Estimated: 2–3 hours.

### 4.5 Color-coding + section anchor links + scroll-spy TOC

Per PROMPT_SOP_Viewer.md §C and §D. Pure styling + a `useEffect` for scroll-spy. Estimated 2 hours.

---

## 5 · Phase 4 deliverables — compliance & auditor polish

### 5.1 SOC2 control mapping

For each SOP, add a small block at the bottom:

```markdown
## SOC2 Controls Touched

| Criterion | Control | Evidence in this SOP |
|---|---|---|
| CC6.1 | Logical access controls | Section 5 — role permissions matrix |
| CC7.1 | Change management | Section 12 — PR review workflow |
| CC8.1 | System monitoring | Section 14 — audit log |
```

### 5.2 FAA refs surfaced in the viewer UI

The frontmatter already has `faa_refs: ["14 CFR 43.9", ...]`. The reader page should render these as clickable links to the eCFR site. Currently they're just text.

### 5.3 "Last reviewed" + version pill in the UI

Visible at the top of each SOP — "Last reviewed: 2026-05-14 · v1.0.0 · status: active". Helps compliance auditors at-a-glance.

### 5.4 Print-grade output

When user clicks Print, render a clean version with:
- myaircraft.us letterhead
- SOP ID, title, version, last-reviewed in a header block
- "INTERNAL DOCUMENT — NOT FOR PUBLIC DISTRIBUTION" footer
- Hide sidebar, search, AI bar
- Page break before each `<h2>`

Estimated: 1 hour.

---

## 6 · How this plan handles the user's specific asks

| User asked for… | Where it lands |
|---|---|
| "Make all SOP manual much more organized & dynamic" | Already done — `/sop-library` viewer exists. Phase 3 adds search + AI |
| "Searchable" | Phase 3.1 (Fuse.js full-text search) + Cmd+K |
| "Diagrams and wiring" | Phase 3.4 (Mermaid) + SOP-13's architecture diagrams |
| "Compliance" | Phase 4 (SOC2 control mapping, FAA ref links, print-grade output) |
| "AI Simulator" | Phase 3.3 (the headline new feature) |
| "Anthropic-level SOP maker / engineer architect CTO" | Tone + structure of SOP-13. Every section has a "Why:" justification, every requirement uses "must" / "must not", every data flow has an ASCII diagram. |
| "Don't leave anything" | Phases 1–4 cover all 13 SOPs + every viewer enhancement + compliance |

---

## 7 · Sequencing and PRs

### Tonight (Phase 1)
- **PR A**: `docs(sop): SOP-11 ATA/JASC + SOP-13 Full-Stack/Admin/RAG`
  - Two new markdown files in `docs/sop/`
  - Viewer picks them up automatically (no code change)

### Next session (Phase 2)
- **PR B**: `docs(sop): SOP-10 Mechanic & Workforce + SOP-12 Owner Portal`
  - SOP-10: convert from .docx → markdown + frontmatter
  - SOP-12: write from codebase exploration

### Session 3 (Phase 3)
- **PR C**: `feat(sop): full-text search + Mermaid diagrams + AI Query bar`
- **PR D**: `feat(sop): AI Simulator scenario chat`

### Session 4 (Phase 4)
- **PR E**: `feat(sop): SOC2 control mapping, FAA refs, print-grade output`

Each PR is independent and shippable. Worst case if one stalls, the rest still land.

---

## 8 · What this doc itself is not

This is a build plan, not a status report. Once Phase 1 ships, this doc gets a "Phase 1 ✅" annotation and we move on. The actual SOP content lives at `docs/sop/NN-*.md` — those are the authoritative documents.

---

**Last updated:** 2026-05-21.
**Next action:** start writing SOP-11 and SOP-13 (Phase 1).
