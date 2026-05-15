---
sop_id: "SOP-09"
title: "Parts & Inventory"
module: "parts-inventory"
version: "1.0.0"
status: "active"
last_updated: "2026-05-14"
faa_refs: []
source_file: "mark downs/manuals/9. parts/myaircraft_parts_inventory_sop_codex.md"
---

# myaircraft.us Parts & Inventory SOP and Codex Implementation Manual

Version 1.0 - Final consolidated specification for Parts & Inventory, AI Parts Search, Inventory, Vendors, Purchase Orders, RX Receipts, Returns, Analytics, and Mobile.

> This Markdown is intended to be given to Codex with the included UI assets. Implement exactly the structure and behavior described unless an existing component already satisfies the requirement.


## Executive Summary

This SOP defines the final Parts & Inventory module for myaircraft.us. The module is a single enterprise workspace for aviation parts search, saved parts, inventory, vendors, purchase orders, receiving, returns, analytics, and mobile parts workflows. It preserves the approved UI direction and organizes all related workflows under one module so the user does not have to jump between disconnected screens.

The module must be simple at the surface and rigorous underneath. Users should be able to search for a part by aircraft and natural language, save a result, add it to inventory, create a purchase order, receive it, return it if necessary, and analyze stock performance without re-entering the same information repeatedly. AI is used to reduce typing, enrich data, extract labels/barcodes/packing slips, draft POs, suggest vendors, and surface analytics. AI must not silently finalize official records without user review.

## Locked Module Structure

The final navigation structure is locked. Parts & Inventory is the parent module. Every child item in the left sidebar and every top tab route must resolve to the same canonical screen. No duplicate pages should exist for the same workflow.

- Parts & Inventory / Dashboard
- Parts & Inventory / AI Parts Search
- Parts & Inventory / Inventory
- Parts & Inventory / Vendors
- Parts & Inventory / Purchase Orders
- Parts & Inventory / RX Receipts
- Parts & Inventory / Returns / Cores
- Parts & Inventory / Analytics

![Locked Module Structure](assets/00_parts_inventory_module_architecture.png)

## Global UI Shell

Every Parts & Inventory screen uses the same application shell. The left sidebar remains consistent with the broader myaircraft.us workspace. The Inventory group is expanded and shows child routes. The top bar carries the selected aircraft context, a global search field, a quick-add button, notifications/help/profile, and any screen-specific primary action.

The dashboard and all child tabs must preserve the same visual grammar: clean white canvas, navy sidebar, blue primary buttons, rounded cards, dense but readable data tables, status chips, and minimal but clear AI badges. The user should always know whether they are in the dashboard, AI search, inventory, vendors, purchase orders, receiving, returns, or analytics.

- Left sidebar: Dashboard, Aircraft, Work Orders, Estimates, Invoices, Squawks, Logbook, Documents, Compliance, Reports, Inventory section, Settings.
- Inventory section children: Parts & Inventory, AI Parts Search, Inventory, Vendors, Purchase Orders, RX Receipts, Returns, Analytics.
- Top bar: aircraft selector, selected aircraft context, global search, quick add, notifications, help, profile.
- Primary layout: title area, KPI cards, tabs or filters, main table/cards, right detail drawer when applicable.
- Mobile: bottom navigation focused on Dashboard, Search, Inventory, POs, More.

## Parts & Inventory Dashboard - Overview

The dashboard is the command center. It gives the shop a fast read of inventory health and procurement activity. It is the default screen when users enter Parts & Inventory from the sidebar. The title must be "Parts & Inventory", not simply "Parts". The subtitle must read: "Manage inventory, vendors, and purchase orders in one place." The screen uses the aircraft selector at the top to optionally scope results to an aircraft, but inventory can also be global.

The dashboard includes metric cards, top tabs, and three primary dashboard cards: Top Low Stock Parts, Recent Purchase Orders, and Inventory Value. The same screen is provided for desktop, iPad, and mobile.

