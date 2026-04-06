# myaircraft.us — Full Product Build Specification
### For Claude Code · Version 1.0 · CTO/Founder-Grade Execution Brief

---

## EXECUTIVE CONTEXT

**Product:** myaircraft.us — Aviation AI Document Intelligence Platform  
**Mission:** Upload aircraft records. Ask questions. Get exact answers with page-level citations.  
**Target Customers:** Aircraft owners, mechanics/IAs, flight schools, repair stations, Part 135 operators, aircraft rental companies, fleet operators, prebuy inspectors  
**Current State:** Admin/internal dashboard only exists. No customer-facing public website.  
**Goal of This Build:** Add a world-class public marketing website + upgrade the entire visual system to premium, bright, investor-grade quality.

**Brand Positioning:** Clean like ChatGPT. Premium like Stripe. Confident like Linear. Trustworthy like a compliance platform. Aviation-intelligent. Not cheesy. Not outdated enterprise.

---

## PRIORITY ORDER

```
1. Custom Design System / UI Kit (foundation for everything)
2. Public Marketing Homepage (customer acquisition — HIGHEST PRIORITY)
3. Auth Screens (Sign in, Create account, Magic link, Forgot password)
4. Onboarding Flow (5-step wizard)
5. App Layout Upgrade (brighter, premium, consistent with design system)
6. Dashboard / Aircraft Workspace
7. Document Library
8. AI Chat Interface
9. Admin Panel
```

---

## PART 0 — DESIGN SYSTEM FIRST (DO THIS BEFORE ANY PAGE)

Before writing a single page component, build and export the full custom design system. All pages must use ONLY these tokens and components. Do not use ad-hoc inline styles or default shadcn defaults unmodified.

### 0A — Design Tokens (`src/design/tokens.ts`)

```ts
export const tokens = {
  // --- COLOR SYSTEM ---
  color: {
    // Backgrounds
    bgBase: '#F8F9FB',         // app background light
    bgSurface: '#FFFFFF',      // card/panel surface
    bgSubtle: '#F1F3F7',       // secondary surface
    bgMuted: '#E8ECF2',        // input backgrounds, dividers

    // Dark theme (app)
    darkBgBase: '#0F1117',
    darkBgSurface: '#161B25',
    darkBgSubtle: '#1C2333',
    darkBgMuted: '#232B3E',

    // Brand / Accent
    accent: '#2563EB',         // aviation blue — primary CTA
    accentHover: '#1D4ED8',
    accentLight: '#EFF6FF',    // accent tint on light bg
    accentDark: '#3B82F6',     // accent on dark bg

    // Gold — use SPARINGLY for trust moments, premium badges
    gold: '#B8860B',
    goldLight: '#FFF8E7',

    // Text
    textPrimary: '#0D1117',
    textSecondary: '#4B5563',
    textTertiary: '#9CA3AF',
    textInverse: '#FFFFFF',

    // Status
    success: '#10B981',
    successLight: '#ECFDF5',
    warning: '#F59E0B',
    warningLight: '#FFFBEB',
    error: '#EF4444',
    errorLight: '#FEF2F2',
    info: '#3B82F6',
    infoLight: '#EFF6FF',

    // Confidence
    confidenceHigh: '#10B981',
    confidenceMedium: '#F59E0B',
    confidenceLow: '#F97316',
    confidenceInsufficient: '#EF4444',

    // Borders
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
    borderDark: '#2A3347',
  },

  // --- TYPOGRAPHY ---
  font: {
    family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
    // Sizes
    xs: '11px',
    sm: '13px',
    base: '15px',
    md: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
    '5xl': '48px',
    '6xl': '60px',
    // Weights
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    // Leading
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
  },

  // --- SPACING ---
  space: {
    1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px',
    6: '24px', 7: '28px', 8: '32px', 10: '40px', 12: '48px',
    16: '64px', 20: '80px', 24: '96px', 32: '128px',
  },

  // --- RADIUS ---
  radius: {
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '18px',
    '2xl': '24px',
    full: '9999px',
  },

  // --- SHADOWS ---
  shadow: {
    sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    md: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
    lg: '0 8px 24px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.06)',
    xl: '0 16px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06)',
    accent: '0 4px 20px rgba(37,99,235,0.25)',
  },

  // --- MOTION ---
  motion: {
    fast: '120ms ease',
    normal: '200ms ease',
    slow: '320ms cubic-bezier(0.4, 0, 0.2, 1)',
    spring: '400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
};
```

---

### 0B — Custom Icon System (`src/design/icons/`)

**CRITICAL: Do NOT use lucide-react or any icon library for the primary UI icons. Build a custom SVG icon set.**

Create `src/design/icons/MaIcon.tsx` as a single source-of-truth icon component:

