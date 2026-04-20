"use client";

import { useState } from "react";
import {
  Users, Plus, Search, Plane, Wrench, FileText,
  Settings, Bot, Mail, Phone, Calendar, Clock, Award,
  CheckCircle, XCircle, Send, AlertCircle, Shield, X,
  Edit2, Trash2, CreditCard, UserPlus, Check, BookOpen,
} from "lucide-react";

// ─── Document types grouped by aviation category ────────────────────────────
const DOC_GROUPS: { group: string; color: string; items: { key: string; label: string }[] }[] = [
  {
    group: "Airworthiness & Legal",
    color: "bg-red-50 text-red-700",
    items: [
      { key: "airworthinessCert",  label: "Airworthiness Certificate" },
      { key: "registration",       label: "Aircraft Registration" },
      { key: "insuranceDocs",      label: "Insurance Documents" },
    ],
  },
  {
    group: "Flight Manuals & Operations",
    color: "bg-blue-50 text-blue-700",
    items: [
      { key: "pohAfm",             label: "POH / AFM (Airplane Flight Manual)" },
      { key: "efm",                label: "EFM (Electronic Flight Manual)" },
      { key: "weightBalance",      label: "Weight & Balance Report" },
      { key: "equipmentList",      label: "Equipment List" },
      { key: "toldCards",          label: "TOLD Cards (Takeoff & Landing Data)" },
      { key: "mel",                label: "MEL (Minimum Equipment List)" },
      { key: "performanceCharts",  label: "Performance Charts & Supplements" },
    ],
  },
  {
    group: "Logbooks",
    color: "bg-emerald-50 text-emerald-700",
    items: [
      { key: "airframeLogbook",    label: "Airframe Logbook" },
      { key: "engineLogbook",      label: "Engine Logbook" },
      { key: "propellerLogbook",   label: "Propeller Logbook" },
      { key: "avionicsLogbook",    label: "Avionics / Instruments Logbook" },
    ],
  },
  {
    group: "Maintenance Records",
    color: "bg-orange-50 text-orange-700",
    items: [
      { key: "annualInspection",       label: "Annual Inspection Records" },
      { key: "hundredHourInspection",  label: "100-Hour Inspection Records" },
      { key: "adCompliance",           label: "AD Compliance Records" },
      { key: "form337",                label: "Form 337 — Major Repairs & Alterations" },
      { key: "stcDocuments",           label: "STC Supplemental Type Certificates" },
      { key: "pmaDocuments",           label: "PMA Parts Documentation" },
      { key: "serviceBulletins",       label: "Service Bulletins (SB / SL)" },
      { key: "maintenanceManual",      label: "Maintenance Manual (MM / AMM)" },
      { key: "overhaulRecords",        label: "Overhaul / Repair Station Records" },
      { key: "componentTimeLife",      label: "Component Time-Life & TBO Records" },
    ],
  },
  {
    group: "Electronic Systems",
    color: "bg-violet-50 text-violet-700",
    items: [
      { key: "efbProfile",         label: "EFB (Electronic Flight Bag) Profile" },
      { key: "avionicsDatabase",   label: "Avionics / Nav Database Records" },
      { key: "digitalFlightLogs",  label: "Digital Flight Logs / Track Logs" },
    ],
  },
];

// Flat list for backward-compat helpers
const DOCUMENT_TYPES = DOC_GROUPS.flatMap(g => g.items);
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRole   = "Pilot" | "CFI" | "Admin" | "Staff";
type UserStatus = "Active" | "Invited" | "Suspended";
type DetailTab  = "overview" | "permissions" | "account";
type ModuleKey  = keyof PermissionsMap;

interface FleetAircraft { id: string; nNumber: string; model: string }

// Note: Logbook is a mechanic-only module and is NOT available in the owner persona.
interface PermissionsMap {
  aircraft:    { enabled: boolean; viewAll: boolean; specificAircraft: string[] };
  maintenance: { enabled: boolean; view: boolean; submitSquawk: boolean; approveWork: boolean };
  documents:   { enabled: boolean; view: boolean; upload: boolean; delete: boolean; docTypes?: Record<string, boolean> };
  billing:     { enabled: boolean; viewInvoices: boolean; pay: boolean; managePayment: boolean };
  settings:    { enabled: boolean; view: boolean; edit: boolean; manageUsers: boolean };
  ask:         { enabled: boolean };
}

interface AircraftUser {
  id: string; name: string; email: string; phone?: string;
  role: UserRole; status: UserStatus; initials: string; colorClass: string;
  joinedDate: string; lastActive?: string;
  certificateNumber?: string; flightHours?: number;
  permissions: PermissionsMap;
}

