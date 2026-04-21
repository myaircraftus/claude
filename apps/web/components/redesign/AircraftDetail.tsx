"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link, { useTenantRouter } from "@/components/shared/tenant-link";
import { useParams } from "next/navigation";
import {
  Plane, FileText, Clock, Shield, CheckCircle, ChevronRight,
  Download, ArrowLeft, Search, Send, Sparkles, BookOpen,
  AlertTriangle, Plus, X, MoreHorizontal, Wrench, Users,
  BarChart3, Eye, Bell, MessageSquare, Camera, Mic,
  TrendingUp, Activity, Package, Receipt, UserPlus, User,
  ChevronDown, Filter, CheckSquare, Square, ArrowRight,
  Zap, Info, ExternalLink, Edit3, Layers, Hash, Calendar,
  AlarmClock, RefreshCw, Star, Bot, Lock, Unlock, Building2,
  Upload, Radio, Gauge, Trash2, Link2, Phone, Mail, HardHat,
  Check, DollarSign, History,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppContext } from "./AppContext";
import { InviteMechanicModal } from "./InviteMechanicModal";
import { LiveTrackWidget } from "./LiveTrackWidget";
import { useIntegrationStore } from "./integrationStore";

/* ─── Aircraft DB ─────────────────────────────────────────────── */
interface AircraftRecord {
  tail: string;
  model: string;
  year: number;
  serial: string;
  engine: string;
  prop: string;
  category: string;
  operationType: string;
  status: "Airworthy" | "Attention" | "Grounded" | "Tracked";
  hobbs: number;
  tach: number;
  ttaf: number;
  smoh: number;
  spoh: number;
  owner: string;
  ownerCompany: string;
  ownerEmail: string;
  ownerPhone: string;
  basedAt: string;
  docCount: number;
  docCompleteness: number;
}

interface LiveAircraftRecord {
  tail_number: string;
  serial_number?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  engine_make?: string | null;
  engine_model?: string | null;
  prop_make?: string | null;
  prop_model?: string | null;
  base_airport?: string | null;
  operator_name?: string | null;
  operation_types?: string[] | null;
  total_time_hours?: number | null;
  document_count?: number;
  owner_name?: string | null;
  owner_company?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
}

const AIRCRAFT_DB: Record<string, AircraftRecord> = {
  N12345: {
    tail: "N12345", model: "Cessna 172S Skyhawk SP", year: 1998, serial: "172S8001",
    engine: "Lycoming IO-360-L2A", prop: "McCauley 1C160/DTM7553", category: "Single Engine Piston",
    operationType: "Part 91 — Private Owner", status: "Airworthy",
    hobbs: 4012.3, tach: 3847.1, ttaf: 3847, smoh: 1204, spoh: 2021,
    owner: "John Mitchell", ownerCompany: "Mitchell Aviation LLC",
    ownerEmail: "john@mitchellaviation.com", ownerPhone: "(512) 555-0147",
    basedAt: "KAUS — Austin-Bergstrom Intl", docCount: 842, docCompleteness: 87,
  },
  N67890: {
    tail: "N67890", model: "Piper PA-28-181 Archer III", year: 2005, serial: "2843517",
    engine: "Lycoming O-360-A4M", prop: "Sensenich W76EK8-0-54", category: "Single Engine Piston",
    operationType: "Part 135 — Charter Operation", status: "Attention",
    hobbs: 2103.7, tach: 2089.4, ttaf: 2103, smoh: 847, spoh: 1200,
    owner: "Horizon Flights Inc.", ownerCompany: "Horizon Flights Inc.",
    ownerEmail: "ops@horizonflights.com", ownerPhone: "(512) 555-0289",
    basedAt: "KHYI — San Marcos Regional", docCount: 634, docCompleteness: 72,
  },
  N24680: {
    tail: "N24680", model: "Beechcraft Bonanza A36", year: 2001, serial: "E-3201",
    engine: "Continental IO-550-B", prop: "Hartzell HC-E3YR-2AUF", category: "Single Engine Piston",
    operationType: "Part 91 — Private Owner", status: "Airworthy",
    hobbs: 1590.2, tach: 1574.8, ttaf: 1590, smoh: 1590, spoh: 800,
    owner: "Steve Williams", ownerCompany: "",
    ownerEmail: "steve.williams@email.com", ownerPhone: "(512) 555-0312",
    basedAt: "KEDC — Austin Executive", docCount: 371, docCompleteness: 61,
  },
};

/* ─── Upload Modal Types ──────────────────────────────────────── */
type UploadVisibility = "private" | "team";
type UploadBookType  = "historical" | "present";
type ManualAccess    = "private" | "free" | "paid";
interface UploadForm {
  title: string; docType: string; visibility: UploadVisibility;
  aircraft: string; notes: string; file: string;
  bookType?: UploadBookType; manualAccess?: ManualAccess;
  price?: string; attest: boolean;
}
const DOC_TYPES = ["Logbook Entry","Annual Inspection","AD Compliance","337 Major Repair","Weight & Balance","Equipment List","STC","8130-3 Tag","Maintenance Manual","Service Manual","Parts Catalog","POH / AFM","Other"];
const MANUAL_TYPES = ["Maintenance Manual","Service Manual","Parts Catalog"];
const UPLOAD_AIRCRAFT_LIST = ["N12345 — Cessna 172S","N67890 — Piper PA-28-181","N24680 — Beechcraft Bonanza A36"];
const UPLOAD_FORM_DEFAULT: UploadForm = { title:"", docType:"Logbook Entry", visibility:"private", aircraft:"", notes:"", file:"", attest:false };

/* ─── Squawk Data ─────────────────────────────────────────────── */
interface Squawk {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  grounded: boolean;
  status: "Open" | "In Progress" | "Resolved";
  reportedBy: string;
  reportedByRole: string;
  date: string;
  photos?: number;
  linkedWO?: string;
}

interface LiveSquawkRecord {
  id: string;
  title: string;
  description?: string | null;
  severity?: string | null;
  status?: string | null;
  source?: string | null;
  source_metadata?: Record<string, unknown> | null;
  assigned_work_order_id?: string | null;
  reported_at?: string | null;
  created_at?: string | null;
  reporter?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
}

const SQUAWKS_DB: Record<string, Squawk[]> = {
  N12345: [
    { id: "sq-1", title: "Nav lights flickering intermittently", description: "Both nav lights briefly flicker during engine run-up. Confirmed at 1,800 RPM. Suspect loose connection at wing root.", category: "Avionics / Electrical", severity: "Medium", grounded: false, status: "Open", reportedBy: "John Mitchell", reportedByRole: "Owner", date: "Apr 6, 2026", photos: 2 },
    { id: "sq-2", title: "Left door seal showing wear", description: "Wind noise audible at cruise altitude. Left door weather seal degraded at forward hinge area. Non-structural.", category: "Cabin / Interior", severity: "Low", grounded: false, status: "Open", reportedBy: "John Mitchell", reportedByRole: "Owner", date: "Apr 2, 2026" },
    { id: "sq-3", title: "ELT battery expiration approaching", description: "ELT battery date marked 09/2026 per placard. Should be replaced at annual or sooner.", category: "Emergency Equipment", severity: "Low", grounded: false, status: "Open", reportedBy: "Mike Torres", reportedByRole: "Lead Mechanic", date: "Mar 15, 2026", linkedWO: "WO-2026-0042" },
  ],
  N67890: [
    { id: "sq-4", title: "Left brake dragging — increased pedal pressure", description: "Pilot noted increased left brake pedal pressure during ground roll. Possible caliper piston binding. Parts ordered.", category: "Landing Gear / Brakes", severity: "High", grounded: false, status: "In Progress", reportedBy: "Horizon Ops", reportedByRole: "Operator", date: "Apr 5, 2026", photos: 3, linkedWO: "WO-2026-0047" },
    { id: "sq-5", title: "Alternator output fluctuating", description: "Bus voltage dropping to 12.8V at idle, normal at cruise. ALT light briefly illuminated twice on last flight.", category: "Avionics / Electrical", severity: "High", grounded: false, status: "Open", reportedBy: "Capt. R. Alvarez", reportedByRole: "Pilot", date: "Apr 4, 2026", photos: 1 },
  ],
  N24680: [
    { id: "sq-6", title: "Fuel cap O-ring requires replacement", description: "Left fuel cap O-ring showing cracking. Slight fuel smell noted after fueling. No leakage in flight.", category: "Fuel System", severity: "Medium", grounded: false, status: "Open", reportedBy: "Steve Williams", reportedByRole: "Owner", date: "Apr 3, 2026" },
  ],
};

/* ─── Reminder Data ───────────────────────────────────────────── */
interface Reminder {
  id: string;
  title: string;
  category: string;
  type: "Date" | "Hobbs" | "Tach" | "Recurring";
  dueDate?: string;
  daysRemaining?: number;
  dueHobbs?: number;
  hobbsRemaining?: number;
  dueTach?: number;
  tachRemaining?: number;
  status: "Overdue" | "Critical" | "Upcoming" | "OK";
  priority: "High" | "Medium" | "Low";
  canRequestMaintenance: boolean;
}

const REMINDERS_DB: Record<string, Reminder[]> = {
  N12345: [
    { id: "rem-1", title: "AD 2025-03-02 — Alternator Bracket Inspection", category: "Airworthiness Directive", type: "Date", dueDate: "Apr 15, 2026", daysRemaining: 6, status: "Critical", priority: "High", canRequestMaintenance: true },
    { id: "rem-2", title: "Annual Inspection", category: "Inspection", type: "Date", dueDate: "May 19, 2026", daysRemaining: 40, status: "Upcoming", priority: "High", canRequestMaintenance: true },
    { id: "rem-3", title: "Oil Change — 50 Hobbs Interval", category: "Engine", type: "Hobbs", dueHobbs: 4050, hobbsRemaining: 37.7, status: "Upcoming", priority: "Medium", canRequestMaintenance: true },
    { id: "rem-4", title: "100-Hour Inspection", category: "Inspection", type: "Tach", dueTach: 3900, tachRemaining: 52.9, status: "Upcoming", priority: "Medium", canRequestMaintenance: true },
    { id: "rem-5", title: "Transponder / Altimeter Check", category: "Avionics", type: "Date", dueDate: "Jun 30, 2026", daysRemaining: 82, status: "OK", priority: "Low", canRequestMaintenance: false },
    { id: "rem-6", title: "ELT Battery Replacement", category: "Emergency Equipment", type: "Date", dueDate: "Sep 1, 2026", daysRemaining: 145, status: "OK", priority: "Low", canRequestMaintenance: true },
    { id: "rem-7", title: "Registration Renewal", category: "Documents", type: "Date", dueDate: "Nov 30, 2026", daysRemaining: 235, status: "OK", priority: "Low", canRequestMaintenance: false },
  ],
  N67890: [
    { id: "rem-8", title: "AD 2024-15-06 — Fuel Line Inspection", category: "Airworthiness Directive", type: "Date", dueDate: "Apr 12, 2026", daysRemaining: 3, status: "Critical", priority: "High", canRequestMaintenance: true },
    { id: "rem-9", title: "100-Hour / Charter Inspection", category: "Inspection", type: "Hobbs", dueHobbs: 2150, hobbsRemaining: 46.3, status: "Upcoming", priority: "High", canRequestMaintenance: true },
    { id: "rem-10", title: "Annual Inspection", category: "Inspection", type: "Date", dueDate: "Jul 22, 2026", daysRemaining: 104, status: "OK", priority: "High", canRequestMaintenance: true },
  ],
  N24680: [
    { id: "rem-11", title: "Annual Inspection", category: "Inspection", type: "Date", dueDate: "Jun 1, 2026", daysRemaining: 53, status: "Upcoming", priority: "High", canRequestMaintenance: true },
    { id: "rem-12", title: "Pitot-Static / Altimeter Certification", category: "Avionics", type: "Date", dueDate: "Oct 15, 2026", daysRemaining: 189, status: "OK", priority: "Medium", canRequestMaintenance: false },
  ],
};

/* ─── Assignments Data ────────────────────────────────────────── */
interface Assignment {
  id: string;
  name: string;
  role: string;
  email: string;
  permissions: string[];
  status: "Active" | "Pending";
  avatar?: string;
}

const ASSIGNMENTS_DB: Record<string, Assignment[]> = {
  N12345: [
    { id: "asn-1", name: "John Mitchell", role: "Owner", email: "john@mitchellaviation.com", permissions: ["Full Access", "All Documents", "Approve Work", "Pay Invoices"], status: "Active" },
    { id: "asn-2", name: "Mike Torres", role: "Lead Mechanic", email: "mike@austinaviation.com", permissions: ["Maintenance Full", "Estimates", "Work Orders", "Invoices", "Logbook Entries"], status: "Active" },
    { id: "asn-3", name: "Sarah Chen", role: "CFI / Instructor", email: "sarah.chen@cfi.com", permissions: ["Flight Records", "View Documents", "Submit Squawks"], status: "Active" },
    { id: "asn-4", name: "AXL Insurance Group", role: "Insurance Reviewer", email: "audits@axlins.com", permissions: ["Read-Only Documents", "View Intelligence"], status: "Active" },
  ],
  N67890: [
    { id: "asn-5", name: "Horizon Flights Inc.", role: "Operator", email: "ops@horizonflights.com", permissions: ["Full Access", "All Documents", "Approve Work"], status: "Active" },
    { id: "asn-6", name: "Mike Torres", role: "Lead Mechanic", email: "mike@austinaviation.com", permissions: ["Maintenance Full", "Estimates", "Work Orders"], status: "Active" },
    { id: "asn-7", name: "Dana Lee", role: "Mechanic", email: "dana@austinaviation.com", permissions: ["Work Orders", "Time Logging", "Parts"], status: "Active" },
  ],
  N24680: [
    { id: "asn-8", name: "Steve Williams", role: "Owner", email: "steve.williams@email.com", permissions: ["Full Access", "All Documents", "Approve Work", "Pay Invoices"], status: "Active" },
    { id: "asn-9", name: "Mike Torres", role: "Lead Mechanic", email: "mike@austinaviation.com", permissions: ["Maintenance Full", "Estimates", "Work Orders", "Invoices"], status: "Active" },
  ],
};

/* ─── Activity Data ───────────────────────────────────────────── */
interface ActivityItem {
  id: string;
  type: "maintenance" | "document" | "squawk" | "reminder" | "logbook" | "system" | "note";
  title: string;
  detail: string;
  actor: string;
  actorRole: string;
  time: string;
}

const ACTIVITY_DB: Record<string, ActivityItem[]> = {
  N12345: [
    { id: "act-1", type: "maintenance", title: "Work Order WO-2026-0042 updated", detail: "Annual inspection work scope revised. Added 2 labor items for AD compliance.", actor: "Mike Torres", actorRole: "Lead Mechanic", time: "2 hours ago" },
    { id: "act-2", type: "squawk", title: "New squawk added", detail: "Nav lights flickering reported by owner. Categorized: Avionics / Electrical.", actor: "John Mitchell", actorRole: "Owner", time: "3 days ago" },
    { id: "act-3", type: "document", title: "Annual Inspection Report uploaded", detail: "12-page document processed and indexed. 842 docs total.", actor: "Mike Torres", actorRole: "Lead Mechanic", time: "Mar 15, 2026" },
    { id: "act-4", type: "logbook", title: "Maintenance logbook entry signed", detail: "Oil change & filter at Hobbs 3,847. Signed by Mike Torres — A&P/IA #3847512.", actor: "Mike Torres", actorRole: "Lead Mechanic", time: "Feb 8, 2026" },
    { id: "act-5", type: "reminder", title: "Reminder triggered: AD 2025-03-02", detail: "6 days until compliance deadline. Action required.", actor: "System", actorRole: "Auto", time: "Today" },
    { id: "act-6", type: "maintenance", title: "Estimate EST-2026-0018 approved", detail: "Annual inspection estimate $2,840 approved by John Mitchell.", actor: "John Mitchell", actorRole: "Owner", time: "Mar 10, 2026" },
  ],
  N67890: [
    { id: "act-7", type: "maintenance", title: "Parts ordered for WO-2026-0047", detail: "Brake disc and pad set ordered from Aircraft Spruce. ETA 2 days.", actor: "Dana Lee", actorRole: "Mechanic", time: "2 days ago" },
    { id: "act-8", type: "squawk", title: "Squawk updated — brake job in progress", detail: "Left brake squawk linked to WO-2026-0047.", actor: "Mike Torres", actorRole: "Lead Mechanic", time: "3 days ago" },
  ],
  N24680: [
    { id: "act-9", type: "squawk", title: "New squawk added", detail: "Fuel cap O-ring cracking reported by owner.", actor: "Steve Williams", actorRole: "Owner", time: "3 days ago" },
    { id: "act-10", type: "document", title: "Prop overhaul certificate uploaded", detail: "Hartzell overhaul certificate processed and indexed.", actor: "Steve Williams", actorRole: "Owner", time: "Dec 5, 2025" },
  ],
};

/* ─── Helper utils ────────────────────────────────────────────── */
const severityColor = (s: Squawk["severity"]) => ({
  Low: "bg-slate-100 text-slate-600",
  Medium: "bg-amber-50 text-amber-700",
  High: "bg-orange-50 text-orange-700",
  Critical: "bg-red-50 text-red-700",
}[s]);

const normalizeSquawkSeverity = (severity?: string | null): Squawk["severity"] => {
  switch ((severity ?? "").toLowerCase()) {
    case "minor":
    case "low":
      return "Low";
    case "urgent":
    case "high":
      return "High";
    case "grounding":
    case "critical":
      return "Critical";
    default:
      return "Medium";
  }
};

const normalizeSquawkStatus = (status?: string | null): Squawk["status"] => {
  switch ((status ?? "").toLowerCase()) {
    case "resolved":
      return "Resolved";
    case "acknowledged":
    case "in_work_order":
      return "In Progress";
    default:
      return "Open";
  }
};

const formatSquawkDate = (value?: string | null) => {
  if (!value) return "Today";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Today";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const mapLiveSquawk = (record: LiveSquawkRecord): Squawk => {
  const metadata = (record.source_metadata ?? {}) as Record<string, unknown>;
  const reportedBy =
    record.reporter?.full_name?.trim() ||
    record.reporter?.email?.trim() ||
    "System";
  const reportedByRole =
    typeof metadata.reportedByRole === "string" && metadata.reportedByRole.trim().length > 0
      ? metadata.reportedByRole
      : typeof record.source === "string" && record.source.length > 0
        ? record.source
        : "Owner";

  return {
    id: record.id,
    title: record.title,
    description:
      record.description ||
      (typeof metadata.structuredDescription === "string" ? metadata.structuredDescription : "") ||
      "No description provided.",
    category:
      (typeof metadata.category === "string" && metadata.category) ||
      (typeof metadata.system === "string" && metadata.system) ||
      "General",
    severity: normalizeSquawkSeverity(record.severity),
    grounded:
      Boolean(metadata.grounded) ||
      String(record.severity ?? "").toLowerCase() === "grounding",
    status: normalizeSquawkStatus(record.status),
    reportedBy,
    reportedByRole,
    date: formatSquawkDate(record.reported_at ?? record.created_at),
    photos:
      typeof metadata.photoCount === "number"
        ? metadata.photoCount
        : typeof metadata.photoCount === "string"
          ? Number(metadata.photoCount) || undefined
          : undefined,
    linkedWO:
      record.assigned_work_order_id ||
      (typeof metadata.linkedWO === "string" ? metadata.linkedWO : undefined),
  };
};