- Metric cards: Total Parts, Low Stock, On Order, Expiring / Due, Total Value.
- Tabs: Overview, AI Parts Search, Inventory, Vendors, Purchase Orders, RX Receipts, Returns, Analytics.
- Dashboard cards: Top Low Stock Parts, Recent Purchase Orders, Inventory Value.
- Desktop: full sidebar, top search, horizontal metrics, three dashboard cards.
- iPad: compact sidebar/icon rail or collapsed navigation, metric cards wrap into two rows.
- Mobile: cards stacked vertically; bottom nav exposes Dashboard, AI Search, Inventory, POs, More.

![Parts & Inventory Dashboard - Overview](assets/01_parts_inventory_dashboard_desktop_tablet_mobile.png)

## Dashboard Route and Click Behavior

There must be one canonical dashboard route. Clicking "Parts & Inventory" in the left sidebar opens the dashboard overview. Clicking the Overview tab inside Parts & Inventory also opens the same view. Each dashboard card deep-links to its filtered destination.

| Source click | Destination | Filter/context |
| --- | --- | --- |
| Left Sidebar > Parts & Inventory | Dashboard / Overview | No forced filter; preserve selected aircraft if present |
| Dashboard tab > AI Parts Search | AI Parts Search | Selected aircraft passed into search context |
| Dashboard tab > Inventory | Inventory | Selected aircraft context optional; stock is normally global/shop-level |
| Metric > Low Stock | Inventory | status = Low Stock |
| Metric > On Order | Purchase Orders | status = Open or Processing |
| Card > Recent Purchase Orders | Purchase Orders | recent=true |
| Card > Inventory Value | Analytics | metric = inventory_value |

## AI Parts Search - Purpose and Scope

AI Parts Search is the high-value discovery experience. It must remain close to the current working UI pattern: select aircraft, type part number or plain English, search, review AI/vendor results, save or order, then optionally add to inventory. Do not rebuild it into a generic shopping search. The screen must remain aircraft-aware and must display the context used by AI.

AI Parts Search is a child route of Parts & Inventory and also a dashboard tab. Both routes must open the same canonical AI Parts Search screen. The page includes a "Back to Parts Dashboard" link and breadcrumb: Parts & Inventory / AI Parts Search.

- Desktop empty/search state.
- Desktop results state with aircraft context, FAA/AI/vendor steps, save/order actions.
- Saved part -> part detail -> edit/add-to-inventory flow.
- iPad responsive AI Parts Search.
- Mobile responsive AI Parts Search, results, part detail, saved parts.

![AI Parts Search - Purpose and Scope](assets/03_ai_parts_search_desktop_ipad_mobile_flow.png)

## AI Parts Search - Empty State

Before a search runs, the screen presents the aircraft selector and natural language search bar inside the dark navy search panel. This empty state teaches the user what the feature does without adding noise.

- Header: AI Parts Search with AI badge.
- Subtitle: FAA registry lookup + AI cross-reference across aviation vendors.
- Aircraft selector: saved aircraft, recent aircraft, or custom N-number.
- Search placeholder: Part # or plain English - e.g. CH48110-1, REM38E, brake disc, spark plug for Lycoming O-320.
- Try chips: spark plug, oil filter, brake disc, alternator, tire, magneto.
- Cards: FAA Registry / Aircraft type + engine verified; AI Analysis / Compatibility cross-reference; Multi-Vendor / Best prices across suppliers.

## AI Parts Search - Search and Progress States

After the user clicks AI Search, the UI shows deterministic progress states. Progress chips are important because the search is doing multiple jobs and users need confidence that the system is not frozen.

- FAA Registry lookup: Complete/In progress/Failed/Skipped if saved aircraft context is sufficient.
- AI cross-referencing parts: In progress/Complete.
- Vendor search: Pending/In progress/Complete.
- Results ready: Pending/Complete.
- Searching text: "AI is cross-referencing parts database... Finding compatible parts for [N-number] across Aircraft Spruce, Aviall, SkyGeek, eBay Aviation, Wicks, and more."
- If lookup fails, allow the user to continue with manual aircraft context and show "Needs verification".

![AI Parts Search - Search and Progress States](assets/02_ai_parts_search_full_flow.png)

