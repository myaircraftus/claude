"use client";

import React, { useEffect, useState } from "react";
import {
  Plane, LayoutDashboard, PlaneIcon, FileText,
  Wrench, Settings, ChevronDown, User,
  Store, BookOpen, Users, HardHat, Bot, AlertTriangle,
  Receipt, ChevronRight, ArrowLeftRight, UserRound, Package,
  Sparkles, ShieldCheck, LogOut, GitBranch, MapPin, Building2, Inbox, Gauge,
  ClipboardCheck, ClipboardList, Bookmark, Mailbox, ShoppingCart,
  Truck, Timer, CalendarDays, CalendarOff, Clock as ClockIcon, CalendarClock,
  DollarSign, Eye,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import Link, { useTenantRouter } from "@/components/shared/tenant-link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { DataStoreProvider } from "./workspace/DataStore";
import { AppProvider, useAppContext } from "./AppContext";
import { BillingProvider, useBilling } from "@/components/billing/BillingProvider";
import { BillingBanner } from "@/components/billing/BillingBanner";
import { CrossPersonaUpsell } from "@/components/billing/CrossPersonaUpsell";
import { PERSONA_CONFIG } from "@/lib/persona/config";
import {
  groupNavItemsByCategory,
  navCategoriesStorageKey,
  categoriesForPersona,
  type NavCategoryDef,
} from "@/lib/nav/categories";
import { PaywallScreen } from "@/components/billing/PaywallScreen";
import type { MechanicPermissions, TeamMember, Persona } from "./AppContext";
import { PartsStoreProvider } from "./workspace/PartsStore";
import { Toaster } from "sonner";
import { OnboardingProvider, useOnboarding } from "./onboarding/OnboardingContext";
import { MyAircraftLogo } from "./MyAircraftLogo";
import { TourOverlay } from "./onboarding/TourOverlay";
import { WorkOrderChatBubble } from "@/components/chat-bubble/work-order-chat-bubble";
import { HelpWidget } from "@/components/support/HelpWidget";
import { ClientErrorBoundary } from "@/components/observability/ClientErrorBoundary";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { getDisplayPathname } from "@/lib/auth/tenant-routing";
import { FaraimButton } from "@/components/faraim/FaraimButton";

/* ─── Nav types ─────────────────────────────────────────────── */
type NavChild = { icon: any; label: string; tab: string; href?: string; badge?: number };
type NavItem  = {
  icon: any;
  label: string;
  href?: string;
  tab?: string;
  badge?: number;
  children?: NavChild[];
  /** Spec 5.8 — when set, item is hidden if PersonaConfig.hiddenModules includes this key. */
  module?: string;
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
  // Spec 5.1 — Smart Home Screen as the owner home; legacy /dashboard
  // stays accessible via direct URL for the stat-card view.
  { icon: LayoutDashboard, label: "Home",             href: "/my-aircraft" },
  { icon: Inbox,           label: "AI Inbox",         href: "/inbox" },
  { icon: PlaneIcon,       label: "Aircraft",         href: "/aircraft" },
  // Documents intentionally NOT in owner top-level nav (Operations Hub
  // decision) — uploading/browsing aircraft records lives on the
  // Aircraft → Documents tab. Documents page itself stays for platform
  // admins as a global monitoring view.
  { icon: Bot,             label: "Ask / AI Command", href: "/ask" },
  { icon: ClipboardCheck,  label: "Compliance",       href: "/compliance" },
  // Spec 5.8 — Costs is an owner-finance surface; hidden for mechanics.
  { icon: DollarSign,      label: "Costs",            href: "/costs",            module: "owner-finances" },
  { icon: CalendarClock,   label: "Expirations",      href: "/documents/expiring" },
  { icon: ClipboardList,   label: "Inspections",      href: "/inspections" },
  { icon: Bookmark,        label: "Continued",        href: "/continued" },
  { icon: Mailbox,         label: "Approvals",        href: "/approvals" },
  { icon: Package,         label: "Parts",            href: "/parts" },
  { icon: ShoppingCart,    label: "Purchase orders",  href: "/purchase-orders" },
  { icon: Truck,           label: "Vendors",          href: "/vendors" },
  { icon: Wrench,          label: "Tools",            href: "/tools" },
  { icon: Timer,           label: "Time clock",       href: "/time-clock" },
  // ── Workforce group (sprints 2.5.1 + 2.5.2 + 2.5.3) ──
  { icon: CalendarDays,    label: "Scheduler",        href: "/scheduler" },
  { icon: CalendarOff,     label: "Time Off",         href: "/time-off" },
  { icon: ClockIcon,       label: "Clock In/Out",     href: "/clock" },
  { icon: Gauge,           label: "Meters",           href: "/meters" },
  { icon: MapPin,          label: "Locations",        href: "/locations" },
  { icon: Store,           label: "Marketplace",      href: "/marketplace" },
  { icon: UserRound,       label: "Users",            href: "/settings" },
];

/* ─── Mechanic nav builder ───────────────────────────────────── */
// Flat nav, no "Mechanic Portal" wrapper, no duplicate Dashboard. The
// mechanic dashboard (/mechanic?tab=dashboard) IS the dashboard for the
// mechanic persona — there is no separate /dashboard surface anymore.
//   Dashboard · Aircraft · Workflow · Parts · Logbook · Documents · Marketplace
//
// Workflow used to live inside the /maintenance hub as a tab. That hub
// has been retired (clicking a work order goes straight to its detail
// page now), so Workflow gets promoted to its own top-level route.
function buildMechanicNav(perm: MechanicPermissions): NavItem[] {
  const items: NavItem[] = [];

  // AI Inbox is visible to every persona — Spec 0.3 places it at the top
  // of the home screen. Phase 5 (Smart Home Screen) will replace the
  // dashboard with this surface.
  items.push({ icon: Inbox, label: "AI Inbox", href: "/inbox" });

  if (perm.aiCommandCenter) {
    items.push({ icon: Bot, label: "AI Command Center", href: "/workspace" });
  }

  // Flat structure (Operations Hub decision — no Mechanic Portal wrapper,
  // no duplicate Dashboard). The mechanic dashboard at /mechanic?tab=dashboard
  // IS the dashboard for the mechanic persona.
  if (perm.dashboard) {
    // Spec 5.1 — Mechanic Smart Home Screen replaces /mechanic?tab=dashboard.
    items.push({ icon: LayoutDashboard, label: "My Day", href: "/my-day" });
  }
  if (perm.aircraft) {
    items.push({ icon: Plane, label: "Aircraft", href: "/mechanic", tab: "aircraft", badge: 3 });
  }
  items.push({ icon: GitBranch, label: "Workflow", href: "/workflow" });
  items.push({ icon: Package, label: "Parts", href: "/mechanic", tab: "parts" });
  // Manuals — mechanic's reference library (parts catalogs, AMMs, SBs).
  // Org-scoped, separate from per-aircraft documents the owner uploads.
  items.push({ icon: BookOpen, label: "Manuals", href: "/manuals" });
  if (perm.logbook) {
    items.push({ icon: BookOpen, label: "Logbook", href: "/mechanic", tab: "logbook", badge: 3 });
  }

  // Documents (platform-wide) lives under Admin now — mechanics don't see
  // it. Marketplace stays for full-access mechanics.
  if (perm.settingsFull) {
    // Documents intentionally omitted — Operations Hub decision: it lives
    // under Admin now, mechanics don't see it as a top-level entry.
    items.push({ icon: ClipboardCheck, label: "Compliance",  href: "/compliance" });
    items.push({ icon: CalendarClock,  label: "Expirations", href: "/documents/expiring" });
    items.push({ icon: ClipboardList,  label: "Inspections", href: "/inspections" });
    items.push({ icon: Bookmark,       label: "Continued",   href: "/continued" });
    items.push({ icon: Mailbox,        label: "Approvals",   href: "/approvals" });
    items.push({ icon: Package,        label: "Parts",       href: "/parts" });
    items.push({ icon: ShoppingCart,   label: "Purchase orders", href: "/purchase-orders" });
    items.push({ icon: Truck,          label: "Vendors",     href: "/vendors" });
    items.push({ icon: Wrench,         label: "Tools",       href: "/tools" });
    items.push({ icon: Timer,          label: "Time clock",  href: "/time-clock" });
    // ── Workforce group (sprints 2.5.1 + 2.5.2 + 2.5.3) ──
    items.push({ icon: CalendarDays,   label: "Scheduler",   href: "/scheduler" });
    items.push({ icon: CalendarOff,    label: "Time Off",    href: "/time-off" });
    items.push({ icon: ClockIcon,      label: "Clock In/Out", href: "/clock" });
    items.push({ icon: Gauge,          label: "Meters",      href: "/meters" });
    items.push({ icon: MapPin,         label: "Locations",   href: "/locations" });
    items.push({ icon: Store,          label: "Marketplace", href: "/marketplace" });
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
  const [upsellPersona, setUpsellPersona] = useState<Persona | null>(null);
  const { launchTour } = useOnboarding();

  const effectivePathname = getDisplayPathname(pathname);
  const hideSidebarPersonaSwitcher = effectivePathname === "/ask" || effectivePathname.startsWith("/ask/");

  // null = not yet loaded; false = confirmed non-admin; true = admin.
  // Used to gate the BillingBanner so we don't briefly render "14 days
  // left in your trial" on every page nav before /api/me resolves.
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [ownerAircraft, setOwnerAircraft] = useState<OwnerAircraftSummary[]>([]);
  const [ownerAircraftLoaded, setOwnerAircraftLoaded] = useState(false);
  const [persistedAircraftId, setPersistedAircraftId] = useState<string | null>(null);
  const [orgCount, setOrgCount] = useState<number>(1);
  const [activeOrgName, setActiveOrgName] = useState<string | null>(null);

  const [collapsed,         setCollapsed]         = useState(false);
  const [expandedItems,     setExpandedItems]     = useState<Set<string>>(new Set(["Mechanic Portal"]));
  const [rolePickerOpen,    setRolePickerOpen]    = useState(false);
  // Phase 13.5 — collapsible category state, persisted to localStorage per user.
  const [profileId,           setProfileId]           = useState<string | null>(null);
  const [expandedCategories,  setExpandedCategories]  = useState<Set<string>>(new Set());
  const [categoryStateLoaded, setCategoryStateLoaded] = useState(false);

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
        // Phase 13.5 — capture user id for nav category persistence.
        if (payload?.profile?.id) setProfileId(payload.profile.id as string);
      } catch {
        // noop
      }
    }
    async function loadOrgs() {
      try {
        const res = await fetch("/api/me/orgs", { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        const memberships = Array.isArray(payload?.memberships) ? payload.memberships : [];
        setOrgCount(memberships.length);
        const active = memberships.find(
          (m: any) => m?.organization?.id === payload?.active_organization_id,
        );
        setActiveOrgName(active?.organization?.name ?? null);
      } catch {
        // noop
      }
    }
    loadProfile();
    loadOrgs();
    return () => { cancelled = true; };
  }, []);

  // Phase 13.5 — load expanded-category state from localStorage once we know
  // the user id. Default-expand the brief's "always-on" categories so the
  // nav isn't fully collapsed on first paint.
  useEffect(() => {
    if (!profileId || categoryStateLoaded) return;
    try {
      const raw = window.localStorage.getItem(navCategoriesStorageKey(profileId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setExpandedCategories(new Set(parsed.filter((s) => typeof s === "string")));
          setCategoryStateLoaded(true);
          return;
        }
      }
    } catch {
      // ignore — fall through to defaults
    }
    // First-time defaults: expand the categories marked defaultExpanded.
    const defaults = categoriesForPersona(persona)
      .filter((c) => c.defaultExpanded)
      .map((c) => c.id);
    setExpandedCategories(new Set(defaults));
    setCategoryStateLoaded(true);
  }, [profileId, persona, categoryStateLoaded]);

  // Persist whenever the user toggles a category.
  useEffect(() => {
    if (!profileId || !categoryStateLoaded) return;
    try {
      window.localStorage.setItem(
        navCategoriesStorageKey(profileId),
        JSON.stringify(Array.from(expandedCategories)),
      );
    } catch {
      // best-effort; quota errors aren't worth surfacing to the user
    }
  }, [profileId, expandedCategories, categoryStateLoaded]);

  function toggleCategory(id: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

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
    if (item.label !== "Logbook AI") return item;
    return {
      ...item,
      href: ownerAskHref,
    };
  });

  // Admin items are now ONLY accessible from the Admin persona — they don't
  // bleed into the owner nav anymore. Platform admins see a third persona
  // pill ("Admin") in the switcher; non-admins don't see it at all.
  const adminNavItems: NavItem[] = [
    { icon: ShieldCheck,    label: "Admin Console",    href: "/admin" },
    { icon: FileText,       label: "All Documents",    href: "/documents" },
    { icon: AlertTriangle,  label: "Ingestion Health", href: "/admin/ingestion-health" },
    // Phase 13.3 — global ingestion progress + error log.
    { icon: AlertTriangle,  label: "Ingestion Progress", href: "/admin/ingestion/progress" },
    { icon: AlertTriangle,  label: "Errors",           href: "/admin/errors" },
    // Phase 14 Sprint 14.5 — billing tier management.
    { icon: DollarSign,     label: "Billing — Batch",  href: "/admin/billing/batch" },
    { icon: DollarSign,     label: "Billing — Orgs",   href: "/admin/billing/orgs" },
    // Phase 8 Sprint 8.4 — vision-RAG operational dashboard.
    { icon: Eye,            label: "Vision Index",     href: "/admin/vision" },
    { icon: FileText,       label: "Marketing CMS",    href: "/admin/content" },
  ];

  const navItemsRaw: NavItem[] =
    persona === "admin"
      ? adminNavItems
      : persona === "owner"
        ? ownerNavBase
        : buildMechanicNav(activeMechanic.permissions);

  // Spec 5.8 — filter nav by PersonaConfig.hiddenModules. Items without
  // a `module` key are always visible (back-compat: existing items don't
  // need to opt in). To hide an item per persona, set `module: 'X'` on
  // the NavItem definition and add 'X' to PERSONA_CONFIG[p].hiddenModules.
  const personaHidden = new Set(PERSONA_CONFIG[persona]?.hiddenModules ?? []);
  const navItems: NavItem[] = navItemsRaw.filter(
    (item) => !item.module || !personaHidden.has(item.module)
  );

  // Phase 13.5 — group navItems into categories. Each group has its own
  // collapsible header. Items in categories the persona shouldn't see are
  // dropped entirely. The active route's category is auto-expanded so the
  // user can see where they are.
  const categorizedNav = groupNavItemsByCategory(navItems, persona);
  const activeCategoryId = (() => {
    for (const group of categorizedNav) {
      for (const item of group.items) {
        const href = item.href ?? (item.tab ? `/mechanic?tab=${item.tab}` : null);
        if (!href) continue;
        if (href === "/dashboard" && effectivePathname === "/dashboard") {
          return group.category.id;
        }
        if (href !== "/dashboard" && effectivePathname.startsWith(href)) {
          return group.category.id;
        }
      }
    }
    return null;
  })();

  function switchPersona(p: Persona) {
    // Admins switch freely between all three personas. Owners + mechanics
    // can only flip between owner ↔ mechanic (and only with the right
    // entitlement). The Admin pill is hidden for non-admins below.
    if (p === "admin") {
      setPersona("admin");
      router.push("/admin");
      return;
    }
    // Shop persona: Phase 14 paywall isn't wired to a shop SKU yet, so we
    // skip the entitlement gate (consistent with the Phase 5 decision —
    // shop has no separate billing surface). Lands on /workflow which is
    // PERSONA_CONFIG.shop.homeRoute (was /dashboard, fixed in Phase 15 F3).
    if (p === "shop") {
      setPersona("shop");
      router.push("/workflow");
      return;
    }
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

        {/* Persona switcher — Admin pill only renders for platform admins */}
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
              <button
                onClick={() => switchPersona("shop")}
                title="Shop / Dispatcher"
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  persona === "shop" ? "bg-white text-[#0A1628] shadow-sm" : "text-white/40 hover:bg-white/10 hover:text-white/70"
                }`}
              >
                <Store className="w-4 h-4" />
              </button>
              {isPlatformAdmin && (
                <button
                  onClick={() => switchPersona("admin")}
                  title="Platform Admin"
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    persona === "admin" ? "bg-white text-[#0A1628] shadow-sm" : "text-white/40 hover:bg-white/10 hover:text-white/70"
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-white/35 uppercase tracking-widest px-0.5" style={{ fontWeight: 600 }}>
                Persona
              </p>
              {/* Three or four columns depending on platform-admin visibility.
                  Phase 15 F3: Shop tab added so shop-persona users can flip
                  into /workflow without needing direct URL nav. */}
              <div className={`grid ${isPlatformAdmin ? "grid-cols-4" : "grid-cols-3"} gap-1 bg-white/5 rounded-lg p-1`}>
                <button
                  onClick={() => switchPersona("owner")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] transition-all ${
                    persona === "owner" ? "bg-white text-[#0A1628] shadow-sm" : "text-white/50 hover:text-white/80"
                  }`}
                  style={{ fontWeight: persona === "owner" ? 600 : 400 }}
                >
                  <User className="w-3 h-3 shrink-0" />
                  Owner
                </button>
                <button
                  onClick={() => switchPersona("mechanic")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] transition-all ${
                    persona === "mechanic" ? "bg-white text-[#0A1628] shadow-sm" : "text-white/50 hover:text-white/80"
                  }`}
                  style={{ fontWeight: persona === "mechanic" ? 600 : 400 }}
                >
                  <HardHat className="w-3 h-3 shrink-0" />
                  Mechanic
                </button>
                <button
                  onClick={() => switchPersona("shop")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] transition-all ${
                    persona === "shop" ? "bg-white text-[#0A1628] shadow-sm" : "text-white/50 hover:text-white/80"
                  }`}
                  style={{ fontWeight: persona === "shop" ? 600 : 400 }}
                >
                  <Store className="w-3 h-3 shrink-0" />
                  Shop
                </button>
                {isPlatformAdmin && (
                  <button
                    onClick={() => switchPersona("admin")}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] transition-all ${
                      persona === "admin" ? "bg-white text-[#0A1628] shadow-sm" : "text-white/50 hover:text-white/80"
                    }`}
                    style={{ fontWeight: persona === "admin" ? 600 : 400 }}
                  >
                    <ShieldCheck className="w-3 h-3 shrink-0" />
                    Admin
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {/* "Viewing As" team role picker was removed — the mechanic always
            sees their own permission set; team-member impersonation was
            confusing in production and not how shops actually use the app. */}

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
          {categorizedNav.map((group) => {
            // Collapsed sidebar mode: render items directly without category
            // headers (the icons-only mode wouldn't have room for headers).
            // Otherwise: render a collapsible category header with chevron.
            const isCatExpanded =
              collapsed
              || expandedCategories.has(group.category.id)
              || activeCategoryId === group.category.id;
            return (
              <div key={group.category.id}>
                {!collapsed && (
                  <button
                    onClick={() => toggleCategory(group.category.id)}
                    aria-expanded={isCatExpanded}
                    aria-controls={`nav-cat-${group.category.id}`}
                    className="w-full flex items-center gap-2 px-3 py-1.5 mt-2 mb-0.5 text-[10px] font-semibold tracking-wider uppercase text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
                  >
                    <ChevronRight
                      className={`w-3 h-3 transition-transform duration-200 ${isCatExpanded ? "rotate-90" : ""}`}
                    />
                    <span>{group.category.label}</span>
                  </button>
                )}
                <div id={`nav-cat-${group.category.id}`} hidden={!isCatExpanded}>
                  {group.items.map((item) => {
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
                </div>
              </div>
            );
          })}
        </nav>

        {/* Switch Organization — only visible if user belongs to >1 org (sprint 0a) */}
        {orgCount > 1 && !collapsed && (
          <div className="px-2 pb-1 shrink-0">
            <Link
              href="/org/switch"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-all group"
              style={{ color: "rgba(255,255,255,0.55)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.95)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
            >
              <Building2 className="w-4 h-4 shrink-0 text-blue-300/70" />
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                  Organization
                </div>
                <div className="truncate" style={{ fontWeight: 500 }}>
                  {activeOrgName ?? "Switch organization"}
                </div>
              </div>
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 text-white/40" />
            </Link>
          </div>
        )}
        {orgCount > 1 && collapsed && (
          <div className="px-2 pb-1 shrink-0 flex justify-center">
            <Link
              href="/org/switch"
              title={activeOrgName ? `${activeOrgName} · Switch organization` : "Switch organization"}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-white/55 hover:bg-white/10 hover:text-white"
            >
              <Building2 className="w-4 h-4" />
            </Link>
          </div>
        )}

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

          async function handleSignOut() {
            // POST to a server route so the HttpOnly auth cookies get cleared
            // properly — calling supabase.auth.signOut() from the browser
            // alone doesn't drop the SSR cookie, which is why the page would
            // bounce right back to the dashboard.
            try {
              await fetch("/api/auth/signout", {
                method: "POST",
                credentials: "include",
              });
            } catch {
              // network error — fall through to the hard redirect below.
              // /login also re-checks the cookie server-side, so even if the
              // cookie wasn't cleared we'll see the login form on next render.
            }
            // Also hit the browser-side signOut to clear in-memory token /
            // localStorage, defense-in-depth.
            try {
              const supabase = createBrowserSupabase();
              await supabase.auth.signOut();
            } catch {
              // ignore
            }
            // Hard navigation so every server component re-renders against
            // the now-empty cookie and all client state is dropped.
            if (typeof window !== "undefined") {
              window.location.href = "/login";
            }
          }

          return collapsed ? (
            <div data-tour="user-footer" className="p-3 border-t border-sidebar-border shrink-0 flex flex-col items-center gap-2">
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
              <button
                onClick={handleSignOut}
                title="Sign out"
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div data-tour="user-footer" className="p-2 border-t border-sidebar-border shrink-0 space-y-1">
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
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[12px] text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                style={{ fontWeight: 500 }}
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          );
        })()}
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Admin persona has no billing surface (they're staff). For owner
            and mechanic, billing banner + paywall apply normally — UNLESS
            the user is a platform admin (Phase 15.5 Task 6). Platform
            admins aren't on a real trial; suppressing the banner avoids
            "14 days left in your Aircraft Owner trial" showing up on
            every page when an admin is QAing in customer view. */}
        {/* Wait until isPlatformAdmin is known (not null) before deciding
            whether to show the banner — avoids a flash of trial copy on
            every page nav for admin sessions. */}
        {(persona === "owner" || persona === "mechanic") && isPlatformAdmin === false && (
          <BillingBanner persona={persona} />
        )}
        <main
          className={`flex-1 ${
            ["/workspace", "/maintenance", "/mechanic", "/invoices", "/ask", "/documents", "/settings", "/admin"].includes(effectivePathname) ||
            effectivePathname.startsWith("/aircraft/") ||
            effectivePathname.startsWith("/mechanic") ||
            effectivePathname.startsWith("/admin/")
              ? "overflow-hidden"
              : "overflow-auto"
          }`}
        >
          <DataStoreProvider>
            <PartsStoreProvider>
              {(() => {
                // Admin + shop personas bypass the paywall — admin is platform
                // staff (no billing) and shop has no billing surface yet
                // (Phase 5). Only owner + mechanic flow through entitlements.
                if (persona !== "owner" && persona !== "mechanic") return children;
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
          Visible on owner + mechanic personas. Admin doesn't need it.
          Tap → drawer with aircraft picker → active work orders → timeline + chat thread. */}
      {(persona === "owner" || persona === "mechanic") && <WorkOrderChatBubble persona={persona} />}

      {/* ── Onboarding: inline guided tour overlay ── */}
      <TourOverlay />

      {/* ── In-app help widget (Phase 16 Sprint 16.2) — every persona ── */}
      <HelpWidget />

      {/* ── Client error capture (Phase 16 Sprint 16.5) ── */}
      <ClientErrorBoundary persona={persona} />

      {/* ── Feedback widget (Phase 16 Sprint 16.9) ── */}
      <FeedbackWidget />

      {/* ── Cross-persona upsell — only owner/mechanic have billing surfaces ── */}
      {upsellPersona && (upsellPersona === "owner" || upsellPersona === "mechanic") && (
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
