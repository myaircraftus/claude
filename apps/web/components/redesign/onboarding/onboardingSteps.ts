export type Placement = "top" | "bottom" | "left" | "right" | "auto";

export interface TourStep {
  id: string;
  title: string;
  /** Plain-English explanation. One short paragraph, friendly enough for a first-time user. */
  desc: string;
  /** Optional one-line tip — practical, action-oriented. */
  tip?: string;
  /** Lucide icon name (string) for the tooltip header. */
  icon: string;
  /** Accent colour (hex) for the tooltip header + spotlight ring. */
  accent: string;
  /** CSS selector for the real DOM element this step points at. Use `[data-tour="..."]`. */
  target: string;
  /** Optional route to navigate to before showing this step (used when the target lives on another page). */
  route?: string;
  /** Optional persona switch to apply before showing this step (sidebar Owner/Mechanic toggle). */
  setPersona?: "owner" | "mechanic";
  /** Preferred tooltip placement relative to the target. */
  placement?: Placement;
}

/* ══════════════════════════════════════════════════════════
   OWNER TOUR — points at real elements, beginner-friendly copy
══════════════════════════════════════════════════════════ */
export const OWNER_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to MyAircraft",
    desc:
      "I'll walk you through the app in about 60 seconds. I'll point at each real button and tell you what it does. You can leave any time with End Tour.",
    icon: "Sparkles",
    accent: "#2563EB",
    target: '[data-tour="logo"]',
    route: "/dashboard",
    setPersona: "owner",
    placement: "right",
  },
  {
    id: "persona-switcher",
    title: "Switch between Owner and Mechanic",
    desc:
      "MyAircraft works for two kinds of people. Owners track their aircraft and records. Mechanics handle work orders, squawks, and logbook entries. Click these to switch views.",
    icon: "Users",
    accent: "#3B82F6",
    target: '[data-tour="persona-switcher"]',
    placement: "right",
  },
  {
    id: "aircraft-selector",
    title: "Pick which aircraft you're looking at",
    desc:
      "If you have more than one plane, this dropdown lets you focus on just one. Everything below the sidebar — dashboard, documents, AI answers — updates to show only that aircraft.",
    icon: "Plane",
    accent: "#0EA5E9",
    target: '[data-tour="aircraft-selector"]',
    placement: "right",
  },
  {
    id: "dashboard",
    title: "Your Fleet Dashboard",
    desc:
      "This is your home base. You'll see open work orders, items needing your attention, upcoming maintenance, and total spend — all at a glance.",
    icon: "LayoutDashboard",
    accent: "#3B82F6",
    target: '[data-tour="nav-dashboard"]',
    route: "/dashboard",
    placement: "right",
  },
  {
    id: "aircraft",
    title: "Add an aircraft by N-number",
    desc:
      "Type any registered N-number and we pull the FAA data automatically — make, model, year, owner, certifications. No manual entry.",
    tip: "Try N12345 or N67890 — the FAA registry fills in the rest in seconds.",
    icon: "Plane",
    accent: "#0EA5E9",
    target: '[data-tour="nav-aircraft"]',
    placement: "right",
  },
  {
    id: "ask",
    title: "Ask anything about your aircraft",
    desc:
      "Type a question in plain English: 'When is my annual due?' or 'Show my last oil change'. The AI reads your records and FAA regs and answers instantly.",
    icon: "Bot",
    accent: "#8B5CF6",
    target: '[data-tour="nav-ask-ai-command"]',
    placement: "right",
  },
  {
    id: "documents",
    title: "Document Vault",
    desc:
      "Upload logbooks, STCs, 337 forms, weight & balance sheets, AD compliance — anything. We OCR every page so you can search inside PDFs and scans like Google.",
    icon: "FileText",
    accent: "#F59E0B",
    target: '[data-tour="nav-documents"]',
    placement: "right",
  },
  {
    id: "marketplace",
    title: "Aviation Marketplace",
    desc:
      "Browse parts, avionics, and services from vetted suppliers. Compare prices, check fitment for your specific aircraft, and add parts straight to a work order.",
    icon: "Store",
    accent: "#10B981",
    target: '[data-tour="nav-marketplace"]',
    placement: "right",
  },
  {
    id: "users",
    title: "Invite your mechanic",
    desc:
      "Send an email invite to your A&P or IA. They get their own login with the permissions you choose — squawks, work orders, logbook — and you stay in control.",
    icon: "UserRound",
    accent: "#F97316",
    target: '[data-tour="nav-users"]',
    placement: "right",
  },
  {
    id: "faraim",
    title: "FAR/AIM AI Search",
    desc:
      "Ask any FAA regulation question — 14 CFR, AIM, handbooks. The AI cites the exact paragraph so you have the source for every answer.",
    tip: "Free trial includes 10 questions. Add an aircraft or upgrade for unlimited.",
    icon: "ScrollText",
    accent: "#0EA5E9",
    target: '[data-tour="faraim"]',
    placement: "right",
  },
  {
    id: "guided-tour",
    title: "Replay this tour any time",
    desc:
      "If you ever want to see this walkthrough again, click Guided Tour right here. We'll start from the top.",
    icon: "Sparkles",
    accent: "#3B82F6",
    target: '[data-tour="guided-tour"]',
    placement: "right",
  },
];