## AI Parts Search - Results State

The results state must show exactly how AI reached the recommendation. The user sees saved aircraft context, AI analysis, filter row, card/list view controls, result cards, and selected part details.

The analysis message must include the disclaimer "Verify before ordering" because AI may rank likely compatible parts, but the shop is still responsible for final applicability and procurement decisions.

- Saved Aircraft Context: Aircraft, N-number, serial, engine, category, saved profile status.
- AI Analysis - Generated with AI - Verify Before Ordering.
- Filter row: Best fit, Condition, Certification, Vendor, Price, Availability.
- View toggle: Card view / List view.
- Result card fields: photo, compatibility badge, condition badge, certification badge, part number, name, manufacturer, vendor, availability, vendor score/rating, price, Save, Order, View details.
- Example: 066-04200-0000 / Brake Disc / Cessna Aircraft Company / Aircraft Spruce / In stock: 5 / $425.00 / Exact Match / Preferred / FAA-PMA.

## AI Parts Search - Save, Order, and Saved Parts Behavior

Saving a result does not mean it is stocked. It means the part is saved to the parts library/watchlist. The save action changes the card state to Saved and increments the Saved Parts count. Adding to inventory happens later after quantity, location, and stock details are confirmed.

- On Save: show toast "Saved to Parts - 066-04200-0000 - Brake Disc" with actions View Saved Parts and Go to Inventory.
- Saved card state: Save button becomes Saved.
- Saved Parts screen shows parts count, low stock, out of stock, inventory value, search saved parts, add button, and saved part list.
- Saved part detail shows part title, part number, condition, category, supplier, inventory status, pricing, supplier link, edit, delete, add to inventory/update inventory.
- For saved parts not yet stocked: Qty in Stock = 0, Min Stock = 1, status = Out of stock - order required.
- Order button opens an Order Part modal with choices: Open vendor page, Add to Purchase Order, Create New PO, Save for later.
- The app must not automatically place external orders unless a verified vendor integration exists and user confirms.

## AI Parts Search - Modals and Part Detail

The selected part detail drawer gives the user context while preserving the results grid. The edit modal is used for saved part correction and inventory preparation. The Add to Inventory modal converts a saved part into official stock.

- Edit Saved Part fields: Part Number, Alt P/N, Description, Category, Condition, Manufacturer, Vendor/Supplier, Cost Price, Our Rate/Selling Price, Qty in Stock, Min Stock, Vendor URL, Notes.
- Optional AI Fill Missing Details button can enrich blank fields but cannot save silently.
- Add to Inventory fields: Quantity, Location, Shelf/Bin, Cost, Min Stock, Notes.
- After Add to Inventory: Part moved to Inventory; quantity updated; stock alert rules activated.
- Primary detail actions: Add to Inventory, Create PO, View at Vendor, Add to Saved Parts.

## Inventory - Purpose and Screen Contract

Inventory is the official stocked parts list. Both routes - Parts & Inventory Dashboard > Inventory tab and Left Sidebar > Parts & Inventory > Inventory - must land on this same screen. The screen emphasizes stock status, quantities, location, cost, value, and operational actions.

- KPI cards: Total Parts, Low Stock, Out of Stock, On Order, Expiring/Due, Total Value.
- Stock tabs: All Parts, Low Stock, Out of Stock, On Order, Expiring.
- Table columns: Part Number, Description, Category, Qty in Stock, Min Stock, Status, Location, Unit Cost, Total Value, Last Updated, row actions.
- Controls: Search, Filters, Columns, Bulk Actions, Export, Add Part.
- Right detail drawer: Part Details, Inventory Status, Pricing, Supplier, Quick Actions.
- Mobile: inventory list with status chips, bottom nav, part detail and add/edit part screens.

![Inventory - Purpose and Screen Contract](assets/05_inventory_responsive_detail_flow.png)

## Inventory - Add Part Methods

Adding inventory must be easy. The user should not face a large blank form by default. The Add Part flow supports Manual Entry, Image Upload, Barcode Scan, and AI Lookup. The AI must fill fields where possible; the user reviews and confirms.

