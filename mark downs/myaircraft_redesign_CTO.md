# myaircraft.us — CTO/Founder UX Audit & Redesign Playbook
> **Scope:** Marketing site (myaircraft.us) + Full SaaS dashboard (Ops, Review, Assistant, Customers, Aircraft, History, Documents, Community)
> **Benchmarked against:** Bluetail.aero
> **Lens:** Conversion-ready customer-facing front + production-grade SaaS dashboard

---

## 1. Executive Diagnosis

The product has a genuinely differentiated offering — on-site logbook scanning *plus* an AI workspace with role-based access, FAA registry integration, and a community marketplace. That's a hard moat. The technology is clearly there.

The problem is the **packaging**. Right now:

- The **marketing site** reads like a well-written operations manual, not a product that wants to convert.
- The **dashboard** reads like a **product demo** that someone forgot to turn off. Every screen explains itself rather than doing its job.
- The **visual system** is inconsistent — three different button styles, no dominant brand color in the dashboard, and a sidebar that competes with the content for space.

Visitors leave without buying. Users open the dashboard and feel like they're watching a tutorial they never asked for.

This doc fixes both.

---

## 2. Competitive Snapshot: myaircraft.us vs Bluetail.aero

| Dimension | myaircraft.us | Bluetail.aero |
|---|---|---|
| **Value prop clarity** | Buried in long-form prose | "AI-Powered FAA-Compliant Aircraft Maintenance" — above the fold, immediate |
| **Marketing visual identity** | Soft lavender/gray, no dominant brand color | Strong blue (#1A5EAE) + orange (#E07B2A), instantly recognizable |
| **Pricing transparency** | Quote-only, no anchors shown | Tiered plans with clear feature comparison |
| **Social proof** | None visible on homepage | Customer logos, testimonials, awards badges |
| **Product screenshots** | UI mockup cards (small) | Full-size dashboard screenshots, video walkthroughs |
| **CTAs** | 4 competing CTAs in the hero | 1 primary CTA + 1 secondary, clean hierarchy |
| **Dashboard UX** | Explanatory/instructional ("Live setup" always visible) | Tool-first, information-dense, no persistent tutorial panels |
| **Mobile readiness** | Not assessed but single-page SPA | Fully responsive |
| **Feature depth** | Deeper (scanning service + AI + marketplace + FAA registry) | Strong compliance engine + team features |
| **Onboarding model** | Role-based guided demo + live tutorial | Direct trial signup |
| **Brand premium feel** | Medium — clean but generic | High — feels like enterprise aviation software |

**Bottom line:** myaircraft.us has *more* product than Bluetail. It loses on surface. That's fixable.

---

## 3. Marketing Site Audit

### 3.1 What's Working
- The role-based interactive demo is genuinely excellent — showing Owner vs Mechanic vs IA vs Pilot workflows in-page is a differentiator.
- The "Before / After" visual is compelling conceptually.
- Copy is honest and specific — "typical single-aircraft jobs take around 10 hours" builds trust.
- The service + software hybrid positioning is unique and can be a key selling point.

### 3.2 Critical Issues

**Issue 1: Hero has no visual anchor**
The left side is 400px of text and four competing CTA buttons. The right side shows a small UI mockup card. There is no image of an actual aircraft, no real dashboard screenshot, no human face. The product is invisible.

**Issue 2: Four CTAs in the hero kill conversion**
`Create account` / `Try the demo` / `Log in` / `See How It Works` — this is a classic "four doors, customer freezes" problem. Visitors don't know what to click. Primary action should be *one thing*.

**Issue 3: No pricing anchor**
"Custom quote based on record volume and condition" appears multiple times with no range, no starting price, no comparison tier. Buyers immediately wonder if this is out of their budget and bounce. Even a "Starting from $X" or a three-tier comparison table resolves this.

**Issue 4: No social proof above the fold**
There is not a single customer logo, testimonial, review count, or trust signal on the entire homepage. For a product that handles sensitive aviation records, trust is everything.

**Issue 5: "Aircraft Logbook Scanning Service" label is product-led, not outcome-led**
The top eyebrow label says `AIRCRAFT LOGBOOK SCANNING SERVICE`. Customers don't want a scanning service — they want peace of mind, faster prebuys, cleaner annuals, and a defensible paper trail. Lead with the outcome.

**Issue 6: The page is a wall of text**
The homepage has 12+ content sections, all on one page, with no visual breathing room between them. Section headers are uppercase tracked-spaced labels that feel like internal documentation categories.

**Issue 7: No sticky conversion element**
There's no sticky header CTA, no floating chat/demo button, no exit-intent prompt. Once a visitor scrolls past the hero, there's no re-engagement hook.

---

## 4. Marketing Site Redesign Blueprint

### 4.1 New Information Architecture

```
HEADER (sticky)
  Logo | How It Works | Service | Pricing | Demo
  [Log in]  [Start Free — ghost]  [Request Scan Quote — primary]

HERO
  H1: "Your aircraft records, clean, searchable, and defensible."
  Subhead: We come on-site, digitize every logbook, and give you an
           AI workspace your mechanic, IA, and owner can all use from day one.
  Primary CTA: [Try the Live Demo →]
  Secondary CTA: [Request a Scan Quote]
  Right side: Animated dashboard screenshot or short loop video
  Below fold trigger: "Trusted by [X] aircraft operators" + 3 logo marks

SOCIAL PROOF BAND (immediately below hero)
  3–5 customer logos or operator types + one pull quote

HOW IT WORKS (3 steps, visual)
  Step 1: We come to you
  Step 2: We scan, sort, and organize
  Step 3: You get a clean AI workspace

PRODUCT DEMO (interactive, role-based — keep this, it's gold)
  Reframe label: "See it in action — pick your role"

BEFORE / AFTER
  Visual comparison: photo of messy binders → screenshot of clean dashboard

PRICING
  Two clear tiers with starting anchors:
    - One-Time Scan: "From $X per aircraft" [Get a Quote]
    - Fleet / Subscription: "From $X/mo" [Talk to Us]
  Footnote: "All quotes custom — this is a starting reference"

WHO IT'S FOR (keep, trim to 4 personas max)

FOOTER
  Product links | Legal | Contact
```

### 4.2 Design System Fixes

**Color palette (proposed):**
```css
/* Primary — replace soft lavender with a confident navy */
--color-primary:     #1B3A6B;   /* deep aviation navy */
--color-primary-light: #2D5FAA; /* active/hover */
--color-accent:      #E8742A;   /* warm amber — action, urgency */
--color-surface:     #F8F9FB;   /* background — keep light */
--color-text:        #111827;   /* near-black body text */
--color-muted:       #6B7280;   /* secondary text */
--color-border:      #E5E7EB;   /* dividers */
--color-success:     #16A34A;
--color-warning:     #D97706;
--color-danger:      #DC2626;
```

**Typography:**
- Hero H1: 56px / 600 weight / tight tracking — currently good size, keep
- Section headers: Stop using `LETTER-SPACED ALL CAPS` labels as primary section titles. Use them only as micro-labels above actual headings.
- Body: Increase line-height to 1.7 on marketing pages. Currently feels dense.

**Button system (marketing site):**
```
Primary:  bg=#1B3A6B, text=white, radius=8px, padding=14px 28px
Secondary: border=1px #1B3A6B, text=#1B3A6B, bg=transparent
Ghost:    text=#6B7280, no border, used for "Log in" only
Danger:   Never use on marketing
```
**One CTA in the hero.** Always. Max two in any section.

---

## 5. Dashboard Audit

### 5.1 Structural Issues

**Issue 1: "GET STARTED / Live setup" widget is a permanent squatter**
This yellow-ish card in the top of every sidebar panel takes up ~180px of prime real estate on every single page — even after a user has been operating for weeks. It says "Best for accountable owners, operators, and admins who need the aircraft, people, and records tied together without micromanaging every form." That's marketing copy inside a product UI. It should only appear during onboarding and then auto-collapse.

**Issue 2: The Ops page reads like a product brochure**
The Ops hero section contains a 3-line description: *"This surface rolls registry freshness, AD risk, OCR review work, reminders, ingestion failures, and recent audit activity into one AI-assisted operations view so one operator can supervise the system without hopping between tools."*
That's documentation, not UI. In a production SaaS dashboard, you don't narrate what a page does — you just do it. Remove it. The page title ("AI diagnostics and operations console") already tells the story.

**Issue 3: Stat cards have no visual priority system**
The four cards (Registry Attention / Review Queue / AD Risk / Parsing Failures) all look identical regardless of their values. A zero value and a critical value get the same card style. This forces the user to read every number instead of letting the UI surface what needs attention. This is the most dangerous UX failure in a safety-adjacent aviation tool.

**Issue 4: The tab strip "AI OPERATIONS CONSOLE | 3 AIRCRAFT | 0 REVIEW TASKS | 0 REMINDER RISKS" is a status bar, not a navigation pattern**
These are metrics, not tabs. Nobody clicks on "AI OPERATIONS CONSOLE." It should be a status badge row, not styled like tabs.

**Issue 5: Sidebar nav labels are too terse and not role-aware**
"Ops" / "Review" / "Assistant" / "Customers" — these work for a developer who built the product but are disorienting for a flight school admin. They need either icon + label with a clear purpose sub-label, or at minimum contextual tooltips.

**Issue 6: Button style inconsistency inside the dashboard**
- Black filled pill: "prepare 100 hour entry", "Do these records show any open AD references?"
- Blue filled rounded: "Search", "Create from FAA", "Upload records", "Upload"
- Ghost rounded: "Open assistant", "Reopen in assistant", "Preview", "Ask about this"
- Black filled rounded: "Continue" (login)

Four button style families across 8 screens. This feels like four different developers built four different sections.

**Issue 7: The Review page shows a raw error in production**
`Unexpected end of JSON input` is displayed directly to the user in red text. This needs to be a handled empty state with a friendly message, not a stack trace surface.

**Issue 8: Community/Marketplace is buried**
The community marketplace (with real revenue numbers — $1482 earned, 126 downloads) is buried at the bottom of the library section in the sidebar. This is a monetization feature and a trust signal — it should have more prominence.

---

## 6. Dashboard Redesign Blueprint

### 6.1 New Sidebar Structure

```
┌─────────────────────────────┐
│  [M] myaircraft.us    [◀]   │  ← collapsible
│  Horizon Flights            │  ← workspace name, click to switch
├─────────────────────────────┤
│  COMMAND                    │
│  🔲 Ops Console             │  ← was "Ops"
│  💬 AI Assistant            │  ← was "Assistant"
│  📋 Review Queue            │  ← was "Review"
├─────────────────────────────┤
│  FLEET                      │
│  ✈  Aircraft                │
│  👥 Customers               │
├─────────────────────────────┤
│  LIBRARY                    │
│  📁 Documents               │
│  🏪 Marketplace             │  ← was "Community" — rename for clarity
│  📜 History                 │
├─────────────────────────────┤
│  [Org settings]  [?]  [👤]  │  ← bottom action row
└─────────────────────────────┘
```

- Remove the persistent "GET STARTED" widget from the sidebar entirely.
- Replace with a subtle onboarding progress indicator that auto-hides after completion: `⬤⬤⬤○  Setup 75%`.
- Add `Ctrl+K` / `Cmd+K` universal command palette for power users.

### 6.2 Ops Console Redesign

**Current:** Giant explanatory banner + identical stat cards + search bar + two panels (AI insights / Diagnostics) + event log + five more sections.

**Redesigned layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Ops Console               Horizon Flights · 3 Aircraft          │
│                                                       [Role guide]│
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ ✅ 0     │  │ ✅ 0     │  │ ✅ 0     │  │  ✅ 0 Failures   │ │
│  │ Registry │  │ Review   │  │ AD Risk  │  │  OCR / Ingestion  │ │
│  │ Alerts   │  │ Queue    │  │          │  │                   │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 🔍  Search tail, AD number, signer, document, or question  │  │
│  │      @N123AB    AD:94-05-05    signer:john doe             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────┐  ┌────────────────────────────┐ │
│  │ AI Insights                 │  │ Diagnostics                 │ │
│  │ ● System healthy            │  │ ● 1 unlinked doc            │ │
│  │ All queues clear            │  │ 0 identity gaps             │ │
│  └─────────────────────────────┘  └────────────────────────────┘ │
│                                                                   │
│  Recent Activity ─────────────────────────────────────────────── │
│  query.run     Apr 1, 2:13 PM                            info     │
│  conversation  Apr 1, 2:12 PM                            info     │
│  ...                                                              │
└──────────────────────────────────────────────────────────────────┘
```

**Stat card states — critical improvement:**
```
GREEN  (value=0, everything clear):  subtle #F0FDF4 bg, ✅ icon, "All clear" subtext
AMBER  (1–3 items, attention needed): #FFFBEB bg, ⚠️  icon, count prominent in #D97706
RED    (>3 or critical):             #FEF2F2 bg, 🔴 icon, count in #DC2626, pulsing dot
```
The eye immediately goes to the one card that needs attention. No reading required.

### 6.3 Assistant Page Redesign

The `/ask` page is actually well-structured — it's the best page in the dashboard. Key improvements:

- Remove the long descriptive header ("One place to ask, review, print, and save evidence-backed answers.") — replace with a compact context strip.
- The four-cell context bar (Thread / Aircraft Context / Live Workspace / Role) is excellent — keep it, but reduce font size and tighten padding so it takes 1/3 less vertical space.
- Move example queries ("prepare 100 hour entry", "Do these records show any open AD references?") to an inline suggestion row below the input, not as floating black pills stacked in the chat area.
- **Empty state:** When no query has been run, show a clean empty state with 4–6 role-appropriate suggested questions, not just a blank chat area.

### 6.4 Aircraft Page Redesign

Strong foundation. Minor improvements:

- The "FAA-BACKED AIRCRAFT SETUP" black badge + explanatory cards (Registry First / Detail Workspace / Ready for Uploads) are onboarding UI. After user has aircraft, collapse them into a `+ Add aircraft` button with a compact tooltip.
- Aircraft cards: Add a visual status indicator (colored left border or dot) per aircraft. `Valid` green, `Attention needed` amber, `Expired` red. Don't bury status in a badge below the tail number.
- "Workspace health" panel on the right: Great. But `Next Step: Upload records` should be a clickable CTA button, not just text.

### 6.5 Documents Page Redesign

- The three stat cards (Total Records / Shared Library / Processing) are under-designed — they have no trend or change indicator.
- Document list items: add file size, aircraft association, and a quick-action dropdown (`⋯`) to each row. Currently requires clicking into the document to take action.
- `PARSING` badge on "Engine and prop logbook 1" needs a visual state — it looks identical to `COMPLETED`. Use a spinner or progress indicator for in-progress states.
- Add a drag-and-drop upload zone as a prominent empty area at the bottom of the document list, not just a button in the top right.

### 6.6 Customers Page Redesign

- The three-panel layout (Portal accounts / Portal History / Portal access) is too wide and forces horizontal scanning. On a standard 1440px screen, the eye is jumping 800px left to right.
- Role tab strip (Owner / Admin / Mechanic / IA / Billing / Viewer / Auditor) is good but the selected access lane description panel on the right should be a modal/drawer, not a persistent right panel that displaces content.
- `Active: 0 / Prospects: 0 / Open Balance: $0` — these are fine but feel like a placeholder. Add sparkline or last-7-days trend.

### 6.7 Community / Marketplace Redesign

This section is a sleeper. $1,482 earned, 126 downloads on one manual — this is a real marketplace. Treat it like one.

- Rename `Community` → `Marketplace` in the sidebar.
- Show earnings prominently as a **green metric card** at the top — uploader economics is a hook for power users.
- Add search/filter to browse catalog (currently no search visible on the page).
- Each listed book should show: cover thumbnail, type badge, price, download count, revenue share.
- Add a `Browse all` CTA to discover what others have published.

### 6.8 History Page Redesign

- "Insufficient Evidence" label in red is alarming for saved answers that aren't errors — they're just incomplete queries due to missing documents. Rename to `Needs more records` with an amber ⚠️ badge.
- `HIGH` badge on one answer (annual inspection) has no visual connection to priority — just a green label. Add a priority system: `🔴 Action needed / 🟡 Review / 🟢 Confirmed`.
- Add `Export all` and `Share with owner/mechanic` bulk actions to the history list.

---

## 7. Login Page

The login page is the best-designed screen in the product. Keep the layout (left panel / right form) with these refinements:

- The left panel description ("Clean assistant access for records, citations, uploads, and next actions") is good — but the workspace badge (`myaircraft.us`) should show the *operator's* logo/name for white-label feel.
- The role cards in the demo launcher (Owner / A&P / IA / Viewer) are excellent — they're concise and action-oriented. Keep them.
- "Continue with Google" button should use Google's brand colors/icon per their brand guidelines.
- Password field: add show/hide toggle.

---

## 8. Global Design System Fixes

### 8.1 Button System (Dashboard — unified)

```
Primary Action:    bg=#1B3A6B, text=white, radius=6px, height=36px
Destructive:       bg=#DC2626, text=white
Secondary:         border=1px #D1D5DB, bg=white, text=#374151
Ghost/Link:        text=#6B7280, no border
Pill (status tag): radius=999px, height=24px, text=12px — for badges ONLY, not actions
```

**Ban black pill buttons as interactive elements.** They read as selection chips, not actions.

### 8.2 Spacing / Layout

- Sidebar width: 200px (collapsed: 56px icon-only). Currently ~215px — too wide.
- Page content max-width: 1200px centered. Currently allows full bleed which breaks readability at 1920px+.
- Card padding: standardize at 20px. Currently inconsistent (some 16px, some 24px).
- Section separator: Use subtle `1px #E5E7EB` borders, not large whitespace gaps. Saves vertical scroll.

### 8.3 Empty States

Every section that can be empty (Customers, Review Queue, Documents, History) needs a proper empty state:
```
[Icon]
No [items] yet.
[One-line description of what appears here]
[Primary CTA to create the first item]
```
Currently some show blank white space, some show "No portal account matches this search" with no further guidance.

### 8.4 Error Handling

The Review page shows `Unexpected end of JSON input` directly in the UI. All API errors need:
- User-friendly message ("Something went wrong loading this queue")
- A `Try again` button
- Optional: "Contact support" link
- Never expose raw error messages to end users

---

## 9. Priority Implementation Matrix

| Priority | Area | Change | Effort | Impact |
|---|---|---|---|---|
| 🔴 P0 | Dashboard | Fix Review page JSON error — show handled empty state | Low | Critical |
| 🔴 P0 | Marketing | Reduce hero CTAs from 4 to 1 primary + 1 secondary | Low | High |
| 🔴 P0 | Dashboard | Add color-coded stat card states (green/amber/red) on Ops | Medium | High |
| 🟡 P1 | Marketing | Add social proof band below hero (logos / testimonial) | Low | High |
| 🟡 P1 | Dashboard | Remove persistent "GET STARTED" sidebar widget, replace with progress tracker | Medium | High |
| 🟡 P1 | Marketing | Add visual anchor to hero (real dashboard screenshot or video) | Medium | High |
| 🟡 P1 | Dashboard | Unify button system across all 8 screens | Medium | High |
| 🟡 P1 | Marketing | Add pricing anchors ("from $X") with clear tier comparison | Low | High |
| 🟢 P2 | Dashboard | Remove descriptive prose from page headers on Ops/Customers/Aircraft | Low | Medium |
| 🟢 P2 | Marketing | Replace lavender background with clean white + navy brand system | Medium | High |
| 🟢 P2 | Dashboard | Rename sidebar items: Community→Marketplace, Ops→Ops Console | Low | Medium |
| 🟢 P2 | Dashboard | Redesign Aircraft cards with color-coded status borders | Medium | Medium |
| 🟢 P2 | Dashboard | Redesign History page badge system (Insufficient Evidence → Needs more records) | Low | Medium |
| 🔵 P3 | Dashboard | Add Cmd+K command palette | High | Medium |
| 🔵 P3 | Marketing | Add sticky header CTA after hero scroll | Low | Medium |
| 🔵 P3 | Dashboard | Add sparklines/trends to stat cards | High | Low |
| 🔵 P3 | Community | Add search, thumbnails, and browse-all to Marketplace | High | Medium |

---

## 10. Summary: What This Becomes

**Marketing site:** Converts like a SaaS product. Clean hero, one job, one CTA, social proof, pricing anchors, an interactive demo that's already world-class. Aviation-grade trust signals above the fold. Looks like it belongs next to Garmin and ForeFlight.

**Dashboard:** Feels like a professional operations tool, not a guided tour. Data speaks first, explanations are on-demand. Color communicates urgency. The AI assistant is front-and-center rather than buried in a chat interface. Every screen trusts the user to know where they are.

The product is already differentiated. These changes make it *look* as good as it actually *is*.

---

*Audit conducted April 2026. Based on live inspection of myaircraft.us (marketing) and the Horizon Flights demo workspace (dashboard). Benchmarked against bluetail.aero.*