```tsx
// All icons are 24×24, 1.5px stroke, rounded linecap/linejoin
// Consistent visual grammar: minimal, geometric, aviation-intelligent

type IconName =
  | 'aircraft'       // Abstract tail/fin geometry — NOT a literal plane silhouette
  | 'logbook'        // Stacked pages with a bookmark ribbon
  | 'manual'         // Single document with corner fold
  | 'poh'            // Document with "POH" abstracted as lines
  | 'parts'          // Grid of dots/circles (catalog abstraction)
  | 'shield'         // Shield with inner checkmark
  | 'citation'       // Quote mark + link chain
  | 'page'           // Document with highlighted line
  | 'upload'         // Arrow up into tray
  | 'folder'         // Folder with subtle tab
  | 'search'         // Magnifier with spark
  | 'chat'           // Chat bubble with sparkle (AI indicator)
  | 'spark'          // Four-point star (AI / intelligence)
  | 'lock'           // Padlock
  | 'users'          // Two overlapping figures (abstract)
  | 'settings'       // Sliders (not gear)
  | 'billing'        // Card with stripe
  | 'alert'          // Triangle with dot
  | 'check'          // Refined checkmark
  | 'history'        // Circle with clock hands
  | 'cloud'          // Cloud with up arrow
  | 'scan'           // Corner brackets (OCR scan frame)
  | 'chevronRight'   // Arrow right
  | 'chevronDown'    // Arrow down
  | 'close'          // X
  | 'menu'           // Hamburger
  | 'plus'           // Plus
  | 'arrowRight'     // Right arrow with longer tail
  | 'confidence'     // Signal bars (4 bars, fill indicates level)
  | 'workspace'      // Abstract grid/building
  | 'export'         // Arrow leaving box
  | 'bookmark'       // Ribbon bookmark
```

Build each icon as hand-crafted SVG paths. Wrap in:

```tsx
interface MaIconProps {
  name: IconName;
  size?: number;       // default 20
  color?: string;      // default 'currentColor'
  strokeWidth?: number; // default 1.5
  className?: string;
}

export function MaIcon({ name, size = 20, color = 'currentColor', strokeWidth = 1.5, className }: MaIconProps) {
  // Returns <svg viewBox="0 0 24 24" ...> with the correct path
}
```

**All icons must look like a single designer drew them. Stroke only (no fill), except for specific filled variants like the `spark` icon.**

---

### 0C — Custom Loader System (`src/design/loaders/`)

Create 3 custom loaders — do NOT use any library:

```tsx
// 1. PulseLoader — 3 dots pulsing in sequence (used for AI typing)
// 2. SpinLoader — thin ring with a 20% colored arc rotating (page loads)
// 3. SkeletonLoader — shimmer block with gradient animation (content loading)
// 4. ProgressBar — thin top-of-page blue bar, indeterminate or determinate
```

---

### 0D — Component Library (`src/design/components/`)

Build these as fully custom components using the token system. They must NOT look like default shadcn.

#### Buttons (`MaButton.tsx`)
```
Variants: primary | secondary | ghost | destructive | gold
Sizes: sm | md | lg
States: default | hover | active | disabled | loading
Modifiers: iconLeft | iconRight | iconOnly
```
- Primary: accent blue, subtle glow on hover (`box-shadow: 0 0 0 3px rgba(37,99,235,0.15)`)
- Secondary: white bg, border, dark text
- Ghost: transparent bg, colored text
- Loading state: replace label with `PulseLoader`, disable pointer events

#### Inputs (`MaInput.tsx`)
```
Variants: default | search | with-icon
States: default | focus | error | disabled
```
- Focus ring: `box-shadow: 0 0 0 3px rgba(37,99,235,0.15)`, border becomes accent
- Floating label animation

#### Cards (`MaCard.tsx`)
```
Variants: default | elevated | interactive | feature | stat | citation
```
- `interactive`: hover lifts with shadow transition
- `citation`: accent left border, slight bg tint

#### Badges (`MaBadge.tsx`)
```
Variants: docType | status | role | confidence | trust
DocTypes: logbook | poh | afm | manual | parts | workorder | ad | sb | 337 | form8130
Status: active | processing | error | complete | pending
Confidence: high | medium | low | insufficient
```

#### CitationCard (`MaCitationCard.tsx`)
Special compound component — critical to the product.
```tsx
interface CitationCardProps {
  docName: string;
  docType: DocType;
  section?: string;
  pageNumber: number;
  snippet: string;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  onPreview?: () => void;
}
```
Design: white card, left accent border colored by confidence, doc type badge, page number chip, snippet text (2 lines), "View source →" link.

#### ConfidenceBar (`MaConfidenceBar.tsx`)
Visual indicator: segmented bar (4 segments), color fills based on level.
Labels: `High Confidence` / `Medium Confidence` / `Low Confidence` / `Insufficient Evidence`

#### TrustChip (`MaTrustChip.tsx`)
Small inline chip: shield icon + "Source-grounded" or "Citation-backed"

---

## PART 1 — PUBLIC MARKETING HOMEPAGE

**File:** `src/pages/marketing/HomePage.tsx`  
**Route:** `/` (public, no auth required)  
**Theme:** WEB LIGHT — bright, premium, Stripe-quality

### Overall Layout
```
<MarketingLayout>  ← sticky nav + footer wrapper
  <HeroSection />
  <TrustBar />
  <WhyNowSection />
  <HowItWorksSection />
  <FeaturesSection />
  <WhoIsItForSection />
  <ProductPreviewSection />
  <SecuritySection />
  <ComparisonSection />
  <TestimonialsSection />
  <FAQSection />
  <FinalCTASection />
</MarketingLayout>
```

---

### Navigation (`src/components/marketing/MarketingNav.tsx`)

**Desktop:**
- Left: Logo (custom SVG mark + "myaircraft.us" wordmark in Inter 600)
- Center: `Product` | `How It Works` | `Solutions` | `Security` | `Pricing`
- Right: `Log in` (ghost button) + `Book Demo` (primary blue button)
- Sticky on scroll: add `backdrop-blur-md bg-white/80` + subtle bottom border
- Smooth transition: `transition: background 200ms, box-shadow 200ms`