- Manual Entry: user enters part number; AI Lookup fills description, manufacturer, category, unit, cost, and suggested vendor.
- Image Upload: user uploads or takes a picture of a part label; AI extracts part number, verifies against sources, shows confidence, then confirms add to inventory.
- Barcode Scan: barcode scanner or camera scans barcode; AI matches and verifies; confidence score shown.
- AI Lookup: user can let AI find and fill the part details based on part number, vendor, or description.
- Required final fields: Part Number, Description, Quantity, Min Stock, Location, Cost Price or Unit Cost. Optional fields: Shelf/Bin, Manufacturer, Vendor, Selling Price, Notes.
- Confidence must be shown for AI/image/barcode extraction. Low confidence requires manual confirmation before saving.

![Inventory - Add Part Methods](assets/04_inventory_list_add_scan_flow.png)

## Inventory - Stock Status Rules

Stock status must be deterministic. The UI must not label stock incorrectly or mix saved parts with official inventory.

| Status | Rule | UI behavior |
| --- | --- | --- |
| In Stock | qty_in_stock > min_stock | Green status chip; no reorder warning |
| At Min | qty_in_stock == min_stock | Yellow status chip; eligible for reorder suggestion |
| Low Stock | 0 < qty_in_stock < min_stock | Orange status chip; show reorder prompt |
| Out of Stock | qty_in_stock == 0 | Red chip; order required alert |
| On Order | open PO exists and not fully received | Blue chip or on-order count |
| Expiring / Due | tracked shelf-life/calibration/due date within threshold | Purple/amber chip; show due date |

## Vendors - Purpose and AI Vendor Lookup

Vendors are managed inside Parts & Inventory, not as a separate disconnected business address book. The Vendor screen tracks aviation parts suppliers, preferred status, delivery performance, spend, lead time, contacts, documents, and PO history. Adding a vendor is AI-assisted: the user enters only the vendor name first, then AI enriches the profile.

- Vendor KPI cards: Total Vendors, Preferred Vendors, Average On-Time Delivery, Active POs, Total Spend YTD.
- Vendor tabs: All Vendors, Preferred, Approved, Pending, Blocked.
- Vendor table columns: Vendor, Status, Type, On-Time Delivery, Avg. Lead Time, Last Order, Total Spend YTD, actions.
- Vendor profile tabs: Profile, Contacts, Performance, Documents, Orders.
- AI Lookup button remains visible on vendor profile and add vendor flow.
- AI may populate company information, contacts, address, tax ID/EIN, payment terms, shipping terms, performance insights, risk assessment, and documents. User must review/edit before save.

![Vendors - Purpose and AI Vendor Lookup](assets/06_vendors_ai_vendor_lookup_flow.png)

## Vendors - Add Vendor Flow

The Add Vendor flow is designed for low friction. The user enters the company name and clicks AI Lookup. The AI searches available sources and proposes a vendor profile. The user reviews and saves. The saved vendor then becomes available for POs, RFQs, quotes, receipts, returns, and spend analytics.

- Step 1: Enter Vendor Name.
- Step 2: AI Auto-Fill and Verify - company information, contact details, address, tax ID, payment and shipping terms, performance insights.
- Step 3: Review and Edit - confidence score shown; user can edit any field.
- Step 4: Save Vendor - vendor added successfully.
- Step 5: Use Anywhere - create purchase orders, view vendor performance, add to RFQ/quotes, track orders and spend.
- Mobile includes vendor list, vendor profile, and add vendor flow.

## Purchase Orders - Purpose and Screen Contract

Purchase Orders manage procurement. The screen is simple at the surface: list existing POs, filter by status, and create a new PO. The New PO flow is AI-assisted and supports dictation, import/upload, manual entry, and reorder from previous POs. AI may generate a draft PO, but the user must review and confirm before it becomes official.

