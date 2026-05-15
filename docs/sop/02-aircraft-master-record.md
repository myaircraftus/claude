---
title: "Aircraft Master Record"
module: "aircraft"
faa_refs:
  - "14 CFR 43.9"
  - "14 CFR 91.417"
slug: "02-aircraft-master-record"
order: 2
version: "1.0.0"
last_updated: "2026-05-14"
status: "active"
---

# Aircraft Master Record

## Purpose

The Aircraft Master Record is the canonical row that every other module (squawks, work orders, logbook entries, parts allocations, compliance, documents) keys off of. It is the FAA-aligned identity of a single airframe in a customer's fleet.

## Required fields

- **Tail number** — uppercased, validated against `^N[0-9]{1,5}[A-Z]{0,2}$` (US registration). Foreign registrations are accepted as freeform text but flagged for review.
- **Make / Model / Year** — captured from the type certificate. Maps to the parts compatibility surface in §09.
- **Serial number** — required for parts/AD traceability.
- **Owner organization** — the Supabase `organization_id` that owns the record. Cross-org access is rejected by RLS.
- **Status** — `active | archived`. Archived aircraft remain readable for the logbook (§07) but block new W/Os and squawks.

## SOP rules

- **Tail number is unique within an org.** Duplicate inserts must surface the existing record, not create a second row.
- **Soft-archive only.** Aircraft are never hard-deleted from the database. `is_archived = true` is the terminal state. Compliance history (per 14 CFR 91.417) is preserved indefinitely.
- **Edit gate.** Owners may edit metadata (tail number is locked once a logbook entry exists). Shop personas may add maintenance metadata but cannot rename the airframe.
- **Logbook lock.** If a logbook entry has been signed against the aircraft, the tail number becomes read-only. Change requires a new "registration change" record + audit row.

## RLS

- `aircraft.organization_id = membership.organization_id` (active membership).
- Marketplace listings expose a redacted view (no serial, no owner name) when `is_marketplace_listed = true`.

## Failure modes

- **Wrong-org access:** redirects to `/my-aircraft` with a "not found" toast. Never leaks existence.
- **Stale cache after rename:** the aircraft picker invalidates via `revalidatePath('/my-aircraft')` and re-fetches.

## Related modules

- Squawks — §03 (every squawk hangs off an aircraft)
- Work Order Execution — §05 (each W/O is scoped to one aircraft)
- Logbook Entries — §07 (immutable history per aircraft)
- Parts Inventory — §09 (compatibility checks against make/model/year)
