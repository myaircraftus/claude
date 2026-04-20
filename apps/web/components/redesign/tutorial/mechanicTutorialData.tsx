/**
 * mechanicTutorialData.tsx
 * Comprehensive Mechanic Persona tutorial library for myaircraft.us
 * 46 tutorials across 11 categories
 */

import React from "react";
import type { Tutorial } from "./TutorialModal";
import {
  SimApp, SNav, SNavSub, SPersona, MStatCard, MCard, CBubble, TypingIndicator,
  FormField, SelectField, ToggleRow, THead, TRow, MBadge,
  PBtn, GBtn, HL, WFBar, MiniModal, UploadZone,
  HealthRingSim, TimelineItem, SignaturePad, FAACard, InvSummary,
  SourceChip,
} from "./simHelpers";

/* ═══════════════════════════════════════════════════════════════
   MECHANIC SIDEBAR HELPER
═══════════════════════════════════════════════════════════════ */
function MechanicSidebar({ active, sub }: { active: string; sub?: string }) {
  const items = [
    { label: "AI Command", sub: null },
    { label: "Dashboard", sub: null },
    { label: "Aircraft", sub: null },
    { label: "Squawks", sub: null },
    { label: "Estimates", sub: null },
    { label: "Work Orders", sub: null },
    { label: "Parts", sub: null },
    { label: "Invoices", sub: null },
    { label: "Logbook", sub: null },
    { label: "Customers", sub: null },
  ];
  return (
    <>
      <SPersona active="mechanic" />
      {items.map(i => (
        <SNav key={i.label} label={i.label} active={i.label === active} />
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MECHANIC TUTORIALS — 46 tutorials across 11 categories
═══════════════════════════════════════════════════════════════ */
export const MECHANIC_TUTORIALS: Tutorial[] = [

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Getting Started
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-gs-welcome",
    title: "Welcome to the Mechanic Portal",
    category: "Getting Started",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: true,
    tags: ["overview", "onboarding", "mechanic", "portal", "first steps"],
    description: "A complete orientation to the Mechanic Portal in myaircraft.us. Learn how the portal is structured, how permissions work, and how the AI-first workflow transforms how you manage maintenance from squawk to signed logbook entry.",
    sim: [
      {
        label: "Step 1 — Switch to Mechanic persona",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-2">
                <div className="bg-[#0A1628] rounded-lg p-3 text-white text-center">
                  <div className="text-lg mb-1">🔧</div>
                  <div className="text-[9px]" style={{ fontWeight: 700 }}>Mechanic Portal</div>
                  <div className="text-[7px] text-white/60 mt-0.5">A&P Maintenance Intelligence Platform</div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <MStatCard label="Work Orders" value="24" color="blue" />
                  <MStatCard label="Squawks" value="4" color="amber" />
                  <MStatCard label="Logbook" value="156" color="green" />
                  <MStatCard label="Customers" value="12" color="violet" />
                </div>
              </div>
            }
            topLabel="Mechanic Portal — Dashboard"
          />
        ),
      },
      {
        label: "Step 2 — The full Mechanic workflow chain",
        content: (
          <div className="h-full bg-[#f8fafc] flex items-center justify-center p-4">
            <div className="w-full max-w-xs">
              <div className="text-[8px] text-gray-500 mb-2 text-center" style={{ fontWeight: 700 }}>MECHANIC WORKFLOW</div>
              {[
                { label: "⚠️ Squawk (Issue Reported)", color: "bg-red-50", text: "text-red-800", border: "border-red-200" },
                { label: "📋 Estimate (Pricing & Scope)", color: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
                { label: "🔧 Work Order (Active Maintenance)", color: "bg-blue-50", text: "text-blue-800", border: "border-blue-200" },
                { label: "📄 Logbook Entry (FAA Sign-off)", color: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
                { label: "💵 Invoice (Billing & Payment)", color: "bg-violet-50", text: "text-violet-800", border: "border-violet-200" },
              ].map((row, i) => (
                <div key={i} className={`${row.color} ${row.text} border ${row.border} text-[7px] px-3 py-1.5 rounded-lg mb-1 shadow-sm`} style={{ fontWeight: 600, marginLeft: `${i * 6}px` }}>{row.label}</div>
              ))}
            </div>
          </div>
        ),
      },
      {
        label: "Step 3 — Mechanic Portal navigation overview",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1">
                {[
                  { nav: "AI Command", desc: "AI chat drives the entire workflow" },
                  { nav: "Squawks", desc: "Triage incoming maintenance issues" },
                  { nav: "Estimates", desc: "Price jobs and get owner approval" },
                  { nav: "Work Orders", desc: "Execute and track active jobs" },
                  { nav: "Logbook", desc: "FAA-compliant logbook entries" },
                  { nav: "Invoices", desc: "Bill customers from closed WOs" },
                  { nav: "Customers", desc: "Manage aircraft owners & records" },
                ].map(r => (
                  <div key={r.nav} className="flex items-center gap-2 bg-white rounded px-2 py-1 border border-gray-100">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                    <span className="text-[7px] text-gray-800" style={{ fontWeight: 600 }}>{r.nav}</span>
                    <span className="text-[6px] text-gray-400 flex-1 text-right">{r.desc}</span>
                  </div>
                ))}
              </div>
            }
            topLabel="Mechanic Portal — Navigation"
          />
        ),
      },
      {
        label: "Step 4 — Viewing As: role selector",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <div className="bg-white border border-gray-100 rounded-lg p-2">
                  <div className="text-[7px] text-gray-500 mb-1.5" style={{ fontWeight: 600 }}>VIEWING AS</div>
                  {[
                    { name: "Mike Torres", role: "Lead Mechanic / IA", active: true },
                    { name: "Dana Lee", role: "Mechanic", active: false },
                    { name: "Chris Park", role: "Apprentice", active: false },
                    { name: "Tom Baker", role: "Read Only", active: false },
                  ].map(m => (
                    <div key={m.name} className={`flex items-center gap-1.5 px-2 py-1 rounded ${m.active ? "bg-blue-50 border border-blue-200" : ""} mb-0.5`}>
                      <div className="w-5 h-5 rounded-full bg-[#2563EB] text-white text-[6px] flex items-center justify-center shrink-0" style={{ fontWeight: 700 }}>{m.name.split(" ").map(n => n[0]).join("")}</div>
                      <div>
                        <div className="text-[7px] text-gray-800" style={{ fontWeight: m.active ? 700 : 400 }}>{m.name}</div>
                        <div className="text-[5px] text-gray-400">{m.role}</div>
                      </div>
                      {m.active && <MBadge label="Active" color="blue" />}
                    </div>
                  ))}
                </div>
              </div>
            }
            topLabel="Mechanic Portal — Viewing As Selector"
          />
        ),
      },
    ],
    steps: [
      { title: "Switch to the Mechanic persona", content: "In the top of the left sidebar, you'll see a toggle with 'Owner' and 'Mechanic'. Click 'Mechanic' to enter the Mechanic Portal. Your navigation will immediately change to show the full mechanic workflow.", tip: "Your persona preference is saved automatically. You'll always return to the last-used persona." },
      { title: "Understand the workflow chain", content: "Everything in the Mechanic Portal follows this chain: Squawk → Estimate → Work Order → Logbook Entry → Invoice. You can enter the chain at any point, but the AI Command Center can drive the entire workflow from a single conversation." },
      { title: "Learn the navigation", content: "The portal has 10 sections: AI Command Center, Dashboard, Aircraft, Squawks, Estimates, Work Orders, Parts, Invoices, Logbook, and Customers. Your access to each section depends on the permissions assigned to your role by the Lead Mechanic or owner." },
      { title: "Use the 'Viewing As' selector", content: "If you manage a team, the 'Viewing As' dropdown (in the sidebar when Mechanic persona is active) lets you switch between team members to see their permission-restricted view. This is essential for managing what each mechanic can see and do." },
      { title: "Set up your profile", content: "Before creating work orders or logbook entries, go to Settings → Profile and enter your FAA Certificate Number, license type (A&P, A&P/IA), and digital signature. These are required for legally compliant logbook sign-offs." },
    ],
    related: ["mech-gs-profile", "mech-gs-permissions", "mech-ai-overview"],
  },

  {
    id: "mech-gs-profile",
    title: "Mechanic Profile & Certificate Setup",
    category: "Getting Started",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: true,
    tags: ["profile", "FAA certificate", "A&P", "IA", "digital signature", "settings"],
    description: "Configure your FAA certificate number, license type, labor rate, and digital signature. These fields are required for creating legally valid logbook entries and professional invoices.",
    sim: [
      {
        label: "Profile settings — FAA certificate required fields",
        content: (
          <MiniModal title="Mechanic Profile Settings">
            <FormField label="Full Name" value="Mike Torres" />
            <FormField label="FAA Certificate #" value="A&P-1234567" focused />
            <SelectField label="License Type" value="A&P / IA (Inspection Authorization)" />
            <FormField label="Labor Rate ($/hr)" value="$95.00" />
            <div className="pt-1"><PBtn label="Save Profile" /></div>
          </MiniModal>
        ),
      },
      {
        label: "Set up your digital signature for logbook entries",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-2">
                <MCard title="Digital Signature" subtitle="Required for logbook sign-offs">
                  <div className="mt-2">
                    <SignaturePad signed={false} />
                    <div className="text-[6px] text-gray-400 mt-1">Sign using mouse, touch, or stylus</div>
                  </div>
                </MCard>
                <div className="flex gap-1">
                  <PBtn label="Save Signature" />
                  <GBtn label="Clear" />
                </div>
              </div>
            }
            topLabel="Settings → Digital Signature"
          />
        ),
      },
      {
        label: "Specialty & certificate verification badge",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Mike Torres" badge="A&P/IA" badgeColor="blue" highlighted>
                  <div className="grid grid-cols-2 gap-1 mt-1.5">
                    <div className="text-[6px] text-gray-400">Certificate<div className="text-gray-700 text-[7px]" style={{ fontWeight: 600 }}>A&P-1234567</div></div>
                    <div className="text-[6px] text-gray-400">Specialty<div className="text-gray-700 text-[7px]" style={{ fontWeight: 600 }}>Powerplant, Avionics</div></div>
                    <div className="text-[6px] text-gray-400">Labor Rate<div className="text-gray-700 text-[7px]" style={{ fontWeight: 600 }}>$95/hr</div></div>
                    <div className="text-[6px] text-gray-400">Status<div className="text-emerald-600 text-[7px]" style={{ fontWeight: 600 }}>Active</div></div>
                  </div>
                </MCard>
                <SignaturePad signed={true} />
              </div>
            }
            topLabel="Settings → Profile Complete"
          />
        ),
      },
    ],
    steps: [
      { title: "Navigate to Settings → Profile", content: "Click 'Settings' at the bottom of the left sidebar, then click the 'Profile' tab. Fill in your full legal name exactly as it appears on your FAA certificate." },
      { title: "Enter your FAA Certificate Number", content: "Type your full FAA Airman Certificate number (e.g., A&P-1234567 or IA-9876543). This number appears on all logbook entries and is used to verify your authority to sign off maintenance." },
      { title: "Select your License Type", content: "Choose from: A&P/IA (Inspection Authorization — full privileges including annual inspections), A&P Mechanic (all repairs, no annuals), Student A&P (supervised work only), or None (read-only access)." },
      { title: "Set your labor rate", content: "Enter your hourly labor rate in dollars. This rate auto-populates when you add labor lines to work orders and estimates, saving time and ensuring consistent billing.", tip: "You can override the rate on individual line items if needed." },
      { title: "Create your digital signature", content: "In the Signature tab, use your mouse or touchscreen to draw your signature. This digital signature is cryptographically timestamped when applied to logbook entries, making them legally valid under FAA regulations." },
      { title: "Add your specialty", content: "In the 'Specialty' field, list your technical specialties (e.g., 'Powerplant, Avionics, Composite'). This helps when work orders are assigned to mechanics based on the type of work needed." },
    ],
    related: ["mech-gs-welcome", "mech-logbook-sign", "mech-gs-permissions"],
  },

  {
    id: "mech-gs-permissions",
    title: "Understanding Roles & Permissions",
    category: "Getting Started",
    persona: "mechanic",
    duration: "5 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["permissions", "roles", "team", "access control", "Lead IA", "apprentice"],
    description: "myaircraft.us has a granular permission system that controls what each team member can see and do. Learn the four role tiers and how to customize individual permissions for your shop.",
    sim: [
      {
        label: "Four role tiers and their default permissions",
        content: (
          <div className="h-full bg-[#f8fafc] p-3">
            <div className="text-[7px] text-gray-700 mb-2" style={{ fontWeight: 700 }}>Role Permission Matrix</div>
            <THead cells={["Role", "AI Cmd", "WO", "Invoice", "Logbook"]} />
            {[
              { role: "Lead / IA", ai: "✓", wo: "✓", inv: "✓", log: "✓", color: "blue" },
              { role: "Mechanic", ai: "—", wo: "✓", inv: "—", log: "—", color: "green" },
              { role: "Apprentice", ai: "—", wo: "✓", inv: "—", log: "—", color: "amber" },
              { role: "Read Only", ai: "—", wo: "—", inv: "—", log: "✓", color: "gray" },
            ].map(r => (
              <TRow key={r.role} cells={[r.role, r.ai, r.wo, r.inv, r.log]} />
            ))}
          </div>
        ),
      },
      {
        label: "Customizing individual permissions",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="bg-white rounded-lg border border-gray-100 p-2">
                <div className="text-[7px] text-gray-700 mb-1.5" style={{ fontWeight: 700 }}>Dana Lee — Mechanic Permissions</div>
                <ToggleRow label="AI Command Center" on={false} />
                <ToggleRow label="View Squawks" on={true} />
                <ToggleRow label="Create Estimates" on={false} />
                <HL>
                  <ToggleRow label="Edit Work Orders" on={true} />
                </HL>
                <ToggleRow label="Create Invoices" on={false} />
                <ToggleRow label="Sign Logbook Entries" on={false} />
              </div>
            }
            topLabel="Settings → Team → Dana Lee Permissions"
          />
        ),
      },
    ],
    steps: [
      { title: "Navigate to Settings → Team", content: "Go to Settings and click the 'Team' tab to see all team members and their current roles. Only the Lead Mechanic/IA or account owner can modify permissions." },
      { title: "Understand the four role tiers", content: "Lead Mechanic/IA has full access to all features. Mechanic can see and edit work orders but not invoices or AI tools. Apprentice can edit work orders under supervision. Read Only can view logbook entries only. These are starting presets — each can be customized." },
      { title: "Customize individual permissions", content: "Click any team member's name, then click 'Edit Permissions'. Toggle individual features on or off. Changes take effect immediately — the team member's portal updates instantly.", tip: "If you toggle a permission off that was enabled by their role, the role label updates to 'Custom'." },
      { title: "AI Command Center permission", content: "Only enable AI Command Center for mechanics who should drive the full workflow autonomously. For apprentices, keep it off so they work within assigned tasks only." },
      { title: "Invoice permission", content: "The Invoice permission allows a mechanic to create invoices from closed work orders and send them to customers. This should typically be restricted to Lead mechanics or billing staff only." },
      { title: "Logbook sign-off permission", content: "Only mechanics with a valid A&P/IA certificate should have the logbook sign-off permission. The system validates the FAA certificate type before allowing a signature to be applied." },
    ],
    related: ["mech-gs-welcome", "mech-team-manage", "mech-team-invite"],
  },

  {
    id: "mech-gs-dashboard",
    title: "Mechanic Dashboard Walkthrough",
    category: "Getting Started",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["dashboard", "overview", "stats", "work orders", "daily workflow"],
    description: "The Mechanic Dashboard gives you a bird's-eye view of your shop: open work orders, pending estimates, invoices awaiting approval, and recent logbook activity — all in one command view.",
    sim: [
      {
        label: "Dashboard KPI row — shop-wide metrics",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-1">
                  <MStatCard label="Open WOs" value="8" color="blue" />
                  <MStatCard label="Estimates" value="3" color="amber" />
                  <MStatCard label="Invoices Due" value="2" color="red" />
                  <MStatCard label="Logbook" value="156" color="green" />
                </div>
                <MCard title="Today's Priority" badge="3 Items" badgeColor="red">
                  <div className="space-y-1 mt-1">
                    <TimelineItem text="WO-2026-0047 — Brake R&R due today" time="N67890" color="red" />
                    <TimelineItem text="EST-2026-0018 — Awaiting owner approval" time="N24680" color="amber" />
                    <TimelineItem text="INV-2026-0025 — Payment overdue 5 days" time="N12345" color="violet" />
                  </div>
                </MCard>
              </div>
            }
            topLabel="Mechanic Dashboard — Overview"
          />
        ),
      },
      {
        label: "Work orders by status — pipeline view",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <div className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Work Order Pipeline</div>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { status: "Draft", count: 2, color: "gray" },
                    { status: "In Progress", count: 5, color: "blue" },
                    { status: "Awaiting Parts", count: 1, color: "amber" },
                    { status: "Ready Sign-off", count: 2, color: "green" },
                  ].map(s => (
                    <div key={s.status} className="bg-white border border-gray-100 rounded-lg p-1.5 text-center shadow-sm">
                      <div className="text-[11px] text-gray-800" style={{ fontWeight: 800 }}>{s.count}</div>
                      <div className="text-[5px] text-gray-400 leading-tight">{s.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            }
            topLabel="Mechanic Dashboard — Pipeline"
          />
        ),
      },
      {
        label: "Recent activity and quick actions",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Recent Activity">
                  <div className="space-y-1 mt-1">
                    <TimelineItem text="Logbook entry signed — N12345 oil change" time="1 hr ago" color="green" />
                    <TimelineItem text="New squawk: N67890 alternator failure" time="3 hrs ago" color="red" />
                    <TimelineItem text="Invoice #2047 sent to John Mitchell" time="Yesterday" color="violet" />
                  </div>
                </MCard>
                <div className="grid grid-cols-2 gap-1">
                  <PBtn label="+ New Work Order" className="w-full" />
                  <PBtn label="AI Command" className="w-full" />
                </div>
              </div>
            }
            topLabel="Mechanic Dashboard — Activity & Quick Actions"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Mechanic Dashboard", content: "Switch to Mechanic persona and click 'Dashboard' in the left sidebar. This is your daily starting point — a real-time snapshot of everything that needs your attention." },
      { title: "Read the KPI row", content: "The top row shows: Open Work Orders, Pending Estimates, Invoices Due, and total Logbook entries. Red numbers need immediate action." },
      { title: "Check Today's Priority list", content: "The priority panel highlights the 3 most urgent items across your shop. Each item has an action suggestion and links directly to the relevant work order, estimate, or invoice." },
      { title: "Review the pipeline view", content: "The Work Order pipeline shows how many WOs are in each status: Draft, Open, In Progress, Awaiting Parts, Ready for Sign-off, Closed. This helps you see bottlenecks at a glance." },
      { title: "Use quick actions", content: "The 'New Work Order' and 'AI Command' buttons at the bottom of the dashboard give you instant access to the most common daily tasks without navigating menus." },
    ],
    related: ["mech-gs-welcome", "mech-wo-create", "mech-ai-overview"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: AI Command Center
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-ai-overview",
    title: "AI Command Center: Complete Overview",
    category: "AI Command Center",
    persona: "mechanic",
    duration: "6 min",
    difficulty: "Intermediate",
    pinned: true,
    tags: ["AI", "command center", "chat", "workflow", "automation", "logbook", "work order"],
    description: "The AI Command Center is the most powerful tool in the Mechanic Portal. It uses natural language to drive the entire maintenance workflow — creating work orders, generating logbook entries, looking up parts, and building invoices through conversation.",
    sim: [
      {
        label: "The AI chat + live artifact workspace split screen",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="flex gap-1.5 h-full">
                <div className="flex-1 flex flex-col gap-1">
                  <div className="text-[7px] text-gray-600 mb-0.5" style={{ fontWeight: 600 }}>AI Chat</div>
                  <CBubble role="user" text="Create a work order for N67890 alternator replacement" />
                  <CBubble role="ai" text="Creating WO for N67890: Alternator R&R. Labor: 4.0 hrs @ $95/hr. Parts lookup in progress..." />
                  <TypingIndicator />
                </div>
                <div className="w-20 flex flex-col gap-1">
                  <div className="text-[7px] text-gray-600 mb-0.5" style={{ fontWeight: 600 }}>Live Artifact</div>
                  <MCard title="WO-2026-0052" badge="Draft" badgeColor="gray">
                    <div className="text-[6px] text-gray-400 mt-0.5">N67890 · Alternator R&R</div>
                  </MCard>
                </div>
              </div>
            }
            topLabel="AI Command Center — Chat + Artifact Split"
          />
        ),
      },
      {
        label: "Artifact types generated by AI",
        content: (
          <div className="h-full bg-[#f8fafc] p-3 space-y-1.5">
            <div className="text-[7px] text-gray-700 mb-1" style={{ fontWeight: 700 }}>AI-Generated Artifacts</div>
            {[
              { type: "Work Order", icon: "🔧", desc: "Full WO with labor, parts, notes" },
              { type: "Logbook Entry", icon: "📝", desc: "FAA-format entry ready for signature" },
              { type: "Invoice", icon: "💵", desc: "Itemized billing from closed WO" },
              { type: "Parts Lookup", icon: "🔩", desc: "Cross-referenced parts with pricing" },
              { type: "Estimate", icon: "📋", desc: "Priced scope of work for approval" },
            ].map(a => (
              <div key={a.type} className="flex items-center gap-2 bg-white rounded px-2 py-1 border border-gray-100 shadow-sm">
                <span className="text-[10px]">{a.icon}</span>
                <span className="text-[7px] text-gray-800" style={{ fontWeight: 600 }}>{a.type}</span>
                <span className="text-[6px] text-gray-400 flex-1 text-right">{a.desc}</span>
              </div>
            ))}
          </div>
        ),
      },
      {
        label: "Natural language intent examples",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1">
                {[
                  "Create WO for N12345 100-hr inspection",
                  "Log oil change on N67890 — 6 quarts AeroShell",
                  "Generate invoice for WO-2026-0047",
                  "Find alternator for Piper PA-28-181",
                  "What parts are needed for brake R&R?",
                  "Close WO-2026-0047 and sign logbook",
                ].map((cmd, i) => (
                  <div key={i} className="bg-[#0A1628] text-white/80 text-[6px] px-2 py-1 rounded font-mono">› {cmd}</div>
                ))}
              </div>
            }
            topLabel="AI Command — Example Commands"
          />
        ),
      },
      {
        label: "Confirm flow before executing actions",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1.5">
                <CBubble role="ai" text="I'll create WO-2026-0052 for N67890 with: Alternator R&R (4.0 hrs @ $95), Part #LW-12041 Alternator ($480), Total: ~$860. Confirm?" />
                <div className="flex gap-1 mt-1">
                  <HL><PBtn label="✓ Confirm — Create WO" /></HL>
                  <GBtn label="✕ Decline" />
                </div>
              </div>
            }
            topLabel="AI Command — Confirm Before Execute"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the AI Command Center", content: "Click 'AI Command' at the top of the left sidebar in the Mechanic Portal. The screen splits into two panels: the chat thread on the left and a live artifact preview on the right.", tip: "This feature requires the 'AI Command Center' permission to be enabled for your role." },
      { title: "Understand the split-screen layout", content: "The left panel is your conversational interface — type commands in plain English. The right panel shows the live artifact being built: a work order form, logbook entry, invoice, or parts list that updates in real-time as the AI processes your input." },
      { title: "Learn the command intents", content: "The AI understands these core intents: Create Work Order, Log Maintenance, Generate Invoice, Estimate Job, Look Up Parts, Close Work Order, and Query Records. You can mix natural language — it doesn't require specific syntax." },
      { title: "Always review the Confirm step", content: "Before any action is executed (creating a WO, signing a logbook entry, sending an invoice), the AI shows a confirmation card listing exactly what it will do. Review carefully, then Confirm or Decline.", tip: "The Confirm step is your safety net — never skip it. Once confirmed, actions create real records." },
      { title: "Use the context chips", content: "Once you mention an aircraft (e.g., N67890), a context chip appears at the top of the input bar. All subsequent commands automatically apply to that aircraft unless you specify otherwise." },
      { title: "Build complex records in one conversation", content: "You can create a complete work order, then immediately say 'add a logbook entry for this WO' and then 'generate the invoice' — all within the same conversation. The AI maintains context throughout." },
    ],
    related: ["mech-ai-workorder", "mech-ai-logbook", "mech-ai-invoice"],
  },

  {
    id: "mech-ai-workorder",
    title: "Creating Work Orders via AI Chat",
    category: "AI Command Center",
    persona: "mechanic",
    duration: "5 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["AI", "work order", "create", "chat", "labor", "parts"],
    description: "Use natural language commands to create fully populated work orders. The AI builds the WO form in real-time — adding labor lines, parts, and notes from your conversation — dramatically faster than manual entry.",
    sim: [
      {
        label: "Dictate the job to AI",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Open a work order on N12345 for the 100-hour inspection. Add 6 hours labor at my rate. It's for John Mitchell." />
                <CBubble role="ai" text="Got it. Creating WO for N12345 (Cessna 172S) — 100-hour inspection for John Mitchell. Adding 6.0 hrs @ $95/hr = $570 labor. Building the form now..." />
                <TypingIndicator />
              </div>
            }
            topLabel="AI Command — Work Order Creation"
          />
        ),
      },
      {
        label: "Live WO form being built in right panel",
        content: (
          <div className="h-full flex gap-1.5 bg-[#f8fafc] p-2">
            <div className="flex-1 flex flex-col gap-1">
              <CBubble role="ai" text="WO draft ready. I've added the 100-hr inspection labor line. Want to add parts or notes?" />
              <CBubble role="user" text="Add oil filter, 6 qts AeroShell 100+. Note: mag timing checked OK." />
            </div>
            <div className="w-28 bg-white rounded-lg border border-gray-100 p-1.5 shadow-sm overflow-hidden">
              <div className="text-[7px] text-gray-700 mb-1" style={{ fontWeight: 700 }}>WO-2026-0053 Draft</div>
              <div className="text-[6px] text-gray-600">N12345 · C172S</div>
              <div className="text-[6px] text-gray-600">Customer: J. Mitchell</div>
              <div className="mt-1 border-t border-gray-50 pt-0.5">
                <div className="text-[5px] text-gray-400">LABOR</div>
                <div className="text-[6px] text-gray-700">100-hr Insp · 6hr · $570</div>
              </div>
              <div className="mt-0.5">
                <div className="text-[5px] text-gray-400">PARTS</div>
                <div className="text-[6px] text-blue-600">Adding…</div>
              </div>
            </div>
          </div>
        ),
      },
      {
        label: "Confirm and save the work order",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1.5">
                <CBubble role="ai" text="WO-2026-0053 ready: 100-hr inspection, 6.0 hrs labor ($570), oil filter P/N CH48108-1 ($12.50), 6 qt AeroShell 100+ ($54). Note: mag timing OK. Total: $636.50. Confirm to save?" />
                <div className="flex gap-1">
                  <HL><PBtn label="✓ Save Work Order" /></HL>
                  <GBtn label="Edit First" />
                  <GBtn label="Discard" />
                </div>
              </div>
            }
            topLabel="AI Command — Confirm WO"
          />
        ),
      },
      {
        label: "Work order saved — open in Mechanic Portal",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <HL>
                  <MCard title="WO-2026-0053 — 100-Hr Inspection" badge="Open" badgeColor="blue" highlighted subtitle="N12345 · Cessna 172S · John Mitchell">
                    <div className="flex gap-1 mt-1">
                      <MBadge label="$636.50" color="green" />
                      <MBadge label="0% Complete" color="gray" />
                      <MBadge label="Mike Torres" color="blue" />
                    </div>
                  </MCard>
                </HL>
              </div>
            }
            topLabel="Work Orders — WO Created via AI"
          />
        ),
      },
    ],
    steps: [
      { title: "Open AI Command Center and describe the job", content: "In the AI Command Center, type a description of the work order in plain English. Include: aircraft N-number, job description, mechanic name (if not yourself), and customer name. Example: 'Open a WO for N12345 100-hour inspection for John Mitchell.'" },
      { title: "AI builds the form in real-time", content: "Watch the right panel as the AI populates the work order form. It auto-fills aircraft details, customer info (if in your customer list), and creates the initial labor line using your profile rate." },
      { title: "Add labor and parts via conversation", content: "Continue in the chat: 'Add 2 hours for magneto inspection' or 'Add Champion oil filter P/N CH48108'. Each addition updates the WO in the right panel instantly. You can add multiple labor lines, parts, and outside services." },
      { title: "Review and confirm", content: "The AI shows a summary card with all line items and the total. Review carefully. If anything is wrong, say 'change the labor hours to 7' or 'remove the oil filter' before confirming.", tip: "You can say 'show me the work order' at any point to see the full current state of the WO." },
      { title: "Open and edit manually if needed", content: "After the AI creates the WO, it appears in Work Orders with 'Open' status. You can open it directly and edit any field manually. AI-created WOs are identical to manually created ones — just faster." },
    ],
    related: ["mech-ai-overview", "mech-wo-create", "mech-wo-lineitems"],
  },

  {
    id: "mech-ai-logbook",
    title: "AI-Assisted Logbook Entry Creation",
    category: "AI Command Center",
    persona: "mechanic",
    duration: "5 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["AI", "logbook", "FAA", "sign-off", "maintenance entry", "chat"],
    description: "Dictate maintenance actions to the AI and it generates a properly formatted FAA logbook entry — complete with the correct maintenance verbiage, regulatory references, and your digital signature block.",
    sim: [
      {
        label: "Dictate the maintenance performed",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Log an oil change on N12345. Changed 6 quarts AeroShell W100 Plus. Replaced Champion oil filter CH48108-1. Checked sump plug, no metal. Hobbs 4012.4." />
                <CBubble role="ai" text="Generating FAA logbook entry for N12345 oil service. Formatting to FAR 43 Appendix E standards. Adding your certificate and signature block..." />
              </div>
            }
            topLabel="AI Command — Logbook Dictation"
          />
        ),
      },
      {
        label: "FAA-formatted logbook entry preview",
        content: (
          <div className="h-full bg-[#f8fafc] p-2 flex flex-col gap-1.5">
            <div className="bg-white rounded-lg border border-gray-100 p-2 shadow-sm">
              <div className="text-[7px] text-gray-700 mb-1" style={{ fontWeight: 700 }}>Logbook Entry — N12345 (Cessna 172S)</div>
              <div className="text-[6px] text-gray-600 leading-relaxed">
                April 12, 2026 — Aircraft total time: 4012.4 hrs. Performed engine oil and filter change IAW Cessna MM Chapter 12. Drained and refilled with 6 quarts AeroShell W100 Plus. Replaced Champion oil filter P/N CH48108-1. Inspected oil sump plug — no metal contamination found. Aircraft returned to service.
              </div>
              <div className="mt-1.5 border-t border-gray-100 pt-1.5">
                <SignaturePad signed={true} />
                <div className="text-[5px] text-gray-400 mt-0.5">Certificate: A&P-1234567 · Mike Torres · April 12, 2026</div>
              </div>
            </div>
          </div>
        ),
      },
      {
        label: "Review and apply digital signature",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1.5">
                <CBubble role="ai" text="Logbook entry generated to FAA standards. Review the entry above. Click 'Sign & Save' to apply your digital signature and add to the official record." />
                <div className="flex gap-1">
                  <HL><PBtn label="✍️ Sign & Save Entry" /></HL>
                  <GBtn label="Edit Entry" />
                  <GBtn label="Discard" />
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 text-[6px] text-amber-700">⚠️ Once signed, this entry cannot be deleted — only archived.</div>
              </div>
            }
            topLabel="AI Command — Sign Logbook Entry"
          />
        ),
      },
    ],
    steps: [
      { title: "Describe the maintenance performed", content: "In the AI Command Center, describe what you did in plain language. Include: aircraft tail number, what was performed, any parts used with part numbers if known, current Hobbs/tach time, and any findings." },
      { title: "AI formats to FAA standards", content: "The AI automatically formats the entry to comply with FAR 43 Appendix E requirements: proper maintenance description, regulatory references, part numbers, and required return-to-service statement." },
      { title: "Review the generated entry", content: "The right panel shows the complete logbook entry. Read it carefully. The AI may ask clarifying questions if information is missing (e.g., 'What is the current total time airframe?')." },
      { title: "Edit if needed", content: "Click 'Edit Entry' to manually adjust any text. Common edits: adding a specific AD number reference, adding a component serial number, or adjusting the maintenance description for precision.", tip: "The AI uses conservative, legally compliant language. If you need to add more specific technical detail, click Edit Entry." },
      { title: "Sign and save", content: "Click 'Sign & Save Entry' to apply your digital signature with cryptographic timestamp. The entry is permanently recorded and cannot be deleted — only archived. It immediately appears in the aircraft's logbook history." },
      { title: "Link to a work order (optional)", content: "If this logbook entry is associated with an open work order, the AI will ask 'Link this to WO-XXXX?' Linking connects them for complete maintenance history traceability." },
    ],
    related: ["mech-ai-overview", "mech-logbook-create", "mech-logbook-sign"],
  },

  {
    id: "mech-ai-invoice",
    title: "Generating Invoices from AI Chat",
    category: "AI Command Center",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["AI", "invoice", "billing", "payment", "chat", "work order"],
    description: "Command the AI to generate professional invoices directly from closed work orders. The AI pulls all labor, parts, and outside services into a formatted invoice and can email it to the customer in seconds.",
    sim: [
      {
        label: "Request invoice from closed WO",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Generate invoice for WO-2026-0047 and send to John Mitchell" />
                <CBubble role="ai" text="WO-2026-0047 is closed. Pulling labor lines (3 items), parts (2 items), outside services (1). Building invoice INV-2026-0028 for John Mitchell..." />
                <TypingIndicator />
              </div>
            }
            topLabel="AI Command — Invoice Generation"
          />
        ),
      },
      {
        label: "Invoice preview in right artifact panel",
        content: (
          <div className="h-full bg-[#f8fafc] p-2">
            <div className="bg-white rounded-lg border border-gray-100 p-2 shadow-sm">
              <div className="flex justify-between items-start mb-1.5">
                <div>
                  <div className="text-[8px] text-gray-800" style={{ fontWeight: 700 }}>INVOICE INV-2026-0028</div>
                  <div className="text-[6px] text-gray-400">Blue Canyon Aviation · April 12, 2026</div>
                </div>
                <MBadge label="Draft" color="gray" />
              </div>
              <div className="text-[7px] text-gray-600 mb-1.5">Bill To: John Mitchell — N67890 Brake Assembly R&R</div>
              <THead cells={["Description", "Qty", "Total"]} />
              <TRow cells={["Brake R&R Labor · 3.5 hrs", "1", "$332.50"]} />
              <TRow cells={["Brake Assy P/N 10-47260", "1", "$184.00"]} />
              <TRow cells={["Brake Fluid MIL-H-5606", "1", "$12.00"]} />
              <InvSummary subtotal="$528.50" tax="$39.64" total="$568.14" />
            </div>
          </div>
        ),
      },
      {
        label: "Send invoice to customer",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1.5">
                <CBubble role="ai" text="Invoice INV-2026-0028 ready: $568.14 total. Email to john@mitchellaviation.com? The email will include a PDF attachment and a payment link." />
                <div className="flex gap-1">
                  <HL><PBtn label="📧 Send Invoice" /></HL>
                  <GBtn label="Download PDF" />
                  <GBtn label="Edit First" />
                </div>
              </div>
            }
            topLabel="AI Command — Send Invoice"
          />
        ),
      },
    ],
    steps: [
      { title: "Ensure the work order is closed", content: "Invoices can only be generated from Work Orders with 'Closed' or 'Ready for Signoff' status. If the WO is still open, the AI will warn you and offer to close it first." },
      { title: "Command the AI to generate the invoice", content: "Type: 'Generate invoice for WO-XXXX' or 'Create invoice for the brake job on N67890'. The AI looks up the WO, pulls all line items, and builds the invoice." },
      { title: "Review the invoice preview", content: "The right panel shows the complete invoice with all labor, parts, and outside services listed with quantities and totals. A subtotal, tax calculation, and grand total are shown at the bottom." },
      { title: "Adjust if needed", content: "If any line items need adjustment, say 'remove the outside service line' or 'change the labor hours to 4' and the AI will update the invoice. You can also click 'Edit First' to manually adjust." },
      { title: "Send the invoice", content: "Click 'Send Invoice' to email the invoice to the customer. The email includes a PDF attachment and a payment link. The invoice status changes to 'Sent' automatically.", tip: "You can also download the PDF to print or send separately, or copy the invoice link to share via any channel." },
    ],
    related: ["mech-ai-overview", "mech-invoice-create", "mech-invoice-send"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Squawks Management
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-squawk-overview",
    title: "Squawks: Triaging Maintenance Issues",
    category: "Squawks",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: true,
    tags: ["squawks", "triage", "severity", "aircraft issues", "maintenance"],
    description: "Squawks are the starting point of every maintenance event. Learn how to receive, review, and triage squawks by severity — and how to convert them into estimates and work orders efficiently.",
    sim: [
      {
        label: "Squawks list — sorted by severity",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Squawks" />}
            main={
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Open Squawks (4)</span>
                  <PBtn label="+ New Squawk" />
                </div>
                {[
                  { tail: "N67890", title: "Alternator failure — aircraft AOG", sev: "HIGH", color: "red" },
                  { tail: "N12345", title: "Sticking left brake pedal", sev: "MED", color: "amber" },
                  { tail: "N24680", title: "Right nav light inoperative", sev: "MED", color: "amber" },
                  { tail: "N12345", title: "Pilot door seal leaking slightly", sev: "LOW", color: "blue" },
                ].map(s => (
                  <div key={s.title} className="bg-white rounded-lg border border-gray-100 p-2 flex items-center gap-2 shadow-sm">
                    <MBadge label={s.sev} color={s.color as "red" | "amber" | "blue"} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[7px] text-gray-800 truncate" style={{ fontWeight: 600 }}>{s.title}</div>
                      <div className="text-[6px] text-gray-400">{s.tail}</div>
                    </div>
                    <GBtn label="→ Estimate" />
                  </div>
                ))}
              </div>
            }
            topLabel="Squawks — Open Issues"
          />
        ),
      },
      {
        label: "Squawk detail — full information",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Squawks" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Alternator Failure — N67890" badge="HIGH" badgeColor="red" highlighted>
                  <div className="space-y-1 mt-1.5">
                    <div className="text-[6px] text-gray-600">Aircraft: N67890 (Piper PA-28-181) · AOG</div>
                    <div className="text-[6px] text-gray-600">Reported: John Mitchell · April 10, 2026</div>
                    <div className="text-[6px] text-gray-600">Description: Alternator failed in flight. Battery voltage dropped to 23V. Landed safely. Aircraft grounded pending alternator replacement.</div>
                  </div>
                </MCard>
                <div className="flex gap-1">
                  <PBtn label="Create Estimate" />
                  <PBtn label="Open WO Direct" />
                  <GBtn label="Assign Mechanic" />
                </div>
              </div>
            }
            topLabel="Squawk Detail — N67890 Alternator"
          />
        ),
      },
      {
        label: "Squawk → Estimate conversion",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Estimates" />}
            main={
              <div className="space-y-1.5">
                <WFBar steps={["Squawk", "Estimate", "WO", "Logbook", "Invoice"]} activeIdx={1} />
                <MCard title="EST-2026-0018 — Draft" badge="From Squawk" badgeColor="blue" subtitle="N67890 · Alternator R&R">
                  <div className="space-y-0.5 mt-1">
                    <div className="flex justify-between text-[6px] text-gray-600"><span>Alternator P/N LW-12041</span><span>$480.00</span></div>
                    <div className="flex justify-between text-[6px] text-gray-600"><span>Labor — 4.0 hrs</span><span>$380.00</span></div>
                    <div className="flex justify-between text-[7px] text-gray-800 border-t border-gray-100 pt-0.5 mt-0.5" style={{ fontWeight: 700 }}><span>Total</span><span>$860.00</span></div>
                  </div>
                </MCard>
                <PBtn label="Send to Owner for Approval" className="w-full" />
              </div>
            }
            topLabel="Estimate — Created from Squawk"
          />
        ),
      },
    ],
    steps: [
      { title: "Access the Squawks tab", content: "In the Mechanic Portal, click 'Squawks' in the left sidebar. You'll see all open squawks sorted by severity: HIGH (red), MEDIUM (amber), LOW (blue). HIGH squawks indicate AOG or safety-critical issues." },
      { title: "Open a squawk for detail", content: "Click any squawk to see the full details: aircraft information, owner's description, severity, date reported, and any photos or documents the owner attached. This is your briefing before assigning work." },
      { title: "Assign a mechanic", content: "Click 'Assign Mechanic' to route the squawk to the appropriate technician based on their specialty and current workload. The assigned mechanic receives a notification." },
      { title: "Create an estimate from the squawk", content: "Click 'Create Estimate' to open a new estimate pre-filled with the squawk details. Add labor hours, parts, and outside services, then send to the owner for approval. The estimate is linked to the squawk automatically.", tip: "Use 'Open WO Direct' only for pre-approved work or emergency AOG situations where you know the owner will approve." },
      { title: "Update squawk status", content: "As work progresses, update the squawk status from 'Open' to 'Estimate Sent', 'Scheduled', 'In Progress', or 'Resolved'. The aircraft owner sees these status updates in real-time." },
      { title: "Close resolved squawks", content: "Once the work order is complete and the logbook entry signed, close the squawk. Closed squawks contribute positively to the aircraft's health score." },
    ],
    related: ["mech-estimate-create", "mech-wo-create", "mech-squawk-add"],
  },

  {
    id: "mech-squawk-add",
    title: "Adding & Documenting Squawks",
    category: "Squawks",
    persona: "mechanic",
    duration: "3 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["squawk", "add", "document", "photo", "severity", "finding"],
    description: "When you find a new discrepancy during inspection or maintenance, add it as a squawk with full documentation — severity rating, description, photos, and aircraft data — so the owner can be informed and action can be tracked.",
    sim: [
      {
        label: "New squawk form",
        content: (
          <MiniModal title="Add New Squawk">
            <SelectField label="Aircraft" value="N12345 — Cessna 172S" />
            <FormField label="Title" value="Left brake pedal sticking" focused />
            <SelectField label="Severity" value="MEDIUM — Airworthy w/ Limitation" />
            <FormField label="Description" value="Left brake pedal requires 25% more force than normal. Likely sticking caliper." />
            <div className="pt-1 flex gap-1">
              <PBtn label="Save Squawk" />
              <GBtn label="Cancel" />
            </div>
          </MiniModal>
        ),
      },
      {
        label: "Severity classification guide",
        content: (
          <div className="h-full bg-[#f8fafc] p-3 space-y-1.5">
            <div className="text-[7px] text-gray-700 mb-1" style={{ fontWeight: 700 }}>Squawk Severity Guide</div>
            {[
              { sev: "HIGH", color: "red", desc: "Aircraft AOG — safety critical, do not fly" },
              { sev: "MEDIUM", color: "amber", desc: "Airworthy with limitation — monitor closely" },
              { sev: "LOW", color: "blue", desc: "Cosmetic or minor — schedule for next visit" },
            ].map(s => (
              <div key={s.sev} className="flex items-start gap-2 bg-white rounded px-2 py-1.5 border border-gray-100">
                <MBadge label={s.sev} color={s.color as "red" | "amber" | "blue"} />
                <span className="text-[6px] text-gray-600">{s.desc}</span>
              </div>
            ))}
          </div>
        ),
      },
    ],
    steps: [
      { title: "Open new squawk form", content: "From the Squawks tab, click '+ New Squawk', or from an aircraft detail page, click 'Add Squawk'. The form pre-fills the aircraft if you're already on a specific aircraft's page." },
      { title: "Select severity accurately", content: "HIGH = aircraft is AOG or has a safety-critical failure. MEDIUM = airworthy but with a limitation or item that needs prompt attention. LOW = cosmetic, convenience, or minor wear item that can wait for next scheduled visit." },
      { title: "Write a clear description", content: "Write the discrepancy description as you would in a logbook — specific, factual, and objective. Include observed symptoms, conditions when observed, and any initial diagnosis. Example: 'Left brake pedal requires 25% greater force than right side. Likely sticking caliper piston.'" },
      { title: "Attach photos", content: "Click the camera icon to attach photos of the discrepancy. Photos are invaluable for owners who aren't on-site and help justify estimate pricing. Before/after photos are best practice.", tip: "Photo metadata (date, GPS if available) is automatically captured and stored with the squawk record." },
      { title: "Notify the owner", content: "After saving, the system automatically notifies the aircraft owner via email/notification. HIGH severity squawks trigger immediate notifications. You can add a custom message to the notification." },
    ],
    related: ["mech-squawk-overview", "mech-estimate-create"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Estimates
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-estimate-create",
    title: "Creating & Sending Estimates",
    category: "Estimates",
    persona: "mechanic",
    duration: "5 min",
    difficulty: "Intermediate",
    pinned: true,
    tags: ["estimate", "pricing", "approval", "owner", "scope of work"],
    description: "Create detailed, professional job estimates with labor, parts, and outside services. Send them directly to aircraft owners for digital approval — one click converts an approved estimate into a work order.",
    sim: [
      {
        label: "New estimate form — from squawk",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Estimates" />}
            main={
              <div className="space-y-1.5">
                <MCard title="EST-2026-0019 — New Estimate" badge="Draft" badgeColor="gray" subtitle="N67890 · Alternator R&R (from Squawk #47)">
                  <div className="space-y-0.5 mt-1">
                    <div className="text-[6px] text-gray-500 uppercase tracking-wide" style={{ fontWeight: 700 }}>Labor Lines</div>
                    <div className="flex justify-between text-[6px] text-gray-700"><span>Alternator removal, install, run-up · 4.0 hrs</span><span>$380</span></div>
                    <div className="text-[6px] text-gray-500 uppercase tracking-wide mt-1" style={{ fontWeight: 700 }}>Parts</div>
                    <div className="flex justify-between text-[6px] text-gray-700"><span>Alternator P/N LW-12041</span><span>$480</span></div>
                    <div className="flex justify-between text-[7px] text-gray-800 border-t border-gray-100 pt-0.5 mt-1" style={{ fontWeight: 700 }}><span>Estimate Total</span><span>$860.00</span></div>
                  </div>
                </MCard>
                <HL><PBtn label="📧 Send to Owner for Approval" className="w-full" /></HL>
              </div>
            }
            topLabel="Estimates → New Estimate"
          />
        ),
      },
      {
        label: "Owner receives and approves estimate",
        content: (
          <div className="h-full bg-[#f8fafc] p-3 flex flex-col gap-2">
            <div className="bg-white rounded-lg border border-emerald-200 p-2 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-4 h-4 bg-emerald-100 rounded-full flex items-center justify-center text-[7px]">✓</div>
                <span className="text-[7px] text-emerald-700" style={{ fontWeight: 700 }}>Owner Approved — EST-2026-0019</span>
              </div>
              <div className="text-[6px] text-gray-600">John Mitchell approved $860.00 estimate for N67890 alternator replacement at April 12, 2026 09:47 AM</div>
            </div>
            <WFBar steps={["Squawk", "Estimate ✓", "WO", "Logbook", "Invoice"]} activeIdx={2} />
            <PBtn label="→ Convert to Work Order" className="w-full" />
          </div>
        ),
      },
      {
        label: "Convert approved estimate to work order",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <HL>
                  <MCard title="WO-2026-0052 — Alternator R&R" badge="Open" badgeColor="blue" highlighted subtitle="N67890 · Created from EST-2026-0019">
                    <div className="flex gap-1 mt-1">
                      <MBadge label="$860.00" color="green" />
                      <MBadge label="Approved" color="green" />
                      <MBadge label="Mike Torres" color="blue" />
                    </div>
                  </MCard>
                </HL>
                <div className="text-[6px] text-gray-400">All labor and parts lines transferred from estimate automatically</div>
              </div>
            }
            topLabel="Work Orders — Created from Estimate"
          />
        ),
      },
    ],
    steps: [
      { title: "Create a new estimate", content: "From the Estimates tab, click '+ New Estimate'. If you're converting from a squawk, click 'Create Estimate' on the squawk detail — the aircraft, customer, and squawk description auto-populate." },
      { title: "Add labor lines", content: "Click '+ Add Labor' and describe the work, estimated hours, and rate (auto-filled from your profile rate). Add as many labor lines as needed. You can add a description for each line that will appear on the estimate the owner receives." },
      { title: "Add parts", content: "Click '+ Add Part' to add parts with part numbers, descriptions, quantity, and price. The marketplace lookup helps you find pricing — type a part number and it auto-populates from inventory." },
      { title: "Add outside services", content: "For sub-contracted work (prop shop, avionics shop, overhaul facility), click '+ Outside Service' and enter the vendor, description, and quoted price." },
      { title: "Send for owner approval", content: "Click 'Send to Owner for Approval'. The owner receives an email with the formatted estimate PDF and an approval/decline link. They can approve with one click or request modifications.", tip: "Set an expiry date on estimates so they don't remain open indefinitely. 30 days is standard." },
      { title: "Convert to work order when approved", content: "When the owner approves, the estimate status changes to 'Approved' and a 'Convert to Work Order' button appears. Click it — all line items transfer to the WO automatically with no re-entry needed." },
    ],
    related: ["mech-squawk-overview", "mech-wo-create", "mech-wo-lineitems"],
  },

  {
    id: "mech-estimate-status",
    title: "Managing Estimate Status & Follow-ups",
    category: "Estimates",
    persona: "mechanic",
    duration: "3 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["estimate", "status", "follow-up", "approved", "declined", "expired"],
    description: "Track the lifecycle of all your estimates — from Draft to Sent, Approved, Declined, or Expired. Know when to follow up and how to handle declined estimates professionally.",
    sim: [
      {
        label: "Estimate status pipeline",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Estimates" />}
            main={
              <div className="space-y-1.5">
                <div className="text-[8px] text-gray-700 mb-1" style={{ fontWeight: 700 }}>Estimates (5 total)</div>
                {[
                  { id: "EST-0018", tail: "N24680", status: "Approved", color: "green" },
                  { id: "EST-0017", tail: "N67890", status: "Pending", color: "amber" },
                  { id: "EST-0016", tail: "N12345", status: "Sent", color: "blue" },
                  { id: "EST-0015", tail: "N24680", status: "Declined", color: "red" },
                  { id: "EST-0014", tail: "N12345", status: "Expired", color: "gray" },
                ].map(e => (
                  <div key={e.id} className="bg-white rounded border border-gray-100 p-1.5 flex items-center gap-2">
                    <span className="text-[7px] text-gray-700" style={{ fontWeight: 600 }}>{e.id}</span>
                    <span className="text-[6px] text-gray-400 flex-1">{e.tail}</span>
                    <MBadge label={e.status} color={e.color as "green" | "amber" | "blue" | "red" | "gray"} />
                  </div>
                ))}
              </div>
            }
            topLabel="Estimates — Status Overview"
          />
        ),
      },
    ],
    steps: [
      { title: "Draft", content: "You're building the estimate. Not yet visible to the owner. Take time to get pricing right — use the marketplace lookup for accurate part costs." },
      { title: "Sent / Pending owner approval", content: "The estimate has been emailed to the owner and is awaiting their action. If no response after 5 days, send a follow-up reminder by clicking 'Send Reminder' on the estimate." },
      { title: "Approved", content: "The owner has approved. Convert to a work order immediately while the approval is fresh. The conversion timestamp is recorded." },
      { title: "Declined", content: "The owner declined. The estimate record stays for your reference. You can revise and resend, or mark as closed if the work won't proceed.", tip: "When an estimate is declined, contact the owner to understand their concern. Price and scope are the two most common objections." },
      { title: "Expired", content: "The estimate passed its expiry date without a response. Parts prices may have changed. Update pricing and resend as a new estimate rather than reusing the expired one." },
    ],
    related: ["mech-estimate-create", "mech-wo-create"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Work Orders
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-wo-create",
    title: "Creating & Opening Work Orders",
    category: "Work Orders",
    persona: "mechanic",
    duration: "5 min",
    difficulty: "Intermediate",
    pinned: true,
    tags: ["work order", "create", "open", "customer", "aircraft", "discrepancy"],
    description: "Work orders are the core operational record of any maintenance event. Learn how to create them manually or from estimates, assign mechanics, and set up the job for efficient execution.",
    sim: [
      {
        label: "New work order form — key fields",
        content: (
          <MiniModal title="Create New Work Order">
            <SelectField label="Aircraft" value="N12345 — Cessna 172S" />
            <SelectField label="Customer" value="John Mitchell" />
            <FormField label="Discrepancy / Job Description" value="100-hour inspection per Cessna SB" focused />
            <SelectField label="Assign To" value="Mike Torres (A&P/IA)" />
            <FormField label="Target Completion" value="April 14, 2026" />
            <div className="pt-1 flex gap-1">
              <PBtn label="Create Work Order" />
              <GBtn label="Cancel" />
            </div>
          </MiniModal>
        ),
      },
      {
        label: "WO status pipeline",
        content: (
          <div className="h-full bg-[#f8fafc] p-3">
            <div className="text-[7px] text-gray-700 mb-2" style={{ fontWeight: 700 }}>Work Order Status Flow</div>
            <WFBar steps={["Draft", "Open", "In Progress", "Parts Wait", "Sign-off", "Closed"]} activeIdx={2} />
            <div className="mt-2 space-y-1">
              {[
                { s: "Draft", d: "Building the WO — not yet active" },
                { s: "Open", d: "Assigned and ready to begin" },
                { s: "In Progress", d: "Mechanic actively working" },
                { s: "Awaiting Parts", d: "Waiting on parts delivery" },
                { s: "Ready for Sign-off", d: "Work complete, needs IA sign" },
                { s: "Closed", d: "Signed and completed" },
              ].map(row => (
                <div key={row.s} className="flex items-center gap-2 bg-white rounded px-2 py-0.5 border border-gray-100">
                  <span className="text-[7px] text-gray-800 w-24" style={{ fontWeight: 600 }}>{row.s}</span>
                  <span className="text-[6px] text-gray-400">{row.d}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        label: "Assigning multiple mechanics to a WO",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <MCard title="WO-2026-0053 — Assigned Mechanics" subtitle="100-hr Inspection · N12345">
                  <div className="space-y-1 mt-1.5">
                    {[
                      { name: "Mike Torres", role: "Lead / IA", status: "Primary" },
                      { name: "Dana Lee", role: "Mechanic", status: "Supporting" },
                    ].map(m => (
                      <div key={m.name} className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-[#2563EB] text-white text-[5px] flex items-center justify-center" style={{ fontWeight: 700 }}>{m.name.split(" ").map(n => n[0]).join("")}</div>
                        <span className="text-[7px] text-gray-700 flex-1" style={{ fontWeight: 600 }}>{m.name}</span>
                        <MBadge label={m.status} color={m.status === "Primary" ? "blue" : "gray"} />
                      </div>
                    ))}
                    <GBtn label="+ Add Mechanic" className="w-full" />
                  </div>
                </MCard>
              </div>
            }
            topLabel="Work Order — Mechanic Assignment"
          />
        ),
      },
    ],
    steps: [
      { title: "Create a work order", content: "From Work Orders, click '+ New Work Order'. Or from an approved estimate, click 'Convert to WO'. Or use the AI Command Center: 'Create a work order for N12345 100-hr inspection'." },
      { title: "Fill in required fields", content: "Select the aircraft, customer, and enter a discrepancy/job description. The discrepancy is what the owner reported or what you found during inspection — it's the 'before' state. The corrective action will be filled in as work proceeds." },
      { title: "Set the target completion date", content: "Set a realistic target completion date. This is visible to the aircraft owner and affects how urgency is displayed on their dashboard. Be conservative — missing dates damages trust more than setting a longer timeline." },
      { title: "Assign mechanics", content: "Assign a primary mechanic (responsible for quality and completion) and any supporting mechanics. Only mechanics with 'Work Orders' permission and the right specialty can be assigned.", tip: "For annual inspections, the primary mechanic must have IA (Inspection Authorization). The system will warn you if the assigned mechanic doesn't have the required certification." },
      { title: "Set status to Open", content: "Change the WO status from 'Draft' to 'Open' when you're ready to begin work. This notifies the assigned mechanics and makes the WO visible in their work queue." },
      { title: "Track progress", content: "As work progresses, update the status manually or let mechanics update it from their portal. The progress percentage (0-100%) can be updated to give the owner a real-time completion indicator." },
    ],
    related: ["mech-wo-lineitems", "mech-wo-status", "mech-wo-close", "mech-ai-workorder"],
  },

  {
    id: "mech-wo-lineitems",
    title: "Work Order Line Items: Labor, Parts & Services",
    category: "Work Orders",
    persona: "mechanic",
    duration: "6 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["work order", "labor", "parts", "outside services", "line items", "pricing"],
    description: "Build accurate work orders by adding detailed labor lines, parts with part numbers, and outside services. Proper line item management ensures accurate invoicing and complete maintenance documentation.",
    sim: [
      {
        label: "Labor lines — add time entries",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <MCard title="WO-2026-0053 — Labor Lines">
                  <div className="space-y-1 mt-1.5">
                    <THead cells={["Description", "Hrs", "Rate", "Total"]} />
                    <TRow cells={["100-hr inspection per checklist", "6.0", "$95", "$570"]} highlighted />
                    <TRow cells={["Magneto timing — adjusted", "1.0", "$95", "$95"]} />
                    <TRow cells={["Oil & filter service", "0.5", "$95", "$47.50"]} />
                    <div className="flex justify-end mt-1">
                      <span className="text-[7px] text-gray-700" style={{ fontWeight: 700 }}>Labor Total: $712.50</span>
                    </div>
                  </div>
                </MCard>
                <GBtn label="+ Add Labor Line" className="w-full" />
              </div>
            }
            topLabel="Work Order — Labor Lines"
          />
        ),
      },
      {
        label: "Parts lines — with part numbers",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <MCard title="WO-2026-0053 — Parts Lines">
                  <div className="space-y-1 mt-1.5">
                    <THead cells={["Part #", "Description", "Qty", "Total"]} />
                    <TRow cells={["CH48108-1", "Oil Filter Champion", "1", "$12.50"]} />
                    <TRow cells={["AW-100+", "AeroShell W100+ 1Qt", "6", "$54.00"]} highlighted />
                    <TRow cells={["SA-14677", "Spark Plug Champion", "12", "$132.00"]} />
                    <div className="flex justify-end mt-1">
                      <span className="text-[7px] text-gray-700" style={{ fontWeight: 700 }}>Parts Total: $198.50</span>
                    </div>
                  </div>
                </MCard>
                <GBtn label="+ Add Part" className="w-full" />
              </div>
            }
            topLabel="Work Order — Parts Lines"
          />
        ),
      },
      {
        label: "Outside services — subcontractors",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <MCard title="WO-2026-0053 — Outside Services">
                  <div className="space-y-1 mt-1.5">
                    <THead cells={["Vendor", "Description", "Amount"]} />
                    <TRow cells={["Texas Avionics", "IFR Pitot-static cert", "$185.00"]} />
                    <div className="flex justify-end mt-1">
                      <span className="text-[7px] text-gray-700" style={{ fontWeight: 700 }}>Outside: $185.00</span>
                    </div>
                  </div>
                </MCard>
                <div className="bg-gray-50 rounded-lg p-2">
                  <div className="flex justify-between text-[6px] text-gray-500"><span>Labor</span><span>$712.50</span></div>
                  <div className="flex justify-between text-[6px] text-gray-500"><span>Parts</span><span>$198.50</span></div>
                  <div className="flex justify-between text-[6px] text-gray-500"><span>Outside</span><span>$185.00</span></div>
                  <div className="flex justify-between text-[7px] text-gray-800 border-t border-gray-200 pt-0.5 mt-0.5" style={{ fontWeight: 700 }}><span>Grand Total</span><span>$1,096.00</span></div>
                </div>
              </div>
            }
            topLabel="Work Order — Outside Services & Total"
          />
        ),
      },
    ],
    steps: [
      { title: "Add labor lines for each task", content: "In the Work Order detail, click '+ Add Labor' to add a labor line. Enter a description (be specific — this appears in the invoice), number of hours, and rate. Add separate lines for different types of work (e.g., separate lines for inspection, repairs, and run-up).", tip: "Detailed labor lines make invoices more transparent and reduce customer questions. Vague descriptions like 'maintenance' lead to billing disputes." },
      { title: "Add parts with part numbers", content: "Click '+ Add Part' to add each part used. Always enter the exact part number — this is required for logbook documentation and traceability. The parts lookup integrates with the marketplace to suggest pricing." },
      { title: "Set part condition", content: "For each part, specify the condition: New (from manufacturer/distributor), Serviceable (overhauled/repaired PMA), or Exchange. Condition affects the legal logbook entry and customer pricing expectations." },
      { title: "Add outside services", content: "For any work performed by third parties (avionics shops, prop overhaul, NDT inspection), add an outside service line with the vendor name, description, and cost. These are passed through to the invoice at cost or with a markup." },
      { title: "Review the grand total", content: "The total bar at the bottom shows Labor, Parts, Outside Services, and Grand Total automatically calculated. If this significantly exceeds the original estimate, you may need to contact the owner for a supplemental approval before proceeding." },
      { title: "Owner view toggle", content: "Click the 'Owner View' toggle to see exactly what the aircraft owner sees on their portal. This shows a simplified view without your internal notes, helping you ensure clarity before invoicing." },
    ],
    related: ["mech-wo-create", "mech-wo-close", "mech-invoice-create"],
  },

  {
    id: "mech-wo-status",
    title: "Work Order Status Updates & Notes",
    category: "Work Orders",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["work order", "status", "notes", "activity log", "customer communication", "progress"],
    description: "Keep work orders updated with status changes, internal notes, and customer-facing messages. Good communication through the WO keeps aircraft owners informed and builds trust.",
    sim: [
      {
        label: "Status update dropdown",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <MCard title="WO-2026-0053 — Status Update">
                  <div className="mt-1.5">
                    <SelectField label="Status" value="Awaiting Parts" />
                    <div className="mt-1">
                      <FormField label="Note (visible to owner)" value="Waiting on spark plugs from Spruce — ETA April 15. All other work complete." />
                    </div>
                  </div>
                </MCard>
                <PBtn label="Update Status & Notify Owner" className="w-full" />
              </div>
            }
            topLabel="Work Order — Status Update"
          />
        ),
      },
      {
        label: "Activity log — full audit trail",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="bg-white rounded-lg border border-gray-100 p-2">
                <div className="text-[7px] text-gray-700 mb-1.5" style={{ fontWeight: 700 }}>Activity Log — WO-2026-0053</div>
                <div className="space-y-1.5">
                  <TimelineItem text="WO opened — assigned to Mike Torres" time="Apr 12, 08:00" color="blue" />
                  <TimelineItem text="Status → In Progress (Mike Torres)" time="Apr 12, 09:15" color="green" />
                  <TimelineItem text="Parts ordered — awaiting Champion spark plugs" time="Apr 12, 11:30" color="amber" />
                  <TimelineItem text="Customer note sent: parts ETA April 15" time="Apr 12, 11:32" color="violet" />
                </div>
              </div>
            }
            topLabel="Work Order — Activity Log"
          />
        ),
      },
    ],
    steps: [
      { title: "Update status as work progresses", content: "Open the work order and use the Status dropdown to move it through: Open → In Progress → Awaiting Parts → Awaiting Approval → Ready for Signoff → Closed. Each status change is timestamped in the activity log." },
      { title: "Add internal notes", content: "Internal notes (only visible to your team) are for technical details, internal communications, or reminders. Example: 'Check mag timing again after break-in run. Right mag was borderline at 25 deg'." },
      { title: "Add customer-facing notes", content: "Customer notes appear in the owner's portal. Keep these professional and informative: 'Work proceeding as estimated. Awaiting parts from Aircraft Spruce, ETA April 15.' This prevents owners from calling for status updates." },
      { title: "Notify the owner on status changes", content: "Check 'Notify Owner' when updating status to trigger an automatic email notification to the aircraft owner. Use this for important milestones: starting work, awaiting parts, and ready for pickup.", tip: "Proactive communication via status updates builds customer loyalty. Owners who feel informed are more likely to approve estimates quickly." },
      { title: "Track the activity log", content: "Every status change, note, and mechanic action is automatically logged in the Activity Log with a timestamp and the user who made the change. This creates a complete audit trail for legal and compliance purposes." },
    ],
    related: ["mech-wo-create", "mech-wo-close", "mech-wo-lineitems"],
  },

  {
    id: "mech-wo-close",
    title: "Closing Work Orders & Pre-Signoff Checklist",
    category: "Work Orders",
    persona: "mechanic",
    duration: "5 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["work order", "close", "sign-off", "checklist", "logbook", "invoice"],
    description: "Closing a work order is a critical step that triggers the logbook entry and invoice generation workflow. Learn the pre-signoff checklist and how to properly close a WO to ensure compliance.",
    sim: [
      {
        label: "Pre-signoff checklist",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Pre-Signoff Checklist — WO-2026-0053" badge="5/6 Complete" badgeColor="amber">
                  <div className="space-y-0.5 mt-1.5">
                    {[
                      { item: "All labor lines complete", done: true },
                      { item: "All parts listed with P/N", done: true },
                      { item: "Discrepancy description filled", done: true },
                      { item: "Corrective action documented", done: true },
                      { item: "Run-up / functional check logged", done: true },
                      { item: "Logbook entry drafted", done: false },
                    ].map(c => (
                      <div key={c.item} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-full flex items-center justify-center text-[6px] ${c.done ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>{c.done ? "✓" : "○"}</div>
                        <span className={`text-[6px] ${c.done ? "text-gray-700" : "text-gray-400"}`} style={{ fontWeight: c.done ? 500 : 400 }}>{c.item}</span>
                      </div>
                    ))}
                  </div>
                </MCard>
                <GBtn label="Draft Logbook Entry" className="w-full" />
              </div>
            }
            topLabel="Work Order — Pre-Signoff Checklist"
          />
        ),
      },
      {
        label: "Sign and close the work order",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <MCard title="WO-2026-0053 — Ready for Sign-off">
                  <div className="mt-1.5 space-y-1">
                    <SignaturePad signed={true} />
                    <div className="text-[5px] text-gray-400">Mike Torres · A&P/IA-1234567 · April 14, 2026</div>
                  </div>
                </MCard>
                <div className="flex gap-1">
                  <HL><PBtn label="✓ Close Work Order" /></HL>
                  <GBtn label="Generate Invoice" />
                </div>
              </div>
            }
            topLabel="Work Order — Closing & Signature"
          />
        ),
      },
      {
        label: "Workflow continues: logbook + invoice",
        content: (
          <div className="h-full bg-[#f8fafc] p-3">
            <WFBar steps={["Squawk", "Estimate", "WO ✓", "Logbook", "Invoice"]} activeIdx={3} />
            <div className="mt-2 space-y-1.5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-2">
                <span className="text-[8px] text-emerald-700">✅</span>
                <div>
                  <div className="text-[7px] text-emerald-800" style={{ fontWeight: 700 }}>WO-2026-0053 Closed</div>
                  <div className="text-[6px] text-emerald-600">Total: $1,096.00 · April 14, 2026</div>
                </div>
              </div>
              <PBtn label="📝 Draft Logbook Entry" className="w-full" />
              <PBtn label="💵 Generate Invoice" className="w-full" />
            </div>
          </div>
        ),
      },
    ],
    steps: [
      { title: "Complete the pre-signoff checklist", content: "Before closing, verify: all labor lines are accurate, all parts have valid part numbers, discrepancy and corrective action are fully documented, and any functional test or run-up has been performed and noted." },
      { title: "Document findings and corrective action", content: "Fill in the 'Findings' field (what you discovered during the job — may differ from original squawk description) and 'Corrective Action' (exactly what you did to correct the discrepancy). These become the basis for the logbook entry." },
      { title: "Move to Ready for Signoff status", content: "Change the WO status to 'Ready for Signoff'. If an IA sign-off is required (annual inspection, major repair), this notifies the IA to review and sign." },
      { title: "Apply digital signature to close", content: "Click 'Close Work Order'. You'll be prompted to apply your digital signature with your FAA certificate number. This formally closes the work order and creates an immutable timestamped record.", tip: "Only mechanics with the 'Close WO' permission can perform this action. For annual inspections, the signer must hold an IA." },
      { title: "Generate logbook entry and invoice", content: "After closing, the system prompts you to generate a logbook entry and/or invoice. These can also be created via AI Command: 'Create logbook entry for WO-2026-0053' or 'Invoice WO-2026-0053'." },
    ],
    related: ["mech-logbook-create", "mech-invoice-create", "mech-wo-status"],
  },

  {
    id: "mech-wo-parts-status",
    title: "Awaiting Parts: Managing Parts Delays",
    category: "Work Orders",
    persona: "mechanic",
    duration: "3 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["work order", "awaiting parts", "backorder", "parts delay", "customer notification"],
    description: "When parts are on backorder or delayed, properly document the delay in the work order and keep the aircraft owner informed with accurate ETAs.",
    sim: [
      {
        label: "Marking WO as Awaiting Parts",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <MCard title="WO-2026-0047 — Awaiting Parts" badge="Awaiting Parts" badgeColor="amber" subtitle="N67890 · Alternator R&R">
                  <div className="mt-1.5 space-y-1">
                    <div className="bg-amber-50 border border-amber-200 rounded p-1.5">
                      <div className="text-[6px] text-amber-800" style={{ fontWeight: 700 }}>Parts on Backorder</div>
                      <div className="text-[6px] text-amber-700">Alternator P/N LW-12041 · Estimated delivery: April 16</div>
                      <div className="text-[6px] text-amber-700">Source: Aircraft Spruce · Order #ASW-2026-0334</div>
                    </div>
                    <ToggleRow label="Notify owner of delay" on={true} />
                  </div>
                </MCard>
              </div>
            }
            topLabel="Work Order — Parts Delay"
          />
        ),
      },
    ],
    steps: [
      { title: "Set status to Awaiting Parts", content: "When a required part is backordered or delayed, update the WO status to 'Awaiting Parts'. This clearly signals the hold-up and prevents the WO from appearing as an unexplained delay." },
      { title: "Document the parts order", content: "In the parts line item, note the vendor, order number, and estimated delivery date. This creates a paper trail if the order needs to be tracked or expedited." },
      { title: "Notify the owner", content: "Enable the 'Notify Owner' toggle when updating to 'Awaiting Parts'. The notification explains the delay, provides the expected delivery date, and reassures the owner that work will resume immediately upon delivery." },
      { title: "Explore alternative sources", content: "Use the Parts Marketplace search to look for the same part from alternative vendors who may have it in stock. You can also search for PMA-approved alternatives at lower cost.", tip: "For AOG (Aircraft on Ground) situations, use the AOG flag in the parts search to find vendors who ship overnight or same-day." },
      { title: "Resume WO when parts arrive", content: "When parts arrive, update the WO status to 'In Progress' and toggle the parts line item to 'Received'. This automatically notifies the owner that work has resumed." },
    ],
    related: ["mech-wo-status", "mech-parts-search", "mech-wo-lineitems"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Logbook Entries
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-logbook-create",
    title: "Creating FAA Logbook Entries",
    category: "Logbook Entries",
    persona: "mechanic",
    duration: "6 min",
    difficulty: "Intermediate",
    pinned: true,
    tags: ["logbook", "FAA", "entry", "maintenance record", "airframe", "engine", "propeller"],
    description: "Create legally valid FAA logbook entries directly in myaircraft.us. The platform formats entries to FAR 43 Appendix E standards, includes required regulatory references, and applies cryptographically-timestamped digital signatures.",
    sim: [
      {
        label: "New logbook entry form — entry type selection",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Logbook" />}
            main={
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>New Logbook Entry</span>
                  <PBtn label="+ Create Entry" />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { type: "Preventive Maint.", icon: "🔧" },
                    { type: "100-hr Inspection", icon: "📋" },
                    { type: "Annual Inspection", icon: "🗓️" },
                    { type: "Repair", icon: "🔩" },
                    { type: "Major Repair", icon: "⚙️" },
                    { type: "Alteration", icon: "📐" },
                  ].map(t => (
                    <div key={t.type} className="bg-white border border-gray-100 rounded p-1.5 flex items-center gap-1 shadow-sm">
                      <span className="text-[9px]">{t.icon}</span>
                      <span className="text-[6px] text-gray-700" style={{ fontWeight: 500 }}>{t.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            }
            topLabel="Logbook — Entry Type Selection"
          />
        ),
      },
      {
        label: "Entry detail form — required FAA fields",
        content: (
          <MiniModal title="New Logbook Entry">
            <SelectField label="Aircraft / Record Type" value="N12345 — Airframe Record" />
            <FormField label="Date of Service" value="April 14, 2026" />
            <FormField label="Total Time Airframe (TTAF)" value="4,012.4 hours" />
            <FormField label="Description of Work Performed" value="Engine oil and filter service IAW Cessna MM…" focused />
            <SelectField label="Return to Service" value="I certify — returned to service" />
            <div className="pt-1"><PBtn label="Save Draft Entry" /></div>
          </MiniModal>
        ),
      },
      {
        label: "Entry preview — FAA formatted output",
        content: (
          <div className="h-full bg-[#f8fafc] p-2">
            <div className="bg-white rounded-lg border border-gray-100 p-2 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[7px] text-gray-700" style={{ fontWeight: 700 }}>N12345 — Airframe Logbook Entry</div>
                <MBadge label="Draft" color="gray" />
              </div>
              <div className="text-[6px] text-gray-600 leading-relaxed">
                April 14, 2026 · Total Time: 4012.4 hrs<br />
                Engine oil and filter change IAW Cessna Model 172S Maintenance Manual Section 12-10. Drained and replaced with 6 quarts AeroShell W100 Plus. Installed Champion oil filter P/N CH48108-1. Inspected oil sump plug gasket — serviceable. Aircraft returned to service IAW FAR 43.9.<br /><br />
                <span style={{ fontStyle: "italic" }}>I certify that this aircraft has been inspected in accordance with a continuous airworthiness maintenance program and was found to be in airworthy condition.</span>
              </div>
              <div className="mt-1.5 border-t border-gray-100 pt-1">
                <SignaturePad signed={false} />
              </div>
            </div>
          </div>
        ),
      },
    ],
    steps: [
      { title: "Navigate to Logbook in the sidebar", content: "Click 'Logbook' in the Mechanic Portal sidebar. You'll see all existing entries for all aircraft you have access to. Filter by aircraft, date range, or entry type." },
      { title: "Select entry type", content: "Click '+ Create Entry' and select the entry type: Preventive Maintenance, 100-hr Inspection, Annual Inspection, Repair, Major Repair/Alteration, or Avionics. The type determines the regulatory framework and required fields." },
      { title: "Fill in required FAA fields", content: "Required fields: Aircraft N-number, Record type (Airframe/Engine/Propeller), Date of service, Total time (TTAF), Description of work, and Return to Service statement. All are mandatory for FAA compliance." },
      { title: "Write the maintenance description", content: "The description must include: what was performed, reference to approved data (e.g., 'IAW Cessna 172S MM Section 12-10'), any parts used with part numbers, inspection findings, and confirmation the aircraft was returned to service.", tip: "Use the AI-assist feature to help format descriptions. Type your work in plain language and click 'Format for FAA' — the AI rewrites it to regulatory standards." },
      { title: "Select the appropriate return to service statement", content: "For standard maintenance (FAR 43.9): 'I certify the aircraft was returned to service.' For annual inspection (FAR 43.11): 'I certify the aircraft has been inspected per [program].' The system provides the correct template based on entry type." },
      { title: "Save as draft before signing", content: "Save the entry as a Draft to allow review before final signature. Draft entries can be edited. Once signed, entries become permanent records that can only be archived, never deleted." },
    ],
    related: ["mech-logbook-sign", "mech-logbook-types", "mech-ai-logbook"],
  },

  {
    id: "mech-logbook-sign",
    title: "Signing Logbook Entries with Digital Signature",
    category: "Logbook Entries",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["logbook", "sign", "digital signature", "FAA certificate", "A&P", "IA", "legal"],
    description: "Apply your FAA-validated digital signature to logbook entries. Understand the legal significance of the signature, what certificate types can sign which entry types, and how to handle co-signatures for annual inspections.",
    sim: [
      {
        label: "Signature application with certificate validation",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Logbook" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Apply Signature — Annual Inspection Entry" badge="Requires IA" badgeColor="red">
                  <div className="mt-1.5 space-y-1.5">
                    <div className="bg-blue-50 border border-blue-200 rounded p-1.5">
                      <div className="text-[6px] text-blue-800" style={{ fontWeight: 700 }}>Signing as: Mike Torres</div>
                      <div className="text-[6px] text-blue-600">Certificate: A&P/IA — 1234567</div>
                      <div className="text-[6px] text-blue-600">✓ IA Certificate verified — authorized to sign</div>
                    </div>
                    <SignaturePad signed={true} />
                    <div className="text-[5px] text-gray-400">Cryptographic timestamp: 2026-04-14T14:32:07Z · SHA-256 verified</div>
                  </div>
                </MCard>
                <HL><PBtn label="Apply Signature & Finalize Entry" className="w-full" /></HL>
              </div>
            }
            topLabel="Logbook — Apply Digital Signature"
          />
        ),
      },
      {
        label: "Signed entry — immutable permanent record",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Logbook" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Logbook Entry — N12345 Annual Inspection" badge="Signed" badgeColor="green" highlighted>
                  <div className="space-y-0.5 mt-1">
                    <div className="text-[6px] text-gray-600">Date: April 14, 2026 · TTAF: 4,012.4 hrs</div>
                    <div className="text-[6px] text-gray-600">Type: Annual Inspection (FAR 43.11)</div>
                    <div className="text-[6px] text-emerald-700" style={{ fontWeight: 600 }}>Signed: Mike Torres · A&P/IA-1234567</div>
                    <div className="text-[5px] text-gray-400">Cannot be edited or deleted · Archived only</div>
                  </div>
                </MCard>
                <div className="flex gap-1">
                  <GBtn label="Print PDF" />
                  <GBtn label="Share Link" />
                  <GBtn label="Archive Entry" />
                </div>
              </div>
            }
            topLabel="Logbook — Signed Entry"
          />
        ),
      },
    ],
    steps: [
      { title: "Review the entry carefully before signing", content: "Open the draft entry and read it completely. Verify: N-number is correct, TTAF is accurate, all parts listed with correct part numbers, maintenance description is complete and accurate. You cannot unsign an entry." },
      { title: "Check certificate requirements", content: "Standard maintenance and repairs: A&P certification. 100-hr inspection: A&P. Annual inspection: IA (Inspection Authorization) required. Major repairs: A&P. The system validates your certificate type and will prevent signing if you don't hold the required certificate." },
      { title: "Apply your digital signature", content: "Click 'Sign Entry'. The system confirms your identity using your profile certificate number. Your stored digital signature is applied with a cryptographic timestamp — this is legally equivalent to a wet (ink) signature under FAA regulations." },
      { title: "Understanding the immutability rule", content: "Once signed, logbook entries CANNOT be edited or deleted — they can only be Archived (making them inactive but still retrievable). This mirrors the FAA requirement that logbooks be permanent records. If you made an error, archive the incorrect entry and create a new corrected one.", tip: "If you need to add information to a signed entry, you can add an 'Amendment Note' which is appended to the entry as a separate timestamped record." },
      { title: "Co-signatures for complex entries", content: "For annual inspections with multiple mechanics contributing, multiple signatures can be applied to a single entry. Each mechanic signs for their specific portion of the inspection. The primary IA signs the final return to service statement." },
      { title: "Export and share", content: "After signing, use Print PDF to generate an official printable logbook entry, or Share Link to send a secure, time-limited link to the aircraft owner or buyer for due diligence purposes." },
    ],
    related: ["mech-logbook-create", "mech-logbook-types", "mech-gs-profile"],
  },

  {
    id: "mech-logbook-types",
    title: "Entry Types: Airframe, Engine, Propeller & Avionics",
    category: "Logbook Entries",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["logbook", "airframe", "engine", "propeller", "avionics", "record types"],
    description: "Aircraft maintenance records are organized into four logbook types: Airframe, Engine, Propeller, and Avionics/ELT. Each has specific required fields and regulatory standards. Learn which record type to use for each maintenance action.",
    sim: [
      {
        label: "Four logbook record types",
        content: (
          <div className="h-full bg-[#f8fafc] p-3 space-y-1.5">
            <div className="text-[7px] text-gray-700 mb-1" style={{ fontWeight: 700 }}>Logbook Record Types</div>
            {[
              { type: "Airframe", desc: "Inspections, structural repairs, control surfaces, landing gear, fuselage", fields: "TTAF required", color: "blue" },
              { type: "Engine", desc: "Engine maintenance, oil, spark plugs, compression, overhaul, TBO", fields: "TSN, SMOH required", color: "violet" },
              { type: "Propeller", desc: "Prop service, repairs, overhaul, prop strike inspections, track/balance", fields: "TSN, SPOH required", color: "amber" },
              { type: "Avionics / ELT", desc: "Radio, GPS, autopilot, ELT battery/check, transponder certification", fields: "TSO cert numbers", color: "green" },
            ].map(t => (
              <div key={t.type} className="bg-white rounded border border-gray-100 p-1.5 shadow-sm">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <MBadge label={t.type} color={t.color as "blue" | "violet" | "amber" | "green"} />
                  <span className="text-[5px] text-gray-400">{t.fields}</span>
                </div>
                <div className="text-[6px] text-gray-500 leading-tight">{t.desc}</div>
              </div>
            ))}
          </div>
        ),
      },
    ],
    steps: [
      { title: "Airframe logbook", content: "Use for: all inspections (100-hr, annual, Phase), airframe repairs, structural work, control surface work, landing gear, cabin, and any modification to the airframe structure. TTAF (Total Time Airframe) is required." },
      { title: "Engine logbook", content: "Use for: oil changes, spark plug replacement, compression checks, mag timing, engine repairs, overhaul entries, accessory replacement, and any engine run-up data. TSN (Time Since New) and SMOH (Since Major Overhaul) are required fields." },
      { title: "Propeller logbook", content: "Use for: prop inspections, tip repairs, dynamic balancing, track checks, overhaul, and prop strike inspections. A prop strike inspection must be documented in both the Propeller and Engine records. SPOH (Since Prop Overhaul) required." },
      { title: "Avionics / ELT logbook", content: "Use for: avionics installation/removal, IFR pitot-static certifications, transponder tests, ELT battery replacement (every 12 months or 50% battery life), GPS database updates, and autopilot service.", tip: "ELT battery replacement must be logged with the battery manufacturer, model, lot number, and new expiry date per FAR 91.207." },
      { title: "Multiple record types for one work order", content: "A 100-hr inspection typically creates entries in Airframe, Engine, and possibly Propeller records. After closing the WO, you can create multiple logbook entries (one per record type) all linked to the same WO for full traceability." },
    ],
    related: ["mech-logbook-create", "mech-logbook-sign"],
  },

  {
    id: "mech-logbook-search",
    title: "Searching & Filtering Logbook History",
    category: "Logbook Entries",
    persona: "mechanic",
    duration: "3 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["logbook", "search", "filter", "history", "records", "maintenance history"],
    description: "The logbook search helps you find any historical entry across all aircraft — by date, type, aircraft, mechanic, or keyword. Essential for pre-purchase inspections, AD compliance research, and customer inquiries.",
    sim: [
      {
        label: "Logbook list with filters",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Logbook" />}
            main={
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  <HL>
                    <div className="flex items-center gap-1 bg-white border border-blue-300 rounded px-2 py-0.5 ring-1 ring-blue-200">
                      <span className="text-gray-400 text-[7px]">🔍</span>
                      <span className="text-[7px] text-gray-700">alternator</span>
                    </div>
                  </HL>
                  <SelectField label="" value="All Aircraft" />
                  <SelectField label="" value="All Types" />
                </div>
                <THead cells={["Date", "Aircraft", "Type", "Mechanic"]} />
                <TRow cells={["Apr 14, 2026", "N67890", "Repair", "M. Torres"]} highlighted />
                <TRow cells={["Jan 10, 2025", "N12345", "Repair", "M. Torres"]} />
                <TRow cells={["Nov 3, 2023", "N67890", "Repair", "D. Lee"]} />
              </div>
            }
            topLabel="Logbook — Search & Filter"
          />
        ),
      },
    ],
    steps: [
      { title: "Use the search bar for keyword search", content: "Type any keyword to search across all logbook entries: part numbers, description text, mechanic names, or regulatory references. The search is instant and searches the full entry text." },
      { title: "Filter by aircraft", content: "Use the Aircraft filter to see entries for a specific N-number only. This is the most common filter when doing a pre-purchase inspection or responding to a specific owner inquiry." },
      { title: "Filter by entry type", content: "Filter by entry type (Annual, 100-hr, Repair, etc.) to quickly find specific inspection history. For AD compliance research, filter by 'Repair' and search for the AD number." },
      { title: "Filter by date range", content: "Set a date range to review entries within a specific time window — useful for annual reviews, insurance audits, or tracking maintenance frequency." },
      { title: "Export filtered results", content: "The 'Export' button downloads the filtered list as a PDF or CSV. Use PDF for official documentation (pre-purchase packages, insurance), CSV for spreadsheet analysis.", tip: "For pre-purchase inspections, search the aircraft's full history and export as PDF. This is the same document format used by professional aircraft brokers." },
    ],
    related: ["mech-logbook-create", "mech-logbook-sign"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Invoices & Billing
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-invoice-create",
    title: "Creating Professional Invoices",
    category: "Invoices & Billing",
    persona: "mechanic",
    duration: "5 min",
    difficulty: "Intermediate",
    pinned: true,
    tags: ["invoice", "billing", "create", "work order", "line items", "total"],
    description: "Generate professional, itemized invoices from closed work orders. The invoice pulls all labor, parts, and outside service lines automatically — with your shop branding, tax calculations, and a customer payment link.",
    sim: [
      {
        label: "Create invoice from closed WO",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Invoices" />}
            main={
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Create Invoice</span>
                </div>
                <MCard title="Source: WO-2026-0053 — Closed" badge="Ready to Invoice" badgeColor="green" subtitle="N12345 · 100-hr Inspection · John Mitchell" highlighted>
                  <div className="flex gap-1 mt-1">
                    <MBadge label="Labor: $712.50" color="blue" />
                    <MBadge label="Parts: $198.50" color="violet" />
                    <MBadge label="Outside: $185.00" color="amber" />
                  </div>
                </MCard>
                <HL><PBtn label="Generate Invoice from WO" className="w-full" /></HL>
              </div>
            }
            topLabel="Invoices — Create from Work Order"
          />
        ),
      },
      {
        label: "Invoice form — review and customize",
        content: (
          <div className="h-full bg-[#f8fafc] p-2">
            <div className="bg-white rounded-lg border border-gray-100 p-2 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="text-[8px] text-gray-800" style={{ fontWeight: 700 }}>INV-2026-0031</div>
                  <div className="text-[6px] text-gray-400">Blue Canyon Aviation · April 14, 2026</div>
                </div>
                <MBadge label="Draft" color="gray" />
              </div>
              <div className="text-[6px] text-gray-600 mb-1.5">Bill To: John Mitchell · N12345 — 100-hr Inspection</div>
              <THead cells={["Description", "", "Total"]} />
              <TRow cells={["100-hr inspection labor (7.5 hrs)", "", "$712.50"]} />
              <TRow cells={["Oil, filter, spark plugs, parts", "", "$198.50"]} />
              <TRow cells={["Texas Avionics — IFR cert", "", "$185.00"]} />
              <InvSummary subtotal="$1,096.00" tax="$82.20" total="$1,178.20" />
            </div>
          </div>
        ),
      },
      {
        label: "Send invoice with payment link",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Invoices" />}
            main={
              <div className="space-y-1.5">
                <MCard title="INV-2026-0031 — Send Options">
                  <div className="space-y-1 mt-1.5">
                    <ToggleRow label="Email to john@mitchellaviation.com" on={true} />
                    <ToggleRow label="Include PDF attachment" on={true} />
                    <ToggleRow label="Include payment link" on={true} />
                    <ToggleRow label="CC shop copy" on={false} />
                  </div>
                </MCard>
                <HL><PBtn label="📧 Send Invoice — $1,178.20" className="w-full" /></HL>
                <GBtn label="Download PDF Only" className="w-full" />
              </div>
            }
            topLabel="Invoice — Send Options"
          />
        ),
      },
    ],
    steps: [
      { title: "Create invoice from work order", content: "Navigate to Invoices, click '+ New Invoice', and select the closed work order as the source. All labor, parts, and outside service lines transfer automatically. You can also use AI Command: 'Generate invoice for WO-XXXX'." },
      { title: "Review all line items", content: "Check every line item: descriptions are clear and professional (these are customer-facing), quantities are correct, and prices match what was communicated in the estimate." },
      { title: "Apply tax and discounts", content: "The tax rate auto-calculates based on your shop's configured rate in Settings → Organization. If tax is not applicable (e.g., parts sold to a commercial operator with a resale certificate), toggle 'Tax Exempt'." },
      { title: "Add a shop discount if applicable", content: "If you want to offer a loyalty discount or honor a quoted price that differs from actual time, add a discount line. Discounts appear as a negative line item, maintaining full transparency." },
      { title: "Send the invoice", content: "Click 'Send Invoice' to email the customer. Options: include PDF attachment, include payment link, CC yourself. The payment link allows customers to pay online via credit card — reducing collection time significantly.", tip: "Enable payment links for all invoices. Customers who can pay online pay 3x faster on average than those who must mail a check or call in." },
      { title: "Mark as paid when payment received", content: "When payment is received (by check, cash, or online), click 'Mark as Paid' on the invoice. This closes the invoice, logs the payment date, and updates the customer's account balance." },
    ],
    related: ["mech-invoice-send", "mech-invoice-status", "mech-ai-invoice"],
  },

  {
    id: "mech-invoice-send",
    title: "Sending & Tracking Invoice Payments",
    category: "Invoices & Billing",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["invoice", "payment", "tracking", "overdue", "reminder", "paid"],
    description: "Track payment status across all your invoices. Send reminders for overdue invoices, record payments, and generate payment reports for accounting.",
    sim: [
      {
        label: "Invoice list — payment status overview",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Invoices" />}
            main={
              <div className="space-y-1.5">
                <div className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Invoices (7 total)</div>
                {[
                  { id: "INV-0031", customer: "John Mitchell", amount: "$1,178.20", status: "Sent", color: "blue" },
                  { id: "INV-0030", customer: "Horizon Flights", amount: "$2,340.00", status: "Paid", color: "green" },
                  { id: "INV-0029", customer: "Steve Williams", amount: "$864.50", status: "Overdue", color: "red" },
                  { id: "INV-0028", customer: "John Mitchell", amount: "$568.14", status: "Paid", color: "green" },
                ].map(inv => (
                  <div key={inv.id} className="bg-white rounded border border-gray-100 p-1.5 flex items-center gap-2 shadow-sm">
                    <div className="flex-1 min-w-0">
                      <div className="text-[7px] text-gray-800" style={{ fontWeight: 600 }}>{inv.id} · {inv.customer}</div>
                      <div className="text-[6px] text-gray-400">{inv.amount}</div>
                    </div>
                    <MBadge label={inv.status} color={inv.color as "blue" | "green" | "red"} />
                  </div>
                ))}
              </div>
            }
            topLabel="Invoices — Payment Tracking"
          />
        ),
      },
      {
        label: "Overdue invoice — send reminder",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Invoices" />}
            main={
              <div className="space-y-1.5">
                <MCard title="INV-0029 — OVERDUE 12 days" badge="Overdue" badgeColor="red" subtitle="Steve Williams · $864.50">
                  <div className="mt-1.5 space-y-1">
                    <div className="text-[6px] text-red-600">Due date: April 2, 2026 · 12 days past due</div>
                    <ToggleRow label="Include late fee ($25)" on={false} />
                  </div>
                </MCard>
                <div className="flex gap-1">
                  <HL><PBtn label="Send Reminder Email" /></HL>
                  <GBtn label="Call Customer" />
                  <GBtn label="Mark Paid" />
                </div>
              </div>
            }
            topLabel="Invoice — Overdue Reminder"
          />
        ),
      },
    ],
    steps: [
      { title: "Monitor invoice statuses", content: "In the Invoices tab, invoices are color-coded: Sent (blue), Viewed (teal — customer opened it), Paid (green), Overdue (red), Draft (gray). Check this list daily." },
      { title: "Send payment reminders", content: "For invoices more than 7 days past due, click 'Send Reminder'. The reminder email references the original invoice, the amount due, and the payment link. You can add a personal note." },
      { title: "Apply late fees", content: "If your shop policy includes late fees, toggle 'Include late fee' on the reminder and set the fee amount. This adds a line item to the invoice automatically." },
      { title: "Record manual payments", content: "When a customer pays by check or cash, click 'Mark as Paid', enter the payment date, method (check, cash, credit card, Zelle), and check number if applicable. This closes the invoice." },
      { title: "Generate payment reports", content: "Under Invoices → Reports, generate monthly billing summaries, outstanding balance reports, and payment history. These export as PDF or CSV for your accounting software.", tip: "Connect myaircraft.us to QuickBooks or Xero in Settings → Integrations to auto-sync invoice data — eliminating double entry." },
    ],
    related: ["mech-invoice-create", "mech-invoice-status"],
  },

  {
    id: "mech-invoice-status",
    title: "Invoice Status Lifecycle & Reports",
    category: "Invoices & Billing",
    persona: "mechanic",
    duration: "3 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["invoice", "status", "paid", "overdue", "reports", "accounting"],
    description: "Track every invoice from Draft to Paid. Understand each status stage and generate financial reports for your shop's accounting needs.",
    sim: [
      {
        label: "Invoice status flow",
        content: (
          <div className="h-full bg-[#f8fafc] p-3">
            <div className="text-[7px] text-gray-700 mb-2" style={{ fontWeight: 700 }}>Invoice Status Flow</div>
            <WFBar steps={["Draft", "Sent", "Viewed", "Paid"]} activeIdx={2} />
            <div className="mt-2 space-y-1">
              {[
                { s: "Draft", d: "Building invoice — not sent to customer" },
                { s: "Sent", d: "Emailed to customer — awaiting payment" },
                { s: "Viewed", d: "Customer opened the invoice email" },
                { s: "Paid", d: "Payment received and recorded" },
                { s: "Overdue", d: "Past due date without payment" },
                { s: "Void", d: "Cancelled — not billable" },
              ].map(row => (
                <div key={row.s} className="flex items-center gap-2 bg-white rounded px-2 py-0.5 border border-gray-100">
                  <span className="text-[6px] text-gray-800 w-16" style={{ fontWeight: 600 }}>{row.s}</span>
                  <span className="text-[6px] text-gray-400">{row.d}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      },
    ],
    steps: [
      { title: "Draft", content: "You're building the invoice. It's not yet visible to the customer. Review all line items and totals before sending." },
      { title: "Sent", content: "Invoice has been emailed. You can see the sent timestamp and the recipient's email address. Use 'Resend' if the customer reports not receiving it." },
      { title: "Viewed", content: "The customer has opened the invoice email or link. This notification helps you know when to expect contact from the customer." },
      { title: "Overdue", content: "The invoice passed its payment due date (configurable in Settings, typically net-30). Send a reminder and optionally add a late fee." },
      { title: "Paid / Void", content: "Paid closes the invoice. Void cancels it without payment — use for billing errors. Both create a permanent record that can't be deleted.", tip: "Never delete a voided invoice. Keep it in your records for audit purposes — it proves the billing was properly cancelled." },
    ],
    related: ["mech-invoice-create", "mech-invoice-send"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Parts Management
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-parts-search",
    title: "Parts Search & Marketplace Lookup",
    category: "Parts Management",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["parts", "marketplace", "search", "part number", "vendor", "pricing"],
    description: "Search the integrated parts marketplace to find aircraft parts by part number, description, or aircraft applicability. Compare pricing across vendors, check availability, and add directly to work orders.",
    sim: [
      {
        label: "Parts search — by part number",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Parts" />}
            main={
              <div className="space-y-1.5">
                <HL>
                  <div className="flex items-center gap-1.5 bg-white border border-blue-300 rounded-lg px-2 py-1 ring-1 ring-blue-200">
                    <span className="text-gray-400 text-[8px]">🔍</span>
                    <span className="text-[8px] text-gray-700">LW-12041</span>
                    <div className="w-0.5 h-3 bg-blue-500 animate-pulse" />
                  </div>
                </HL>
                <THead cells={["Part #", "Description", "Vendor", "Price"]} />
                <TRow cells={["LW-12041", "Alternator 14V 60A", "Aircraft Spruce", "$486.00"]} highlighted />
                <TRow cells={["LW-12041", "Alternator 14V 60A", "Univair", "$494.50"]} />
                <TRow cells={["LW-12041-E", "Alternator 14V 60A (Exchange)", "Dallas Aero", "$215.00"]} />
              </div>
            }
            topLabel="Parts — Search Results"
          />
        ),
      },
      {
        label: "Part detail — add to work order",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Parts" />}
            main={
              <div className="space-y-1.5">
                <MCard title="LW-12041 — Alternator 14V 60A" badge="In Stock" badgeColor="green" subtitle="Manufacturer: Plane-Power · Condition: New">
                  <div className="grid grid-cols-2 gap-1 mt-1.5">
                    <div className="text-[6px] text-gray-400">Aircraft Spruce<div className="text-gray-700 text-[7px]" style={{ fontWeight: 700 }}>$486.00</div></div>
                    <div className="text-[6px] text-gray-400">Ships in<div className="text-gray-700 text-[7px]" style={{ fontWeight: 700 }}>1-2 business days</div></div>
                  </div>
                </MCard>
                <div className="flex gap-1">
                  <HL><PBtn label="Add to WO-2026-0052" /></HL>
                  <GBtn label="Add to Cart" />
                  <GBtn label="Save for Later" />
                </div>
              </div>
            }
            topLabel="Parts — Add to Work Order"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Parts section", content: "Click 'Parts' in the Mechanic Portal sidebar. You'll see the search interface and any parts already in your cart or previously looked up." },
      { title: "Search by part number or description", content: "Type a full or partial part number (e.g., 'LW-12041' or 'alternator 14V') to see matching results. Results include the part number, description, condition options (new/serviceable/exchange), vendors, and real-time pricing." },
      { title: "Filter by aircraft applicability", content: "Use the 'Aircraft Applicability' filter to narrow results to parts certified for a specific aircraft make/model. This prevents ordering the wrong part.", tip: "For older aircraft, check the 'Alternate P/N' column — manufacturers change part numbers. The original part number may still be valid but the current shipping part number differs." },
      { title: "Compare vendor pricing", content: "Multiple vendors may stock the same part at different prices and lead times. The marketplace shows all available options simultaneously. Consider both price and shipping time, especially for AOG situations." },
      { title: "Add part to work order", content: "Click 'Add to WO' to add the part directly to an open work order. It auto-fills the part number, description, and current price in the WO parts line." },
      { title: "AOG parts sourcing", content: "For Aircraft on Ground situations, check the 'AOG overnight' filter to see only vendors who offer same-day or overnight shipping. These typically cost more but are critical for getting the aircraft back in service." },
    ],
    related: ["mech-wo-lineitems", "mech-wo-parts-status", "mech-parts-inventory"],
  },

  {
    id: "mech-parts-inventory",
    title: "Shop Parts Inventory Management",
    category: "Parts Management",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["parts", "inventory", "shop stock", "reorder", "tracking"],
    description: "Manage your shop's in-house parts inventory. Track quantity, set reorder thresholds, and use the inventory for quick parts assignment to work orders without marketplace lookups.",
    sim: [
      {
        label: "Shop inventory list",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Parts" />}
            main={
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Shop Inventory (24 items)</span>
                  <PBtn label="+ Add Item" />
                </div>
                <THead cells={["Part #", "Description", "Qty", "Reorder"]} />
                <TRow cells={["CH48108-1", "Oil Filter Champion", "12", "8"]} />
                <TRow cells={["AW-100+", "AeroShell W100+ Qt", "24", "12"]} highlighted />
                <TRow cells={["SA-14677", "Spark Plug Champion", "48", "24"]} />
                <TRow cells={["LW-12041", "Alternator 14V 60A", "1", "1"]} />
              </div>
            }
            topLabel="Parts — Shop Inventory"
          />
        ),
      },
    ],
    steps: [
      { title: "Add stock items", content: "Click '+ Add Item' to add parts to your shop inventory. Enter part number, description, manufacturer, quantity on hand, cost basis, and reorder threshold." },
      { title: "Set reorder thresholds", content: "The reorder threshold triggers a low-stock alert when quantity drops to or below that number. Common items like oil filters and spark plugs should have generous thresholds to avoid running out during busy periods." },
      { title: "Assign from inventory to WOs", content: "When adding parts to work orders, the system checks your shop inventory first. If a part is in stock, it's marked as 'From Inventory' and deducts the quantity automatically when the WO is closed." },
      { title: "Monitor low stock alerts", content: "The Parts section header shows a badge count for low-stock items. Review and reorder before running out. You can create a purchase order directly from the inventory reorder screen.", tip: "Link your common parts inventory to Aircraft Spruce, Univair, or your preferred distributor in Settings → Integrations to enable one-click reordering." },
    ],
    related: ["mech-parts-search", "mech-wo-lineitems"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Customers & Aircraft
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-customers-overview",
    title: "Customer Records Management",
    category: "Customers & Aircraft",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["customers", "records", "contact", "aircraft owner", "billing", "history"],
    description: "Manage your shop's customer database. Each customer record links to their aircraft, full maintenance history, open work orders, pending invoices, and contact information — all in one view.",
    sim: [
      {
        label: "Customer list with quick stats",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Customers" />}
            main={
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Customers (12)</span>
                  <PBtn label="+ Add Customer" />
                </div>
                {[
                  { name: "John Mitchell", aircraft: "N12345, N24680", wos: "2 open", balance: "$0 due" },
                  { name: "Horizon Flights Inc.", aircraft: "N67890", wos: "1 open", balance: "$2,340" },
                  { name: "Steve Williams", aircraft: "N24680", wos: "0 open", balance: "$864 overdue" },
                ].map(c => (
                  <div key={c.name} className="bg-white rounded border border-gray-100 p-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[7px] text-gray-800" style={{ fontWeight: 600 }}>{c.name}</span>
                      <MBadge label={c.balance.includes("overdue") ? c.balance : c.balance === "$0 due" ? "Paid" : c.balance} color={c.balance.includes("overdue") ? "red" : c.balance === "$0 due" ? "green" : "blue"} />
                    </div>
                    <div className="text-[6px] text-gray-400 mt-0.5">{c.aircraft} · {c.wos}</div>
                  </div>
                ))}
              </div>
            }
            topLabel="Customers — List View"
          />
        ),
      },
      {
        label: "Customer detail — complete record",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Customers" />}
            main={
              <div className="space-y-1.5">
                <MCard title="John Mitchell" badge="Active" badgeColor="green" subtitle="john@mitchellaviation.com · (512) 555-0147">
                  <div className="grid grid-cols-2 gap-1 mt-1.5">
                    <MBadge label="2 Aircraft" color="blue" />
                    <MBadge label="3 Open WOs" color="amber" />
                    <MBadge label="$0 Balance" color="green" />
                    <MBadge label="14 Total Invoices" color="gray" />
                  </div>
                </MCard>
                <div className="flex gap-1">
                  <GBtn label="View WOs" />
                  <GBtn label="View Invoices" />
                  <PBtn label="New Work Order" />
                </div>
              </div>
            }
            topLabel="Customer Detail — John Mitchell"
          />
        ),
      },
    ],
    steps: [
      { title: "View all customers", content: "Click 'Customers' in the sidebar. Each customer card shows their aircraft, open work orders, and outstanding invoice balance. Red balance badges indicate overdue invoices." },
      { title: "Add a new customer", content: "Click '+ Add Customer'. Enter full name, company (if applicable), email, phone, and address. The billing email is used for all invoice delivery. You can add notes about billing terms or preferences." },
      { title: "Link aircraft to customers", content: "On the customer detail page, click '+ Link Aircraft' and select from the aircraft in your system, or enter a new N-number. A customer can have multiple aircraft, and one aircraft can have multiple contacts (owner, co-owner, lessee)." },
      { title: "View full customer history", content: "The customer detail page shows every work order, invoice, logbook entry, and squawk associated with their aircraft — complete maintenance and billing history in one view.", tip: "When a customer calls with a question, open their record first. You'll have their complete history available immediately without searching multiple screens." },
      { title: "Manage billing preferences", content: "Set customer-specific billing preferences: tax exempt status, preferred payment method, net payment terms (immediate, net-15, net-30), and whether to include payment links in invoices." },
    ],
    related: ["mech-team-manage", "mech-wo-create", "mech-invoice-create"],
  },

  {
    id: "mech-aircraft-assign",
    title: "Aircraft Management & Mechanic Assignment",
    category: "Customers & Aircraft",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["aircraft", "assignment", "access", "customer", "mechanic", "permissions"],
    description: "View and manage the aircraft in your care. Assign mechanics to specific aircraft based on specialty and certification. Control which mechanics have access to each customer's aircraft records.",
    sim: [
      {
        label: "Aircraft list in Mechanic Portal",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <div className="text-[8px] text-gray-700 mb-1" style={{ fontWeight: 700 }}>Aircraft Under Care (3)</div>
                {[
                  { tail: "N12345", model: "Cessna 172S", owner: "John Mitchell", status: "Airworthy", wos: "2" },
                  { tail: "N67890", model: "Piper PA-28", owner: "Horizon Flights", status: "AOG", wos: "1" },
                  { tail: "N24680", model: "Beechcraft A36", owner: "Steve Williams", status: "Airworthy", wos: "0" },
                ].map(ac => (
                  <div key={ac.tail} className="bg-white rounded border border-gray-100 p-2 flex items-center gap-2 shadow-sm">
                    <HealthRingSim pct={ac.status === "AOG" ? 38 : 88} />
                    <div className="flex-1">
                      <div className="text-[7px] text-gray-800" style={{ fontWeight: 700 }}>{ac.tail} — {ac.model}</div>
                      <div className="text-[6px] text-gray-400">{ac.owner} · {ac.wos} active WOs</div>
                    </div>
                    <MBadge label={ac.status} color={ac.status === "AOG" ? "red" : "green"} />
                  </div>
                ))}
              </div>
            }
            topLabel="Aircraft — Under Care"
          />
        ),
      },
      {
        label: "Assign mechanic to aircraft",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="N12345 — Mechanics Assigned" subtitle="Cessna 172S · John Mitchell">
                  <div className="space-y-1 mt-1.5">
                    {[
                      { name: "Mike Torres", role: "Lead/IA", access: "Full", active: true },
                      { name: "Dana Lee", role: "Mechanic", access: "WO Only", active: true },
                    ].map(m => (
                      <div key={m.name} className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-[#2563EB] text-white text-[5px] flex items-center justify-center" style={{ fontWeight: 700 }}>{m.name.split(" ").map(n => n[0]).join("")}</div>
                        <span className="text-[7px] text-gray-700 flex-1">{m.name} · {m.role}</span>
                        <MBadge label={m.access} color="blue" />
                        <ToggleRow label="" on={m.active} />
                      </div>
                    ))}
                    <GBtn label="+ Assign Mechanic" className="w-full" />
                  </div>
                </MCard>
              </div>
            }
            topLabel="Aircraft — Mechanic Assignment"
          />
        ),
      },
    ],
    steps: [
      { title: "View assigned aircraft", content: "The Aircraft tab in the Mechanic Portal shows all aircraft you've been assigned access to, their current health status, active work orders, and the customer owner." },
      { title: "Open an aircraft detail", content: "Click any aircraft to see its full maintenance history, open squawks, active work orders, and document record — all in one place. This is your complete briefing for any aircraft you're working on." },
      { title: "Assign mechanics to aircraft", content: "In the aircraft detail, go to the Mechanics tab and click '+ Assign Mechanic'. Select the mechanic and their access level: Full (all records), WO Only (work orders and parts), or Read Only." },
      { title: "Toggle mechanic access on/off", content: "Use the toggle switch next to each mechanic's assignment to temporarily disable their access to an aircraft (e.g., if they're on leave) without removing the assignment entirely.", tip: "Access changes take effect immediately. If a mechanic is currently logged in and you disable their access, they'll see the aircraft removed from their portal within 60 seconds." },
      { title: "View aircraft maintenance timeline", content: "The Maintenance tab on the aircraft shows a chronological timeline of all work orders, logbook entries, and squawks — a complete aircraft history that never gets lost." },
    ],
    related: ["mech-customers-overview", "mech-team-manage"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Team Management
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-team-manage",
    title: "Managing Your Maintenance Team",
    category: "Team Management",
    persona: "mechanic",
    duration: "5 min",
    difficulty: "Intermediate",
    pinned: true,
    tags: ["team", "manage", "roles", "permissions", "mechanics", "A&P", "Lead IA"],
    description: "Build and manage your maintenance team in myaircraft.us. Add mechanics, assign roles, customize permissions, set labor rates, and control what each team member can see and do in the portal.",
    sim: [
      {
        label: "Team list in Settings",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Team (4 members)</span>
                  <PBtn label="+ Invite Mechanic" />
                </div>
                {[
                  { name: "Mike Torres", role: "Lead Mechanic / IA", cert: "A&P/IA", status: "Active" },
                  { name: "Dana Lee", role: "Mechanic", cert: "A&P", status: "Active" },
                  { name: "Chris Park", role: "Apprentice Mechanic", cert: "Student A&P", status: "Active" },
                  { name: "Tom Baker", role: "Read Only", cert: "None", status: "Invited" },
                ].map(m => (
                  <div key={m.name} className="bg-white rounded border border-gray-100 p-1.5 flex items-center gap-2 shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-[#2563EB] text-white text-[6px] flex items-center justify-center shrink-0" style={{ fontWeight: 700 }}>{m.name.split(" ").map(n => n[0]).join("")}</div>
                    <div className="flex-1">
                      <div className="text-[7px] text-gray-800" style={{ fontWeight: 600 }}>{m.name}</div>
                      <div className="text-[6px] text-gray-400">{m.role} · {m.cert}</div>
                    </div>
                    <MBadge label={m.status} color={m.status === "Active" ? "green" : "amber"} />
                  </div>
                ))}
              </div>
            }
            topLabel="Settings → Team"
          />
        ),
      },
      {
        label: "Edit team member profile and permissions",
        content: (
          <MiniModal title="Edit — Dana Lee">
            <SelectField label="Role" value="Mechanic" />
            <SelectField label="License Type" value="A&P Mechanic" />
            <FormField label="FAA Certificate #" value="A&P-7654321" />
            <FormField label="Labor Rate ($/hr)" value="$75.00" />
            <FormField label="Specialty" value="Airframe, Sheet Metal" />
            <div className="pt-1 flex gap-1">
              <PBtn label="Save Changes" />
              <GBtn label="Edit Permissions" />
            </div>
          </MiniModal>
        ),
      },
    ],
    steps: [
      { title: "Navigate to Settings → Team", content: "Click 'Settings' at the bottom of the sidebar, then select the 'Team' tab. You'll see all team members, their roles, certification types, and current status." },
      { title: "Understand team roles", content: "There are four roles: Lead Mechanic/IA (full access, can sign annuals), Mechanic (standard work order access), Apprentice Mechanic (limited — supervised work), Read Only (view logbook only). Each role has a different permission preset." },
      { title: "Edit a team member's profile", content: "Click any team member's card to edit their profile. Update their FAA certificate number, license type, labor rate, and specialty. These fields affect work order assignments, logbook signing authority, and billing." },
      { title: "Customize individual permissions", content: "Click 'Edit Permissions' on any team member to see their full permission matrix. Toggle individual features on/off beyond their role's default. This is powerful for mechanics with unique responsibilities.", tip: "When you change a permission individually, the role label changes to 'Custom (Mechanic)' to indicate a custom permission set. This helps you track who has non-standard access." },
      { title: "Set labor rates per mechanic", content: "Each mechanic's labor rate auto-fills on work order labor lines when they're assigned. This ensures accurate billing — your Lead IA at $95/hr and apprentice at $55/hr each bill at their correct rate." },
      { title: "Deactivate or remove team members", content: "If a mechanic leaves, click 'Deactivate' to immediately revoke their portal access while preserving all their historical records. Use 'Remove' only for invite errors — deactivation is preferable for compliance audit trails." },
    ],
    related: ["mech-gs-permissions", "mech-team-invite", "mech-aircraft-assign"],
  },

  {
    id: "mech-team-invite",
    title: "Inviting New Mechanics to Your Team",
    category: "Team Management",
    persona: "mechanic",
    duration: "3 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["team", "invite", "new mechanic", "onboarding", "email invite"],
    description: "Invite new mechanics to join your myaircraft.us portal. They receive an email invitation, create their account (or use an existing one), and are immediately active in your team with the permissions you set.",
    sim: [
      {
        label: "Send invitation form",
        content: (
          <MiniModal title="Invite New Team Member">
            <FormField label="Full Name" value="Sarah Chen" focused />
            <FormField label="Email Address" value="sarah.chen@bluecanyonaviation.com" />
            <SelectField label="Role" value="Mechanic" />
            <SelectField label="License Type" value="A&P Mechanic" />
            <FormField label="Labor Rate ($/hr)" value="$80.00" />
            <div className="pt-1">
              <PBtn label="📧 Send Invitation" className="w-full" />
            </div>
          </MiniModal>
        ),
      },
      {
        label: "Invitation sent — pending acceptance",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <MCard title="Sarah Chen" badge="Invited — Pending" badgeColor="amber" subtitle="sarah.chen@bluecanyonaviation.com">
                  <div className="text-[6px] text-gray-400 mt-0.5">Invitation sent April 12, 2026 · Expires in 7 days</div>
                  <div className="flex gap-1 mt-1">
                    <GBtn label="Resend" />
                    <GBtn label="Cancel" />
                  </div>
                </MCard>
              </div>
            }
            topLabel="Team — Pending Invitation"
          />
        ),
      },
    ],
    steps: [
      { title: "Go to Settings → Team and click Invite", content: "Navigate to Settings → Team and click '+ Invite Mechanic'. The invitation form opens." },
      { title: "Fill in the invite form", content: "Enter the mechanic's name, email address, initial role, and optionally their labor rate and license type. These can be updated later by the mechanic or by you." },
      { title: "Send the invitation", content: "Click 'Send Invitation'. The mechanic receives an email with a secure invitation link that expires in 7 days. They click the link, create (or log into) their myaircraft.us account, and are immediately added to your team." },
      { title: "Monitor pending invitations", content: "On the Team page, pending invitations show a yellow 'Invited — Pending' badge. If the mechanic hasn't accepted after 3 days, click 'Resend' to send a reminder invitation.", tip: "Check with the mechanic to ensure they received the invitation email. It may be in their spam folder. The invitation domain is no-reply@myaircraft.us." },
      { title: "Invitation acceptance", content: "Once the mechanic accepts, their badge changes to 'Active' and they can access the portal with the permissions set at invitation time. You can adjust their permissions at any time afterward." },
    ],
    related: ["mech-team-manage", "mech-gs-permissions"],
  },

  {
    id: "mech-team-role-switch",
    title: "Viewing As: Switching Between Mechanic Views",
    category: "Team Management",
    persona: "mechanic",
    duration: "3 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["viewing as", "role switch", "team", "permissions", "perspective"],
    description: "The 'Viewing As' feature lets you experience the portal from any team member's perspective. Use it to verify permissions, help a team member troubleshoot, or understand what each role sees.",
    sim: [
      {
        label: "Viewing As selector in sidebar",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                  <div className="text-[6px] text-blue-600 mb-1" style={{ fontWeight: 700 }}>CURRENTLY VIEWING AS</div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-[#2563EB] text-white text-[6px] flex items-center justify-center" style={{ fontWeight: 700 }}>DL</div>
                    <div>
                      <div className="text-[7px] text-blue-800" style={{ fontWeight: 700 }}>Dana Lee</div>
                      <div className="text-[6px] text-blue-600">Mechanic — Custom Permissions</div>
                    </div>
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-1.5 text-[6px] text-amber-700">
                  ⚠️ You are viewing as Dana Lee. Her permission restrictions are in effect. Switch back to Mike Torres for full access.
                </div>
              </div>
            }
            topLabel="Viewing As — Dana Lee"
          />
        ),
      },
    ],
    steps: [
      { title: "Open the Viewing As selector", content: "In the Mechanic Portal sidebar (when expanded), click the 'Viewing As' dropdown showing the current mechanic's name and avatar. A dropdown lists all active team members." },
      { title: "Select a different mechanic", content: "Click any team member's name to switch to their perspective. The portal immediately updates to show exactly what that mechanic sees — their navigation items, accessible aircraft, and available features." },
      { title: "Check permission restrictions in action", content: "This is the best way to verify that your permission settings are working correctly. For example, switch to an Apprentice Mechanic view to confirm they can't see the Invoice tab or AI Command Center." },
      { title: "Help team members troubleshoot", content: "If a mechanic reports they can't find a feature, switch to their view to diagnose the problem. You can identify missing permissions immediately without the mechanic needing to describe what they see.", tip: "The Viewing As banner (amber bar) reminds you that you're in someone else's view. Your own data and actions are not affected — you're observing, not acting as that person." },
      { title: "Return to your own view", content: "Click the Viewing As selector and choose yourself (the Lead Mechanic or account owner) to return to full access. Or click 'Return to My View' in the amber banner." },
    ],
    related: ["mech-team-manage", "mech-gs-permissions"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Settings & Configuration
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-settings-shop",
    title: "Shop Settings: Organization & Branding",
    category: "Settings & Configuration",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["settings", "organization", "shop", "branding", "logo", "FAA certificate"],
    description: "Configure your shop's organizational details: company name, FAA Repair Station certificate number, address, shop logo, and invoice footer text. These appear on all customer-facing documents.",
    sim: [
      {
        label: "Organization settings form",
        content: (
          <MiniModal title="Organization Settings">
            <FormField label="Shop Name" value="Blue Canyon Aviation LLC" focused />
            <FormField label="FAA Repair Station #" value="ZCR0022K" />
            <SelectField label="Ratings" value="Airframe · Powerplant · Avionics" />
            <FormField label="Address" value="1234 Hangar Ln, Kerrville, TX 78028" />
            <FormField label="Invoice Footer" value="Thank you for trusting Blue Canyon Aviation." />
            <div className="pt-1"><PBtn label="Save Organization" /></div>
          </MiniModal>
        ),
      },
      {
        label: "Invoice branding preview",
        content: (
          <div className="h-full bg-[#f8fafc] p-2">
            <div className="bg-white rounded-lg border border-gray-100 p-2 shadow-sm">
              <div className="flex items-center gap-2 mb-2 border-b border-gray-100 pb-1.5">
                <div className="w-8 h-8 bg-[#0A1628] rounded flex items-center justify-center text-white text-[8px]">✈</div>
                <div>
                  <div className="text-[8px] text-gray-800" style={{ fontWeight: 700 }}>Blue Canyon Aviation LLC</div>
                  <div className="text-[6px] text-gray-400">FAA Rep. Station ZCR0022K · 1234 Hangar Ln, Kerrville TX</div>
                </div>
              </div>
              <div className="text-[7px] text-gray-600 mb-1" style={{ fontWeight: 600 }}>INVOICE INV-2026-0031</div>
              <div className="text-[6px] text-gray-400">Thank you for trusting Blue Canyon Aviation.</div>
            </div>
          </div>
        ),
      },
    ],
    steps: [
      { title: "Navigate to Settings → Organization", content: "Click Settings at the bottom of the sidebar, then the Organization tab. These settings affect every customer-facing document generated by myaircraft.us." },
      { title: "Enter your shop name and FAA certificate", content: "Enter your legal business name, FAA Repair Station certificate number (if applicable), and your repair station ratings. These appear in the header of all work orders, invoices, and logbook entries." },
      { title: "Upload your shop logo", content: "Click 'Upload Logo' to add your shop logo. The logo appears on the top left of all PDF documents. Use a white or transparent background image for best results." },
      { title: "Set invoice footer text", content: "The invoice footer is your opportunity to add a thank-you message, payment terms reminder, or website URL. Keep it brief and professional.", tip: "Include your payment terms in the footer: 'Payment due within 30 days. Late payments subject to 1.5%/month finance charge.' This sets clear expectations." },
      { title: "Configure tax settings", content: "Set your default tax rate. This applies to all invoices automatically. Rates are set per jurisdiction (city/county/state). If you're in a state with no sales tax on aviation services, set rate to 0%." },
    ],
    related: ["mech-gs-profile", "mech-settings-billing", "mech-invoice-create"],
  },

  {
    id: "mech-settings-billing",
    title: "Billing Settings: Rates, Tax & Payment Terms",
    category: "Settings & Configuration",
    persona: "mechanic",
    duration: "3 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["billing", "rates", "tax", "payment terms", "settings", "accounting"],
    description: "Configure your shop's default labor rates, tax settings, payment terms, and preferred payment methods. These settings are the foundation of accurate, consistent invoicing.",
    sim: [
      {
        label: "Billing configuration",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="bg-white rounded-lg border border-gray-100 p-2">
                <div className="text-[7px] text-gray-700 mb-1.5" style={{ fontWeight: 700 }}>Billing Settings</div>
                <ToggleRow label="Apply sales tax to labor" on={false} />
                <ToggleRow label="Apply sales tax to parts" on={true} />
                <ToggleRow label="Apply sales tax to outside services" on={false} />
                <div className="border-t border-gray-100 pt-1 mt-1">
                  <FormField label="Default Tax Rate (%)" value="7.50" />
                  <SelectField label="Default Payment Terms" value="Net 30 days" />
                  <ToggleRow label="Include payment link on invoices" on={true} />
                </div>
              </div>
            }
            topLabel="Settings → Billing Configuration"
          />
        ),
      },
    ],
    steps: [
      { title: "Configure tax applicability", content: "In most states, aviation labor and services are exempt from sales tax while parts are taxable. Configure tax to apply only to parts by default — check with your tax advisor for state-specific rules." },
      { title: "Set default payment terms", content: "Choose: Due on Receipt, Net-15, Net-30, or Net-45. Net-30 is standard for most aviation shops. This applies to all new invoices unless overridden for a specific customer." },
      { title: "Enable payment links", content: "Turn on 'Include payment link on invoices' to add a clickable payment button in invoice emails. Customers can pay by credit card instantly, reducing collection cycles from weeks to hours." },
      { title: "Set per-mechanic rates vs. shop rate", content: "You can use a uniform shop rate for all mechanics, or use per-mechanic rates (set in each mechanic's profile). Per-mechanic rates are more accurate if you have Lead mechanics (higher rate) and apprentices (lower rate) on the same jobs.", tip: "Using a blended shop rate simplifies billing and prevents customers from questioning why different mechanics have different rates." },
    ],
    related: ["mech-settings-shop", "mech-invoice-create"],
  },

  {
    id: "mech-settings-integrations",
    title: "Integrations: FlightAware, QuickBooks & More",
    category: "Settings & Configuration",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Advanced",
    pinned: false,
    tags: ["integrations", "FlightAware", "QuickBooks", "API", "Xero", "ADS-B"],
    description: "Connect myaircraft.us to your existing tools and services. Integrations with flight tracking, accounting software, and parts vendors create a seamless maintenance management ecosystem.",
    sim: [
      {
        label: "Available integrations list",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <div className="text-[8px] text-gray-700" style={{ fontWeight: 700 }}>Available Integrations</div>
                {[
                  { name: "QuickBooks Online", category: "Accounting", status: "Connected", color: "green" },
                  { name: "Xero", category: "Accounting", status: "Available", color: "gray" },
                  { name: "FlightAware", category: "Flight Tracking", status: "Connected", color: "green" },
                  { name: "ADS-B Exchange", category: "Flight Tracking", status: "Available", color: "gray" },
                  { name: "Aircraft Spruce API", category: "Parts Pricing", status: "Available", color: "gray" },
                ].map(i => (
                  <div key={i.name} className="bg-white rounded border border-gray-100 p-1.5 flex items-center gap-2 shadow-sm">
                    <div className="w-4 h-4 bg-gray-100 rounded flex items-center justify-center text-[7px]">⚙</div>
                    <div className="flex-1">
                      <div className="text-[7px] text-gray-800" style={{ fontWeight: 600 }}>{i.name}</div>
                      <div className="text-[5px] text-gray-400">{i.category}</div>
                    </div>
                    <MBadge label={i.status} color={i.color as "green" | "gray"} />
                  </div>
                ))}
              </div>
            }
            topLabel="Settings → API & Integrations"
          />
        ),
      },
    ],
    steps: [
      { title: "Navigate to Settings → API & Integrations", content: "All available integrations are listed here with their connection status. Integrations marked 'Connected' are active and syncing data." },
      { title: "QuickBooks / Xero integration", content: "When connected to QuickBooks or Xero, invoices created in myaircraft.us automatically sync to your accounting software as new invoices. Payments recorded in either system sync bidirectionally. This eliminates all double-entry.", tip: "Enable the 'Auto-sync closed invoices' option to push invoices to accounting software the moment they're marked Sent. Don't wait for payment — sync on send for accurate AR aging." },
      { title: "FlightAware / ADS-B integration", content: "Connect FlightAware or ADS-B Exchange to see live aircraft position data for your customers' aircraft. This helps track Hobbs and tach time more accurately, and lets you see when aircraft return from flights that might affect maintenance scheduling." },
      { title: "Parts vendor APIs", content: "Connect to Aircraft Spruce or other vendors to get real-time pricing and availability in your parts lookup. Without this integration, parts prices are from the marketplace cache which may be days old." },
      { title: "API key management", content: "Each integration uses an API key from the third-party service. Go to the third-party service's developer settings to generate the key, then paste it into myaircraft.us. Keys are stored encrypted and never displayed after initial entry." },
    ],
    related: ["mech-settings-shop", "mech-parts-search", "mech-invoice-send"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Compliance & AD Tracking
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-compliance-ad",
    title: "AD Compliance Tracking & Research",
    category: "Compliance",
    persona: "mechanic",
    duration: "5 min",
    difficulty: "Intermediate",
    pinned: true,
    tags: ["AD", "airworthiness directive", "compliance", "FAA", "mandatory", "tracking"],
    description: "Track Airworthiness Directive compliance for every aircraft in your care. Research applicable ADs, document compliance actions, and get alerts when recurring ADs come due — ensuring no aircraft slips through the cracks.",
    sim: [
      {
        label: "AD compliance overview per aircraft",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Aircraft" />}
            main={
              <div className="space-y-1.5">
                <MCard title="N67890 — AD Compliance Status" badge="2 Due Soon" badgeColor="amber" subtitle="Piper PA-28-181 · Last reviewed April 1, 2026">
                  <div className="space-y-0.5 mt-1.5">
                    {[
                      { ad: "AD 2024-15-06", desc: "Fuel tank sump drain", due: "12 days", color: "red" },
                      { ad: "AD 2023-07-03R1", desc: "Elevator control rod", due: "47 days", color: "amber" },
                      { ad: "AD 2022-18-10", desc: "Lycoming oil pump", due: "Compliant", color: "green" },
                      { ad: "SB-PA28-100", desc: "Wing spar inspection", due: "Compliant", color: "green" },
                    ].map(ad => (
                      <div key={ad.ad} className="flex items-center gap-2 bg-gray-50 rounded px-1.5 py-1">
                        <MBadge label={ad.due} color={ad.color as "red" | "amber" | "green"} />
                        <div>
                          <div className="text-[6px] text-gray-700" style={{ fontWeight: 600 }}>{ad.ad}</div>
                          <div className="text-[5px] text-gray-400">{ad.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </MCard>
              </div>
            }
            topLabel="Aircraft → N67890 → AD Compliance"
          />
        ),
      },
      {
        label: "Documenting AD compliance in logbook",
        content: (
          <MiniModal title="Log AD Compliance — AD 2024-15-06">
            <FormField label="AD Number" value="AD 2024-15-06" />
            <SelectField label="Compliance Method" value="Accomplished per AD paragraph (b)(1)" />
            <FormField label="Date Complied" value="April 14, 2026" />
            <FormField label="TTAF at Compliance" value="4,012.4 hours" />
            <FormField label="Next Due (if recurring)" value="April 14, 2027 or 4,412 hrs TT" />
            <div className="pt-1"><PBtn label="Log AD Compliance" /></div>
          </MiniModal>
        ),
      },
    ],
    steps: [
      { title: "View AD compliance per aircraft", content: "Open any aircraft detail and click the 'ADs' or 'Compliance' tab. All applicable ADs for that make/model/engine are listed with compliance status, last complied date, and next due date for recurring ADs." },
      { title: "Research a specific AD", content: "Click any AD to see the full text, compliance requirements, and methods of compliance. The platform links directly to the FAA AD database for the latest revision." },
      { title: "Log compliance action", content: "After completing AD work, click 'Log Compliance' on the AD. Enter the compliance method, date, TTAF, and next due date. This creates both an AD compliance record and optionally a logbook entry." },
      { title: "Set up recurring AD alerts", content: "For recurring ADs (e.g., inspect every 100 hours or 12 months), the system automatically calculates the next due date and sends alerts to you and the aircraft owner when the AD is within 30 days or 25 hours of coming due." },
      { title: "Generate AD compliance reports", content: "Use the 'AD Report' button to generate a full compliance summary for an aircraft — listing all applicable ADs, compliance dates, and next due dates. This is invaluable for annual inspections and pre-purchase evaluations.", tip: "For aircraft being considered for annual inspection, run the AD report first. Identifying non-compliant ADs before starting the inspection prevents surprises that can turn an inspection into a major repair event." },
    ],
    related: ["mech-logbook-create", "mech-compliance-annual"],
  },

  {
    id: "mech-compliance-annual",
    title: "Annual Inspection Workflow (IA Required)",
    category: "Compliance",
    persona: "mechanic",
    duration: "7 min",
    difficulty: "Advanced",
    pinned: false,
    tags: ["annual", "inspection", "IA", "FAR 43.11", "airworthiness", "sign-off"],
    description: "The annual inspection is the most regulated maintenance event for GA aircraft. Learn the complete workflow in myaircraft.us — from opening the work order to generating the FAR 43.11-compliant logbook entry and IA sign-off.",
    sim: [
      {
        label: "Annual inspection work order setup",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Work Orders" />}
            main={
              <div className="space-y-1.5">
                <MCard title="WO-2026-0060 — Annual Inspection" badge="Open" badgeColor="blue" subtitle="N12345 · Cessna 172S · John Mitchell" highlighted>
                  <div className="space-y-0.5 mt-1">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full" />
                      <span className="text-[6px] text-gray-600">IA Required — Mike Torres (A&P/IA-1234567)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-gray-200 rounded-full" />
                      <span className="text-[6px] text-gray-400">Airframe inspection checklist: 0/47 items</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-gray-200 rounded-full" />
                      <span className="text-[6px] text-gray-400">Engine inspection checklist: 0/32 items</span>
                    </div>
                  </div>
                </MCard>
              </div>
            }
            topLabel="Work Order — Annual Inspection Setup"
          />
        ),
      },
      {
        label: "FAR 43.11 logbook entry with IA sign-off",
        content: (
          <div className="h-full bg-[#f8fafc] p-2">
            <div className="bg-white rounded-lg border border-gray-100 p-2 shadow-sm">
              <div className="text-[7px] text-gray-700 mb-1" style={{ fontWeight: 700 }}>Annual Inspection — FAR 43.11 Entry</div>
              <div className="text-[6px] text-gray-600 leading-relaxed">
                April 14, 2026 · Total Time: 4,012.4 hrs<br />
                <span style={{ fontWeight: 600 }}>Annual Inspection</span> performed IAW FAR 43 Appendix D. Aircraft found to be in airworthy condition. All applicable ADs complied with. Engine and airframe logs reviewed. Aircraft returned to service IAW FAR 43.11(a).<br /><br />
                <em>I certify that this aircraft has been inspected in accordance with an annual inspection and was found to be in airworthy condition.</em>
              </div>
              <div className="mt-1.5 border-t border-gray-100 pt-1">
                <SignaturePad signed={true} />
                <div className="text-[5px] text-gray-400 mt-0.5">IA Certificate: IA-1234567 · Mike Torres · April 14, 2026</div>
              </div>
            </div>
          </div>
        ),
      },
    ],
    steps: [
      { title: "Create the annual inspection work order", content: "Create a WO with the type 'Annual Inspection'. The system automatically sets the IA requirement flag, loads the standard annual inspection checklist, and validates that the assigned mechanic holds a current IA." },
      { title: "Complete the inspection checklists", content: "The WO includes Cessna/Piper/Beechcraft-specific inspection checklists (based on aircraft make). Check off items as completed. Discrepancies found are automatically added as squawks linked to this WO." },
      { title: "Document all discrepancies", content: "Every finding during the annual must be documented — either complied with (and logged), or noted as a known discrepancy the owner has accepted (with their written authorization). Never close an annual with undocumented findings." },
      { title: "Verify AD compliance", content: "During the annual, run the AD compliance report. All ADs due within the next inspection cycle must be addressed. The annual is the mandatory trigger for all recurring AD compliance.", tip: "Use AI Command: 'Show me all ADs due for N12345 in the next 12 months or 100 hours' to get a pre-inspection AD briefing." },
      { title: "Create the FAR 43.11 logbook entry", content: "After completing the inspection, create the logbook entry as type 'Annual Inspection'. The AI auto-generates the required FAR 43.11(a) return to service statement. The IA then signs with their IA certificate number." },
      { title: "IA sign-off is mandatory", content: "Annual inspections MUST be signed by an IA. The system enforces this — if the signing mechanic's profile shows A&P without IA, the sign button is disabled with a clear explanation. Get the IA to sign before returning the aircraft." },
    ],
    related: ["mech-logbook-create", "mech-logbook-sign", "mech-compliance-ad"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Advanced AI Features
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-ai-parts-lookup",
    title: "AI-Powered Parts Research",
    category: "AI Command Center",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["AI", "parts", "lookup", "research", "alternator", "manual", "IPC"],
    description: "Use the AI to research parts directly from your conversation. Ask for part numbers, cross-references, IPC references, and vendor availability — all without leaving the chat interface.",
    sim: [
      {
        label: "Ask AI to look up a part",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="What's the part number for the oil filter on a 1998 Cessna 172S with the Lycoming IO-360?" />
                <CBubble role="ai" text="For Lycoming IO-360-L2A: Champion oil filter P/N CH48108-1. Also compatible: Tempest AA48108-1 (PMA approved, slightly lower cost). Both are FAA-TSO'd." />
                <div className="flex flex-wrap gap-1 mt-1">
                  <SourceChip label="Cessna MM 12-10" />
                  <SourceChip label="Champion Catalog" />
                </div>
              </div>
            }
            topLabel="AI Command — Parts Research"
          />
        ),
      },
      {
        label: "AI cross-references to IPC and current pricing",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Show me current pricing for CH48108-1 and add the cheapest to WO-2026-0053" />
                <CBubble role="ai" text="CH48108-1 pricing: Aircraft Spruce $12.50 (in stock, ships same day), Sporty's $13.95, Univair $11.80 (3-5 day). Cheapest is Univair at $11.80. Added to WO-2026-0053." />
                <HL>
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-1.5 text-[6px] text-emerald-700">✓ Part added to WO-2026-0053 · Univair · $11.80</div>
                </HL>
              </div>
            }
            topLabel="AI Command — Pricing Comparison"
          />
        ),
      },
    ],
    steps: [
      { title: "Ask AI for part numbers by description", content: "Describe the part in plain English: 'What's the part number for the left magneto on a 2001 Lycoming O-360-A4M?' The AI searches the IPC (Illustrated Parts Catalog) database and returns the current part number." },
      { title: "Get PMA alternative suggestions", content: "Ask: 'Are there PMA alternatives for [part number]?' The AI lists approved PMA parts that can be substituted legally, often at lower cost. All PMA alternatives include their FAA approval number." },
      { title: "Request current pricing across vendors", content: "Ask: 'Show me pricing for [part number]' and the AI queries connected vendor APIs for real-time pricing and availability. This is faster than visiting each vendor's website separately." },
      { title: "Add parts directly to work orders from chat", content: "Tell the AI: 'Add the cheapest option to WO-XXXX' and it automatically adds the selected part to the work order with vendor, part number, and current price.", tip: "When ordering parts for multiple WOs in a single conversation, the AI tracks context and can batch-add parts: 'Add the spark plugs to WO-0053 and the oil filter to WO-0054'." },
      { title: "Research via maintenance manual reference", content: "Ask: 'What does the Cessna 172S maintenance manual say about spark plug replacement interval?' The AI searches your uploaded manual documents and returns the relevant sections with source citations." },
    ],
    related: ["mech-ai-overview", "mech-parts-search", "mech-wo-lineitems"],
  },

  {
    id: "mech-ai-schedule",
    title: "AI-Assisted Maintenance Scheduling",
    category: "AI Command Center",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Intermediate",
    pinned: false,
    tags: ["AI", "scheduling", "maintenance", "calendar", "planning", "workload"],
    description: "Use the AI to intelligently schedule upcoming maintenance events — coordinating aircraft availability, mechanic workload, parts lead times, and inspection intervals to optimize your shop's efficiency.",
    sim: [
      {
        label: "Ask AI to plan next month's schedule",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="What maintenance is coming due for all three aircraft in the next 60 days? Suggest an optimal schedule." />
                <CBubble role="ai" text="Coming due in 60 days: N67890 — AD 2024-15-06 (12 days), N12345 — annual inspection (47 days), N12345 — ELT battery (55 days), N24680 — transponder check (60 days). Suggested: Schedule N67890 AD next week, bundle N12345 ELT into annual to minimize downtime." />
              </div>
            }
            topLabel="AI Command — Maintenance Schedule Planning"
          />
        ),
      },
      {
        label: "Bundle maintenance to minimize aircraft downtime",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="AI Command" />}
            main={
              <div className="space-y-1">
                <CBubble role="user" text="Bundle the N12345 annual with ELT replacement and create the work order" />
                <CBubble role="ai" text="Created WO-2026-0060: N12345 Annual Inspection + ELT Battery Replacement. Target: April 22-24. Assigned: Mike Torres (IA). Labor estimate: 14.0 hrs. Notified John Mitchell." />
                <HL>
                  <MCard title="WO-2026-0060 Created" badge="Open" badgeColor="blue" subtitle="Bundled Annual + ELT · N12345" />
                </HL>
              </div>
            }
            topLabel="AI Command — Bundled Work Order"
          />
        ),
      },
    ],
    steps: [
      { title: "Request a maintenance forecast", content: "Ask the AI: 'What maintenance is due for all my aircraft in the next 90 days?' It cross-references AD due dates, inspection intervals, and scheduled events across all aircraft to give you a complete picture." },
      { title: "Optimize for aircraft availability", content: "Ask: 'Schedule all upcoming maintenance on N12345 to minimize downtime for John Mitchell'. The AI groups compatible maintenance items into single shop visits, reducing the total number of times the aircraft is down." },
      { title: "Account for parts lead times", content: "When scheduling, the AI factors in parts availability. If a required part has a 5-day lead time, it schedules the work order to start after the parts arrival date, preventing delays." },
      { title: "Balance mechanic workload", content: "Ask: 'Show me Mike Torres's workload for next week'. The AI lists his scheduled WOs and total estimated hours. If overloaded, suggest redistributing: 'Reassign the N24680 work to Dana Lee'." },
      { title: "Create bundled work orders", content: "After the AI suggests bundling items, confirm with: 'Create that bundled work order'. The AI creates the WO with all maintenance items, estimates labor hours, and notifies the customer." },
    ],
    related: ["mech-ai-overview", "mech-wo-create", "mech-compliance-ad"],
  },

  /* ────────────────────────────────────────────────────────────
     CATEGORY: Document Management (Mechanic)
  ──────────────────────────────────────────────────────────── */
  {
    id: "mech-documents-upload",
    title: "Uploading Maintenance Documents & Manuals",
    category: "Documents",
    persona: "mechanic",
    duration: "4 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["documents", "upload", "manual", "STC", "AD", "maintenance", "records"],
    description: "Upload maintenance manuals, STC data, work order documentation, and other records to the document vault. Once indexed by AI, documents become searchable and can be referenced in logbook entries and work orders.",
    sim: [
      {
        label: "Document upload flow",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <HL>
                  <UploadZone active={true} />
                </HL>
                <div className="flex gap-1">
                  {["PDF", "JPG", "PNG"].map(t => (
                    <MBadge key={t} label={t} color="blue" />
                  ))}
                  <span className="text-[6px] text-gray-400 ml-1">Supported formats</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded p-1.5 text-[6px] text-blue-700">Processing: AI OCR indexing in progress... 47% complete</div>
              </div>
            }
            topLabel="Documents — Upload Portal"
          />
        ),
      },
      {
        label: "Categorize the uploaded document",
        content: (
          <MiniModal title="New Document — Categorize">
            <FormField label="File Name" value="Cessna 172S MM Ch12 Oil System.pdf" />
            <SelectField label="Document Type" value="Maintenance Manual" />
            <SelectField label="Associated Aircraft" value="All C172S — Applies to All" />
            <SelectField label="Manufacturer / Issuer" value="Cessna Aircraft Company" />
            <ToggleRow label="AI-searchable (allow quote in answers)" on={true} />
            <div className="pt-1"><PBtn label="Save & Index Document" /></div>
          </MiniModal>
        ),
      },
    ],
    steps: [
      { title: "Navigate to Documents", content: "Click 'Documents' in the sidebar (available if your permissions include documents access). The document vault shows all uploaded and indexed records." },
      { title: "Upload documents", content: "Drag files to the upload zone or click to browse. Supported formats: PDF (preferred), JPG, PNG. For best OCR quality, use PDF files scanned at 300 DPI or higher. Maximum file size: 100MB per file." },
      { title: "Categorize after upload", content: "After uploading, categorize the document: Maintenance Manual, STC Data Package, AD, Inspection Report, Weight & Balance, Equipment List, or Other. This affects how the AI indexes and cites the document." },
      { title: "Associate with aircraft (optional)", content: "Link the document to a specific aircraft tail number or mark it as applying to all aircraft of a certain make/model. Aircraft-specific documents appear in that aircraft's document tab.", tip: "For maintenance manuals that apply to all aircraft of a make/model, choose 'All [Make/Model]' rather than a specific tail number. This prevents re-uploading the same manual for each aircraft." },
      { title: "Enable AI searchability", content: "Toggle 'AI-searchable' to allow the AI Command Center to reference this document in responses and logbook entries. Disable this for confidential documents (contracts, personal records) that should not be quoted." },
    ],
    related: ["mech-ai-parts-lookup", "mech-logbook-create"],
  },

  {
    id: "mech-documents-search",
    title: "Searching & Citing Maintenance Documents",
    category: "Documents",
    persona: "mechanic",
    duration: "3 min",
    difficulty: "Beginner",
    pinned: false,
    tags: ["documents", "search", "AI", "citations", "manuals", "reference"],
    description: "Search your entire document library with AI-powered semantic search. Find exact passages in maintenance manuals, reference service bulletins, and cite documents directly in logbook entries.",
    sim: [
      {
        label: "Search across all documents",
        content: (
          <SimApp
            sidebar={<MechanicSidebar active="Dashboard" />}
            main={
              <div className="space-y-1.5">
                <HL>
                  <div className="flex items-center gap-1.5 bg-white border border-blue-300 rounded-lg px-2 py-1">
                    <span className="text-gray-400 text-[8px]">🔍</span>
                    <span className="text-[8px] text-gray-700">magneto timing procedure 172</span>
                  </div>
                </HL>
                <div className="space-y-1">
                  {[
                    { doc: "Cessna 172S MM", section: "Ch 4-20", match: "\"Magneto timing: set to 25° BTC using timing light…\"" },
                    { doc: "Lycoming O-360 TM", section: "Section 7", match: "\"Magneto timing procedure — dual magneto inspection…\"" },
                  ].map(r => (
                    <div key={r.doc} className="bg-white rounded border border-gray-100 p-1.5 shadow-sm">
                      <div className="flex items-center gap-1 mb-0.5">
                        <SourceChip label={r.doc} />
                        <span className="text-[5px] text-gray-400">{r.section}</span>
                      </div>
                      <div className="text-[6px] text-gray-600 italic">{r.match}</div>
                    </div>
                  ))}
                </div>
              </div>
            }
            topLabel="Documents — AI Search Results"
          />
        ),
      },
    ],
    steps: [
      { title: "Use the document search bar", content: "In the Documents section, use the search bar to query across all uploaded documents. The AI understands natural language — search 'torque value for prop bolts PA-28' to find the exact specification." },
      { title: "Filter search by document type", content: "Narrow search results using the Type filter: All, Maintenance Manuals, ADs, STCs, Inspection Reports. For logbook references, searching Maintenance Manuals gives the most relevant results." },
      { title: "Open the document at the relevant page", content: "Click any search result to open the PDF at the exact page containing your search term. The matching text is highlighted." },
      { title: "Cite documents in logbook entries", content: "In a logbook entry, click the 'Add Citation' button and search for the relevant manual section. The citation is auto-formatted: 'IAW Cessna 172S MM Ch12-10, Rev 2022' — professional and legally compliant.", tip: "Always cite the specific chapter/section of the maintenance manual, not just the manual title. 'IAW Cessna 172S MM' is vague; 'IAW Cessna 172S MM Section 12-10' is proper FAA documentation practice." },
    ],
    related: ["mech-documents-upload", "mech-logbook-create", "mech-ai-parts-lookup"],
  },

];
