"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { OrgRole, Persona } from "@/types";
import { MINIMAL_MECHANIC_PERMISSIONS } from "@/lib/roles";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
/**
 * Persona is the canonical type from @/types — `'owner' | 'mechanic' | 'shop' | 'admin'`.
 * Re-exported here so existing AppContext consumers keep working without
 * an import path change.
 *
 * - 'owner' / 'mechanic'  : surfaced in the sidebar persona toggle (Spec 0.2).
 * - 'shop'                : reserved for Phase 5 (shop-foreman view).
 * - 'admin'               : derived from user_profiles.is_platform_admin
 *                            (Operations Hub work) — gates the admin sidebar
 *                            section in AppLayout. Not switchable via the toggle.
 */
export type { Persona };

/* ── Mechanic assigned to a specific aircraft by an owner ── */
export interface AircraftMechanicAssignment {
  id: string;
  aircraftTail: string;
  name: string;
  email: string;
  phone: string;
  status: "Active" | "Invited" | "Pending";
  enabled: boolean;              // owner can toggle access on/off
  linkedTeamMemberId?: string;   // matched to an existing ecosystem TeamMember
  invitedAt: string;             // ISO date string
}

/* ── Mechanic's per-customer access control ── */
export interface CustomerAccessEntry {
  customerId: string;
  customerName: string;
  aircraftTails: string[];       // aircraft belonging to this customer
  enabled: boolean;              // mechanic can toggle customer access on/off
}

export type TeamMemberRole = "Lead Mechanic / IA" | "Mechanic" | "Apprentice Mechanic" | "Read Only";
export type LicenseType = "A&P/IA" | "A&P Mechanic" | "Student A&P" | "None";

export interface MechanicPermissions {
  // Sidebar sections
  aiCommandCenter : boolean;
  dashboard       : boolean;
  aircraft        : boolean;
  squawks         : boolean;
  estimates       : boolean;
  workOrders      : boolean;
  invoices        : boolean;
  logbook         : boolean;
  // Settings depth
  settingsFull    : boolean; // grants Team, Billing, Org, Customers
  // Work-order detail capabilities
  woLineItems     : boolean;
  woOwnersView    : boolean;
  woCloseWO       : boolean;
  woInvoice       : boolean;
}

export interface TeamMember {
  id          : string;
  name        : string;
  role        : TeamMemberRole;
  cert        : string;
  email       : string;
  color       : string;
  initials    : string;
  status      : "Active" | "Invited";
  permissions : MechanicPermissions;
  // New fields
  licenseType : LicenseType;
  licenseNumber : string;   // empty for Student A&P / None
  rate        : number;     // $/hr labor rate
  specialty   : string;
}

/* ─────────────────────────────────────────
   Role permission presets
───────────────────────────────────────── */
export const ROLE_DEFAULTS: Record<TeamMemberRole, MechanicPermissions> = {
  "Lead Mechanic / IA": {
    aiCommandCenter: true,  dashboard: true,  aircraft: true,  squawks: true,
    estimates: true,  workOrders: true,  invoices: true,  logbook: true,
    settingsFull: true,
    woLineItems: true,  woOwnersView: true,  woCloseWO: true,  woInvoice: true,
  },
  "Mechanic": {
    aiCommandCenter: false, dashboard: false, aircraft: false, squawks: false,
    estimates: false, workOrders: true,  invoices: false, logbook: false,
    settingsFull: false,
    woLineItems: false, woOwnersView: false, woCloseWO: false, woInvoice: false,
  },
  "Apprentice Mechanic": {
    aiCommandCenter: false, dashboard: false, aircraft: false, squawks: false,
    estimates: false, workOrders: true,  invoices: false, logbook: false,
    settingsFull: false,
    woLineItems: false, woOwnersView: false, woCloseWO: false, woInvoice: false,
  },
  "Read Only": {
    aiCommandCenter: false, dashboard: false, aircraft: false, squawks: false,
    estimates: false, workOrders: false, invoices: false, logbook: true,
    settingsFull: false,
    woLineItems: false, woOwnersView: false, woCloseWO: false, woInvoice: false,
  },
};

/* ─────────────────────────────────────────
   Default team
───────────────────────────────────────── */
export const DEFAULT_TEAM: TeamMember[] = [];

/* ─────────────────────────────────────────
   Default seed — aircraft mechanic assignments
───────────────────────────────────────── */
export const DEFAULT_AIRCRAFT_ASSIGNMENTS: AircraftMechanicAssignment[] = [];

/* ─────────────────────────────────────────
   Default seed — customer access (per mechanic view)
───────────────────────────────────────── */
export const DEFAULT_CUSTOMER_ACCESS: CustomerAccessEntry[] = [];

const ROLE_TO_TEAM: Record<OrgRole, TeamMemberRole> = {
  owner: "Lead Mechanic / IA",
  admin: "Lead Mechanic / IA",
  mechanic: "Mechanic",
  pilot: "Read Only",
  viewer: "Read Only",
  auditor: "Read Only",
};

