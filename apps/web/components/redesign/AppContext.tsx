"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { OrgRole } from "@/types";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
export type Persona = "owner" | "mechanic";

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
  const [persona, setPersona]           = useState<Persona>(initialPersona ?? "owner");
  const [team, setTeam]                 = useState<TeamMember[]>(DEFAULT_TEAM);
  const [activeMechanicId, setAMId]     = useState<string | null>(null);
  const [aircraftAssignments, setAircraftAssignments] = useState<AircraftMechanicAssignment[]>(DEFAULT_AIRCRAFT_ASSIGNMENTS);
  const [customerAccessList, setCustomerAccessList]   = useState<CustomerAccessEntry[]>(DEFAULT_CUSTOMER_ACCESS);

  const activeMechanic = team.find((m) => m.id === activeMechanicId) ?? team[0] ?? {
    id: "current-user",
    name: "Current User",
    role: "Lead Mechanic / IA",
    cert: "",
    email: "",
    color: TEAM_COLORS[0],
    initials: "CU",
    status: "Active",
    permissions: { ...ROLE_DEFAULTS["Lead Mechanic / IA"] },
    licenseType: "A&P/IA",
    licenseNumber: "",
    rate: 0,
    specialty: "",
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("ui_persona");
    if (stored === "owner" || stored === "mechanic") {
      setPersona(stored);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTeam() {
      try {
        const res = await fetch("/api/team");
        if (!res.ok) return;
        const payload = await res.json();
        const members = (payload?.members ?? []) as Array<{
          user_id: string;
          role: OrgRole;
          profile?: { id: string; full_name?: string | null; email?: string | null };
        }>;

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
        if (mapped.length > 0 && !activeMechanicId) {
          setAMId(mapped[0].id);
        }
      } catch (err) {
        console.error("Failed to load team", err);
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
      persona, setPersona, team, setTeam, activeMechanic,
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
