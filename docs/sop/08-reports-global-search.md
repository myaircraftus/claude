---
title: "Reports & Global Search"
module: "reports"
faa_refs:
  - "14 CFR 43.9"
  - "14 CFR 91.417"
slug: "08-reports-global-search"
order: 8
version: "1.0.0"
last_updated: "2026-05-14"
status: "active"
---

# Reports & Global Search

## Purpose

Reports surface aggregate views (compliance, financial, shop throughput) over the canonical tables. Global Search is the cross-module find surface — one box, results from aircraft / squawks / W/Os / invoices / logbook / parts.

## Reports — required surfaces

- **Compliance (per aircraft)** — Annual due date, AD list status, MEL items active, hours-since-overhaul. Source: logbook entries (§07).
- **Financial (per shop)** — Revenue, A/R aging, deposit liability, write-offs. Source: invoices (§06) + estimates (§04).
- **Shop throughput** — W/Os opened / signed / invoiced per week, labor hours per mechanic, parts margin. Source: W/Os (§05) + parts (§09).
- **Aircraft history** — Per-tail chronological view: every squawk, W/O, logbook entry, invoice. Owner-facing.

## Global Search — required behaviors

- **Single input.** No "search aircraft only" dropdown. Disambiguate by result row badge (Aircraft / W/O / Invoice / Logbook / Squawk / Part).
- **Org-scoped.** RLS plus an explicit `organization_id` filter in every query. No cross-org leak.
- **Recency-weighted.** Recent records rank above old. Open W/Os rank above closed.
- **AI passthrough.** If no exact match, hand off to `/api/ask` with the search term; the response stream is appended to the results panel.

## SOP rules

- **Reports are read-only.** Never let a report surface mutate data (no "mark invoice paid from the A/R aging row"). Click-through opens the source row in its module, where the SOP for that module governs the edit.
- **Caching is per-org + per-day for compliance.** Compliance reports are stable within a day. Cache key includes `organization_id` and the YYYY-MM-DD of "now in UTC." Owners can force-refresh with a button (writes an audit row).
- **Search results respect persona.** Owners never see shop-only fields (labor rates, parts margins) even when a record contains them — the API redacts.
- **Export emits CSV + PDF.** Both formats include the FAA refs footer for compliance reports.

## RLS

- All report queries pre-filter by `organization_id`.
- Global Search uses a server action so RLS is enforced via the user's Supabase session, not via the service role.

## Related modules

- Aircraft Master Record — §02
- Estimates — §04
- Work Order Execution — §05
- Invoices & Payments — §06
- Logbook Entries — §07
- Parts Inventory — §09
