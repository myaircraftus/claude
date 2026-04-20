# 2026-04-10 Marketplace + Manuals & Parts Catalogs Build Prompt

## Source
In-thread implementation prompt captured on April 10, 2026 for the `myaircraft.us` Marketplace expansion.

## Objective
Build a production-grade Marketplace inside `myaircraft.us` that preserves the existing workspace shell, navigation, persona switching, and aircraft context while supporting two first-class product modes:

1. Aircraft parts marketplace
2. Manuals and parts catalogs marketplace, access, and inject

## Core Product Direction
- Keep Marketplace premium, clean, and aligned to the approved Figma direction.
- Preserve the existing top-level Marketplace tabs:
  - Browse Parts
  - Seller Dashboard
  - My Listings
  - Seller Plans
- Add an obvious and elegant manuals/catalogs mode.
- Do not bury manuals/catalogs as an afterthought.

## Physical Parts Marketplace Requirements
- Subscription seller access instead of revenue split.
- Plans:
  - Starter: `$25/month`, up to `25` active listings
  - Pro: `$49.99/month`, unlimited active listings
- Direct contact only:
  - Call Seller
  - Text Seller
  - Email Seller
- No in-app chat, checkout, escrow, auction, shipping, dispute center, or payment flow yet.
- Track:
  - view counts
  - contact click counts
- Seller statuses:
  - Draft
  - Available
  - Pending
  - Sold

## Manuals & Catalogs Marketplace Requirements
- Manuals and parts catalogs must stay first-class in Marketplace.
- Support manual/catalog listing types such as:
  - maintenance manual
  - service manual
  - parts catalog
  - IPC
  - wiring manual
  - structural repair manual
  - overhaul manual
  - component maintenance manual
  - other technical document
- Build a document-specific listing flow with:
  - upload PDF
  - metadata capture
  - AI-assisted identification
  - searchable ingestion hooks
  - access settings
  - inject flow

## Inject Definition
Inject must be explained clearly in the UI:

> Inject adds this document into your aircraft or workspace records so it becomes searchable with AI inside myaircraft.us. The file is stored in your system and indexed for retrieval, search, and assistant answers.

Inject means:
- document is cloned into the user workspace or aircraft records
- file is stored in their system
- indexing, chunking, and embeddings can run
- document becomes searchable in assistant flows

## Required Browse Experiences

### Parts Browse
- hero section
- search bar
- AI search placeholder
- category cards
- featured parts
- most viewed
- recently listed
- polished filters

Filters:
- category
- manufacturer
- condition
- price range
- location
- trace docs
- certification/tag
- media
- availability
- sort options

### Manuals & Catalogs Browse
- distinct browse mode or segmented control
- search
- AI search placeholder
- document type filters
- document listing cards
- detail view
- get access flow
- inject flow

## Seller Surfaces

### Seller Plans
- plan cards
- current plan state
- Starter and Pro
- upgrade CTA
- plan feature lists
- listing usage display

### Seller Dashboard
- current plan card
- listing usage meter
- active/pending/sold counts
- total views
- contact performance
- recent listings
- upgrade CTA
- new listing CTA

### My Listings
- All / Available / Pending / Sold / Draft views
- searchable table
- listing type filter:
  - All Listings
  - Parts
  - Manuals & Catalogs
- actions:
  - Edit
  - Duplicate
  - Mark Sold
  - Archive
  - Relist

## Create Listing Flows

### Physical Part Wizard
1. Part Number Lookup
2. Details & Condition
3. Add Media
4. Review & Publish

Required fields include:
- title
- part number
- manufacturer
- category
- condition
- price
- quantity
- serial number optional
- trace docs available
- 8130/tag available
- seller notes
- AI-generated description helper

### Manual / Catalog Wizard
1. Identify Document
2. Upload File
3. Access Settings
4. Review & Publish

Required capabilities:
- PDF upload
- metadata summary
- downloadable yes/no
- injectable yes/no
- preview available yes/no
- seller/source info
- free or priced access metadata

## Detail Requirements

### Physical Part Detail
- image gallery
- title
- part number
- manufacturer
- condition
- price
- quantity
- seller info
- location
- trace/tag info
- seller notes
- direct contact buttons
- similar parts

### Manual / Catalog Detail
- document title
- document type
- revision
- manufacturer
- aircraft applicability
- description
- seller/source
- preview info
- Get Access CTA
- inject helper text

## Access Options
Inside Get Access, support:
1. Download PDF
2. Download and Inject
3. Inject into Workspace / Aircraft

After inject, success state should confirm:
- document added successfully
- searchable with AI
- available in Documents / Manuals / Catalogs
- next actions:
  - Open Document
  - Go to Aircraft Documents
  - Ask AI

## Technical Expectations
- Strong TypeScript typing for parts listings, document listings, seller plans, metrics, and inject actions.
- Real service boundaries for:
  - AI part lookup
  - AI document metadata assist
  - inject pipeline orchestration
- Use realistic seeded aviation data where backend is not finalized.
- Keep components modular and maintainable.

## Deliverables Expected
- Browse Parts
- Browse Manuals & Catalogs
- Seller Plans
- Seller Dashboard
- My Listings
- Create Physical Part Listing wizard
- Create Manual / Parts Catalog Listing wizard
- Physical Part detail
- Manual / Catalog detail
- Get Access modal/drawer
- Download PDF flow
- Download and Inject flow
- Inject explanation and success flow
- subscription gating
- listing usage enforcement
- basic metrics and status logic