**Mobile:**
- Hamburger → full-screen slide-down menu
- Logo centered
- CTA buttons stacked full-width

**Scroll behavior:** At 80px scroll, nav background becomes `bg-white/90 backdrop-blur-lg shadow-sm`

---

### Section 1 — Hero (`src/components/marketing/HeroSection.tsx`)

**Layout:** Two-column on desktop (text left, product mockup right), single column mobile

**Left:**
```
BADGE (optional): [spark icon] Aviation Document Intelligence
H1: "Ask Your Aircraft Anything."
Subheadline (18px, slate-600):
  "Upload logbooks, POH, manuals, and maintenance records.
   Ask questions in plain English. Get exact answers with
   page-level citations — from your documents, not the internet."
CTA Row:
  [Book Demo →]  (primary, lg)    [See How It Works]  (ghost, lg)
Trust Strip (4 items in a row, small):
  ✓ Citation-backed answers
  ✓ Aircraft-by-aircraft organization
  ✓ Private or shared library
  ✓ Secure team access
```

**Right — Product Mockup (build as React component, NOT an image):**
Build `src/components/marketing/AppMockup.tsx` — a realistic mini replica of the AI chat interface:
```
Dark card with subtle border, soft shadow, 2xl radius
Inside:
  Header bar: [aircraft icon] N172MA  |  [search icon]  [upload icon]
  Chat area (shows 2 exchanges):
    USER: "When was the last annual inspection completed?"
    AI RESPONSE CARD:
      "The annual inspection was completed on March 14, 2024,
       signed off by IA John Harrison (certificate #3847291)."
      [CitationCard]: "2024 Annual Logbook Entry · Page 47 · High Confidence"
      [View source page →]
```
This mockup must look like a real product screenshot, built entirely in code.

**Background:** Very subtle radial gradient — near white center fading to `#F1F5FF` at edges. Optional: faint runway/grid lines SVG pattern at very low opacity (5%).

---

### Section 2 — Trust Bar

Horizontal strip, light gray bg (`#F8F9FB`), subtle top/bottom borders:
```
"Trusted by aircraft owners, mechanics, flight schools, and operators"
[4 trust badges arranged in a row]:
  [shield icon] Citation-backed answers
  [workspace icon] Aircraft-specific workspaces
  [lock icon] Secure multi-tenant access
  [cloud icon] Google Drive + PDF ingestion
```

---

### Section 3 — Why Now (4 Problem Cards)

Section heading: "Aviation records are broken. We fixed that."

```
4-column card grid:
┌─────────────────────┐  ┌─────────────────────┐
│  [alert icon]       │  │  [search icon]       │
│  Records are        │  │  Searching PDFs      │
│  scattered          │  │  wastes hours        │
│                     │  │                      │
│  Logs in binders,   │  │  Ctrl+F doesn't work │
│  PDFs on drives,    │  │  on scanned docs or  │
│  manuals on shelves │  │  across 40 files     │
└─────────────────────┘  └─────────────────────┘
┌─────────────────────┐  ┌─────────────────────┐
│  [spark icon]       │  │  [citation icon]     │
│  Generic AI         │  │  Aviation needs      │
│  hallucinates       │  │  traceability        │
│                     │  │                      │
│  ChatGPT doesn't    │  │  Every answer must   │
│  know your          │  │  link to a document  │
│  aircraft's records │  │  page and source     │
└─────────────────────┘  └─────────────────────┘
```

---

### Section 4 — How It Works (4-Step Flow)

**Layout:** Horizontal step flow on desktop, vertical on mobile.

Step connectors: thin dashed line between step numbers.

```
① Upload / Import
   Drag-drop PDFs or connect Google Drive.
   Logbooks, POH, AFM, manuals, ADs, work orders.
   [upload icon — large, centered, in accent blue circle]

② Organize by Aircraft
   Every document is tagged to a specific aircraft
   and classified by type automatically.
   [folder icon]

③ Ask in Plain English
   Type any question about your aircraft's history,
   specs, maintenance, or compliance.
   [chat icon]

④ Get Answers with Citations
   Every answer shows the source document, section,
   page number, and a highlighted snippet.
   [citation icon]
```

Below the steps: show a mini animation mock of the citation answer flow (purely CSS/React, not video).

---

### Section 5 — Features Grid

Heading: "Everything your aircraft records need."

**8-card grid (4x2 desktop, 2x4 tablet, 1x8 mobile):**

Each card: icon top-left, feature name, 1-line description, optional small UI mini-mockup thumbnail.

```
[workspace icon]  Aircraft Workspace
  One dedicated knowledge base per aircraft.
  All documents, history, and answers — organized by N-number.

[folder icon]     Document Library
  Upload PDFs, scanned logs, Google Drive files.
  Auto-classified by type: logbook, POH, AFM, IPC, AD...

[chat icon]       Ask AI with Citations
  Natural language queries answered from your documents only.
  Never from the internet. Always with page-level citations.

[lock icon]       Private Library Option
  Keep documents private to your account or share with your team.
  You control who sees what.

[users icon]      Team Roles + Access
  Add mechanics, pilots, admins, and guests.
  Role-based access with audit trail.

[cloud icon]      Google Drive Import
  Connect Drive folders and auto-sync.
  No manual re-uploading when documents change.

[scan icon]       OCR for Scanned Docs
  Handwritten logs and scanned maintenance records
  processed with aviation-optimized OCR. (Pro+)

[history icon]    Query History + Bookmarks
  Every question and answer saved.
  Bookmark important answers for quick reference.
```