- PO status cards: All POs, Open, Processing, Shipped, Received, Closed.
- PO table columns: PO Number, Vendor, Date, Total, Status, Expected Delivery, actions.
- Filters: All, Open, Processing, Shipped, Received, Closed.
- Recent Purchase Orders card may appear on dashboard or right panel.
- New PO side panel presents creation methods: AI Assist, Import/Upload, Manual Entry, From Reorder.
- PO detail includes Details, Items, Tracking, Documents, status, expected delivery, total, ordered by, and edit/more actions.

![Purchase Orders - Purpose and Screen Contract](assets/07_purchase_orders_ai_generation_flow.png)

## Purchase Orders - AI PO Creation Flow

The AI PO builder should feel like the user is explaining what they need, not filling out a procurement spreadsheet. It should accept typed descriptions or voice dictation.

- User describes or dictates: "2 brake discs and 4 brake pads for Cessna 172" or "Oil filter CH48110-2".
- AI finds matching parts, vendors, and pricing.
- AI suggests part numbers, quantities, vendor, pricing, and substitutions if available.
- User reviews and edits the PO draft.
- User confirms and creates PO.
- After creation, user can save, email, download, share, or track order.
- PO receipt later flows into RX Receipts and updates inventory.

| Creation method | Use case | Required review |
| --- | --- | --- |
| AI Assist | Fastest path; typed or dictated purchase need | Review vendor, parts, quantities, prices |
| Import / Upload | Vendor quote, PDF, email, or spreadsheet | Review extracted lines and totals |
| Manual Entry | Full control for known vendor and part lines | Review all required fields |
| From Reorder | Repeat previous order | Review quantities, prices, current vendor availability |

## RX Receipts - Purpose and Flow

RX Receipts is the receiving workflow. It records items received against a purchase order or manual receipt, supports barcode/photo/packing-slip extraction, updates inventory quantities, and updates PO status to partial or received. This is the operational bridge from procurement to inventory truth.

- RX list statuses: All, Pending, Received, Partial.
- Add receipt methods: By Barcode Scan, By Image Upload, AI Extract, From Purchase Order, Manual Entry.
- Scanning extracts part number and quantities from barcode or packing label.
- AI extraction can parse packing slips and identify received items.
- User reviews extracted items and quantities before confirmation.
- Confirm Receipt updates inventory and PO status.
- Partial receipt keeps PO open and remaining quantities pending.

![RX Receipts - Purpose and Flow](assets/08_rx_returns_desktop_mobile_flow.png)

## RX Receipts - Web Flow Board

The web flow board must be implemented as a clear staged process: list, add receipt, choose method, scan/upload, extracted items, confirm receipt, receipt created, inventory/PO status updated.

- Step 1: RX Receipts List with receipt number, PO number, vendor, date, status, items, total.
- Step 2: Add RX Receipt with source selection and PO reference.
- Step 3: Choose Method - scan barcode, upload packing slip, AI extract from image, manual entry.
- Step 4: Scan/Upload interface with camera/barcode frame or upload drop zone.
- Step 5: Extracted Items table with part number, description, quantity received, confidence/check mark.
- Step 6: Confirm Receipt review screen.
- Step 7: Receipt Created success state.
- Step 8: Inventory Updated and PO Status Updated cards.

![RX Receipts - Web Flow Board](assets/09_rx_returns_web_flow.png)

## Returns / Cores / Warranty - Purpose and Flow

Returns handles defective items, warranty returns, credit returns, wrong parts, and core returns. Returns can originate from a receipt, from inventory, or from manual entry. The flow must keep quantities and vendor history accurate.

- Return statuses: All, Open, Approved, Received.
- Return types: Defective, Warranty, Credit, Core, Wrong Part.
- Create Return sources: From Receipt, From Inventory, Manual Entry.
- Return details include item, received quantity, return quantity, reason, notes, attachments/evidence.
- Review Return screen confirms vendor, type, reason, items, quantities, total value.
- Return Created success state shows return number, status, vendor, total, date.
- Return Status timeline tracks Open, Approved, Shipped, Received, Credit Issued or Replacement Received.
- Inventory and vendor history update when the return is created and when final disposition is complete.

## Analytics - Purpose and Metrics

