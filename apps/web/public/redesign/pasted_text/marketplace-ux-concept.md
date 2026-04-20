Design a premium, modern, highly visual UI/UX overhaul for the Marketplace inside myaircraft.us, based on the existing app shell and the attached current marketplace screen. Keep the left navigation and overall workspace structure consistent with the existing myaircraft.us product, but completely redesign the Marketplace experience to be cleaner, more visual, more intuitive, and much more premium. Use realistic aviation imagery, tasteful product mock data, clean cards, clean empty states, polished tables where needed, mobile-aware layouts, and realistic demo content. Make it look production-ready, not conceptual.

PRODUCT CONTEXT
This marketplace is for aircraft parts listing and discovery inside myaircraft.us. It must be kept extremely simple. This is not a full e-commerce checkout product in phase 1. It is a lead-generation marketplace for parts. Sellers list parts fast. Buyers search, view, and directly contact the seller by phone/text/email. There is no in-app chat in the first version. There is no complex offer flow, no escrow, no transaction engine, no auction flow, and no shipping workflow in phase 1.

CORE PRODUCT STRATEGY
The marketplace should feel like:
“the fastest aircraft-part listing and discovery tool for owners, mechanics, shops, and MROs.”

The key advantage is speed:
Enter part number → auto-detect details → choose condition → upload photos/videos → set price → publish.

The UX must strongly communicate:
- fast listing
- aviation-aware intelligence
- trust and clarity
- simple contact flow
- subscription-gated seller access
- strong search and filtering
- clean category browsing
- compatibility with the rest of myaircraft.us

IMPORTANT BUSINESS MODEL
Replace the current 50/50 revenue split logic for parts marketplace with subscription-based seller plans.

For phase 1, design these seller plans:
1. Starter Plan
- $25/month
- up to 25 active listings
- AI-assisted listing creation
- part number autofill
- photo upload
- direct buyer contact
- mark sold / available / pending

2. Pro Plan
- $49.99/month
- unlimited active listings
- AI-assisted listing creation
- part number autofill
- photo and short video upload
- direct buyer contact
- listing performance insights
- better visibility / priority ranking

Do not design dealer/MRO/storefront plans yet as a core live flow. You can leave room for future expansion, but keep current monetization simple and focused.

IMPORTANT PRODUCT RULES
- Buyers do not need a subscription to browse parts
- Sellers must subscribe to list parts
- No in-app messaging in phase 1
- Buyer clicks Call Seller / Text Seller / Email Seller
- Seller controls preferred contact method
- Seller can mark listing as Sold / Pending / Available
- Seller can see listing count against subscription limit
- Seller sees plan usage and upgrade prompts
- AI helps create the listing, but AI is not the regulatory source of truth
- Part data can be shown as “matched from known catalog data” or “seller-provided”
- Do not imply certified authenticity unless documents are actually verified
- Keep the system simple and trustworthy

DESIGN GOAL
Create a full-stack marketplace UX concept with all key screens, flows, and states fully wired from end to end:
- browse marketplace
- search marketplace
- filter marketplace
- category navigation
- listing detail page
- seller subscription onboarding
- seller listing creation flow
- AI autofill flow
- media upload flow
- seller dashboard
- subscription usage and limits
- sold / pending / available inventory states
- empty states
- upgrade prompts
- success states
- AI search experience
- mobile-responsive concepts for critical screens

VISUAL DIRECTION
Make the interface:
- clean
- premium
- modern SaaS
- aviation-specific
- less text-heavy
- more card-based and visual
- realistic and polished
- easy for mechanics, shop staff, owners, and buyers
- intuitive at a glance

Use:
- crisp spacing
- premium typography
- soft shadows
- rounded cards
- modern filters
- subtle aviation-inspired accents
- realistic aviation part images
- realistic mock photography of components, avionics, wheels, brakes, propeller parts, engine accessories, interiors, electrical parts, and hardware
- realistic placeholder videos and photos
- tasteful demo badges and metadata

Avoid:
- clutter
- excessive wording
- enterprise complexity
- dark heavy dense layouts
- generic e-commerce styling
- consumer-fashion visual language
- too many steps

REFERENCE FEEL
Blend:
- premium B2B marketplace
- aviation parts intelligence
- clean maintenance software
- clean inventory software
- premium SaaS dashboard
- lightweight eBay-style listing simplicity, but much cleaner and more trustworthy

