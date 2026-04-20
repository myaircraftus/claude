export interface TourStep {
  id:        string;
  title:     string;
  desc:      string;
  icon:      string;
  accent:    string;
  route?:    string;
  target?:   string;   // CSS selector for spotlight ring
  placement: "modal" | "bottom";
  preview?:  string;   // mini-preview component key
  tip?:      string;
}

/* ══════════════════════════════════════════════════════════
   OWNER TOUR  (7 feature steps + welcome modal)
══════════════════════════════════════════════════════════ */
export const OWNER_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to myaircraft.us ✈️",
    desc: "Your intelligent aviation records & maintenance platform. In the next 2 minutes we'll walk through the core features that keep your aircraft compliant, your documents organized, and your mechanics connected.",
    icon: "🛩️",
    accent: "#2563EB",
    placement: "modal",
  },
  {
    id: "dashboard",
    title: "Fleet Dashboard",
    desc: "Your command center. See fleet health scores, upcoming maintenance deadlines, active squawks, AD compliance status, and total maintenance spending — updated in real time for every aircraft you own.",
    icon: "📊",
    accent: "#3b82f6",
    route: "/dashboard",
    placement: "bottom",
    preview: "dashboard",
  },
  {
    id: "aircraft",
    title: "Aircraft Fleet Management",
    desc: "Add aircraft by N-number and our FAA registry integration pulls all data automatically — registered owner, make, model, engine type, airworthiness category, and full certification history. No manual entry.",
    icon: "✈️",
    accent: "#0ea5e9",
    route: "/aircraft",
    placement: "bottom",
    preview: "aircraft",
    tip: "After adding an N-number, all FAA registration data is fetched and pre-filled within seconds.",
  },
  {
    id: "documents",
    title: "Document Vault",
    desc: "Upload and organize all aircraft records — logbooks, STCs, 337 forms, weight & balance sheets, annual inspection reports, AD compliance records, and more. AI-powered full-text search finds anything instantly.",
    icon: "📁",
    accent: "#f59e0b",
    route: "/documents",
    placement: "bottom",
    preview: "documents",
    tip: "AI automatically extracts and indexes the content of uploaded PDFs and images.",
  },
  {
    id: "ai",
    title: "AI Command — Ask Anything",
    desc: "Ask your aircraft questions in plain English: 'When is my annual due?', 'List all open ADs for N12345', 'Show my last oil change record'. Aviation-specific AI that understands FAA regulations and your actual records.",
    icon: "🤖",
    accent: "#8b5cf6",
    route: "/ask",
    placement: "bottom",
    preview: "ai",
  },
  {
    id: "marketplace",
    title: "Aviation Marketplace",
    desc: "Browse parts, avionics, and aviation services from vetted suppliers. Compare prices, check compatibility with your aircraft, and add parts directly to maintenance estimates or work orders — all in one place.",
    icon: "🛒",
    accent: "#10b981",
    route: "/marketplace",
    placement: "bottom",
    preview: "marketplace",
  },
  {
    id: "users",
    title: "Invite Your Mechanic",
    desc: "Invite your A&P mechanic to collaborate. They get a dedicated Mechanic Portal with access to squawks, work orders, logbook assistance, and your aircraft records — with granular permissions you control.",
    icon: "🤝",
    accent: "#f97316",
    route: "/settings",
    placement: "bottom",
    preview: "users",
  },
];

/* ══════════════════════════════════════════════════════════
   MECHANIC TOUR  (8 feature steps + welcome modal)
══════════════════════════════════════════════════════════ */
export const MECHANIC_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome, Aviation Professional 🔧",
    desc: "Your complete aviation maintenance management platform. In 2 minutes we'll show you the tools that transform how you handle work orders, squawks, parts sourcing, invoicing, and FAA-compliant logbook entries.",
    icon: "🔧",
    accent: "#2563EB",
    placement: "modal",
  },
  {
    id: "workspace",
    title: "AI Command Center",
    desc: "Your AI-powered maintenance workspace. Chat with aviation AI to diagnose issues, look up ADs and part numbers, draft logbook narratives, write squawk descriptions, and manage your entire workflow — hands-free.",
    icon: "🤖",
    accent: "#8b5cf6",
    route: "/workspace",
    placement: "bottom",
    preview: "workspace",
    tip: "Type any maintenance question or say 'Draft a logbook entry for...' and AI does the heavy lifting.",
  },
  {
    id: "workorders",
    title: "Work Order Management",
    desc: "Create and track work orders end-to-end. Add labor with your hourly rate, attach parts from our database, upload photos, add return-to-service notes, and chat with aircraft owners directly from a work order.",
    icon: "📋",
    accent: "#6366f1",
    route: "/mechanic?tab=workorders",
    placement: "bottom",
    preview: "workorders",
    tip: "One-click converts completed work orders to professional invoices — no re-entry required.",
  },
  {
    id: "squawks",
    title: "Squawk Management",
    desc: "Log and track aircraft squawks by severity (High / Medium / Low). AI helps diagnose issues, suggests relevant ADs, and generates maintenance action narratives. Aircraft owners see status updates in real time.",
    icon: "⚠️",
    accent: "#f97316",
    route: "/mechanic?tab=squawks",
    placement: "bottom",
    preview: "squawks",
  },
  {
    id: "estimates",
    title: "Professional Estimate Builder",
    desc: "Build itemized estimates with your labor rates, parts pricing from our database, and applicable taxes. Send to aircraft owners for digital approval. Convert approved estimates to work orders instantly — zero re-entry.",
    icon: "💰",
    accent: "#10b981",
    route: "/mechanic?tab=estimates",
    placement: "bottom",
    preview: "estimates",
  },
  {
    id: "parts",
    title: "Parts Search & Inventory",
    desc: "Search aviation parts by part number, description, or aircraft model. Compare supplier pricing, check stock availability, cross-reference with your inventory, and add parts directly to work orders or estimates.",
    icon: "🔩",
    accent: "#14b8a6",
    route: "/mechanic?tab=parts",
    placement: "bottom",
    preview: "parts",
  },
  {
    id: "invoices",
    title: "Invoices & Billing",
    desc: "Generate professional aviation invoices from completed work orders. Includes digital signature capture, itemized labor and parts billing, payment tracking, and automatic documentation for logbook records.",
    icon: "💵",
    accent: "#06b6d4",
    route: "/mechanic?tab=invoices",
    placement: "bottom",
    preview: "invoices",
  },
  {
    id: "logbook",
    title: "AI Logbook Assistant",
    desc: "Describe the maintenance work in plain language — AI generates compliant FAA logbook entries with proper regulatory references (14 CFR Part 43, §91.409, etc.). Review, add your certificate number, and sign.",
    icon: "📖",
    accent: "#a855f7",
    route: "/mechanic?tab=logbook",
    placement: "bottom",
    preview: "logbook",
    tip: "AI knows which CFR references apply based on the type of maintenance performed.",
  },
];