const statusDot = (s: Reminder["status"]) => ({
  Overdue: "bg-red-500",
  Critical: "bg-orange-500",
  Upcoming: "bg-amber-400",
  OK: "bg-emerald-500",
}[s]);

const reminderStatusColor = (s: Reminder["status"]) => ({
  Overdue: "bg-red-50 text-red-700",
  Critical: "bg-orange-50 text-orange-700",
  Upcoming: "bg-amber-50 text-amber-700",
  OK: "bg-emerald-50 text-emerald-700",
}[s]);

const activityIcon = (type: ActivityItem["type"]) => {
  const map = { maintenance: Wrench, document: FileText, squawk: AlertTriangle, reminder: Bell, logbook: BookOpen, system: Zap, note: MessageSquare };
  return map[type] || Activity;
};

const activityColor = (type: ActivityItem["type"]) => ({
  maintenance: "bg-blue-50 text-blue-600",
  document: "bg-emerald-50 text-emerald-600",
  squawk: "bg-amber-50 text-amber-600",
  reminder: "bg-orange-50 text-orange-600",
  logbook: "bg-violet-50 text-violet-600",
  system: "bg-slate-100 text-slate-500",
  note: "bg-slate-100 text-slate-500",
}[type] || "bg-slate-100 text-slate-500");

const roleColor = (role: string) => {
  if (role.includes("Owner") || role.includes("Operator")) return "bg-primary/8 text-primary";
  if (role.includes("Mechanic") || role.includes("IA")) return "bg-blue-50 text-blue-700";
  if (role.includes("CFI") || role.includes("Instructor") || role.includes("Pilot")) return "bg-violet-50 text-violet-700";
  if (role.includes("Insurance") || role.includes("Auditor") || role.includes("Lender")) return "bg-slate-100 text-slate-600";
  return "bg-slate-100 text-slate-600";
};

const TABS = ["Overview", "Squawks", "Reminders", "Maintenance", "Documents", "Intelligence", "Assignments", "Activity"];
const REACTIONS = ['👍', '👎', '❤️', '✈️', '🔧', '😮'];

/* ─── Main Component ──────────────────────────────────────────── */
interface AircraftDetailProps {
  aircraftId?: string;
  aircraftTail?: string;
  aircraft?: LiveAircraftRecord;
}