interface SubPerm { key: string; label: string; desc: string }
interface PermModule {
  key: ModuleKey; label: string; icon: any;
  iconBg: string; iconColor: string; desc: string;
  subs: SubPerm[]; showAircraftSelector?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FLEET: FleetAircraft[] = [];

const ROLE_BADGE: Record<UserRole, string> = {
  Pilot: "bg-blue-100 text-blue-700",
  CFI:   "bg-emerald-100 text-emerald-700",
  Admin: "bg-violet-100 text-violet-700",
  Staff: "bg-amber-100 text-amber-700",
};

const ROLE_DESC: Record<UserRole, string> = {
  Pilot: "Flight access only",
  CFI:   "Instructor + endorsements",
  Admin: "Full platform access",
  Staff: "Limited read access",
};

function makePerms(role: UserRole): PermissionsMap {
  switch (role) {
    case "Pilot": return {
      aircraft:    { enabled: true,  viewAll: false, specificAircraft: ["ac1"] },
      maintenance: { enabled: true,  view: true,  submitSquawk: true,  approveWork: false },
      documents:   { enabled: true,  view: true,  upload: false, delete: false, docTypes: { airworthinessCert: true, registration: true, pohAfm: true, weightBalance: true, equipmentList: true, annualInspection: false, hundredHourInspection: false, adCompliance: false, engineLogbook: false, airframeLogbook: false, propellerLogbook: false, avionicsLogbook: false, efbProfile: true, toldCards: true, mel: true, performanceCharts: true, stcDocuments: false, form337: false, insuranceDocs: false, pmaDocuments: false, serviceBulletins: false, maintenanceManual: false, overhaulRecords: false, componentTimeLife: false, efm: false, avionicsDatabase: false, digitalFlightLogs: true } },
      billing:     { enabled: false, viewInvoices: false, pay: false, managePayment: false },
      settings:    { enabled: false, view: false, edit: false, manageUsers: false },
      ask:         { enabled: true },
    };
    case "CFI": return {
      aircraft:    { enabled: true,  viewAll: false, specificAircraft: ["ac1", "ac2"] },
      maintenance: { enabled: true,  view: true,  submitSquawk: true,  approveWork: false },
      documents:   { enabled: true,  view: true,  upload: true,  delete: false, docTypes: { airworthinessCert: true, registration: true, pohAfm: true, weightBalance: true, equipmentList: true, annualInspection: true, hundredHourInspection: true, adCompliance: true, engineLogbook: false, airframeLogbook: false, propellerLogbook: false, avionicsLogbook: false, efbProfile: true, toldCards: true, mel: true, performanceCharts: true, stcDocuments: false, form337: false, insuranceDocs: false, pmaDocuments: false, serviceBulletins: false, maintenanceManual: false, overhaulRecords: false, componentTimeLife: false, efm: true, avionicsDatabase: false, digitalFlightLogs: true } },
      billing:     { enabled: false, viewInvoices: false, pay: false, managePayment: false },
      settings:    { enabled: false, view: false, edit: false, manageUsers: false },
      ask:         { enabled: true },
    };
    case "Admin": return {
      aircraft:    { enabled: true,  viewAll: true,  specificAircraft: [] },
      maintenance: { enabled: true,  view: true,  submitSquawk: false, approveWork: true },
      documents:   { enabled: true,  view: true,  upload: true,  delete: true, docTypes: Object.fromEntries(DOCUMENT_TYPES.map(d => [d.key, true])) },
      billing:     { enabled: true,  viewInvoices: true,  pay: true,  managePayment: true },
      settings:    { enabled: true,  view: true,  edit: true,  manageUsers: true },
      ask:         { enabled: true },
    };
    case "Staff": return {
      aircraft:    { enabled: true,  viewAll: false, specificAircraft: ["ac1"] },
      maintenance: { enabled: false, view: false, submitSquawk: false, approveWork: false },
      documents:   { enabled: true,  view: true,  upload: false, delete: false, docTypes: { airworthinessCert: true, registration: true, pohAfm: false, weightBalance: false, equipmentList: false, annualInspection: false, hundredHourInspection: false, adCompliance: false, engineLogbook: false, airframeLogbook: false, propellerLogbook: false, avionicsLogbook: false, efbProfile: false, toldCards: false, mel: false, performanceCharts: false, stcDocuments: false, form337: false, insuranceDocs: false, pmaDocuments: false, serviceBulletins: false, maintenanceManual: false, overhaulRecords: false, componentTimeLife: false, efm: false, avionicsDatabase: false, digitalFlightLogs: false } },
      billing:     { enabled: false, viewInvoices: false, pay: false, managePayment: false },
      settings:    { enabled: false, view: false, edit: false, manageUsers: false },
      ask:         { enabled: false },
    };
  }
}

const SAMPLE_USERS: AircraftUser[] = [];

const PERM_MODULES: PermModule[] = [
  {
    key: "aircraft", label: "Aircraft", icon: Plane,
    iconBg: "bg-blue-50", iconColor: "text-blue-600",
    desc: "Access to aircraft records and fleet details",
    subs: [
      { key: "viewAll", label: "View entire fleet", desc: "Can see all aircraft — disable to restrict to specific tail numbers below" },
    ],
    showAircraftSelector: true,
  },
  {
    key: "maintenance", label: "Maintenance", icon: Wrench,
    iconBg: "bg-orange-50", iconColor: "text-orange-600",
    desc: "Maintenance requests and work order access",
    subs: [
      { key: "view",         label: "View maintenance",    desc: "See squawks, work orders, and maintenance records" },
      { key: "submitSquawk", label: "Submit squawks",      desc: "Report aircraft issues and discrepancies" },
      { key: "approveWork",  label: "Approve work orders", desc: "Sign off on completed maintenance" },
    ],
  },
  {
    key: "documents", label: "Documents", icon: FileText,
    iconBg: "bg-indigo-50", iconColor: "text-indigo-600",
    desc: "Document access, uploads, and management",
    subs: [
      { key: "view",   label: "View documents",   desc: "Read and download documents" },
      { key: "upload", label: "Upload documents", desc: "Add new documents to the system" },
      { key: "delete", label: "Delete documents", desc: "Permanently remove documents" },
    ],
  },
  {
    key: "billing", label: "Billing", icon: CreditCard,
    iconBg: "bg-pink-50", iconColor: "text-pink-600",
    desc: "Invoice management and payment access",
    subs: [
      { key: "viewInvoices",  label: "View invoices",         desc: "See billing history and outstanding invoices" },
      { key: "pay",           label: "Make payments",         desc: "Pay invoices on behalf of the account" },
      { key: "managePayment", label: "Manage payment methods", desc: "Add, remove, and update payment sources" },
    ],
  },
  {
    key: "settings", label: "Settings", icon: Settings,
    iconBg: "bg-slate-50", iconColor: "text-slate-600",
    desc: "Account settings and configuration access",
    subs: [
      { key: "view",        label: "View settings",    desc: "Read-only access to account configuration" },
      { key: "edit",        label: "Edit settings",    desc: "Modify account and aircraft settings" },
      { key: "manageUsers", label: "Manage users",     desc: "Invite, remove, and configure user permissions" },
    ],
  },
  {
    key: "ask", label: "AI Assistant", icon: Bot,
    iconBg: "bg-violet-50", iconColor: "text-violet-600",
    desc: "Access to AI-powered aviation assistant and insights",
    subs: [],
  },
];

// ─── Small reusable components ───────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={`relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${on ? "bg-blue-600" : "bg-slate-200"}`}
    >
      <span className={`inline-block h-[17px] w-[17px] transform rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-[21px]" : "translate-x-[2px]"}`} />
    </button>
  );
}

