---
title: "Logbook Entries"
module: "logbook"
faa_refs:
  - "14 CFR 43.9"
  - "14 CFR 43.11"
  - "14 CFR 91.417"
slug: "07-logbook-entries"
order: 7
version: "1.0.0"
last_updated: "2026-05-14"
status: "active"
---

# Logbook Entries

## Purpose

A Logbook Entry is the immutable, FAA-required record that maintenance has been performed on an aircraft. It is the canonical post-signoff artifact: every signed W/O (§05) produces exactly one logbook entry. The signed entry returns the aircraft to service.

## Required content (14 CFR 43.9 / 43.11)

- **Date** — the date the work was completed.
- **Aircraft total time** — tachometer / Hobbs reading at completion.
- **Description** — the corrective action performed. Must reference the squawks (§03) being closed.
- **Signature block:**
  - Mechanic name (printed)
  - A&P certificate number
  - IA number (when performing an annual or major repair/alteration)
  - Signature timestamp (server-side, never client-supplied)
- **Return-to-service statement** — boilerplate per 14 CFR 43.9(a)(4), auto-generated based on the work type.

## Lifecycle

```
draft → signed (terminal)
```

- **draft** — generated from a signed-off W/O. Editable until the mechanic signs.
- **signed** — terminal. The entry is cryptographically anchored (hash of full content + signer cert), then becomes read-only.

## SOP rules

- **No mutation after signing.** Period. Errors require a NEW "correction" entry that references the original. The original stays in the record.
- **Aircraft total time monotonically increases.** A new entry's `aircraft_total_time` MUST be >= the previous entry's. Server-side check rejects regressions.
- **Auto-close cascaded squawks.** Signing the entry resolves the squawks named in the corrective action (§03 lifecycle).
- **Anchor for compliance.** Compliance views (annual due, AD compliance) read this table as the truth source. Don't query work orders for compliance — query logbook.
- **Aircraft archive doesn't delete.** Per 14 CFR 91.417, the operator must retain logbook records for the life of the aircraft + 1 year after disposal. Soft-archive only.

## RLS

- `logbook_entries.organization_id = membership.organization_id`.
- Portal: customers SELECT their own aircraft's signed entries only.
- Marketplace: a redacted view (mechanic name + cert hash but not signature image) when the seller opts in.

## Related modules

- Work Order Execution — §05 (source of every entry)
- Aircraft Master Record — §02 (the airframe being logged against)
- Squawks — §03 (auto-resolved on sign)
- Reports & Global Search — §08 (compliance reporting reads this table)
