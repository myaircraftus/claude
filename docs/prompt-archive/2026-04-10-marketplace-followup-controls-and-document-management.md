# Marketplace Follow-Up: Controls And Document Management

Date: 2026-04-10

This follow-up implementation wave extended the Marketplace manuals and catalogs work so document listings behave more like real marketplace inventory instead of static uploaded files.

## What was added

- Marketplace-specific document access controls:
  - `marketplace_downloadable`
  - `marketplace_injectable`
  - `marketplace_preview_available`
- Seller-side manual/catalog management inside Marketplace:
  - edit existing document listings
  - submit or relist document listings for review
  - archive published or pending-review document listings
- Marketplace create/edit document wizard support:
  - edit without replacing the source PDF
  - persist access toggles and listing metadata
- Seller listings filter improvements:
  - `pending_review`
  - `published`
  - `rejected`

## Production migration

- `supabase/migrations/033_marketplace_document_controls.sql`

## Key implementation files

- `apps/web/app/api/documents/[id]/route.ts`
- `apps/web/app/api/marketplace/documents/[id]/access/route.ts`
- `apps/web/app/api/upload/route.ts`
- `apps/web/app/(app)/marketplace/page.tsx`
- `apps/web/components/marketplace/marketplace-client.tsx`
- `apps/web/components/marketplace/marketplace-seller.tsx`
- `apps/web/components/marketplace/marketplace-wizards.tsx`
- `apps/web/lib/marketplace/service.ts`
- `apps/web/types/index.ts`

## Outcome

The Marketplace manual/catalog flow now supports:

- richer access-state persistence
- cleaner document access gating
- seller-side document edit/relist/archive behavior
- better alignment between Marketplace document controls and the underlying aircraft/workspace document system