export function AircraftDetail({ aircraftId, aircraftTail, aircraft }: AircraftDetailProps = {}) {
  const { id } = useParams();
  const router = useTenantRouter();
  const tailParam = Array.isArray(id) ? id[0] : id;
  const liveTail = aircraft?.tail_number?.trim().toUpperCase();
  const resolvedTail =
    aircraftTail ||
    liveTail ||
    (tailParam && AIRCRAFT_DB[tailParam] ? tailParam : undefined) ||
    "N12345";
  const fallbackAircraft = AIRCRAFT_DB["N12345"];
  const baseAircraft = AIRCRAFT_DB[resolvedTail]
    ? AIRCRAFT_DB[resolvedTail]
    : {
        ...fallbackAircraft,
        tail: resolvedTail,
        model:
          [aircraft?.make, aircraft?.model].filter(Boolean).join(" ").trim() || "Aircraft",
        year: aircraft?.year ?? 0,
        serial: aircraft?.serial_number ?? "—",
        engine:
          [aircraft?.engine_make, aircraft?.engine_model].filter(Boolean).join(" ").trim() || "—",
        prop:
          [aircraft?.prop_make, aircraft?.prop_model].filter(Boolean).join(" ").trim() || "—",
        operationType:
          aircraft?.operation_types?.filter(Boolean).join(" • ") ||
          aircraft?.operator_name ||
          "Tracked aircraft",
        status: "Tracked" as const,
        hobbs: 0,
        tach: 0,
        ttaf: Number(aircraft?.total_time_hours ?? 0),
        smoh: 0,
        spoh: 0,
        owner: aircraft?.owner_name || aircraft?.operator_name || "Unassigned owner",
        ownerCompany: aircraft?.owner_company || aircraft?.operator_name || "",
        ownerEmail: aircraft?.owner_email || "",
        ownerPhone: aircraft?.owner_phone || "",
        basedAt: aircraft?.base_airport || "—",
        docCount: aircraft?.document_count ?? 0,
        docCompleteness: 0,
      };
  const ac: AircraftRecord = {
    ...baseAircraft,
    tail: aircraft?.tail_number?.toUpperCase() ?? baseAircraft.tail,
    model:
      [aircraft?.make, aircraft?.model].filter(Boolean).join(" ").trim() || baseAircraft.model,
    year: aircraft?.year ?? baseAircraft.year,
    serial: aircraft?.serial_number ?? baseAircraft.serial,
    engine:
      [aircraft?.engine_make, aircraft?.engine_model].filter(Boolean).join(" ").trim() ||
      baseAircraft.engine,
    prop:
      [aircraft?.prop_make, aircraft?.prop_model].filter(Boolean).join(" ").trim() ||
      baseAircraft.prop,
    operationType:
      aircraft?.operation_types?.filter(Boolean).join(" • ") ||
      aircraft?.operator_name ||
      baseAircraft.operationType,
    ttaf: Number(aircraft?.total_time_hours ?? baseAircraft.ttaf),
    owner: aircraft?.owner_name || aircraft?.operator_name || baseAircraft.owner,
    ownerCompany: aircraft?.owner_company ?? baseAircraft.ownerCompany,
    ownerEmail: aircraft?.owner_email ?? baseAircraft.ownerEmail,
    ownerPhone: aircraft?.owner_phone ?? baseAircraft.ownerPhone,
    basedAt: aircraft?.base_airport ?? baseAircraft.basedAt,
    docCount: aircraft?.document_count ?? baseAircraft.docCount,
    docCompleteness: aircraft ? 0 : baseAircraft.docCompleteness,
    status: aircraft && !AIRCRAFT_DB[resolvedTail] ? "Tracked" : baseAircraft.status,
  };
  const tail = ac.tail;
  const uploadHref = aircraftId
    ? `/documents/upload?aircraft=${encodeURIComponent(aircraftId)}`
    : `/documents/upload?aircraft_tail=${encodeURIComponent(tail)}`;
  const fallbackSquawks = SQUAWKS_DB[tail] || [];
  const reminders = REMINDERS_DB[tail] || [];
  const assignments = ASSIGNMENTS_DB[tail] || [];
  const activity = ACTIVITY_DB[tail] || [];

  const { aircraftAssignments, toggleAircraftAssignment, removeAircraftAssignment } = useAppContext();
  const mechanics = aircraftAssignments.filter(a => a.aircraftTail === tail);
  const integrations = useIntegrationStore();
  const liveTrackEnabled = integrations.isConnected("flightaware") || integrations.isConnected("adsbexchange");

  const [activeTab, setActiveTab] = useState("Overview");
  const [squawkFilter, setSquawkFilter] = useState<"All" | "Open" | "In Progress" | "Resolved">("All");
  const [selectedSquawks, setSelectedSquawks] = useState<string[]>([]);
  const [showAddSquawk, setShowAddSquawk] = useState(false);
  const [squawks, setSquawks] = useState<Squawk[]>(fallbackSquawks);
  const [loadingSquawks, setLoadingSquawks] = useState(false);
  const [squawkText, setSquawkText] = useState("");
  const [squawkGrounded, setSquawkGrounded] = useState(false);
  const [squawkStructure, setSquawkStructure] = useState<{
    title: string;
    description: string;
    category: string;
    severity: Squawk["severity"];
    grounded: boolean;
    system?: string;
    structuredBy?: string;
  } | null>(null);
  const [squawkNotice, setSquawkNotice] = useState<string | null>(null);
  const [squawkError, setSquawkError] = useState<string | null>(null);
  const [squawkRecording, setSquawkRecording] = useState(false);
  const [squawkTranscribing, setSquawkTranscribing] = useState(false);
  const [squawkExtractingPhoto, setSquawkExtractingPhoto] = useState(false);
  const [squawkStructuring, setSquawkStructuring] = useState(false);
  const [savingSquawk, setSavingSquawk] = useState(false);
  const [squawkPhotoMeta, setSquawkPhotoMeta] = useState<{
    name: string;
    type: string;
    size: number;
    extracted?: boolean;
    fallback?: boolean;
  } | null>(null);
  const squawkAudioChunksRef = useRef<Blob[]>([]);
  const squawkRecorderRef = useRef<MediaRecorder | null>(null);
  const squawkSpeechRecognitionRef = useRef<any>(null);
  const squawkPhotoInputRef = useRef<HTMLInputElement>(null);
  const [reminderFilter, setReminderFilter] = useState("All");
  const [askInput, setAskInput] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [showInviteMechanic, setShowInviteMechanic] = useState(false);

  // Maintenance tab — owner action state
  const [askingWO, setAskingWO] = useState<string | null>(null);
  const [askWOMessage, setAskWOMessage] = useState("");
  const [sentWOMessages, setSentWOMessages] = useState<Record<string, string[]>>({});
  const [approvedItems, setApprovedItems] = useState<string[]>([]);
  const [deniedItems, setDeniedItems] = useState<string[]>([]);
  const [maintTab, setMaintTab] = useState<"workorders" | "mechanics">("workorders");
  const [selectedWOItem, setSelectedWOItem] = useState<string | null>(null);
  const [expandMechanicId, setExpandMechanicId] = useState<string | null>(null);

  // ── More menu ─────────────────────────────────────────────────
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // ── Upload modal ──────────────────────────────────────────────
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadForm>(UPLOAD_FORM_DEFAULT);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const puf = (f: Partial<UploadForm>) => setUploadForm(prev => ({ ...prev, ...f }));
  const isManualUploadType = MANUAL_TYPES.includes(uploadForm.docType);
  const uploadGross = parseFloat(uploadForm.price || "0");
  const uploadNet = Math.max(0, uploadGross - (uploadGross * 0.029 + 0.3));
  const uploaderShare = (uploadNet * 0.5).toFixed(2);
  const platformShare = (uploadNet * 0.5).toFixed(2);
  const canUploadSubmit = uploadForm.title.trim() && uploadForm.file;
  const handleUploadSubmit = () => {
    setUploadSuccess(true);
    setTimeout(() => { setUploadSuccess(false); setShowUpload(false); setUploadForm(UPLOAD_FORM_DEFAULT); }, 2200);
  };

  // ── Long-press reactions ──────────────────────────────────────
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressTarget, setLongPressTarget] = useState<string | null>(null);
  const [messageReactions, setMessageReactions] = useState<Record<string, string>>({});

  const startLongPress = (id: string) => {
    longPressTimerRef.current = setTimeout(() => setLongPressTarget(id), 450);
  };
  const endLongPress = () => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  };
  const addReaction = (msgId: string, emoji: string) => {
    setMessageReactions(p => ({ ...p, [msgId]: p[msgId] === emoji ? "" : emoji }));
    setLongPressTarget(null);
  };
  /** Floating emoji picker — appears above bubble on long-press */
  const reactionPicker = (id: string, align: 'left' | 'right' = 'left') => (
    <AnimatePresence>
      {longPressTarget === id && (
        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.7, y: 10 }}
          transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          className={`absolute bottom-[calc(100%+8px)] ${align === 'right' ? 'right-0' : 'left-0'} z-30 flex items-center gap-0.5 bg-white rounded-2xl shadow-xl border border-slate-100 px-2 py-1.5`}
          onMouseLeave={() => setLongPressTarget(null)}
        >
          {REACTIONS.map(e => (
            <button key={e} onClick={() => addReaction(id, e)}
              className={`w-9 h-9 flex items-center justify-center text-[20px] rounded-xl transition-all hover:scale-125 active:scale-95 ${messageReactions[id] === e ? 'bg-blue-50 scale-110' : 'hover:bg-slate-50'}`}>
              {e}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
  /** Spread onto any bubble wrapper to enable long-press */
  const lph = (id: string) => ({
    onMouseDown: () => startLongPress(id),
    onMouseUp: endLongPress,
    onMouseLeave: endLongPress,
    onTouchStart: () => startLongPress(id),
    onTouchEnd: endLongPress,
  });

  const resetSquawkComposer = useCallback(() => {
    setSquawkText("");
    setSquawkGrounded(false);
    setSquawkStructure(null);
    setSquawkNotice(null);
    setSquawkError(null);
    setSquawkPhotoMeta(null);
    squawkSpeechRecognitionRef.current = null;
  }, []);

  const fetchLiveSquawks = useCallback(async () => {
    if (!aircraftId) {
      setSquawks(fallbackSquawks);
      return;
    }
    setLoadingSquawks(true);
    try {
      const res = await fetch(`/api/squawks?aircraft_id=${encodeURIComponent(aircraftId)}&ts=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load squawks");
      const payload = await res.json();
      const liveRecords = Array.isArray(payload?.squawks) ? payload.squawks : [];
      const mapped = liveRecords.map((record: LiveSquawkRecord) => mapLiveSquawk(record));
      setSquawks(mapped.length > 0 ? mapped : fallbackSquawks);
    } catch (error) {
      console.error("Failed to refresh squawks", error);
      setSquawks(fallbackSquawks);
    } finally {
      setLoadingSquawks(false);
    }
  }, [aircraftId, fallbackSquawks]);

  useEffect(() => {
    setSquawks(fallbackSquawks);
  }, [fallbackSquawks]);

  useEffect(() => {
    void fetchLiveSquawks();
  }, [fetchLiveSquawks]);

  const structureSquawk = useCallback(async (text: string, grounded: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setSquawkError("Describe the issue first so AI can structure it.");
      return null;
    }

    setSquawkStructuring(true);
    setSquawkError(null);
    setSquawkNotice(null);
    try {
      const res = await fetch("/api/squawks/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          tail_number: tail,
          grounded,
          aircraft: {
            make: aircraft?.make ?? ac.model,
            model: aircraft?.model ?? ac.model,
            engine: ac.engine,
          },
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Failed to structure squawk");
      }
      const payload = await res.json();
      const structured = {
        title: payload.title ?? trimmed.split(/[.!?]+/)[0]?.trim() ?? "New squawk",
        description: payload.description ?? trimmed,
        category: payload.category ?? "General",
        severity: (payload.severity ?? "Medium") as Squawk["severity"],
        grounded: Boolean(payload.grounded ?? grounded),
        system: payload.system ?? payload.category ?? "General",
        structuredBy: payload.structuredBy ?? "ai",
      };
      setSquawkStructure(structured);
      setSquawkGrounded(structured.grounded);
      setSquawkNotice(`AI structured this as ${structured.category}${structured.structuredBy ? ` • ${structured.structuredBy}` : ""}.`);
      return structured;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to structure squawk";
      console.error(message, error);
      setSquawkError(message);
      return null;
    } finally {
      setSquawkStructuring(false);
    }
  }, [ac.engine, ac.model, aircraft?.make, aircraft?.model, tail]);

  const startSquawkRecording = useCallback(async () => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
        : null;

    if (SpeechRecognitionCtor) {
      try {
        const recognition = new SpeechRecognitionCtor();
        squawkSpeechRecognitionRef.current = recognition;
        recognition.lang = "en-US";
        recognition.interimResults = false;
        recognition.continuous = false;

        recognition.onstart = () => {
          setSquawkRecording(true);
          setSquawkError(null);
          setSquawkNotice("Listening… speak your squawk.");
        };

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results ?? [])
            .map((result: any) => result?.[0]?.transcript ?? "")
            .join(" ")
            .trim();
          if (!transcript) return;
          setSquawkText((prev) => [prev.trim(), transcript].filter(Boolean).join(prev.trim() ? "\n\n" : ""));
          setSquawkNotice("Dictation added to the squawk description.");
        };

        recognition.onerror = (event: any) => {
          const code = String(event?.error ?? "unknown");
          if (code !== "aborted") {
            setSquawkError("Browser dictation failed. You can type the issue manually.");
          }
        };

        recognition.onend = () => {
          setSquawkRecording(false);
          squawkSpeechRecognitionRef.current = null;
        };

        recognition.start();
        return;
      } catch (error) {
        console.error("Speech recognition start failed", error);
      }
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setSquawkError("Voice dictation is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      squawkAudioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) squawkAudioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(squawkAudioChunksRef.current, { type: "audio/webm" });
        setSquawkTranscribing(true);
        setSquawkError(null);
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "squawk.webm");
          const res = await fetch("/api/squawks/transcribe", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload?.error ?? "Transcription failed");
          }
          const payload = await res.json();
          const text = String(payload?.text ?? "").trim();
          setSquawkText((prev) => [prev.trim(), text].filter(Boolean).join(prev.trim() ? "\n\n" : ""));
          setSquawkNotice("Dictation added to the squawk description.");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Transcription failed";
          console.error(message, error);
          setSquawkError(message);
        } finally {
          setSquawkTranscribing(false);
        }
      };

      squawkRecorderRef.current = recorder;
      recorder.start();
      setSquawkRecording(true);
      setSquawkNotice("Recording started.");
    } catch (error) {
      console.error("Microphone access failed", error);
      setSquawkError("Microphone access failed. Please allow microphone access and try again.");
    }
  }, []);

  const stopSquawkRecording = useCallback(() => {
    if (squawkSpeechRecognitionRef.current && squawkRecording) {
      squawkSpeechRecognitionRef.current.stop();
      return;
    }
    if (squawkRecorderRef.current && squawkRecording) {
      squawkRecorderRef.current.stop();
      setSquawkRecording(false);
    }
  }, [squawkRecording]);

  const handleSquawkPhotoSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSquawkExtractingPhoto(true);
    setSquawkError(null);
    setSquawkNotice(null);
    setSquawkPhotoMeta({
      name: file.name,
      type: file.type || "image/jpeg",
      size: file.size,
    });
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/squawks/from-photo", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Photo extraction failed");
      }
      const payload = await res.json();
      const extracted = Array.isArray(payload?.squawks) ? payload.squawks : [];
      if (extracted.length === 0) {
        setSquawkText((prev) =>
          prev.trim() ? prev : `Photo attached (${file.name}). Describe the issue or add more detail before saving.`,
        );
        setSquawkNotice("Photo attached, but no issue was detected automatically.");
        return;
      }
      const combined = extracted
        .map((item: { title?: string; description?: string }) =>
          [item.title?.trim(), item.description?.trim()].filter(Boolean).join(": "),
        )
        .filter(Boolean)
        .join("\n");
      setSquawkText(combined);
      setSquawkNotice(`Photo analyzed. ${extracted.length} possible issue${extracted.length > 1 ? "s" : ""} extracted.`);
      setSquawkPhotoMeta({
        name: file.name,
        type: file.type || "image/jpeg",
        size: file.size,
        extracted: !payload?.fallback,
        fallback: Boolean(payload?.fallback),
      });
      if (extracted[0]?.description) {
        setSquawkStructure({
          title: extracted[0].title ?? "Extracted squawk",
          description: extracted[0].description,
          category: "General",
          severity: "Medium",
          grounded: squawkGrounded,
          structuredBy: payload?.fallback ? "photo-fallback" : "photo",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Photo extraction failed";
      console.error(message, error);
      setSquawkText((prev) =>
        prev.trim() ? prev : `Photo attached (${file.name}). AI extraction was unavailable, so review the photo manually and add any needed detail.`,
      );
      setSquawkStructure({
        title: "Photo attached for manual review",
        description: `Image "${file.name}" was attached. AI extraction was unavailable, so review the photo manually and add any needed detail before saving.`,
        category: "General",
        severity: "Medium",
        grounded: squawkGrounded,
        structuredBy: "photo-fallback",
      });
      setSquawkNotice("Photo attached. AI extraction was unavailable, but you can still save the squawk.");
    } finally {
      setSquawkExtractingPhoto(false);
      if (squawkPhotoInputRef.current) squawkPhotoInputRef.current.value = "";
    }
  }, [squawkGrounded]);

  const saveAircraftSquawk = useCallback(async () => {
    if (!aircraftId) {
      setSquawkError("This aircraft must be saved before squawks can be added.");
      return;
    }

    const sourceText = squawkText.trim();
    if (!sourceText) {
      setSquawkError("Describe the issue before saving the squawk.");
      return;
    }

    setSavingSquawk(true);
    setSquawkError(null);
    setSquawkNotice(null);

    try {
      const structured = squawkStructure ?? (await structureSquawk(sourceText, squawkGrounded));
      if (!structured) return;

      const res = await fetch("/api/squawks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          title: structured.title,
          description: structured.description,
          severity:
            structured.severity === "Low"
              ? "minor"
              : structured.severity === "High"
                ? "urgent"
                : structured.severity === "Critical"
                  ? "grounding"
                  : "normal",
          source: structured.structuredBy === "photo" ? "photo" : structured.structuredBy === "voice" ? "voice" : "manual",
          source_metadata: {
            category: structured.category,
            system: structured.system ?? structured.category,
            grounded: squawkGrounded || structured.grounded,
            structuredDescription: structured.description,
            structuredBy: structured.structuredBy ?? "ai",
            rawText: sourceText,
            photoAttachment: squawkPhotoMeta,
          },
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Failed to save squawk");
      }
      const payload = await res.json();
      setSquawks((prev) => [mapLiveSquawk(payload), ...prev]);
      setShowAddSquawk(false);
      resetSquawkComposer();
      setSquawkNotice("Squawk saved to this aircraft.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save squawk";
      console.error(message, error);
      setSquawkError(message);
    } finally {
      setSavingSquawk(false);
    }
  }, [aircraftId, resetSquawkComposer, squawkGrounded, squawkPhotoMeta, squawkStructure, squawkText, structureSquawk]);

  // ── Maintenance tab computed data ─────────────────────────────
  const w42done = approvedItems.includes("WO-2026-0042") || deniedItems.includes("WO-2026-0042");
  const e18done = approvedItems.includes("EST-2026-0018") || deniedItems.includes("EST-2026-0018");
  const woListItems = tail === "N12345" ? [
    { id: "WO-2026-0042", type: "wo" as const, title: "Nav light repair", status: w42done ? (approvedItems.includes("WO-2026-0042") ? "Approved" : "Declined") : "Awaiting Approval", dot: w42done ? (approvedItems.includes("WO-2026-0042") ? "bg-emerald-400" : "bg-slate-400") : "bg-amber-400", amount: "$460.00", action: !w42done, progress: 70 },
    { id: "INV-2026-0031", type: "invoice" as const, title: "Nav light repair", status: "Payment Due", dot: "bg-red-400", amount: "$494.50", action: true },
  ] : tail === "N67890" ? [
    { id: "WO-2026-0047", type: "wo" as const, title: "Brake caliper service", status: "In Progress", dot: "bg-indigo-400", amount: "$790.50", action: false, progress: 45 },
  ] : [
    { id: "EST-2026-0018", type: "estimate" as const, title: "Annual Inspection", status: e18done ? (approvedItems.includes("EST-2026-0018") ? "Approved" : "Declined") : "Awaiting Approval", dot: e18done ? (approvedItems.includes("EST-2026-0018") ? "bg-emerald-400" : "bg-slate-400") : "bg-amber-400", amount: "$1,634.50", action: !e18done },
  ];
  const activeWOItem = selectedWOItem ?? woListItems[0]?.id ?? null;
  const recordsData = tail === "N12345" ? [
    { entry: "Oil Change & Filter", date: "Feb 8, 2026" },
    { entry: "Propeller Overhaul RTS", date: "Dec 5, 2025" },
  ] : tail === "N67890" ? [
    { entry: "100-Hour Inspection", date: "Jan 15, 2026" },
  ] : [{ entry: "Propeller Overhaul Certificate", date: "Dec 5, 2025" }];

  const handleSendWOMessage = (woId: string) => {
    if (!askWOMessage.trim()) return;
    setSentWOMessages(prev => ({ ...prev, [woId]: [...(prev[woId] || []), askWOMessage.trim()] }));
    setAskWOMessage("");
    // keep askingWO set so composer stays visible
  };

  const openSquawks = squawks.filter((s) => s.status !== "Resolved");
  const filteredSquawks = squawks.filter((s) => squawkFilter === "All" || s.status === squawkFilter);
  const criticalReminders = reminders.filter((r) => r.status === "Critical" || r.status === "Overdue");
  const upcomingReminders = reminders.filter((r) => r.status === "Upcoming");
  const hasLiveAircraft = Boolean(aircraft);
  const hasCompletenessScore = !hasLiveAircraft;
  const summaryYear = ac.year > 0 ? String(ac.year) : "—";
  const documentSummaryValue = hasCompletenessScore ? `${ac.docCompleteness}%` : `${ac.docCount}`;
  const documentSummaryLabel = hasCompletenessScore ? "Doc Completeness" : "Documents";
  const documentSummaryColor = hasCompletenessScore
    ? ac.docCompleteness >= 80
      ? "text-emerald-600 bg-emerald-50"
      : "text-amber-600 bg-amber-50"
    : "text-blue-600 bg-blue-50";

  const toggleSquawkSelect = (id: string) => {
    setSelectedSquawks((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const statusChipColor =
    ac.status === "Airworthy"
      ? "bg-emerald-50 text-emerald-700"
      : ac.status === "Attention"
        ? "bg-amber-50 text-amber-700"
        : ac.status === "Tracked"
          ? "bg-slate-100 text-slate-700"
          : "bg-red-50 text-red-700";

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F7F8FA]">
      {/* Aircraft Header Bar */}
      <div className="bg-white border-b border-border px-6 py-4 shrink-0">
        <Link href="/aircraft" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors mb-3" style={{ fontWeight: 500 }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Fleet
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#0A1628] flex items-center justify-center shrink-0">
              <Plane className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-0.5">
                <span className="text-[20px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{ac.tail}</span>
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${statusChipColor}`} style={{ fontWeight: 600 }}>{ac.status}</span>
                {openSquawks.some(s => s.grounded) && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-red-100 text-red-700" style={{ fontWeight: 600 }}>⚠ Grounded Squawk</span>
                )}
                {liveTrackEnabled && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] bg-red-50 border border-red-200 text-red-600 px-2 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <div className="text-[13px] text-muted-foreground">{ac.model} &middot; {summaryYear} &middot; S/N {ac.serial} &middot; {ac.operationType}</div>
            </div>
          </div>

          {/* Stats pills */}
          <div className="hidden lg:flex items-center gap-6 bg-[#F7F8FA] rounded-xl px-5 py-3 border border-border">
            {[
              { label: "Hobbs", value: ac.hobbs.toFixed(1) },
              { label: "Tach", value: ac.tach.toFixed(1) },
              { label: "TTAF", value: `${ac.ttaf.toLocaleString()} hrs` },
              { label: "SMOH", value: `${ac.smoh.toLocaleString()} hrs` },
              { label: "Based At", value: ac.basedAt.split(" — ")[0] },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>{stat.label}</div>
                <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link href="/ask" className="inline-flex items-center gap-1.5 bg-white border border-border text-foreground px-3 py-2 rounded-lg text-[13px] hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
              <MessageSquare className="w-3.5 h-3.5" /> Ask
            </Link>
            <button
              type="button"
              onClick={() => router.push(uploadHref)}
              className="inline-flex items-center gap-1.5 bg-white border border-border text-foreground px-3 py-2 rounded-lg text-[13px] hover:bg-muted/30 transition-colors"
              style={{ fontWeight: 500 }}
            >
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(v => !v)}
                onBlur={() => setTimeout(() => setShowMoreMenu(false), 150)}
                className={`p-2 rounded-lg transition-colors ${showMoreMenu ? "bg-muted" : "hover:bg-muted"}`}
              >
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </button>
              <AnimatePresence>
                {showMoreMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.1 }}
                    className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-border rounded-xl shadow-lg overflow-hidden z-30"
                  >
                    {[
                      { icon: Edit3,       label: "Edit aircraft details" },
                      { icon: ExternalLink, label: "View FAA record"       },
                      { icon: Download,    label: "Export records"         },
                      { icon: Bell,        label: "Notification settings"  },
                    ].map(({ icon: Icon, label }) => (
                      <button
                        key={label}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setShowMoreMenu(false)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-foreground hover:bg-muted/40 transition-colors text-left"
                      >
                        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {label}
                      </button>
                    ))}
                    <div className="border-t border-border" />
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => setShowMoreMenu(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-500 hover:bg-red-50 transition-colors text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      Remove aircraft
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0.5 mt-4 -mb-4 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-2.5 text-[13px] rounded-t-lg whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? "text-primary bg-[#F7F8FA] border border-b-0 border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
              style={{ fontWeight: activeTab === tab ? 600 : 400 }}
            >
              {tab}
              {tab === "Squawks" && openSquawks.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[10px]" style={{ fontWeight: 700 }}>
                  {openSquawks.length}
                </span>
              )}
              {tab === "Reminders" && criticalReminders.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-700 text-[10px]" style={{ fontWeight: 700 }}>
                  {criticalReminders.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col flex-1 overflow-auto"
          >
            {/* ══════════════════════ OVERVIEW TAB ══════════════════════ */}
            {activeTab === "Overview" && (
              <div className="grid lg:grid-cols-3 gap-5 px-6 py-5">
                {/* Left 2/3 */}
                <div className="lg:col-span-2 space-y-5">
                  {/* Alert bar — critical reminders */}
                  {criticalReminders.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                          <AlarmClock className="w-4 h-4 text-orange-700" />
                        </div>
                        <div>
                          <div className="text-[13px] text-orange-900" style={{ fontWeight: 600 }}>
                            {criticalReminders.length} item{criticalReminders.length > 1 ? "s" : ""} require immediate attention
                          </div>
                          <div className="text-[12px] text-orange-700">{criticalReminders[0].title}{criticalReminders.length > 1 ? ` + ${criticalReminders.length - 1} more` : ""}</div>
                        </div>
                      </div>
                      <button onClick={() => setActiveTab("Reminders")} className="text-[12px] text-orange-700 hover:text-orange-900 flex items-center gap-1 shrink-0" style={{ fontWeight: 600 }}>
                        Review <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Health summary cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Open Squawks", value: openSquawks.length, icon: AlertTriangle, color: openSquawks.length > 0 ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-emerald-50", action: "Squawks" },
                      { label: "Active Reminders", value: upcomingReminders.length + criticalReminders.length, icon: Bell, color: criticalReminders.length > 0 ? "text-orange-600 bg-orange-50" : "text-blue-600 bg-blue-50", action: "Reminders" },
                      { label: documentSummaryLabel, value: documentSummaryValue, icon: FileText, color: documentSummaryColor, action: "Documents" },
                      { label: "Assignments", value: assignments.length, icon: Users, color: "text-primary bg-primary/8", action: "Assignments" },
                    ].map((card) => (
                      <button key={card.label} onClick={() => setActiveTab(card.action)} className="bg-white rounded-xl border border-border p-4 text-left hover:shadow-sm hover:border-primary/20 transition-all group">
                        <div className={`w-8 h-8 rounded-lg ${card.color} flex items-center justify-center mb-3`}>
                          <card.icon className="w-4 h-4" />
                        </div>
                        <div className="text-[20px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{card.value}</div>
                        <div className="text-[11px] text-muted-foreground" style={{ fontWeight: 500 }}>{card.label}</div>
                      </button>
                    ))}
                  </div>

                  {/* Open Squawks preview */}
                  {openSquawks.length > 0 && (
                    <div className="bg-white rounded-xl border border-border">
                      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Open Squawks</h3>
                        <button onClick={() => setActiveTab("Squawks")} className="text-[12px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
                          View all <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="divide-y divide-border">
                        {openSquawks.slice(0, 3).map((sq) => (
                          <div key={sq.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${sq.severity === "High" || sq.severity === "Critical" ? "bg-orange-500" : sq.severity === "Medium" ? "bg-amber-400" : "bg-slate-300"}`} />
                              <div className="min-w-0">
                                <div className="text-[13px] text-foreground truncate" style={{ fontWeight: 500 }}>{sq.title}</div>
                                <div className="text-[11px] text-muted-foreground">{sq.category} &middot; {sq.date}</div>
                              </div>
                            </div>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${severityColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upcoming reminders */}
                  <div className="bg-white rounded-xl border border-border">
                    <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                      <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Upcoming Reminders</h3>
                      <button onClick={() => setActiveTab("Reminders")} className="text-[12px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
                        View all <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="divide-y divide-border">
                      {reminders.slice(0, 4).map((rem) => (
                        <div key={rem.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot(rem.status)}`} />
                            <div className="min-w-0">
                              <div className="text-[13px] text-foreground truncate" style={{ fontWeight: 500 }}>{rem.title}</div>
                              <div className="text-[11px] text-muted-foreground">{rem.category}</div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            {rem.type === "Date" && <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{rem.daysRemaining}d remaining</div>}
                            {rem.type === "Hobbs" && <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{rem.hobbsRemaining} hrs</div>}
                            {rem.type === "Tach" && <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{rem.tachRemaining} tach hrs</div>}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${reminderStatusColor(rem.status)}`} style={{ fontWeight: 600 }}>{rem.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent activity */}
                  <div className="bg-white rounded-xl border border-border">
                    <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                      <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Recent Activity</h3>
                      <button onClick={() => setActiveTab("Activity")} className="text-[12px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
                        View all <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="divide-y divide-border">
                      {activity.slice(0, 4).map((item) => {
                        const Icon = activityIcon(item.type);
                        return (
                          <div key={item.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-muted/20 transition-colors">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${activityColor(item.type)}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>{item.title}</div>
                              <div className="text-[12px] text-muted-foreground">{item.detail}</div>
                            </div>
                            <div className="text-[11px] text-muted-foreground shrink-0">{item.time}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right sidebar 1/3 */}
                <div className="space-y-5">
                  {/* Live Track Widget — shown when FlightAware or ADS-B Exchange is connected */}
                  {liveTrackEnabled && <LiveTrackWidget tail={tail} />}

                  {/* Aircraft Profile */}
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="text-[13px] text-foreground mb-4 flex items-center gap-2" style={{ fontWeight: 600 }}>
                      <Plane className="w-3.5 h-3.5 text-muted-foreground" /> Aircraft Profile
                    </h3>
                    <div className="space-y-2.5">
                      {[
                        ["Registration", ac.tail],
                        ["Make / Model", ac.model],
                        ["Year", summaryYear],
                        ["Serial", ac.serial],
                        ["Category", ac.category],
                        ["Engine", ac.engine],
                        ["Prop", ac.prop],
                        ["Based At", ac.basedAt],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2 text-[12px]">
                          <span className="text-muted-foreground shrink-0">{k}</span>
                          <span className="text-foreground text-right" style={{ fontWeight: 500 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Engine / Times */}
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="text-[13px] text-foreground mb-4 flex items-center gap-2" style={{ fontWeight: 600 }}>
                      <Gauge className="w-3.5 h-3.5 text-muted-foreground" /> Times
                    </h3>
                    <div className="space-y-3">
                      {[
                        { label: "Hobbs", value: ac.hobbs.toFixed(1), unit: "hrs" },
                        { label: "Tach", value: ac.tach.toFixed(1), unit: "hrs" },
                        { label: "TTAF", value: ac.ttaf.toLocaleString(), unit: "hrs" },
                        { label: "SMOH", value: ac.smoh.toLocaleString(), unit: "hrs" },
                        { label: "SPOH", value: ac.spoh.toLocaleString(), unit: "hrs" },
                      ].map((t) => (
                        <div key={t.label} className="flex items-center justify-between">
                          <span className="text-[12px] text-muted-foreground">{t.label}</span>
                          <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{t.value} <span className="text-muted-foreground text-[11px]" style={{ fontWeight: 400 }}>{t.unit}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Owner / Operator */}
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="text-[13px] text-foreground mb-4 flex items-center gap-2" style={{ fontWeight: 600 }}>
                      <User className="w-3.5 h-3.5 text-muted-foreground" /> Owner / Operator
                    </h3>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{ac.owner}</div>
                        {ac.ownerCompany && <div className="text-[11px] text-muted-foreground">{ac.ownerCompany}</div>}
                      </div>
                    </div>
                    <div className="space-y-1.5 text-[12px]">
                      <div className="text-muted-foreground">{ac.ownerEmail}</div>
                      <div className="text-muted-foreground">{ac.ownerPhone}</div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="text-[13px] text-foreground mb-3" style={{ fontWeight: 600 }}>Quick Actions</h3>
                    <div className="space-y-2">
                      {[
                        { label: "Add Squawk", icon: AlertTriangle, action: () => { setActiveTab("Squawks"); setShowAddSquawk(true); } },
                        { label: "Request Maintenance", icon: Wrench, action: () => setActiveTab("Maintenance") },
                        { label: "Upload Document", icon: Upload, href: uploadHref },
                        { label: "View Intelligence", icon: BarChart3, action: () => setActiveTab("Intelligence") },
                      ].map((qa) => (
                        qa.href ? (
                          <Link
                            key={qa.label}
                            href={qa.href}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-foreground hover:bg-muted/50 transition-colors text-left"
                            style={{ fontWeight: 500 }}
                          >
                            <qa.icon className="w-3.5 h-3.5 text-muted-foreground" />
                            {qa.label}
                          </Link>
                        ) : (
                          <button key={qa.label} onClick={qa.action} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-foreground hover:bg-muted/50 transition-colors text-left" style={{ fontWeight: 500 }}>
                            <qa.icon className="w-3.5 h-3.5 text-muted-foreground" />
                            {qa.label}
                          </button>
                        )
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════ SQUAWKS TAB ══════════════════════ */}
            {activeTab === "Squawks" && (
              <div className="space-y-4 px-6 py-5">
                {/* Command bar */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {(["All", "Open", "In Progress", "Resolved"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setSquawkFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${squawkFilter === f ? "bg-primary text-white" : "bg-white border border-border text-muted-foreground hover:bg-muted/30"}`}
                        style={{ fontWeight: squawkFilter === f ? 600 : 400 }}
                      >
                        {f}
                        {f === "Open" && openSquawks.filter(s => s.status === "Open").length > 0 && (
                          <span className="ml-1 text-[10px] opacity-80">({openSquawks.filter(s => s.status === "Open").length})</span>
                        )}
                      </button>
                    ))}
                    {loadingSquawks && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Syncing
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedSquawks.length > 0 && (
                      <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
                        <Link href="/maintenance" className="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                          <Wrench className="w-3.5 h-3.5" /> Request Maintenance ({selectedSquawks.length})
                        </Link>
                        <button onClick={() => setSelectedSquawks([])} className="p-2 hover:bg-muted rounded-lg transition-colors">
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </motion.div>
                    )}
                    <button
                      onClick={() => setShowAddSquawk(true)}
                      className="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      <Plus className="w-4 h-4" /> Add Squawk
                    </button>
                  </div>
                </div>

                {/* Add squawk form */}
                <AnimatePresence>
                  {showAddSquawk && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="bg-white rounded-xl border border-primary/30 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" />
                            <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Add Squawk — AI Assisted</span>
                          </div>
                          <button onClick={() => setShowAddSquawk(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                            <X className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                        <div className="bg-muted/30 rounded-xl p-4 mb-4">
                          <textarea
                            className="w-full bg-transparent text-[13px] outline-none resize-none text-foreground placeholder:text-muted-foreground/60"
                            rows={3}
                            placeholder='Describe the squawk in plain English, e.g. "Left brake feels soft on landing, heard slight grinding sound during taxi"'
                            value={squawkText}
                            onChange={(event) => {
                              setSquawkText(event.target.value);
                              setSquawkStructure(null);
                              setSquawkNotice(null);
                              setSquawkError(null);
                            }}
                          />
                        </div>
                        {(squawkNotice || squawkError || squawkStructure) && (
                          <div className="space-y-2 mb-4">
                            {squawkStructure && (
                              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                                <div className="text-[12px] text-foreground flex flex-wrap items-center gap-2" style={{ fontWeight: 600 }}>
                                  <span>{squawkStructure.title}</span>
                                  <span className={`px-2 py-0.5 rounded-full ${severityColor(squawkStructure.severity)}`}>{squawkStructure.severity}</span>
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{squawkStructure.category}</span>
                                  {squawkStructure.grounded && (
                                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">Grounded</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-1">
                                  {squawkStructure.description}
                                </div>
                              </div>
                            )}
                            {squawkNotice && (
                              <div className="text-[12px] text-primary bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
                                {squawkNotice}
                              </div>
                            )}
                            {squawkError && (
                              <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                {squawkError}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => squawkPhotoInputRef.current?.click()}
                              disabled={squawkExtractingPhoto || savingSquawk}
                              className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                              style={{ fontWeight: 500 }}
                            >
                              <Camera className="w-3.5 h-3.5" />
                              {squawkExtractingPhoto ? "Analyzing..." : "Photo"}
                            </button>
                            <input
                              ref={squawkPhotoInputRef}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={handleSquawkPhotoSelect}
                            />
                            <button
                              type="button"
                              onClick={squawkRecording ? stopSquawkRecording : startSquawkRecording}
                              disabled={squawkTranscribing || savingSquawk}
                              className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                              style={{ fontWeight: 500 }}
                            >
                              <Mic className="w-3.5 h-3.5" />
                              {squawkTranscribing ? "Transcribing..." : squawkRecording ? "Stop Dictation" : "Dictate"}
                            </button>
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={squawkGrounded}
                                  onChange={(event) => setSquawkGrounded(event.target.checked)}
                                />
                                <div className={`w-9 h-5 rounded-full transition-colors ${squawkGrounded ? "bg-red-500/70" : "bg-muted"}`} />
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${squawkGrounded ? "left-[18px]" : "left-0.5"}`} />
                              </div>
                              <span className="text-[12px] text-muted-foreground" style={{ fontWeight: 500 }}>Aircraft Grounded</span>
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setShowAddSquawk(false);
                                resetSquawkComposer();
                              }}
                              className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors"
                              style={{ fontWeight: 500 }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void structureSquawk(squawkText, squawkGrounded)}
                              disabled={!squawkText.trim() || squawkStructuring || savingSquawk}
                              className="inline-flex items-center gap-1.5 border border-primary/30 text-primary px-4 py-1.5 rounded-lg text-[12px] hover:bg-primary/5 transition-colors disabled:opacity-60"
                              style={{ fontWeight: 500 }}
                            >
                              <Sparkles className={`w-3.5 h-3.5 ${squawkStructuring ? "animate-pulse" : ""}`} /> AI Structure
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveAircraftSquawk()}
                              disabled={!squawkText.trim() || savingSquawk}
                              className="inline-flex items-center gap-1.5 bg-primary text-white px-4 py-1.5 rounded-lg text-[12px] hover:bg-primary/90 transition-colors disabled:opacity-60"
                              style={{ fontWeight: 500 }}
                            >
                              {savingSquawk ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                              Save Squawk
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Squawk cards */}
                <div className="space-y-3">
                  {filteredSquawks.length === 0 ? (
                    <div className="bg-white rounded-xl border border-border p-10 text-center">
                      <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>No squawks</div>
                      <div className="text-[13px] text-muted-foreground">All clear in this category.</div>
                    </div>
                  ) : filteredSquawks.map((sq) => (
                    <div key={sq.id} className={`bg-white rounded-xl border transition-all ${selectedSquawks.includes(sq.id) ? "border-primary/40 shadow-sm shadow-primary/10" : "border-border"}`}>
                      <div className="p-5">
                        <div className="flex items-start gap-3">
                          <button onClick={() => toggleSquawkSelect(sq.id)} className="mt-0.5 shrink-0">
                            {selectedSquawks.includes(sq.id)
                              ? <CheckSquare className="w-4 h-4 text-primary" />
                              : <Square className="w-4 h-4 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />
                            }
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{sq.title}</span>
                                  {sq.grounded && (
                                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 700 }}>GROUNDED</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${severityColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                                  <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>{sq.category}</span>
                                  {sq.status === "In Progress" && <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>In Progress</span>}
                                  {sq.linkedWO && <span className="text-[11px] text-primary flex items-center gap-0.5" style={{ fontWeight: 500 }}><Hash className="w-3 h-3" />{sq.linkedWO}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                                  <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                              </div>
                            </div>
                            <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">{sq.description}</p>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                <span>{sq.reportedBy} &middot; {sq.reportedByRole}</span>
                                <span>{sq.date}</span>
                                {sq.photos && <span className="flex items-center gap-0.5"><Camera className="w-3 h-3" /> {sq.photos}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <button className="text-[12px] text-muted-foreground hover:text-foreground transition-colors" style={{ fontWeight: 500 }}>Resolve</button>
                                <Link href="/maintenance" className="text-[12px] text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5" style={{ fontWeight: 500 }}>
                                  <Wrench className="w-3 h-3" /> Request Maintenance
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══════════════════════ REMINDERS TAB ══════════════════════ */}
            {activeTab === "Reminders" && (
              <div className="space-y-4 px-6 py-5">
                {/* Summary pills */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Overdue / Critical", count: criticalReminders.length, color: criticalReminders.length > 0 ? "border-orange-200 bg-orange-50" : "border-border bg-white", textColor: criticalReminders.length > 0 ? "text-orange-700" : "text-muted-foreground" },
                    { label: "Upcoming (30 days)", count: reminders.filter(r => r.status === "Upcoming").length, color: "border-amber-200 bg-amber-50", textColor: "text-amber-700" },
                    { label: "OK", count: reminders.filter(r => r.status === "OK").length, color: "border-emerald-200 bg-emerald-50", textColor: "text-emerald-700" },
                    { label: "Total Reminders", count: reminders.length, color: "border-border bg-white", textColor: "text-foreground" },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-xl border ${item.color} p-4`}>
                      <div className={`text-[22px] tracking-tight ${item.textColor}`} style={{ fontWeight: 700 }}>{item.count}</div>
                      <div className="text-[11px] text-muted-foreground" style={{ fontWeight: 500 }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                {/* Filter + add */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {["All", "Date", "Hobbs", "Tach"].map((f) => (
                      <button
                        key={f}
                        onClick={() => setReminderFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${reminderFilter === f ? "bg-primary text-white" : "bg-white border border-border text-muted-foreground hover:bg-muted/30"}`}
                        style={{ fontWeight: reminderFilter === f ? 600 : 400 }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="inline-flex items-center gap-1.5 bg-white border border-border text-muted-foreground px-3 py-2 rounded-lg text-[12px] hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <Sparkles className="w-3.5 h-3.5 text-primary" /> Describe in plain English
                    </button>
                    <button className="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                      <Plus className="w-4 h-4" /> Add Reminder
                    </button>
                  </div>
                </div>

                {/* Reminder list */}
                <div className="space-y-2">
                  {reminders
                    .filter(r => reminderFilter === "All" || r.type === reminderFilter)
                    .sort((a, b) => {
                      const order = { Overdue: 0, Critical: 1, Upcoming: 2, OK: 3 };
                      return order[a.status] - order[b.status];
                    })
                    .map((rem) => (
                      <div key={rem.id} className={`bg-white rounded-xl border p-5 ${rem.status === "Critical" || rem.status === "Overdue" ? "border-orange-200" : "border-border"}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${rem.type === "Date" ? "bg-blue-50" : rem.type === "Hobbs" ? "bg-violet-50" : "bg-emerald-50"}`}>
                              {rem.type === "Date" ? <Calendar className={`w-4 h-4 ${rem.status === "Critical" ? "text-orange-600" : "text-blue-600"}`} /> : rem.type === "Hobbs" ? <Gauge className="w-4 h-4 text-violet-600" /> : <Activity className="w-4 h-4 text-emerald-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{rem.title}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${reminderStatusColor(rem.status)}`} style={{ fontWeight: 600 }}>{rem.status}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mb-2">{rem.category} &middot; {rem.type}-based</div>
                              {rem.type === "Date" && (
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[200px]">
                                    <div
                                      className={`h-full rounded-full ${rem.status === "Critical" ? "bg-orange-500" : rem.status === "Upcoming" ? "bg-amber-400" : "bg-emerald-500"}`}
                                      style={{ width: `${Math.max(5, Math.min(100, 100 - (rem.daysRemaining! / 365) * 100))}%` }}
                                    />
                                  </div>
                                  <span className="text-[12px] text-muted-foreground">{rem.daysRemaining} days remaining &middot; Due {rem.dueDate}</span>
                                </div>
                              )}
                              {rem.type === "Hobbs" && (
                                <span className="text-[12px] text-muted-foreground">{rem.hobbsRemaining} Hobbs hrs remaining &middot; Due at {rem.dueHobbs} Hobbs</span>
                              )}
                              {rem.type === "Tach" && (
                                <span className="text-[12px] text-muted-foreground">{rem.tachRemaining} Tach hrs remaining &middot; Due at {rem.dueTach} Tach</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {rem.canRequestMaintenance && (
                              <Link href="/maintenance" className="text-[12px] text-primary hover:text-primary/80 flex items-center gap-1" style={{ fontWeight: 500 }}>
                                <Wrench className="w-3 h-3" /> Request
                              </Link>
                            )}
                            <button className="text-[12px] text-muted-foreground hover:text-foreground transition-colors" style={{ fontWeight: 500 }}>Snooze</button>
                            <button className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                              <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ══════════════════════ MAINTENANCE TAB ══════════════════════ */}
            {activeTab === "Maintenance" && (
              <div className="flex flex-col flex-1 px-6 py-5">

                {/* ── Single panel: header + mechanic strip + WO split ── */}
                <div className="flex flex-col flex-1 rounded-2xl border border-border overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.05)]">

                  {/* ── Combined title + participant strip ── */}
                  <div className="px-5 py-3 border-b border-slate-100 bg-white flex items-center gap-3.5 shrink-0">

                    {/* Title block */}
                    <div className="shrink-0 pr-3.5 border-r border-slate-100">
                      <div className="text-[13px] text-foreground leading-tight" style={{ fontWeight: 600 }}>Maintenance</div>
                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{ac.tail}</div>
                    </div>

                    <span className="text-[9px] text-[#2563EB] uppercase tracking-widest shrink-0" style={{ fontWeight: 700 }}>Mechanic</span>
                    <div className="flex items-center gap-3 flex-1 overflow-x-auto no-scrollbar">
                      {mechanics.length === 0 && (
                        <span className="text-[11px] text-slate-400 italic">No mechanics assigned yet</span>
                      )}
                      {mechanics.map(m => {
                        const initials = m.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
                        const colors = ["bg-blue-600","bg-violet-600","bg-emerald-600","bg-amber-500","bg-slate-500"];
                        const c = colors[Math.abs(m.name.charCodeAt(0) + (m.name.charCodeAt(1)||0)) % colors.length];
                        return (
                          <button key={m.id} onClick={() => setExpandMechanicId(expandMechanicId === m.id ? null : m.id)}
                            className="flex flex-col items-center gap-1 shrink-0 group">
                            <div className="relative">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[10px] ${c} transition-all ${!m.enabled ? "opacity-40 grayscale" : ""} ${expandMechanicId === m.id ? "ring-2 ring-offset-1 ring-[#2563EB]/40" : "group-hover:ring-2 group-hover:ring-slate-200"}`} style={{ fontWeight: 700 }}>{initials}</div>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${m.status === "Active" && m.enabled ? "bg-emerald-500" : m.status === "Invited" ? "bg-amber-400" : "bg-slate-300"}`} />
                            </div>
                            <span className="text-[9px] text-slate-500 truncate max-w-[44px] text-center leading-tight">{m.name.split(" ")[0]}</span>
                          </button>
                        );
                      })}
                      <button onClick={() => setShowInviteMechanic(true)} className="flex flex-col items-center gap-1 shrink-0 group">
                        <div className="w-9 h-9 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center group-hover:border-[#2563EB]/40 group-hover:bg-blue-50/50 transition-all">
                          <Plus className="w-4 h-4 text-slate-300 group-hover:text-[#2563EB] transition-colors" />
                        </div>
                        <span className="text-[9px] text-slate-400 group-hover:text-[#2563EB] transition-colors">Invite</span>
                      </button>
                    </div>
                    {woListItems.some(i => i.action) && (
                      <details className="relative shrink-0" onClick={e => e.stopPropagation()}>
                        <summary className="flex items-center gap-1.5 text-[10px] text-red-500 px-2 py-1 rounded-full bg-red-50 hover:bg-red-100 border border-red-200/60 hover:border-red-300 active:scale-95 transition-all cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden" style={{ fontWeight: 600 }}>
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                          Action needed
                          <span className="text-red-400 text-[9px]">↗</span>
                        </summary>
                        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[260px] bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                          <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
                            <span className="relative flex shrink-0">
                              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute opacity-60" />
                              <span className="w-2 h-2 rounded-full bg-red-500 relative" />
                            </span>
                            <span className="text-[11px] text-red-700" style={{ fontWeight: 700 }}>
                              {woListItems.filter(i => i.action).length} item{woListItems.filter(i => i.action).length !== 1 ? "s" : ""} need your attention
                            </span>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {woListItems.filter(i => i.action).map(item => (
                              <button
                                key={item.id}
                                onClick={() => setSelectedWOItem(item.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left group/item"
                              >
                                <div className="w-7 h-7 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[12px] text-foreground truncate" style={{ fontWeight: 700 }}>{item.id}</div>
                                  <div className="text-[10px] text-red-500 truncate" style={{ fontWeight: 600 }}>{item.status}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-[12px] text-slate-800" style={{ fontWeight: 700 }}>{item.amount}</div>
                                  <div className="text-[10px] text-[#2563EB] group-hover/item:underline" style={{ fontWeight: 600 }}>Open →</div>
                                </div>
                              </button>
                            ))}
                          </div>
                          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
                            <p className="text-[10px] text-slate-400 text-center">Click an item to open its detail panel</p>
                          </div>
                        </div>
                      </details>
                    )}
                  </div>

                  {/* Tap-to-manage inline mechanic card */}
                  <AnimatePresence>
                    {expandMechanicId && (() => {
                      const m = mechanics.find(mx => mx.id === expandMechanicId);
                      if (!m) return null;
                      return (
                        <motion.div key={expandMechanicId}
                          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.16, ease: "easeInOut" }} className="overflow-hidden border-b border-slate-100 shrink-0">
                          <div className="px-5 py-3 bg-slate-50/60 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{m.name}</div>
                              <div className="text-[11px] text-slate-500">{m.email}{m.phone ? ` · ${m.phone}` : ""}</div>
                              {m.linkedTeamMemberId && <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full mt-0.5" style={{ fontWeight: 600 }}><Link2 className="w-2.5 h-2.5" /> In Ecosystem</span>}
                            </div>
                            <button onClick={() => toggleAircraftAssignment(m.id)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-[11px] shrink-0" style={{ fontWeight: 600, borderColor: m.enabled ? "rgb(16 185 129/0.3)" : "rgb(203 213 225)", background: m.enabled ? "rgb(240 253 244)" : "rgb(248 250 252)", color: m.enabled ? "rgb(4 120 87)" : "rgb(100 116 139)" }}>
                              {m.enabled ? <><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1" />Active</> : <><span className="w-2 h-2 rounded-full bg-slate-300 inline-block mr-1" />Off</>}
                            </button>
                            <button onClick={() => { removeAircraftAssignment(m.id); setExpandMechanicId(null); }} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors group shrink-0"><Trash2 className="w-3.5 h-3.5 text-slate-300 group-hover:text-red-500 transition-colors" /></button>
                            <button onClick={() => setExpandMechanicId(null)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors shrink-0"><X className="w-3.5 h-3.5 text-slate-400" /></button>
                          </div>
                        </motion.div>
                      );
                    })()}
                  </AnimatePresence>

                  {/* ── Squawk quick-submit strip ── */}
                  {openSquawks.length > 0 && (
                    <div className="px-5 py-2.5 border-b border-slate-100 bg-red-50/40 flex items-center gap-2.5 shrink-0">
                      <span className="relative flex shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping absolute opacity-60" />
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 relative" />
                      </span>
                      <span className="text-[11px] text-red-700 flex-1" style={{ fontWeight: 600 }}>
                        {openSquawks.length} open squawk{openSquawks.length > 1 ? "s" : ""} ready for maintenance
                      </span>
                      <button onClick={() => setActiveTab("Squawks")} className="text-[11px] text-[#2563EB] hover:underline shrink-0 transition-colors" style={{ fontWeight: 600 }}>
                        View →
                      </button>
                    </div>
                  )}

                  {/* ── Left / Right WO split ── */}
                  <div className="flex flex-1 overflow-hidden">

                    {/* Left sidebar — WO/EST/INV list */}
                    <div className="w-[220px] shrink-0 border-r border-slate-100 flex flex-col">
                      <div className="px-4 py-3 border-b border-slate-100">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 700 }}>Open Items</span>
                      </div>
                      <div className="flex-1 overflow-auto divide-y divide-slate-50/80">
                        {woListItems.map(item => (
                          <button key={item.id} onClick={() => setSelectedWOItem(item.id)}
                            className={`w-full px-3.5 py-4 text-left transition-all ${activeWOItem === item.id ? "bg-blue-50/60 border-l-[3px] border-l-[#2563EB]" : "hover:bg-slate-50/60 border-l-[3px] border-l-transparent"}`}>
                            <div className="flex items-start gap-2.5">
                              <div className="relative mt-1.5 shrink-0">
                                <span className={`w-2 h-2 rounded-full block ${item.action ? "bg-red-500" : item.dot}`} />
                                {item.action && <span className="absolute top-0 left-0 w-2 h-2 rounded-full bg-red-400 animate-ping opacity-60" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-1 mb-0.5">
                                  <span className="text-[11px] text-foreground truncate" style={{ fontWeight: 700 }}>{item.id}</span>
                                  <span className="text-[11px] text-slate-700 shrink-0" style={{ fontWeight: 700 }}>{item.amount}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">{item.title}</div>
                                <div className={`text-[10px] mt-1 ${item.action ? "text-red-500" : "text-slate-400"}`} style={{ fontWeight: item.action ? 600 : 400 }}>{item.status}</div>
                                {(item as any).progress !== undefined && (
                                  <div className="mt-2 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${item.dot}`} style={{ width: `${(item as any).progress}%` }} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      {/* Filed records */}
                      {recordsData.length > 0 && (
                        <div className="border-t border-slate-100 px-3.5 py-3 bg-slate-50/50">
                          <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-2" style={{ fontWeight: 700 }}>Filed</div>
                          {recordsData.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 py-1.5">
                              <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-[10px] text-slate-600 truncate" style={{ fontWeight: 500 }}>{r.entry}</div>
                                <div className="text-[9px] text-slate-400">{r.date}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right panel — detail / thread */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                      {!activeWOItem ? (
                        <div className="flex-1 flex items-center justify-center">
                          <div className="text-center"><Wrench className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" /><div className="text-[13px] text-muted-foreground">Select an item</div></div>
                        </div>
                      ) : (
                        <>
                          {/* ── WO-2026-0042 thread ── */}
                          {activeWOItem === "WO-2026-0042" && (() => {
                            const woId = "WO-2026-0042";
                            const isApproved = approvedItems.includes(woId);
                            const isDenied = deniedItems.includes(woId);
                            const msgs = sentWOMessages[woId] || [];
                            return (
                              <div className="flex flex-col h-full">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 shrink-0 bg-white">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{woId}</span>
                                      <span className={`flex items-center gap-1.5 text-[10px] ${isApproved ? "text-emerald-700" : isDenied ? "text-slate-500" : "text-amber-700"}`} style={{ fontWeight: 600 }}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${isApproved ? "bg-emerald-400" : isDenied ? "bg-slate-400" : "bg-amber-400 animate-pulse"}`} />
                                        {isApproved ? "Approved" : isDenied ? "Declined" : "Awaiting Your Approval"}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">Nav light repair · Mike Torres</div>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0 text-right">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-400 rounded-full" style={{ width: "70%" }} /></div>
                                      <span className="text-[10px] text-slate-500">70%</span>
                                    </div>
                                    <span className="text-[13px] text-slate-800" style={{ fontWeight: 700 }}>$460</span>
                                  </div>
                                </div>
                                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#F2F2F7]">
                                  <div className="flex justify-center"><div className="text-[10px] text-slate-500 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">WO-2026-0042 opened · 9 days ago</div></div>
                                  {/* Mike diagnostic */}
                                  <div className="flex items-end gap-2">
                                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>MT</div>
                                    <div className="flex flex-col items-start max-w-[80%]">
                                      <div className="flex items-center gap-1.5 mb-1 px-1"><span className="text-[11px] text-slate-500" style={{ fontWeight: 600 }}>Mike Torres</span><span className="text-[10px] text-slate-400">8d ago</span></div>
                                      <div className="relative cursor-default select-none" {...lph("wo42-m1")}>
                                        {reactionPicker("wo42-m1", "left")}
                                        <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed bg-white text-slate-800 border border-slate-200/70 shadow-sm">Traced intermittent nav light to right connector at wing root. Corrosion visible under insulation — wire shows abrasion at grommet edge. Parts are on hand.</div>
                                        {messageReactions["wo42-m1"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 pl-1">{messageReactions["wo42-m1"]}</motion.div>}
                                      </div>
                                    </div>
                                  </div>
                                  {/* Status pill */}
                                  <div className="flex justify-center"><div className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />In Progress<span className="text-slate-300 mx-0.5">→</span><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Awaiting Approval · 7d ago</div></div>
                                  {/* Mike approval request */}
                                  <div className="flex items-end gap-2">
                                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>MT</div>
                                    <div className="flex flex-col items-start max-w-[85%]">
                                      <div className="flex items-center gap-1.5 mb-1 px-1"><span className="text-[11px] text-slate-500" style={{ fontWeight: 600 }}>Mike Torres</span><span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Approval Request</span></div>
                                      <div className="relative cursor-default select-none" {...lph("wo42-m2")}>
                                        {reactionPicker("wo42-m2", "left")}
                                        <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed bg-white text-slate-800 border border-amber-200/50 shadow-sm">
                                          Full wire re-route needed at grommet — +1.5 hrs, +$187.50. Parts on hand. No additional parts required.
                                          {!isApproved && !isDenied && (
                                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                                              <button onClick={() => setApprovedItems(p => [...p, woId])} className="flex items-center gap-1.5 bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-[12px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 600 }}><CheckCircle className="w-3.5 h-3.5" /> Approve +$187.50</button>
                                              <button onClick={() => setDeniedItems(p => [...p, woId])} className="flex items-center gap-1.5 border border-slate-200 text-slate-600 px-3.5 py-2 rounded-xl text-[12px] hover:bg-slate-50 transition-colors" style={{ fontWeight: 500 }}><X className="w-3.5 h-3.5" /> Decline</button>
                                            </div>
                                          )}
                                          {isApproved && <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-emerald-700 flex items-center gap-1.5" style={{ fontWeight: 500 }}><CheckCircle className="w-3.5 h-3.5" /> Approved — mechanic notified</div>}
                                          {isDenied && <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500" style={{ fontWeight: 500 }}>Declined · mechanic notified</div>}
                                        </div>
                                        {messageReactions["wo42-m2"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 pl-1">{messageReactions["wo42-m2"]}</motion.div>}
                                      </div>
                                      <span className="text-[10px] text-slate-400 mt-1 px-1">7 days ago</span>
                                    </div>
                                  </div>
                                  {/* Owner approved bubble */}
                                  {isApproved && (<motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 flex-row-reverse">
                                    <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0 text-white text-[9px]" style={{ fontWeight: 700 }}>You</div>
                                    <div className="flex flex-col items-end max-w-[70%]">
                                      <div className="relative cursor-default select-none" {...lph("wo42-approve")}>
                                        {reactionPicker("wo42-approve", "right")}
                                        <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">Approved. Go ahead with the full repair. 👍</div>
                                        {messageReactions["wo42-approve"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 text-right pr-1">{messageReactions["wo42-approve"]}</motion.div>}
                                      </div>
                                      <span className="text-[10px] text-slate-400 mt-1 px-1">just now</span>
                                    </div>
                                  </motion.div>)}
                                  {isDenied && (<motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 flex-row-reverse">
                                    <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0 text-white text-[9px]" style={{ fontWeight: 700 }}>You</div>
                                    <div className="flex flex-col items-end max-w-[70%]">
                                      <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">Declined for now. Let's discuss scope first.</div>
                                      <span className="text-[10px] text-slate-400 mt-1 px-1">just now</span>
                                    </div>
                                  </motion.div>)}
                                  {msgs.map((m, i) => { const mid = `${woId}-sent-${i}`; return (
                                    <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 flex-row-reverse">
                                      <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0 text-white text-[9px]" style={{ fontWeight: 700 }}>You</div>
                                      <div className="flex flex-col items-end max-w-[75%]">
                                        <div className="relative cursor-default select-none" {...lph(mid)}>
                                          {reactionPicker(mid, "right")}
                                          <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">{m}</div>
                                          {messageReactions[mid] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 text-right pr-1">{messageReactions[mid]}</motion.div>}
                                        </div>
                                        <span className="text-[10px] text-slate-400 mt-1 px-1">just now</span>
                                      </div>
                                    </motion.div>
                                  ); })}
                                </div>
                                <div className="px-3 py-2.5 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
                                  <button className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"><Camera className="w-5 h-5" /></button>
                                  <div className="flex-1 bg-[#F2F2F7] rounded-2xl px-3.5 py-2"><input value={askingWO === woId ? askWOMessage : ""} onChange={e => { setAskingWO(woId); setAskWOMessage(e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendWOMessage(woId); } }} placeholder="Message Mike Torres…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400" /></div>
                                  <AnimatePresence mode="wait">
                                    {(askingWO === woId && askWOMessage.trim()) ? (
                                      <motion.button key="send" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} onClick={() => handleSendWOMessage(woId)} className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center hover:bg-[#2563EB]/90 transition-colors shrink-0"><Send className="w-3.5 h-3.5 text-white" /></motion.button>
                                    ) : (
                                      <motion.button key="mic" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"><Mic className="w-3.5 h-3.5 text-slate-400" /></motion.button>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>
                            );
                          })()}

                          {/* ── INV-2026-0031 payment panel ── */}
                          {activeWOItem === "INV-2026-0031" && (
                            <div className="flex flex-col h-full">
                              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 shrink-0 bg-white">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2"><span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>INV-2026-0031</span><span className="flex items-center gap-1.5 text-[10px] text-red-600" style={{ fontWeight: 600 }}><span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />Payment Due</span></div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">Nav light repair · Due Apr 15, 2026</div>
                                </div>
                                <span className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>$494.50</span>
                              </div>
                              <div className="flex-1 overflow-y-auto p-5">
                                <div className="space-y-1.5 text-[12px] mb-5 pb-5 border-b border-border">
                                  {[{ l: "Labor (3.5 hrs @ $125)", v: "$437.50" }, { l: "Parts (MS connector)", v: "$22.50" }, { l: "Tax (7.5%)", v: "$34.50" }].map(r => (
                                    <div key={r.l} className="flex justify-between"><span className="text-muted-foreground">{r.l}</span><span style={{ fontWeight: 500 }}>{r.v}</span></div>
                                  ))}
                                  <div className="flex justify-between pt-2 border-t border-border"><span className="text-foreground" style={{ fontWeight: 600 }}>Total</span><span className="text-foreground" style={{ fontWeight: 700 }}>$494.50</span></div>
                                </div>
                                <button className="w-full flex items-center justify-center gap-2 bg-[#635BFF] text-white py-3.5 rounded-xl text-[14px] hover:bg-[#5851E5] transition-colors" style={{ fontWeight: 600 }}><Receipt className="w-4 h-4" /> Pay $494.50 via Stripe</button>
                                <p className="text-[11px] text-center text-muted-foreground mt-2">Secure payment powered by Stripe. Receipt emailed on completion.</p>
                              </div>
                            </div>
                          )}

                          {/* ── WO-2026-0047 thread (N67890) ── */}
                          {activeWOItem === "WO-2026-0047" && (() => {
                            const woId = "WO-2026-0047";
                            const msgs = sentWOMessages[woId] || [];
                            return (
                              <div className="flex flex-col h-full">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 shrink-0 bg-white">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2"><span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{woId}</span><span className="flex items-center gap-1.5 text-[10px] text-indigo-700" style={{ fontWeight: 600 }}><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />In Progress</span></div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">Brake caliper service · Mike Torres · Dana Lee</div>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="flex items-center gap-1.5"><div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full" style={{ width: "45%" }} /></div><span className="text-[10px] text-slate-500">45%</span></div>
                                    <span className="text-[13px] text-slate-800" style={{ fontWeight: 700 }}>$790.50</span>
                                  </div>
                                </div>
                                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#F2F2F7]">
                                  <div className="flex justify-center"><div className="text-[10px] text-slate-500 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">WO-2026-0047 opened · 4 days ago</div></div>
                                  <div className="flex items-end gap-2">
                                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>MT</div>
                                    <div className="flex flex-col items-start max-w-[80%]">
                                      <div className="flex items-center gap-1.5 mb-1 px-1"><span className="text-[11px] text-slate-500" style={{ fontWeight: 600 }}>Mike Torres</span><span className="text-[10px] text-slate-400">3d ago</span></div>
                                      <div className="relative cursor-default select-none" {...lph("wo47-m1")}>
                                        {reactionPicker("wo47-m1", "left")}
                                        <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed bg-white text-slate-800 border border-slate-200/70 shadow-sm">Aircraft in bay 3. Left brake caliper piston is binding — pad contact uneven. Cleaning piston bore before deciding on replacement.</div>
                                        {messageReactions["wo47-m1"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 pl-1">{messageReactions["wo47-m1"]}</motion.div>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-end gap-2">
                                    <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>DL</div>
                                    <div className="flex flex-col items-start max-w-[80%]">
                                      <div className="flex items-center gap-1.5 mb-1 px-1"><span className="text-[11px] text-slate-500" style={{ fontWeight: 600 }}>Dana Lee</span><span className="text-[10px] text-slate-400">2d ago</span></div>
                                      <div className="relative cursor-default select-none" {...lph("wo47-m2")}>
                                        {reactionPicker("wo47-m2", "left")}
                                        <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed bg-white text-slate-800 border border-slate-200/70 shadow-sm">Parts ordered from Aircraft Spruce — brake disc BRK-30026-5 and pad set. ETA 2 days.<div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] bg-slate-100 text-slate-600" style={{ fontWeight: 600 }}><Package className="w-3 h-3" /> P/N BRK-30026-5</div></div>
                                        {messageReactions["wo47-m2"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 pl-1">{messageReactions["wo47-m2"]}</motion.div>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-end gap-2">
                                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>MT</div>
                                    <div className="flex flex-col items-start max-w-[80%]">
                                      <div className="flex items-center gap-1.5 mb-1 px-1"><span className="text-[11px] text-slate-500" style={{ fontWeight: 600 }}>Mike Torres</span><span className="text-[9px] text-blue-600 bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Update</span></div>
                                      <div className="relative cursor-default select-none" {...lph("wo47-m3")}>
                                        {reactionPicker("wo47-m3", "left")}
                                        <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed bg-white text-slate-800 border border-slate-200/70 shadow-sm">Parts arriving Thursday. Completion expected by end of week. No additional scope changes anticipated.</div>
                                        {messageReactions["wo47-m3"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 pl-1">{messageReactions["wo47-m3"]}</motion.div>}
                                      </div>
                                      <span className="text-[10px] text-slate-400 mt-1 px-1">2 days ago</span>
                                    </div>
                                  </div>
                                  {msgs.map((m, i) => { const mid = `${woId}-sent-${i}`; return (
                                    <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 flex-row-reverse">
                                      <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0 text-white text-[9px]" style={{ fontWeight: 700 }}>You</div>
                                      <div className="flex flex-col items-end max-w-[75%]">
                                        <div className="relative cursor-default select-none" {...lph(mid)}>
                                          {reactionPicker(mid, "right")}
                                          <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">{m}</div>
                                          {messageReactions[mid] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 text-right pr-1">{messageReactions[mid]}</motion.div>}
                                        </div>
                                        <span className="text-[10px] text-slate-400 mt-1 px-1">just now</span>
                                      </div>
                                    </motion.div>
                                  ); })}
                                </div>
                                <div className="px-3 py-2.5 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
                                  <button className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"><Camera className="w-5 h-5" /></button>
                                  <div className="flex-1 bg-[#F2F2F7] rounded-2xl px-3.5 py-2"><input value={askingWO === woId ? askWOMessage : ""} onChange={e => { setAskingWO(woId); setAskWOMessage(e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendWOMessage(woId); } }} placeholder="Message Mike Torres or Dana Lee…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400" /></div>
                                  <AnimatePresence mode="wait">
                                    {(askingWO === woId && askWOMessage.trim()) ? (
                                      <motion.button key="send" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} onClick={() => handleSendWOMessage(woId)} className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center hover:bg-[#2563EB]/90 transition-colors shrink-0"><Send className="w-3.5 h-3.5 text-white" /></motion.button>
                                    ) : (
                                      <motion.button key="mic" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"><Mic className="w-3.5 h-3.5 text-slate-400" /></motion.button>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>
                            );
                          })()}

                          {/* ── EST-2026-0018 (N24680) ── */}
                          {activeWOItem === "EST-2026-0018" && (() => {
                            const estId = "EST-2026-0018";
                            const isApproved = approvedItems.includes(estId);
                            const isDenied = deniedItems.includes(estId);
                            const msgs = sentWOMessages[estId] || [];
                            return (
                              <div className="flex flex-col h-full">
                                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 shrink-0 bg-white">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{estId}</span>
                                      {!isApproved && !isDenied && <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Awaiting Approval</span>}
                                      {isApproved && <span className="flex items-center gap-1 text-[10px] text-emerald-700" style={{ fontWeight: 600 }}><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Approved</span>}
                                      {isDenied && <span className="text-[10px] text-slate-500" style={{ fontWeight: 600 }}>Declined</span>}
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">Annual Inspection · Mike Torres · {ac.model}</div>
                                  </div>
                                  <span className="text-[13px] text-slate-800 shrink-0" style={{ fontWeight: 700 }}>$1,634.50</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8F9FA]">
                                  <div className="bg-white rounded-xl border border-border shadow-sm p-4">
                                    <div className="border border-border rounded-xl overflow-hidden mb-3">
                                      <table className="w-full text-[12px]">
                                        <thead className="bg-muted/20"><tr><th className="text-left p-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Description</th><th className="text-right p-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Qty</th><th className="text-right p-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Total</th></tr></thead>
                                        <tbody className="divide-y divide-border">
                                          {[{ d: "Annual inspection — airframe", q: "6 hrs", t: "$750.00" }, { d: "Annual inspection — engine/prop", q: "4 hrs", t: "$500.00" }, { d: "Oil filter — Champion CH48110-1", q: "1", t: "$42.50" }, { d: "Spark plugs — Champion (x12)", q: "12", t: "$342.00" }].map(row => (
                                            <tr key={row.d}><td className="p-2.5 text-foreground">{row.d}</td><td className="p-2.5 text-right text-muted-foreground">{row.q}</td><td className="p-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>{row.t}</td></tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg px-3 py-2 text-[11px] text-muted-foreground mb-3"><strong className="text-foreground">Note:</strong> Estimate assumes no major discrepancies. Findings billed at T&M with your notification.</div>
                                    {!isApproved && !isDenied && (
                                      <div className="flex gap-2">
                                        <button onClick={() => setApprovedItems(p => [...p, estId])} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white py-2.5 rounded-xl text-[13px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 600 }}><CheckCircle className="w-4 h-4" /> Approve</button>
                                        <button onClick={() => setDeniedItems(p => [...p, estId])} className="flex items-center gap-1.5 border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-[13px] hover:bg-slate-50 transition-colors" style={{ fontWeight: 500 }}><X className="w-4 h-4" /> Decline</button>
                                      </div>
                                    )}
                                    {isApproved && <div className="text-center py-2 text-[12px] text-emerald-700 bg-emerald-50 rounded-xl" style={{ fontWeight: 600 }}>✓ Approved — Mike Torres notified</div>}
                                    {isDenied && <div className="text-center py-2 text-[12px] text-slate-600 bg-slate-50 rounded-xl" style={{ fontWeight: 600 }}>Declined · mechanic notified</div>}
                                  </div>
                                  {msgs.length > 0 && msgs.map((m, i) => { const mid = `${estId}-sent-${i}`; return (
                                    <div key={i} className="flex items-end gap-2 flex-row-reverse">
                                      <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0 text-white text-[9px]" style={{ fontWeight: 700 }}>You</div>
                                      <div className="flex flex-col items-end max-w-[75%]">
                                        <div className="relative cursor-default select-none" {...lph(mid)}>
                                          {reactionPicker(mid, "right")}
                                          <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">{m}<div className="text-[10px] text-white/60 mt-0.5">sent to Mike Torres</div></div>
                                          {messageReactions[mid] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 text-right pr-1">{messageReactions[mid]}</motion.div>}
                                        </div>
                                        <span className="text-[10px] text-slate-400 mt-1 px-1">just now</span>
                                      </div>
                                    </div>
                                  ); })}
                                </div>
                                <div className="px-3 py-2.5 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
                                  <button className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"><Camera className="w-5 h-5" /></button>
                                  <div className="flex-1 bg-[#F2F2F7] rounded-2xl px-3.5 py-2"><input value={askingWO === estId ? askWOMessage : ""} onChange={e => { setAskingWO(estId); setAskWOMessage(e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendWOMessage(estId); } }} placeholder="Ask Mike Torres a question…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400" /></div>
                                  <AnimatePresence mode="wait">
                                    {(askingWO === estId && askWOMessage.trim()) ? (
                                      <motion.button key="send" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} onClick={() => handleSendWOMessage(estId)} className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center hover:bg-[#2563EB]/90 transition-colors shrink-0"><Send className="w-3.5 h-3.5 text-white" /></motion.button>
                                    ) : (
                                      <motion.button key="mic" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"><Mic className="w-3.5 h-3.5 text-slate-400" /></motion.button>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  </div>{/* end flex-1 WO split */}
                </div>{/* end flex-col outer panel */}

                {false && (
                  <div style={{ display: "none" }}>
                    {mechanics.length === 0 ? (
                      <div className="p-8 text-center">
                        <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-3"><HardHat className="w-5 h-5 text-muted-foreground/40" /></div>
                        <div className="text-[13px] text-foreground mb-1" style={{ fontWeight: 600 }}>No mechanics assigned</div>
                        <p className="text-[12px] text-muted-foreground mb-4">Invite a mechanic to give them access to this aircraft's maintenance records.</p>
                        <button onClick={() => setShowInviteMechanic(true)} className="inline-flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}><UserPlus className="w-3.5 h-3.5" /> Invite Your First Mechanic</button>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {mechanics.map((m) => {
                          const initials = m.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
                          const avatarColors = ["bg-blue-600 text-white", "bg-violet-600 text-white", "bg-emerald-600 text-white", "bg-amber-500 text-white", "bg-slate-500 text-white"];
                          const colorIdx = Math.abs(m.name.charCodeAt(0) + (m.name.charCodeAt(1) || 0)) % avatarColors.length;
                          return (
                            <div key={m.id} className={`px-5 py-4 flex items-center gap-4 transition-colors ${m.enabled ? "hover:bg-muted/10" : "bg-muted/10 opacity-70"}`}>
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[12px] ${avatarColors[colorIdx]}`} style={{ fontWeight: 700 }}>{initials}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{m.name}</span>
                                  {m.linkedTeamMemberId && <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}><Link2 className="w-2.5 h-2.5" /> In Ecosystem</span>}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.status === "Active" ? "bg-emerald-50 text-emerald-700" : m.status === "Invited" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`} style={{ fontWeight: 600 }}>{m.status}</span>
                                  {!m.enabled && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Access Off</span>}
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{m.email}</span>
                                  {m.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{m.phone}</span>}
                                </div>
                                <div className="text-[10px] text-muted-foreground/60 mt-0.5">Invited {m.invitedAt}</div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => toggleAircraftAssignment(m.id)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-[11px]" style={{ fontWeight: 600, borderColor: m.enabled ? "rgb(16 185 129/0.3)" : "rgb(203 213 225)", background: m.enabled ? "rgb(240 253 244)" : "rgb(248 250 252)", color: m.enabled ? "rgb(4 120 87)" : "rgb(100 116 139)" }}>
                                  {m.enabled ? <><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Active</> : <><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> Off</>}
                                </button>
                                <button onClick={() => removeAircraftAssignment(m.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors group"><Trash2 className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-red-500 transition-colors" /></button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {mechanics.length > 0 && (
                      <div className="px-5 py-3 border-t border-border bg-muted/10 rounded-b-xl">
                        <p className="text-[11px] text-muted-foreground">Toggle <span style={{ fontWeight: 600 }}>off</span> to temporarily revoke access. Mechanics in the ecosystem auto-link — no extra sign-up required.</p>
                      </div>
                    )}
                  </div>
                )}

                {false && <><div className="hidden">
                {/* ── Assigned Mechanics (DEAD) ── */}
                <div className="bg-white rounded-xl border border-border">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <div>
                      <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Assigned Mechanics</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {mechanics.filter(m => m.enabled).length} active · {mechanics.filter(m => !m.enabled).length} disabled · {mechanics.filter(m => m.status === "Invited").length} pending
                      </p>
                    </div>
                    <button onClick={() => setShowInviteMechanic(true)} className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                      <UserPlus className="w-3.5 h-3.5" /> Invite Mechanic
                    </button>
                  </div>
                  {mechanics.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-3"><HardHat className="w-5 h-5 text-muted-foreground/40" /></div>
                      <div className="text-[13px] text-foreground mb-1" style={{ fontWeight: 600 }}>No mechanics assigned</div>
                      <p className="text-[12px] text-muted-foreground mb-4">Invite a mechanic to give them access to this aircraft's maintenance records.</p>
                      <button onClick={() => setShowInviteMechanic(true)} className="inline-flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                        <UserPlus className="w-3.5 h-3.5" /> Invite Your First Mechanic
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {mechanics.map((m) => {
                        const initials = m.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
                        const avatarColors = ["bg-blue-600 text-white", "bg-violet-600 text-white", "bg-emerald-600 text-white", "bg-amber-500 text-white", "bg-slate-500 text-white"];
                        const colorIdx = Math.abs(m.name.charCodeAt(0) + (m.name.charCodeAt(1) || 0)) % avatarColors.length;
                        return (
                          <div key={m.id} className={`px-5 py-4 flex items-center gap-4 transition-colors ${m.enabled ? "hover:bg-muted/10" : "bg-muted/10 opacity-70"}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[12px] ${avatarColors[colorIdx]}`} style={{ fontWeight: 700 }}>{initials}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{m.name}</span>
                                {m.linkedTeamMemberId && <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}><Link2 className="w-2.5 h-2.5" /> In Ecosystem</span>}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.status === "Active" ? "bg-emerald-50 text-emerald-700" : m.status === "Invited" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`} style={{ fontWeight: 600 }}>{m.status}</span>
                                {!m.enabled && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Access Off</span>}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{m.email}</span>
                                {m.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{m.phone}</span>}
                              </div>
                              <div className="text-[10px] text-muted-foreground/60 mt-0.5">Invited {m.invitedAt}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => toggleAircraftAssignment(m.id)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-[11px]" style={{ fontWeight: 600, borderColor: m.enabled ? "rgb(16 185 129/0.3)" : "rgb(203 213 225)", background: m.enabled ? "rgb(240 253 244)" : "rgb(248 250 252)", color: m.enabled ? "rgb(4 120 87)" : "rgb(100 116 139)" }}>
                                {m.enabled ? <><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Active</> : <><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> Off</>}
                              </button>
                              <button onClick={() => removeAircraftAssignment(m.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors group">
                                <Trash2 className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-red-500 transition-colors" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {mechanics.length > 0 && (
                    <div className="px-5 py-3 border-t border-border bg-muted/10 rounded-b-xl">
                      <p className="text-[11px] text-muted-foreground">Toggle a mechanic <span style={{ fontWeight: 600 }}>off</span> to temporarily revoke access without removing the assignment. Mechanics in the ecosystem auto-link — no extra sign-up required.</p>
                    </div>
                  )}
                </div>

                {/* Attention banner — dot style */}
                {(tail === "N12345" || tail === "N24680") && (
                  <div className="flex items-center gap-3 bg-amber-50/60 border border-amber-200/70 rounded-xl px-4 py-3">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-[13px] text-amber-900" style={{ fontWeight: 600 }}>
                      {tail === "N12345" ? "2 items need your attention" : "Estimate awaiting your approval"}
                    </span>
                    <span className="text-[12px] text-amber-700">
                      {tail === "N12345" ? "· Approval request · 1 unpaid invoice ($494.50)" : "· EST-2026-0018 · $1,634.50"}
                    </span>
                  </div>
                )}

                {/* ── Estimate approval — N24680 ── */}
                {tail === "N24680" && (() => {
                  const estId = "EST-2026-0018";
                  const isApproved = approvedItems.includes(estId);
                  const isDenied = deniedItems.includes(estId);
                  const msgs = sentWOMessages[estId] || [];
                  return (
                    <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Estimate Awaiting Approval</h3>
                        {isApproved && <span className="flex items-center gap-1.5 text-[11px] text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Approved</span>}
                        {isDenied && <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Declined</span>}
                      </div>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{estId}</span>
                              {!isApproved && !isDenied && <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Awaiting Approval</span>}
                            </div>
                            <div className="text-[12px] text-muted-foreground">Annual Inspection — {ac.model} · Mike Torres · Sent Apr 4, 2026</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[22px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>$1,634.50</div>
                            <div className="text-[11px] text-muted-foreground">estimated total</div>
                          </div>
                        </div>
                        <div className="border border-border rounded-xl overflow-hidden mb-4">
                          <table className="w-full text-[12px]">
                            <thead className="bg-muted/20"><tr>
                              <th className="text-left p-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Description</th>
                              <th className="text-right p-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Qty / Hrs</th>
                              <th className="text-right p-2.5 text-muted-foreground" style={{ fontWeight: 600 }}>Total</th>
                            </tr></thead>
                            <tbody className="divide-y divide-border">
                              {[{ desc: "Annual inspection — airframe", qty: "6 hrs", total: "$750.00" }, { desc: "Annual inspection — engine/propeller", qty: "4 hrs", total: "$500.00" }, { desc: "Oil filter — Champion CH48110-1", qty: "1", total: "$42.50" }, { desc: "Spark plugs — Champion (x12)", qty: "12", total: "$342.00" }].map((row) => (
                                <tr key={row.desc}><td className="p-2.5 text-foreground">{row.desc}</td><td className="p-2.5 text-right text-muted-foreground">{row.qty}</td><td className="p-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>{row.total}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-4 text-[12px] text-muted-foreground">
                          <strong className="text-foreground">Note:</strong> Estimate assumes no major discrepancies. Significant findings billed at T&M with your notification.
                        </div>
                        {/* Sent messages thread */}
                        {msgs.length > 0 && (
                          <div className="rounded-xl bg-[#F2F2F7] px-3 py-3 mb-3 space-y-2">
                            {msgs.map((m, i) => {
                              const mid = `${estId}-sent-${i}`;
                              return (
                                <div key={i} className="flex items-end gap-2 flex-row-reverse">
                                  <div className="w-6 h-6 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0 text-white text-[9px]" style={{ fontWeight: 700 }}>You</div>
                                  <div className="flex flex-col items-end">
                                    <div className="relative cursor-default select-none" {...lph(mid)}>
                                      {reactionPicker(mid, 'right')}
                                      <div className="rounded-2xl rounded-br-sm px-3 py-2 text-[12px] leading-relaxed bg-[#2563EB] text-white max-w-[220px]">{m}
                                        <div className="text-[10px] text-white/60 mt-0.5">sent to Mike Torres</div>
                                      </div>
                                      {messageReactions[mid] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[14px] mt-0.5 text-right pr-1">{messageReactions[mid]}</motion.div>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Approve / Decline */}
                        {!isApproved && !isDenied && (
                          <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                            <button onClick={() => setApprovedItems(p => [...p, estId])} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white py-2.5 rounded-xl text-[13px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 600 }}>
                              <CheckCircle className="w-4 h-4" /> Approve
                            </button>
                            <button onClick={() => setDeniedItems(p => [...p, estId])} className="flex items-center gap-1.5 border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-[13px] hover:bg-slate-50 transition-colors" style={{ fontWeight: 500 }}>
                              <X className="w-4 h-4" /> Decline
                            </button>
                          </div>
                        )}
                        {(isApproved || isDenied) && (
                          <div className="pt-3 border-t border-slate-100">
                            {isApproved && <div className="text-center py-2 text-[12px] text-emerald-700 bg-emerald-50 rounded-xl" style={{ fontWeight: 600 }}>✓ Approved — Mike Torres has been notified</div>}
                            {isDenied && <div className="text-center py-2 text-[12px] text-slate-600 bg-slate-50 rounded-xl" style={{ fontWeight: 600 }}>Declined — mechanic notified</div>}
                          </div>
                        )}
                        {/* Composer */}
                        <div className="flex items-center gap-2 pt-3">
                          <button className="p-1.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"><Camera className="w-4 h-4" /></button>
                          <div className="flex-1 bg-[#F2F2F7] rounded-2xl px-3.5 py-2">
                            <input value={askingWO === estId ? askWOMessage : ""} onChange={e => { setAskingWO(estId); setAskWOMessage(e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendWOMessage(estId); } }} placeholder="Ask Mike Torres a question…" className="w-full bg-transparent text-[12px] outline-none placeholder:text-slate-400" />
                          </div>
                          <AnimatePresence mode="wait">
                            {(askingWO === estId && askWOMessage.trim()) ? (
                              <motion.button key="send" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} onClick={() => handleSendWOMessage(estId)} className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center hover:bg-[#2563EB]/90 transition-colors shrink-0">
                                <Send className="w-3.5 h-3.5 text-white" />
                              </motion.button>
                            ) : (
                              <motion.button key="mic" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0">
                                <Mic className="w-3.5 h-3.5 text-muted-foreground" />
                              </motion.button>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Active Work Order — iMessage thread ── */}
                {(tail === "N12345" || tail === "N67890") && (
                  <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Active Work Order</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Updates and messages from your mechanic. Hold any message to react.</p>
                    </div>

                    {/* ── N12345 — WO-2026-0042 ── */}
                    {tail === "N12345" && (() => {
                      const woId = "WO-2026-0042";
                      const isApproved = approvedItems.includes(woId);
                      const isDenied = deniedItems.includes(woId);
                      const msgs = sentWOMessages[woId] || [];
                      return (
                        <div className="flex flex-col">
                          {/* WO strip */}
                          <div className="px-4 py-2.5 bg-[#FAFAFA] border-b border-slate-100 flex items-center gap-2">
                            <span className="text-[12px] text-slate-700" style={{ fontWeight: 700 }}>{woId}</span>
                            <span className={`flex items-center gap-1.5 text-[11px] ${isApproved ? "text-emerald-700" : isDenied ? "text-slate-500" : "text-amber-700"}`} style={{ fontWeight: 600 }}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isApproved ? "bg-emerald-400" : isDenied ? "bg-slate-400" : "bg-amber-400"}`} />
                              {isApproved ? "Approved" : isDenied ? "Declined" : "Awaiting Your Approval"}
                            </span>
                            <div className="ml-auto flex items-center gap-3 text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-400 rounded-full" style={{ width: "70%" }} /></div>
                                <span className="text-slate-500">70%</span>
                              </div>
                              <span className="text-slate-700" style={{ fontWeight: 700 }}>$460.00</span>
                            </div>
                          </div>

                          {/* Thread */}
                          <div className="px-4 py-4 space-y-3 bg-[#F2F2F7] min-h-[180px]">
                            {/* System pill */}
                            <div className="flex justify-center">
                              <div className="text-[10px] text-slate-500 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">WO-2026-0042 opened · 9 days ago</div>
                            </div>

                            {/* Mike — diagnostic */}
                            <div className="flex items-end gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>MT</div>
                              <div className="flex flex-col items-start max-w-[80%]">
                                <div className="flex items-center gap-1.5 mb-1 px-1">
                                  <span className="text-[11px] text-slate-500" style={{ fontWeight: 600 }}>Mike Torres</span>
                                  <span className="text-[10px] text-slate-400">Lead Mechanic · 8d ago</span>
                                </div>
                                <div className="relative cursor-default select-none" {...lph("wo42-m1")}>
                                  {reactionPicker("wo42-m1", "left")}
                                  <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed bg-white text-slate-800 border border-slate-200/70 shadow-sm">
                                    Traced intermittent nav light to right connector at wing root. Corrosion visible under insulation — wire shows abrasion at grommet edge. Parts are on hand.
                                  </div>
                                  {messageReactions["wo42-m1"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 pl-1">{messageReactions["wo42-m1"]}</motion.div>}
                                </div>
                              </div>
                            </div>

                            {/* Status transition pill */}
                            <div className="flex justify-center">
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />In Progress
                                <span className="text-slate-300 mx-0.5">→</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Awaiting Approval · 7d ago
                              </div>
                            </div>

                            {/* Mike — approval request */}
                            <div className="flex items-end gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>MT</div>
                              <div className="flex flex-col items-start max-w-[85%]">
                                <div className="flex items-center gap-1.5 mb-1 px-1">
                                  <span className="text-[11px] text-slate-500" style={{ fontWeight: 600 }}>Mike Torres</span>
                                  <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Approval Request</span>
                                </div>
                                <div className="relative cursor-default select-none" {...lph("wo42-m2")}>
                                  {reactionPicker("wo42-m2", "left")}
                                  <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed bg-white text-slate-800 border border-amber-200/50 shadow-sm">
                                    Full wire re-route needed at grommet — +1.5 hrs, +$187.50. Parts on hand. No additional parts required. This expands the original scope slightly to ensure a proper repair.
                                    {!isApproved && !isDenied && (
                                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                                        <button onClick={() => setApprovedItems(p => [...p, woId])} className="flex items-center gap-1.5 bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-[12px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 600 }}>
                                          <CheckCircle className="w-3.5 h-3.5" /> Approve +$187.50
                                        </button>
                                        <button onClick={() => setDeniedItems(p => [...p, woId])} className="flex items-center gap-1.5 border border-slate-200 text-slate-600 px-3.5 py-2 rounded-xl text-[12px] hover:bg-slate-50 transition-colors" style={{ fontWeight: 500 }}>
                                          <X className="w-3.5 h-3.5" /> Decline
                                        </button>
                                      </div>
                                    )}
                                    {isApproved && <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-emerald-700 flex items-center gap-1.5" style={{ fontWeight: 500 }}><CheckCircle className="w-3.5 h-3.5" /> You approved — mechanic notified</div>}
                                    {isDenied && <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500" style={{ fontWeight: 500 }}>Declined · mechanic notified</div>}
                                  </div>
                                  {messageReactions["wo42-m2"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 pl-1">{messageReactions["wo42-m2"]}</motion.div>}
                                </div>
                                <span className="text-[10px] text-slate-400 mt-1 px-1">7 days ago</span>
                              </div>
                            </div>

                            {/* Owner approval/denial bubble */}
                            {isApproved && (
                              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 flex-row-reverse">
                                <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0 text-white text-[9px]" style={{ fontWeight: 700 }}>You</div>
                                <div className="flex flex-col items-end max-w-[70%]">
                                  <div className="relative cursor-default select-none" {...lph("wo42-owner-approve")}>
                                    {reactionPicker("wo42-owner-approve", "right")}
                                    <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">Approved. Go ahead with the full repair. 👍</div>
                                    {messageReactions["wo42-owner-approve"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 text-right pr-1">{messageReactions["wo42-owner-approve"]}</motion.div>}
                                  </div>
                                  <span className="text-[10px] text-slate-400 mt-1 px-1">just now</span>
                                </div>
                              </motion.div>
                            )}
                            {isDenied && (
                              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 flex-row-reverse">
                                <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0 text-white text-[9px]" style={{ fontWeight: 700 }}>You</div>
                                <div className="flex flex-col items-end max-w-[70%]">
                                  <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">Declined for now. Let's discuss the scope first.</div>
                                  <span className="text-[10px] text-slate-400 mt-1 px-1">just now</span>
                                </div>
                              </motion.div>
                            )}

                            {/* Owner sent messages */}
                            {msgs.map((m, i) => {
                              const mid = `${woId}-sent-${i}`;
                              return (
                                <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 flex-row-reverse">
                                  <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0 text-white text-[9px]" style={{ fontWeight: 700 }}>You</div>
                                  <div className="flex flex-col items-end max-w-[75%]">
                                    <div className="relative cursor-default select-none" {...lph(mid)}>
                                      {reactionPicker(mid, "right")}
                                      <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">{m}</div>
                                      {messageReactions[mid] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 text-right pr-1">{messageReactions[mid]}</motion.div>}
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1 px-1">just now</span>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>

                          {/* Composer */}
                          <div className="px-3 py-2.5 bg-white border-t border-slate-100 flex items-center gap-2">
                            <button className="p-1.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"><Camera className="w-5 h-5" /></button>
                            <div className="flex-1 bg-[#F2F2F7] rounded-2xl px-3.5 py-2">
                              <input value={askingWO === woId ? askWOMessage : ""} onChange={e => { setAskingWO(woId); setAskWOMessage(e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendWOMessage(woId); } }} placeholder="Message Mike Torres…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400" />
                            </div>
                            <AnimatePresence mode="wait">
                              {(askingWO === woId && askWOMessage.trim()) ? (
                                <motion.button key="send" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} onClick={() => handleSendWOMessage(woId)} className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center hover:bg-[#2563EB]/90 transition-colors shrink-0">
                                  <Send className="w-3.5 h-3.5 text-white" />
                                </motion.button>
                              ) : (
                                <motion.button key="mic" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0">
                                  <Mic className="w-3.5 h-3.5 text-muted-foreground" />
                                </motion.button>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── N67890 — WO-2026-0047 ── */}
                    {tail === "N67890" && (() => {
                      const woId = "WO-2026-0047";
                      const msgs = sentWOMessages[woId] || [];
                      return (
                        <div className="flex flex-col">
                          {/* WO strip */}
                          <div className="px-4 py-2.5 bg-[#FAFAFA] border-b border-slate-100 flex items-center gap-2">
                            <span className="text-[12px] text-slate-700" style={{ fontWeight: 700 }}>{woId}</span>
                            <span className="flex items-center gap-1.5 text-[11px] text-indigo-700" style={{ fontWeight: 600 }}>
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />In Progress
                            </span>
                            <div className="ml-auto flex items-center gap-3 text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full" style={{ width: "45%" }} /></div>
                                <span className="text-slate-500">45%</span>
                              </div>
                              <span className="text-slate-700" style={{ fontWeight: 700 }}>$790.50</span>
                            </div>
                          </div>

                          {/* Thread */}
                          <div className="px-4 py-4 space-y-3 bg-[#F2F2F7] min-h-[200px]">
                            <div className="flex justify-center">
                              <div className="text-[10px] text-slate-500 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">WO-2026-0047 opened · 4 days ago</div>
                            </div>

                            {/* Mike — initial update */}
                            <div className="flex items-end gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>MT</div>
                              <div className="flex flex-col items-start max-w-[80%]">
                                <div className="flex items-center gap-1.5 mb-1 px-1">
                                  <span className="text-[11px] text-slate-500" style={{ fontWeight: 600 }}>Mike Torres</span>
                                  <span className="text-[10px] text-slate-400">Lead Mechanic · 3d ago</span>
                                </div>
                                <div className="relative cursor-default select-none" {...lph("wo47-m1")}>
                                  {reactionPicker("wo47-m1", "left")}
                                  <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed bg-white text-slate-800 border border-slate-200/70 shadow-sm">
                                    Aircraft in bay 3. Left brake caliper piston is binding — pad contact uneven. Cleaning piston bore before deciding on replacement.
                                  </div>
                                  {messageReactions["wo47-m1"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 pl-1">{messageReactions["wo47-m1"]}</motion.div>}
                                </div>
                              </div>
                            </div>

                            {/* Dana — parts */}
                            <div className="flex items-end gap-2">
                              <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>DL</div>
                              <div className="flex flex-col items-start max-w-[80%]">
                                <div className="flex items-center gap-1.5 mb-1 px-1">
                                  <span className="text-[11px] text-slate-500" style={{ fontWeight: 600 }}>Dana Lee</span>
                                  <span className="text-[10px] text-slate-400">Mechanic · 2d ago</span>
                                </div>
                                <div className="relative cursor-default select-none" {...lph("wo47-m2")}>
                                  {reactionPicker("wo47-m2", "left")}
                                  <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed bg-white text-slate-800 border border-slate-200/70 shadow-sm">
                                    Parts ordered from Aircraft Spruce — brake disc BRK-30026-5 and pad set. ETA 2 days.
                                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] bg-slate-100 text-slate-600" style={{ fontWeight: 600 }}>
                                      <Package className="w-3 h-3" /> P/N BRK-30026-5
                                    </div>
                                  </div>
                                  {messageReactions["wo47-m2"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 pl-1">{messageReactions["wo47-m2"]}</motion.div>}
                                </div>
                              </div>
                            </div>

                            {/* Mike — completion update */}
                            <div className="flex items-end gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>MT</div>
                              <div className="flex flex-col items-start max-w-[80%]">
                                <div className="flex items-center gap-1.5 mb-1 px-1">
                                  <span className="text-[11px] text-slate-500" style={{ fontWeight: 600 }}>Mike Torres</span>
                                  <span className="text-[9px] text-blue-600 bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Update</span>
                                </div>
                                <div className="relative cursor-default select-none" {...lph("wo47-m3")}>
                                  {reactionPicker("wo47-m3", "left")}
                                  <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] leading-relaxed bg-white text-slate-800 border border-slate-200/70 shadow-sm">
                                    Parts arriving Thursday. Completion expected by end of week. No additional scope changes anticipated.
                                  </div>
                                  {messageReactions["wo47-m3"] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 pl-1">{messageReactions["wo47-m3"]}</motion.div>}
                                </div>
                                <span className="text-[10px] text-slate-400 mt-1 px-1">2 days ago</span>
                              </div>
                            </div>

                            {/* Owner sent messages */}
                            {msgs.map((m, i) => {
                              const mid = `${woId}-sent-${i}`;
                              return (
                                <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 flex-row-reverse">
                                  <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center shrink-0 text-white text-[9px]" style={{ fontWeight: 700 }}>You</div>
                                  <div className="flex flex-col items-end max-w-[75%]">
                                    <div className="relative cursor-default select-none" {...lph(mid)}>
                                      {reactionPicker(mid, "right")}
                                      <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">{m}</div>
                                      {messageReactions[mid] && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[15px] mt-0.5 text-right pr-1">{messageReactions[mid]}</motion.div>}
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1 px-1">just now</span>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>

                          {/* Composer */}
                          <div className="px-3 py-2.5 bg-white border-t border-slate-100 flex items-center gap-2">
                            <button className="p-1.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"><Camera className="w-5 h-5" /></button>
                            <div className="flex-1 bg-[#F2F2F7] rounded-2xl px-3.5 py-2">
                              <input value={askingWO === woId ? askWOMessage : ""} onChange={e => { setAskingWO(woId); setAskWOMessage(e.target.value); }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendWOMessage(woId); } }} placeholder="Message Mike Torres or Dana Lee…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400" />
                            </div>
                            <AnimatePresence mode="wait">
                              {(askingWO === woId && askWOMessage.trim()) ? (
                                <motion.button key="send" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} onClick={() => handleSendWOMessage(woId)} className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center hover:bg-[#2563EB]/90 transition-colors shrink-0">
                                  <Send className="w-3.5 h-3.5 text-white" />
                                </motion.button>
                              ) : (
                                <motion.button key="mic" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="w-8 h-8 rounded-full bg-[#F2F2F7] flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0">
                                  <Mic className="w-3.5 h-3.5 text-muted-foreground" />
                                </motion.button>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── Invoice ── */}
                {tail === "N12345" && (
                  <div className="bg-white rounded-xl border border-border">
                    <div className="px-5 py-4 border-b border-border">
                      <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Invoice — Payment Due</h3>
                    </div>
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>INV-2026-0031</span>
                            <span className="flex items-center gap-1.5 text-[11px] text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Unpaid · 8 days</span>
                          </div>
                          <div className="text-[12px] text-muted-foreground">Nav light repair · Due Apr 15, 2026</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[22px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>$494.50</div>
                          <div className="text-[11px] text-muted-foreground">incl. tax</div>
                        </div>
                      </div>
                      <div className="space-y-1.5 text-[12px] mb-4 pb-4 border-b border-border">
                        {[{ l: "Labor (3.5 hrs @ $125)", v: "$437.50" }, { l: "Parts (MS connector)", v: "$22.50" }, { l: "Tax (7.5%)", v: "$34.50" }].map((r) => (
                          <div key={r.l} className="flex justify-between"><span className="text-muted-foreground">{r.l}</span><span style={{ fontWeight: 500 }}>{r.v}</span></div>
                        ))}
                      </div>
                      <button className="w-full flex items-center justify-center gap-2 bg-[#635BFF] text-white py-3.5 rounded-xl text-[14px] hover:bg-[#5851E5] transition-colors" style={{ fontWeight: 600 }}>
                        <Receipt className="w-4 h-4" /> Pay $494.50 via Stripe
                      </button>
                      <p className="text-[11px] text-center text-muted-foreground mt-2">Secure payment powered by Stripe. Receipt sent by email.</p>
                    </div>
                  </div>
                )}

                {/* ── Records Received ── */}
                <div className="bg-white rounded-xl border border-border">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Records Received</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {(tail === "N12345" ? [
                      { entry: "Oil Change & Filter Inspection", date: "Feb 8, 2026", mechanic: "Mike Torres" },
                      { entry: "Propeller Overhaul Return to Service", date: "Dec 5, 2025", mechanic: "Mike Torres" },
                    ] : tail === "N67890" ? [
                      { entry: "100-Hour Inspection — complete", date: "Jan 15, 2026", mechanic: "Mike Torres" },
                    ] : [
                      { entry: "Propeller Overhaul Certificate", date: "Dec 5, 2025", mechanic: "Mike Torres" },
                    ]).map((r, i) => (
                      <div key={i} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-emerald-600" /></div>
                          <div>
                            <div className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>{r.entry}</div>
                            <div className="text-[11px] text-muted-foreground">{r.date} · {r.mechanic}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1.5 text-[11px] text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Filed</span>
                          <button className="p-1.5 hover:bg-muted rounded-lg transition-colors"><Download className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                </div></>}


              </div>
            )}

            {/* ══════════════════════ DOCUMENTS TAB ══════════════════════ */}
            {activeTab === "Documents" && (
              <div className="space-y-5 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[15px] text-foreground" style={{ fontWeight: 600 }}>Documents — {ac.tail}</h2>
                    <p className="text-[12px] text-muted-foreground">
                      {ac.docCount} document{ac.docCount === 1 ? "" : "s"} indexed
                      {hasCompletenessScore ? ` · ${ac.docCompleteness}% completeness` : ""}
                    </p>
                  </div>
                  <Link href={uploadHref} className="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                    <Upload className="w-3.5 h-3.5" /> Upload Document
                  </Link>
                </div>

                {/* Completeness bar */}
                <div className="bg-white rounded-xl border border-border p-5">
                  {hasCompletenessScore ? (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Record Completeness</span>
                        <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{ac.docCompleteness}%</span>
                      </div>
                      <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
                        <div className={`h-full rounded-full ${ac.docCompleteness >= 80 ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${ac.docCompleteness}%` }} />
                      </div>
                      {ac.docCompleteness < 80 && (
                        <div className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                          Missing documents detected. Upload missing records to improve your compliance score.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Document Indexing</span>
                        <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{ac.docCount}</span>
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        This aircraft is using live document data. Record scoring will appear after more records are indexed and reviewed.
                      </div>
                    </div>
                  )}
                </div>

                {/* Document category grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { name: "Airworthiness & Registration", count: 4, complete: true, icon: Shield },
                    { name: "Inspection Records", count: 18, complete: true, icon: CheckCircle },
                    { name: "Engine Logbook", count: 3, complete: true, icon: BookOpen },
                    { name: "Airframe Logbook", count: 2, complete: true, icon: BookOpen },
                    { name: "Airworthiness Directives", count: 12, complete: false, icon: AlertTriangle },
                    { name: "Avionics / Equipment", count: 6, complete: true, icon: Radio },
                    { name: "Weight & Balance", count: 1, complete: ac.docCompleteness < 80, icon: Layers },
                    { name: "Overhaul Records", count: 3, complete: true, icon: Wrench },
                    { name: "Supplemental Type Certs", count: 2, complete: true, icon: FileText },
                  ].map((cat) => (
                    <button key={cat.name} className="bg-white rounded-xl border border-border p-4 text-left hover:shadow-sm hover:border-primary/20 transition-all group">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cat.complete ? "bg-emerald-50" : "bg-amber-50"}`}>
                          <cat.icon className={`w-4 h-4 ${cat.complete ? "text-emerald-600" : "text-amber-600"}`} />
                        </div>
                        {!cat.complete && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Incomplete</span>}
                      </div>
                      <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{cat.name}</div>
                      <div className="text-[11px] text-muted-foreground">{cat.count} document{cat.count !== 1 ? "s" : ""}</div>
                    </button>
                  ))}
                </div>

                {/* Recent documents */}
                <div className="bg-white rounded-xl border border-border">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Recent Documents</h3>
                    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5">
                      <Search className="w-3.5 h-3.5 text-muted-foreground" />
                      <input type="text" placeholder="Search documents..." className="bg-transparent text-[12px] outline-none w-40 placeholder:text-muted-foreground/60" />
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {[
                      { name: "Annual Inspection Report 2026", type: "Inspection", pages: 12, status: "Indexed", date: "Mar 15, 2026" },
                      { name: "Engine Logbook Pages 1-50", type: "Logbook", pages: 50, status: "Indexed", date: "Feb 20, 2026" },
                      { name: "AD 2024-15-06 Compliance Record", type: "AD", pages: 3, status: "Needs Review", date: "Jan 10, 2026" },
                      { name: "Propeller Overhaul Certificate", type: "Certificate", pages: 2, status: "Indexed", date: "Dec 5, 2025" },
                    ].map((doc, i) => (
                      <div key={i} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
                            <FileText className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div>
                            <div className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>{doc.name}</div>
                            <div className="text-[11px] text-muted-foreground">{doc.type} &middot; {doc.pages} pages &middot; {doc.date}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${doc.status === "Indexed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} style={{ fontWeight: 600 }}>{doc.status}</span>
                          <button className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                            <Download className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════ INTELLIGENCE TAB ══════════════════════ */}
            {activeTab === "Intelligence" && (
              <div className="space-y-5 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[15px] text-foreground" style={{ fontWeight: 600 }}>Intelligence — {ac.tail}</h2>
                    <p className="text-[12px] text-muted-foreground">AI-powered insights from {ac.docCount} indexed documents</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="inline-flex items-center gap-1.5 bg-white border border-border text-muted-foreground px-3 py-2 rounded-lg text-[12px] hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <Download className="w-3.5 h-3.5" /> Export Report
                    </button>
                    <button className="inline-flex items-center gap-1.5 bg-white border border-border text-muted-foreground px-3 py-2 rounded-lg text-[12px] hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <ExternalLink className="w-3.5 h-3.5" /> Share Link
                    </button>
                  </div>
                </div>

                {/* Top intelligence cards */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-[#0A1628] to-[#1E3A5F] rounded-xl p-5 text-white">
                    {hasCompletenessScore ? (
                      <>
                        <div className="text-[11px] text-white/60 mb-1 uppercase tracking-wider" style={{ fontWeight: 600 }}>Record Score</div>
                        <div className="text-[44px] tracking-tight" style={{ fontWeight: 700 }}>{ac.docCompleteness}<span className="text-[20px] text-white/60">%</span></div>
                        <div className="text-[12px] text-white/60 mt-1">{ac.docCompleteness >= 85 ? "Excellent — ready for lender/insurer review" : ac.docCompleteness >= 70 ? "Good — a few gaps to address" : "Needs attention — upload missing records"}</div>
                        <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-white rounded-full" style={{ width: `${ac.docCompleteness}%` }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-[11px] text-white/60 mb-1 uppercase tracking-wider" style={{ fontWeight: 600 }}>Indexed Documents</div>
                        <div className="text-[44px] tracking-tight" style={{ fontWeight: 700 }}>{ac.docCount}</div>
                        <div className="text-[12px] text-white/60 mt-1">Live records are attached to this aircraft. AI scoring will appear after indexing and review build a fuller profile.</div>
                      </>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-border p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Engine Status</span>
                      <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Good</span>
                    </div>
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">SMOH</span><span className="text-foreground" style={{ fontWeight: 600 }}>{ac.smoh.toLocaleString()} hrs</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">TBO Recommendation</span><span className="text-foreground" style={{ fontWeight: 600 }}>2,000 hrs</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Life Remaining</span><span className="text-emerald-600" style={{ fontWeight: 600 }}>{(2000 - ac.smoh).toLocaleString()} hrs</span></div>
                    </div>
                    <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(ac.smoh / 2000) * 100}%` }} />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-border p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>AD Compliance</span>
                      {ac.status === "Airworthy" ? (
                        <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Mostly Current</span>
                      ) : ac.status === "Tracked" ? (
                        <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Monitoring</span>
                      ) : (
                        <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Action Needed</span>
                      )}
                    </div>
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">Complied</span><span className="text-emerald-600" style={{ fontWeight: 600 }}>2 of 3</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Action Required</span><span className="text-orange-600" style={{ fontWeight: 600 }}>1 AD due Apr 15</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Last AD Search</span><span className="text-foreground" style={{ fontWeight: 500 }}>Mar 15, 2026</span></div>
                    </div>
                  </div>
                </div>

                {/* Intelligence modules grid */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Maintenance timeline */}
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="text-[13px] text-foreground mb-4" style={{ fontWeight: 600 }}>Maintenance Timeline</h3>
                    <div className="space-y-4">
                      {[
                        { date: "Mar 15, 2026", event: "Annual Inspection", type: "Inspection", ok: true },
                        { date: "Feb 8, 2026", event: "Oil Change & Filter", type: "Engine", ok: true },
                        { date: "Dec 5, 2025", event: "Propeller Overhaul", type: "Overhaul", ok: true },
                        { date: "Oct 20, 2025", event: "100-Hour Inspection", type: "Inspection", ok: true },
                      ].map((item, i, arr) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                            {i < arr.length - 1 && <div className="w-px flex-1 bg-border mt-1 mb-1" />}
                          </div>
                          <div className="pb-1">
                            <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{item.event}</div>
                            <div className="text-[11px] text-muted-foreground">{item.date} &middot; {item.type}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Missing records */}
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="text-[13px] text-foreground mb-1" style={{ fontWeight: 600 }}>Missing / At-Risk Records</h3>
                    <p className="text-[11px] text-muted-foreground mb-4">AI identified gaps in your record set</p>
                    {(hasCompletenessScore ? ac.docCompleteness < 90 : true) ? (
                      <div className="space-y-2">
                        {[
                          { item: "Weight & Balance Report 2024", priority: "High" },
                          { item: "ELT Authorization Certificate", priority: "Medium" },
                          { item: "Current AVIONICS 337 Form", priority: "Low" },
                        ].map((r) => (
                          <div key={r.item} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className={`w-3.5 h-3.5 ${r.priority === "High" ? "text-orange-500" : r.priority === "Medium" ? "text-amber-500" : "text-slate-400"}`} />
                              <span className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{r.item}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.priority === "High" ? "bg-orange-100 text-orange-700" : r.priority === "Medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`} style={{ fontWeight: 600 }}>{r.priority}</span>
                              <Link href={uploadHref} className="text-[11px] text-primary" style={{ fontWeight: 500 }}>Upload</Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                        <div className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>Records are complete</div>
                      </div>
                    )}
                  </div>

                  {/* Lender / Insurer Packet */}
                  <div className="bg-white rounded-xl border border-border p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Lender / Insurance Summary</h3>
                        <p className="text-[11px] text-muted-foreground">AI-generated packet for external review</p>
                      </div>
                      <span className="text-[10px] bg-primary/8 text-primary px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Premium</span>
                    </div>
                    <div className="space-y-2 mb-4">
                      {["Aircraft overview summary", "Inspection status PDF", "Maintenance history report", "AD compliance attestation", "Engine & prop summary"].map((item) => (
                        <div key={item} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          {item}
                        </div>
                      ))}
                    </div>
                    <button className="w-full bg-primary text-white py-2.5 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                      Generate Intelligence Packet
                    </button>
                  </div>

                  {/* Ask AI */}
                  <div className="bg-white rounded-xl border border-border p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <h3 className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Ask About {ac.tail}</h3>
                    </div>
                    <p className="text-[12px] text-muted-foreground mb-4">Get source-backed answers from {ac.docCount} indexed documents.</p>
                    <div className="flex gap-2 flex-wrap mb-4">
                      {["Last annual inspection?", "Engine overhaul history", "AD compliance status"].map((s) => (
                        <button key={s} onClick={() => setAskInput(s)} className="text-[11px] bg-muted/50 hover:bg-muted text-foreground px-2.5 py-1 rounded-full transition-colors" style={{ fontWeight: 500 }}>{s}</button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center gap-2 bg-muted/30 border border-border rounded-xl px-3 py-2.5">
                        <input
                          type="text"
                          value={askInput}
                          onChange={(e) => setAskInput(e.target.value)}
                          placeholder="Ask about this aircraft..."
                          className="bg-transparent text-[13px] outline-none flex-1"
                        />
                      </div>
                      <button className="bg-primary text-white px-3 rounded-xl hover:bg-primary/90 transition-colors">
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════ ASSIGNMENTS TAB ══════════════════════ */}
            {activeTab === "Assignments" && (
              <div className="space-y-5 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[15px] text-foreground" style={{ fontWeight: 600 }}>Assignments — {ac.tail}</h2>
                    <p className="text-[12px] text-muted-foreground">{assignments.length} people assigned to this aircraft</p>
                  </div>
                  <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                    <UserPlus className="w-3.5 h-3.5" /> Invite Person
                  </button>
                </div>

                {/* Invite modal */}
                <AnimatePresence>
                  {showInvite && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="bg-white rounded-xl border border-primary/30 p-5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Invite to {ac.tail}</span>
                          <button onClick={() => setShowInvite(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                            <X className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                        <div className="grid md:grid-cols-3 gap-3 mb-4">
                          <input type="email" placeholder="Email address" className="border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                          <select className="border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 bg-white">
                            <option>Select role...</option>
                            <option>Owner</option>
                            <option>Operator</option>
                            <option>Pilot</option>
                            <option>CFI / Instructor</option>
                            <option>Mechanic</option>
                            <option>Lead Mechanic</option>
                            <option>IA</option>
                            <option>Insurance Reviewer</option>
                            <option>Lender / Auditor</option>
                            <option>Read-Only External Reviewer</option>
                          </select>
                          <button className="bg-primary text-white px-4 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                            Send Invite
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Role cards */}
                <div className="grid md:grid-cols-2 gap-4">
                  {assignments.map((asn) => (
                    <div key={asn.id} className="bg-white rounded-xl border border-border p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <User className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{asn.name}</div>
                            <div className="text-[12px] text-muted-foreground">{asn.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${roleColor(asn.role)}`} style={{ fontWeight: 600 }}>{asn.role}</span>
                          <button className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                            <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {asn.permissions.map((perm) => (
                          <span key={perm} className="text-[11px] bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>{perm}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Role permission reference */}
                <div className="bg-white rounded-xl border border-border p-5">
                  <h3 className="text-[13px] text-foreground mb-4" style={{ fontWeight: 600 }}>Role Permission Matrix</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-4 text-muted-foreground" style={{ fontWeight: 600 }}>Permission</th>
                          <th className="text-center py-2 px-3 text-muted-foreground" style={{ fontWeight: 600 }}>Owner</th>
                          <th className="text-center py-2 px-3 text-muted-foreground" style={{ fontWeight: 600 }}>Lead Mech</th>
                          <th className="text-center py-2 px-3 text-muted-foreground" style={{ fontWeight: 600 }}>Mechanic</th>
                          <th className="text-center py-2 px-3 text-muted-foreground" style={{ fontWeight: 600 }}>Pilot/CFI</th>
                          <th className="text-center py-2 px-3 text-muted-foreground" style={{ fontWeight: 600 }}>Read-Only</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[
                          { perm: "View All Records", owner: true, lead: true, mech: true, pilot: true, ro: true },
                          { perm: "Upload Documents", owner: true, lead: true, mech: false, pilot: false, ro: false },
                          { perm: "Submit Squawks", owner: true, lead: true, mech: true, pilot: true, ro: false },
                          { perm: "Create Estimates / WOs", owner: false, lead: true, mech: false, pilot: false, ro: false },
                          { perm: "Approve Work / Parts", owner: true, lead: false, mech: false, pilot: false, ro: false },
                          { perm: "Pay Invoices", owner: true, lead: false, mech: false, pilot: false, ro: false },
                          { perm: "Create Logbook Entries", owner: false, lead: true, mech: true, pilot: false, ro: false },
                        ].map((row) => (
                          <tr key={row.perm} className="hover:bg-muted/10 transition-colors">
                            <td className="py-2.5 pr-4 text-foreground" style={{ fontWeight: 500 }}>{row.perm}</td>
                            {[row.owner, row.lead, row.mech, row.pilot, row.ro].map((has, i) => (
                              <td key={i} className="text-center py-2.5 px-3">
                                {has ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <X className="w-3.5 h-3.5 text-muted-foreground/30 mx-auto" />}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════ ACTIVITY TAB ══════════════════════ */}
            {activeTab === "Activity" && (
              <div className="max-w-3xl space-y-4 px-6 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] text-foreground" style={{ fontWeight: 600 }}>Aircraft Activity</h2>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 bg-white border border-border text-muted-foreground px-3 py-1.5 rounded-lg text-[12px] hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <Filter className="w-3.5 h-3.5" /> Filter
                    </button>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-border divide-y divide-border">
                  {activity.map((item) => {
                    const Icon = activityIcon(item.type);
                    return (
                      <div key={item.id} className="px-5 py-4 flex items-start gap-4 hover:bg-muted/20 transition-colors">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${activityColor(item.type)}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-foreground mb-0.5" style={{ fontWeight: 600 }}>{item.title}</div>
                          <div className="text-[12px] text-muted-foreground mb-1.5 leading-relaxed">{item.detail}</div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{item.actor}</span>
                            <span>&middot;</span>
                            <span className="text-primary/60">{item.actorRole}</span>
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground shrink-0">{item.time}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Add note */}
                <div className="bg-white rounded-xl border border-border p-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 flex items-center gap-2 bg-muted/30 border border-border rounded-xl px-4 py-2.5">
                      <input type="text" placeholder="Add a note to this aircraft's activity..." className="bg-transparent text-[13px] outline-none flex-1" />
                      <button className="shrink-0 bg-primary text-white w-7 h-7 rounded-lg flex items-center justify-center hover:bg-primary/90 transition-colors">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Invite Mechanic Modal */}
      {showInviteMechanic && (
        <InviteMechanicModal
          aircraftTail={tail}
          onClose={() => setShowInviteMechanic(false)}
        />
      )}

      {/* ─── Upload Document Modal ─────────────────────────────── */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
            onClick={e => { if (e.target === e.currentTarget) setShowUpload(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-2xl w-full max-w-lg my-8 overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-border flex items-center justify-between">
                <h2 className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>Upload Document</h2>
                <button onClick={() => setShowUpload(false)} className="p-1.5 hover:bg-muted rounded-lg">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {uploadSuccess ? (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-12 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-[18px] text-foreground mb-2" style={{ fontWeight: 700 }}>Document uploaded!</h3>
                  <p className="text-[13px] text-muted-foreground max-w-xs">
                    {isManualUploadType && uploadForm.manualAccess !== "private"
                      ? "Your manual has been submitted for community review."
                      : "Your document is being processed and will appear in your library shortly."}
                  </p>
                </motion.div>
              ) : (
                <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
                  {/* Title */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Document title <span className="text-red-500">*</span></label>
                    <input type="text" value={uploadForm.title} onChange={e => puf({ title: e.target.value })} placeholder="e.g. Annual Inspection Report 2026" className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>

                  {/* Doc type */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Document type</label>
                    <div className="relative">
                      <select value={uploadForm.docType} onChange={e => puf({ docType: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none appearance-none bg-white pr-8">
                        {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Visibility */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Visibility</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { val: "private" as UploadVisibility, label: "Private", sub: "Only you", icon: Lock },
                        { val: "team" as UploadVisibility, label: "Shared with team", sub: "All workspace members", icon: Users },
                      ]).map(v => (
                        <button key={v.val} onClick={() => puf({ visibility: v.val })}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors ${uploadForm.visibility === v.val ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                          <v.icon className={`w-4 h-4 shrink-0 ${uploadForm.visibility === v.val ? "text-primary" : "text-muted-foreground"}`} />
                          <div>
                            <div className={`text-[12px] ${uploadForm.visibility === v.val ? "text-primary" : "text-foreground"}`} style={{ fontWeight: 600 }}>{v.label}</div>
                            <div className="text-[11px] text-muted-foreground">{v.sub}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aircraft */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Aircraft <span className="text-muted-foreground/50">(optional)</span></label>
                    <div className="relative">
                      <select value={uploadForm.aircraft} onChange={e => puf({ aircraft: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none appearance-none bg-white pr-8">
                        <option value="">— Not aircraft-specific —</option>
                        {UPLOAD_AIRCRAFT_LIST.map(a => <option key={a}>{a}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Notes <span className="text-muted-foreground/50">(optional)</span></label>
                    <textarea value={uploadForm.notes} onChange={e => puf({ notes: e.target.value })} rows={2} placeholder="Any notes for your team or about this document..." className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none resize-none" />
                  </div>

                  {/* Book type — non-manual only */}
                  {!isManualUploadType && (
                    <div>
                      <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Book assignment type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { val: "historical" as UploadBookType, label: "Historical", sub: "Past records & archive", icon: History },
                          { val: "present" as UploadBookType, label: "Present", sub: "Current & active records", icon: Layers },
                        ]).map(b => (
                          <button key={b.val} onClick={() => puf({ bookType: b.val })}
                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors ${uploadForm.bookType === b.val ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                            <b.icon className={`w-4 h-4 shrink-0 ${uploadForm.bookType === b.val ? "text-primary" : "text-muted-foreground"}`} />
                            <div>
                              <div className={`text-[12px] ${uploadForm.bookType === b.val ? "text-primary" : "text-foreground"}`} style={{ fontWeight: 600 }}>{b.label}</div>
                              <div className="text-[11px] text-muted-foreground">{b.sub}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manual community options */}
                  <AnimatePresence>
                    {isManualUploadType && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="border border-primary/20 rounded-xl p-4 bg-primary/3 space-y-3">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <p className="text-[12px] text-foreground leading-relaxed">
                              Manuals, service manuals, and parts catalogs can stay private or become community downloads. Paid listings follow the{" "}
                              <span style={{ fontWeight: 600 }}>50% uploader / 50% myaircraft.us split</span>.
                            </p>
                          </div>
                          <div>
                            <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Publishing option</label>
                            <div className="space-y-2">
                              {([
                                { val: "private" as ManualAccess, label: "Keep private", sub: "Only you and your team can access this", icon: Lock },
                                { val: "free" as ManualAccess, label: "Public free download", sub: "Listed on marketplace — anyone can download", icon: BookOpen },
                                { val: "paid" as ManualAccess, label: "Monetize", sub: "Paid listing — you earn 50% of net revenue", icon: DollarSign },
                              ]).map(opt => (
                                <button key={opt.val} onClick={() => puf({ manualAccess: opt.val })}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${uploadForm.manualAccess === opt.val ? "border-primary bg-primary/5" : "border-border bg-white hover:bg-muted/20"}`}>
                                  <opt.icon className={`w-4 h-4 shrink-0 ${uploadForm.manualAccess === opt.val ? "text-primary" : "text-muted-foreground"}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-[13px] ${uploadForm.manualAccess === opt.val ? "text-primary" : "text-foreground"}`} style={{ fontWeight: 600 }}>{opt.label}</div>
                                    <div className="text-[11px] text-muted-foreground">{opt.sub}</div>
                                  </div>
                                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${uploadForm.manualAccess === opt.val ? "border-primary bg-primary" : "border-border"}`}>
                                    {uploadForm.manualAccess === opt.val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                          <AnimatePresence>
                            {uploadForm.manualAccess === "paid" && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <div className="space-y-2 pt-1">
                                  <div className="flex items-center gap-3">
                                    <label className="text-[12px] text-muted-foreground" style={{ fontWeight: 600 }}>Price</label>
                                    <div className="flex items-center gap-1.5 border border-border rounded-lg px-3 py-2 bg-white">
                                      <span className="text-[13px] text-muted-foreground">$</span>
                                      <input type="number" value={uploadForm.price} onChange={e => puf({ price: e.target.value })} className="w-16 text-[13px] outline-none bg-transparent" min="1" />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2 text-center bg-white border border-border rounded-xl p-3">
                                    <div><div className="text-[10px] text-muted-foreground">Price</div><div className="text-[12px] text-foreground" style={{ fontWeight: 700 }}>${uploadGross.toFixed(2)}</div></div>
                                    <div><div className="text-[10px] text-muted-foreground">Uploader share</div><div className="text-[12px] text-emerald-600" style={{ fontWeight: 700 }}>${uploaderShare}</div></div>
                                    <div><div className="text-[10px] text-muted-foreground">Platform share</div><div className="text-[12px] text-muted-foreground" style={{ fontWeight: 700 }}>${platformShare}</div></div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {(uploadForm.manualAccess === "free" || uploadForm.manualAccess === "paid") && (
                            <label className="flex items-start gap-2.5 cursor-pointer group">
                              <div onClick={() => puf({ attest: !uploadForm.attest })}
                                className={`w-4 h-4 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-colors ${uploadForm.attest ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"}`}>
                                {uploadForm.attest && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <span className="text-[12px] text-muted-foreground leading-relaxed">
                                I own the rights or have permission to distribute this document. I confirm this is not a POH, AFM, logbook, or aircraft-specific maintenance record.
                              </span>
                            </label>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* File picker */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>File <span className="text-red-500">*</span></label>
                    <input ref={uploadFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => puf({ file: e.target.files?.[0]?.name || "" })} />
                    <div onClick={() => uploadFileRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/40 transition-colors cursor-pointer ${uploadForm.file ? "border-primary/30 bg-primary/3" : "border-border"}`}>
                      {uploadForm.file ? (
                        <div className="flex items-center justify-center gap-2 text-[13px] text-foreground">
                          <CheckCircle className="w-5 h-5 text-emerald-600" />{uploadForm.file}
                        </div>
                      ) : (
                        <>
                          <Upload className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                          <div className="text-[13px] text-foreground mb-0.5" style={{ fontWeight: 500 }}>Drop files here or click to browse</div>
                          <div className="text-[12px] text-muted-foreground">PDF, JPG, PNG up to 50MB each</div>
                        </>
                      )}
                    </div>
                  </div>

                  <button onClick={handleUploadSubmit} disabled={!canUploadSubmit}
                    className="w-full py-3 rounded-xl bg-primary text-white text-[14px] hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ fontWeight: 600 }}>
                    Upload &amp; Process
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