Analytics turns inventory activity into operational intelligence. It shows where money is tied up, what is going out of stock, which vendors perform best, what is moving slowly, and what should be reordered. Analytics must support filters and drill-downs.

- Overview KPI cards: Inventory Value, Parts Turnover, Fill Rate, Stockouts, Total Receipts, Total Returns.
- Charts: Top Spending Categories, Low Stock Trend, Inventory Value Trend.
- Filters: Location, Vendor, Category, Aircraft, Date Range.
- Drill-downs: Top Spending Categories, Low Stock Items, Slow Moving Parts, Top Vendors by Spend.
- Export report action in top right.
- Analytics should be available for desktop and mobile, but detailed charts are desktop-first.

![Analytics - Purpose and Metrics](assets/10_analytics_dashboard_drilldowns.png)

## Mobile Parts Experience

Mobile is not a compressed desktop table. It is an action-first experience for mechanics and inventory users. It must support fast AI part search, scan/add inventory, vendor lookup, PO review, RX receiving, returns, and part detail. Dense analytics can be simplified to summary cards and drill-down links.

- Bottom nav: Dashboard, AI Search, Inventory, POs, More.
- AI Search mobile flow: Select Aircraft -> Search -> Searching -> Results -> Part Detail -> Saved/Order/Add to Inventory.
- Inventory mobile flow: stock summary -> list -> part detail -> add/edit part -> scan/image/barcode.
- Vendors mobile flow: vendor list -> profile -> AI lookup/add vendor.
- PO mobile flow: list -> create PO -> AI dictation -> review/edit -> confirm -> PO detail/tracking.
- RX mobile flow: receipt list -> add receipt -> scan/upload -> extracted items -> review -> receipt created.
- Returns mobile flow: returns list -> create return -> select items -> details -> review -> return created.

## AI Requirements and Guardrails

AI is central to this module, but it must be controlled. AI assists search, extraction, enrichment, drafting, matching, scoring, and reporting. AI must never silently convert suggestions into official inventory, vendor, PO, receipt, or return records without user review and confirmation.

| AI may do | AI must not do |
| --- | --- |
| Search by natural language and part number | Claim final airworthiness or eligibility of a part |
| Use saved aircraft context and registry identity data to narrow results | Install or order parts without user confirmation |
| Cross-reference likely compatible part numbers | Hide low-confidence extraction |
| Extract part numbers from images/barcodes/packing slips | Overwrite official inventory silently |
| Fill vendor details from public/approved data sources | Create official vendor without review |
| Draft purchase orders from dictation or text | Send PO without user approval |
| Suggest reorder quantities and alternate parts | Treat saved parts as stocked inventory |
| Generate analytics summaries and shortage warnings | Expose sensitive pricing or margin to unauthorized users |

## Permissions and Audit Requirements

Inventory and procurement actions affect money, compliance, and operational readiness. Every critical action must create an audit event. Permissions must distinguish search, save, inventory edit, vendor edit, PO creation, receipt, return, analytics export, and deletion.

- Audit events: part saved, part added to inventory, inventory edited, stock quantity changed, vendor created/edited, PO created/sent/closed, receipt confirmed, return created/updated, analytics exported.
- Audit fields: actor, role, timestamp, source module, record ID, aircraft context if any, before/after values for edits, IP/device metadata where available.
- Deletion of inventory/vendor/PO records should be restricted; prefer archive/void with reason.
- Mobile scanning actions must record source: manual, image, barcode, AI extract, import, vendor integration.
- Export actions must log user, timestamp, filters, format, and destination if sent.

## Data Model - Required Entities

Codex should implement or map the following entities. Names can adapt to the existing codebase, but the concepts and relationships are mandatory.