INFORMATION ARCHITECTURE
Design these top marketplace sections:
1. Marketplace Home
2. Browse Parts
3. Categories
4. AI Search
5. Seller Plans / Pricing
6. Create Listing
7. Seller Dashboard
8. My Listings
9. Listing Detail
10. Subscription / Billing
11. Saved Searches / Favorites placeholder for future
12. Admin / moderation placeholder only if needed visually, but not a core flow

MARKETPLACE HOME PAGE
Design a clean home/browse page inside the app with:
- headline area for Marketplace
- search bar with AI-assisted search option
- category shortcuts
- trending / popular parts row
- recently listed row
- featured listings row
- parts near you or by region
- strong filter bar
- sort options
- clean card grid/list toggle
- upgrade CTA for sellers to list parts
- “List a Part” primary button
- soft educational hints like “Enter a part number to auto-fill details”
- realistic aviation-themed hero image or banner
- subtle trust indicators such as “part number matched”, “seller verified”, “trace available”, “photos uploaded”

SEARCH EXPERIENCE
Design both:
1. standard keyword/part-number search
2. AI search experience

AI search should allow natural language such as:
- “show me serviceable Cessna brake assemblies”
- “find a Garmin avionics tray”
- “used alternator for Lycoming setup”
- “show overhauled magnetos under $1500”

Design search with:
- smart suggestions
- recent searches
- corrected part number formatting
- alternate number hints
- AI interpretation chip
- filter refinement chips
- search results page with strong hierarchy

FILTERS
Create a clean filter system with:
- category
- subcategory
- manufacturer
- condition
- price range
- location
- trace docs available
- certification/tag available
- quantity
- availability status
- aircraft applicability if known
- seller type
- media available
- sort by newest / price / relevance / most viewed

CATEGORIES
Create a clean aviation parts taxonomy, visually simple and neatly grouped. Use high-level categories first and avoid overwhelming depth. Include:
- Airframe
- Engine
- Propeller / Rotor
- Avionics / Electrical
- Landing Gear / Brakes / Wheels / Tires
- Interior / Cabin
- Instruments / Panels
- Hardware / Fasteners / Consumables
- Lighting
- Fuel / Oil / Hydraulic Components
- Flight Controls
- Doors / Windows / Exterior
- Safety / Emergency Equipment
- Ground Support / Accessories
- Miscellaneous Parts

Within the UI, show these as elegant cards, icons, or grouped chips. Keep it clean.

LISTING CARD DESIGN
Each part card should feel very clear and professional. Show:
- photo
- part number
- title
- manufacturer
- price
- condition
- location
- quantity
- trust chips such as trace available / seller verified / tagged
- availability status
- listed date
- contact CTA
- save/favorite icon placeholder
- optional aircraft compatibility note

Use polished realistic demo listings.

LISTING DETAIL PAGE
Design a detailed listing page with:
- large image gallery
- optional short video thumbnail
- part number prominently displayed
- title and manufacturer
- price
- condition
- quantity
- seller info
- location
- listing status
- description
- compatibility/applicability section
- trace and certification section
- seller notes
- contact options:
  - Call Seller
  - Text Seller
  - Email Seller
- “Report listing” subtle secondary option
- “Save listing” placeholder
- “Similar parts” section
- “Recently viewed” section
- mobile sticky action area for contact buttons

Important: the contact model is direct seller contact, not in-app chat.

SELLER LISTING CREATION FLOW
This is one of the most important flows. Make it extremely simple and clean.

Step 1: Enter Part Number
- large intelligent part-number input
- AI/API lookup behavior
- normalize formatting
- show loading / matching state
- show confidence or “matched from known catalog data”
- auto-fill:
  - title
  - manufacturer
  - category
  - alternate numbers if available
  - applicability if available
  - reference image if available

Step 2: Confirm Basics
- condition dropdown:
  - New
  - New Surplus
  - Overhauled
  - Serviceable
  - As Removed
  - Used
  - For Repair
- quantity
- price
- location
- trace docs yes/no
- certification/tag yes/no
- serial number optional
- seller notes with dictation option
- AI-generated description preview

Step 3: Add Media
- upload photos
- take photo from device camera
- upload short video
- reorder media
- AI image cleanup placeholder
- media quality hints
- show “actual part photos help sell faster”

Step 4: Review and Publish
- polished preview of listing
- plan usage counter
- publish CTA
- save draft CTA
- upgrade prompt if listing limit exceeded

AI LISTING ASSISTANCE
Throughout the flow, visually show that OpenAI/ChatGPT-style intelligence is helping in the background:
- part number interpretation
- cleaned title
- generated description
- category suggestion
- mismatch detection
- missing info prompts
- suggested trust badges

But keep this subtle and professional, not gimmicky.