---

### Section 6 — Who It's For

Heading: "Built for every role in aviation."

**6 audience cards (3x2 grid), each card has:**
- Custom small illustration/icon (SVG, custom-built — NOT stock)
- Role title (bold)
- Pain point (1 line, slate)
- Benefit (1 line, accent or green)

```
✈ Aircraft Owners
  Pain: Your maintenance history is buried in binders and PDFs.
  Benefit: Ask about any inspection, AD, or repair — instantly.

🔧 Mechanics / IAs
  Pain: Cross-referencing manuals and logbooks eats hours.
  Benefit: Find torque specs, procedures, and SB status in seconds.

🏫 Flight Schools
  Pain: Fleet records are scattered across staff and drives.
  Benefit: Centralized aircraft workspaces for every aircraft in the fleet.

🔩 Repair Stations
  Pain: Locating applicable ADs and service bulletins takes time.
  Benefit: Compliance research grounded in your own documents.

🛫 Part 135 Operators
  Pain: Compliance docs are spread across crew, ops, and maintenance.
  Benefit: One searchable workspace per aircraft, with team access controls.

📋 Prebuy Inspectors
  Pain: Reviewing aircraft records for a prebuy takes days.
  Benefit: Upload the logs, ask the hard questions, get cited answers.
```

---

### Section 7 — Product Preview Strip

Dark-bg section (navy `#0D1117`), heading in white:
"See the product in action."

Show 3 side-by-side dark app mockup cards:
1. **Dashboard** — Aircraft list with status indicators
2. **AI Chat** — Question + citation answer
3. **Document Viewer** — PDF with highlighted page

These are code-built mini replicas, same style as the hero mockup.

---

### Section 8 — Security & Trust

Light bg section. Heading: "Evidence-first. Always."

```
Left (large text):
  "myaircraft.us never guesses.
   Every answer is grounded in your uploaded documents,
   or it tells you there's insufficient evidence."

Right (4 trust cards, 2x2):
  [shield] Tenant Isolation
    Your documents are never shared with other accounts.
  
  [lock] Role-Based Access
    Control who can view, query, and manage each aircraft.
  
  [citation] Citations Required
    No answer is returned without a traceable source document.
  
  [history] Audit Logs
    Full history of queries, uploads, and access. (Fleet+)
```

---

### Section 9 — Comparison Table

Heading: "Not just storage. Not just AI. Aviation records intelligence."

```
Feature                      | Google Drive  | Generic AI  | myaircraft.us
-----------------------------|--------------|-------------|---------------
Aircraft organization        | ✗            | ✗           | ✓
Citation-backed answers      | ✗            | ✗           | ✓
Page-level source traceability | ✗          | ✗           | ✓
Aviation document types      | ✗            | ✗           | ✓
Refuses to hallucinate       | N/A          | ✗           | ✓
Team access controls         | Basic        | ✗           | ✓
Audit trail                  | ✗            | ✗           | ✓ (Fleet+)
OCR for scanned logs         | ✗            | ✗           | ✓ (Pro+)
```

Style: clean table, accent color checkmarks, muted X's, `myaircraft.us` column has subtle blue highlight.

---

### Section 10 — Testimonials

3 testimonials in card format. Personas:

```tsx
{
  name: "Michael Torres",
  role: "Cessna 182 Owner · 1,200 hrs TT",
  quote: "I spent 3 hours searching my logbooks before a prebuy inspection.
          Now I just ask. The citations make me confident I'm not missing anything.",
  avatar: "MT" // initials avatar, no photo
},
{
  name: "Rachel Kim",
  role: "Director of Maintenance · SkyBridge Flight Academy",
  quote: "Managing records for 12 aircraft used to require 3 people.
          myaircraft.us cut our records research time by 70%.",
  avatar: "RK"
},
{
  name: "Dave Okonkwo",
  role: "A&P/IA · Independent Mechanic",
  quote: "I can cross-reference an AD against a maintenance manual
          and get the relevant section in 20 seconds. That used to take an hour.",
  avatar: "DO"
}
```

---

### Section 11 — FAQ Accordion

```
Q: What types of documents can I upload?
A: PDFs, scanned documents (JPEG, PNG), and Google Drive files. Supported types include
   aircraft logbooks, POH, AFM and supplements, maintenance manuals, service manuals,
   parts catalogs (IPC), work orders, inspection reports, 337 forms, 8130 forms,
   service bulletins, and airworthiness directives.

Q: Can I keep my documents private?
A: Yes. Every document is private by default. You choose what to share with team members.
   Documents are never accessible to other organizations or used to train AI models.

Q: Do answers always show citations?
A: Yes, always. If the system cannot find sufficient evidence in your uploaded documents,
   it returns an "Insufficient Evidence" response rather than guessing.

Q: Can my team access the same aircraft workspace?
A: Yes. Invite mechanics, pilots, admins, and guests. Each role has configurable permissions
   for viewing documents, running queries, and managing aircraft.

Q: Is this a replacement for maintenance tracking software?
A: No. myaircraft.us is a document intelligence and search layer. It works alongside your
   existing maintenance tracking tools. Think of it as making all your existing records
   searchable and queryable.

Q: How do you handle scanned or handwritten pages?
A: Scanned documents and handwritten logs are processed with OCR as part of the Pro and
   Fleet plans. Accuracy varies by scan quality. We surface confidence levels on every answer.

Q: Can I import from Google Drive?
A: Yes. Connect a Google Drive folder and documents are automatically imported and indexed.
   Changes sync on a scheduled basis.

Q: How do we get started?
A: Book a demo and we'll walk you through setting up your organization and first aircraft
   workspace. Most teams are up and running in under 30 minutes.
```

