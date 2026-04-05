# Spec 8 — Implementation Status Tracker

Last updated: 2026-04-02

## ✅ Implemented

### Frontend / Marketing
- Homepage complete overhaul (hero, how-it-works, product value cards, personas, scanning, pricing, trust, FAQ, footer)
- Role Simulator Section (RoleSimulatorSection.tsx + roleSimulatorData.ts)
- MarketingNav with announcement bar + all 6 nav links
- Marketing layout wrapper (layout.tsx)
- All 6 marketing pages: /product, /solutions, /pricing, /scanning, /security, /resources

### Aircraft App Pages
- Aircraft list page (/aircraft)
- Aircraft detail page (/aircraft/[id])
- Add Aircraft page (/aircraft/new) — FAA registry lookup, single N-number input
- Archive Aircraft page (/aircraft/[id]/archive)
- Sync ADs page (/aircraft/[id]/ads/sync)

### API Routes
- GET /api/aircraft/faa-lookup — FAA registry HTML scraper
- GET/POST /api/aircraft — list + create
- DELETE /api/aircraft/[id] — archive
- POST /api/aircraft/[id]/ads — sync ADs from FAA

### Database Migrations
- 001-015: Core schema (orgs, users, aircraft, documents, pages, chunks, embeddings, queries, citations, metadata, maintenance, audit logs, gdrive, RLS, FAA ADs, reminders, OCR pipeline, integrations)
- 016: Reminder templates catalog (70 seeded templates)

---

## 🔄 In Progress / Partially Done

### Navigation Mega Dropdowns
- Nav links work but flat links only
- Spec calls for: dropdown submenus for Product, Solutions, Pricing, Scanning, Security, Resources
- Status: PENDING

---

## ❌ Not Yet Implemented

### High Priority (Buildable Now)
1. **Contact / Demo page** (/contact) — required per spec 1
2. **DB Migration 017** — behavior-aware tables: user_behavior_profiles, user_aircraft_access, role_permission_matrix, behavior_events, retrieval_feedback
3. **DB Migration 016 applied to Supabase** — migration file exists but may not be applied to live DB
4. **Mechanic credentialing UI** — A&P/IA certificate fields, IA expiry tracking (spec 4)
5. **Invitation flows** — Owner → Mechanic and Mechanic → Sub-user (AMP/OJT) invite emails (spec 4)

### Medium Priority (Architecture / Backend)
6. **RAG ingestion pipeline** (spec 2) — Google Document AI integration, page preprocessing, classification, extraction, human review queue — requires new infrastructure
7. **Human review queue UI** — page-by-page review interface with side-by-side original/processed view
8. **OpenSearch integration** — exact-match indexing for part numbers, AD numbers, tach values (spec 5)
9. **Behavior service** — user behavior tracking, preference weights, retrieval ranking boosts (spec 7/8)
10. **Chat intent router** — detect entry generation vs. question vs. search etc. (spec 7/8)
11. **Entry authorization service** — role-aware sign/draft permission enforcement (spec 7/8)
12. **Signature state resolver** — enabled/disabled/hidden/pending states in entry UI (spec 7/8)

### Lower Priority (Future Phases)
13. Community library (spec 4)
14. Mechanic standalone workspace (spec 4)
15. Aircraft page reminder engine UI — grouped cards by category showing evidence, why triggered (spec 6)
16. Integration-derived reminder intelligence — tach/hobbs sync health, provider connection status (spec 6)
17. Persona detail pages (/solutions/owners, /solutions/mechanics, etc.)

---

## 📁 Memory Folder Structure
This folder: `/docs/specs/` in the project root

- `01-frontend-overhaul.md` — Public site redesign brief
- `02-rag-ingestion-pipeline.md` — Human-in-the-loop RAG ingestion
- `03-role-simulator.md` — Homepage interactive role demo
- `04-platform-wiring.md` — Full platform system design
- `05-tech-stack.md` — Technology choices and architecture
- `06-reminder-templates.md` — 70-template reminder catalog
- `07-behavior-aware-intelligence.md` — Role-aware retrieval + permissions
- `08-implementation-status.md` — This file (implementation tracker)

**Instructions:** Drop any new markdown spec files in this folder. Reference these files in future Claude sessions for full context.