/* ══════════════════════════════════════════════════════════
   MECHANIC TOUR — same structure, mechanic-focused copy
══════════════════════════════════════════════════════════ */
export const MECHANIC_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome, aviation pro",
    desc:
      "I'll walk you through the mechanic tools in about 60 seconds. Each step points at a real button and explains what it does. End Tour any time.",
    icon: "Wrench",
    accent: "#2563EB",
    target: '[data-tour="logo"]',
    route: "/mechanic",
    setPersona: "mechanic",
    placement: "right",
  },
  {
    id: "persona-switcher",
    title: "Owner and Mechanic views",
    desc:
      "Same login, two views. As a mechanic you see work orders, squawks, estimates, and logbook tools. Toggle to Owner if you also operate aircraft.",
    icon: "Users",
    accent: "#3B82F6",
    target: '[data-tour="persona-switcher"]',
    placement: "right",
  },
  {
    id: "ai-command",
    title: "AI Command Center",
    desc:
      "Your hands-free maintenance copilot. Ask it to draft a logbook entry, look up an AD, suggest part numbers, or write a squawk description. It speaks aviation.",
    icon: "Bot",
    accent: "#8B5CF6",
    target: '[data-tour="nav-ai-command-center"]',
    placement: "right",
  },
  {
    id: "mechanic-portal",
    title: "Mechanic Portal",
    desc:
      "Your daily workspace. Inside you'll find Aircraft, Squawks, Estimates, Work Orders, Parts, Invoices, and Logbook — everything for the shop in one place.",
    icon: "Wrench",
    accent: "#3B82F6",
    target: '[data-tour="nav-mechanic-portal"]',
    placement: "right",
  },
  {
    id: "documents",
    title: "Customer Documents",
    desc:
      "Pull up any aircraft's logbooks, 337s, STCs, or W&B sheets. Full-text search means you'll find a part number or AD reference in seconds.",
    icon: "FileText",
    accent: "#F59E0B",
    target: '[data-tour="nav-documents"]',
    placement: "right",
  },
  {
    id: "marketplace",
    title: "Parts Marketplace",
    desc:
      "Search aviation parts across vetted suppliers without leaving the app. Compare prices, check stock, and drop parts straight into an estimate.",
    icon: "Store",
    accent: "#10B981",
    target: '[data-tour="nav-marketplace"]',
    placement: "right",
  },
  {
    id: "faraim",
    title: "FAR/AIM AI Search",
    desc:
      "When a regulation question comes up mid-job, ask FAR/AIM. Plain-English answers with the exact CFR citation, every time.",
    icon: "ScrollText",
    accent: "#0EA5E9",
    target: '[data-tour="faraim"]',
    placement: "right",
  },
  {
    id: "guided-tour",
    title: "Replay this tour any time",
    desc:
      "Click Guided Tour to watch this walkthrough again. New team members can run it on their first login.",
    icon: "Sparkles",
    accent: "#3B82F6",
    target: '[data-tour="guided-tour"]',
    placement: "right",
  },
];