---

### Section 12 — Final CTA

Dark navy background (`#0D1117`), centered:
```
Heading (large, white): "Turn aircraft records into searchable intelligence."
Subheading (slate-400): "Set up your aircraft workspace in minutes."
CTA Row: [Book Demo →] (primary)   [Get Started Free] (secondary/ghost white)
Fine print: No credit card required · 14-day free trial · Setup in under 30 minutes
```

---

### Footer

4-column footer, `#F8F9FB` bg:

```
Column 1: Logo + tagline "Ask your aircraft anything."
           [Brief company description — 1 line]

Column 2: Product
  Document Library · AI Search · Aircraft Workspaces · Team Access · Pricing

Column 3: Solutions
  Aircraft Owners · Flight Schools · Mechanics · Repair Stations · Part 135 Operators

Column 4: Company
  About · Security · Blog · Docs · Contact · Log in

Bottom bar: © 2025 myaircraft.us · Privacy Policy · Terms of Service
```

---

## PART 2 — AUTH SCREENS

**File:** `src/pages/auth/`  
**Theme:** Split-panel — dark left (product messaging), white right (form)

### Auth Layout (`src/components/auth/AuthLayout.tsx`)

```
Left panel (40% width, dark navy bg):
  Logo top-left
  Large product tagline: "Your aircraft records, finally searchable."
  3 trust bullet points:
    ✓ Citation-backed answers
    ✓ Aircraft-specific workspaces
    ✓ Secure and private
  Bottom: Subtle app mockup preview

Right panel (60% width, white):
  Form content centered
```

### Pages:

**Sign In (`/signin`):**
```
"Welcome back"
Email input
Password input + show/hide toggle
[Sign In] primary button
"Forgot password?" link
Divider: "or"
[Continue with Google] — secondary button with Google icon (custom SVG)
Bottom: "Don't have an account? Create one →"
```

**Create Account (`/signup`):**
```
"Create your account"
Subtitle: "Start with a free 14-day trial. No credit card required."
Full name input
Email input
Password input (with strength indicator — 4 segments)
Confirm password input
[Create account] primary button
[Continue with Google] secondary
"Already have an account? Sign in →"
```

**Forgot Password (`/forgot-password`):**
```
Back arrow + "Sign in"
"Reset your password"
Subtitle: "Enter your email and we'll send a magic link."
Email input
[Send reset link] primary
```

**Magic Link Sent (state, same page):**
```
[check icon in accent circle]
"Check your email"
"We sent a link to pilot@example.com"
"Didn't get it? Resend →"
```

---

## PART 3 — ONBOARDING FLOW

**File:** `src/pages/onboarding/`  
**Layout:** Centered card, max 560px wide, progress stepper at top, 5 steps.

### Stepper Component
Custom step indicator: numbered circles connected by lines. Active = filled accent. Complete = check icon. Incomplete = outlined.

### Step 1 — Organization Setup
```
"Set up your organization"
Organization name [input]
Your role [select]:
  Aircraft Owner · A&P Mechanic · IA · Flight School Staff · Repair Station · Operator · Other
Organization type [select]:
  Individual Owner · Mechanic Shop · Flight School · Part 135 Operator · Repair Station · Fleet Operator
[Continue →]
```

### Step 2 — Add First Aircraft
```
"Add your first aircraft"
N-Number / Tail Number [input]
Serial Number [input]
Make [input] e.g. "Cessna"
Model [input] e.g. "172S Skyhawk"
Year [input]
Engine Make/Model [input] (optional)
Propeller [input] (optional)
[Continue →]  [Skip for now]
```

### Step 3 — Upload First Documents
```
"Upload your aircraft documents"
[Large drag-drop zone with upload icon and "Drop PDFs here or click to browse"]
Supported: PDF, JPEG, PNG, Google Drive
Document types hint chips: [Logbook] [POH] [AFM] [Maintenance Manual] [ADs] [Work Orders]
[Connect Google Drive] button (secondary)
[Continue →]  [Skip for now]
```

### Step 4 — Workspace Goal
```
"What do you want to do first?"
[5 selectable goal cards — click to select, multi-select OK]:
  🔍 Search my records
  🔧 Prepare for maintenance
  📋 Prebuy review
  ✅ Compliance review
  👥 Team knowledge base
[Continue →]
```

### Step 5 — First AI Prompt
```
"Your workspace is ready."
[Check animation — the custom ConfidenceBar fills to green]
"Try asking a question:"
[3 example prompt chips]:
  "When was the last annual inspection?"
  "What oil type does this aircraft use?"
  "Are there any open airworthiness directives?"
[Large chat input] "Ask anything about N172MA..."
[Ask →] primary button
```

---

## PART 4 — APP VISUAL UPGRADE