const TEAM_COLORS = [
  "bg-blue-600 text-white",
  "bg-violet-600 text-white",
  "bg-emerald-600 text-white",
  "bg-slate-600 text-white",
  "bg-amber-500 text-white",
];

function initialsFromName(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function colorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % TEAM_COLORS.length;
  }
  return TEAM_COLORS[Math.abs(hash) % TEAM_COLORS.length];
}

/* ─────────────────────────────────────────
   Context
───────────────────────────────────────── */
interface AppContextValue {
  persona              : Persona;
  setPersona           : (p: Persona) => void;
  /** The authenticated user's actual org role from the DB. Never trust client overrides. */
  currentUserRole      : OrgRole | null;
  team                 : TeamMember[];
  setTeam              : (t: TeamMember[]) => void;
  activeMechanic       : TeamMember;
  setActiveMechanic    : (m: TeamMember) => void;
  updateMemberPermissions : (id: string, patch: Partial<MechanicPermissions>) => void;
  updateMemberRole        : (id: string, role: TeamMemberRole) => void;
  updateMember            : (id: string, patch: Partial<TeamMember>) => void;
  addTeamMember           : (m: Omit<TeamMember, "id">) => void;
  removeTeamMember        : (id: string) => void;
  // Aircraft mechanic assignments
  aircraftAssignments          : AircraftMechanicAssignment[];
  addAircraftAssignment        : (a: Omit<AircraftMechanicAssignment, "id">) => void;
  updateAircraftAssignment     : (id: string, patch: Partial<AircraftMechanicAssignment>) => void;
  removeAircraftAssignment     : (id: string) => void;
  toggleAircraftAssignment     : (id: string) => void;
  // Customer access (mechanic-side)
  customerAccessList           : CustomerAccessEntry[];
  toggleCustomerAccess         : (customerId: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  initialPersona,
}: {
  children: ReactNode;
  initialPersona?: Persona;
}) {
  const [persona, setPersonaState]      = useState<Persona>(initialPersona ?? "owner");

  /**
   * Wrap setPersona so any caller (sidebar toggle, /ask auto-fallback, etc.)
   * also persists the choice to organization_memberships.persona via
   * /api/me/persona. Optimistic — failures don't roll back the in-memory
   * state since the localStorage cache keeps the UI consistent for this
   * tab. Spec 0.2 hard rule: persona is server-of-record per membership.
   */
  function setPersona(next: Persona) {
    setPersonaState(next);
    if (typeof window === "undefined") return;
    fetch("/api/me/persona", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: next, scope: "membership" }),
    }).catch(() => { /* noop — see comment above */ });
  }

  const [team, setTeam]                 = useState<TeamMember[]>(DEFAULT_TEAM);
  const [activeMechanicId, setAMId]     = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<OrgRole | null>(null);
  const [aircraftAssignments, setAircraftAssignments] = useState<AircraftMechanicAssignment[]>(DEFAULT_AIRCRAFT_ASSIGNMENTS);
  const [customerAccessList, setCustomerAccessList]   = useState<CustomerAccessEntry[]>(DEFAULT_CUSTOMER_ACCESS);

  // Fallback active mechanic — READ-ONLY permissions by default.
  // If the team fetch fails we must NOT grant full access; that is a security
  // issue. Users with no loaded team effectively see no mechanic tools.
  const activeMechanic = team.find((m) => m.id === activeMechanicId) ?? team[0] ?? {
    id: "current-user",
    name: "Current User",
    role: "Read Only",
    cert: "",
    email: "",
    color: TEAM_COLORS[0],
    initials: "CU",
    status: "Active",
    permissions: { ...MINIMAL_MECHANIC_PERMISSIONS },
    licenseType: "None",
    licenseNumber: "",
    rate: 0,
    specialty: "",
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Snappy initial paint from cache. The server-of-record fetch below
    // overwrites this with the resolved membership.persona once it lands.
    const stored = window.localStorage.getItem("ui_persona");
    if (stored === "owner" || stored === "mechanic" || stored === "shop") {
      setPersonaState(stored);
    }
  }, []);

  /* Hydrate persona from /api/me/orgs (Spec 0.2). The server resolves the
     fallback chain membership → profile → DEFAULT_PERSONA; we just trust it.
     Use setPersonaState (not setPersona) to avoid round-tripping the value
     we just fetched back to the server. */
  useEffect(() => {
    let cancelled = false;
    async function hydratePersona() {
      try {
        const res = await fetch("/api/me/orgs", { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        const next = payload?.active_persona;
        if (next === "owner" || next === "mechanic" || next === "shop") {
          setPersonaState(next);
        }
      } catch {
        // noop — fall back to the localStorage cache / default.
      }
    }
    hydratePersona();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTeam() {
      try {
        const res = await fetch("/api/team");
        if (!res.ok) {
          // On error, leave team empty — the fallback in activeMechanic is
          // intentionally read-only so missing team data = no access.
          if (!cancelled) {
            setTeam([]);
            setCurrentUserRole(null);
          }
          return;
        }
        const payload = await res.json();
        const members = (payload?.members ?? []) as Array<{
          user_id: string;
          role: OrgRole;
          profile?: { id: string; full_name?: string | null; email?: string | null };
          is_current_user?: boolean;
        }>;
        const currentUser = payload?.current_user as { id: string; role: OrgRole } | undefined;

        if (cancelled) return;

        const mapped = members.map((m, idx) => {
          const name = m.profile?.full_name || m.profile?.email || "Team Member";
          const role = ROLE_TO_TEAM[m.role] ?? "Read Only";
          const permissions = ROLE_DEFAULTS[role];
          const isLead = role === "Lead Mechanic / IA";
          const isMechanic = role === "Mechanic" || role === "Apprentice Mechanic" || isLead;
          return {
            id: m.profile?.id ?? m.user_id,
            name,
            role,
            cert: isMechanic ? "A&P Mechanic" : "—",
            email: m.profile?.email ?? "",
            color: colorForName(name || String(idx)),
            initials: initialsFromName(name),
            status: "Active",
            permissions: { ...permissions },
            licenseType: isLead ? "A&P/IA" : isMechanic ? "A&P Mechanic" : "None",
            licenseNumber: "",
            rate: 0,
            specialty: "",
          } satisfies TeamMember;
        });

        setTeam(mapped);
        if (currentUser?.role) {
          setCurrentUserRole(currentUser.role);
        }

        // Default the active mechanic to the authenticated user so the UI
        // reflects their actual role/permissions — not a hardcoded default.
        if (!activeMechanicId && mapped.length > 0) {
          const selfId = currentUser?.id;
          const selfMember = selfId
            ? mapped.find((m) => m.id === selfId)
            : undefined;
          setAMId((selfMember ?? mapped[0]).id);
        }
      } catch (err) {
        console.error("Failed to load team", err);
        if (!cancelled) {
          setTeam([]);
          setCurrentUserRole(null);
        }
      }
    }

    loadTeam();
    return () => {
      cancelled = true;
    };
  }, [activeMechanicId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ui_persona", persona);
    // Mirror the active persona to a cookie so server-rendered pages
    // (e.g. /documents, the upload page) can scope queries without a
    // round-trip. Same-site, 1-year, JS-readable so this same client can
    // keep updating it.
    document.cookie = `ui_persona=${persona}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [persona]);

  function setActiveMechanic(m: TeamMember) { setAMId(m.id); }

  function updateMemberPermissions(id: string, patch: Partial<MechanicPermissions>) {
    setTeam((prev) =>
      prev.map((m) => m.id === id ? { ...m, permissions: { ...m.permissions, ...patch } } : m)
    );
  }

  function updateMemberRole(id: string, role: TeamMemberRole) {
    setTeam((prev) =>
      prev.map((m) => m.id === id ? { ...m, role, permissions: { ...ROLE_DEFAULTS[role] } } : m)
    );
  }

  function updateMember(id: string, patch: Partial<TeamMember>) {
    setTeam((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
  }

  function addTeamMember(m: Omit<TeamMember, "id">) {
    const newMember: TeamMember = { ...m, id: `tm-${Date.now()}` };
    setTeam(prev => [...prev, newMember]);
  }

  function removeTeamMember(id: string) {
    setTeam(prev => prev.filter(m => m.id !== id));
  }

  // Aircraft assignment functions
  function addAircraftAssignment(a: Omit<AircraftMechanicAssignment, "id">) {
    setAircraftAssignments(prev => [...prev, { ...a, id: `am-${Date.now()}` }]);
  }

  function updateAircraftAssignment(id: string, patch: Partial<AircraftMechanicAssignment>) {
    setAircraftAssignments(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }

  function removeAircraftAssignment(id: string) {
    setAircraftAssignments(prev => prev.filter(a => a.id !== id));
  }

  function toggleAircraftAssignment(id: string) {
    setAircraftAssignments(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  }

  // Customer access functions
  function toggleCustomerAccess(customerId: string) {
    setCustomerAccessList(prev => prev.map(c => c.customerId === customerId ? { ...c, enabled: !c.enabled } : c));
  }

  return (
    <AppContext.Provider value={{
      persona, setPersona, currentUserRole, team, setTeam, activeMechanic,
      setActiveMechanic, updateMemberPermissions, updateMemberRole,
      updateMember, addTeamMember, removeTeamMember,
      aircraftAssignments, addAircraftAssignment, updateAircraftAssignment,
      removeAircraftAssignment, toggleAircraftAssignment,
      customerAccessList, toggleCustomerAccess,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be within AppProvider");
  return ctx;
}