SUBSCRIPTION AND ONBOARDING FLOW
Create a very simple seller onboarding sequence:
1. user clicks “List a Part”
2. if not subscribed, show pricing selection
3. choose Starter or Pro
4. checkout/subscription confirmation screen
5. activate listing privileges
6. enter seller profile basics
7. start listing parts immediately

Design screens for:
- pricing page
- plan comparison
- checkout confirmation state
- active subscription dashboard
- plan usage meter
- upgrade flow from Starter to Pro
- listing limit reached modal

SELLER PROFILE / DASHBOARD
No complex dealer storefront yet. Keep it simple.
Design a lightweight seller dashboard with:
- active plan
- active listings count
- remaining listing capacity
- quick button to create new listing
- listing table/grid
- statuses: Available / Pending / Sold / Draft
- listing performance summary
- contact click counts
- recent activity
- mark sold action
- relist action
- edit listing action
- simple billing section

MY LISTINGS
Design seller inventory management with:
- search my listings
- status tabs
- card and table view
- edit
- duplicate
- mark sold
- archive
- relist
- upgrade prompts if plan limit blocks new listing

TRUST AND SAFETY UX
Show simple trust signals inside design:
- seller verified badge placeholder
- matched part number badge
- trace docs available
- certification/tag available
- actual photos badge
- listed by shop / owner / mechanic type placeholder
- no fake legal claims

Keep moderation and admin tooling minimal and mostly behind the scenes.

EMPTY STATES
Design clean empty states for:
- no search results
- no listings yet
- no subscription yet
- listing limit reached
- no saved parts yet
- part number not found
- draft not completed
- sold out / listing removed

Use aviation-themed illustration or tasteful imagery where appropriate.

RESPONSIVE / MOBILE
Also generate key mobile layouts for:
- browse marketplace
- search results
- listing detail
- create listing
- seller dashboard summary

The mobile experience should make direct call/text actions especially easy.

DEMO CONTENT
Use highly realistic aviation parts demo content, such as:
- brake assemblies
- tires
- wheels
- alternators
- starters
- avionics trays
- GPS units
- magnetos
- fuel pumps
- interior trim parts
- lenses/lights
- control surfaces parts
- panels/instruments
- hardware kits

Make cards and details look believable and premium.

TECH / SYSTEM THINKING TO REPRESENT VISUALLY
The design should clearly imply these backend capabilities:
- API-based part number lookup
- OpenAI-assisted content generation
- part normalization
- listing limit enforcement by subscription
- seller profile permissions
- search and filtering engine
- AI search interpretation
- direct-contact lead model instead of in-app messaging
- sold / pending / available state transitions
- future-ready extensibility for dealers/MRO/storefronts later

PHASED PRODUCT ROADMAP TO REFLECT IN DESIGN NOTES
Represent the marketplace as phase-based:
Phase 1:
- direct contact marketplace
- subscription seller plans
- AI listing flow
- basic dashboard
- mark sold / pending / available

Phase 2:
- saved searches
- favorites
- promoted listings
- better analytics
- seller verification improvements

Phase 3:
- dealer / MRO storefronts
- bulk upload
- CSV inventory import
- team seats

Phase 4:
- inventory sync / API sync
- procurement workflows
- better trust/compliance features

Phase 5:
- optional transaction layer
- payment/checkout
- shipping/logistics integrations
- advanced negotiation tools

Do not overbuild later phases into the current phase 1 UI. Just leave room for them.

KEY SCREENS TO GENERATE
Please generate a cohesive design system and realistic mock screens for:
1. Marketplace home
2. Search results
3. Category browsing
4. Listing detail page
5. Seller pricing plans
6. Subscription onboarding
7. Seller dashboard
8. My listings
9. Create listing step 1: part number lookup
10. Create listing step 2: details and condition
11. Create listing step 3: media upload
12. Create listing step 4: review and publish
13. Listing limit reached / upgrade modal
14. Empty states
15. Mobile views for the most important screens

DESIGN SYSTEM
Create a refined design system for this marketplace that fits the current myaircraft.us environment:
- clean blues, whites, soft grays, and premium aviation accent tones
- high readability
- professional enterprise SaaS feel
- simple icon system
- elegant chips and badges
- strong use of cards and modular components
- consistent CTA hierarchy
- polished search/filter controls

FINAL OUTPUT EXPECTATION
The result should look like a real, buildable, end-to-end marketplace experience inside myaircraft.us, fully wired from browse to subscription to listing to direct seller contact, with a strong premium SaaS style, realistic aviation demo imagery, realistic parts data, and a very simple low-friction user flow.