# 2026-04-09 Unified Codex Spec Index

## Source document
- [myaircraft_codex_unified_spec.md](/Users/andy/1.%20do%20not%20touch/myaircraft/mark%20downs/myaircraft_codex_unified_spec.md)

## Why this prompt mattered
- It reframed the product as an aircraft-centered operating system instead of separate disconnected modules.
- It pushed operation type to become real aircraft context instead of only a planning idea.
- It emphasized reminder-to-maintenance, squawk-to-maintenance, and shared owner/mechanic aircraft context.
- It called for low-friction AI-assisted entry where plain English becomes editable structured records.

## This implementation batch focused on
- aircraft operation profile as stored aircraft context
- operation-aware reminder behavior
- reminder to maintenance request linkage
- aircraft-centered counts and workflow visibility
- restoring the missing aircraft edit path

## Main code touched in this batch
- [apps/web/lib/aircraft/operations.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/lib/aircraft/operations.ts)
- [apps/web/app/(app)/aircraft/new/page.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/(app)/aircraft/new/page.tsx)
- [apps/web/app/(app)/aircraft/[id]/edit/page.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/(app)/aircraft/%5Bid%5D/edit/page.tsx)
- [apps/web/app/(app)/aircraft/[id]/page.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/(app)/aircraft/%5Bid%5D/page.tsx)
- [apps/web/app/(app)/reminders/page.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/(app)/reminders/page.tsx)
- [apps/web/app/(app)/reminders/reminders-client.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/(app)/reminders/reminders-client.tsx)
- [apps/web/app/api/reminders/ai-parse/route.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/api/reminders/ai-parse/route.ts)
- [apps/web/app/api/reminders/generate/route.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/api/reminders/generate/route.ts)
- [apps/web/app/api/maintenance/requests/route.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/api/maintenance/requests/route.ts)
- [apps/web/app/api/maintenance/requests/[id]/route.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/api/maintenance/requests/%5Bid%5D/route.ts)
- [supabase/migrations/031_unified_spec_aircraft_ops_and_request_links.sql](/Users/andy/1.%20do%20not%20touch/myaircraft/supabase/migrations/031_unified_spec_aircraft_ops_and_request_links.sql)

## Notes
- The original source markdown remains in `mark downs/` as the long-form product brief.
- This archive entry exists so future turns can quickly understand which parts of the spec were implemented in this pass and where the relevant code lives.