| Entity | Purpose |
| --- | --- |
| part_master | Canonical part identity, description, manufacturer, category, alternate numbers, certification notes |
| saved_part | User/shop saved part or watchlist item, not necessarily stocked |
| inventory_item | Official stocked item with quantity, location, cost, value, min stock, condition |
| inventory_transaction | Immutable stock movement ledger: add, receive, adjust, issue, return, consume |
| vendor | Vendor profile, contacts, terms, addresses, status, performance |
| purchase_order | PO header with vendor, status, dates, totals, terms, shipping |
| purchase_order_line | PO line items: part, qty, cost, expected delivery, received qty |
| rx_receipt | Receiving record against PO/manual source |
| rx_receipt_line | Received items and quantities |
| return_record | Return/RMA/warranty/core/credit header |
| return_line | Returned item, quantity, reason, disposition |
| part_vendor_offer | Vendor offer/result from AI search, price, stock, source URL, confidence |
| part_search_event | AI search query, aircraft context, source, result metadata |
| inventory_analytics_snapshot | Materialized metrics for reporting/performance |
| audit_event | Immutable trace for all critical actions |

## Codex Implementation Instructions

This section is written for Codex. Build the Parts & Inventory module as a single routed module with canonical child screens. Preserve the UI structure shown in the included images. Do not create separate duplicate modules for vendors, purchase orders, receipts, returns, or analytics outside Parts & Inventory unless existing global routes already exist; in that case, route them to the same components.

- Create/maintain a single parent route: /parts-inventory or existing equivalent.
- Child routes: /parts-inventory/dashboard, /ai-parts-search, /inventory, /vendors, /purchase-orders, /rx-receipts, /returns, /analytics.
- Sidebar and top tabs must link to the same child route components.
- Use selected aircraft context when available but do not require aircraft for global inventory operations.
- AI Parts Search must preserve current working behavior and only refine layout/states.
- Saved parts and inventory must remain distinct data concepts.
- Every AI-created or AI-extracted record must require user review before official save.
- Receiving must update inventory transactions and PO status.
- Returns must update inventory, vendor history, and analytics.
- All forms need validation, loading states, empty states, error states, and audit events.
- Mobile views should be purpose-built, not desktop tables squeezed into phone width.

## Acceptance Criteria

The module is not accepted until every point below is implemented or deliberately deferred with a documented reason.

- Parts & Inventory dashboard renders desktop, iPad, and mobile layouts.
- Dashboard has the locked metrics, tabs, and cards.
- AI Parts Search supports aircraft selector, custom N-number, natural language search, progress states, results, save, order, details, and saved parts behavior.
- Saved parts can be edited, deleted, added to inventory, used to create PO, or opened at vendor.
- Inventory supports table, filters, columns, bulk actions, status tabs, detail drawer, manual add, image upload, barcode scan, and AI lookup.
- Stock status rules are deterministic and testable.
- Vendors support AI lookup, review/edit/save, profile tabs, performance, documents, orders, and mobile profile.
- Purchase Orders support AI/dictation, import/upload, manual entry, reorder, review/edit, create, send/download/share/save, track, and mobile flow.
- RX Receipts support receiving from PO/manual, barcode/image/AI extraction, review, confirm, inventory update, and PO status update.
- Returns support receipt/inventory/manual sources, return types, item selection, notes/evidence, review, create, status tracking, and vendor/inventory updates.
- Analytics supports KPI cards, charts, filters, drill-downs, exports, and shortage dashboards.
- All critical actions create audit events.
- AI suggestions never become official records without user confirmation.

## UI Asset Index

- `assets/00_ai_parts_search_flow.png`
- `assets/00_inventory_add_flow.png`
- `assets/00_parts_inventory_module_architecture.png`
- `assets/00_procurement_flow.png`
- `assets/01_parts_inventory_dashboard_desktop_tablet_mobile.png`
- `assets/02_ai_parts_search_full_flow.png`
- `assets/03_ai_parts_search_desktop_ipad_mobile_flow.png`
- `assets/04_inventory_list_add_scan_flow.png`
- `assets/05_inventory_responsive_detail_flow.png`
- `assets/06_vendors_ai_vendor_lookup_flow.png`
- `assets/07_purchase_orders_ai_generation_flow.png`
- `assets/08_rx_returns_desktop_mobile_flow.png`
- `assets/09_rx_returns_web_flow.png`
- `assets/10_analytics_dashboard_drilldowns.png`
- `assets/11_earlier_parts_inventory_concept_reference.png`