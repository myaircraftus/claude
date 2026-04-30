"use client";

import React, { useEffect, useState } from "react";
import {
  Plane, LayoutDashboard, PlaneIcon, FileText,
  Wrench, Settings, ChevronDown, User,
  Store, BookOpen, Users, HardHat, Bot, AlertTriangle,
  Receipt, ChevronRight, ArrowLeftRight, UserRound, Package,
  Sparkles, ShieldCheck,
} from "lucide-react";
import Link, { useTenantRouter } from "@/components/shared/tenant-link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { DataStoreProvider } from "./workspace/DataStore";
import { AppProvider, useAppContext } from "./AppContext";
import { BillingProvider, useBilling } from "@/components/billing/BillingProvider";
import { BillingBanner } from "@/components/billing/BillingBanner";
import { CrossPersonaUpsell } from "@/components/billing/CrossPersonaUpsell";
import { PaywallScreen } from "@/components/billing/PaywallScreen";
import type { MechanicPermissions, TeamMember } from "./AppContext";
import { PartsStoreProvider } from "./workspace/PartsStore";
import { Toaster } from "sonner";
import { OnboardingProvider, useOnboarding } from "./onboarding/OnboardingContext";
import { MyAircraftLogo } from "./MyAircraftLogo";
import { TourOverlay } from "./onboarding/TourOverlay";
import { WorkOrderChatBubble } from "@/components/chat-bubble/work-order-chat-bubble";
import { getDisplayPathname } from "@/lib/auth/tenant-routing";
import { FaraimButton } from "@/components/faraim/FaraimButton";

/* ─── Nav types ─────────────────────────────────────────────── */
type NavChild = { icon: any; label: string; tab: string; href?: string; badge?: number };
type NavItem  = {
  icon: any;
  label: string;
  href?: string;
  tab?: string;
  children?: NavChild[];
};

type OwnerAircraftSummary = {
  id: string;
  tail_number: string;
  make?: string | null;
  model?: string | null;
};

/* ─── Owner nav ─────────────────────────────────────────────── */
// Owners no longer have a top-level "Documents" entry — uploading and
// browsing aircraft records lives on the Aircraft → Documents tab so the
// flow is "pick aircraft, then docs" instead of two parallel surfaces.
// The Documents page remains for platform admins as a global monitoring
// view (failed ingestions, who uploaded what, human-review queue).
const ownerNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard",        href: "/dashboard" },
  { icon: PlaneIcon,       label: "Aircraft",         href: "/aircraft" },
  { icon: Bot,             label: "Ask / AI Command", href: "/ask" },
  { icon: Store,           label: "Marketplace",      href: "/marketplace" },
  { icon: UserRound,       label: "Users",            href: "/settings" },
];