function StatusBadge({ status }: { status: UserStatus }) {
  const cfg = {
    Active:    { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50",  label: "Active" },
    Invited:   { dot: "bg-amber-400",   text: "text-amber-700",   bg: "bg-amber-50",    label: "Invited" },
    Suspended: { dot: "bg-red-400",     text: "text-red-700",     bg: "bg-red-50",      label: "Suspended" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] ${cfg.bg} ${cfg.text}`} style={{ fontWeight: 600 }}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }: { icon: any; label: string; value: string; color: string; bg: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-[20px] text-slate-900" style={{ fontWeight: 700 }}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5" style={{ fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function AccountRow({ icon: Icon, label, value, editable, empty }: { icon: any; label: string; value: string; editable?: boolean; empty?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider" style={{ fontWeight: 600 }}>{label}</div>
        {editable && !empty ? (
          <input
            defaultValue={value}
            className="text-[13px] text-slate-700 bg-transparent border-b border-slate-200 focus:border-blue-400 outline-none w-full mt-0.5 pb-0.5 transition-colors"
            style={{ fontWeight: 500 }}
          />
        ) : (
          <div className={`text-[13px] mt-0.5 ${empty ? "text-slate-300 italic" : "text-slate-700"}`} style={{ fontWeight: empty ? 400 : 500 }}>
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({ user, fleet, onGoToPerms }: { user: AircraftUser; fleet: FleetAircraft[]; onGoToPerms: () => void }) {
  const enabledCount = PERM_MODULES.filter(m => user.permissions[m.key].enabled).length;
  const ac = user.permissions.aircraft;
  const aircraftAccess = ac.enabled
    ? (ac.viewAll ? fleet : fleet.filter(a => ac.specificAircraft.includes(a.id)))
    : [];

  const activity = user.status === "Invited" ? [] : [
    { icon: Wrench,   label: "Approved maintenance scope for N12345", time: "2h ago",    color: "text-orange-600" },
    { icon: Plane,    label: "Accessed aircraft records",             time: "Yesterday", color: "text-blue-600" },
    { icon: FileText, label: "Downloaded Annual Inspection report",   time: "3 days ago", color: "text-indigo-600" },
  ];

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Stats row */}
      <div className={`grid gap-3 ${user.flightHours !== undefined ? "grid-cols-4" : "grid-cols-3"}`}>
        {user.flightHours !== undefined && (
          <StatCard icon={Award}    label="Flight Hours"  value={user.flightHours.toLocaleString()} color="text-blue-600"   bg="bg-blue-50" />
        )}
        <StatCard icon={Plane}    label="Aircraft Access"  value={String(aircraftAccess.length)}     color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard icon={Shield}   label="Modules Active"   value={String(enabledCount)}              color="text-violet-600" bg="bg-violet-50" />
        <StatCard icon={Calendar} label="Member Since"     value={fmtMonth(user.joinedDate)}         color="text-slate-600"  bg="bg-slate-100" />
      </div>

      {/* Aircraft access card */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[13px] text-slate-700" style={{ fontWeight: 700 }}>Aircraft Access</h3>
          <button onClick={onGoToPerms} className="text-[11px] text-blue-600 hover:text-blue-700 transition-colors" style={{ fontWeight: 500 }}>
            Edit access →
          </button>
        </div>
        {!user.permissions.aircraft.enabled ? (
          <div className="px-4 py-3 flex items-center gap-2 text-[12px] text-slate-400">
            <XCircle className="w-4 h-4 text-slate-300 shrink-0" />
            Aircraft module is disabled for this user
          </div>
        ) : user.permissions.aircraft.viewAll ? (
          <div className="px-4 py-3 flex items-center gap-2 text-[12px] text-slate-600">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            Full fleet access — {fleet.length} aircraft
          </div>
        ) : aircraftAccess.length === 0 ? (
          <div className="px-4 py-3 flex items-center gap-2 text-[12px] text-amber-600">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            No specific aircraft assigned yet
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {aircraftAccess.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Plane className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-[13px] text-slate-800" style={{ fontWeight: 600 }}>{a.nNumber}</div>
                  <div className="text-[11px] text-slate-400">{a.model}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active permissions pills */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-[13px] text-slate-700" style={{ fontWeight: 700 }}>Permission Summary</h3>
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {PERM_MODULES.map(mod => {
            const on = user.permissions[mod.key].enabled;
            return (
              <span
                key={mod.key}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] border transition-all ${
                  on
                    ? `${mod.iconBg} border-transparent ${mod.iconColor}`
                    : "bg-slate-50 border-slate-100 text-slate-300 line-through"
                }`}
                style={{ fontWeight: on ? 600 : 400 }}
              >
                <mod.icon className="w-3 h-3" />
                {mod.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      {activity.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-[13px] text-slate-700" style={{ fontWeight: 700 }}>Recent Activity</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                  <a.icon className={`w-3.5 h-3.5 ${a.color}`} />
                </div>
                <span className="text-[12px] text-slate-600 flex-1">{a.label}</span>
                <span className="text-[11px] text-slate-400">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {user.status === "Invited" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] text-amber-800" style={{ fontWeight: 600 }}>Invitation Pending</p>
            <p className="text-[12px] text-amber-600 mt-0.5">
              {user.name} hasn't accepted their invitation yet. You can resend it from the header above.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Permissions tab ─────────────────────────────────────────────────────────

function PermissionsTab({
  user, fleet, onToggleModule, onSetPerm,
}: {
  user: AircraftUser;
  fleet: FleetAircraft[];
  onToggleModule: (mod: ModuleKey, val: boolean) => void;
  onSetPerm: (mod: ModuleKey, key: string, val: boolean | string[]) => void;
}) {
  const perms = user.permissions;

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h3 className="text-[14px] text-slate-800" style={{ fontWeight: 700 }}>Permission Modules</h3>
        <p className="text-[12px] text-slate-400 mt-0.5">
          Toggle modules on/off, then fine-tune each sub-permission. Changes are saved instantly.
        </p>
      </div>

      <div className="space-y-3">
        {PERM_MODULES.map(mod => {
          const modPerms = perms[mod.key] as any;
          const enabled  = modPerms.enabled as boolean;

          return (
            <div
              key={mod.key}
              className={`bg-white rounded-xl border overflow-hidden transition-all ${enabled ? "border-slate-200 shadow-sm" : "border-slate-100"}`}
            >
              {/* Module header */}
              <div className="flex items-center gap-3 px-4 py-4">
                <div className={`w-10 h-10 rounded-xl ${mod.iconBg} flex items-center justify-center shrink-0`}>
                  <mod.icon className={`w-5 h-5 ${mod.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-800" style={{ fontWeight: 700 }}>{mod.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{mod.desc}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] ${enabled ? "text-emerald-600" : "text-slate-400"}`} style={{ fontWeight: 600 }}>
                    {enabled ? "ON" : "OFF"}
                  </span>
                  <Toggle on={enabled} onChange={v => onToggleModule(mod.key, v)} />
                </div>
              </div>

              {/* Sub-permissions — only when module is enabled */}
              {enabled && mod.subs.length > 0 && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {mod.subs.map(sub => {
                    const subVal = modPerms[sub.key] as boolean;
                    return (
                      <div key={sub.key} className="flex items-center gap-3 px-4 py-3 pl-[72px]">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] text-slate-700" style={{ fontWeight: 600 }}>{sub.label}</div>
                          <div className="text-[11px] text-slate-400">{sub.desc}</div>
                        </div>
                        <Toggle on={subVal} onChange={v => onSetPerm(mod.key, sub.key, v)} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Document type privileges — shows when documents module is on AND view sub-perm is enabled */}
              {enabled && mod.key === "documents" && modPerms.view && (
                <div className="border-t border-slate-100 px-4 py-4 pl-[72px]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider" style={{ fontWeight: 700 }}>
                      Document Visibility Privileges
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const allTrue = Object.fromEntries(DOCUMENT_TYPES.map(d => [d.key, true]));
                          onSetPerm("documents", "docTypes", allTrue as any);
                        }}
                        className="text-[10px] text-blue-600 hover:underline" style={{ fontWeight: 600 }}
                      >
                        Grant All
                      </button>
                      <span className="text-slate-300 text-[10px]">·</span>
                      <button
                        onClick={() => {
                          const allFalse = Object.fromEntries(DOCUMENT_TYPES.map(d => [d.key, false]));
                          onSetPerm("documents", "docTypes", allFalse as any);
                        }}
                        className="text-[10px] text-slate-400 hover:underline" style={{ fontWeight: 500 }}
                      >
                        Revoke All
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-4">
                    Owner controls which aviation documents this user can see. Toggle each document type to grant or revoke access per category.
                  </p>

                  {/* Grouped document types */}
                  <div className="space-y-4">
                    {DOC_GROUPS.map(grp => {
                      const groupGranted = grp.items.filter(d => modPerms.docTypes?.[d.key]).length;
                      return (
                        <div key={grp.group}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] ${grp.color}`} style={{ fontWeight: 700 }}>
                              {grp.group}
                            </span>
                            <span className="text-[10px] text-slate-400">{groupGranted}/{grp.items.length}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {grp.items.map(docType => {
                              const isGranted = !!(modPerms.docTypes?.[docType.key]);
                              return (
                                <button
                                  key={docType.key}
                                  onClick={() => {
                                    const cur = modPerms.docTypes || {};
                                    onSetPerm("documents", "docTypes", { ...cur, [docType.key]: !isGranted } as any);
                                  }}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                                    isGranted
                                      ? "border-blue-200 bg-blue-50"
                                      : "border-slate-100 bg-white hover:border-slate-200"
                                  }`}
                                >
                                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                    isGranted ? "bg-blue-600 border-blue-600" : "border-slate-300"
                                  }`}>
                                    {isGranted && <Check className="w-2 h-2 text-white" />}
                                  </div>
                                  <span className={`text-[11px] leading-tight ${isGranted ? "text-blue-700" : "text-slate-600"}`} style={{ fontWeight: isGranted ? 600 : 400 }}>
                                    {docType.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Per-aircraft document visibility indicator */}
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2" style={{ fontWeight: 700 }}>
                      Per-Aircraft Document Access
                    </p>
                    <p className="text-[11px] text-slate-400 mb-3">
                      Documents are visible for all aircraft this user can access. Restrict aircraft access in the Aircraft module above.
                    </p>
                    <div className="space-y-1.5">
                      {fleet.map(ac => {
                        const hasAccess = user.permissions.aircraft.viewAll ||
                          (user.permissions.aircraft.specificAircraft || []).includes(ac.id);
                        return (
                          <div key={ac.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${hasAccess ? "border-blue-100 bg-blue-50/50" : "border-slate-100 bg-slate-50/30"}`}>
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${hasAccess ? "bg-blue-100" : "bg-slate-100"}`}>
                              <Plane className={`w-3.5 h-3.5 ${hasAccess ? "text-blue-600" : "text-slate-300"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-[12px] ${hasAccess ? "text-blue-800" : "text-slate-400"}`} style={{ fontWeight: 600 }}>{ac.nNumber}</div>
                              <div className="text-[10px] text-slate-400">{ac.model}</div>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${hasAccess ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"}`} style={{ fontWeight: 600 }}>
                              {hasAccess ? "Documents Visible" : "No Access"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 mt-3 italic">
                    {DOCUMENT_TYPES.filter(d => modPerms.docTypes?.[d.key]).length} of {DOCUMENT_TYPES.length} document types accessible
                  </p>
                </div>
              )}

              {/* Aircraft selector: shows when aircraft module is on AND viewAll is false */}
              {enabled && mod.showAircraftSelector && !modPerms.viewAll && (
                <div className="border-t border-slate-100 px-4 py-3 pl-[72px]">
                  <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider" style={{ fontWeight: 700 }}>
                    Allowed Tail Numbers
                  </p>
                  <div className="space-y-2">
                    {fleet.map(a => {
                      const checked = (modPerms.specificAircraft as string[]).includes(a.id);
                      return (
                        <label key={a.id} className="flex items-center gap-3 cursor-pointer group">
                          <div
                            onClick={() => {
                              const cur = modPerms.specificAircraft as string[];
                              onSetPerm(mod.key, "specificAircraft",
                                checked ? cur.filter(id => id !== a.id) : [...cur, a.id]);
                            }}
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                              checked ? "bg-blue-600 border-blue-600" : "border-slate-300 group-hover:border-slate-400"
                            }`}
                          >
                            {checked && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-slate-700" style={{ fontWeight: 600 }}>{a.nNumber}</span>
                            <span className="text-[11px] text-slate-400">{a.model}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Account tab ─────────────────────────────────────────────────────────────

function AccountTab({ user, onSuspend, onRemove, onResend }: {
  user: AircraftUser;
  onSuspend: () => void;
  onRemove: () => void;
  onResend: () => void;
}) {
  const [editContact, setEditContact] = useState(false);
  const [editCert,    setEditCert]    = useState(false);

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      {/* Contact */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[13px] text-slate-700" style={{ fontWeight: 700 }}>Contact Information</h3>
          <button
            onClick={() => setEditContact(e => !e)}
            className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-700 transition-colors"
            style={{ fontWeight: 500 }}
          >
            <Edit2 className="w-3 h-3" />
            {editContact ? "Done" : "Edit"}
          </button>
        </div>
        <div className="divide-y divide-slate-50">
          <AccountRow icon={Mail}     label="Email"        value={user.email}             editable={editContact} />
          <AccountRow icon={Phone}    label="Phone"        value={user.phone ?? "—"}       editable={editContact} empty={!user.phone} />
          <AccountRow icon={Calendar} label="Member Since" value={fmtLong(user.joinedDate)} />
          {user.lastActive && (
            <AccountRow icon={Clock}  label="Last Active"  value={fmtLong(user.lastActive)} />
          )}
        </div>
      </div>

      {/* Certificate — Pilot / CFI only */}
      {(user.role === "Pilot" || user.role === "CFI") && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-[13px] text-slate-700" style={{ fontWeight: 700 }}>
              {user.role === "CFI" ? "CFI Certificate" : "Pilot Certificate"}
            </h3>
            <button
              onClick={() => setEditCert(e => !e)}
              className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-700 transition-colors"
              style={{ fontWeight: 500 }}
            >
              <Edit2 className="w-3 h-3" />
              {editCert ? "Done" : "Edit"}
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            <AccountRow
              icon={Award}
              label={user.role === "CFI" ? "CFI Certificate #" : "Pilot Certificate #"}
              value={user.certificateNumber ?? "Not provided"}
              editable={editCert}
              empty={!user.certificateNumber}
            />
            {user.flightHours !== undefined && (
              <AccountRow icon={Clock} label="Total Flight Hours" value={`${user.flightHours.toLocaleString()} hrs`} />
            )}
          </div>
        </div>
      )}

      {/* Account status */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-[13px] text-slate-700" style={{ fontWeight: 700 }}>Account Status</h3>
        </div>
        <div className="px-4 py-4 flex items-center gap-3">
          <StatusBadge status={user.status} />
          <span className="text-[12px] text-slate-500">
            {user.status === "Active"    ? "User has full access to their assigned permissions." :
             user.status === "Invited"   ? "Invitation sent — awaiting acceptance." :
             "Account suspended. User cannot log in."}
          </span>
        </div>
        <div className="px-4 pb-4 flex gap-2">
          {user.status === "Invited" && (
            <button
              onClick={onResend}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
              style={{ fontWeight: 500 }}
            >
              <Send className="w-3.5 h-3.5" /> Resend Invite
            </button>
          )}
          <button
            onClick={onSuspend}
            className={`flex items-center gap-1.5 px-3 py-2 text-[12px] border rounded-lg transition-colors ${
              user.status === "Suspended"
                ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            style={{ fontWeight: 500 }}
          >
            {user.status === "Suspended" ? "Reactivate User" : "Suspend User"}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-red-50 rounded-xl border border-red-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-red-100">
          <h3 className="text-[13px] text-red-700" style={{ fontWeight: 700 }}>Danger Zone</h3>
        </div>
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-[12px] text-red-600">
            Removing a user revokes all access immediately. This cannot be undone.
          </p>
          <button
            onClick={onRemove}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-[12px] bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            style={{ fontWeight: 600 }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove User
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMonth(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
function fmtLong(d: string) {
  return new Date(d).toLocaleDateString("en-US", { dateStyle: "long" });
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function UsersPage() {
  const [users,      setUsers]      = useState<AircraftUser[]>(SAMPLE_USERS);
  const [selectedId, setSelectedId] = useState<string | null>(SAMPLE_USERS[0]?.id ?? null);
  const [search,     setSearch]     = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "All">("All");
  const [detailTab,  setDetailTab]  = useState<DetailTab>("overview");
  const [showInvite, setShowInvite] = useState(false);

  // Invite form
  const [invName,  setInvName]  = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invRole,  setInvRole]  = useState<UserRole>("Pilot");

  const selectedUser = users.find(u => u.id === selectedId) ?? null;

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchR = roleFilter === "All" || u.role === roleFilter;
    return matchQ && matchR;
  });

  const counts: Record<string, number> = { All: users.length };
  (["Pilot", "CFI", "Admin", "Staff"] as UserRole[]).forEach(r => {
    counts[r] = users.filter(u => u.role === r).length;
  });

  // ── Mutation helpers ──

  function setPerm(userId: string, mod: ModuleKey, key: string, val: boolean | string[]) {
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      return { ...u, permissions: { ...u.permissions, [mod]: { ...u.permissions[mod], [key]: val } } };
    }));
  }

  function toggleModule(userId: string, mod: ModuleKey, enabled: boolean) {
    setPerm(userId, mod, "enabled", enabled);
  }

  function handleSuspend(userId: string) {
    const u = users.find(u => u.id === userId)!;
    const next = u.status === "Suspended" ? "Active" : "Suspended";
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: next } : u));
    toast.success(`${u.name} is now ${next}`);
  }

  function handleRemove(userId: string) {
    const u = users.find(u => u.id === userId)!;
    setUsers(prev => prev.filter(u => u.id !== userId));
    setSelectedId(null);
    toast.success(`${u.name} removed`);
  }

  function handleResend(userId: string) {
    const u = users.find(u => u.id === userId)!;
    toast.success(`Invite resent to ${u.email}`);
  }

  function handleSendInvite() {
    if (!invName.trim() || !invEmail.trim()) {
      toast.error("Please fill in name and email.");
      return;
    }
    const initials = invName.trim().split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const colors   = ["bg-blue-500 text-white", "bg-teal-600 text-white", "bg-rose-600 text-white", "bg-indigo-600 text-white"];
    const newId    = `u${Date.now()}`;
    const newUser: AircraftUser = {
      id: newId, name: invName.trim(), email: invEmail.trim(),
      role: invRole, status: "Invited", initials,
      colorClass: colors[Math.floor(Math.random() * colors.length)],
      joinedDate: new Date().toISOString().slice(0, 10),
      permissions: makePerms(invRole),
    };
    setUsers(prev => [...prev, newUser]);
    setSelectedId(newId);
    setDetailTab("overview");
    setInvName(""); setInvEmail(""); setInvRole("Pilot");
    setShowInvite(false);
    toast.success(`Invite sent to ${newUser.email}`);
  }

  return (
    <div className="h-full flex overflow-hidden" style={{ background: "#F8FAFC" }}>

      {/* ── Left: user list ── */}
      <div className="w-[290px] shrink-0 flex flex-col bg-white border-r border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-[16px] text-slate-900" style={{ fontWeight: 700 }}>Users</h1>
              <p className="text-[12px] text-slate-400 mt-0.5">{users.length} team members</p>
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 bg-[#2563EB] hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-[12px] transition-colors"
              style={{ fontWeight: 600 }}
            >
              <Plus className="w-3.5 h-3.5" /> Invite
            </button>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search users…"
              className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Role filter tabs */}
        <div className="flex gap-0.5 px-3 py-2 border-b border-slate-100 overflow-x-auto">
          {(["All", "Pilot", "CFI", "Admin", "Staff"] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                roleFilter === r ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
              style={{ fontWeight: roleFilter === r ? 600 : 400 }}
            >
              {r} <span className="opacity-60">{counts[r] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {filtered.length === 0 && (
            <div className="text-center text-[12px] text-slate-400 py-10">No users found</div>
          )}
          {filtered.map(u => (
            <button
              key={u.id}
              onClick={() => { setSelectedId(u.id); setDetailTab("overview"); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                selectedId === u.id
                  ? "bg-blue-50 border border-blue-100"
                  : "hover:bg-slate-50 border border-transparent"
              }`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] ${u.colorClass}`} style={{ fontWeight: 700 }}>
                {u.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] truncate ${selectedId === u.id ? "text-blue-700" : "text-slate-800"}`} style={{ fontWeight: 600 }}>
                  {u.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ROLE_BADGE[u.role]}`} style={{ fontWeight: 600 }}>
                    {u.role}
                  </span>
                  {u.status !== "Active" && (
                    <span className={`text-[10px] ${u.status === "Invited" ? "text-amber-500" : "text-red-400"}`} style={{ fontWeight: 500 }}>
                      {u.status}
                    </span>
                  )}
                </div>
              </div>
              {u.status === "Active" && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      {selectedUser ? (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* User header */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-[18px] shrink-0 ${selectedUser.colorClass}`} style={{ fontWeight: 700 }}>
                {selectedUser.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-[18px] text-slate-900" style={{ fontWeight: 700 }}>{selectedUser.name}</h2>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${ROLE_BADGE[selectedUser.role]}`} style={{ fontWeight: 700 }}>
                    {selectedUser.role}
                  </span>
                  <StatusBadge status={selectedUser.status} />
                </div>
                <p className="text-[13px] text-slate-500 mt-0.5">{selectedUser.email}</p>
                {selectedUser.phone && <p className="text-[12px] text-slate-400 mt-0.5">{selectedUser.phone}</p>}
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {selectedUser.status === "Invited" && (
                  <button
                    onClick={() => handleResend(selectedUser.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
                    style={{ fontWeight: 500 }}
                  >
                    <Send className="w-3.5 h-3.5" /> Resend Invite
                  </button>
                )}
                <button
                  onClick={() => handleSuspend(selectedUser.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] border rounded-lg transition-colors ${
                    selectedUser.status === "Suspended"
                      ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  style={{ fontWeight: 500 }}
                >
                  {selectedUser.status === "Suspended" ? "Reactivate" : "Suspend"}
                </button>
                <button
                  onClick={() => handleRemove(selectedUser.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] border border-red-100 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 mt-4">
              {(["overview", "permissions", "account"] as DetailTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`px-4 py-1.5 rounded-lg text-[13px] capitalize transition-colors ${
                    detailTab === tab ? "bg-[#0A1628] text-white" : "text-slate-500 hover:bg-slate-100"
                  }`}
                  style={{ fontWeight: detailTab === tab ? 600 : 400 }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {detailTab === "overview" && (
              <OverviewTab user={selectedUser} fleet={FLEET} onGoToPerms={() => setDetailTab("permissions")} />
            )}
            {detailTab === "permissions" && (
              <PermissionsTab
                user={selectedUser}
                fleet={FLEET}
                onToggleModule={(mod, val) => toggleModule(selectedUser.id, mod, val)}
                onSetPerm={(mod, key, val) => setPerm(selectedUser.id, mod, key, val)}
              />
            )}
            {detailTab === "account" && (
              <AccountTab
                user={selectedUser}
                onSuspend={() => handleSuspend(selectedUser.id)}
                onRemove={() => handleRemove(selectedUser.id)}
                onResend={() => handleResend(selectedUser.id)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-[14px] text-slate-600" style={{ fontWeight: 500 }}>Select a user to manage</p>
            <p className="text-[12px] text-slate-400 mt-1">Or invite a new team member to get started</p>
            <button
              onClick={() => setShowInvite(true)}
              className="mt-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-[13px] transition-colors"
              style={{ fontWeight: 600 }}
            >
              <UserPlus className="w-4 h-4" /> Invite User
            </button>
          </div>
        </div>
      )}

      {/* ── Invite modal ── */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowInvite(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-[460px] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] text-slate-900" style={{ fontWeight: 700 }}>Invite Team Member</h3>
                  <p className="text-[12px] text-slate-400 mt-0.5">They'll receive an email invitation with account setup instructions</p>
                </div>
                <button onClick={() => setShowInvite(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-[12px] text-slate-600 mb-1.5" style={{ fontWeight: 600 }}>Full Name</label>
                  <input
                    value={invName} onChange={e => setInvName(e.target.value)}
                    placeholder="e.g. Alex Johnson"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-slate-600 mb-1.5" style={{ fontWeight: 600 }}>Email Address</label>
                  <input
                    value={invEmail} onChange={e => setInvEmail(e.target.value)}
                    placeholder="e.g. alex@example.com" type="email"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-slate-600 mb-2" style={{ fontWeight: 600 }}>Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["Pilot", "CFI", "Admin", "Staff"] as UserRole[]).map(r => (
                      <button
                        key={r}
                        onClick={() => setInvRole(r)}
                        className={`px-3 py-3 rounded-xl text-left border transition-all ${
                          invRole === r
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className={`text-[13px] ${invRole === r ? "text-blue-700" : "text-slate-700"}`} style={{ fontWeight: 700 }}>{r}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{ROLE_DESC[r]}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default perms preview */}
                <div className="bg-slate-50 rounded-xl px-3 py-3 border border-slate-100">
                  <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider" style={{ fontWeight: 700 }}>Default modules for {invRole}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PERM_MODULES.filter(m => makePerms(invRole)[m.key].enabled).map(m => (
                      <span key={m.key} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] ${m.iconBg} ${m.iconColor} border border-transparent`} style={{ fontWeight: 600 }}>
                        <m.icon className="w-2.5 h-2.5" /> {m.label}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">You can adjust permissions after inviting.</p>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
                <button
                  onClick={() => setShowInvite(false)}
                  className="px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendInvite}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-[13px] transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <Send className="w-3.5 h-3.5" /> Send Invite
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
