/**
 * tutorialData.tsx
 * Comprehensive tutorial library for myaircraft.us
 * Phase 1: Owner Persona (40+ tutorials)
 * Phase 2: Mechanic Persona (placeholder – filled in next phase)
 */

import React from "react";
import type { Tutorial } from "./TutorialModal";
import {
  SimApp, SNav, MStatCard, MCard, CBubble, TypingIndicator,
  FormField, SelectField, ToggleRow, THead, TRow, MBadge,
  PBtn, GBtn, HL, WFBar, MiniModal, UploadZone,
  HealthRingSim, TimelineItem, SignaturePad, FAACard, InvSummary,
  SourceChip,
} from "./simHelpers";

/* ═══════════════════════════════════════════════════════════════
   OWNER SIDEBAR HELPER
═══════════════════════════════════════════════════════════════ */
function OwnerSidebar({ active }: { active: string }) {
  const items = ["Dashboard", "Aircraft", "Ask / AI", "Documents", "Marketplace", "Settings"];
  return (
    <>
      {items.map(i => <SNav key={i} label={i} active={i === active} />)}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OWNER TUTORIALS — 42 tutorials across 9 categories
═══════════════════════════════════════════════════════════════ */
export const OWNER_TUTORIALS: Tutorial[] = [

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Getting Started (PINNED)
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-gs-welcome",
    title: "Welcome to myaircraft.us",
    category: "Getting Started",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    pinned: true,
    tags: ["overview", "onboarding", "first steps"],
    description: "A complete orientation to the myaircraft.us platform — your Aircraft Records Intelligence hub. Learn how the two personas, navigation, and data tree work together so you can get the most out of every feature.",
    sim: [
      {
        label: "Step 1 — The Owner persona is your aircraft management home",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Dashboard" />}
            main={
              <div className="space-y-2">
                <div className="bg-[#0A1628] rounded-lg p-3 text-white text-center">
                  <div className="text-lg mb-1">✈️</div>
                  <div className="text-[9px]" style={{ fontWeight: 700 }}>Welcome to myaircraft.us</div>
                  <div className="text-[7px] text-white/60 mt-0.5">Aircraft Records Intelligence Platform</div>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <MStatCard label="Aircraft" value="3" color="blue" />
                  <MStatCard label="Squawks" value="4" color="amber" />
                  <MStatCard label="Health" value="92%" color="green" />
                </div>
              </div>
            }
            topLabel="myaircraft.us / Dashboard"
          />
        ),
      },
      {
        label: "Step 2 — Two personas: Owner vs Mechanic",
        content: (
          <SimApp
            sidebar={
              <>
                <div className="flex gap-0.5 mb-2 bg-white/10 rounded p-0.5">
                  <div className="flex-1 bg-white text-gray-800 text-[6px] text-center py-1 rounded" style={{ fontWeight: 700 }}>Owner</div>
                  <div className="flex-1 text-white/40 text-[6px] text-center py-1 rounded" style={{ fontWeight: 400 }}>Mechanic</div>
                </div>
                <OwnerSidebar active="Dashboard" />
              </>
            }
            main={
              <div className="space-y-1.5">
                <MCard title="Owner Persona" badge="Active" badgeColor="blue" highlighted>
                  <div className="text-[6px] text-gray-400 mt-0.5">Fleet overview · Documents · AI queries · Marketplace</div>
                </MCard>
                <MCard title="Mechanic Persona" badge="Switch" badgeColor="gray">
                  <div className="text-[6px] text-gray-400 mt-0.5">Work orders · Invoices · Logbook · Customers · Team</div>
                </MCard>
              </div>
            }
            topLabel="Persona Switcher — Top of sidebar"
          />
        ),
      },
      {
        label: "Step 3 — The data tree: Aircraft → Squawks → Estimates → Work Orders",
        content: (
          <div className="h-full bg-[#f8fafc] flex items-center justify-center p-4">
            <div className="w-full max-w-xs">
              <div className="text-[8px] text-gray-500 mb-2 text-center" style={{ fontWeight: 700 }}>DATA HIERARCHY</div>
              {[
                { label: "👤 Owner (You)", color: "bg-[#0A1628]", text: "text-white" },
                { label: "✈️ Aircraft (N-number)", color: "bg-[#1E3A5F]", text: "text-white" },
                { label: "🔧 Squawks (Issues)", color: "bg-blue-100", text: "text-blue-800" },
                { label: "📋 Estimates → Work Orders", color: "bg-amber-50", text: "text-amber-800" },
                { label: "📄 Invoices + Logbook", color: "bg-emerald-50", text: "text-emerald-800" },
              ].map((row, i) => (
                <div key={i} className={`${row.color} ${row.text} text-[7px] px-3 py-1.5 rounded-lg mb-1 ml-${i * 2} shadow-sm`} style={{ fontWeight: 600, marginLeft: `${i * 8}px` }}>{row.label}</div>
              ))}
            </div>
          </div>
        ),
      },
      {
        label: "Step 4 — Navigation at a glance",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Dashboard" />}
            main={
              <div className="space-y-1">
                {[
                  { nav: "Dashboard", desc: "Fleet health, alerts & spending" },
                  { nav: "Aircraft", desc: "N-number lookup, squawks, docs" },
                  { nav: "Ask / AI", desc: "Chat with your records & command center" },
                  { nav: "Documents", desc: "Upload, search, sign PDFs" },
                  { nav: "Marketplace", desc: "Parts, manuals & service providers" },
                  { nav: "Settings", desc: "Profile, org, billing, integrations" },
                ].map(r => (
                  <div key={r.nav} className="flex items-center gap-2 bg-white rounded px-2 py-1 border border-gray-100">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                    <span className="text-[7px] text-gray-800" style={{ fontWeight: 600 }}>{r.nav}</span>
                    <span className="text-[6px] text-gray-400 flex-1 text-right">{r.desc}</span>
                  </div>
                ))}
              </div>
            }
            topLabel="Owner Navigation Overview"
          />
        ),
      },
    ],
    steps: [
      { title: "Sign in and select the Owner persona", content: "After logging in at myaircraft.us/login, you'll land on the app dashboard in the Owner persona by default. If you see the Mechanic portal, click the persona switcher at the top of the left sidebar and select 'Owner'.", tip: "Your selected persona is saved automatically — it persists across sessions." },
      { title: "Understand the two personas", content: "myaircraft.us has two distinct roles: Owner (you) manages aircraft records, views squawks, communicates with mechanics, accesses documents and the marketplace. Mechanic manages work orders, invoices, logbook sign-offs, customer records and team members. Both personas use the same account — switch instantly with the toggle." },
      { title: "Learn the data tree", content: "Everything flows from your aircraft's N-number. Each aircraft can have multiple Squawks (issues). Each squawk generates Estimates. Approved estimates become Work Orders, which produce Invoices and Logbook entries. Understanding this chain helps you track the full lifecycle of any maintenance event." },
      { title: "Explore the navigation sidebar", content: "The six main sections are Dashboard, Aircraft, Ask/AI, Documents, Marketplace, and Settings. You'll spend most of your time in Dashboard and Aircraft. The Ask/AI section gives you two powerful AI tools for querying your records and commanding fleet actions." },
      { title: "Set up your profile first", content: "Before adding aircraft, go to Settings → Profile and fill in your name, contact information, and company details. This information is used on documents, invoices, and when inviting mechanics." },
    ],
    related: ["owner-gs-profile", "owner-gs-add-aircraft"],
  },

  {
    id: "owner-gs-profile",
    title: "Setting Up Your Profile & Organization",
    category: "Getting Started",
    persona: "owner",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: true,
    tags: ["profile", "settings", "organization", "onboarding"],
    description: "Configure your account profile, organization details, and notification preferences so myaircraft.us works exactly the way you need it from day one.",
    sim: [
      {
        label: "Navigate to Settings",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Settings" />}
            main={
              <div className="space-y-1.5">
                {["Profile", "Organization", "Notifications", "Billing", "API & Integrations"].map((s, i) => (
                  <div key={s} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[7px] ${i === 0 ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-100 bg-white text-gray-600"}`} style={{ fontWeight: i === 0 ? 600 : 400 }}>
                    <div className={`w-3 h-3 rounded-sm ${i === 0 ? "bg-blue-200" : "bg-gray-100"}`} />
                    {s}
                  </div>
                ))}
              </div>
            }
            topLabel="Settings → Profile"
          />
        ),
      },
      {
        label: "Fill in your Profile details",
        content: (
          <MiniModal title="Profile Settings">
            <FormField label="Full Name" value="John Mitchell" focused />
            <FormField label="Email" value="john@mitchellaviation.com" />
            <FormField label="Phone" value="(512) 555-0147" />
            <SelectField label="Role" value="Aircraft Owner" />
            <div className="pt-1"><PBtn label="Save Changes" /></div>
          </MiniModal>
        ),
      },
      {
        label: "Set up your Organization",
        content: (
          <MiniModal title="Organization Settings">
            <FormField label="Company Name" value="Mitchell Aviation LLC" />
            <FormField label="FAA Certificate #" value="NC-2024-00147" />
            <SelectField label="Operation Type" value="Part 91 — Private" />
            <FormField label="Base Airport" value="KAUS — Austin-Bergstrom" />
            <div className="pt-1"><PBtn label="Save Organization" /></div>
          </MiniModal>
        ),
      },
      {
        label: "Configure Notification preferences",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Settings" />}
            main={
              <div className="bg-white rounded-lg border border-gray-100 p-2 space-y-0.5">
                <div className="text-[8px] text-gray-700 mb-1" style={{ fontWeight: 700 }}>Notifications</div>
                <ToggleRow label="Squawk alerts (email)" on={true} />
                <ToggleRow label="AD / compliance reminders" on={true} />
                <ToggleRow label="Work order status updates" on={true} />
                <ToggleRow label="Invoice received" on={true} />
                <ToggleRow label="Weekly fleet digest" on={false} />
              </div>
            }
            topLabel="Settings → Notifications"
          />
        ),
      },
    ],
    steps: [
      { title: "Open Settings from the sidebar", content: "Click 'Settings' at the bottom of the left navigation sidebar. The Settings page has five tabs: Profile, Organization, Notifications, Billing, and API & Integrations.", tip: "You can also press the gear icon if it appears in the top-right of any page." },
      { title: "Complete your Profile tab", content: "Enter your full legal name, email address, phone number, and select your role. This information appears on documents and is shared with mechanics you invite. Click 'Save Changes' when done." },
      { title: "Configure your Organization", content: "Switch to the Organization tab and enter your company name (if applicable), FAA Certificate number, operation type (Part 91 Private, Part 135 Charter, etc.), and your base airport using the ICAO code." },
      { title: "Set your notification preferences", content: "Go to the Notifications tab. We recommend enabling Squawk alerts, AD/compliance reminders, and Work order status updates. These keep you informed without overwhelming your inbox." },
      { title: "Review Billing settings", content: "The Billing tab shows your current plan, next renewal date, and payment method. You can upgrade or manage your subscription here at any time." },
    ],
    related: ["owner-gs-welcome", "owner-settings-billing", "owner-settings-notifications"],
  },

  {
    id: "owner-gs-add-aircraft",
    title: "Adding Your First Aircraft",
    category: "Getting Started",
    persona: "owner",
    duration: "5 min",
    difficulty: "Beginner",
    pinned: true,
    tags: ["aircraft", "N-number", "FAA registry", "onboarding", "add"],
    description: "Add your aircraft to myaircraft.us using the FAA Registry live lookup. Enter your N-number and the platform auto-populates make, model, year, engine, and registrant data — no manual entry needed.",
    sim: [
      {
        label: "Click 'Add Aircraft' from the Aircraft list",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>My Fleet (2)</span>
                  <HL><PBtn label="+ Add Aircraft" /></HL>
                </div>
                <MCard title="N12345 — Cessna 172S" badge="Airworthy" badgeColor="green" subtitle="Hobbs 1,245.7 · KAUS" />
                <MCard title="N67890 — Piper PA-28" badge="AOG" badgeColor="red" subtitle="Hobbs 987.3 · KDAL" />
              </div>
            }
            topLabel="Aircraft → My Fleet"
          />
        ),
      },
      {
        label: "Enter your N-number for FAA Registry lookup",
        content: (
          <MiniModal title="Add New Aircraft">
            <div className="text-[7px] text-gray-500 mb-1">Enter your aircraft's FAA tail number</div>
            <HL>
              <FormField label="N-Number" value="N24680" focused />
            </HL>
            <div className="flex gap-1 pt-1">
              <PBtn label="🔍 Lookup FAA Registry" />
              <GBtn label="Cancel" />
            </div>
          </MiniModal>
        ),
      },
      {
        label: "FAA Registry auto-populates aircraft data",
        content: (
          <MiniModal title="Add New Aircraft — FAA Data Found">
            <FAACard tail="N24680" />
            <div className="flex gap-1 pt-1">
              <PBtn label="✓ Confirm & Add Aircraft" />
            </div>
          </MiniModal>
        ),
      },
      {
        label: "Aircraft added to your fleet",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>My Fleet (3)</span>
                  <PBtn label="+ Add Aircraft" />
                </div>
                <MCard title="N12345 — Cessna 172S" badge="Airworthy" badgeColor="green" subtitle="Hobbs 1,245.7 · KAUS" />
                <MCard title="N67890 — Piper PA-28" badge="AOG" badgeColor="red" subtitle="Hobbs 987.3 · KDAL" />
                <HL><MCard title="N24680 — Beechcraft A36" badge="Airworthy" badgeColor="green" subtitle="Just added · KSAT" highlighted /></HL>
              </div>
            }
            topLabel="Aircraft → My Fleet (updated)"
          />
        ),
      },
      {
        label: "Open the aircraft and complete its profile",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="N24680 — Beechcraft A36 Bonanza" badge="Airworthy" badgeColor="green" highlighted>
                  <div className="grid grid-cols-2 gap-1 mt-1.5">
                    <div className="text-[6px] text-gray-400">TTAF<div className="text-gray-700 text-[7px]" style={{ fontWeight: 600 }}>2,103 hrs</div></div>
                    <div className="text-[6px] text-gray-400">SMOH<div className="text-gray-700 text-[7px]" style={{ fontWeight: 600 }}>847 hrs</div></div>
                    <div className="text-[6px] text-gray-400">Hobbs<div className="text-gray-700 text-[7px]" style={{ fontWeight: 600 }}>2,103.1</div></div>
                    <div className="text-[6px] text-gray-400">Based At<div className="text-gray-700 text-[7px]" style={{ fontWeight: 600 }}>KSAT</div></div>
                  </div>
                </MCard>
                <div className="flex gap-1">
                  <MBadge label="Squawks 0" color="green" />
                  <MBadge label="Docs 0" color="gray" />
                  <MBadge label="Invite Mechanic" color="blue" />
                </div>
              </div>
            }
            topLabel="Aircraft Detail — N24680"
          />
        ),
      },
    ],
    steps: [
      { title: "Navigate to Aircraft in the sidebar", content: "Click 'Aircraft' in the left navigation. You'll see your current fleet list (empty if this is your first time). Click the blue '+ Add Aircraft' button in the top right." },
      { title: "Enter your N-number", content: "Type your aircraft's FAA registration tail number in the N-Number field (e.g., N12345). The system will automatically query the FAA Registry database to retrieve official aircraft records." },
      { title: "Review the FAA Registry results", content: "Within seconds, myaircraft.us displays the official FAA data including make, model, year, engine type, serial number, and registered owner. Verify this matches your aircraft." },
      { title: "Confirm and add the aircraft", content: "If the data looks correct, click 'Confirm & Add Aircraft'. The aircraft is immediately added to your fleet with all the FAA data pre-populated.", tip: "If the FAA data has errors (common for recently purchased aircraft), you can manually edit any field after adding." },
      { title: "Complete the aircraft profile", content: "After adding, open the aircraft by clicking its card. Fill in additional details like Hobbs time, SMOH (Since Major Overhaul), SPOH (Since Prop Overhaul), base airport, and operation type. The more complete your profile, the better the AI recommendations." },
      { title: "Invite a mechanic (optional)", content: "On the aircraft detail page, click 'Invite Mechanic' to grant a certified A&P mechanic access to this specific aircraft's records. They'll receive an email invitation." },
    ],
    related: ["owner-gs-welcome", "owner-aircraft-detail", "owner-mechanics-invite"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Dashboard
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-dash-overview",
    title: "Understanding Your Fleet Dashboard",
    category: "Dashboard",
    persona: "owner",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["dashboard", "fleet", "overview", "KPI", "health"],
    description: "The Owner Dashboard gives you a real-time snapshot of your entire fleet's health, active squawks, compliance status, and maintenance spending — all in one place.",
    sim: [
      {
        label: "Dashboard KPI row — fleet-wide metrics at a glance",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Dashboard" />}
            main={
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1">
                  <MStatCard label="Aircraft" value="3" color="blue" />
                  <MStatCard label="Squawks" value="4" color="amber" />
                  <MStatCard label="Documents" value="1.8k" color="violet" />
                  <MStatCard label="Avg Health" value="73%" color="green" />
                </div>
                <MCard title="Fleet Status" subtitle="Live compliance overview">
                  <div className="flex gap-1 mt-1">
                    <MBadge label="2 Airworthy" color="green" />
                    <MBadge label="1 AOG" color="red" />
                  </div>
                </MCard>
              </div>
            }
            topLabel="Dashboard — Owner Overview"
          />
        ),
      },
      {
        label: "Aircraft health cards with squawk indicators",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                {[
                  { tail: "N12345", model: "Cessna 172S", health: 92, status: "Airworthy", statusColor: "green", squawks: 1 },
                  { tail: "N67890", model: "Piper PA-28", health: 41, status: "AOG", statusColor: "red", squawks: 2 },
                  { tail: "N24680", model: "Beechcraft A36", health: 87, status: "Airworthy", statusColor: "green", squawks: 1 },
                ].map(ac => (
                  <div key={ac.tail} className="bg-white rounded-lg border border-gray-100 p-2 flex items-center gap-2 shadow-sm">
                    <HealthRingSim pct={ac.health} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[8px] text-gray-800" style={{ fontWeight: 700 }}>{ac.tail}</div>
                      <div className="text-[6px] text-gray-400">{ac.model}</div>
                    </div>
                    <MBadge label={ac.status} color={ac.statusColor as "green" | "red"} />
                    <MBadge label={`${ac.squawks} squawk${ac.squawks > 1 ? "s" : ""}`} color={ac.squawks > 1 ? "red" : "amber"} />
                  </div>
                ))}
              </div>
            }
            topLabel="Dashboard — Aircraft Health Cards"
          />
        ),
      },
      {
        label: "Maintenance spending trend chart",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Maintenance Spending — Last 7 Months">
                  <div className="flex items-end gap-1 mt-2 h-16">
                    {[28, 42, 31, 68, 52, 89, 74].map((v, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full rounded-t-sm bg-[#2563EB]" style={{ height: `${(v / 89) * 52}px`, opacity: 0.6 + (i / 7) * 0.4 }} />
                        <span className="text-[5px] text-gray-400">{["O", "N", "D", "J", "F", "M", "A"][i]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[6px] text-gray-400 mt-1">Total YTD: <span className="text-gray-700" style={{ fontWeight: 700 }}>$37,400</span></div>
                </MCard>
              </div>
            }
            topLabel="Dashboard — Spending Analytics"
          />
        ),
      },
      {
        label: "Activity feed — recent maintenance events",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Dashboard" />}
            main={
              <div className="bg-white rounded-lg border border-gray-100 p-2 space-y-1.5">
                <div className="text-[8px] text-gray-700 mb-1" style={{ fontWeight: 700 }}>Recent Activity</div>
                <TimelineItem text="N12345 — Oil change logged by M. Torres" time="2 hours ago" color="green" />
                <TimelineItem text="N67890 — Alternator squawk raised (HIGH)" time="1 day ago" color="red" />
                <TimelineItem text="N24680 — Annual inspection scheduled" time="3 days ago" color="blue" />
                <TimelineItem text="Invoice #2047 sent for N12345 · $1,240" time="5 days ago" color="violet" />
              </div>
            }
            topLabel="Dashboard — Activity Feed"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Dashboard", content: "Click 'Dashboard' at the top of the left sidebar. This is your command center — every visit here gives you the current state of your entire fleet." },
      { title: "Read the KPI row", content: "The four stat cards at the top show: total aircraft in your fleet, active squawks (open issues), total documents stored, and the average health score across all aircraft. Red numbers need immediate attention." },
      { title: "Interpret health score rings", content: "Each aircraft card shows a circular health ring. Green (80-100%) means airworthy with no urgent issues. Amber (50-79%) means attention needed. Red (below 50%) indicates critical issues or AOG (Aircraft on Ground) status.", tip: "Health score is calculated from squawk severity, days since last maintenance, and document completeness." },
      { title: "Check the spending chart", content: "Scroll down to see the maintenance spending trend chart. This shows your month-by-month spend across all aircraft, helping you forecast maintenance budgets and spot unusual spikes." },
      { title: "Review the activity feed", content: "The activity feed on the right side shows the most recent events across your fleet: squawks opened, work orders completed, invoices received, and documents uploaded. Click any item to jump to the relevant record." },
      { title: "Act on alerts", content: "If any aircraft shows a red status badge or high-severity squawk, click that card to jump directly to the aircraft detail page and see what action is needed." },
    ],
    related: ["owner-aircraft-squawks", "owner-compliance-ads", "owner-dash-health"],
  },

  {
    id: "owner-dash-health",
    title: "Reading Aircraft Health Scores",
    category: "Dashboard",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["health score", "airworthy", "AOG", "compliance"],
    description: "Understand exactly how myaircraft.us calculates the Health Score for each aircraft and what actions move the needle from red to green.",
    sim: [
      {
        label: "Health score ring color meanings",
        content: (
          <div className="h-full bg-[#f8fafc] flex items-center justify-center p-3">
            <div className="grid grid-cols-3 gap-3">
              {[{ pct: 92, label: "Airworthy", sub: "No critical issues" }, { pct: 62, label: "Attention", sub: "Active squawks" }, { pct: 38, label: "AOG", sub: "Grounded" }].map(h => (
                <div key={h.pct} className="flex flex-col items-center gap-1">
                  <HealthRingSim pct={h.pct} />
                  <div className="text-[7px] text-gray-700 text-center" style={{ fontWeight: 600 }}>{h.label}</div>
                  <div className="text-[6px] text-gray-400 text-center">{h.sub}</div>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        label: "Factors that affect health score",
        content: (
          <div className="h-full bg-[#f8fafc] p-3 space-y-1.5">
            {[
              { factor: "Open HIGH squawks", impact: "−30 pts each", color: "red" },
              { factor: "Open MEDIUM squawks", impact: "−15 pts each", color: "amber" },
              { factor: "Overdue annual inspection", impact: "−40 pts", color: "red" },
              { factor: "Overdue AD compliance", impact: "−20 pts each", color: "red" },
              { factor: "Document completeness", impact: "+up to 20 pts", color: "green" },
              { factor: "Recent maintenance logged", impact: "+5 pts", color: "green" },
            ].map(f => (
              <div key={f.factor} className="flex items-center gap-2 bg-white rounded px-2 py-1 border border-gray-100">
                <MBadge label={f.impact} color={f.color as "red" | "amber" | "green"} />
                <span className="text-[7px] text-gray-600">{f.factor}</span>
              </div>
            ))}
          </div>
        ),
      },
      {
        label: "Improving health — resolve squawks",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="N67890 — Health: 41% → Improving" highlighted>
                  <div className="space-y-1 mt-1">
                    <div className="flex items-center gap-1">
                      <MBadge label="HIGH" color="red" />
                      <span className="text-[6px] text-gray-600">Alternator failure</span>
                      <MBadge label="Estimate Requested" color="amber" />
                    </div>
                    <div className="flex items-center gap-1">
                      <MBadge label="MED" color="amber" />
                      <span className="text-[6px] text-gray-600">Left gear strut low</span>
                      <MBadge label="Scheduled" color="blue" />
                    </div>
                  </div>
                </MCard>
                <PBtn label="→ View All Squawks for N67890" className="w-full" />
              </div>
            }
            topLabel="Aircraft Detail — Improving Health"
          />
        ),
      },
    ],
    steps: [
      { title: "Locate the health score", content: "Every aircraft card on the Dashboard and Aircraft List shows a circular health ring with a percentage. Click the ring or the aircraft card to open the full detail view." },
      { title: "Green = Airworthy (80–100%)", content: "Aircraft scoring 80% or above are fully airworthy with no critical pending issues. Document completeness and recent maintenance entries both contribute positively." },
      { title: "Amber = Attention Required (50–79%)", content: "Amber scores mean the aircraft has open medium-severity squawks or overdue documentation. The aircraft may still be airworthy but needs attention soon." },
      { title: "Red = AOG or Critical (below 50%)", content: "Red scores indicate grounded aircraft, open HIGH-severity squawks, overdue annual inspections, or unresolved Airworthiness Directives. Immediate action required.", tip: "Resolving even one HIGH squawk can raise health score by 30 points." },
      { title: "Improve the score", content: "Open the aircraft, go to the Squawks tab, and work through each open squawk by assigning a mechanic, requesting an estimate, or marking resolved items. The health score updates automatically." },
    ],
    related: ["owner-aircraft-squawks", "owner-dash-overview", "owner-compliance-ads"],
  },

  {
    id: "owner-dash-activity",
    title: "Activity Feed & Maintenance Alerts",
    category: "Dashboard",
    persona: "owner",
    duration: "2 min",
    difficulty: "Beginner",
    tags: ["alerts", "activity", "notifications", "feed"],
    description: "The activity feed gives you a chronological log of every event across your fleet. Learn to quickly triage alerts and jump to the right action.",
    sim: [
      {
        label: "Activity feed on the Dashboard",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Dashboard" />}
            main={
              <div className="bg-white rounded-lg border border-gray-100 p-2">
                <div className="text-[8px] text-gray-700 mb-2" style={{ fontWeight: 700 }}>Fleet Activity — Today</div>
                <div className="space-y-1.5">
                  <TimelineItem text="HIGH ALERT: Alternator squawk on N67890" time="2 min ago" color="red" />
                  <TimelineItem text="Annual inspection scheduled for N24680" time="1 hr ago" color="blue" />
                  <TimelineItem text="Oil change logbook entry signed by M. Torres" time="3 hrs ago" color="green" />
                  <TimelineItem text="Invoice #2051 approved · $3,240 · N12345" time="Yesterday" color="violet" />
                  <TimelineItem text="AD 2024-15-06 — Due in 12 days for N67890" time="2 days ago" color="amber" />
                </div>
              </div>
            }
            topLabel="Dashboard → Activity Feed"
          />
        ),
      },
      {
        label: "Clicking an alert takes you straight to the record",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
                  <div className="text-red-500 text-[10px] shrink-0">⚠️</div>
                  <div>
                    <div className="text-[8px] text-red-800" style={{ fontWeight: 700 }}>HIGH: Alternator Failure — N67890</div>
                    <div className="text-[6px] text-red-600 mt-0.5">Aircraft grounded. Estimate pending from Mike Torres A&P. Expected repair: $2,200–$2,800.</div>
                  </div>
                </div>
                <MCard title="N67890 Squawk Log" badge="AOG" badgeColor="red">
                  <div className="text-[6px] text-gray-400 mt-0.5">2 open squawks · Last updated 2 min ago</div>
                </MCard>
              </div>
            }
            topLabel="Aircraft → N67890 → Squawk Detail"
          />
        ),
      },
    ],
    steps: [
      { title: "Find the activity feed", content: "On the Dashboard, scroll to the right column. The activity feed lists all recent events across your fleet in reverse chronological order — newest at the top." },
      { title: "Read alert severity", content: "Red timeline dots = HIGH severity alerts requiring immediate action. Amber = medium priority. Blue = informational. Green = completed actions (good news!). Violet = financial events." },
      { title: "Click to navigate", content: "Every activity item is clickable. Clicking an alert jumps you directly to the relevant squawk, document, or invoice. This is the fastest way to triage your fleet from a single screen." },
      { title: "Set up email alerts", content: "To get push/email notifications for high-severity events, go to Settings → Notifications and enable 'Squawk alerts (email)'. You'll receive an email within minutes of any HIGH squawk being opened.", tip: "Configure your notification frequency to 'Immediate' for critical alerts and 'Daily digest' for routine updates." },
    ],
    related: ["owner-dash-overview", "owner-aircraft-squawks"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Aircraft Management
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-aircraft-list",
    title: "Aircraft List: Search, Filter & Sort",
    category: "Aircraft Management",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["aircraft", "search", "filter", "fleet", "sort"],
    description: "Quickly navigate your fleet using search, status filters, and sorting. Find any aircraft by tail number, model, or status in seconds.",
    sim: [
      {
        label: "Aircraft list with search bar active",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <HL>
                  <div className="flex items-center gap-1.5 bg-white border border-blue-300 rounded-lg px-2 py-1 ring-1 ring-blue-200">
                    <span className="text-gray-400 text-[8px]">🔍</span>
                    <span className="text-[8px] text-gray-700">N678</span>
                    <div className="w-0.5 h-3 bg-blue-500 animate-pulse" />
                  </div>
                </HL>
                <MCard title="N67890 — Piper PA-28-181" badge="AOG" badgeColor="red" highlighted subtitle="Match: tail number" />
              </div>
            }
            topLabel="Aircraft → Search by N-number"
          />
        ),
      },
      {
        label: "Filter by status: All / Airworthy / Attention / AOG",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  {["All (3)", "Airworthy (2)", "Attention", "AOG (1)"].map((f, i) => (
                    <div key={f} className={`text-[6px] px-2 py-1 rounded-full ${i === 3 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`} style={{ fontWeight: i === 3 ? 700 : 400 }}>{f}</div>
                  ))}
                </div>
                <MCard title="N67890 — Piper PA-28" badge="AOG" badgeColor="red" subtitle="Hobbs 987.3 · KDAL" highlighted />
              </div>
            }
            topLabel="Aircraft → Filter: AOG"
          />
        ),
      },
    ],
    steps: [
      { title: "Use the search bar", content: "The search bar at the top of the Aircraft list searches across tail numbers, make/model, and base airport. Type at least 2 characters to see instant results." },
      { title: "Filter by status", content: "Use the filter pills below the search bar to show only: All, Airworthy, Attention, or AOG (Aircraft on Ground). AOG filter is your emergency view." },
      { title: "Sort the list", content: "Click column headers to sort by tail number, model, health score, last activity, or squawk count. Ascending/descending toggles with each click." },
      { title: "Open an aircraft", content: "Click any aircraft card to open the full detail page. The card shows health ring, status, Hobbs time, next-due maintenance item, and open squawk count at a glance." },
    ],
    related: ["owner-aircraft-detail", "owner-gs-add-aircraft"],
  },

  {
    id: "owner-aircraft-detail",
    title: "Aircraft Detail Page: Complete Walkthrough",
    category: "Aircraft Management",
    persona: "owner",
    duration: "6 min",
    difficulty: "Intermediate",
    tags: ["aircraft", "detail", "tabs", "squawks", "documents", "logbook"],
    description: "The Aircraft Detail page is the core of your aircraft management. It has six tabs: Overview, Squawks, Estimates, Documents, Logbook, and Mechanics. Each one unlocks a different layer of your aircraft's intelligence.",
    sim: [
      {
        label: "Aircraft Detail — Overview tab with key stats",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 bg-[#0A1628] rounded-lg p-2">
                  <HealthRingSim pct={92} />
                  <div>
                    <div className="text-white text-[9px]" style={{ fontWeight: 700 }}>N12345 — Cessna 172S Skyhawk SP</div>
                    <div className="text-white/50 text-[6px]">1998 · KAUS · Part 91 Private · Airworthy</div>
                  </div>
                  <MBadge label="Airworthy" color="green" />
                </div>
                <div className="grid grid-cols-4 gap-1">
                  <MStatCard label="TTAF" value="3,847" color="blue" />
                  <MStatCard label="SMOH" value="1,204" color="violet" />
                  <MStatCard label="Hobbs" value="4,012" color="blue" />
                  <MStatCard label="Docs" value="842" color="green" />
                </div>
              </div>
            }
            topLabel="Aircraft Detail → N12345 Overview"
          />
        ),
      },
      {
        label: "Tab navigation: Overview · Squawks · Estimates · Documents · Logbook · Mechanics",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
                  {["Overview", "Squawks", "Estimates", "Documents", "Logbook", "Mechanics"].map((t, i) => (
                    <div key={t} className={`text-[6px] px-2 py-1 rounded whitespace-nowrap ${i === 0 ? "bg-white text-[#2563EB] shadow-sm" : "text-gray-500"}`} style={{ fontWeight: i === 0 ? 700 : 400 }}>{t}</div>
                  ))}
                </div>
                <MCard title="Aircraft Overview" subtitle="Tap any tab above to view its section" />
              </div>
            }
            topLabel="Aircraft Detail — Tab Bar"
          />
        ),
      },
      {
        label: "Squawks tab — open issues list",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Open Squawks (1)</span>
                  <MBadge label="+ Report Issue" color="blue" />
                </div>
                <MCard title="Left nav light inop" badge="MED" badgeColor="amber" subtitle="Reported Apr 8 · Day-VFR only restriction">
                  <div className="text-[6px] text-gray-400 mt-0.5">Assigned to: Mike Torres · Estimate pending</div>
                </MCard>
              </div>
            }
            topLabel="Aircraft → N12345 → Squawks"
          />
        ),
      },
      {
        label: "Documents tab — aircraft-specific document vault",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1">
                <THead cells={["Document", "Type", "Date"]} />
                <TRow cells={["Annual Inspection 2024", "Inspection", "Mar 2024"]} />
                <TRow cells={["Engine Overhaul Records", "Engine", "Jan 2023"]} highlighted />
                <TRow cells={["FAA Registration", "Registration", "Nov 2022"]} />
                <TRow cells={["AD 2023-08-12 Compliance", "AD", "Aug 2023"]} />
              </div>
            }
            topLabel="Aircraft → N12345 → Documents"
          />
        ),
      },
      {
        label: "Mechanics tab — assigned A&Ps for this aircraft",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Assigned Mechanics</span>
                  <PBtn label="+ Invite Mechanic" />
                </div>
                <MCard title="Mike Torres · A&P/IA" badge="Active" badgeColor="green" subtitle="mike@torresaviation.com">
                  <div className="flex gap-1 mt-1">
                    <ToggleRow label="Access enabled" on={true} />
                  </div>
                </MCard>
              </div>
            }
            topLabel="Aircraft → N12345 → Mechanics"
          />
        ),
      },
    ],
    steps: [
      { title: "Open an aircraft from the list", content: "Go to Aircraft in the sidebar and click any aircraft card. The detail page opens with the Overview tab active by default." },
      { title: "Read the Overview tab", content: "The Overview shows the aircraft's health ring, registration details, Hobbs time, TTAF (Total Time Airframe), SMOH (Since Major Overhaul), base airport, operation type, and a quick stats grid. This is your aircraft's 'identity card'." },
      { title: "Check the Squawks tab", content: "Click the Squawks tab to see all open issues. Each squawk shows severity (HIGH/MEDIUM/LOW), description, assigned mechanic, and estimate status. Click any squawk for full details." },
      { title: "Review Estimates", content: "The Estimates tab shows mechanic estimates linked to specific squawks. You can approve or decline estimates here. Approved estimates automatically create a Work Order on the mechanic's side.", tip: "You receive an email notification when a mechanic submits a new estimate." },
      { title: "Browse Documents", content: "The Documents tab shows all records specific to this aircraft — annuals, AD compliance, engine overhaul records, registration, and more. You can upload additional documents directly from this tab." },
      { title: "Check the Logbook tab", content: "Logbook shows every maintenance entry ever made for this aircraft — dated, described, and signed by a licensed A&P. This is your aircraft's complete maintenance history." },
      { title: "Manage Mechanics", content: "The Mechanics tab lists every A&P you've invited to this aircraft. You can toggle their access on/off without revoking the invitation, and see their certification details." },
    ],
    related: ["owner-aircraft-squawks", "owner-aircraft-docs", "owner-mechanics-invite"],
  },

  {
    id: "owner-aircraft-squawks",
    title: "Managing Squawks (Issues & Defects)",
    category: "Aircraft Management",
    persona: "owner",
    duration: "5 min",
    difficulty: "Intermediate",
    tags: ["squawks", "defects", "issues", "severity", "report"],
    description: "Squawks are the official issues log for your aircraft. Learn how to report a new squawk, understand severity levels, track mechanic assignments, and follow the squawk-to-resolution workflow.",
    sim: [
      {
        label: "Open squawk list — severity color coding",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="N67890 Open Squawks (3)" subtitle="Sorted by severity">
                  <div className="space-y-1 mt-1">
                    <div className="flex items-center gap-1">
                      <MBadge label="HIGH" color="red" />
                      <span className="text-[6px] text-gray-700" style={{ fontWeight: 600 }}>Alternator failure — AOG</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MBadge label="MED" color="amber" />
                      <span className="text-[6px] text-gray-600">Left gear strut low</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MBadge label="LOW" color="blue" />
                      <span className="text-[6px] text-gray-600">Cabin door seal worn</span>
                    </div>
                  </div>
                </MCard>
              </div>
            }
            topLabel="Squawks — N67890"
          />
        ),
      },
      {
        label: "Report a new squawk — the form",
        content: (
          <MiniModal title="Report New Squawk — N12345">
            <SelectField label="Aircraft" value="N12345 — Cessna 172S" />
            <FormField label="Issue Description" value="Left nav light inoperative" focused />
            <SelectField label="Severity" value="Medium" />
            <SelectField label="Assign To" value="Mike Torres (A&P/IA)" />
            <div className="flex gap-1 pt-1">
              <PBtn label="Submit Squawk" />
              <GBtn label="Cancel" />
            </div>
          </MiniModal>
        ),
      },
      {
        label: "Squawk lifecycle — from report to resolution",
        content: (
          <div className="h-full bg-[#f8fafc] flex items-center justify-center p-3">
            <WFBar
              steps={["Owner Reports", "Mechanic Reviews", "Estimate Sent", "Owner Approves", "Work Order", "Resolved"]}
              activeIdx={2}
            />
          </div>
        ),
      },
      {
        label: "Squawk detail — full status tracking",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Squawk: Left nav light inop" badge="MED" badgeColor="amber" highlighted>
                  <div className="space-y-0.5 mt-1">
                    <div className="text-[6px] text-gray-400">Reported: Apr 8, 2026 · By: You</div>
                    <div className="text-[6px] text-gray-400">Assigned: Mike Torres · A&P/IA</div>
                    <div className="text-[6px] text-gray-400">Status: <span className="text-amber-600" style={{ fontWeight: 600 }}>Estimate Pending</span></div>
                    <div className="text-[6px] text-gray-400">Restriction: Day-VFR only until resolved</div>
                  </div>
                </MCard>
                <div className="flex gap-1">
                  <PBtn label="View Estimate" />
                  <GBtn label="Add Note" />
                </div>
              </div>
            }
            topLabel="Squawk Detail — Full Tracking"
          />
        ),
      },
    ],
    steps: [
      { title: "Navigate to a squawk list", content: "Open an aircraft from the Aircraft list, then click the 'Squawks' tab. You'll see all open issues sorted by severity: HIGH (red) at the top, then MEDIUM (amber), then LOW (blue)." },
      { title: "Report a new squawk", content: "Click '+ Report Issue' or '+ Report Squawk'. Fill in the description of what you observed (be specific — 'left nav light inoperative' not just 'light problem'), select severity, and optionally assign it to a mechanic." },
      { title: "Understand severity levels", content: "HIGH = aircraft may be unsafe/grounded (AOG). Requires immediate mechanic review. MEDIUM = defect present but aircraft may be flyable with restrictions. LOW = cosmetic or low-priority item for next scheduled service." },
      { title: "Track the squawk lifecycle", content: "After reporting, the mechanic reviews and may request more info or submit an estimate. You'll be notified. Review the Estimates tab for the mechanic's proposed fix and cost." },
      { title: "Approve or decline an estimate", content: "In the Estimates tab, click the squawk's estimate to review scope of work and price. Approve to generate a Work Order on the mechanic's side, or decline and request a revision.", tip: "You can add notes to any estimate when declining — the mechanic sees your comments." },
      { title: "Squawk is resolved", content: "When the mechanic completes the work and creates a logbook entry, the squawk automatically moves to 'Resolved'. Your health score updates immediately." },
    ],
    related: ["owner-aircraft-estimates", "owner-aircraft-detail", "owner-mechanics-invite"],
  },

  {
    id: "owner-aircraft-estimates",
    title: "Reviewing & Approving Mechanic Estimates",
    category: "Aircraft Management",
    persona: "owner",
    duration: "4 min",
    difficulty: "Beginner",
    tags: ["estimates", "approve", "decline", "work order", "cost"],
    description: "When a mechanic submits an estimate for a squawk, you review and approve (or decline) it here. Approval turns the estimate into a Work Order and unlocks the mechanic's workflow.",
    sim: [
      {
        label: "Estimates tab — pending approval list",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Estimates (2)</span>
                <MCard title="EST-2047 — Alternator Replacement" badge="Awaiting Approval" badgeColor="amber" subtitle="Mike Torres · Apr 10, 2026" highlighted>
                  <InvSummary subtotal="$2,100" tax="$157.50" total="$2,257.50" />
                </MCard>
                <MCard title="EST-2048 — Left Gear Strut Service" badge="Draft" badgeColor="gray" subtitle="Mike Torres · Apr 11, 2026">
                  <div className="text-[6px] text-gray-400 mt-0.5">Estimate being prepared…</div>
                </MCard>
              </div>
            }
            topLabel="Aircraft → N67890 → Estimates"
          />
        ),
      },
      {
        label: "Estimate detail — line items",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1">
                <THead cells={["Line Item", "Qty", "Cost"]} />
                <TRow cells={["Alternator (Rebuilt)", "1", "$1,450"]} highlighted />
                <TRow cells={["Labor — R&R Alternator", "3 hrs", "$450"]} />
                <TRow cells={["Wiring Inspection", "1 hr", "$150"]} />
                <TRow cells={["Safety Inspection", "1 hr", "$50"]} />
                <InvSummary subtotal="$2,100" tax="$157.50" total="$2,257.50" />
              </div>
            }
            topLabel="Estimate Detail — Line Items"
          />
        ),
      },
      {
        label: "Approve or decline with one click",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-2">
                <MCard title="EST-2047 — Alternator Replacement" badge="Awaiting Approval" badgeColor="amber" highlighted>
                  <InvSummary subtotal="$2,100" tax="$157.50" total="$2,257.50" />
                </MCard>
                <div className="flex gap-2">
                  <HL><PBtn label="✓ Approve Estimate" className="flex-1" /></HL>
                  <GBtn label="✗ Decline" className="flex-1" />
                </div>
                <GBtn label="💬 Request Revision" className="w-full" />
              </div>
            }
            topLabel="Estimate Approval Workflow"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Estimates tab", content: "On an aircraft's detail page, click the 'Estimates' tab. Estimates waiting for your approval show an amber 'Awaiting Approval' badge." },
      { title: "Review the estimate detail", content: "Click any estimate to open the full detail. Review each line item (parts + labor), quantities, unit prices, and the total including tax. The mechanic's notes and squawk reference are also shown." },
      { title: "Approve the estimate", content: "Click the blue 'Approve Estimate' button to authorize the work. This creates a Work Order in the mechanic's portal and notifies them immediately. The squawk status updates to 'Work Authorized'." },
      { title: "Decline with feedback", content: "If the estimate seems too high or the scope needs adjustment, click 'Decline' and enter a note explaining why. The mechanic can revise and resubmit. Or click 'Request Revision' to open a discussion thread." },
      { title: "After approval", content: "You'll see the Work Order status in the squawk detail. When the work is complete and invoiced, you'll receive a notification and can review the final invoice in your email and in the aircraft's Documents tab.", tip: "Approving an estimate does not mean immediate payment — you still review and approve the final invoice separately." },
    ],
    related: ["owner-aircraft-squawks", "owner-docs-esign"],
  },

  {
    id: "owner-aircraft-faa",
    title: "FAA Registry Lookup & N-Number Search",
    category: "Aircraft Management",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["FAA", "N-number", "registry", "lookup", "registration"],
    description: "myaircraft.us is connected live to the FAA Aircraft Registry. Look up any N-number instantly to get official make, model, engine, serial number, and registered owner data.",
    sim: [
      {
        label: "FAA Registry lookup in Add Aircraft modal",
        content: (
          <MiniModal title="FAA Registry Lookup">
            <HL><FormField label="Enter N-Number" value="N12345" focused /></HL>
            <PBtn label="🔍 Search FAA Registry" className="w-full" />
            <div className="text-[6px] text-gray-400 text-center mt-1">Live query · Results in &lt;2 seconds</div>
          </MiniModal>
        ),
      },
      {
        label: "FAA data returned — official records",
        content: (
          <MiniModal title="FAA Registry — Result">
            <FAACard tail="N12345" />
            <div className="flex gap-1">
              <PBtn label="✓ Use This Data" />
              <GBtn label="Search Again" />
            </div>
          </MiniModal>
        ),
      },
      {
        label: "Data auto-fills the aircraft profile",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="N12345 — Pre-filled from FAA" badge="Just Added" badgeColor="green" highlighted>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {[["Model", "Cessna 172S Skyhawk SP"], ["Year", "1998"], ["Engine", "Lycoming IO-360"], ["Serial", "172S8001"]].map(([k, v]) => (
                      <div key={k} className="text-[5px] text-gray-400">{k}<div className="text-[6.5px] text-gray-700" style={{ fontWeight: 600 }}>{v}</div></div>
                    ))}
                  </div>
                </MCard>
                <div className="text-[6px] text-gray-400 text-center">✓ FAA data imported · You can edit any field</div>
              </div>
            }
            topLabel="Aircraft Profile — FAA Data Pre-filled"
          />
        ),
      },
    ],
    steps: [
      { title: "Start the FAA lookup", content: "When adding a new aircraft (from Aircraft → + Add Aircraft), enter the N-number in the lookup field. The system queries the live FAA Registry API — no account needed." },
      { title: "Verify the returned data", content: "The FAA returns the official make/model, year of manufacture, engine type, propeller, serial number, and the name of the current registered owner. Verify this matches your aircraft." },
      { title: "Confirm and add", content: "Click 'Confirm & Add Aircraft' to import all FAA data into your aircraft profile. All fields are pre-populated and editable." },
      { title: "Manually correct if needed", content: "After adding, if any FAA data is outdated (common after purchase before re-registration), click Edit on the aircraft detail page and update the fields manually.", tip: "FAA data can lag 2–6 weeks after a sale. If you recently purchased the aircraft, update the registrant name and address in your aircraft profile while waiting for the FAA update." },
    ],
    related: ["owner-gs-add-aircraft", "owner-aircraft-detail"],
  },

  {
    id: "owner-aircraft-livetrack",
    title: "Live Tracking Your Aircraft",
    category: "Aircraft Management",
    persona: "owner",
    duration: "3 min",
    difficulty: "Intermediate",
    tags: ["live track", "ADS-B", "flight tracking", "location"],
    description: "When an ADS-B integration is enabled, the Live Track widget on your aircraft detail page shows real-time position, altitude, speed, and flight path for your aircraft.",
    sim: [
      {
        label: "Live Track widget on Aircraft Detail",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="N12345 — Live Track" badge="In Flight" badgeColor="green" highlighted>
                  <div className="mt-1.5 bg-gray-800 rounded-lg h-16 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(ellipse at 40% 50%, #2563EB 0%, transparent 60%)" }} />
                    <div className="text-white text-[8px] text-center relative z-10">
                      <div className="text-lg">✈️</div>
                      <div style={{ fontWeight: 700 }}>KAUS → KDFW</div>
                      <div className="text-white/60 text-[6px]">4,500 ft · 128 kt · 34 min ETE</div>
                    </div>
                  </div>
                </MCard>
                <div className="grid grid-cols-3 gap-1">
                  <MStatCard label="Altitude" value="4,500ft" color="blue" />
                  <MStatCard label="Speed" value="128kt" color="green" />
                  <MStatCard label="ETE" value="34min" color="violet" />
                </div>
              </div>
            }
            topLabel="Aircraft Detail → Live Track"
          />
        ),
      },
      {
        label: "Enable ADS-B integration in Settings",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Settings" />}
            main={
              <div className="space-y-1.5">
                <MCard title="ADS-B / Flight Tracking Integration" badge="Available" badgeColor="blue">
                  <div className="text-[6px] text-gray-400 mt-0.5">Connect your ADS-B transponder data to enable live tracking in the aircraft detail page.</div>
                  <div className="mt-1.5"><PBtn label="Enable Integration" /></div>
                </MCard>
              </div>
            }
            topLabel="Settings → Integrations → ADS-B"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the aircraft detail page", content: "Navigate to Aircraft → click your aircraft card. Scroll down on the Overview tab to find the 'Live Track' widget section." },
      { title: "Enable ADS-B integration", content: "If the widget shows 'Integration not configured', go to Settings → API & Integrations and enable the ADS-B flight tracking integration. This requires your aircraft to have an ADS-B Out transponder." },
      { title: "View live position data", content: "When your aircraft is in flight and ADS-B is broadcasting, the widget shows a live map with current position, altitude, groundspeed, heading, and estimated time en route to destination." },
      { title: "Review flight history", content: "Below the live widget, you can see recent flight history — past routes, durations, and departure/arrival airports. This data can be used to auto-populate Hobbs entries.", tip: "ADS-B data coverage depends on ground receiver coverage. Remote areas may have gaps." },
    ],
    related: ["owner-settings-integrations", "owner-aircraft-detail"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Ask & AI Command
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-ai-overview",
    title: "Ask / AI Command Center Overview",
    category: "Ask & AI Command",
    persona: "owner",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: true,
    tags: ["AI", "ask", "command center", "chat", "logbook", "queries"],
    description: "The Ask/AI page has two powerful tabs: 'Ask Your Aircraft' (logbook Q&A with AI-cited answers) and 'AI Command Center' (plain-English fleet actions). Together they make you the most informed pilot in the hangar.",
    sim: [
      {
        label: "Ask/AI page — two-tab layout",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1.5">
                <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                  <div className="flex-1 bg-white text-[#2563EB] text-[7px] px-2 py-1.5 rounded text-center shadow-sm" style={{ fontWeight: 700 }}>💬 Ask Your Aircraft<br /><span className="text-[5px] text-gray-400" style={{ fontWeight: 400 }}>Logbook Q&A · AI-cited</span></div>
                  <div className="flex-1 text-gray-500 text-[7px] px-2 py-1.5 rounded text-center" style={{ fontWeight: 400 }}>⚡ AI Command Center<br /><span className="text-[5px] text-gray-400">Fleet actions</span></div>
                </div>
                <CBubble role="user" text="When was the last annual on N12345?" />
                <CBubble role="ai" text="Annual inspection completed March 14, 2024 by Mike Torres (A&P/IA #2847492). Next due March 14, 2025 — 337 days from today." />
                <SourceChip label="Annual_2024_N12345.pdf" />
              </div>
            }
            topLabel="Ask / AI Command — Owner Portal"
          />
        ),
      },
      {
        label: "Ask tab — AI answers with source citations",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="What oil is approved for my Cessna 172S engine?" />
                <TypingIndicator />
                <CBubble role="ai" text="For the Lycoming IO-360-L2A, approved oils are: Phillips X/C 20W-50 (recommended), AeroShell W 100, Exxon Elite 20W-50. Source: Engine Operator's Manual Section 8.3." />
                <div className="flex gap-0.5">
                  <SourceChip label="IO-360 Manual §8.3" />
                  <SourceChip label="Lycoming SB-447" />
                </div>
              </div>
            }
            topLabel="Ask Your Aircraft — AI Answer with Sources"
          />
        ),
      },
      {
        label: "Command Center — plain-English fleet actions",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1.5">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-2">
                  <div className="text-[7px] text-gray-500 mb-1">Try a command…</div>
                  <div className="flex items-center gap-1 bg-white border border-blue-200 rounded px-2 py-1">
                    <span className="text-[7px] text-gray-700">Show me all aircraft due for maintenance in the next 30 days</span>
                    <div className="w-0.5 h-3 bg-blue-500" />
                  </div>
                </div>
                <CBubble role="ai" text="3 aircraft have maintenance due in 30 days: N67890 — AD 2024-15-06 (12 days), N24680 — Transponder check (18 days), N12345 — IFR cert (28 days)." />
                <div className="flex gap-1">
                  <PBtn label="Schedule All" />
                  <GBtn label="Export List" />
                </div>
              </div>
            }
            topLabel="AI Command Center — Fleet Intelligence"
          />
        ),
      },
    ],
    steps: [
      { title: "Navigate to Ask/AI", content: "Click 'Ask / AI' in the left sidebar. The page loads with two tabs: 'Ask Your Aircraft' and 'AI Command Center'. The Ask tab is active by default." },
      { title: "Use the Ask tab for record queries", content: "The Ask tab is your logbook search assistant. Type any question in plain English about your aircraft's records, maintenance history, AD compliance, approved oils/parts, or any document you've uploaded. The AI answers with specific citations from your documents." },
      { title: "Understand source citations", content: "Every AI answer in the Ask tab shows blue source chips below the response. These link to the exact document and page where the answer comes from. Click any chip to open the source document.", tip: "The more documents you upload, the better the AI answers. Upload annuals, engine logs, STCs, and manuals for best results." },
      { title: "Switch to AI Command Center", content: "Click the 'AI Command Center' tab for action-oriented queries. Instead of 'what is...', use commands like 'Show all aircraft due for service' or 'Generate a 90-day maintenance forecast for my fleet'." },
      { title: "Act on AI recommendations", content: "The Command Center can generate summaries, draft squawks, flag compliance gaps, and export data. Action buttons appear below AI responses — click to execute the suggested action directly." },
    ],
    related: ["owner-ai-ask", "owner-ai-command", "owner-docs-ai"],
  },

  {
    id: "owner-ai-ask",
    title: "Ask Your Aircraft — Logbook Q&A",
    category: "Ask & AI Command",
    persona: "owner",
    duration: "5 min",
    difficulty: "Beginner",
    tags: ["ask", "logbook", "Q&A", "AI", "maintenance history", "search"],
    description: "Ask any question about your aircraft's maintenance history, AD compliance, approved parts, or documents in plain English. The AI reads your uploaded records and answers with specific citations.",
    sim: [
      {
        label: "Ask about maintenance history",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="When was the last time the spark plugs were changed on N12345?" />
                <CBubble role="ai" text="Spark plugs last replaced October 22, 2024 at 3,790 TTAF. Champion REM38E plugs installed (4 each side). Logged by Mike Torres A&P #2847492. Next recommended: 100-hr or 1 year — due March 2025." />
                <SourceChip label="Logbook Entry #284 · Oct 2024" />
              </div>
            }
            topLabel="Ask Your Aircraft — Spark Plug History"
          />
        ),
      },
      {
        label: "Ask about AD compliance",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Which ADs apply to my Lycoming IO-360 engine?" />
                <CBubble role="ai" text="5 ADs apply to your IO-360-L2A: AD 2023-14-01 (fuel injector inspection — COMPLIED), AD 2022-08-17 (crankshaft bolt — COMPLIED), AD 2024-03-09 (oil filter adapter — DUE in 87 hrs)..." />
                <div className="flex gap-0.5 flex-wrap">
                  <SourceChip label="AD Compliance Record" />
                  <SourceChip label="Engine Logbook" />
                </div>
              </div>
            }
            topLabel="Ask — AD Compliance Query"
          />
        ),
      },
      {
        label: "Ask about approved parts and fluids",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="What hydraulic fluid is used in the landing gear of N67890?" />
                <CBubble role="ai" text="The Piper PA-28-181 uses MIL-PRF-5606 (red) hydraulic fluid in the brake system. Reservoir capacity: 0.25 qt. Source: PA-28-181 Maintenance Manual §12-20-00, Page 12-16." />
                <SourceChip label="PA-28 MM §12-20-00" />
              </div>
            }
            topLabel="Ask — Parts & Fluids Query"
          />
        ),
      },
      {
        label: "Multi-aircraft fleet query",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Which of my aircraft are overdue for any inspection?" />
                <CBubble role="ai" text="1 aircraft has overdue items: N67890 — Pitot-static check due Dec 2024 (128 days overdue). 2 aircraft approaching due dates: N12345 — Annual due Mar 14 (37 days), N24680 — Transponder check due Apr 30 (18 days)." />
              </div>
            }
            topLabel="Ask — Fleet-Wide Compliance Query"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Ask tab", content: "Go to Ask/AI in the sidebar. The 'Ask Your Aircraft' tab should be selected by default. If not, click it to switch." },
      { title: "Select an aircraft (optional)", content: "If you have multiple aircraft, you can narrow the AI's context by selecting a specific aircraft from the dropdown at the top. Leave it on 'All Aircraft' for fleet-wide queries." },
      { title: "Type your question naturally", content: "Type any question as if you're asking a knowledgeable A&P mechanic. Examples: 'When was the last annual?', 'What oil is approved for my engine?', 'Show all ADs that apply to N67890'." },
      { title: "Read the AI response and sources", content: "The AI answers in plain English with specific dates, names, and values pulled from your records. Below each answer are blue source chips showing exactly which documents were used." },
      { title: "Click source chips for verification", content: "Click any blue source chip to open the referenced document at the relevant page. This lets you independently verify the AI's answer against the original record." },
      { title: "Ask follow-up questions", content: "The conversation is continuous — ask follow-up questions to dig deeper. 'What was the cost of that spark plug replacement?' will use the context of the previous answer to give you the right invoice data." },
      { title: "Export AI insights", content: "Use the export button (top right of the conversation) to save your Q&A session as a PDF. Useful for pre-purchase inspections, insurance queries, or your own records.", tip: "The Ask AI improves as you upload more documents. Annuals, engine logs, 337s, STCs, and service manuals all expand what the AI can answer." },
    ],
    related: ["owner-ai-command", "owner-docs-upload", "owner-ai-overview"],
  },

  {
    id: "owner-ai-command",
    title: "AI Command Center — Fleet Actions",
    category: "Ask & AI Command",
    persona: "owner",
    duration: "5 min",
    difficulty: "Intermediate",
    tags: ["command center", "AI", "fleet actions", "scheduling", "compliance", "forecast"],
    description: "The AI Command Center translates plain-English commands into fleet-wide actions: scheduling overviews, compliance gap reports, maintenance forecasts, and direct squawk creation — all in seconds.",
    sim: [
      {
        label: "Command: 30-day maintenance forecast",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Give me a 90-day maintenance forecast for my fleet" />
                <CBubble role="ai" text="FLEET 90-DAY FORECAST: Apr 30 — N24680 Transponder check ($450 est). May 14 — N12345 Annual inspection ($2,200–$3,000 est). Jun 5 — N67890 100-hr inspection ($600 est). Recommended budget: $4,100–$5,200." />
                <div className="flex gap-1">
                  <PBtn label="Export Forecast" />
                  <GBtn label="Schedule All" />
                </div>
              </div>
            }
            topLabel="AI Command — Fleet Forecast"
          />
        ),
      },
      {
        label: "Command: Flag compliance gaps",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Find all compliance gaps across my fleet" />
                <CBubble role="ai" text="COMPLIANCE REPORT: 1 CRITICAL — N67890 pitot-static check overdue 128 days. 2 UPCOMING — N12345 annual due 37 days, N24680 transponder due 18 days. Recommend scheduling ASAP." />
                <PBtn label="Create Squawks for Each Gap" className="w-full" />
              </div>
            }
            topLabel="AI Command — Compliance Gap Report"
          />
        ),
      },
      {
        label: "Command: Spending analysis",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Which aircraft cost me the most to maintain in the last 6 months?" />
                <CBubble role="ai" text="Top maintenance spend (last 6 months): N67890 — $8,420 (3 work orders, alternator replacement dominant cost). N12345 — $4,210. N24680 — $2,100. N67890 is 3x the average — consider a pre-buy inspection review." />
                <GBtn label="Export Spending Report (PDF)" className="w-full" />
              </div>
            }
            topLabel="AI Command — Spending Analysis"
          />
        ),
      },
    ],
    steps: [
      { title: "Switch to AI Command Center tab", content: "In the Ask/AI page, click the 'AI Command Center' tab on the right. This mode is optimized for actions and structured outputs rather than open Q&A." },
      { title: "Use action-oriented commands", content: "Think of commands, not questions. Examples: 'Schedule all annual inspections for the next quarter', 'Show me aircraft with no logbook entries in the last 90 days', 'Generate a maintenance budget forecast for my fleet'." },
      { title: "Fleet-wide compliance report", content: "Try: 'Find all compliance gaps across my fleet' to get an instant report of overdue and upcoming inspections, ADs, and required checks across all aircraft. Each gap is prioritized by urgency." },
      { title: "Spending and trend analysis", content: "Commands like 'Which aircraft cost the most to maintain last year?' analyze your invoices and work orders to give you financial intelligence. Export as PDF for accounting or insurance." },
      { title: "Act on AI suggestions", content: "Many AI responses include action buttons — 'Create Squawk', 'Schedule Service', 'Export Report'. These execute real actions in the platform with one click, saving you time navigating multiple pages." },
      { title: "Create squawks via command", content: "You can create a squawk for any aircraft using a natural language command: 'Report a new squawk for N12345 — left landing light inoperative, medium severity'. The AI creates the squawk and asks if you want to assign a mechanic.", tip: "The AI Command Center gets smarter with more data. Connect your invoices, logbook, and documents for the most accurate fleet intelligence." },
    ],
    related: ["owner-ai-ask", "owner-compliance-ads", "owner-aircraft-squawks"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Documents
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-docs-overview",
    title: "Document Vault Overview",
    category: "Documents",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["documents", "vault", "records", "PDFs", "storage"],
    description: "The Document Vault is your centralized aircraft records library — annuals, AD compliance logs, engine overhauls, STCs, registrations, insurance certificates, and more, all searchable by AI.",
    sim: [
      {
        label: "Documents page — complete records library",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Documents" />}
            main={
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-[7px] text-gray-400">🔍 Search documents…</div>
                  <PBtn label="+ Upload" />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {["All (1.8k)", "Annuals", "ADs", "Engine", "Registration", "Insurance"].map((f, i) => (
                    <div key={f} className={`text-[6px] px-2 py-0.5 rounded-full ${i === 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`} style={{ fontWeight: i === 0 ? 700 : 400 }}>{f}</div>
                  ))}
                </div>
                <THead cells={["Document", "Aircraft", "Date"]} />
                <TRow cells={["Annual Inspection 2024", "N12345", "Mar 2024"]} highlighted />
                <TRow cells={["AD 2024-15-06 Compliance", "N67890", "Feb 2024"]} />
                <TRow cells={["Engine Overhaul Record", "N24680", "Jan 2023"]} />
              </div>
            }
            topLabel="Documents — Vault Overview"
          />
        ),
      },
      {
        label: "AI-powered document search",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Documents" />}
            main={
              <div className="space-y-1.5">
                <HL>
                  <div className="flex items-center gap-1.5 bg-white border border-blue-300 rounded px-2 py-1 ring-1 ring-blue-200">
                    <span className="text-gray-400 text-[8px]">🔍</span>
                    <span className="text-[7px] text-gray-700">alternator replacement</span>
                  </div>
                </HL>
                <MCard title="WO-2047 Alternator Replacement" badge="Match" badgeColor="blue" subtitle="N67890 · Work Order · Apr 2026" highlighted />
                <MCard title="Invoice #2047" badge="Match" badgeColor="blue" subtitle="N67890 · Invoice · Apr 2026" />
              </div>
            }
            topLabel="Documents — AI Search Results"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Documents section", content: "Click 'Documents' in the sidebar. You'll see your complete records library with filter pills for document type: All, Annuals, ADs, Engine, Registration, Insurance, and more." },
      { title: "Search your documents", content: "Use the search bar to find documents by keyword — it searches within document contents (not just file names). Try 'oil change', 'alternator', or 'annual 2024' to find records instantly." },
      { title: "Filter by type and aircraft", content: "Combine the category pills (e.g., 'ADs') with the aircraft filter dropdown to narrow results to a specific aircraft's AD compliance records only." },
      { title: "Open and preview documents", content: "Click any document to preview it in the browser. PDFs open inline — no download needed. You can scroll, zoom, and share directly from the preview." },
      { title: "AI-enhanced search", content: "The search bar is AI-enhanced — you can search by concept, not just keyword. 'Show me any document about the fuel system inspection' will find relevant records even if those exact words aren't in the filename." },
    ],
    related: ["owner-docs-upload", "owner-docs-esign", "owner-ai-ask"],
  },

  {
    id: "owner-docs-upload",
    title: "Uploading Documents (Drag & Drop / Manual)",
    category: "Documents",
    persona: "owner",
    duration: "4 min",
    difficulty: "Beginner",
    tags: ["upload", "documents", "PDF", "drag drop", "records"],
    description: "Upload aircraft records using drag-and-drop or file browse. myaircraft.us accepts PDF, JPG, and PNG. The AI auto-parses uploaded documents to extract key data.",
    sim: [
      {
        label: "Upload button opens the upload modal",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Documents" />}
            main={
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Upload Documents</span>
                  <HL><PBtn label="+ Upload Document" /></HL>
                </div>
                <MCard title="Recent Uploads" subtitle="Drag files to add more">
                  <div className="text-[6px] text-gray-400 mt-0.5">Last uploaded: Annual Inspection 2024 (3 days ago)</div>
                </MCard>
              </div>
            }
            topLabel="Documents — Upload Trigger"
          />
        ),
      },
      {
        label: "Drag and drop files into the upload zone",
        content: (
          <MiniModal title="Upload Document">
            <SelectField label="Aircraft" value="N12345 — Cessna 172S" />
            <SelectField label="Document Type" value="Annual Inspection" />
            <HL><UploadZone active={true} /></HL>
            <div className="text-[6px] text-gray-400 text-center">PDF · JPG · PNG · Max 50 MB</div>
          </MiniModal>
        ),
      },
      {
        label: "AI parsing extracts key data automatically",
        content: (
          <MiniModal title="Document Processing…">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center">
              <div className="text-[8px] text-blue-700" style={{ fontWeight: 700 }}>🤖 AI Parsing Document…</div>
              <div className="text-[6px] text-blue-500 mt-0.5">Extracting: dates, technician names, part numbers, work performed</div>
            </div>
            <MCard title="Parsed Data Preview" subtitle="Verify before saving">
              <div className="space-y-0.5 mt-1">
                <div className="text-[6px] text-gray-400">Date: <span className="text-gray-700" style={{ fontWeight: 600 }}>March 14, 2024</span></div>
                <div className="text-[6px] text-gray-400">Type: <span className="text-gray-700" style={{ fontWeight: 600 }}>Annual Inspection</span></div>
                <div className="text-[6px] text-gray-400">A&P: <span className="text-gray-700" style={{ fontWeight: 600 }}>Mike Torres #2847492</span></div>
              </div>
            </MCard>
          </MiniModal>
        ),
      },
      {
        label: "Document saved — immediately searchable by AI",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Documents" />}
            main={
              <div className="space-y-1.5">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-2">
                  <span className="text-emerald-500 text-[10px]">✓</span>
                  <div>
                    <div className="text-[7px] text-emerald-800" style={{ fontWeight: 700 }}>Annual Inspection 2024.pdf uploaded</div>
                    <div className="text-[6px] text-emerald-600">Parsed · Tagged · Now searchable by AI</div>
                  </div>
                </div>
                <THead cells={["Document", "Aircraft", "Date"]} />
                <TRow cells={["Annual Inspection 2024", "N12345", "Mar 2024"]} highlighted />
              </div>
            }
            topLabel="Documents — Upload Success"
          />
        ),
      },
    ],
    steps: [
      { title: "Click '+ Upload Document'", content: "From the Documents page, click the blue '+ Upload Document' button in the top right. The upload modal opens." },
      { title: "Select the aircraft", content: "From the 'Aircraft' dropdown, select the aircraft this document belongs to. Documents are always associated with a specific N-number." },
      { title: "Choose the document type", content: "Select the document type: Annual Inspection, AD Compliance, Engine Log, Airframe Log, STC, Registration, Insurance, Invoice, Work Order, or Other. This enables accurate filtering and AI categorization." },
      { title: "Upload the file", content: "Drag your PDF/JPG/PNG file onto the upload zone, or click 'Browse Files' to use the system file picker. Files up to 50 MB are supported.", tip: "For best AI parsing results, upload the original PDF rather than a scanned image. If scanning, use 300 DPI or higher." },
      { title: "Review AI-parsed data", content: "After upload, the AI automatically reads the document and extracts key data: inspection date, technician name and certificate number, work performed, and parts installed. Review this data for accuracy." },
      { title: "Confirm and save", content: "If the parsed data looks correct, click 'Confirm & Save'. The document is immediately added to your vault and the AI can now answer questions about it." },
    ],
    related: ["owner-docs-overview", "owner-docs-search", "owner-ai-ask"],
  },

  {
    id: "owner-docs-search",
    title: "Searching & Filtering Your Documents",
    category: "Documents",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["search", "documents", "filter", "find", "records"],
    description: "Instantly find any document across your entire fleet using the AI-powered search bar. Search by keyword, date, technician name, part number, or even by concept.",
    sim: [
      {
        label: "Smart search — find by keyword within documents",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Documents" />}
            main={
              <div className="space-y-1.5">
                <HL>
                  <div className="flex items-center gap-1 bg-white border border-blue-300 rounded px-2 py-1 ring-1 ring-blue-200">
                    <span className="text-[8px] text-gray-400">🔍</span>
                    <span className="text-[7px] text-gray-700">Mike Torres 2024</span>
                  </div>
                </HL>
                <div className="text-[6px] text-gray-400">4 results found</div>
                <TRow cells={["Annual Inspection 2024", "N12345", "Mar 2024"]} highlighted />
                <TRow cells={["100-hr Inspection Q3 2024", "N12345", "Sep 2024"]} highlighted />
                <TRow cells={["Spark Plug Replacement", "N12345", "Oct 2024"]} highlighted />
                <TRow cells={["Logbook Entry #284", "N12345", "Oct 2024"]} highlighted />
              </div>
            }
            topLabel="Documents — Search: 'Mike Torres 2024'"
          />
        ),
      },
      {
        label: "Filter by document type",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Documents" />}
            main={
              <div className="space-y-1.5">
                <div className="flex gap-1 flex-wrap">
                  {["All", "Annuals", "ADs", "Engine", "Registration", "Insurance"].map((f, i) => (
                    <div key={f} className={`text-[6px] px-2 py-0.5 rounded-full cursor-pointer ${i === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`} style={{ fontWeight: i === 2 ? 700 : 400 }}>{f}</div>
                  ))}
                </div>
                <THead cells={["AD Document", "Aircraft", "Status"]} />
                <TRow cells={["AD 2024-15-06 Compliance", "N67890", "Complied"]} />
                <TRow cells={["AD 2023-14-01 Compliance", "N12345", "Complied"]} highlighted />
                <TRow cells={["AD 2024-03-09 — Pending", "N24680", "Pending"]} />
              </div>
            }
            topLabel="Documents — Filter: ADs"
          />
        ),
      },
    ],
    steps: [
      { title: "Use the search bar for instant results", content: "The search bar on the Documents page searches within document contents — not just filenames. Type a technician name, part number, date, or procedure to find matching documents instantly." },
      { title: "Search by concept", content: "The AI understands concepts. Search 'fuel system inspection' to find all documents related to fuel system work, even if the exact phrase doesn't appear in every matching document." },
      { title: "Apply type filters", content: "Click the filter pills below the search bar to narrow results by document type. You can combine search + filter — e.g., search 'overdue' and filter by 'ADs' to find overdue AD compliance records." },
      { title: "Filter by aircraft", content: "Use the aircraft selector dropdown (next to the search bar) to limit results to one specific N-number. Useful for pre-sale or insurance document audits." },
      { title: "Sort results", content: "Click the column headers to sort by document name, aircraft, date, or type. Date descending (newest first) is the default and usually the most useful view." },
    ],
    related: ["owner-docs-overview", "owner-docs-upload", "owner-ai-ask"],
  },

  {
    id: "owner-docs-esign",
    title: "eSignature Workflow",
    category: "Documents",
    persona: "owner",
    duration: "4 min",
    difficulty: "Intermediate",
    tags: ["eSignature", "sign", "documents", "approval", "invoice"],
    description: "myaircraft.us has a built-in eSignature system. Sign invoices, work authorizations, and any other document digitally — no printing, scanning, or DocuSign required.",
    sim: [
      {
        label: "Document awaiting your signature",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Documents" />}
            main={
              <div className="space-y-1.5">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center gap-2">
                  <span className="text-amber-500 text-[10px]">✍️</span>
                  <div>
                    <div className="text-[7px] text-amber-800" style={{ fontWeight: 700 }}>Signature Required</div>
                    <div className="text-[6px] text-amber-600">Invoice #2047 — Awaiting your approval signature</div>
                  </div>
                </div>
                <MCard title="Invoice #2047 — $2,257.50" badge="Awaiting Signature" badgeColor="amber" subtitle="N67890 · Mike Torres · Apr 2026" highlighted />
                <PBtn label="→ Review & Sign" className="w-full" />
              </div>
            }
            topLabel="Documents — Signature Required Alert"
          />
        ),
      },
      {
        label: "eSignature modal — review document then sign",
        content: (
          <MiniModal title="eSign — Invoice #2047">
            <div className="bg-gray-50 rounded border border-gray-100 p-2 h-16 overflow-hidden">
              <div className="text-[6px] text-gray-600" style={{ fontWeight: 700 }}>INVOICE #2047</div>
              <div className="text-[5px] text-gray-400">Alternator R&R · N67890 · Apr 10, 2026</div>
              <InvSummary subtotal="$2,100" tax="$157.50" total="$2,257.50" />
            </div>
            <div>
              <div className="text-[6px] text-gray-500 mb-0.5" style={{ fontWeight: 600 }}>YOUR SIGNATURE</div>
              <HL><SignaturePad signed={false} /></HL>
            </div>
            <PBtn label="✓ Sign & Approve Invoice" className="w-full" />
          </MiniModal>
        ),
      },
      {
        label: "Signed — document sealed with timestamp",
        content: (
          <MiniModal title="Invoice #2047 — Signed">
            <SignaturePad signed={true} />
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-center">
              <div className="text-[7px] text-emerald-800" style={{ fontWeight: 700 }}>✓ Signed & Sealed</div>
              <div className="text-[6px] text-emerald-600 mt-0.5">Apr 12, 2026 · 14:32 UTC · IP: 192.168.x.x</div>
              <div className="text-[6px] text-emerald-600">Signature legally binding per E-SIGN Act</div>
            </div>
            <div className="flex gap-1">
              <GBtn label="Download PDF" className="flex-1" />
              <GBtn label="Email Copy" className="flex-1" />
            </div>
          </MiniModal>
        ),
      },
    ],
    steps: [
      { title: "Find documents awaiting signature", content: "Documents requiring your signature appear with an amber 'Awaiting Signature' badge. You'll also receive an email notification. Look in the Documents list and on the Dashboard activity feed." },
      { title: "Open the document for review", content: "Click the document or the '→ Review & Sign' button to open the eSignature modal. Read the full document carefully before signing — the AI summary below the document highlights key terms." },
      { title: "Apply your signature", content: "In the signature panel, draw your signature using mouse or touch, or type your name and select a signature style. Your drawn or typed signature is converted to a legal digital signature." },
      { title: "Confirm and sign", content: "Click 'Sign & Approve'. The document is sealed with a timestamp, your IP address, and a unique cryptographic hash that makes the signature tamper-evident.", tip: "eSignatures on myaircraft.us comply with the U.S. Electronic Signatures in Global and National Commerce (E-SIGN) Act and are legally equivalent to handwritten signatures." },
      { title: "Download or share the signed document", content: "After signing, download the signed PDF (includes signature certificate page) or email it directly to the mechanic or any recipient." },
    ],
    related: ["owner-docs-overview", "owner-aircraft-estimates"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Marketplace
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-marketplace-overview",
    title: "Marketplace Overview",
    category: "Marketplace",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["marketplace", "parts", "manuals", "service providers", "shopping"],
    description: "The Marketplace is your one-stop shop for aircraft parts, technical manuals, and certified service providers. Browse, compare, and connect — all within myaircraft.us.",
    sim: [
      {
        label: "Marketplace landing — three sections",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Marketplace" />}
            main={
              <div className="space-y-1.5">
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { icon: "🔧", label: "Parts", count: "12,400+" },
                    { icon: "📖", label: "Manuals", count: "3,800+" },
                    { icon: "🏪", label: "Providers", count: "240+" },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-lg border border-gray-100 p-2 text-center shadow-sm">
                      <div className="text-lg">{s.icon}</div>
                      <div className="text-[7px] text-gray-700" style={{ fontWeight: 700 }}>{s.label}</div>
                      <div className="text-[6px] text-gray-400">{s.count}</div>
                    </div>
                  ))}
                </div>
                <MCard title="Recommended for N12345" badge="AI Pick" badgeColor="blue" subtitle="Based on your aircraft's make, model & service history" />
              </div>
            }
            topLabel="Marketplace — Overview"
          />
        ),
      },
      {
        label: "Parts search — find by part number or description",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Marketplace" />}
            main={
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 bg-white border border-blue-300 rounded px-2 py-1">
                  <span className="text-[8px] text-gray-400">🔍</span>
                  <span className="text-[7px] text-gray-700">Champion REM38E</span>
                </div>
                <MCard title="Champion REM38E Spark Plug" badge="In Stock" badgeColor="green" subtitle="$18.95 each · OEM Part">
                  <div className="text-[6px] text-gray-400 mt-0.5">Fits: Lycoming IO-360 · Cessna 172S · PA-28</div>
                </MCard>
                <MCard title="Champion REM38E (4-pack)" badge="In Stock" badgeColor="green" subtitle="$69.95 · Save 7%">
                  <div className="text-[6px] text-gray-400 mt-0.5">Best value · Ships in 2–3 days</div>
                </MCard>
              </div>
            }
            topLabel="Marketplace → Parts Search"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Marketplace", content: "Click 'Marketplace' in the left sidebar. You'll see three main sections: Parts (aircraft parts and hardware), Manuals (technical documents and AMMs), and Service Providers (certified shops and A&Ps)." },
      { title: "Browse AI recommendations", content: "The 'Recommended for You' section uses your aircraft's make, model, engine type, and service history to suggest relevant parts and manuals. These are personalized to your fleet." },
      { title: "Search for parts", content: "Use the search bar to find parts by part number (e.g., REM38E), description (e.g., 'spark plug'), or component (e.g., 'alternator Cessna 172'). Results show price, availability, and compatibility." },
      { title: "Find manuals and technical data", content: "Switch to the Manuals tab to find Pilot Operating Handbooks (POHs), Maintenance Manuals (AMMs), Parts Manuals, Service Bulletins, and STCs for your specific aircraft model and year." },
      { title: "Locate service providers", content: "The Service Providers tab lists certified A&P shops, IA inspectors, and avionics shops near your base airport. Filter by service type, certification level, and distance." },
    ],
    related: ["owner-marketplace-parts", "owner-marketplace-manuals"],
  },

  {
    id: "owner-marketplace-parts",
    title: "Finding & Comparing Parts",
    category: "Marketplace",
    persona: "owner",
    duration: "4 min",
    difficulty: "Beginner",
    tags: ["parts", "marketplace", "part number", "compare", "pricing"],
    description: "Search 12,400+ aviation parts by part number, description, or aircraft compatibility. Compare prices across suppliers and verify airworthiness before ordering.",
    sim: [
      {
        label: "Parts search with filters",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Marketplace" />}
            main={
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  <div className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-[7px] text-gray-500">🔍 Search parts…</div>
                  <SelectField label="" value="All Aircraft" />
                </div>
                <MCard title="Oil Filter — Champion CH-48110" badge="OEM" badgeColor="green" subtitle="$32.50 · In Stock · Fits: IO-360">
                  <div className="text-[6px] text-gray-400 mt-0.5">Airworthiness: FAA-PMA approved</div>
                </MCard>
                <MCard title="Oil Filter — Tempest AA48110" badge="PMA" badgeColor="blue" subtitle="$24.95 · In Stock · Fits: IO-360">
                  <div className="text-[6px] text-gray-400 mt-0.5">Interchangeable with Champion CH-48110</div>
                </MCard>
              </div>
            }
            topLabel="Marketplace → Parts → Oil Filters"
          />
        ),
      },
      {
        label: "Part detail — specs, compatibility, and airworthiness",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Marketplace" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Champion CH-48110 Oil Filter" badge="In Stock" badgeColor="green" highlighted>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {[["Part #", "CH-48110"], ["Approval", "FAA-PMA"], ["Price", "$32.50"], ["Ships", "2–3 days"], ["Fits", "IO-360, O-360"], ["Vendor", "Aircraft Spruce"]].map(([k, v]) => (
                      <div key={k}><div className="text-[5px] text-gray-400 uppercase">{k}</div><div className="text-[6.5px] text-gray-700" style={{ fontWeight: 600 }}>{v}</div></div>
                    ))}
                  </div>
                </MCard>
                <PBtn label="Share with My Mechanic" className="w-full" />
              </div>
            }
            topLabel="Part Detail — Champion CH-48110"
          />
        ),
      },
    ],
    steps: [
      { title: "Search by part number or description", content: "In the Marketplace → Parts section, type a full or partial part number (e.g., 'CH-48110') or a description ('oil filter lycoming'). Results appear instantly." },
      { title: "Filter by your aircraft", content: "Use the 'Filter by Aircraft' dropdown to show only parts compatible with your specific N-number. The system uses your aircraft's make, model, and engine data to filter intelligently." },
      { title: "Compare OEM vs PMA parts", content: "Results show both Original Equipment Manufacturer (OEM) and FAA-PMA approved alternatives. PMA parts are FAA-approved substitutes that can save 20–50%. Both are airworthy." },
      { title: "Check airworthiness approval", content: "Every part listing shows its approval type: OEM (original), FAA-PMA (approved alternate), or TSO (technical standard order). Never install a non-approved part." },
      { title: "Share with your mechanic", content: "Found the right part? Click 'Share with My Mechanic' to send the part details directly to your assigned A&P. They can order it as part of the next work order.", tip: "Buying parts yourself can save money, but check with your mechanic first — some shops have supplier accounts with better pricing, and some warranties require OEM parts." },
    ],
    related: ["owner-marketplace-overview", "owner-aircraft-squawks"],
  },

  {
    id: "owner-marketplace-manuals",
    title: "Technical Manuals & Service Bulletins",
    category: "Marketplace",
    persona: "owner",
    duration: "3 min",
    difficulty: "Intermediate",
    tags: ["manuals", "AMM", "POH", "service bulletin", "STC", "technical data"],
    description: "Access Pilot Operating Handbooks, Maintenance Manuals, Service Bulletins, and STCs for your aircraft — all searchable and linked to your specific aircraft records.",
    sim: [
      {
        label: "Manuals tab — browse by document type",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Marketplace" />}
            main={
              <div className="space-y-1.5">
                <div className="flex gap-1 flex-wrap">
                  {["POH", "AMM", "Parts Manual", "Service Bulletin", "STC", "AD"].map((t, i) => (
                    <div key={t} className={`text-[6px] px-2 py-0.5 rounded-full ${i === 1 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`} style={{ fontWeight: i === 1 ? 700 : 400 }}>{t}</div>
                  ))}
                </div>
                <MCard title="Cessna 172S Maintenance Manual — 2005 Rev D" badge="AMM" badgeColor="blue" subtitle="Textron Aviation · 847 pages" highlighted />
                <MCard title="Lycoming IO-360 Overhaul Manual" badge="AMM" badgeColor="blue" subtitle="Lycoming · 1,204 pages" />
              </div>
            }
            topLabel="Marketplace → Manuals → AMM"
          />
        ),
      },
    ],
    steps: [
      { title: "Open Marketplace → Manuals tab", content: "Switch to the Manuals tab in the Marketplace. Filter by document type using the pill filters: POH, AMM, Parts Manual, Service Bulletin, STC, or AD." },
      { title: "Search for your aircraft's manual", content: "Type your aircraft make and model in the search bar. Results show all available manuals, revision dates, and page counts." },
      { title: "View online or download", content: "Click any manual to preview it inline, or download the PDF. Manuals you download are automatically added to your Document Vault." },
      { title: "Link manuals to your aircraft", content: "When you 'Link to Aircraft', the manual appears in your aircraft's Documents tab and the AI can reference it when answering Ask Your Aircraft queries.", tip: "Linking your Maintenance Manual and POH to each aircraft dramatically improves the AI's accuracy when answering technical questions." },
    ],
    related: ["owner-marketplace-overview", "owner-docs-upload", "owner-ai-ask"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Mechanics & Team
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-mechanics-invite",
    title: "Inviting a Mechanic to Your Aircraft",
    category: "Mechanics & Team",
    persona: "owner",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["mechanic", "invite", "A&P", "access", "team", "aircraft"],
    description: "Grant a certified A&P mechanic access to a specific aircraft's records. They'll be invited by email and can view squawks, create estimates, log work, and issue invoices — all tied to that N-number.",
    sim: [
      {
        label: "Invite Mechanic button on Aircraft Detail",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="N12345 — Cessna 172S" badge="Airworthy" badgeColor="green" highlighted />
                <div className="flex justify-between items-center">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Assigned Mechanics</span>
                  <HL><PBtn label="+ Invite Mechanic" /></HL>
                </div>
                <div className="text-[6px] text-gray-400 text-center py-2">No mechanics assigned yet</div>
              </div>
            }
            topLabel="Aircraft Detail — Mechanics Tab"
          />
        ),
      },
      {
        label: "Fill in mechanic's information",
        content: (
          <MiniModal title="Invite Mechanic — N12345">
            <FormField label="Full Name" value="Mike Torres" focused />
            <FormField label="Email Address" value="mike@torresaviation.com" />
            <FormField label="Phone (optional)" value="(512) 555-0288" />
            <SelectField label="Certificate Type" value="A&P / IA" />
            <div className="flex gap-1 pt-1">
              <PBtn label="✉️ Send Invitation" />
              <GBtn label="Cancel" />
            </div>
          </MiniModal>
        ),
      },
      {
        label: "Invitation sent — mechanic receives email",
        content: (
          <div className="h-full bg-[#f8fafc] flex items-center justify-center p-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-lg w-full p-4 space-y-3">
              <div className="text-[8px] text-gray-400 text-center">✉️ Email Preview</div>
              <div className="bg-[#0A1628] rounded-lg p-3 text-center">
                <div className="text-white text-[8px]" style={{ fontWeight: 700 }}>✈ myaircraft.us</div>
                <div className="text-white/70 text-[7px] mt-0.5">You've been invited</div>
              </div>
              <div className="text-[7px] text-gray-700">Hi Mike, <span className="text-blue-600" style={{ fontWeight: 600 }}>John Mitchell</span> has invited you to access aircraft <span style={{ fontWeight: 700 }}>N12345</span> (Cessna 172S) on myaircraft.us.</div>
              <div className="bg-[#2563EB] text-white text-[7px] text-center py-1.5 rounded-lg" style={{ fontWeight: 700 }}>Accept Invitation</div>
            </div>
          </div>
        ),
      },
      {
        label: "Mechanic appears as Active after accepting",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Assigned Mechanics</span>
                  <PBtn label="+ Invite Another" />
                </div>
                <MCard title="Mike Torres · A&P/IA" badge="Active" badgeColor="green" subtitle="mike@torresaviation.com · Cert #2847492" highlighted>
                  <div className="flex items-center gap-1 mt-1">
                    <ToggleRow label="Access enabled" on={true} />
                  </div>
                </MCard>
              </div>
            }
            topLabel="Mechanics Tab — Mike Torres Active"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Mechanics tab on an aircraft", content: "Go to Aircraft → click the aircraft card → click the 'Mechanics' tab. This shows all mechanics currently assigned to this specific aircraft." },
      { title: "Click '+ Invite Mechanic'", content: "Click the blue '+ Invite Mechanic' button. The invite modal opens." },
      { title: "Enter the mechanic's details", content: "Enter the mechanic's full name, email address, and optionally their phone number. Select their certificate type (A&P/IA, A&P Mechanic, Apprentice, or Read Only). The certificate type determines their permission level." },
      { title: "Send the invitation", content: "Click 'Send Invitation'. The mechanic receives an email with a link to accept. Until they accept, their status shows as 'Invited'." },
      { title: "After acceptance", content: "Once the mechanic accepts, their status changes to 'Active'. They can now see this aircraft's squawks, create estimates, log work, and issue invoices through their Mechanic Portal.", tip: "You can invite multiple mechanics to the same aircraft — useful if you use different shops for avionics vs. airframe work." },
      { title: "Manage access with the toggle", content: "At any time, you can disable a mechanic's access without revoking the invitation by toggling the 'Access enabled' switch to off. Toggle back to re-enable instantly." },
    ],
    related: ["owner-mechanics-access", "owner-aircraft-detail", "owner-gs-add-aircraft"],
  },

  {
    id: "owner-mechanics-access",
    title: "Managing Mechanic Access & Permissions",
    category: "Mechanics & Team",
    persona: "owner",
    duration: "4 min",
    difficulty: "Intermediate",
    tags: ["mechanic", "access", "permissions", "toggle", "revoke", "control"],
    description: "You have full control over which mechanics can access which aircraft. Learn to enable/disable access, view mechanic activity, and revoke access when needed.",
    sim: [
      {
        label: "Mechanic access control panel",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Mechanics on N12345</span>
                <MCard title="Mike Torres · A&P/IA" badge="Active" badgeColor="green" subtitle="Lead Mechanic">
                  <ToggleRow label="Access enabled" on={true} />
                </MCard>
                <MCard title="Sarah Chen · A&P" badge="Active" badgeColor="green" subtitle="Avionics Specialist">
                  <ToggleRow label="Access enabled" on={false} />
                </MCard>
                <MCard title="James Wright · A&P" badge="Invited" badgeColor="amber" subtitle="Pending acceptance">
                  <div className="text-[6px] text-amber-600 mt-0.5">Invitation sent 2 days ago</div>
                </MCard>
              </div>
            }
            topLabel="Mechanics Tab — Access Management"
          />
        ),
      },
      {
        label: "Toggle access off — immediate effect",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Sarah Chen · A&P" badge="Access Off" badgeColor="red" subtitle="Avionics Specialist" highlighted>
                  <HL><ToggleRow label="Access enabled" on={false} /></HL>
                  <div className="text-[6px] text-red-500 mt-0.5">⚠️ Sarah cannot view this aircraft's records</div>
                </MCard>
                <div className="text-[6px] text-gray-400 text-center">Toggle back ON to restore access instantly</div>
              </div>
            }
            topLabel="Access Toggle — Disabled"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Mechanics tab", content: "On any aircraft's detail page, click the Mechanics tab. You'll see all invited mechanics with their current status: Active, Invited (pending), or Access Disabled." },
      { title: "Toggle access on/off", content: "Each mechanic card has an 'Access enabled' toggle. Switching it off immediately revokes their ability to view or modify this aircraft's records — no email sent, no delay. Toggling back on restores access instantly." },
      { title: "Resend an invitation", content: "If a mechanic hasn't accepted after a few days, click the three-dot menu on their card and select 'Resend Invitation'. A new email is sent immediately." },
      { title: "Revoke access entirely", content: "To fully remove a mechanic from an aircraft, click the three-dot menu and select 'Remove Mechanic'. This permanently removes them — they'll need a new invitation to regain access.", tip: "When you sell an aircraft, always revoke all mechanic access first to protect the new owner's privacy and your maintenance records." },
      { title: "View mechanic activity log", content: "Click any mechanic's name to see their activity log on this aircraft — every work order created, logbook entry signed, and estimate submitted, with timestamps." },
    ],
    related: ["owner-mechanics-invite", "owner-settings-users"],
  },

  {
    id: "owner-settings-users",
    title: "Users Page — Managing Team Access",
    category: "Mechanics & Team",
    persona: "owner",
    duration: "4 min",
    difficulty: "Intermediate",
    tags: ["users", "team", "access", "manage", "admin"],
    description: "The Users page gives you a complete overview of every person with access to your myaircraft.us account — across all aircraft. Manage roles, access levels, and activity from one centralized view.",
    sim: [
      {
        label: "Users page — centralized team view",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Settings" />}
            main={
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Team Members (4)</span>
                  <PBtn label="+ Invite User" />
                </div>
                <MCard title="John Mitchell" badge="Owner" badgeColor="dark" subtitle="john@mitchellaviation.com" />
                <MCard title="Mike Torres · A&P/IA" badge="Mechanic" badgeColor="blue" subtitle="N12345, N67890" />
                <MCard title="Sarah Chen · A&P" badge="Mechanic" badgeColor="blue" subtitle="N12345 (access off)" />
                <MCard title="James Wright · A&P" badge="Invited" badgeColor="amber" subtitle="Pending acceptance" />
              </div>
            }
            topLabel="Users — Team Overview"
          />
        ),
      },
    ],
    steps: [
      { title: "Navigate to the Users page", content: "The Users page is accessible from the left sidebar. It shows every person with any level of access to your myaircraft.us account, across all aircraft." },
      { title: "Review team member roles", content: "Each user shows their role (Owner, Mechanic/A&P, Read Only), which aircraft they have access to, and their current status (Active, Invited, Access Disabled)." },
      { title: "Manage individual access", content: "Click any team member's row to see their full profile: certification details, which aircraft they can access, their activity log, and access control toggles per aircraft." },
      { title: "Invite a new user directly", content: "Click '+ Invite User' to add someone who isn't tied to a specific aircraft — useful for read-only access for insurance agents, co-owners, or administrators." },
    ],
    related: ["owner-mechanics-invite", "owner-mechanics-access"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Compliance & Safety
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-compliance-ads",
    title: "Airworthiness Directive (AD) Tracking",
    category: "Compliance & Safety",
    persona: "owner",
    duration: "5 min",
    difficulty: "Intermediate",
    pinned: true,
    tags: ["AD", "airworthiness directive", "compliance", "FAA", "safety"],
    description: "ADs are FAA mandatory safety requirements. myaircraft.us tracks all applicable ADs for your aircraft, flags overdue items, and helps you maintain proof of compliance in your records.",
    sim: [
      {
        label: "AD compliance list for an aircraft",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1">
                <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>ADs — N67890 Piper PA-28</span>
                <THead cells={["AD Number", "Subject", "Status"]} />
                <TRow cells={["2024-15-06", "Fuel System Inspection", "Due in 12 days"]} highlighted />
                <TRow cells={["2023-14-01", "Fuel Injector Check", "Complied"]} />
                <TRow cells={["2022-08-17", "Crankshaft Bolt", "Complied"]} />
                <TRow cells={["2021-05-03", "Alternator Bracket", "Complied"]} />
              </div>
            }
            topLabel="Aircraft → N67890 → AD Compliance"
          />
        ),
      },
      {
        label: "AD detail — full compliance record",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="AD 2024-15-06" badge="Due Soon" badgeColor="amber" subtitle="Fuel System — Issued Dec 2024" highlighted>
                  <div className="space-y-0.5 mt-1">
                    <div className="text-[6px] text-gray-400">Applies to: Piper PA-28-181 (all serial numbers)</div>
                    <div className="text-[6px] text-gray-400">Compliance: Within 100 flight hours or 12 months</div>
                    <div className="text-[6px] text-gray-400">Due: <span className="text-amber-600" style={{ fontWeight: 700 }}>Apr 24, 2026 (12 days)</span></div>
                    <div className="text-[6px] text-gray-400">Est. labor: 2 hrs · $300</div>
                  </div>
                </MCard>
                <PBtn label="Report Squawk for AD Compliance" className="w-full" />
              </div>
            }
            topLabel="AD Detail — Due in 12 Days"
          />
        ),
      },
      {
        label: "Ask AI about AD status across fleet",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Show all ADs due in the next 60 days across my fleet" />
                <CBubble role="ai" text="2 ADs due in 60 days: N67890 — AD 2024-15-06 fuel system (12 days, HIGH priority). N24680 — AD 2024-03-09 oil filter adapter (47 days, MEDIUM priority). Estimated compliance cost: $850 total." />
                <PBtn label="Schedule Both Inspections" className="w-full" />
              </div>
            }
            topLabel="Ask AI — Fleet AD Status"
          />
        ),
      },
    ],
    steps: [
      { title: "View ADs for a specific aircraft", content: "Open an aircraft detail page → click the 'Compliance' or 'Overview' section. ADs are listed with their number, subject, and current compliance status." },
      { title: "Understand AD status colors", content: "Red = Overdue (non-compliant — aircraft may not be legally airworthy). Amber = Due Soon (within 30 days or 25 flight hours of compliance interval). Green = Complied (proof of compliance in records)." },
      { title: "Open an AD for full details", content: "Click any AD to see the full requirement: which serial numbers are affected, the compliance interval (e.g., within 100 flight hours), the due date based on your aircraft's current Hobbs, and estimated repair cost." },
      { title: "Initiate compliance", content: "Click 'Report Squawk for AD Compliance' to create a squawk linked to the AD. Your mechanic will see the AD number, compliance requirement, and due date automatically included in the squawk.", tip: "Keep AD compliance documents (work orders, logbook entries) uploaded to your Document Vault. This provides proof of compliance if the FAA or insurance inquires." },
      { title: "AI fleet-wide AD check", content: "Use Ask Your Aircraft or the AI Command Center with: 'Show all ADs due in the next 60 days across my fleet'. Get a prioritized list with estimated costs and recommended scheduling." },
    ],
    related: ["owner-compliance-annual", "owner-aircraft-squawks", "owner-ai-command"],
  },

  {
    id: "owner-compliance-annual",
    title: "Annual Inspection Tracking",
    category: "Compliance & Safety",
    persona: "owner",
    duration: "4 min",
    difficulty: "Beginner",
    tags: ["annual", "inspection", "compliance", "airworthiness", "IA"],
    description: "The annual inspection is required for all Part 91 aircraft every 12 calendar months. myaircraft.us tracks your annual due date, sends reminders, and helps you schedule it in advance.",
    sim: [
      {
        label: "Annual inspection status on aircraft detail",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="N12345 — Annual Inspection" badge="Due in 37 days" badgeColor="amber" subtitle="Cessna 172S · Part 91 Private" highlighted>
                  <div className="space-y-0.5 mt-1">
                    <div className="text-[6px] text-gray-400">Last Annual: <span className="text-gray-700" style={{ fontWeight: 600 }}>March 14, 2024</span></div>
                    <div className="text-[6px] text-gray-400">Next Due: <span className="text-amber-600" style={{ fontWeight: 700 }}>March 14, 2025 (37 days)</span></div>
                    <div className="text-[6px] text-gray-400">IA Required: <span className="text-gray-700" style={{ fontWeight: 600 }}>Yes (Part 91)</span></div>
                    <div className="text-[6px] text-gray-400">Est. Cost: $2,200 – $3,000</div>
                  </div>
                </MCard>
                <PBtn label="Schedule Annual Inspection" className="w-full" />
              </div>
            }
            topLabel="Aircraft → Compliance → Annual"
          />
        ),
      },
      {
        label: "Annual reminder notification",
        content: (
          <div className="h-full bg-[#f8fafc] flex items-center justify-center p-3">
            <div className="bg-white rounded-xl border border-amber-200 shadow-lg w-full p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-lg">📅</div>
                <div>
                  <div className="text-[8px] text-gray-800" style={{ fontWeight: 700 }}>Annual Inspection Due — 30 Days</div>
                  <div className="text-[6px] text-gray-400">myaircraft.us · Apr 12, 2026</div>
                </div>
              </div>
              <div className="text-[7px] text-gray-600">N12345 (Cessna 172S) annual inspection is due <span style={{ fontWeight: 700 }}>May 14, 2026</span>. Schedule now to ensure availability with your IA.</div>
              <PBtn label="→ Schedule Now" className="w-full" />
            </div>
          </div>
        ),
      },
    ],
    steps: [
      { title: "Find your annual due date", content: "Open any aircraft detail page. The Overview tab prominently shows the last annual date and the next due date. Aircraft past their annual show a red 'OVERDUE' badge." },
      { title: "Set up annual reminders", content: "Go to Settings → Notifications → enable 'Annual inspection reminders'. You'll receive reminders at 90, 60, 30, and 14 days before the due date." },
      { title: "Schedule in advance", content: "Click 'Schedule Annual Inspection' to create a squawk of type 'Annual Inspection' and assign it to your IA (Inspection Authorization) certified mechanic. IAs can book out weeks in advance." },
      { title: "After the annual", content: "When your IA completes the annual, they log it through the Mechanic Portal. The logbook entry is digitally signed and linked to your aircraft record. The next annual due date automatically updates.", tip: "Annual inspections are due by the last day of the 12th calendar month after the last annual. If your annual was March 14, it's due by March 31 of the following year — not exactly 12 months later." },
      { title: "Keep the annual paperwork uploaded", content: "After each annual, upload the signed inspection form, logbook entry, and any work order documentation to the aircraft's Documents tab. This creates a complete, searchable compliance record." },
    ],
    related: ["owner-compliance-ads", "owner-aircraft-squawks", "owner-mechanics-invite"],
  },

  {
    id: "owner-compliance-status",
    title: "Understanding Aircraft Status: Airworthy / Attention / AOG",
    category: "Compliance & Safety",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["airworthy", "AOG", "status", "grounded", "compliance", "safety"],
    description: "Every aircraft has one of three statuses: Airworthy, Attention, or AOG (Aircraft on Ground / Grounded). Understanding what drives each status helps you resolve issues faster.",
    sim: [
      {
        label: "Three aircraft status levels explained",
        content: (
          <div className="h-full bg-[#f8fafc] p-3 space-y-2">
            {[
              { status: "Airworthy", color: "green", desc: "No open HIGH squawks, annual current, all applicable ADs complied", icon: "✅" },
              { status: "Attention", color: "amber", desc: "Open MEDIUM squawks, upcoming compliance due, or documentation gaps", icon: "⚠️" },
              { status: "AOG", color: "red", desc: "Open HIGH squawk, overdue annual, overdue AD, or mechanic-grounded", icon: "🚫" },
            ].map(s => (
              <div key={s.status} className="bg-white rounded-lg border border-gray-100 p-2 shadow-sm flex items-start gap-2">
                <span className="text-[14px] shrink-0">{s.icon}</span>
                <div>
                  <div className="text-[8px]" style={{ fontWeight: 700 }}><MBadge label={s.status} color={s.color as "green" | "amber" | "red"} /></div>
                  <div className="text-[6.5px] text-gray-500 mt-0.5">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        ),
      },
      {
        label: "AOG aircraft — urgent resolution path",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                  <div className="text-[8px] text-red-800" style={{ fontWeight: 700 }}>🚫 N67890 — AIRCRAFT ON GROUND</div>
                  <div className="text-[6px] text-red-600 mt-0.5">HIGH severity squawk: Alternator failure. Do not fly until resolved.</div>
                </div>
                <MCard title="Resolution Path" subtitle="Steps to return to Airworthy">
                  <div className="space-y-0.5 mt-1">
                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center text-[5px] text-white shrink-0">✓</div><span className="text-[6px] text-gray-600">Squawk reported</span></div>
                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#2563EB] flex items-center justify-center text-[5px] text-white shrink-0">●</div><span className="text-[6px] text-gray-600">Estimate pending from mechanic</span></div>
                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-gray-200 flex items-center justify-center text-[5px] text-gray-400 shrink-0">3</div><span className="text-[6px] text-gray-400">Approve estimate</span></div>
                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-gray-200 flex items-center justify-center text-[5px] text-gray-400 shrink-0">4</div><span className="text-[6px] text-gray-400">Work order completed</span></div>
                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-gray-200 flex items-center justify-center text-[5px] text-gray-400 shrink-0">5</div><span className="text-[6px] text-gray-400">Logbook signed → Airworthy</span></div>
                  </div>
                </MCard>
              </div>
            }
            topLabel="AOG Resolution Workflow"
          />
        ),
      },
    ],
    steps: [
      { title: "Airworthy status", content: "An aircraft shows 'Airworthy' when: all applicable ADs are complied with, the annual inspection is current, no HIGH-severity squawks are open, and no mechanic has flagged a grounding issue. This is your target status for all aircraft." },
      { title: "Attention status", content: "Attention means the aircraft may still be flyable but has issues that need addressing soon: open MEDIUM squawks, an upcoming annual within 30 days, or documentation gaps. Don't ignore Attention — it often precedes AOG." },
      { title: "AOG (Aircraft on Ground)", content: "AOG is the most serious status. The aircraft must NOT be flown. This status is set by: a HIGH severity squawk (mechanical failure), an overdue annual, an overdue AD, or a mechanic explicitly grounding the aircraft via a squawk." },
      { title: "Resolve AOG step by step", content: "To return an AOG aircraft to Airworthy: 1) Ensure the HIGH squawk is being worked by your mechanic. 2) Approve the estimate. 3) Wait for work to complete. 4) Mechanic signs the logbook. 5) Status automatically returns to Airworthy." },
      { title: "Flying with Attention status", content: "Whether you can legally fly an aircraft with Attention status depends entirely on the specific open squawk. Consult your A&P — some MEL (Minimum Equipment List) items allow flight with specific restrictions.", tip: "Never fly an AOG-status aircraft regardless of your own assessment. The AOG designation means a certified A&P has determined the aircraft is not airworthy." },
    ],
    related: ["owner-compliance-ads", "owner-aircraft-squawks", "owner-dash-health"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Settings & Profile
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-settings-billing",
    title: "Billing & Subscription Management",
    category: "Settings & Profile",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["billing", "subscription", "plan", "payment", "upgrade"],
    description: "Manage your myaircraft.us subscription plan, payment method, and billing history from the Settings → Billing tab.",
    sim: [
      {
        label: "Billing tab — current plan overview",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Settings" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Current Plan: Professional" badge="Active" badgeColor="green" subtitle="$79/mo · Renews May 12, 2026">
                  <div className="space-y-0.5 mt-1">
                    <div className="text-[6px] text-gray-400">✓ Up to 10 aircraft</div>
                    <div className="text-[6px] text-gray-400">✓ Unlimited documents</div>
                    <div className="text-[6px] text-gray-400">✓ AI Q&A + Command Center</div>
                    <div className="text-[6px] text-gray-400">✓ eSignature</div>
                  </div>
                </MCard>
                <div className="flex gap-1">
                  <PBtn label="Upgrade to Enterprise" />
                  <GBtn label="Manage Payment" />
                </div>
              </div>
            }
            topLabel="Settings → Billing"
          />
        ),
      },
      {
        label: "Plan comparison — select the right tier",
        content: (
          <div className="h-full bg-[#f8fafc] p-3 space-y-1.5">
            {[
              { plan: "Starter", price: "$29/mo", aircraft: "2 aircraft", highlight: false },
              { plan: "Professional", price: "$79/mo", aircraft: "10 aircraft", highlight: true },
              { plan: "Enterprise", price: "$199/mo", aircraft: "Unlimited", highlight: false },
            ].map(p => (
              <div key={p.plan} className={`rounded-lg border p-2 ${p.highlight ? "border-blue-300 bg-blue-50" : "border-gray-100 bg-white"}`}>
                <div className="flex justify-between items-center">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: p.highlight ? 700 : 600 }}>{p.plan}</span>
                  <div>
                    <MBadge label={p.price} color={p.highlight ? "blue" : "gray"} />
                    {p.highlight && <MBadge label="Current" color="green" />}
                  </div>
                </div>
                <div className="text-[6px] text-gray-400 mt-0.5">{p.aircraft}</div>
              </div>
            ))}
          </div>
        ),
      },
    ],
    steps: [
      { title: "Open Settings → Billing", content: "Click 'Settings' in the sidebar, then the 'Billing' tab. Your current plan, next renewal date, and payment method are shown at the top." },
      { title: "Review your plan limits", content: "Each plan has limits on: number of aircraft, document storage, AI query volume, and team member seats. If you're approaching any limit, an amber warning banner appears." },
      { title: "Upgrade your plan", content: "Click 'Upgrade Plan' to see all available tiers. Professional ($79/mo) supports up to 10 aircraft. Enterprise ($199/mo) supports unlimited aircraft with priority support." },
      { title: "Update payment method", content: "Click 'Manage Payment' to add or update a credit card, ACH bank account, or company purchase order. All billing is handled securely through Stripe." },
      { title: "Download invoices", content: "Your billing history is at the bottom of the Billing tab. Click any past invoice to download a PDF receipt for accounting purposes." },
    ],
    related: ["owner-gs-profile", "owner-settings-integrations"],
  },

  {
    id: "owner-settings-notifications",
    title: "Notification Preferences & Alerts",
    category: "Settings & Profile",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["notifications", "alerts", "email", "settings", "reminders"],
    description: "Control exactly which events trigger notifications and how often you hear from myaircraft.us. Set up smart alerts for compliance deadlines, squawk updates, and invoice arrivals.",
    sim: [
      {
        label: "Notifications settings panel",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Settings" />}
            main={
              <div className="bg-white rounded-lg border border-gray-100 p-2">
                <div className="text-[8px] text-gray-700 mb-2" style={{ fontWeight: 700 }}>Notification Preferences</div>
                <ToggleRow label="HIGH squawk alerts (immediate email)" on={true} />
                <ToggleRow label="AD/annual compliance reminders" on={true} />
                <ToggleRow label="Estimate received from mechanic" on={true} />
                <ToggleRow label="Work order completed" on={true} />
                <ToggleRow label="Invoice received" on={true} />
                <ToggleRow label="Weekly fleet digest" on={false} />
                <ToggleRow label="Marketing & product updates" on={false} />
              </div>
            }
            topLabel="Settings → Notifications"
          />
        ),
      },
    ],
    steps: [
      { title: "Navigate to Settings → Notifications", content: "Click Settings in the sidebar, then the Notifications tab. Each notification type has an on/off toggle." },
      { title: "Enable critical safety alerts", content: "Always keep 'HIGH squawk alerts' and 'AD/annual compliance reminders' enabled. These protect your aircraft's airworthiness and your legal compliance as an aircraft owner." },
      { title: "Configure financial notifications", content: "Enable 'Estimate received' and 'Invoice received' so you're always aware of pending costs and financial approvals. These are sent as immediate emails." },
      { title: "Set your digest frequency", content: "The 'Weekly fleet digest' sends a summary email every Monday with all open squawks, upcoming compliance items, and recent activity across your fleet. Many owners prefer this to individual alerts." },
    ],
    related: ["owner-gs-profile", "owner-settings-billing"],
  },

  {
    id: "owner-settings-integrations",
    title: "API Settings & Integrations",
    category: "Settings & Profile",
    persona: "owner",
    duration: "5 min",
    difficulty: "Advanced",
    tags: ["API", "integrations", "ADS-B", "ForeFlight", "QuickBooks", "connect"],
    description: "Connect myaircraft.us to external tools — ADS-B tracking, ForeFlight, QuickBooks, and more — via the integrations marketplace in your Settings.",
    sim: [
      {
        label: "Integrations settings — available connections",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Settings" />}
            main={
              <div className="space-y-1.5">
                <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Integrations</span>
                {[
                  { name: "ADS-B Flight Track", status: "Connected", color: "green" },
                  { name: "ForeFlight", status: "Available", color: "blue" },
                  { name: "QuickBooks", status: "Available", color: "blue" },
                  { name: "Jeppesen Charts", status: "Available", color: "blue" },
                  { name: "FlightAware", status: "Available", color: "blue" },
                ].map(i => (
                  <MCard key={i.name} title={i.name} badge={i.status} badgeColor={i.color as "green" | "blue"} subtitle={i.status === "Connected" ? "Live · Last sync 2 min ago" : "Click to connect"} highlighted={i.status === "Connected"} />
                ))}
              </div>
            }
            topLabel="Settings → Integrations"
          />
        ),
      },
      {
        label: "API key management",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Settings" />}
            main={
              <div className="space-y-1.5">
                <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>API Keys</span>
                <MCard title="Production API Key" subtitle="Created Apr 1, 2026">
                  <div className="flex items-center gap-1 mt-1 bg-gray-50 rounded px-2 py-1">
                    <span className="text-[6px] text-gray-500 font-mono flex-1">mau_prod_••••••••••••••••</span>
                    <GBtn label="Reveal" />
                    <GBtn label="Rotate" />
                  </div>
                </MCard>
                <PBtn label="+ Generate New API Key" />
              </div>
            }
            topLabel="Settings → API Keys"
          />
        ),
      },
    ],
    steps: [
      { title: "Open Settings → API & Integrations", content: "Click Settings in the sidebar, then the 'API & Integrations' tab. You'll see two sections: pre-built integrations and raw API key management." },
      { title: "Enable a pre-built integration", content: "Find the service you want to connect (e.g., ForeFlight, QuickBooks, ADS-B) and click 'Connect'. Follow the OAuth flow to authorize access. Once connected, data syncs automatically." },
      { title: "ADS-B integration benefits", content: "Connecting ADS-B tracking enables the Live Track widget on your aircraft detail pages, and can auto-populate Hobbs time from actual flight data — reducing manual entry errors." },
      { title: "QuickBooks integration", content: "Connecting QuickBooks automatically syncs approved invoices from myaircraft.us to your QuickBooks account for accounting. This eliminates double-entry of maintenance expenses." },
      { title: "Raw API access", content: "For developers or third-party tools, click 'Generate API Key'. The key provides programmatic access to your fleet data following the myaircraft.us REST API spec. Never share your API key publicly." },
      { title: "Manage connected apps", content: "Review all connected apps regularly. If you stop using a service, click 'Disconnect' to revoke its access to your data. This is a security best practice.", tip: "Each integration only accesses the specific data it needs. For example, ADS-B integration only reads position data — it cannot see your documents or invoices." },
    ],
    related: ["owner-settings-billing", "owner-aircraft-livetrack"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Documents (continued)
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-docs-ai",
    title: "AI Document Parsing & Intelligence",
    category: "Documents",
    persona: "owner",
    duration: "4 min",
    difficulty: "Intermediate",
    tags: ["AI", "document parsing", "OCR", "intelligence", "extraction"],
    description: "myaircraft.us uses AI to automatically read and parse uploaded documents — extracting dates, technician names, part numbers, and compliance data so your records are always searchable and queryable.",
    sim: [
      {
        label: "AI parsing a newly uploaded annual inspection",
        content: (
          <div className="h-full bg-[#f8fafc] flex items-center justify-center p-3">
            <div className="bg-white rounded-xl border border-blue-200 shadow-lg w-full p-3 space-y-2">
              <div className="text-[8px] text-blue-700" style={{ fontWeight: 700 }}>🤖 AI Document Intelligence</div>
              <div className="bg-blue-50 rounded p-2">
                <div className="text-[6px] text-blue-600 mb-1" style={{ fontWeight: 600 }}>READING: Annual_Inspection_N12345_2024.pdf</div>
                <div className="space-y-0.5">
                  {["Identifying document type…", "Extracting key dates…", "Parsing technician info…", "Finding part numbers…", "Tagging AD references…"].map((s, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${i < 4 ? "bg-emerald-400" : "bg-blue-300 animate-pulse"}`} />
                      <span className="text-[6px] text-gray-600">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        label: "Parsed data — automatically extracted fields",
        content: (
          <MiniModal title="AI Parsed: Annual Inspection 2024">
            <div className="space-y-0.5">
              {[
                ["Document Type", "Annual Inspection"],
                ["Aircraft", "N12345 Cessna 172S"],
                ["Inspection Date", "March 14, 2024"],
                ["A&P/IA", "Mike Torres #2847492"],
                ["TTAF at Inspection", "3,847 hrs"],
                ["ADs Complied", "4 referenced"],
                ["Airworthiness", "Return to Service issued"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-[6px] text-gray-400">{k}</span>
                  <span className="text-[6px] text-gray-700" style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <PBtn label="Confirm & Save to Records" className="w-full" />
          </MiniModal>
        ),
      },
    ],
    steps: [
      { title: "Upload any aircraft document", content: "The AI parsing runs automatically on every document you upload — PDFs, scanned images, and photos. No special formatting required." },
      { title: "Review the parsed extraction", content: "After upload, the AI shows its extracted data: document type, dates, personnel names and certificate numbers, part numbers, work performed, and any AD or SB references found." },
      { title: "Correct any errors", content: "If the AI misidentified a field (rare with clear documents), you can edit any extracted value before saving. Type directly in the parsed field to correct it." },
      { title: "Confirm and save", content: "Click 'Confirm & Save'. The document and its extracted metadata are stored. The AI can now answer questions referencing this specific document's content." },
      { title: "Query the parsed data", content: "After saving, use Ask Your Aircraft to query the document: 'What ADs were complied with during the March 2024 annual?' The AI will cite this specific document in its answer.", tip: "For best parsing accuracy, upload original PDFs rather than photographs. If scanning, ensure at least 300 DPI resolution and that the text is clearly legible." },
    ],
    related: ["owner-docs-upload", "owner-ai-ask", "owner-docs-overview"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Getting Started (additional)
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-gs-switch-persona",
    title: "Switching Between Owner & Mechanic Personas",
    category: "Getting Started",
    persona: "owner",
    duration: "2 min",
    difficulty: "Beginner",
    tags: ["persona", "switch", "owner", "mechanic", "role"],
    description: "If you hold both an aircraft owner role and an A&P mechanic certification, you can switch between personas instantly within the same account — no separate logins needed.",
    sim: [
      {
        label: "Persona switcher — top of sidebar",
        content: (
          <SimApp
            sidebar={
              <>
                <HL>
                  <div className="flex gap-0.5 mb-2 bg-white/10 rounded p-0.5">
                    <div className="flex-1 bg-white text-gray-800 text-[6px] text-center py-1 rounded" style={{ fontWeight: 700 }}>Owner</div>
                    <div className="flex-1 text-white/40 text-[6px] text-center py-1 rounded hover:text-white cursor-pointer" style={{ fontWeight: 400 }}>Mechanic</div>
                  </div>
                </HL>
                <OwnerSidebar active="Dashboard" />
              </>
            }
            main={
              <div className="space-y-1.5">
                <MCard title="Fleet Dashboard" subtitle="You are in Owner mode" badge="Owner" badgeColor="blue" />
                <div className="text-[6px] text-gray-400">Click 'Mechanic' above to switch to the Mechanic Portal</div>
              </div>
            }
            topLabel="Persona Switcher — Owner Active"
          />
        ),
      },
      {
        label: "After switching — Mechanic Portal loads",
        content: (
          <SimApp
            sidebar={
              <>
                <div className="flex gap-0.5 mb-2 bg-white/10 rounded p-0.5">
                  <div className="flex-1 text-white/40 text-[6px] text-center py-1 rounded" style={{ fontWeight: 400 }}>Owner</div>
                  <div className="flex-1 bg-white text-gray-800 text-[6px] text-center py-1 rounded" style={{ fontWeight: 700 }}>Mechanic</div>
                </div>
                {["Dashboard", "Work Orders", "Invoices", "Logbook", "Customers", "Team"].map(i => <SNav key={i} label={i} active={i === "Dashboard"} />)}
              </>
            }
            main={
              <div className="space-y-1.5">
                <MCard title="Mechanic Portal" subtitle="Work orders, logbook, invoices" badge="Mechanic" badgeColor="dark" />
                <div className="text-[6px] text-gray-400">Your mechanic data is separate from owner data</div>
              </div>
            }
            topLabel="Mechanic Portal — After Switch"
          />
        ),
      },
    ],
    steps: [
      { title: "Find the persona switcher", content: "At the very top of the left sidebar, there are two buttons: 'Owner' and 'Mechanic'. The active persona is highlighted in white." },
      { title: "Click to switch", content: "Click 'Mechanic' to switch to the Mechanic Portal. The sidebar navigation changes immediately to show Mechanic-specific sections: Work Orders, Invoices, Logbook, Customers, and Team." },
      { title: "Separate data views", content: "Each persona has its own data view. As Owner, you see your fleet and records. As Mechanic, you see your assigned work orders, invoices, and the aircraft you service for clients." },
      { title: "Switch back anytime", content: "Click 'Owner' to return to the Owner persona. Your place is remembered — if you were on the N12345 Aircraft Detail page, switching personas and back will return you to the same aircraft." },
    ],
    related: ["owner-gs-welcome"],
  },

  {
    id: "owner-gs-mobile",
    title: "Using myaircraft.us on Mobile",
    category: "Getting Started",
    persona: "owner",
    duration: "2 min",
    difficulty: "Beginner",
    tags: ["mobile", "responsive", "phone", "tablet", "hangar"],
    description: "myaircraft.us is fully responsive. Access your fleet dashboard, file squawks, review documents, and chat with the AI from your phone at the ramp or in the hangar.",
    sim: [
      {
        label: "Mobile view — compact navigation",
        content: (
          <div className="h-full bg-[#f8fafc] flex items-center justify-center p-3">
            <div className="w-28 bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
              <div className="h-6 bg-[#0A1628] flex items-center justify-between px-2">
                <div className="text-white text-[6px]" style={{ fontWeight: 700 }}>✈ myaircraft</div>
                <div className="w-3 h-3 bg-white/10 rounded" />
              </div>
              <div className="p-2 space-y-1">
                <MCard title="N12345" badge="✓" badgeColor="green" subtitle="Airworthy · 1 squawk" />
                <MCard title="N67890" badge="!" badgeColor="red" subtitle="AOG · 2 squawks" />
              </div>
              <div className="flex border-t border-gray-100">
                {["🏠", "✈️", "💬", "📄"].map((icon, i) => (
                  <div key={i} className={`flex-1 text-center py-1.5 text-[10px] ${i === 0 ? "text-blue-600" : "text-gray-400"}`}>{icon}</div>
                ))}
              </div>
            </div>
          </div>
        ),
      },
    ],
    steps: [
      { title: "Open myaircraft.us on your phone", content: "Navigate to myaircraft.us in your mobile browser (Chrome or Safari). The interface automatically adapts to your screen size." },
      { title: "Mobile navigation bar", content: "On mobile, the sidebar collapses into a bottom navigation bar with icons for: Dashboard, Aircraft, Ask/AI, Documents, and More (settings and other pages)." },
      { title: "File a squawk from your phone", content: "At the ramp, open Aircraft → your N-number → Squawks → tap '+ Report Squawk'. Describe the issue and submit. Your mechanic is notified immediately." },
      { title: "Best on tablet", content: "For the best mobile experience, a tablet (iPad) gives you the full desktop layout without any condensed navigation. Recommended for in-hangar use.", tip: "Save myaircraft.us to your phone's home screen: in Safari, tap Share → Add to Home Screen. This gives you a native app-like experience with full-screen launch." },
    ],
    related: ["owner-gs-welcome", "owner-aircraft-squawks"],
  },

  {
    id: "owner-logbook-view",
    title: "Viewing Your Aircraft's Logbook",
    category: "Aircraft Management",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["logbook", "history", "maintenance entries", "A&P", "signed"],
    description: "Every maintenance event logged by your A&P mechanic appears in your aircraft's Logbook tab. View the complete signed history, sorted by date, with AI-searchable entries.",
    sim: [
      {
        label: "Logbook tab — chronological maintenance history",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1">
                <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Logbook — N12345 (284 entries)</span>
                <THead cells={["Entry", "Date", "TTAF"]} />
                <TRow cells={["Annual Inspection", "Mar 2024", "3,847"]} highlighted />
                <TRow cells={["100-hr Inspection", "Sep 2023", "3,743"]} />
                <TRow cells={["Spark Plug Replacement", "Oct 2023", "3,790"]} />
                <TRow cells={["Oil Change", "Jan 2024", "3,820"]} />
              </div>
            }
            topLabel="Aircraft → N12345 → Logbook"
          />
        ),
      },
      {
        label: "Logbook entry detail — signed by A&P",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Annual Inspection — March 14, 2024" badge="Signed" badgeColor="green" highlighted>
                  <div className="space-y-0.5 mt-1">
                    <div className="text-[6px] text-gray-400">TTAF: <span style={{ fontWeight: 600 }}>3,847 hrs</span></div>
                    <div className="text-[6px] text-gray-400">Work: Annual inspection per FAR 43.15. Returned to service.</div>
                    <div className="text-[6px] text-gray-400">ADs: 4 complied, 0 open</div>
                    <SignaturePad signed={true} />
                  </div>
                </MCard>
              </div>
            }
            topLabel="Logbook Entry Detail — Signed"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Logbook tab", content: "On an aircraft detail page, click the 'Logbook' tab. You'll see every maintenance entry ever recorded for this aircraft, sorted newest first." },
      { title: "Read an entry", content: "Each logbook entry shows: date, TTAF (airframe hours), work performed, parts installed (part numbers), AD compliance noted, and the mechanic's digital signature and certificate number." },
      { title: "Search within logbook", content: "Use the search bar above the logbook list to find entries by keyword — 'oil filter', 'annual', 'spark plug'. Useful for pre-purchase due diligence or insurance inquiries." },
      { title: "Download or export", content: "Click 'Export Logbook' to download a PDF of the complete logbook history. This is useful for aircraft sales, insurance, or compliance audits." },
      { title: "Ask the AI about logbook entries", content: "Switch to Ask Your Aircraft and ask: 'Summarize all maintenance done on N12345 in 2024' — the AI reads through all logbook entries and gives you a structured summary with citations.", tip: "The logbook is read-only for owners. Only A&P mechanics can create or modify logbook entries through the Mechanic Portal." },
    ],
    related: ["owner-aircraft-detail", "owner-ai-ask", "owner-compliance-annual"],
  },

  {
    id: "owner-canary-generator",
    title: "Logbook Canary & Audit Trail Generator",
    category: "Documents",
    persona: "owner",
    duration: "4 min",
    difficulty: "Advanced",
    tags: ["canary", "audit", "logbook", "verification", "integrity", "tamper"],
    description: "The Logbook Canary feature generates a cryptographic hash of your complete logbook at a point in time. If any entry is later altered, the hash won't match — providing irrefutable proof of tampering.",
    sim: [
      {
        label: "Logbook Canary Generator",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Documents" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Logbook Canary Generator" badge="Pro Feature" badgeColor="violet" subtitle="Cryptographic logbook integrity verification">
                  <div className="text-[6px] text-gray-400 mt-0.5">Generate a tamper-evident hash of your complete logbook at this moment in time.</div>
                  <div className="mt-1.5"><PBtn label="Generate Canary Hash" /></div>
                </MCard>
              </div>
            }
            topLabel="Documents → Logbook Canary"
          />
        ),
      },
      {
        label: "Canary hash generated — store securely",
        content: (
          <MiniModal title="Logbook Canary — Generated">
            <div className="bg-gray-50 rounded border p-2">
              <div className="text-[6px] text-gray-400 mb-1" style={{ fontWeight: 600 }}>CANARY HASH (SHA-256)</div>
              <div className="font-mono text-[5.5px] text-gray-700 break-all">a3f8c2d4e5b1097f2a8c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a</div>
            </div>
            <div className="text-[6px] text-gray-500">Generated: Apr 12, 2026 · 14:32:07 UTC<br />Aircraft: N12345 · Entries: 284</div>
            <div className="flex gap-1">
              <PBtn label="Download Certificate" />
              <GBtn label="Email to Myself" />
            </div>
          </MiniModal>
        ),
      },
    ],
    steps: [
      { title: "Navigate to the Canary Generator", content: "Go to Documents → scroll to the bottom or search 'Canary' to find the Logbook Canary Generator section." },
      { title: "Select the aircraft", content: "Choose the aircraft whose logbook you want to canary. The generator reads all logbook entries for that N-number." },
      { title: "Generate the hash", content: "Click 'Generate Canary Hash'. The system creates a SHA-256 cryptographic hash of the complete logbook entry set at this exact moment in time. This takes 2–5 seconds." },
      { title: "Store the canary certificate", content: "Download the canary certificate PDF, which includes the hash, timestamp, aircraft details, and number of entries hashed. Store this securely — email it to yourself, save to cloud storage, or print it." },
      { title: "Verify integrity later", content: "To verify the logbook hasn't been altered, return to the Canary Generator, select 'Verify against previous canary', upload your certificate, and click Verify. If the logbook is unchanged, hashes match. Any alteration causes a mismatch.", tip: "Generate a canary at key moments: before and after an aircraft sale, before and after a major inspection, or annually as part of your recordkeeping practice." },
    ],
    related: ["owner-docs-overview", "owner-logbook-view"],
  },

  /* ────────────────────────────────────────────────────────────
     ADDITIONAL TUTORIALS
  ──────────────────────────────────────────────────────────── */
  {
    id: "owner-aircraft-hobbs",
    title: "Updating Hobbs Time & Aircraft Hours",
    category: "Aircraft Management",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["Hobbs", "hours", "TTAF", "SMOH", "time tracking"],
    description: "Keep your aircraft's time-in-service data current. Accurate Hobbs and TTAF data ensures correct AD compliance intervals and maintenance schedules.",
    sim: [
      {
        label: "Edit aircraft hours in the Overview",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>N12345 — Time & Hours</span>
                  <GBtn label="Edit Hours" />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <MCard title="Hobbs Time" subtitle="Total flight hours on meter" highlighted>
                    <HL><div className="mt-1 h-5 border border-blue-300 rounded text-[7px] px-1.5 flex items-center text-blue-700" style={{ fontWeight: 700 }}>4,012.3</div></HL>
                  </MCard>
                  <MCard title="TTAF" subtitle="Total Time Airframe">
                    <div className="mt-1 h-5 border border-gray-200 rounded text-[7px] px-1.5 flex items-center text-gray-700">3,847</div>
                  </MCard>
                </div>
              </div>
            }
            topLabel="Aircraft Detail → Edit Hours"
          />
        ),
      },
    ],
    steps: [
      { title: "Open aircraft detail and click Edit", content: "Navigate to your aircraft's detail page and click the 'Edit' button in the Overview section. This opens the aircraft data editor." },
      { title: "Update Hobbs time", content: "Enter the current Hobbs meter reading. This is the actual hours shown on the aircraft's Hobbs meter, to one decimal place (e.g., 4,012.3)." },
      { title: "Update TTAF and other hours", content: "Update TTAF (Total Time Airframe), SMOH (Since Major Overhaul), and SPOH (Since Prop Overhaul) as needed — typically after each annual inspection or major event." },
      { title: "Save and verify intervals", content: "Click Save. The system recalculates all time-based AD intervals and maintenance schedules automatically. Check the Compliance section to see if any new items are due." },
    ],
    related: ["owner-aircraft-detail", "owner-compliance-ads"],
  },

  {
    id: "owner-dash-spending",
    title: "Fleet Maintenance Spending Analytics",
    category: "Dashboard",
    persona: "owner",
    duration: "4 min",
    difficulty: "Intermediate",
    tags: ["spending", "analytics", "budget", "cost", "maintenance", "trend"],
    description: "Track and analyze your fleet's maintenance expenditures with the Dashboard spending charts. Identify cost trends, compare aircraft, and forecast upcoming maintenance budgets.",
    sim: [
      {
        label: "Spending trend — last 7 months",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Fleet Maintenance Spending">
                  <div className="flex items-end gap-1 mt-2 h-16">
                    {[28, 42, 31, 68, 52, 89, 74].map((v, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="text-[4.5px] text-gray-400">${v}k</div>
                        <div className="w-full rounded-t" style={{ height: `${(v / 89) * 48}px`, background: i === 5 ? "#ef4444" : "#2563EB", opacity: 0.6 + (i / 7) * 0.4 }} />
                        <span className="text-[5px] text-gray-400">{["O", "N", "D", "J", "F", "M", "A"][i]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[6px] text-gray-400 mt-1">
                    <span>YTD Total: $37,400</span>
                    <span className="text-red-500" style={{ fontWeight: 600 }}>Mar spike: alternator AOG</span>
                  </div>
                </MCard>
              </div>
            }
            topLabel="Dashboard — Spending Analytics"
          />
        ),
      },
      {
        label: "Per-aircraft cost breakdown",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Dashboard" />}
            main={
              <div className="space-y-1">
                <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Cost by Aircraft (YTD)</span>
                {[
                  { tail: "N67890", cost: "$18,420", pct: 100, color: "bg-red-400" },
                  { tail: "N12345", cost: "$12,380", pct: 67, color: "bg-blue-400" },
                  { tail: "N24680", cost: "$6,600", pct: 36, color: "bg-emerald-400" },
                ].map(a => (
                  <div key={a.tail} className="bg-white rounded px-2 py-1.5 border border-gray-100">
                    <div className="flex justify-between text-[7px] mb-0.5">
                      <span style={{ fontWeight: 600 }}>{a.tail}</span>
                      <span className="text-gray-500">{a.cost}</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full"><div className={`h-full rounded-full ${a.color}`} style={{ width: `${a.pct}%` }} /></div>
                  </div>
                ))}
              </div>
            }
            topLabel="Dashboard — Cost by Aircraft"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the spending chart on the Dashboard", content: "Scroll down on the Dashboard to find the maintenance spending section. The bar chart shows monthly spend for the last 7 months across your entire fleet." },
      { title: "Identify spending spikes", content: "Look for months with unusually high bars — hover over a bar to see the total spend and which aircraft drove the cost. AOG events (like engine or alternator failures) often cause major spikes." },
      { title: "Drill into per-aircraft costs", content: "Below the fleet chart, the 'Cost by Aircraft' section shows a horizontal bar for each aircraft with its YTD maintenance spend. This quickly identifies which aircraft is most expensive to maintain." },
      { title: "AI spending analysis", content: "For deeper analysis, use the AI Command Center: 'Analyze my maintenance spending trends and identify cost-reduction opportunities'. The AI will analyze your invoice history and make specific recommendations." },
      { title: "Budget forecasting", content: "Ask the AI: 'Forecast my maintenance budget for the next 6 months based on current aircraft status and historical data'. You'll get a month-by-month projection with confidence intervals.", tip: "If one aircraft consistently costs 3x more than others, it may be approaching a major overhaul interval or have a recurring issue that needs a deeper inspection." },
    ],
    related: ["owner-dash-overview", "owner-ai-command"],
  },

  {
    id: "owner-documents-logbook-canary",
    title: "Scanning & Digitizing Paper Logbooks",
    category: "Documents",
    persona: "owner",
    duration: "5 min",
    difficulty: "Intermediate",
    tags: ["scanning", "paper", "logbook", "digitize", "upload", "OCR"],
    description: "Have paper logbooks? Learn how to scan and upload them into myaircraft.us so the AI can read, index, and answer questions about your historical records.",
    sim: [
      {
        label: "Upload a scanned paper logbook",
        content: (
          <MiniModal title="Upload Paper Logbook Scan">
            <SelectField label="Aircraft" value="N12345 — Cessna 172S" />
            <SelectField label="Document Type" value="Airframe Logbook (Scanned)" />
            <UploadZone active={true} />
            <div className="text-[6px] text-gray-400 text-center">High-resolution scans work best · 300 DPI minimum</div>
            <PBtn label="Upload & Parse" className="w-full" />
          </MiniModal>
        ),
      },
      {
        label: "AI reads handwritten logbook entries",
        content: (
          <div className="h-full bg-[#f8fafc] flex items-center justify-center p-3">
            <div className="bg-white rounded-xl border border-blue-200 shadow-lg w-full p-3 space-y-2">
              <div className="text-[8px] text-blue-700" style={{ fontWeight: 700 }}>🤖 Processing Paper Logbook…</div>
              <div className="bg-blue-50 rounded p-2 space-y-1">
                <div className="text-[6px] text-blue-600">Reading 47 pages…</div>
                <div className="text-[6px] text-blue-600">Extracting 312 maintenance entries…</div>
                <div className="text-[6px] text-blue-600">Identifying handwriting patterns…</div>
                <div className="text-[6px] text-blue-600">Building searchable index…</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-[6px] text-emerald-700">
                ✓ Complete! 312 entries indexed · 89% confidence · Review flagged entries
              </div>
            </div>
          </div>
        ),
      },
    ],
    steps: [
      { title: "Scan your paper logbooks", content: "Use a flatbed scanner or a high-quality phone scanning app (CamScanner, Adobe Scan, Apple Notes) to digitize each page at 300 DPI or higher. Color scanning captures handwriting better than black-and-white." },
      { title: "Upload the scanned PDF", content: "Go to Documents → Upload Document. Select document type 'Airframe Logbook (Scanned)' or 'Engine Logbook (Scanned)'. Upload the complete PDF of all scanned pages." },
      { title: "AI reads and indexes entries", content: "The AI uses optical character recognition (OCR) and handwriting analysis to extract each maintenance entry: date, TTAF, work performed, part numbers, and mechanic signature." },
      { title: "Review flagged entries", content: "Entries the AI couldn't read with high confidence (faded ink, unusual handwriting) are flagged for your review. Click each flagged entry to manually verify or correct the extracted text." },
      { title: "Start querying historical records", content: "Once indexed, your complete maintenance history — including decades of paper records — becomes searchable by the Ask Your Aircraft AI.", tip: "If you have multiple logbooks (airframe, engine, propeller), upload each as a separate document and assign the correct type. This keeps the AI's responses accurate and properly categorized." },
    ],
    related: ["owner-docs-upload", "owner-ai-ask", "owner-logbook-view"],
  },

  {
    id: "owner-aircraft-delete",
    title: "Removing an Aircraft from Your Fleet",
    category: "Aircraft Management",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["remove", "delete", "aircraft", "sold", "fleet management"],
    description: "When you sell or dispose of an aircraft, remove it from your fleet to keep your dashboard accurate. Records are archived — not permanently deleted — and can be exported before removal.",
    sim: [
      {
        label: "Aircraft settings — remove aircraft option",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="N67890 — Piper PA-28" badge="AOG" badgeColor="red" subtitle="Hobbs 987.3 · KDAL">
                  <div className="flex gap-1 mt-1.5">
                    <GBtn label="⚙ Aircraft Settings" />
                    <GBtn label="Export Records" />
                  </div>
                </MCard>
                <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                  <div className="text-[7px] text-red-700" style={{ fontWeight: 700 }}>⚠️ Remove Aircraft</div>
                  <div className="text-[6px] text-red-500 mt-0.5">This will archive all records. You can export before removing.</div>
                  <div className="mt-1"><GBtn label="Remove N67890 from Fleet" className="text-red-600 border-red-200" /></div>
                </div>
              </div>
            }
            topLabel="Aircraft Settings — Remove"
          />
        ),
      },
    ],
    steps: [
      { title: "Export all records first", content: "Before removing an aircraft, click 'Export Records' to download a complete ZIP file of all documents, logbook entries, work orders, and invoices associated with the N-number. Give this to the new owner." },
      { title: "Revoke all mechanic access", content: "Go to the Mechanics tab and revoke all mechanic access for this aircraft. This protects the new owner's privacy and your records." },
      { title: "Open Aircraft Settings", content: "Click the three-dot menu or 'Aircraft Settings' button on the aircraft detail page." },
      { title: "Remove the aircraft", content: "Scroll to the 'Remove Aircraft' section. Click 'Remove from Fleet' and confirm. The aircraft is archived — not permanently deleted. Records are retained for 7 years per FAA recordkeeping requirements." },
      { title: "Records after removal", content: "Removed aircraft appear in 'Archived Aircraft' (accessible from Aircraft → Show Archived). You can still search their documents and view their records, but they no longer appear on the active Dashboard.", tip: "Never permanently delete aircraft records. FAA regulations require maintenance records to be kept for specific periods. Archiving keeps records available while removing them from your active view." },
    ],
    related: ["owner-aircraft-detail", "owner-mechanics-access"],
  },

  {
    id: "owner-ai-reports",
    title: "Generating AI Fleet Reports",
    category: "Ask & AI Command",
    persona: "owner",
    duration: "4 min",
    difficulty: "Intermediate",
    tags: ["reports", "AI", "export", "fleet", "PDF", "summary"],
    description: "Generate comprehensive fleet reports using AI — compliance summaries, maintenance histories, spending analyses, and pre-purchase due diligence packages — in PDF format in seconds.",
    sim: [
      {
        label: "AI command: generate fleet report",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Generate a full compliance and maintenance report for my fleet" />
                <TypingIndicator />
                <CBubble role="ai" text="Generating FLEET COMPLIANCE REPORT — Apr 2026... ✓ 3 aircraft · 284 total logbook entries · 12 ADs tracked · 2 upcoming inspections · Avg health 73% · Total YTD spend $37,400" />
                <div className="flex gap-1">
                  <PBtn label="📄 Download PDF" />
                  <GBtn label="📧 Email Report" />
                  <GBtn label="🔗 Share Link" />
                </div>
              </div>
            }
            topLabel="AI Command — Fleet Report Generation"
          />
        ),
      },
      {
        label: "Pre-purchase inspection package",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Ask / AI" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Create a pre-purchase due diligence package for N67890" />
                <CBubble role="ai" text="Pre-Purchase Package for N67890: Airframe logbook summary (342 entries), engine history (2 overhauls), all AD compliance records, squawk history, maintenance cost analysis, known issues. Package ready." />
                <PBtn label="Download Due Diligence Package (ZIP)" className="w-full" />
              </div>
            }
            topLabel="AI Command — Pre-Purchase Package"
          />
        ),
      },
    ],
    steps: [
      { title: "Open AI Command Center", content: "Go to Ask/AI → AI Command Center tab." },
      { title: "Request a fleet compliance report", content: "Type: 'Generate a full compliance and maintenance summary for my fleet'. The AI compiles data from all aircraft, squawks, ADs, and logbook entries into a structured report." },
      { title: "Create a pre-purchase package", content: "If selling an aircraft, type: 'Create a pre-purchase due diligence package for [N-number]'. This generates a comprehensive buyer's information package with complete maintenance history." },
      { title: "Export in multiple formats", content: "Reports can be downloaded as PDF, emailed directly, or shared via a time-limited secure link. The PDF includes the myaircraft.us report header with timestamp and data source citations." },
      { title: "Schedule regular reports", content: "In Settings → Notifications, enable 'Monthly fleet digest' to receive an auto-generated fleet status PDF on the first of every month — no manual report generation needed." },
    ],
    related: ["owner-ai-command", "owner-ai-ask", "owner-compliance-ads"],
  },

  {
    id: "owner-security-privacy",
    title: "Account Security & Privacy Settings",
    category: "Settings & Profile",
    persona: "owner",
    duration: "3 min",
    difficulty: "Beginner",
    tags: ["security", "privacy", "password", "2FA", "account"],
    description: "Secure your myaircraft.us account with strong passwords and two-factor authentication. Manage your privacy settings and control data sharing preferences.",
    sim: [
      {
        label: "Security settings — 2FA and password",
        content: (
          <SimApp
            sidebar={<OwnerSidebar active="Settings" />}
            main={
              <div className="space-y-1.5">
                <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Security</span>
                <MCard title="Two-Factor Authentication" badge="Recommended" badgeColor="blue" subtitle="Add a second layer of security">
                  <ToggleRow label="Enable 2FA (SMS or Authenticator)" on={false} />
                </MCard>
                <MCard title="Password" subtitle="Last changed 47 days ago">
                  <GBtn label="Change Password" className="mt-1" />
                </MCard>
                <MCard title="Active Sessions" subtitle="1 session active">
                  <GBtn label="Sign out all other sessions" className="mt-1" />
                </MCard>
              </div>
            }
            topLabel="Settings → Security"
          />
        ),
      },
    ],
    steps: [
      { title: "Open Settings → Security", content: "Navigate to Settings and click the Security tab." },
      { title: "Enable 2FA", content: "Strongly recommended. Click the 2FA toggle and follow the setup flow. You can use SMS text message codes or an authenticator app (Google Authenticator, Authy). Authenticator app is more secure." },
      { title: "Update your password", content: "Click 'Change Password' to update your login password. Use a strong, unique password of at least 12 characters — aviation records are sensitive data." },
      { title: "Review active sessions", content: "The 'Active Sessions' section shows all devices currently logged into your account. If you see an unfamiliar device, click 'Sign out all sessions' immediately and change your password." },
      { title: "Privacy settings", content: "In Settings → Privacy, control whether mechanics can see other mechanics' assignments on your aircraft, and whether your aircraft data contributes to anonymous fleet benchmarking." },
    ],
    related: ["owner-gs-profile", "owner-settings-billing"],
  },

];

/* ═══════════════════════════════════════════════════════════════
   MECHANIC TUTORIALS — Phase 2 (placeholder)
═══════════════════════════════════════════════════════════════ */
export const MECHANIC_TUTORIALS: Tutorial[] = [
  {
    id: "mech-placeholder",
    title: "Mechanic Tutorial Center — Coming Soon",
    category: "Getting Started",
    persona: "mechanic",
    duration: "1 min",
    difficulty: "Beginner",
    tags: ["coming soon"],
    description: "The Mechanic Tutorial Center is being built out in Phase 2. It will cover Work Orders, Invoices, Logbook Entry, Customers, Team Management, AI Workspace, and all Mechanic Portal workflows.",
    sim: [
      {
        label: "Mechanic Portal preview",
        content: (
          <SimApp
            sidebar={
              <>
                {["Dashboard", "Work Orders", "Invoices", "Logbook", "Customers", "Team"].map(i => (
                  <SNav key={i} label={i} active={i === "Dashboard"} />
                ))}
              </>
            }
            main={
              <div className="space-y-1.5">
                <div className="bg-[#0A1628] rounded-lg p-3 text-white text-center">
                  <div className="text-lg mb-1">🔧</div>
                  <div className="text-[9px]" style={{ fontWeight: 700 }}>Mechanic Portal</div>
                  <div className="text-[7px] text-white/60 mt-0.5">Tutorials coming in Phase 2</div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <MStatCard label="Work Orders" value="24" color="blue" />
                  <MStatCard label="Open Invoices" value="8" color="amber" />
                  <MStatCard label="Logbook Entries" value="156" color="green" />
                  <MStatCard label="Customers" value="12" color="violet" />
                </div>
              </div>
            }
            topLabel="Mechanic Portal — Overview"
          />
        ),
      },
    ],
    steps: [
      { title: "Mechanic tutorials are coming in Phase 2", content: "This section will be fully populated with tutorials covering every mechanic workflow: creating work orders, logging maintenance, issuing invoices, managing customers, and team coordination." },
    ],
  },
];