/* ─── Mechanic nav builder ───────────────────────────────────── */
function buildMechanicNav(perm: MechanicPermissions): NavItem[] {
  const items: NavItem[] = [];

  items.push({ icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" });

  if (perm.aiCommandCenter) {
    items.push({ icon: Bot, label: "AI Command Center", href: "/workspace" });
  }

  // Mechanic Portal sub-tabs: Squawks, Estimates, Work Orders, Invoices,
  // and Logbook are intentionally NOT here at the top level. The mechanic
  // workflow always starts from the aircraft — pick the tail, then create
  // the squawk / estimate / work order / invoice from inside the Aircraft
  // → Maintenance tab. Putting them in the sidebar makes the user pick
  // an aircraft after the fact, which is the wrong order. Marketing site
  // can still describe these capabilities; in-app they're per-aircraft.
  const children: NavChild[] = [];
  if (perm.dashboard)  children.push({ icon: LayoutDashboard, label: "Dashboard",   tab: "dashboard" });
  if (perm.aircraft)   children.push({ icon: Plane,           label: "Aircraft",    tab: "aircraft",   badge: 3 });
  children.push({ icon: Package, label: "Parts", tab: "parts" });
  if (perm.logbook)    children.push({ icon: BookOpen,        label: "Logbook",     tab: "logbook",    badge: 3 });

  if (children.length === 1) {
    const ch = children[0];
    items.push({ icon: ch.icon, label: ch.label, href: "/mechanic", tab: ch.tab });
  } else if (children.length > 1) {
    items.push({ icon: Users, label: "Mechanic Portal", href: "/mechanic", children });
  }

  if (perm.settingsFull) {
    items.push({ icon: FileText, label: "Documents",   href: "/documents" });
    items.push({ icon: Store,    label: "Marketplace", href: "/marketplace" });
  }

  return items;
}

/* ─── Tour key helper ────────────────────────────────────────── */
function navKeyForLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* ─── Role badge colours ─────────────────────────────────────── */
const roleBadgeColor: Record<string, string> = {
  "Lead Mechanic / IA":  "bg-blue-100 text-blue-700",
  "Mechanic":            "bg-violet-100 text-violet-700",
  "Apprentice Mechanic": "bg-slate-100 text-slate-600",
  "Read Only":           "bg-amber-50 text-amber-700",
};

/* ═══════════════════════════════════════════════════════════════ */
export function AppLayout({
  children,
  userName = "John Mitchell",
}: {
  children: React.ReactNode;
  userName?: string;
}) {
  return (
    <AppProvider>
      <BillingProvider>
        <OnboardingProvider>
          <AppLayoutInner userName={userName}>
            {children}
          </AppLayoutInner>
        </OnboardingProvider>
      </BillingProvider>
    </AppProvider>
  );
}

function AppLayoutInner({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useTenantRouter();
  const { persona, setPersona, team, activeMechanic, setActiveMechanic } = useAppContext();
  const { status: billingStatus } = useBilling();
  const [upsellPersona, setUpsellPersona] = useState<"owner" | "mechanic" | null>(null);
  const { launchTour } = useOnboarding();

  const effectivePathname = getDisplayPathname(pathname);
  const hideSidebarPersonaSwitcher = effectivePathname === "/ask" || effectivePathname.startsWith("/ask/");

  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [ownerAircraft, setOwnerAircraft] = useState<OwnerAircraftSummary[]>([]);
  const [ownerAircraftLoaded, setOwnerAircraftLoaded] = useState(false);
  const [persistedAircraftId, setPersistedAircraftId] = useState<string | null>(null);

  const [collapsed,         setCollapsed]         = useState(false);
  const [expandedItems,     setExpandedItems]     = useState<Set<string>>(new Set(["Mechanic Portal"]));
  const [rolePickerOpen,    setRolePickerOpen]    = useState(false);

  const activeTab = searchParams?.get("tab") ?? "dashboard";

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        setIsPlatformAdmin(Boolean(payload?.profile?.is_platform_admin));
      } catch {
        // noop
      }
    }
    loadProfile();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (persona !== "owner") return;
    let cancelled = false;

    async function loadOwnerAircraft() {
      try {
        const res = await fetch("/api/aircraft", { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;

        const rows = Array.isArray(payload?.aircraft)
          ? payload.aircraft
          : Array.isArray(payload)
          ? payload
          : [];

        setOwnerAircraft(
          rows.map((aircraft: any) => ({
            id: String(aircraft.id ?? ""),
            tail_number: String(aircraft.tail_number ?? "").trim(),
            make: aircraft.make ?? null,
            model: aircraft.model ?? null,
          })).filter((aircraft: OwnerAircraftSummary) => aircraft.id && aircraft.tail_number)
        );
      } catch {
        // noop
      } finally {
        if (!cancelled) {
          setOwnerAircraftLoaded(true);
        }
      }
    }

    loadOwnerAircraft();
    return () => {
      cancelled = true;
    };
  }, [persona]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPersistedAircraftId(window.localStorage.getItem("owner_selected_aircraft_id"));
  }, []);

  const routeAircraftId = effectivePathname.startsWith("/aircraft/")
    ? effectivePathname.split("/")[2] ?? null
    : searchParams?.get("aircraft") ?? null;

  const selectedOwnerAircraft =
    ownerAircraft.find((aircraft) => aircraft.id === routeAircraftId) ??
    ownerAircraft.find((aircraft) => aircraft.id === persistedAircraftId) ??
    ownerAircraft[0] ??
    null;

  useEffect(() => {
    if (!selectedOwnerAircraft || typeof window === "undefined") return;
    window.localStorage.setItem("owner_selected_aircraft_id", selectedOwnerAircraft.id);
  }, [selectedOwnerAircraft]);

  const ownerAircraftLabel = selectedOwnerAircraft
    ? [
        selectedOwnerAircraft.tail_number,
        [selectedOwnerAircraft.make, selectedOwnerAircraft.model].filter(Boolean).join(" "),
      ].filter(Boolean).join(" · ")
    : !ownerAircraftLoaded
    ? "Loading aircraft"
    : ownerAircraft.length === 0
    ? "No aircraft yet"
    : "Aircraft";

  const ownerAskHref = selectedOwnerAircraft
    ? `/ask?aircraft=${encodeURIComponent(selectedOwnerAircraft.id)}`
    : "/ask";

  const ownerNavBase = ownerNavItems.map((item) => {
    if (item.label !== "Ask / AI Command") return item;
    return {
      ...item,
      href: ownerAskHref,
    };
  });

  const ownerNav = isPlatformAdmin
    ? [
        ...ownerNavBase,
        // Admin-only Documents view: monitors all uploads platform-wide,
        // surfaces failed ingestions and the human-review queue across orgs.
        // Owners reach their own docs via Aircraft → Documents tab.
        { icon: FileText, label: "Documents", href: "/documents" },
        { icon: ShieldCheck, label: "Admin", href: "/admin" },
        { icon: FileText, label: "Marketing CMS", href: "/admin/content" },
      ]
    : ownerNavBase;

  const navItems: NavItem[] = persona === "owner"
    ? ownerNav
    : buildMechanicNav(activeMechanic.permissions);

  function switchPersona(p: "owner" | "mechanic") {
    // If the user doesn't have an active entitlement for the target persona,
    // open the cross-persona upsell instead of navigating. canRead stays true
    // for paywalled (read-only) personas so re-subscribers can browse.
    const ent = billingStatus?.[p];
    const hasNoEntitlement = ent && ent.state === "none";
    if (hasNoEntitlement) {
      setUpsellPersona(p);
      return;
    }
    setPersona(p);
    router.push(p === "owner" ? "/dashboard" : "/mechanic");
  }

  function handleSelectMechanic(m: TeamMember) {
    setActiveMechanic(m);
    setRolePickerOpen(false);
    router.push("/mechanic");
  }

  function toggleExpand(label: string) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  const layoutStyle = {
    "--sidebar-rgb": "12 45 107",
    "--sidebar-foreground-rgb": "226 232 240",
    "--sidebar-primary-rgb": "59 130 246",
    "--sidebar-primary-foreground-rgb": "255 255 255",
    "--sidebar-accent-rgb": "22 58 122",
    "--sidebar-accent-foreground-rgb": "255 255 255",
    "--sidebar-border-rgb": persona === "mechanic" ? "162 174 198" : "172 184 205",
    "--sidebar-border-alpha": persona === "mechanic" ? "0.22" : "0.16",
    "--sidebar-ring-rgb": "59 130 246",
    "--border-rgb": persona === "mechanic" ? "223 230 241" : "226 232 240",
    "--border-alpha": "1",
  } as React.CSSProperties;

  return (
    <div
      className="h-screen flex bg-background overflow-hidden"
      style={layoutStyle}
    >
      {/* ── Sidebar ── */}
      <aside data-tour="sidebar" className={`${collapsed ? "w-[68px]" : "w-[240px]"} bg-sidebar flex flex-col transition-all duration-200 shrink-0`}>

        {/* Logo row */}
        <div
          data-tour="logo"
          className="h-16 flex items-center px-3 border-b border-sidebar-border shrink-0 cursor-pointer hover:opacity-80 transition-opacity overflow-hidden"
          onClick={() => setCollapsed((c) => !c)}
        >
          <MyAircraftLogo variant="light" height={collapsed ? 11 : 26} />
        </div>

        {/* Persona switcher */}
        {!hideSidebarPersonaSwitcher && (
        <div data-tour="persona-switcher" className={`${collapsed ? "px-1 py-2" : "px-3 py-3"} border-b border-sidebar-border shrink-0`}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => switchPersona("owner")}
                title="Aircraft Owner"
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  persona === "owner" ? "bg-white text-[#0A1628] shadow-sm" : "text-white/40 hover:bg-white/10 hover:text-white/70"
                }`}
              >
                <User className="w-4 h-4" />
              </button>
              <button
                onClick={() => switchPersona("mechanic")}
                title="Mechanic"
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  persona === "mechanic" ? "bg-white text-[#0A1628] shadow-sm" : "text-white/40 hover:bg-white/10 hover:text-white/70"
                }`}
              >
                <HardHat className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-white/35 uppercase tracking-widest px-0.5" style={{ fontWeight: 600 }}>
                Persona
              </p>
              <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => switchPersona("owner")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] transition-all ${
                    persona === "owner" ? "bg-white text-[#0A1628] shadow-sm" : "text-white/50 hover:text-white/80"
                  }`}
                  style={{ fontWeight: persona === "owner" ? 600 : 400 }}
                >
                  <User className="w-3 h-3 shrink-0" />
                  Owner
                </button>
                <button
                  onClick={() => switchPersona("mechanic")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] transition-all ${
                    persona === "mechanic" ? "bg-white text-[#0A1628] shadow-sm" : "text-white/50 hover:text-white/80"
                  }`}
                  style={{ fontWeight: persona === "mechanic" ? 600 : 400 }}
                >
                  <HardHat className="w-3 h-3 shrink-0" />
                  Mechanic
                </button>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Mechanic "Viewing As" role picker */}
        {persona === "mechanic" && !collapsed && (
          <div className="px-3 pt-3 pb-2 border-b border-sidebar-border shrink-0 relative">
            <p className="text-[10px] text-white/35 uppercase tracking-widest px-0.5 mb-1.5" style={{ fontWeight: 600 }}>
              Viewing As
            </p>
            <button
              onClick={() => setRolePickerOpen((o) => !o)}
              className="w-full flex items-center gap-2 bg-white/8 hover:bg-white/12 transition-colors rounded-lg px-2.5 py-2"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] ${activeMechanic.color}`} style={{ fontWeight: 700 }}>
                {activeMechanic.initials}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-white text-[12px] truncate" style={{ fontWeight: 600 }}>
                  {activeMechanic.name}
                </div>
                <div className="text-white/50 text-[10px] truncate">{activeMechanic.role}</div>
              </div>
              <ArrowLeftRight className="w-3.5 h-3.5 text-white/40 shrink-0" />
            </button>

            <AnimatePresence>
              {rolePickerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-3 right-3 top-full mt-1 bg-[#1E3A5F] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="p-1.5 space-y-0.5">
                    {team.map((m) => {
                      const isActive = m.id === activeMechanic.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => handleSelectMechanic(m)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                            isActive ? "bg-white/15" : "hover:bg-white/8"
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] ${m.color}`} style={{ fontWeight: 700 }}>
                            {m.initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-[12px] truncate" style={{ fontWeight: isActive ? 600 : 400 }}>
                              {m.name}
                            </div>
                            <div className="text-white/50 text-[10px] truncate">{m.role}</div>
                          </div>
                          {isActive && (
                            <span className="text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full shrink-0" style={{ fontWeight: 700 }}>
                              Active
                            </span>
                          )}
                          {m.status === "Invited" && !isActive && (
                            <span className="text-[9px] text-amber-400/70 shrink-0">Invited</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-3 py-2 border-t border-white/10">
                    <p className="text-[10px] text-white/30 text-center">
                      Switch to see their role view
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Aircraft selector — owner only */}
        {persona === "owner" && !collapsed && (
          <div data-tour="aircraft-selector" className="mx-3 mt-3 mb-1 p-2.5 rounded-lg bg-sidebar-accent cursor-pointer hover:bg-white/10 transition-colors shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] text-white/50 uppercase tracking-wider" style={{ fontWeight: 600 }}>
                  Aircraft
                </div>
                <div className="text-white text-[13px]" style={{ fontWeight: 500 }}>
                  {ownerAircraftLabel}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-white/40" />
            </div>
          </div>
        )}

        {/* Nav */}
        <nav data-tour="nav" className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
          {navItems.map((item) => {
            const hasChildren = !!item.children?.length;
            const isExpanded  = expandedItems.has(item.label);
            const isOnMechanic = effectivePathname.startsWith("/mechanic");
            const navKey = navKeyForLabel(item.label);

            const parentActive = hasChildren
              ? isOnMechanic
              : item.tab
              ? isOnMechanic && activeTab === item.tab
              : item.href === "/dashboard"
              ? effectivePathname === "/dashboard"
              : !!item.href && effectivePathname.startsWith(item.href);

            if (hasChildren) {
              return (
                <div key={item.label} data-tour={`nav-${navKey}`}>
                  <button
                    onClick={() => collapsed ? router.push(item.href!) : toggleExpand(item.label)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors ${
                      parentActive
                        ? "bg-sidebar-accent text-white"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-white"
                    }`}
                    style={{ fontWeight: parentActive ? 500 : 400 }}
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronRight className={`w-3.5 h-3.5 text-white/40 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                      </>
                    )}
                  </button>

                  {!collapsed && isExpanded && (
                    <div className="mt-0.5 ml-3 pl-3 border-l border-[#A2B3CF]/25 space-y-0.5">
                      {item.children!.map((child) => {
                        const childActive = child.href
                          ? effectivePathname.startsWith(child.href)
                          : isOnMechanic && activeTab === child.tab;
                        const childKey = navKeyForLabel(child.label);
                        return (
                          <Link
                            key={child.tab}
                            data-tour={`nav-${childKey}`}
                            href={child.href ?? `/mechanic?tab=${child.tab}`}
                            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] transition-colors ${
                              childActive
                                ? "bg-white/15 text-white"
                                : "text-sidebar-foreground/55 hover:bg-white/10 hover:text-white"
                            }`}
                            style={{ fontWeight: childActive ? 600 : 400 }}
                          >
                            <child.icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="flex-1">{child.label}</span>
                            {child.badge ? (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${childActive ? "bg-white/20 text-white" : "bg-white/10 text-white/50"}`} style={{ fontWeight: 700 }}>
                                {child.badge}
                              </span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            if (item.tab) {
              return (
                <Link
                  key={item.label}
                  data-tour={`nav-${navKey}`}
                  href={`/mechanic?tab=${item.tab}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors ${
                    parentActive
                      ? "bg-sidebar-accent text-white"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-white"
                  }`}
                  style={{ fontWeight: parentActive ? 500 : 400 }}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && item.label}
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                data-tour={`nav-${navKey}`}
                href={item.href!}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors ${
                  parentActive
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-white"
                }`}
                style={{ fontWeight: parentActive ? 500 : 400 }}
              >
                <item.icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        {/* FAR/AIM AI search — above Guided Tour, hidden when entitlement check fails */}
        <div data-tour="faraim" className={`${collapsed ? 'px-2' : 'px-2'} pb-1 shrink-0`}>
          <FaraimButton variant="sidebar" collapsed={collapsed} />
        </div>

        {/* Guided Tour button — above user footer */}
        {!collapsed && (
          <div data-tour="guided-tour" className="px-2 pb-1 shrink-0">
            <button
              onClick={() => launchTour()}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-all group"
              style={{ color: "rgba(255,255,255,0.4)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.85)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
            >
              <Sparkles className="w-4 h-4 shrink-0 text-blue-400/60" />
              <span style={{ fontWeight: 500 }}>Guided Tour</span>
              <span
                className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(37,99,235,0.25)", color: "#93c5fd", fontWeight: 700 }}
              >
                NEW
              </span>
            </button>
          </div>
        )}

        {/* User footer */}
        {(() => {
          const onSettings = effectivePathname.startsWith("/settings");
          const name   = persona === "mechanic" ? activeMechanic.name  : userName;
          const role   = persona === "mechanic" ? activeMechanic.role  : "Owner / Operator";
          const avatar = persona === "mechanic"
            ? <span>{activeMechanic.initials}</span>
            : <User className="w-4 h-4 text-white/70" />;
          const avatarBg = persona === "mechanic" ? activeMechanic.color : "bg-sidebar-accent";

          return collapsed ? (
            <div data-tour="user-footer" className="p-3 border-t border-sidebar-border shrink-0 flex justify-center">
              <Link
                href="/settings"
                title={`${name} · Settings`}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] transition-all ring-2 ${
                  onSettings ? "ring-white/60 scale-105" : "ring-transparent hover:ring-white/30"
                } ${avatarBg}`}
                style={{ fontWeight: 700 }}
              >
                {avatar}
              </Link>
            </div>
          ) : (
            <div data-tour="user-footer" className="p-2 border-t border-sidebar-border shrink-0">
              <Link
                href="/settings"
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all group ${
                  onSettings ? "bg-sidebar-accent" : "hover:bg-white/8"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] transition-all ring-2 ${
                    onSettings ? "ring-white/40" : "ring-transparent group-hover:ring-white/20"
                  } ${avatarBg}`}
                  style={{ fontWeight: 700 }}
                >
                  {avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] truncate transition-colors ${onSettings ? "text-white" : "text-white/80 group-hover:text-white"}`} style={{ fontWeight: 600 }}>
                    {name}
                  </div>
                  <div className="text-white/40 text-[11px] truncate">{role}</div>
                </div>
                <Settings
                  className={`w-3.5 h-3.5 shrink-0 transition-all ${
                    onSettings ? "text-white rotate-45" : "text-white/25 group-hover:text-white/60 group-hover:rotate-45"
                  }`}
                />
              </Link>
            </div>
          );
        })()}
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <BillingBanner persona={persona} />
        <main
          className={`flex-1 ${
            ["/workspace", "/maintenance", "/mechanic", "/invoices", "/ask", "/documents", "/settings"].includes(effectivePathname) ||
            effectivePathname.startsWith("/aircraft/") ||
            effectivePathname.startsWith("/mechanic")
              ? "overflow-hidden"
              : "overflow-auto"
          }`}
        >
          <DataStoreProvider>
            <PartsStoreProvider>
              {(() => {
                // Hard paywall: when the current persona's entitlement is
                // paywalled (trial expired, payment failed) or fully cancelled,
                // replace the page content with the upgrade picker. Settings
                // stays reachable so the user can update their card.
                const ent = billingStatus?.[persona];
                const isBillingScreen =
                  effectivePathname === "/settings" ||
                  effectivePathname.startsWith("/settings/");
                if (ent && (ent.state === "paywalled" || ent.state === "cancelled" || ent.state === "past_due") && !isBillingScreen) {
                  return <PaywallScreen persona={persona} readOnly={ent.state !== "cancelled"} />;
                }
                return children;
              })()}
            </PartsStoreProvider>
          </DataStoreProvider>
        </main>
      </div>

      <Toaster position="top-right" richColors closeButton />

      {/* ── Floating work-order chat bubble ──
          Visible on every (app) page for both personas. Tap → drawer with
          aircraft picker → active work orders → timeline + chat thread.
          Uses the existing portal_threads / thread_messages infra so
          messages flow between owner and mechanic in real time. */}
      <WorkOrderChatBubble persona={persona} />

      {/* ── Onboarding: inline guided tour overlay ── */}
      <TourOverlay />

      {/* ── Cross-persona upsell ── */}
      {upsellPersona && (
        <CrossPersonaUpsell
          persona={upsellPersona}
          open
          onClose={() => setUpsellPersona(null)}
          onTrialStarted={() => {
            setPersona(upsellPersona);
            router.push(upsellPersona === "owner" ? "/dashboard" : "/mechanic");
          }}
        />
      )}

    </div>
  );
}