**Important:** The existing admin dashboard (`src/pages/Overview.tsx`, `TenantManagement.tsx`) works correctly. Do NOT break its functionality. Apply visual upgrades only.

### 4A — App Shell (`src/components/layout/Root.tsx`)

Upgrade from current dark navy to **brighter light theme**:

```
Left sidebar:
  Background: WHITE (#FFFFFF)
  Border-right: 1px solid #E2E8F0
  Width: 240px

Main content area:
  Background: #F8F9FB
  
Top bar (if present):
  Background: WHITE
  Border-bottom: 1px solid #E2E8F0
  Height: 56px
```

### 4B — Sidebar (`src/components/layout/Sidebar.tsx`)

Full redesign:
```
Top: Logo + org switcher dropdown
Nav sections with labels:

[AIRCRAFT]
  Aircraft List (icon: aircraft)
  Add Aircraft (icon: plus)

[WORKSPACE]
  Documents (icon: folder)
  Ask AI (icon: chat)
  Query History (icon: history)

[MANAGE]
  Team (icon: users)
  Settings (icon: settings)
  Billing (icon: billing)

[ADMIN — conditional, role=admin only]
  Platform Overview (icon: workspace)
  Tenant Management (icon: building)
  Alerts (icon: alert)

Bottom: User avatar + name + "Sign out"
```

Active nav item: accent blue left border, light blue bg tint.

### 4C — Stat Cards

Upgrade current `StatCard.tsx`:
- White background (not dark)
- Subtle shadow (`shadow-md`)
- Accent color icon container (light tint bg)
- Sparkline in muted accent color
- Delta in green/red with correct icon

### 4D — Color Overrides for Charts

Update all recharts colors to use design system tokens:
```
Primary series: #2563EB
Secondary: #8B5CF6  
Tertiary: #10B981
Grid lines: #E2E8F0
Axis labels: #9CA3AF
```

---

## PART 5 — AIRCRAFT WORKSPACE PAGES

### 5A — Aircraft List (`src/pages/app/AircraftList.tsx`)
```
Header: "My Aircraft" + [+ Add Aircraft] button
Grid of aircraft cards:
  Each card: Tail number (large), Make/Model, Year
  Status badge: Active / Inactive / Processing
  Stat row: X documents · Last query: 2 days ago
  [Open Workspace →] link
Empty state: Upload icon + "Add your first aircraft" + CTA button
```

### 5B — Aircraft Workspace (`src/pages/app/AircraftWorkspace.tsx`)
```
Header: [Aircraft icon] N172MA · Cessna 172S Skyhawk · 2003
Tabs: Overview | Documents | Ask AI | History

Overview tab:
  Stats row: Total documents, Last ingested, Total queries, Confidence avg
  Recent documents table (last 5)
  Recent queries list (last 5)
  
Documents tab:
  Filter chips: All | Logbook | POH | AFM | Manuals | ADs | Work Orders
  List/grid toggle
  Each row: Doc type badge, filename, upload date, page count, status badge
  
Ask AI tab: (see Part 6)

History tab:
  Chronological list of past queries with answers (collapsed, expandable)
```

---

## PART 6 — AI CHAT INTERFACE

**File:** `src/pages/app/AskAI.tsx`  
**This is the core product experience — build it to be exceptional.**

### Layout
```
Left sidebar (280px): Query History
  Search history input
  Grouped by date: Today, Yesterday, This Week
  Each item: Query text (truncated), timestamp

Main area:
  Header: [aircraft icon] N172MA · Ask AI
  [Citation-backed] trust chip   [+ New conversation] button
  
  Chat messages area (scrollable):
    USER messages: right-aligned, white bg, blue text
    AI messages: left-aligned, light gray bg
    
  Input bar (bottom, sticky):
    [Text input] "Ask anything about N172MA..."
    [Ask →] button
    Disclaimer: "Answers are based solely on uploaded documents."
```

### AI Answer Card Design
```
AI RESPONSE:
  [Answer text in clean paragraph format]
  
  Citations section (below answer):
    Heading: "Sources" with citation icon
    [CitationCard component × N citations]
    
  Confidence section:
    [ConfidenceBar] — filled to level
    
  If insufficient evidence:
    [alert icon in orange] "Insufficient Evidence"
    "The uploaded documents do not contain enough information
     to answer this question confidently."
    "Try uploading additional records such as: [relevant doc type suggestions]"
```

### Example Exchange to Pre-populate (for demo state)
```
User: "When was the last annual inspection completed?"

AI: "The last annual inspection was completed on March 14, 2024, 
     and was signed off by IA John Harrison (certificate number 3847291). 
     The aircraft was found airworthy with no discrepancies noted."

Citations:
  [CitationCard]: 2024 Maintenance Log · Annual Inspection Entry · Page 47 · High Confidence
  [CitationCard]: Aircraft Logbook Vol. 3 · Page 112 · High Confidence
  
Confidence: HIGH ████████████░ 94%
```

---

## PART 7 — DOCUMENT LIBRARY

**File:** `src/pages/app/DocumentLibrary.tsx`

