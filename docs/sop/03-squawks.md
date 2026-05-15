---
title: "Squawks"
module: "squawks"
faa_refs:
  - "14 CFR 43.9"
  - "14 CFR 91.405"
slug: "03-squawks"
order: 3
version: "1.0.0"
last_updated: "2026-05-14"
status: "active"
---

# Squawks

## Purpose

A squawk is the canonical "something is wrong with this aircraft" record. It is the entry point to the maintenance funnel: every Work Order (§05) traces back to one or more squawks, and every signed Logbook Entry (§07) closes one or more squawks.

## Lifecycle

```
open → in-progress → resolved → (optional) deferred / MEL
```

- **open** — newly reported; not yet on any W/O line.
- **in-progress** — at least one W/O line references this squawk and the W/O is in `open` or `in-progress` status.
- **resolved** — a logbook entry signing the corrective action has been posted (§07).
- **deferred / MEL** — placed on the Minimum Equipment List with an expiration date and an aircraft inop placard requirement.

## Required fields

- **Aircraft** — FK to `aircraft.id`. Aircraft must be `active` (not archived) for new squawks.
- **Reported by** — `user_id` of the reporter; falls back to "owner@email" if reported via the portal.
- **Description** — freeform text, min 8 chars. Surfaced verbatim in the W/O and logbook entry.
- **Severity** — `airworthy-impacting | maintenance-only`. Airworthy-impacting squawks block aircraft return-to-service until resolved or MEL'd.
- **Reported at** — server-side timestamp; never client-supplied.

## SOP rules

- **One source of truth per defect.** Duplicate squawks against the same aircraft + similar text MUST surface as merge candidates before insert.
- **No silent close.** A squawk transitions to `resolved` ONLY when a signed logbook entry references it. Manual close is not permitted.
- **MEL deferrals require expiration.** Defer requires a date and the aircraft inop placard photo upload (§02 compliance hooks).
- **Airworthy-impacting blocks return-to-service.** The W/O sign step (§05) refuses to advance if open airworthy-impacting squawks remain.

## RLS

- `squawks.organization_id = membership.organization_id`.
- Portal users can READ squawks for aircraft they're invited to; INSERT only via the portal-facing endpoint (signed audit).

## Related modules

- Aircraft Master Record — §02
- Work Order Execution — §05
- Logbook Entries — §07