```
Header: "Document Library" + [Upload Documents] button + [Connect Drive] button

Filter bar:
  Search input | Type filter dropdown | Status filter | Date range

Document grid (toggle: list/grid):
  List view row:
    [doc type icon]  [filename]  [doc type badge]  [pages]  [status]  [upload date]  [...]
    
  Grid view card:
    Doc type badge
    Filename (bold)
    Pages · Date
    Status chip
    [Preview] [Ask about this doc →]

Upload area (shown when empty or as floating button):
  Drag-drop zone
  "Drop PDF files here"
  File type hints
  
Processing state (after upload):
  Row shows spinner + "Processing — extracting text..." status
  
Error state:
  Row shows error badge + "Processing failed" + retry button
```

---

## PART 8 — ADMIN PLATFORM PAGES (EXISTING — UPGRADE VISUALS ONLY)

Preserve all existing logic in `Overview.tsx` and `TenantManagement.tsx`.

Apply:
1. Replace all lucide icon imports with `MaIcon` custom icons
2. Replace all inline `style={{}}` color values with tokens
3. Upgrade card backgrounds to white with shadow-md
4. Upgrade badge components to `MaBadge`
5. Replace any dark backgrounds with the light theme
6. Ensure stat cards use the upgraded `StatCard` with `MaIcon`

---

## PART 9 — FILE + FOLDER STRUCTURE

```
src/
├── design/
│   ├── tokens.ts                    ← ALL design tokens
│   ├── icons/
│   │   └── MaIcon.tsx               ← Custom icon system
│   ├── loaders/
│   │   ├── PulseLoader.tsx
│   │   ├── SpinLoader.tsx
│   │   └── SkeletonLoader.tsx
│   └── components/
│       ├── MaButton.tsx
│       ├── MaInput.tsx
│       ├── MaCard.tsx
│       ├── MaBadge.tsx
│       ├── MaCitationCard.tsx
│       ├── MaConfidenceBar.tsx
│       └── MaTrustChip.tsx
│
├── components/
│   ├── marketing/
│   │   ├── MarketingLayout.tsx       ← Nav + footer wrapper
│   │   ├── MarketingNav.tsx
│   │   ├── HeroSection.tsx
│   │   ├── TrustBar.tsx
│   │   ├── WhyNowSection.tsx
│   │   ├── HowItWorksSection.tsx
│   │   ├── FeaturesSection.tsx
│   │   ├── WhoIsItForSection.tsx
│   │   ├── ProductPreviewSection.tsx
│   │   ├── SecuritySection.tsx
│   │   ├── ComparisonSection.tsx
│   │   ├── TestimonialsSection.tsx
│   │   ├── FAQSection.tsx
│   │   └── FinalCTASection.tsx
│   ├── auth/
│   │   └── AuthLayout.tsx
│   ├── layout/
│   │   ├── Root.tsx                  ← UPGRADED
│   │   └── Sidebar.tsx               ← REBUILT
│   └── AppMockup.tsx                 ← Hero product preview
│
├── pages/
│   ├── marketing/
│   │   └── HomePage.tsx
│   ├── auth/
│   │   ├── SignIn.tsx
│   │   ├── SignUp.tsx
│   │   └── ForgotPassword.tsx
│   ├── onboarding/
│   │   └── OnboardingFlow.tsx
│   └── app/
│       ├── AircraftList.tsx
│       ├── AircraftWorkspace.tsx
│       ├── AskAI.tsx
│       ├── DocumentLibrary.tsx
│       ├── Overview.tsx              ← EXISTS — visual upgrade only
│       └── TenantManagement.tsx      ← EXISTS — visual upgrade only
│
├── data/
│   └── mockData.ts                   ← EXISTS — extend with new mock data
│
├── routes.tsx                        ← Add all new routes
└── App.tsx                           ← EXISTS
```

---

## PART 10 — ROUTING

Update `src/routes.tsx` (or `src/app/routes.tsx` per current structure):

```tsx
// Public routes
'/'                    → HomePage (marketing)
'/signin'             → SignIn
'/signup'             → SignUp
'/forgot-password'    → ForgotPassword

// Onboarding (auth required, onboarding incomplete)
'/onboarding'         → OnboardingFlow

// App routes (auth required, onboarding complete)
'/app'                → redirect to /app/aircraft
'/app/aircraft'       → AircraftList
'/app/aircraft/:id'   → AircraftWorkspace
'/app/aircraft/:id/documents' → DocumentLibrary
'/app/aircraft/:id/ask'       → AskAI
'/app/aircraft/:id/history'   → QueryHistory

// Admin routes (role: admin)
'/admin'              → Overview (existing)
'/admin/tenants'      → TenantManagement (existing)
```

---

## PART 11 — ANIMATION & MOTION GUIDELINES

Use Framer Motion (`motion` package already in dependencies) for:

1. **Page transitions:** `opacity: 0→1, y: 8→0`, 200ms ease
2. **Card hover:** `y: 0→-2`, scale: 1→1.01, shadow upgrade, 200ms
3. **Hero mockup:** Subtle float animation (`y: 0→-6→0`), 4s loop, ease-in-out
4. **CTA button hover:** Slight scale up (1→1.03), glow pulse
5. **Citation cards:** Stagger in on mount, 60ms between each
6. **Onboarding steps:** Slide left/right on step change
7. **FAQ accordion:** Smooth height expand, 200ms
8. **Confidence bar:** Animated fill on mount, 600ms spring

**DO NOT** over-animate. Every animation must serve a purpose. If in doubt, leave it static.

---

## PART 12 — RESPONSIVE BREAKPOINTS

```
Mobile:   < 640px    (sm)
Tablet:   640–1024px (md)
Desktop:  1024–1280px (lg)
Wide:     > 1280px   (xl)
```

Mobile-specific requirements:
- Marketing nav: hamburger menu, full-screen overlay
- Hero: stack text above mockup, mockup scales down
- Feature grid: 1 column on mobile, 2 on tablet, 4 on desktop
- Comparison table: horizontal scroll on mobile
- Sidebar: bottom tab bar on mobile (max 5 tabs)
- Chat input: fixed to bottom on mobile

---

## PART 13 — TYPOGRAPHY SETUP

Add to `index.html` (or via CSS):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

Set base font in global CSS:
```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

---

## PART 14 — LOGO SYSTEM

The current logo is a blue paper-plane chevron (`➤`) + "myaircraft.us" text. Upgrade it.

Build `src/design/Logo.tsx` — SVG logomark (custom, not emoji):

**Concept direction for the mark:**  
An abstract "MA" monogram where the M is formed by two converging runway centerline lines (like an approach path seen from above), with a small dot at the apex suggesting a waypoint or fix. Simple, geometric, scales to favicon size.

**Provide 4 variants:**
```tsx
type LogoVariant = 'full' | 'horizontal' | 'mark-only' | 'favicon';
type LogoTheme = 'light' | 'dark';

<Logo variant="full" theme="dark" />       ← Mark above wordmark
<Logo variant="horizontal" theme="light" /> ← Mark + wordmark side by side
<Logo variant="mark-only" />                ← Icon only
<Logo variant="favicon" />                  ← Simplified for 16px
```

The wordmark "myaircraft.us" should use Inter 700, letter-spacing: -0.02em.

---

## PART 15 — MOCK DATA EXTENSIONS

Extend `src/data/mockData.ts` with:

```ts
// Marketing page mock data
export const testimonials: Testimonial[]  // 3 items
export const faqItems: FAQItem[]          // 8 items
export const featureList: Feature[]       // 8 items
export const audienceCards: AudienceCard[] // 6 items

// App mock data
export const mockAircraft: Aircraft[]     // 3 aircraft
export const mockDocuments: Document[]   // ~15 documents
export const mockQueryHistory: Query[]   // ~10 past queries

// Sample AI conversation
export const sampleConversation: Message[] // 3-4 exchanges
```

---

## EXECUTION PRIORITIES (Build in this order)

**Phase 1 — Foundation (do first, everything depends on this):**
1. `src/design/tokens.ts`
2. `src/design/icons/MaIcon.tsx` (all 32 icons)
3. `src/design/loaders/` (all 3 loaders)
4. `src/design/components/MaButton.tsx`
5. `src/design/components/MaInput.tsx`
6. `src/design/components/MaCard.tsx`
7. `src/design/components/MaBadge.tsx`
8. `src/design/components/MaCitationCard.tsx`
9. `src/design/components/MaConfidenceBar.tsx`
10. `src/design/Logo.tsx`

**Phase 2 — Marketing Homepage (highest business priority):**
11. `src/components/marketing/MarketingLayout.tsx` + `MarketingNav.tsx`
12. `src/components/marketing/HeroSection.tsx` + `AppMockup.tsx`
13. All other marketing sections (TrustBar → Footer)
14. `src/pages/marketing/HomePage.tsx`

**Phase 3 — Auth + Onboarding:**
15. `src/components/auth/AuthLayout.tsx`
16. Sign In, Sign Up, Forgot Password pages
17. `src/pages/onboarding/OnboardingFlow.tsx`

**Phase 4 — App Upgrade:**
18. Sidebar rebuild
19. Root layout upgrade
20. Aircraft List + Workspace
21. Document Library
22. Ask AI chat interface

**Phase 5 — Admin Upgrade (existing, visual only):**
23. Apply design system to existing Overview + TenantManagement

---

## QUALITY BAR CHECKLIST

Before considering any section complete, verify:

- [ ] Zero lucide-react imports in new files — use `MaIcon` exclusively
- [ ] Zero inline `style={{color: '#hex'}}` — use tokens
- [ ] All cards have proper shadow and radius from tokens
- [ ] Buttons have hover states with transition
- [ ] All interactive elements have focus rings (accessibility)
- [ ] Marketing homepage loads fast — no heavy assets
- [ ] AppMockup is code-built, not an image
- [ ] CitationCard shows in every AI answer
- [ ] Mobile responsive — test each section at 375px
- [ ] Logo is SVG logomark (not emoji ➤)
- [ ] Fonts load from Google Fonts (Inter)
- [ ] Animations are tasteful — max 1–2 per section
- [ ] Empty states are designed and beautiful
- [ ] The site reads as a premium B2B SaaS in 5 seconds

---

## FINAL DESIGN PHILOSOPHY NOTE

This product serves people whose safety depends on accurate aircraft records. The design must communicate: **competence, precision, and trust** — not just beauty.

Every design decision should reinforce:
- "This tool is accurate."
- "This tool knows aviation."
- "This tool protects my records."
- "I can trust what it tells me."

That means: clean layouts, clear hierarchy, generous whitespace, confident typography, and an absolutely unwavering citation-first answer design.

Never let a page feel like a generic SaaS template. This is an aviation intelligence platform. Every element — from icon geometry to error message copy — should feel like it was built specifically for the people who fly, maintain, and operate aircraft.

---

*End of Build Specification — myaircraft.us v1.0*  
*Prepared for Claude Code execution.*
