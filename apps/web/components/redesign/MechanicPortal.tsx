"use client";

import { useEffect, useMemo, useState } from "react";
import Link, { useTenantRouter } from "@/components/shared/tenant-link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Plane, Wrench, FileText, Receipt, BookOpen, Users, User, LayoutDashboard,
  AlertTriangle, CheckSquare, Square, Plus, Search, ChevronRight, X,
  Send, Sparkles, Mic, Bot, Download,
  ExternalLink, Edit3, Bell, Eye, MessageSquare, Hash,
  MoreHorizontal, Lock, CreditCard,
  CheckCircle, Building2, Phone, Mail,
  Gauge, Camera, Loader2, ShieldCheck, Shield, Package, BadgeCheck
} from "lucide-react";
import { LogbookSignModal } from "./LogbookSignModal";
import { PartsSection } from "./PartsSection";
import { PartPickerModal } from "./PartPickerModal";
import { usePartsStore } from "./workspace/PartsStore";
import { motion, AnimatePresence } from "motion/react";
import {
  useDataStore,
  type LaborLine,
  type PartsLine,
} from "./workspace/DataStore";
import { useAppContext } from "./AppContext";
import { toast } from "sonner";
import { LogbookCanaryGenerator } from "./LogbookCanaryGenerator";
import { lookupAircraftByNNumber, FaaLookupResult } from "./faaRegistryService";
import { formatRegistrantLocation } from "./faaDisplay";
import { MechanicDashboardTab } from "./MechanicDashboardTab";
import { InviteTeamMemberModal } from "./mechanicPortal/InviteTeamMemberModal";
import { AddAircraftModal } from "./mechanicPortal/AddAircraftModal";
import type {
  FoundFaaResult,
  MechanicInvoice,
  SquawkRecord,
  MechanicSection,
  GeneratedEstimate,
} from "./mechanicPortal/types";
import { NAV_ITEMS, EMPTY_SQUAWK_QUEUE, EST_THREADS } from "./mechanicPortal/constants";
import {
  sevColor,
  threadIcon,
  threadColor,
  invoiceStatusColor,
  normalizeCustomerIdentity,
  isFaaTemporarilyUnavailable,
} from "./mechanicPortal/helpers";

/* ═══════════════════ MAIN COMPONENT ════════════════════════════ */
export function MechanicPortal() {
  const {
    workOrders,
    estimates,
    addEstimate,
    customers,
    invoices,
    aircraft,
    logbookEntries,
    addCustomer,
    updateCustomer,
    refreshAircraft,
  } = useDataStore();
  const { activeMechanic, team, updateMember, addTeamMember, removeTeamMember, customerAccessList, toggleCustomerAccess } = useAppContext();
  const { savedParts, deductStock } = usePartsStore();

  // ─── Part Picker modal ───────────────────────────────────────
  const [showPartPicker, setShowPartPicker] = useState(false);
  const [partPickerMode, setPartPickerMode] = useState<"inventory-only" | "all">("all");
  const [partPickerAircraft, setPartPickerAircraft] = useState("");
  const [partPickerTarget, setPartPickerTarget] = useState<"invoice" | "wo">("invoice");
  // invoice detail editable lines
  const [invoiceDetailParts, setInvoiceDetailParts] = useState<Record<string, Array<{ pn: string; desc: string; qty: number; price: number; total: number }>>>({});

  // Team management modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const perm = activeMechanic.permissions;
  const isRestrictedMechanic = !perm.dashboard && !perm.aircraft && !perm.squawks && !perm.estimates && !perm.invoices && !perm.logbook;
  const router = useTenantRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tenantSlug = (pathname ?? "").split("/").filter(Boolean)[0] ?? "";
  const normalizedTenantCustomerKey = normalizeCustomerIdentity(tenantSlug.replace(/-/g, " "));

  const VALID_SECTIONS: MechanicSection[] = ["dashboard","aircraft","squawks","estimates","workorders","invoices","logbook","customers","team","parts"];
  const tabParam = searchParams.get("tab") as MechanicSection | null;
  // Determine the correct default section based on permissions
  const defaultSection: MechanicSection = perm.dashboard ? "dashboard" : perm.workOrders ? "workorders" : "workorders";
  const [section, _setSection] = useState<MechanicSection>(() =>
    tabParam && VALID_SECTIONS.includes(tabParam) ? tabParam : defaultSection
  );

  useEffect(() => {
    const t = searchParams.get("tab") as MechanicSection | null;
    if (t && VALID_SECTIONS.includes(t) && t !== section) _setSection(t);
  }, [searchParams]);

  const setSection = (s: MechanicSection) => {
    _setSection(s);
    router.replace(`/mechanic?tab=${s}`);
  };
  const [selectedAircraft, setSelectedAircraft] = useState<string | null>(null);
  // Work order detail state
  const [selectedWOId, setSelectedWOId] = useState<string | null>(null);
  const [woPartsById, setWoPartsById] = useState<Record<string, {id:string;pn:string;desc:string;qty:number;price:number;total:number;vendor?:string;requestOnly?:boolean}[]>>({});
  const [woPartSearch, setWoPartSearch] = useState("");
  const [woPartResults, setWoPartResults] = useState<typeof savedParts>([]);
  const [showWOPartSearch, setShowWOPartSearch] = useState(false);
  const [woPartSearching, setWoPartSearching] = useState(false);
  const [woRequestPart, setWoRequestPart] = useState("");
  const [woRequestNote, setWoRequestNote] = useState("");
  const [selectedEstId, setSelectedEstId] = useState<string | null>(null);
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [selectedLBId, setSelectedLBId] = useState<string | null>(null);
  const [selectedSquawks, setSelectedSquawks] = useState<string[]>([]);
  const [showEstCreator, setShowEstCreator] = useState(false);
  const [creatorStep, setCreatorStep] = useState<"tail" | "faa-searching" | "faa-result" | "form" | "generating" | "generated">("form");
  const [scopeNotes, setScopeNotes] = useState("");
  const [generatedEst, setGeneratedEst] = useState<GeneratedEstimate | null>(null);
  const [estSearch, setEstSearch] = useState("");
  const [estFilter, setEstFilter] = useState("all");
  const [invSearch, setInvSearch] = useState("");
  const [showLBGenerator, setShowLBGenerator] = useState(false);
  // Canary generator
  const [showCanaryGenerator, setShowCanaryGenerator] = useState(false);
  const [lbFilterTail, setLbFilterTail] = useState("");
  const [lbFilterCustomer, setLbFilterCustomer] = useState("");
  // Legacy
  const [lbGenStep, setLbGenStep] = useState<"select" | "generating" | "edit" | "signed">("select");
  const [selectedWOForLB, setSelectedWOForLB] = useState("");
  const [lbDraftText, setLbDraftText] = useState("");
  const [lbSigning, setLbSigning] = useState(false);
  const [newEstNote, setNewEstNote] = useState("");
  const [estActionState, setEstActionState] = useState<Record<string, string>>({});

  // Estimate creator — N-number lookup pre-step state
  const [estNNumber, setEstNNumber] = useState("");
  const [estFaaData, setEstFaaData] = useState<FoundFaaResult | null>(null);
  const [estFaaNotFound, setEstFaaNotFound] = useState(false);
  const [estFaaError, setEstFaaError] = useState<string | null>(null);
  const [estCustomerName, setEstCustomerName] = useState("");
  const [estCustomerEmail, setEstCustomerEmail] = useState("");
  const [estCustomerPhone, setEstCustomerPhone] = useState("");
  const [estCustomerNotes, setEstCustomerNotes] = useState("");
  const [editLaborLines, setEditLaborLines] = useState<GeneratedEstimate["laborLines"]>([]);
  const [editPartsLines, setEditPartsLines] = useState<GeneratedEstimate["partsLines"]>([]);

  // New Invoice modal state
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [newInvType, setNewInvType] = useState<"wo" | "custom" | null>(null);
  const [newInvLinkedWO, setNewInvLinkedWO] = useState("");
  const [newInvCustomAircraft, setNewInvCustomAircraft] = useState("");
  const [newInvCustomCustomer, setNewInvCustomCustomer] = useState("");
  const [newInvCustomEmail, setNewInvCustomEmail] = useState("");
  const [newInvCustomAmount, setNewInvCustomAmount] = useState("");
  const [newInvNotes, setNewInvNotes] = useState("");
  const [savedMechInvoices, setSavedMechInvoices] = useState<MechanicInvoice[]>([]);

  // ─── Logbook sign modal ─────────────────────────────────────
  const [showSignModal, setShowSignModal] = useState(false);
  const [signedLocalIds, setSignedLocalIds] = useState<string[]>([]);
  const [lbNextSteps, setLbNextSteps] = useState<Record<string, boolean[]>>({});

  // ─── WO thread notes (mechanic portal quick notes) ──────────
  const [woNoteText, setWoNoteText] = useState("");
  const [woThreadNotes, setWoThreadNotes] = useState<Record<string, { id: string; content: string; ts: string }[]>>({});

  // ─── Inline New Work Order form ──────────────────────────────
  const [showNewWOForm, setShowNewWOForm] = useState(false);
  const [newWOAircraftId, setNewWOAircraftId] = useState("");
  const [newWOTitle, setNewWOTitle] = useState("");
  const [newWOSquawks, setNewWOSquawks] = useState<string[]>([]);
  const [newWOLabor, setNewWOLabor] = useState("");
  const [newWOSaving, setNewWOSaving] = useState(false);
  const [liveWOs, setLiveWOs] = useState<Array<{ id: string; wo: string; tail: string; model: string; customer: string; desc: string; status: string; progress: number; mechanic: string; due: string }>>([]);

  // ─── Logbook search ──────────────────────────────────────────
  const [lbSearchQuery, setLbSearchQuery] = useState("");
  const [lbSearchAircraftId, setLbSearchAircraftId] = useState("");
  const [lbSearchEntryType, setLbSearchEntryType] = useState("all");
  const [lbSearchDateFrom, setLbSearchDateFrom] = useState("");
  const [lbSearchDateTo, setLbSearchDateTo] = useState("");
  const [lbSearchResults, setLbSearchResults] = useState<Array<Record<string, any>> | null>(null);
  const [lbSearchLoading, setLbSearchLoading] = useState(false);
  const [lbSearchError, setLbSearchError] = useState<string | null>(null);
  const [lbAIQuery, setLbAIQuery] = useState("");
  const [lbAIAnswer, setLbAIAnswer] = useState<string | null>(null);
  const [lbAILoading, setLbAILoading] = useState(false);
  const [showLbSearch, setShowLbSearch] = useState(false);

  // ─── Enhanced invoice: custom path FAA + line items ─────────
  const [invFaaTail, setInvFaaTail] = useState("");
  const [invFaaData, setInvFaaData] = useState<FoundFaaResult | null>(null);
  const [invFaaNotFound, setInvFaaNotFound] = useState(false);
  const [invFaaError, setInvFaaError] = useState<string | null>(null);
  const [invFaaStep, setInvFaaStep] = useState<"tail" | "searching" | "found">("tail");
  const [invCustomPhone, setInvCustomPhone] = useState("");
  const [invGenerating, setInvGenerating] = useState(false);
  const [invGenerated, setInvGenerated] = useState(false);
  const [invLaborLines, setInvLaborLines] = useState<{ id: string; desc: string; hours: number; rate: number; total: number }[]>([]);
  const [invPartsLines, setInvPartsLines] = useState<{ id: string; pn: string; desc: string; qty: number; price: number; total: number }[]>([]);

  // Add Aircraft modal — modal owns its own form state
  const [showAddAircraft, setShowAddAircraft] = useState(false);

  // Add Squawk modal state
  const [showAddSquawk, setShowAddSquawk] = useState(false);
  const [sqAircraft, setSqAircraft] = useState("");
  const [sqDescription, setSqDescription] = useState("");
  const [sqGenerating, setSqGenerating] = useState(false);
  const [sqGenerated, setSqGenerated] = useState<{ title: string; category: string; severity: string } | null>(null);
  const [sqGrounded, setSqGrounded] = useState(false);
  const [sqTitleEdited, setSqTitleEdited] = useState("");

  // Saved squawks (loaded live and extended locally in-session)
  const [savedSquawks, setSavedSquawks] = useState<SquawkRecord[]>(EMPTY_SQUAWK_QUEUE);
  // Squawk customer/aircraft filter
  const [sqCustomerFilter, setSqCustomerFilter] = useState("all");
  // Estimate thread notes (keyed by estimate id)
  const [savedEstNotes, setSavedEstNotes] = useState<Record<string, { id: string; type: string; actor: string; content: string; time: string }[]>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadSquawks() {
      try {
        const res = await fetch("/api/squawks");
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        const list = (payload?.squawks ?? []) as Array<Record<string, any>>;
        setSavedSquawks(list.map((sq) => {
          const sevMap: Record<string, "Low" | "Medium" | "High" | "Critical"> = {
            low: "Low",
            normal: "Medium",
            medium: "Medium",
            high: "High",
            critical: "Critical",
          };
          const severity = sevMap[String(sq.severity ?? "medium")] ?? "Medium";
          return {
            id: sq.id,
            tail: sq.aircraft?.tail_number ?? "",
            model: [sq.aircraft?.make, sq.aircraft?.model].filter(Boolean).join(" "),
            customer: "",
            title: sq.title ?? "",
            desc: sq.description ?? "",
            category: sq.source_metadata?.category ?? "General Airframe",
            severity,
            date: sq.reported_at ? new Date(sq.reported_at).toLocaleDateString() : "",
            status: sq.status ?? "Open",
          } satisfies SquawkRecord;
        }));
      } catch (err) {
        console.error("Failed to load squawks", err);
      }
    }
    loadSquawks();
    return () => {
      cancelled = true;
    };
  }, []);

  const CUSTOMERS_DATA = useMemo(() => {
    const deduped = new Map<string, {
      id: string;
      name: string;
      company: string;
      email: string;
      phone: string;
      aircraft: string[];
      wos: number;
      billed: number;
      outstanding: number;
      lastService: string;
      tags: string[];
    }>();

    customers.forEach((c) => {
      const key =
        normalizeCustomerIdentity(c.email, c.name, c.company) ||
        normalizeCustomerIdentity(c.name, c.company) ||
        c.id;
      const wos = workOrders.filter((wo) => wo.customer === c.name);
      const billed = invoices
        .filter((inv) => inv.customer === c.name)
        .reduce((sum, inv) => sum + (inv.total ?? 0), 0);
      const outstanding = invoices
        .filter((inv) => inv.customer === c.name && inv.paymentStatus !== "Paid")
        .reduce((sum, inv) => sum + (inv.total ?? 0), 0);

      const existing = deduped.get(key);
      if (existing) {
        existing.aircraft = [...new Set([...(existing.aircraft ?? []), ...(c.aircraft ?? [])])];
        existing.wos += wos.length;
        existing.billed += billed;
        existing.outstanding += outstanding;
        existing.tags = [...new Set([...(existing.tags ?? []), ...(c.tags ?? [])])];
        if (!existing.company && c.company) existing.company = c.company;
        if (!existing.email && c.email) existing.email = c.email;
        if (!existing.phone && c.phone) existing.phone = c.phone;
        if (!existing.lastService && c.lastService) existing.lastService = c.lastService;
        return;
      }

      deduped.set(key, {
        id: c.id,
        name: c.name,
        company: c.company ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        aircraft: [...new Set(c.aircraft ?? [])],
        wos: wos.length,
        billed,
        outstanding,
        lastService: c.lastService || "",
        tags: [...(c.tags ?? [])],
      });
    });

    return Array.from(deduped.values());
  }, [customers, workOrders, invoices]);

  const AIRCRAFT_TO_CUSTOMER_ID = useMemo(() => {
    const map: Record<string, string> = {};
    CUSTOMERS_DATA.forEach((c) => {
      (c.aircraft ?? []).forEach((tail: string) => {
        map[tail] = c.id;
      });
    });
    return map;
  }, [CUSTOMERS_DATA]);

  const TAIL_TO_CUSTOMER_ID = AIRCRAFT_TO_CUSTOMER_ID;

  const CUSTOMER_BY_TAIL = useMemo(() => {
    const map: Record<string, (typeof CUSTOMERS_DATA)[number] | null> = {};
    const singleCustomer = CUSTOMERS_DATA.length === 1 ? CUSTOMERS_DATA[0] : null;
    const tenantCustomer =
      CUSTOMERS_DATA.find((customer) =>
        [customer.name, customer.company].some(
          (value) => normalizeCustomerIdentity(value) === normalizedTenantCustomerKey
        )
      ) ?? null;

    aircraft.forEach((ac) => {
      const tail = ac.tail_number ?? "";
      const directOwnerId = ac.owner_customer_id ?? AIRCRAFT_TO_CUSTOMER_ID[tail];
      let owner = directOwnerId
        ? CUSTOMERS_DATA.find((customer) => customer.id === directOwnerId) ?? null
        : null;

      if (!owner && ac.operator_name) {
        const operatorKey = normalizeCustomerIdentity(ac.operator_name);
        owner =
          CUSTOMERS_DATA.find((customer) =>
            [customer.name, customer.company].some((value) => normalizeCustomerIdentity(value) === operatorKey)
          ) ?? null;
      }

      if (!owner && singleCustomer) {
        owner = singleCustomer;
      }

      if (!owner && tenantCustomer) {
        owner = tenantCustomer;
      }

      map[tail] = owner;
    });

    return map;
  }, [aircraft, CUSTOMERS_DATA, AIRCRAFT_TO_CUSTOMER_ID, normalizedTenantCustomerKey]);

  const ASSIGNED_AIRCRAFT = useMemo(() => {
    return aircraft.map((ac) => {
      const tail = ac.tail_number ?? "";
      const owner = CUSTOMER_BY_TAIL[tail];
      const woCount = workOrders.filter((wo) => wo.aircraft === tail).length;
      const openSquawks = savedSquawks.filter((s) => s.tail === tail).length;
      return {
        tail,
        model: [ac.make, ac.model].filter(Boolean).join(" "),
        year: ac.year ?? undefined,
        customer: owner?.name ?? "",
        company: owner?.company ?? "",
        hobbs: 0,
        tach: 0,
        status: openSquawks > 0 ? "Attention" : "Airworthy",
        openSquawks,
        activeWOs: woCount,
        lastService: "",
      };
    });
  }, [aircraft, CUSTOMER_BY_TAIL, workOrders, savedSquawks]);

  const TEAM_DATA = useMemo(() => {
    return team.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      cert: m.cert,
      specialty: m.specialty,
      status: m.status,
      wos: workOrders.filter((wo) => wo.mechanic === m.name).length,
      color: m.color.replace("text-white", "text-blue-700").replace("bg-blue-600", "bg-blue-100"),
    }));
  }, [team, workOrders]);

  const MECHANIC_INVOICES = useMemo(() => {
    return invoices.map((inv) => ({
      id: inv.id,
      number: inv.invoiceNumber,
      aircraft: inv.aircraft,
      customer: inv.customer,
      company: inv.company ?? "",
      amount: inv.subtotalLabor + inv.subtotalParts + inv.subtotalOutside,
      tax: inv.tax,
      total: inv.total,
      status: inv.status,
      paymentStatus: inv.paymentStatus,
      issuedDate: inv.issuedDate,
      dueDate: inv.dueDate,
      daysOut: inv.dueDate ? Math.max(0, Math.ceil((new Date(inv.dueDate).getTime() - Date.now()) / 86400000)) : 0,
      linkedWO: inv.linkedWorkOrder,
      email: customers.find((c) => c.name === inv.customer)?.email ?? "",
      phone: customers.find((c) => c.name === inv.customer)?.phone ?? "",
      address: "",
      laborLines: inv.laborLines,
      partsLines: inv.partsLines,
    }));
  }, [invoices, customers]);

  const LOGBOOK_ENTRIES = useMemo(() => {
    return logbookEntries.map((entry) => ({
      id: entry.id,
      number: entry.id,
      aircraft: entry.aircraft,
      model: entry.makeModel,
      type: entry.type,
      date: entry.date,
      hobbs: entry.hobbs,
      tach: entry.tach,
      mechanic: entry.mechanic,
      cert: entry.certificateNumber,
      status: entry.status,
      body: entry.body,
      linkedWO: entry.linkedWO,
    }));
  }, [logbookEntries]);

  const squawkQueue = useMemo<SquawkRecord[]>(
    () =>
      savedSquawks.map((squawk) => ({
        ...squawk,
        customer: CUSTOMER_BY_TAIL[squawk.tail]?.name ?? squawk.customer ?? "",
      })),
    [savedSquawks, CUSTOMER_BY_TAIL]
  );

  const generateEstimateFromSquawks = (squawkIds: string[]): GeneratedEstimate => {
    const squawks = squawkQueue.filter((s) => squawkIds.includes(s.id));
    const laborLines: GeneratedEstimate["laborLines"] = [];
    const partsLines: GeneratedEstimate["partsLines"] = [];
    let laborTotal = 0;
    let partsTotal = 0;

    squawks.forEach((sq: any, i: number) => {
      if (sq.category === "Avionics / Electrical") {
        laborLines.push({ id: `l${i}a`, desc: "Inspect and troubleshoot electrical system — " + sq.title.split(" ")[0] + " circuit", hours: 1.5, rate: 125, total: 187.5 });
        laborLines.push({ id: `l${i}b`, desc: "Wire repair and connector replacement", hours: 2.0, rate: 125, total: 250 });
        partsLines.push({ id: `p${i}a`, pn: "CON-MS-2712", desc: "Weatherproof connector — 3 pin", qty: 1, price: 22.5, total: 22.5 });
        laborTotal += 437.5; partsTotal += 22.5;
      } else if (sq.category === "Landing Gear / Brakes") {
        laborLines.push({ id: `l${i}a`, desc: "Brake assembly inspection and troubleshoot", hours: 1.5, rate: 125, total: 187.5 });
        laborLines.push({ id: `l${i}b`, desc: "Brake caliper R&R — " + sq.title.toLowerCase().includes("left") ? "left" : "right" + " main", hours: 2.5, rate: 125, total: 312.5 });
        partsLines.push({ id: `p${i}a`, pn: "BRK-30026-5", desc: "Brake disc — Cleveland", qty: 1, price: 285, total: 285 });
        partsLines.push({ id: `p${i}b`, pn: "BRK-PAD-L5", desc: "Brake pad set — Cleveland", qty: 1, price: 68, total: 68 });
        laborTotal += 500; partsTotal += 353;
      } else if (sq.category === "Fuel System") {
        laborLines.push({ id: `l${i}a`, desc: "Fuel system inspection — cap and seal assembly", hours: 1.0, rate: 125, total: 125 });
        partsLines.push({ id: `p${i}a`, pn: "FUELCAP-OR-6", desc: "Fuel cap O-ring seal kit", qty: 1, price: 18.50, total: 18.50 });
        laborTotal += 125; partsTotal += 18.50;
      } else {
        laborLines.push({ id: `l${i}a`, desc: `Inspect and address — ${sq.title}`, hours: 1.0, rate: 125, total: 125 });
        laborTotal += 125;
      }
    });

    return {
      laborLines,
      partsLines,
      assumptions: "Estimate based on initial inspection. Additional scope billed at T&M with prior customer notification. Does not include logbook entry (billed separately if required).",
      total: laborTotal + partsTotal,
    };
  };

  /* ─── Logbook Next Steps generator ─────────────────────────── */
  const nextStepsList = (lb: { body: string; linkedWO?: string }) => {
    const body = (lb.body || "").toLowerCase();
    const steps: { label: string; required: boolean }[] = [
      { label: "Save signed record to digital logbook", required: true },
      { label: "Send digital copy to aircraft owner", required: false },
      { label: "File copy in aircraft digital records", required: true },
    ];
    if (!lb.linkedWO) {
      steps.push({ label: "Add work performed to invoice", required: false });
    }
    if (body.includes("major") || body.includes("337") || body.includes("alteration")) {
      steps.push({ label: "Submit FAA Form 337 to local FSDO", required: true });
    }
    if (body.includes("annual") || body.includes("100-hour") || body.includes("100 hour")) {
      steps.push({ label: "Record entry in aircraft maintenance records", required: true });
    }
    steps.push({ label: "Attach supporting documents", required: false });
    return steps;
  };

  const toggleNextStep = (entryId: string, idx: number) => {
    setLbNextSteps(prev => {
      const current = prev[entryId] || [];
      const updated = [...current];
      updated[idx] = !updated[idx];
      return { ...prev, [entryId]: updated };
    });
  };

  /* ─── Invoice FAA lookup (custom path) ─────────────────────── */
  const handleInvFaaLookup = async () => {
    const normalized = invFaaTail.toUpperCase().trim();
    setInvFaaStep("searching");
    setInvFaaData(null);
    setInvFaaNotFound(false);
    setInvFaaError(null);
    const result = await lookupAircraftByNNumber(normalized);
    if (result.found) {
      const found = result as FoundFaaResult;
      setInvFaaData(found);
      setNewInvCustomCustomer(found.registrant.name);
      setInvFaaStep("found");
    } else {
      setInvFaaError(result.error ?? null);
      setInvFaaNotFound(!result.error);
      setInvFaaStep("tail");
    }
  };

  /* ─── Invoice AI line-item generation ──────────────────────── */
  const handleGenerateInvoiceLines = async () => {
    setInvGenerating(true);
    await new Promise(r => setTimeout(r, 1800));
    const tail = invFaaData ? invFaaTail.toUpperCase() : newInvCustomAircraft.toUpperCase();
    const matchingSquawks = squawkQueue.filter((s) => s.tail === tail);
    if (matchingSquawks.length > 0) {
      const gen = generateEstimateFromSquawks(matchingSquawks.map(s => s.id));
      setInvLaborLines(gen.laborLines);
      setInvPartsLines(gen.partsLines);
    } else {
      setInvLaborLines([
        { id: "l-gen-1", desc: newInvNotes || "Maintenance services rendered", hours: 2.0, rate: 125, total: 250 },
      ]);
      setInvPartsLines([]);
    }
    setInvGenerating(false);
    setInvGenerated(true);
  };

  /* ─── Reset all invoice modal state ────────────────────────── */
  const resetNewInvoice = () => {
    setShowNewInvoice(false);
    setNewInvType(null);
    setNewInvLinkedWO("");
    setNewInvCustomAircraft("");
    setNewInvCustomCustomer("");
    setNewInvCustomEmail("");
    setNewInvCustomAmount("");
    setNewInvNotes("");
    setInvFaaTail("");
    setInvFaaData(null);
    setInvFaaNotFound(false);
    setInvFaaError(null);
    setInvFaaStep("tail");
    setInvCustomPhone("");
    setInvGenerating(false);
    setInvGenerated(false);
    setInvLaborLines([]);
    setInvPartsLines([]);
  };

  const handleGenerateSquawk = () => {
    if (!sqDescription.trim()) return;
    setSqGenerating(true);
    setTimeout(() => {
      const lower = sqDescription.toLowerCase();
      const category =
        lower.includes("brake") ? "Landing Gear / Brakes" :
        lower.includes("alt") || lower.includes("electric") || lower.includes("light") ? "Avionics / Electrical" :
        lower.includes("fuel") || lower.includes("oil") ? "Fuel System" :
        lower.includes("engine") || lower.includes("prop") ? "Engine / Powerplant" :
        lower.includes("door") || lower.includes("seat") || lower.includes("wind") ? "Cabin / Interior" :
        "General Airframe";
      const severity: "Low" | "Medium" | "High" =
        lower.includes("fail") || lower.includes("smoking") || lower.includes("ground") ? "High" :
        lower.includes("intermit") || lower.includes("flicker") || lower.includes("soft") ? "Medium" : "Low";
      const rawTitle = sqDescription.split(/[.!?]/)[0].replace(/^(i noticed|noticed|pilot reported|reported)\s*/i, "").trim();
      setSqGenerated({
        title: rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1),
        category,
        severity,
      });
      setSqGenerating(false);
    }, 1400);
  };

  const allWOs = workOrders.length > 0 ? workOrders : [];
  const allEstimates = estimates.length > 0 ? estimates : [];

  // ─── Create Work Order handler ───────────────────────────────
  const handleCreateWO = async () => {
    if (!newWOAircraftId || !newWOTitle.trim()) {
      toast.error("Aircraft and title are required");
      return;
    }
    setNewWOSaving(true);
    try {
      const acObj = aircraft.find(a => a.id === newWOAircraftId);
      const squawkNotes = newWOSquawks.length > 0
        ? "Squawks: " + newWOSquawks.map(id => savedSquawks.find(s => s.id === id)?.title || id).join("; ")
        : undefined;
      const res = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aircraft_id: newWOAircraftId,
          complaint: newWOTitle.trim(),
          discrepancy: squawkNotes ?? newWOTitle.trim(),
          status: "open",
          service_type: null,
          internal_notes: newWOSquawks.length > 0 ? squawkNotes : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      const woEntry = {
        id: created.id,
        wo: created.work_order_number,
        tail: acObj?.tail_number ?? "",
        model: [acObj?.make, acObj?.model].filter(Boolean).join(" "),
        customer: "",
        desc: newWOTitle.trim(),
        status: "Open",
        progress: 0,
        mechanic: activeMechanic.name,
        due: "",
      };
      setLiveWOs(prev => [woEntry, ...prev]);
      setSelectedWOId(created.work_order_number);
      setShowNewWOForm(false);
      setNewWOTitle(""); setNewWOAircraftId(""); setNewWOSquawks([]); setNewWOLabor("");
      toast.success(`${created.work_order_number} created`, { description: `${acObj?.tail_number ?? ""} — ${newWOTitle.trim()}` });
    } catch (err) {
      toast.error("Failed to create work order", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setNewWOSaving(false);
    }
  };

  // ─── Logbook search handler ──────────────────────────────────
  const handleLogbookSearch = async () => {
    if (!lbSearchQuery.trim() && !lbSearchAircraftId && lbSearchEntryType === "all") return;
    setLbSearchLoading(true);
    setLbSearchError(null);
    try {
      const params = new URLSearchParams();
      if (lbSearchQuery.trim()) params.set("search", lbSearchQuery.trim());
      if (lbSearchAircraftId) params.set("aircraft_id", lbSearchAircraftId);
      if (lbSearchEntryType !== "all") params.set("entry_type", lbSearchEntryType);
      if (lbSearchDateFrom) params.set("date_from", lbSearchDateFrom);
      if (lbSearchDateTo) params.set("date_to", lbSearchDateTo);
      const res = await fetch(`/api/logbook-entries?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLbSearchResults(data.entries ?? []);
    } catch (err) {
      setLbSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLbSearchLoading(false);
    }
  };

  const handleLogbookAIQuery = async () => {
    if (!lbAIQuery.trim()) return;
    setLbAILoading(true);
    setLbAIAnswer(null);
    try {
      const acTail = aircraft.find(a => a.id === lbSearchAircraftId)?.tail_number;
      const systemPrompt = `You are an aviation logbook assistant. Answer questions about aircraft maintenance history and logbook entries. ${acTail ? `Focus on aircraft ${acTail}.` : ""} Be concise and use proper aviation terminology.`;
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: lbAIQuery.trim(),
          system_prompt_override: systemPrompt,
          aircraft_id: lbSearchAircraftId || undefined,
          context_type: "logbook",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLbAIAnswer(data.answer ?? data.response ?? data.text ?? "No answer returned.");
    } catch (err) {
      setLbAIAnswer("Unable to query the logbook at this time. Try the standard search above.");
    } finally {
      setLbAILoading(false);
    }
  };

  const displayEstimates = allEstimates;
  const filteredEstimates = displayEstimates.filter((e) => {
    const q = estSearch.toLowerCase();
    const matchSearch = !q || e.estimateNumber.toLowerCase().includes(q) || e.aircraft.toLowerCase().includes(q) || e.customer.toLowerCase().includes(q);
    const matchFilter = estFilter === "all" || e.status === estFilter;
    return matchSearch && matchFilter;
  });

  const selectedEst = displayEstimates.find((e) => e.id === selectedEstId) || null;
  // selectedInv is now computed inside renderInvoices() to include savedMechInvoices
  const selectedLB = LOGBOOK_ENTRIES.find((l) => l.id === selectedLBId) || null;

  const toggleSquawk = (id: string) =>
    setSelectedSquawks((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleGenerateEstimate = () => {
    setCreatorStep("generating");
    setTimeout(() => {
      let result: GeneratedEstimate;
      if (selectedSquawks.length > 0) {
        result = generateEstimateFromSquawks(selectedSquawks);
      } else {
        const hoursBase = 2.0 + Math.floor(Math.random() * 3);
        result = {
          laborLines: [
            { id: "l-gen-1", desc: scopeNotes ? scopeNotes.slice(0, 70) + (scopeNotes.length > 70 ? "…" : "") : "Aircraft inspection and maintenance — general scope", hours: hoursBase, rate: 125, total: hoursBase * 125 },
            { id: "l-gen-2", desc: "Troubleshoot, document findings, and return to service", hours: 1.0, rate: 125, total: 125 },
          ],
          partsLines: [],
          assumptions: "Estimate assumes serviceable condition. Significant findings billed at T&M with owner notification prior to proceeding.",
          total: (hoursBase * 125) + 125,
        };
      }
      setGeneratedEst(result);
      setEditLaborLines(result.laborLines.map(l => ({ ...l })));
      setEditPartsLines(result.partsLines.map(p => ({ ...p })));
      setCreatorStep("generated");
    }, 1800);
  };

  const handleGenerateLogbook = () => {
    setLbGenStep("generating");
    setTimeout(() => {
      const woData = selectedWOForLB === "WO-2026-0047"
        ? { aircraft: "N67890", hobbs: "2103.7", tach: "2089.4", scope: "Left main brake assembly removed and inspected. Caliper piston found partially seized. Piston bore cleaned, lubed with approved brake fluid. New brake disc P/N BRK-30026-5 and brake pad set P/N BRK-PAD-L5 installed per Cleveland Service Instructions SI-SB-13. Brake system bled per Piper PA-28 manual procedure, Section 6-22. Proper pedal travel and brake hold verified. Ground roll test performed — normal operation confirmed. No leakage observed." }
        : { aircraft: "N12345", hobbs: "4012.3", tach: "3847.1", scope: "Right nav light intermittent failure diagnosed and repaired. Corroded MS connector at wing root replaced with P/N CON-MS-2712 3-pin weatherproof connector. Wire chafing at wing root grommet addressed — wire re-routed and grommet replaced. Dielectric grease applied to all connections. Nav light function verified normal during ground ops and engine run." };
      setLbDraftText(`Performed maintenance on N67890 on ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} at Hobbs ${woData.hobbs}.\n\n${woData.scope}\n\nAircraft returned to service per FAR 43.9 and 43.11.\nAirworthiness certification: Aircraft airworthy.`);
      setLbGenStep("edit");
    }, 1400);
  };

  const handleSignLogbook = () => {
    setLbSigning(true);
    setTimeout(() => { setLbSigning(false); setLbGenStep("signed"); }, 1200);
  };

  const handleAddEstNote = (estId: string) => {
    if (!newEstNote.trim()) return;
    const noteEntry = {
      id: `note-${Date.now()}`,
      type: "internal",
      actor: activeMechanic.name,
      content: newEstNote.trim(),
      time: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
    };
    setSavedEstNotes((prev) => ({ ...prev, [estId]: [...(prev[estId] || []), noteEntry] }));
    setEstActionState((p) => ({ ...p, [estId]: "noted" }));
    setNewEstNote("");
    toast.success("Internal note saved.");
  };

  // ─── Estimate creator: FAA N-number lookup ───────────────────
  const handleEstLookup = async () => {
    const normalized = estNNumber.toUpperCase().trim();
    if (!normalized) return;
    setCreatorStep("faa-searching");
    setEstFaaError(null);
    const result = await lookupAircraftByNNumber(normalized);
    if (result.found) {
      setEstFaaData(result);
      setEstFaaNotFound(false);
      setEstFaaError(null);
      setEstCustomerName(result.registrant.name);
    } else {
      setEstFaaData(null);
      setEstFaaError(result.error ?? null);
      setEstFaaNotFound(!result.error);
    }
    setCreatorStep("faa-result");
  };

  // ─── New Invoice creation ─────────────────────────────────────
  const WOS_FOR_INV = [
    { wo: "WO-2026-0047", tail: "N67890", model: "Piper PA-28-181", customer: "Horizon Flights Inc.", email: "ops@horizonflights.com", phone: "(512) 555-0289" },
    { wo: "WO-2026-0042", tail: "N12345", model: "Cessna 172S", customer: "John Mitchell", email: "john@mitchellaviation.com", phone: "(512) 555-0147" },
  ];

  const handleCreateInvoice = () => {
    const invNum = `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const dueMs = Date.now() + 15 * 86400000;
    const dueDate = new Date(dueMs).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const issuedDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    let newInv: typeof MECHANIC_INVOICES[number];

    if (newInvType === "wo") {
      const wo = WOS_FOR_INV.find(w => w.wo === newInvLinkedWO)!;
      newInv = {
        id: `inv-new-${Date.now()}`,
        number: invNum,
        aircraft: wo.tail,
        customer: wo.customer,
        company: "",
        amount: 0,
        tax: 0,
        total: 0,
        status: "Draft",
        paymentStatus: "Unpaid",
        issuedDate,
        dueDate,
        daysOut: 0,
        linkedWO: wo.wo,
        email: wo.email,
        phone: wo.phone,
        address: "",
        laborLines: [],
        partsLines: [],
      };
      toast.success(`Invoice ${invNum} created as Draft — linked to ${wo.wo}`, { description: `${wo.tail} · ${wo.customer}` });
    } else {
      const amt = parseFloat(newInvCustomAmount) || 0;
      const tax = parseFloat((amt * 0.075).toFixed(2));
      newInv = {
        id: `inv-new-${Date.now()}`,
        number: invNum,
        aircraft: (invFaaTail || newInvCustomAircraft).toUpperCase() || "N/A",
        customer: newInvCustomCustomer || "Customer",
        company: "",
        amount: amt,
        tax,
        total: amt + tax,
        status: "Draft",
        paymentStatus: "Unpaid",
        issuedDate,
        dueDate,
        daysOut: 0,
        linkedWO: "",
        email: newInvCustomEmail,
        phone: invCustomPhone,
        address: "",
        laborLines: newInvNotes && !invLaborLines.length ? [{ id: `labor-${Date.now()}`, desc: newInvNotes, hours: 0, rate: 0, total: amt }] : [],
        partsLines: [],
      };
      toast.success(`Invoice ${invNum} created as Draft`, { description: `${newInv.aircraft} · ${newInv.customer}` });
    }

    // For WO path: pull real labor/parts lines from existing invoice data
    if (newInvType === "wo" && newInv.laborLines.length === 0) {
      const existingInv = MECHANIC_INVOICES.find(i => i.linkedWO === newInvLinkedWO);
      if (existingInv) {
        newInv.laborLines = [...existingInv.laborLines];
        newInv.partsLines = [...existingInv.partsLines];
        newInv.amount = existingInv.amount;
        newInv.tax = existingInv.tax;
        newInv.total = existingInv.total;
      }
    }
    // For custom path: use AI-generated or user-entered lines
    if (newInvType === "custom" && invLaborLines.length > 0) {
      newInv.laborLines = invLaborLines.map(({ id, desc, hours, rate, total }) => ({ id, desc, hours, rate, total }));
      newInv.partsLines = invPartsLines.map(({ id, pn, desc, qty, price, total }) => ({ id, pn, desc, qty, price, total }));
      const labor = invLaborLines.reduce((s, l) => s + l.total, 0);
      const parts = invPartsLines.reduce((s, p) => s + p.total, 0);
      const subtotal = labor + parts;
      const tax = parseFloat((subtotal * 0.075).toFixed(2));
      newInv.amount = subtotal;
      newInv.tax = tax;
      newInv.total = subtotal + tax;
    }

    setSavedMechInvoices((prev) => [newInv, ...prev]);
    setSelectedInvId(newInv.id);
    resetNewInvoice();
  };

  const handleSaveSquawk = () => {
    if (!sqDescription.trim()) return;
    const ac = ASSIGNED_AIRCRAFT.find((a) => a.tail === sqAircraft);
    const finalTitle = sqTitleEdited || (sqGenerated?.title ?? sqDescription.split(/[.!?]/)[0].slice(0, 60));
    const finalCategory = sqGenerated?.category ?? "General Airframe";
    const finalSeverity = (sqGenerated?.severity ?? "Medium") as "Low" | "Medium" | "High";
    const newSq = {
      id: `sq-new-${Date.now()}`,
      tail: sqAircraft,
      model: ac?.model ?? sqAircraft,
      customer: ac?.customer ?? "Unknown Customer",
      title: finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1),
      desc: sqDescription.trim(),
      category: finalCategory,
      severity: finalSeverity,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      status: "Open" as const,
      grounded: sqGrounded,
    };
    setSavedSquawks((prev) => [newSq, ...prev]);
    setShowAddSquawk(false);
    setSqDescription("");
    setSqGenerated(null);
    setSqTitleEdited("");
    setSqGrounded(false);
    setSqGenerating(false);
    toast.success(`Squawk saved — ${newSq.title}${sqGrounded ? " · Aircraft grounded" : ""}`, {
      description: `${sqAircraft} · ${finalCategory} · ${finalSeverity}`,
    });
  };

  /* ─── Section renders ─────────────────────────────────────────── */

  function renderDashboard() {
    return <MechanicDashboardTab />;
  }

  function renderAircraft() {
    const ac = selectedAircraft ? ASSIGNED_AIRCRAFT.find((a) => a.tail === selectedAircraft) : null;
    return (
      <div className="flex-1 flex min-h-0">
        {/* Aircraft list */}
        <div className={`${ac ? "w-[280px]" : "flex-1 max-w-2xl mx-auto"} shrink-0 border-r border-border flex flex-col bg-white`}>
          <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>My Aircraft ({ASSIGNED_AIRCRAFT.length})</h2>
              <p className="text-[12px] text-muted-foreground">Assigned fleet</p>
            </div>
            <button onClick={() => setShowAddAircraft(true)} className="flex items-center gap-1.5 text-[12px] text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
              <Plus className="w-3.5 h-3.5" /> Add Aircraft
            </button>
          </div>
          <div className="flex-1 overflow-auto divide-y divide-border">
            {ASSIGNED_AIRCRAFT.map((a) => (
              <button key={a.tail} onClick={() => setSelectedAircraft(a.tail === selectedAircraft ? null : a.tail)}
                className={`w-full p-4 text-left hover:bg-muted/20 transition-colors ${selectedAircraft === a.tail ? "bg-primary/5 border-l-2 border-primary" : ""}`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{a.tail}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${a.status === "Airworthy" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} style={{ fontWeight: 600 }}>{a.status}</span>
                </div>
                <div className="text-[12px] text-muted-foreground truncate">{a.model}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{a.customer}</div>
                <div className="flex gap-3 mt-2 text-[11px]">
                  {a.openSquawks > 0 && <span className="text-amber-600">{a.openSquawks} squawk{a.openSquawks > 1 ? "s" : ""}</span>}
                  {a.activeWOs > 0 && <span className="text-blue-600">{a.activeWOs} WO active</span>}
                  <span className="text-muted-foreground">Last: {a.lastService}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Aircraft cockpit detail */}
        {ac && (
          <div className="flex-1 overflow-auto bg-[#F7F8FA]">
            <div className="p-5 space-y-4">
              {/* Header */}
              <div className="bg-white rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#0A1628] flex items-center justify-center">
                      <Plane className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[20px] text-foreground" style={{ fontWeight: 700 }}>{ac.tail}</span>
                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${ac.status === "Airworthy" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} style={{ fontWeight: 600 }}>{ac.status}</span>
                      </div>
                      <div className="text-[13px] text-muted-foreground">{ac.model} &middot; {ac.customer}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setSection("squawks"); }} className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <AlertTriangle className="w-3.5 h-3.5" /> Squawks
                    </button>
                    <button onClick={() => { setSelectedSquawks(squawkQueue.filter((s) => s.tail === ac.tail).map((s) => s.id)); setShowEstCreator(true); }}
                      className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                      <Plus className="w-3.5 h-3.5" /> Create Estimate
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-4 pt-4 border-t border-border">
                  {[
                    { label: "Hobbs", value: ac.hobbs.toFixed(1) + " hrs" },
                    { label: "Tach", value: ac.tach.toFixed(1) + " hrs" },
                    { label: "Open Squawks", value: ac.openSquawks },
                    { label: "Active WOs", value: ac.activeWOs },
                    { label: "Last Service", value: ac.lastService },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>{s.label}</div>
                      <div className="text-[13px] text-foreground mt-0.5" style={{ fontWeight: 600 }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Open squawks */}
                <div className="bg-white rounded-xl border border-border">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Open Squawks</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {squawkQueue.filter((s) => s.tail === ac.tail).map((sq) => (
                      <div key={sq.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{sq.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${sevColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{sq.category} &middot; {sq.date}</div>
                      </div>
                    ))}
                    {squawkQueue.filter((s) => s.tail === ac.tail).length === 0 && (
                      <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">No open squawks</div>
                    )}
                  </div>
                </div>

                {/* Maintenance reminders */}
                <div className="bg-white rounded-xl border border-border">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Service Reminders</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {ac.tail === "N12345" && [
                      { title: "AD 2025-03-02 Compliance", due: "6 days", status: "Critical" },
                      { title: "Annual Inspection", due: "40 days", status: "Upcoming" },
                      { title: "Oil Change (50hr interval)", due: "37.7 Hobbs hrs", status: "Upcoming" },
                    ].map((r) => (
                      <div key={r.title} className="px-4 py-3 flex items-center justify-between">
                        <span className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{r.title}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.status === "Critical" ? "bg-orange-50 text-orange-700" : "bg-amber-50 text-amber-600"}`} style={{ fontWeight: 500 }}>{r.due}</span>
                      </div>
                    ))}
                    {ac.tail === "N67890" && [
                      { title: "AD 2024-15-06 Fuel Line", due: "3 days", status: "Critical" },
                      { title: "100-Hr Charter Inspection", due: "46.3 hrs", status: "Upcoming" },
                    ].map((r) => (
                      <div key={r.title} className="px-4 py-3 flex items-center justify-between">
                        <span className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{r.title}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-700" style={{ fontWeight: 500 }}>{r.due}</span>
                      </div>
                    ))}
                    {ac.tail === "N24680" && [
                      { title: "Annual Inspection", due: "53 days", status: "Upcoming" },
                    ].map((r) => (
                      <div key={r.title} className="px-4 py-3 flex items-center justify-between">
                        <span className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{r.title}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600" style={{ fontWeight: 500 }}>{r.due}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Customer info */}
              <div className="bg-white rounded-xl border border-border p-4">
                <h3 className="text-[13px] text-foreground mb-3" style={{ fontWeight: 600 }}>Owner / Customer</h3>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{ac.customer}</div>
                    {ac.company && <div className="text-[11px] text-muted-foreground">{ac.company}</div>}
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button className="flex items-center gap-1 text-[12px] text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
                      <Mail className="w-3 h-3" /> Email
                    </button>
                    <button className="flex items-center gap-1 text-[12px] text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <Phone className="w-3 h-3" /> Call
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {!ac && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Plane className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <div className="text-[14px]" style={{ fontWeight: 500 }}>Select an aircraft to view its cockpit</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderSquawks() {
    // Merge static seed squawks with mechanic-added ones
    const allSquawks = squawkQueue;
    const allCustomers = [...new Set(allSquawks.map((s) => s.customer))];
    const filteredAllSquawks = allSquawks.filter((s) => sqCustomerFilter === "all" || s.customer === sqCustomerFilter);
    const squawkTails = [...new Set(filteredAllSquawks.map((s) => s.tail))];

    // Estimate creator computed values (used in form step)
    const estTail = selectedSquawks.length > 0
      ? (squawkQueue.find((s) => selectedSquawks.includes(s.id))?.tail || estNNumber)
      : estNNumber;
    const estCustomerDisplay = selectedSquawks.length > 0
      ? (squawkQueue.find((s) => selectedSquawks.includes(s.id))?.customer || estCustomerName)
      : estCustomerName;
    const estAircraftSquawks = squawkQueue.filter((s) => s.tail === estTail);

    return (
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Squawk command bar */}
        <div className="shrink-0 px-5 py-3.5 bg-white border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Squawk Queue</h2>
            <p className="text-[12px] text-muted-foreground">{allSquawks.length} open across {[...new Set(allSquawks.map((s) => s.tail))].length} aircraft</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Customer filter dropdown */}
            <select
              value={sqCustomerFilter}
              onChange={(e) => setSqCustomerFilter(e.target.value)}
              className="text-[12px] border border-border rounded-lg px-2.5 py-1.5 outline-none bg-white text-foreground cursor-pointer hover:border-primary/30 transition-colors"
            >
              <option value="all">All Customers</option>
              {allCustomers.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {selectedSquawks.length > 0 && (
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
                <span className="text-[12px] text-primary bg-primary/8 px-3 py-1.5 rounded-lg" style={{ fontWeight: 600 }}>
                  {selectedSquawks.length} selected
                </span>
                <button onClick={() => setShowEstCreator(true)}
                  className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                  <Sparkles className="w-3.5 h-3.5" /> Create Estimate
                </button>
                <button onClick={() => setSelectedSquawks([])} className="p-2 hover:bg-muted rounded-lg transition-colors">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </motion.div>
            )}
            <button onClick={() => setShowAddSquawk(true)}
              className="flex items-center gap-1.5 bg-[#0A1628] text-white px-3 py-2 rounded-lg text-[12px] hover:bg-[#0A1628]/90 transition-colors" style={{ fontWeight: 500 }}>
              <Plus className="w-3.5 h-3.5" /> Add Squawk
            </button>
          </div>
        </div>

        {/* Add Squawk Modal */}
        <AnimatePresence>
          {showAddSquawk && (
            <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden mx-4">
                <div className="bg-[#0A1628] px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>Add Squawk — AI Assisted</div>
                      <div className="text-white/50 text-[12px]">Describe in plain English. AI will structure it.</div>
                    </div>
                  </div>
                  <button onClick={() => { setShowAddSquawk(false); setSqDescription(""); setSqGenerated(null); setSqGenerating(false); setSqTitleEdited(""); }}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-white/70" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  {/* Aircraft picker */}
                  <div>
                    <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Aircraft</label>
                    <select value={sqAircraft} onChange={(e) => setSqAircraft(e.target.value)}
                      className="w-full border border-border rounded-xl px-4 py-2.5 text-[13px] outline-none bg-white focus:ring-2 focus:ring-primary/20">
                      {ASSIGNED_AIRCRAFT.map((a) => (
                        <option key={a.tail} value={a.tail}>{a.tail} — {a.model.split(" ").slice(0, 2).join(" ")} · {a.customer}</option>
                      ))}
                    </select>
                  </div>

                  {/* Description input */}
                  <div>
                    <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Describe the issue</label>
                    <textarea value={sqDescription} onChange={(e) => { setSqDescription(e.target.value); setSqGenerated(null); }}
                      rows={4} placeholder='e.g. "Left brake feels soft on landing, noticed slight drag during taxi rollout. Uploaded photo of caliper area."'
                      className="w-full border border-border rounded-xl px-4 py-3 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20 leading-relaxed" />
                    <div className="flex items-center gap-2 mt-1.5">
                      <button className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-lg transition-colors" style={{ fontWeight: 500 }}>
                        <Mic className="w-3.5 h-3.5" /> Dictate
                      </button>
                      <button className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-lg transition-colors" style={{ fontWeight: 500 }}>
                        <Camera className="w-3.5 h-3.5" /> Photo
                      </button>
                      <label className="flex items-center gap-2 ml-auto cursor-pointer">
                        <div className={`w-9 h-5 rounded-full relative transition-colors ${sqGrounded ? "bg-red-500" : "bg-muted"}`} onClick={() => setSqGrounded(!sqGrounded)}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${sqGrounded ? "left-4" : "left-0.5"}`} />
                        </div>
                        <span className={`text-[12px] ${sqGrounded ? "text-red-600" : "text-muted-foreground"}`} style={{ fontWeight: sqGrounded ? 600 : 400 }}>
                          {sqGrounded ? "⚠ Aircraft Grounded" : "Not grounded"}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* AI result */}
                  <AnimatePresence>
                    {sqGenerating && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 bg-primary/5 border border-primary/15 rounded-xl p-4">
                        <Bot className="w-5 h-5 text-primary animate-pulse" />
                        <span className="text-[13px] text-muted-foreground">AI is structuring your squawk...</span>
                      </motion.div>
                    )}
                    {sqGenerated && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <span className="text-[12px] text-emerald-800" style={{ fontWeight: 700 }}>AI structured squawk — review and confirm</span>
                        </div>
                        <div>
                          <div className="text-[11px] text-emerald-700 mb-1 uppercase tracking-wide" style={{ fontWeight: 600 }}>Title</div>
                          <input
                             value={sqTitleEdited || sqGenerated.title}
                             onChange={(e) => setSqTitleEdited(e.target.value)}
                             className="w-full border border-emerald-200 bg-white rounded-lg px-3 py-2 text-[13px] outline-none" style={{ fontWeight: 500 }} />
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <div className="text-[11px] text-emerald-700 mb-1 uppercase tracking-wide" style={{ fontWeight: 600 }}>Category</div>
                            <div className="border border-emerald-200 bg-white rounded-lg px-3 py-2 text-[12px] text-foreground">{sqGenerated.category}</div>
                          </div>
                          <div>
                            <div className="text-[11px] text-emerald-700 mb-1 uppercase tracking-wide" style={{ fontWeight: 600 }}>Severity</div>
                            <div className={`rounded-lg px-3 py-2 text-[12px] ${sevColor(sqGenerated.severity as any)}`} style={{ fontWeight: 600 }}>{sqGenerated.severity}</div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="px-6 pb-5 flex items-center justify-between border-t border-border pt-4">
                  <button onClick={() => { setShowAddSquawk(false); setSqDescription(""); setSqGenerated(null); setSqTitleEdited(""); setSqGenerating(false); }}
                    className="px-4 py-2 rounded-xl border border-border text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                    Cancel
                  </button>
                  <div className="flex items-center gap-2">
                    {!sqGenerated && (
                      <button onClick={handleGenerateSquawk} disabled={!sqDescription.trim() || sqGenerating}
                        className="flex items-center gap-1.5 border border-primary text-primary px-4 py-2 rounded-xl text-[13px] hover:bg-primary/5 disabled:opacity-40 transition-colors" style={{ fontWeight: 500 }}>
                        <Sparkles className="w-3.5 h-3.5" /> AI Structure
                      </button>
                    )}
                    <button onClick={handleSaveSquawk}
                      disabled={!sqDescription.trim()}
                      className="flex items-center gap-1.5 bg-primary text-white px-5 py-2 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
                      <CheckCircle className="w-4 h-4" /> Save Squawk
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {/* Group by aircraft */}
          {squawkTails.map((tail) => {
            const aSquawks = filteredAllSquawks.filter((s) => s.tail === tail);
            const ac = ASSIGNED_AIRCRAFT.find((a) => a.tail === tail);
            return (
              <div key={tail}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[12px] text-foreground" style={{ fontWeight: 700 }}>{tail}</span>
                  <span className="text-[11px] text-muted-foreground">{ac?.model} &middot; {ac?.customer}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2">
                  {aSquawks.map((sq) => (
                    <div key={sq.id} className={`bg-white rounded-xl border transition-all p-4 ${selectedSquawks.includes(sq.id) ? "border-primary/40 shadow-sm shadow-primary/10" : "border-border"}`}>
                      <div className="flex items-start gap-3">
                        <button onClick={() => toggleSquawk(sq.id)} className="mt-0.5 shrink-0">
                          {selectedSquawks.includes(sq.id)
                            ? <CheckSquare className="w-4 h-4 text-primary" />
                            : <Square className="w-4 h-4 text-muted-foreground/40" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{sq.title}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${sevColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>{sq.category}</span>
                          </div>
                          <p className="text-[12px] text-muted-foreground mb-2 leading-relaxed">{sq.desc}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">{sq.date} &middot; {sq.customer}</span>
                            <div className="flex items-center gap-2">
                              <button className="text-[12px] text-muted-foreground hover:text-foreground" style={{ fontWeight: 500 }}>Resolve</button>
                              <button onClick={() => { setSelectedSquawks([sq.id]); setShowEstCreator(true); }}
                                className="text-[12px] text-primary hover:text-primary/80 flex items-center gap-0.5" style={{ fontWeight: 500 }}>
                                <FileText className="w-3 h-3" /> Create Estimate
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Estimate creator overlay */}
        <AnimatePresence>
          {showEstCreator && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 z-20 flex items-center justify-end">
              <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-[680px] h-full bg-white flex flex-col">
                <div className="bg-[#0A1628] px-5 py-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-white" />
                    <div>
                      <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>AI Estimate Creator</div>
                      <div className="text-white/50 text-[12px]">{selectedSquawks.length} squawk{selectedSquawks.length !== 1 ? "s" : ""} selected</div>
                    </div>
                  </div>
                  <button onClick={() => { setShowEstCreator(false); setCreatorStep("form"); setGeneratedEst(null); setScopeNotes(""); setEstNNumber(""); setEstFaaData(null); setEstFaaNotFound(false); setEstCustomerName(""); setEstCustomerEmail(""); setEstCustomerPhone(""); setEstCustomerNotes(""); setEditLaborLines([]); setEditPartsLines([]); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-white/70" />
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-5 space-y-4">

                  {/* ── Step: N-Number Lookup ── */}
                  {creatorStep === "tail" && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-[15px] text-foreground mb-1" style={{ fontWeight: 700 }}>Aircraft N-Number</h3>
                        <p className="text-[12px] text-muted-foreground">Enter the aircraft tail number to look up FAA records and auto-fill owner information.</p>
                      </div>
                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>N-Number <span className="text-red-500">*</span></label>
                        <input
                          value={estNNumber}
                          onChange={(e) => { setEstNNumber(e.target.value.toUpperCase()); setEstFaaNotFound(false); setEstFaaError(null); }}
                          onKeyDown={(e) => e.key === "Enter" && handleEstLookup()}
                          placeholder="e.g. N45678"
                          className="w-full border border-border rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 tracking-widest"
                          style={{ fontWeight: 600 }}
                          autoFocus
                        />
                        <p className="text-[11px] text-muted-foreground mt-1.5">Try: N45678, N55200, N88321, N12345, N67890</p>
                      </div>
                      <button onClick={handleEstLookup} disabled={!estNNumber.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
                        <Search className="w-3.5 h-3.5" /> Look Up in FAA Registry
                      </button>
                    </div>
                  )}

                  {/* ── Step: FAA Searching ── */}
                  {creatorStep === "faa-searching" && (
                    <div className="flex flex-col items-center py-12 gap-4">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="w-7 h-7 text-primary animate-pulse" />
                      </div>
                      <div className="text-[14px] text-foreground text-center" style={{ fontWeight: 600 }}>Searching FAA Registry…</div>
                      <p className="text-[12px] text-muted-foreground text-center">Looking up {estNNumber}…</p>
                    </div>
                  )}

                  {/* ── Step: FAA Result ── */}
                  {creatorStep === "faa-result" && (
                    <div className="space-y-4">
                      {estFaaNotFound ? (
                        <div className="flex flex-col items-center py-8 gap-3 text-center">
                          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                          </div>
                          <div>
                            <p className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                              {isFaaTemporarilyUnavailable(estFaaError) ? "FAA registry temporarily unavailable" : "Not found in FAA Registry"}
                            </p>
                            <p className="text-[12px] text-muted-foreground mt-1">
                              {isFaaTemporarilyUnavailable(estFaaError)
                                ? `The FAA registry did not respond cleanly for ${estNNumber}. You can retry, or continue and enter customer details manually.`
                                : `No active registration for ${estNNumber}. Verify the N-number or enter details manually.`}
                            </p>
                          </div>
                          <button onClick={() => setCreatorStep("tail")} className="border border-border px-5 py-2 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>← Try Again</button>
                        </div>
                      ) : estFaaData && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="text-[12px] text-emerald-800" style={{ fontWeight: 600 }}>FAA registry match — {estNNumber}</span>
                          </div>
                          <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 space-y-2">
                            <div className="flex items-center gap-2.5 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-[#0A1628] flex items-center justify-center shrink-0">
                                <Plane className="w-4.5 h-4.5 text-white" />
                              </div>
                              <div>
                                <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{estNNumber}</div>
                                <div className="text-[12px] text-muted-foreground">{estFaaData.aircraft.year} {estFaaData.aircraft.manufacturer} {estFaaData.aircraft.model}</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                              <div><span className="text-muted-foreground">Registrant</span><div className="text-foreground mt-0.5" style={{ fontWeight: 600 }}>{estFaaData.registrant.name}</div></div>
                              <div><span className="text-muted-foreground">Location</span><div className="text-foreground mt-0.5" style={{ fontWeight: 600 }}>{formatRegistrantLocation(estFaaData.registrant)}</div></div>
                            </div>
                          </div>

                          {/* Active customer section */}
                          <div>
                            <div className="text-[12px] text-foreground mb-2 uppercase tracking-wider" style={{ fontWeight: 700 }}>Active Customer</div>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Customer Name</label>
                                <input value={estCustomerName} onChange={(e) => setEstCustomerName(e.target.value)}
                                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                              </div>
                              <div>
                                <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Email</label>
                                <input value={estCustomerEmail} onChange={(e) => setEstCustomerEmail(e.target.value)}
                                  type="email" placeholder="customer@email.com"
                                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                              </div>
                              <div>
                                <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Phone</label>
                                <input value={estCustomerPhone} onChange={(e) => setEstCustomerPhone(e.target.value)}
                                  type="tel" placeholder="(512) 555-0000"
                                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Notes (optional)</label>
                              <textarea value={estCustomerNotes} onChange={(e) => setEstCustomerNotes(e.target.value)}
                                rows={2} placeholder="Any notes about this customer or aircraft..."
                                className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                            </div>
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button onClick={() => setCreatorStep("tail")} className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Back</button>
                            <button onClick={() => setCreatorStep("form")}
                              className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                              Continue to Estimate <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected squawks context */}
                  {creatorStep !== "tail" && creatorStep !== "faa-searching" && creatorStep !== "faa-result" && selectedSquawks.length > 0 && (
                    <div>
                      <div className="text-[12px] text-muted-foreground mb-2 uppercase tracking-wider" style={{ fontWeight: 600 }}>Source Squawks</div>
                      <div className="space-y-2">
                        {squawkQueue.filter((s) => selectedSquawks.includes(s.id)).map((sq) => (
                          <div key={sq.id} className="bg-[#F7F8FA] rounded-lg p-3 border border-border">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{sq.title}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${sevColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                            </div>
                            <div className="text-[12px] text-muted-foreground">{sq.tail} &middot; {sq.category} &middot; {sq.date}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {creatorStep === "form" && (
                    <>
                      {/* Aircraft + customer header */}
                      <div className="bg-[#F7F8FA] rounded-xl border border-border p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-lg bg-[#0A1628] flex items-center justify-center shrink-0">
                            <Plane className="w-4.5 h-4.5 text-white" />
                          </div>
                          <div>
                            <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{estTail || "—"}</div>
                            <div className="text-[12px] text-muted-foreground">{estCustomerDisplay || "Unknown customer"}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-[12px]">
                          <div><span className="text-muted-foreground">Email</span><div className="text-foreground mt-0.5 truncate" style={{ fontWeight: 500 }}>{estCustomerEmail || "—"}</div></div>
                          <div><span className="text-muted-foreground">Phone</span><div className="text-foreground mt-0.5" style={{ fontWeight: 500 }}>{estCustomerPhone || "—"}</div></div>
                          <div><span className="text-muted-foreground">Notes</span><div className="text-foreground mt-0.5 truncate" style={{ fontWeight: 500 }}>{estCustomerNotes || "—"}</div></div>
                        </div>
                      </div>

                      {/* Squawk selection */}
                      {estAircraftSquawks.length > 0 && (
                        <div>
                          <div className="text-[12px] text-foreground mb-2" style={{ fontWeight: 600 }}>
                            Open Squawks on {estTail}
                            <span className="ml-2 text-[11px] text-muted-foreground" style={{ fontWeight: 400 }}>Check all that apply to this estimate</span>
                          </div>
                          <div className="space-y-2">
                            {estAircraftSquawks.map((sq) => (
                              <label key={sq.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-white hover:border-primary/30 hover:bg-primary/3 transition-all cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedSquawks.includes(sq.id)}
                                  onChange={() => toggleSquawk(sq.id)}
                                  className="mt-0.5 w-4 h-4 accent-primary"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{sq.title}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sevColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">{sq.category} · {sq.date}</div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Scope input */}
                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Additional Scope Notes (optional)</label>
                        <textarea
                          value={scopeNotes}
                          onChange={(e) => setScopeNotes(e.target.value)}
                          className="w-full border border-border rounded-xl px-4 py-3 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                          rows={4}
                          placeholder='Describe any additional scope in plain English, e.g. "Include 100-hour inspection items while aircraft is open. Check magnetos while cowling is off."'
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <button className="flex items-center gap-1.5 text-[12px] text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                            <Mic className="w-3.5 h-3.5" /> Dictate
                          </button>
                        </div>
                      </div>

                      {/* Labor rate */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Labor Rate</label>
                          <div className="flex items-center border border-border rounded-lg overflow-hidden">
                            <span className="px-3 text-[13px] text-muted-foreground bg-muted/30 border-r border-border py-2">$</span>
                            <input type="number" defaultValue="125" className="flex-1 px-3 py-2 text-[13px] outline-none" />
                            <span className="px-3 text-[13px] text-muted-foreground">/hr</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Valid For</label>
                          <select className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none bg-white">
                            <option>30 days</option>
                            <option>60 days</option>
                            <option>90 days</option>
                          </select>
                        </div>
                      </div>

                      <button onClick={handleGenerateEstimate}
                        className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3.5 rounded-xl text-[14px] hover:bg-primary/90 transition-colors"
                        style={{ fontWeight: 600 }}>
                        <Sparkles className="w-4 h-4" /> Generate Estimate with AI
                      </button>
                    </>
                  )}

                  {creatorStep === "generating" && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Bot className="w-7 h-7 text-primary animate-pulse" />
                      </div>
                      <div className="text-[14px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Generating estimate...</div>
                      <p className="text-[12px] text-muted-foreground text-center max-w-xs">AI is reading squawk descriptions, categorizing scope, and building your labor and parts line items.</p>
                      <div className="mt-4 flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {creatorStep === "generated" && generatedEst && (() => {
                    const laborTotal = editLaborLines.reduce((s, l) => s + l.total, 0);
                    const partsTotal = editPartsLines.reduce((s, p) => s + p.total, 0);
                    const grandTotal = laborTotal + partsTotal;
                    return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        <span className="text-[12px]" style={{ fontWeight: 600 }}>Estimate generated — all fields are editable. Review before sending.</span>
                      </div>

                      {/* Editable Labor lines */}
                      <div>
                        <div className="text-[12px] text-foreground mb-2 flex items-center justify-between" style={{ fontWeight: 600 }}>
                          Labor Lines
                          <button onClick={() => setEditLaborLines(prev => [...prev, { id: `l-new-${Date.now()}`, desc: "Additional labor", hours: 1.0, rate: 125, total: 125 }])}
                            className="text-primary text-[11px] flex items-center gap-1" style={{ fontWeight: 500 }}>
                            <Plus className="w-3 h-3" /> Add line
                          </button>
                        </div>
                        <div className="border border-border rounded-xl overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead className="bg-muted/30">
                              <tr>
                                <th className="text-left px-2.5 py-2 text-muted-foreground" style={{ fontWeight: 600 }}>Description</th>
                                <th className="text-right px-2 py-2 text-muted-foreground w-14" style={{ fontWeight: 600 }}>Hrs</th>
                                <th className="text-right px-2 py-2 text-muted-foreground w-14" style={{ fontWeight: 600 }}>Rate</th>
                                <th className="text-right px-2 py-2 text-muted-foreground w-18" style={{ fontWeight: 600 }}>Total</th>
                                <th className="w-6" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {editLaborLines.map((l, i) => (
                                <tr key={l.id} className="hover:bg-muted/5">
                                  <td className="px-2.5 py-1.5">
                                    <input value={l.desc} onChange={e => setEditLaborLines(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
                                      className="w-full text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input type="number" value={l.hours} step="0.5"
                                      onChange={e => { const h = parseFloat(e.target.value) || 0; setEditLaborLines(prev => prev.map((x, j) => j === i ? { ...x, hours: h, total: h * x.rate } : x)); }}
                                      className="w-full text-right text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input type="number" value={l.rate}
                                      onChange={e => { const r = parseFloat(e.target.value) || 0; setEditLaborLines(prev => prev.map((x, j) => j === i ? { ...x, rate: r, total: x.hours * r } : x)); }}
                                      className="w-full text-right text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-foreground" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</td>
                                  <td className="pr-2 py-1.5">
                                    <button onClick={() => setEditLaborLines(prev => prev.filter((_, j) => j !== i))}
                                      className="text-muted-foreground hover:text-red-500 transition-colors">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Editable Parts lines */}
                      <div>
                        <div className="text-[12px] text-foreground mb-2 flex items-center justify-between" style={{ fontWeight: 600 }}>
                          Parts & Materials
                          <button onClick={() => setEditPartsLines(prev => [...prev, { id: `p-new-${Date.now()}`, pn: "", desc: "Part", qty: 1, price: 0, total: 0 }])}
                            className="text-primary text-[11px] flex items-center gap-1" style={{ fontWeight: 500 }}>
                            <Plus className="w-3 h-3" /> Add part
                          </button>
                        </div>
                        {editPartsLines.length === 0 ? (
                          <div className="border border-dashed border-border rounded-xl p-4 text-center text-[12px] text-muted-foreground">
                            No parts added. Click "+ Add part" to include parts.
                          </div>
                        ) : (
                          <div className="border border-border rounded-xl overflow-hidden">
                            <table className="w-full text-[12px]">
                              <thead className="bg-muted/30">
                                <tr>
                                  <th className="text-left px-2.5 py-2 text-muted-foreground" style={{ fontWeight: 600 }}>Part / Description</th>
                                  <th className="text-left px-2 py-2 text-muted-foreground w-20" style={{ fontWeight: 600 }}>P/N</th>
                                  <th className="text-right px-2 py-2 text-muted-foreground w-12" style={{ fontWeight: 600 }}>Qty</th>
                                  <th className="text-right px-2 py-2 text-muted-foreground w-18" style={{ fontWeight: 600 }}>Total</th>
                                  <th className="w-6" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {editPartsLines.map((p, i) => (
                                  <tr key={p.id} className="hover:bg-muted/5">
                                    <td className="px-2.5 py-1.5">
                                      <input value={p.desc} onChange={e => setEditPartsLines(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
                                        className="w-full text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input value={p.pn} onChange={e => setEditPartsLines(prev => prev.map((x, j) => j === i ? { ...x, pn: e.target.value } : x))}
                                        className="w-full text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[11px] py-0.5" />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="number" value={p.qty}
                                        onChange={e => { const q = parseInt(e.target.value) || 1; setEditPartsLines(prev => prev.map((x, j) => j === i ? { ...x, qty: q, total: q * x.price } : x)); }}
                                        className="w-full text-right text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="number" value={p.total}
                                        onChange={e => { const t = parseFloat(e.target.value) || 0; setEditPartsLines(prev => prev.map((x, j) => j === i ? { ...x, total: t, price: x.qty > 0 ? t / x.qty : 0 } : x)); }}
                                        className="w-full text-right text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" style={{ fontWeight: 600 }} />
                                    </td>
                                    <td className="pr-2 py-1.5">
                                      <button onClick={() => setEditPartsLines(prev => prev.filter((_, j) => j !== i))}
                                        className="text-muted-foreground hover:text-red-500 transition-colors">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Assumptions */}
                      <div>
                        <div className="text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Assumptions / Notes</div>
                        <textarea defaultValue={generatedEst.assumptions} className="w-full border border-border rounded-xl px-4 py-3 text-[12px] outline-none resize-none text-muted-foreground focus:ring-2 focus:ring-primary/20" rows={3} />
                      </div>

                      {/* Totals */}
                      <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 space-y-1.5">
                        <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Labor</span><span className="text-foreground" style={{ fontWeight: 500 }}>${laborTotal.toFixed(2)}</span></div>
                        <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Parts & Materials</span><span className="text-foreground" style={{ fontWeight: 500 }}>${partsTotal.toFixed(2)}</span></div>
                        <div className="flex justify-between border-t border-border pt-2 mt-1">
                          <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>Estimate Total</span>
                          <span className="text-[20px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>${grandTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    );
                  })()}
                </div>

                {/* Footer */}
                {(creatorStep === "form" || creatorStep === "generated") && (() => {
                  const srcSq = squawkQueue.find((s) => selectedSquawks.includes(s.id));
                  const tail = srcSq?.tail || estNNumber || "";
                  const customer = srcSq?.customer || estCustomerName || "";
                  const closeCreator = () => {
                    setShowEstCreator(false); setCreatorStep("tail"); setGeneratedEst(null); setScopeNotes("");
                    setEstNNumber(""); setEstFaaData(null); setEstFaaNotFound(false);
                    setEstCustomerName(""); setEstCustomerEmail(""); setEstCustomerPhone(""); setEstCustomerNotes("");
                    setEditLaborLines([]); setEditPartsLines([]);
                  };
                  const persistEst = (status: "Draft" | "Sent") => {
                    const laborTotal = editLaborLines.reduce((s, l) => s + l.total, 0);
                    const partsTotal = editPartsLines.reduce((s, p) => s + p.total, 0);
                    const estNum = `EST-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
                    const saved = addEstimate({
                      estimateNumber: estNum, aircraft: tail, makeModel: "", customer,
                      mechanic: activeMechanic.name, status,
                      laborLines: editLaborLines, partsLines: editPartsLines,
                      outsideServices: [], assumptions: generatedEst?.assumptions || "",
                      internalNotes: scopeNotes, customerNotes: estCustomerNotes,
                      subtotalLabor: laborTotal, subtotalParts: partsTotal,
                      subtotalOutside: 0, total: laborTotal + partsTotal,
                    }, {
                      onPersisted: (persistedEstimate) => {
                        setSelectedEstId(persistedEstimate.id);
                      },
                    });
                    setSelectedEstId(saved.id); setSection("estimates");
                    closeCreator();
                    toast.success(status === "Draft" ? `Draft ${estNum} saved.` : `Estimate ${estNum} sent to ${customer || "customer"}.`, {
                      description: status === "Sent" ? `Email sent to ${estCustomerEmail || customer}` : undefined,
                    });
                  };
                  return (
                  <div className="shrink-0 px-5 py-4 border-t border-border bg-white flex items-center justify-between">
                    <button onClick={() => {
                        if (creatorStep === "generated") { setCreatorStep("form"); setGeneratedEst(null); setEditLaborLines([]); setEditPartsLines([]); }
                        else { closeCreator(); }
                      }}
                      className="text-[12px] text-muted-foreground hover:text-foreground transition-colors" style={{ fontWeight: 500 }}>
                      {creatorStep === "generated" ? "← Regenerate" : "Cancel"}
                    </button>
                    {creatorStep === "generated" && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => persistEst("Draft")}
                          className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                          <Download className="w-3.5 h-3.5" /> Save Draft
                        </button>
                        <button onClick={() => {
                            toast.info("PDF export in progress…", { description: `${tail} · ${customer}` });
                          }}
                          className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                        <button onClick={() => persistEst("Sent")}
                          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                          <Send className="w-3.5 h-3.5" /> Send to Customer
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  function renderEstimates() {
    const seedThread = EST_THREADS[selectedEstId || ""] || [];
    const thread = [...seedThread, ...(savedEstNotes[selectedEstId || ""] || [])];

    // Estimate creator computed values (mirrors renderSquawks — needed by overlay)
    const estTail = selectedSquawks.length > 0
      ? (squawkQueue.find((s) => selectedSquawks.includes(s.id))?.tail || estNNumber)
      : estNNumber;
    const estCustomerDisplay = selectedSquawks.length > 0
      ? (squawkQueue.find((s) => selectedSquawks.includes(s.id))?.customer || estCustomerName)
      : estCustomerName;
    const estAircraftSquawks = squawkQueue.filter((s) => s.tail === estTail);
    return (
      <div className="flex-1 flex min-h-0 relative">
        {/* List */}
        <div className="w-[300px] shrink-0 border-r border-border flex flex-col bg-white">
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input type="text" placeholder="Search estimates..." value={estSearch} onChange={(e) => setEstSearch(e.target.value)} className="bg-transparent text-[12px] outline-none flex-1" />
            </div>
            <div className="flex gap-1">
              {["all", "Draft", "Sent", "Approved", "Rejected"].map((f) => (
                <button key={f} onClick={() => setEstFilter(f)}
                  className={`px-2 py-1 rounded-md text-[11px] transition-colors ${estFilter === f ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted/50"}`}
                  style={{ fontWeight: estFilter === f ? 600 : 400 }}>
                  {f === "all" ? "All" : f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-auto divide-y divide-border">
            {filteredEstimates.map((est) => {
              const age = Math.floor((Date.now() - new Date(est.createdAt).getTime()) / 86400000);
              const statusColor = { Draft: "bg-slate-100 text-slate-600", Sent: "bg-blue-50 text-blue-700", Approved: "bg-emerald-50 text-emerald-700", Rejected: "bg-red-50 text-red-600", Converted: "bg-violet-50 text-violet-700" }[est.status] || "bg-slate-100 text-slate-600";
              return (
                <button key={est.id} onClick={() => setSelectedEstId(est.id)}
                  className={`w-full p-4 text-left hover:bg-muted/20 transition-colors ${selectedEstId === est.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{est.estimateNumber}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${statusColor}`} style={{ fontWeight: 600 }}>{est.status}</span>
                  </div>
                  <div className="text-[12px] text-muted-foreground">{est.aircraft} &middot; {est.customer}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>${est.total.toLocaleString()}</span>
                    <span className="text-[11px] text-muted-foreground">{age}d ago</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="p-3 border-t border-border">
            <button onClick={() => {
              setSelectedSquawks([]);
              setEstNNumber(""); setEstFaaData(null); setEstFaaNotFound(false); setEstCustomerName(""); setEstCustomerEmail("");
              setCreatorStep("tail");
              setScopeNotes(""); setGeneratedEst(null);
              setShowEstCreator(true);
            }}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
              <Plus className="w-4 h-4" /> New Estimate
            </button>
          </div>
        </div>

        {/* Detail / Thread */}
        {selectedEst ? (
          <div className="flex-1 flex flex-col min-h-0 bg-[#F7F8FA]">
            <div className="shrink-0 bg-white border-b border-border px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-0.5">
                    <span className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>{selectedEst.estimateNumber}</span>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${{ Draft: "bg-slate-100 text-slate-600", Sent: "bg-slate-100 text-slate-700", Approved: "bg-slate-800 text-white", Rejected: "bg-slate-200 text-slate-500", Converted: "bg-slate-100 text-slate-600" }[selectedEst.status] || "bg-slate-100 text-slate-600"}`} style={{ fontWeight: 600 }}>{selectedEst.status}</span>
                  </div>
                  <div className="text-[13px] text-muted-foreground">{selectedEst.aircraft} · {selectedEst.customer} · Total: <strong className="text-foreground">${selectedEst.total.toLocaleString()}</strong></div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                    <Send className="w-3.5 h-3.5" /> Send Reminder
                  </button>
                  {selectedEst.status === "Sent" && (
                    <button className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-lg text-[12px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 500 }}>
                      <CheckCircle className="w-3.5 h-3.5" /> Mark Approved
                    </button>
                  )}
                  {selectedEst.status === "Approved" && (
                    <Link href="/maintenance" className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                      <Wrench className="w-3.5 h-3.5" /> Convert to Work Order
                    </Link>
                  )}
                  <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              {/* iMessage-style estimate activity thread */}
              <div className="rounded-2xl overflow-hidden border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center justify-between">
                  <span className="text-[12px] text-slate-600" style={{ fontWeight: 600 }}>Activity</span>
                  <span className="text-[11px] text-slate-400">{thread.length} events</span>
                </div>
                <div className="p-4 space-y-2.5" style={{ background: "#F2F2F7" }}>
                  {thread.map((t) => {
                    const isCustomer = t.type === "customer" || t.type === "approval" || t.type === "reply";
                    const isSystem = t.type === "system" || t.type === "email" || t.type === "tracking" || t.type === "reminder";
                    if (isSystem) {
                      return (
                        <div key={t.id} className="flex justify-center py-0.5">
                          <div className="text-[10px] text-slate-500 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                            {t.content} · {t.time}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={t.id} className={`flex items-end gap-2 ${isCustomer ? "flex-row-reverse" : ""}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white text-[9px] ${isCustomer ? "bg-[#2563EB]" : "bg-slate-500"}`} style={{ fontWeight: 700 }}>
                          {t.actor.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div className={`flex flex-col max-w-[78%] ${isCustomer ? "items-end" : "items-start"}`}>
                          <span className="text-[10px] text-slate-500 px-1 mb-1" style={{ fontWeight: 500 }}>{t.actor}</span>
                          <div className={`rounded-2xl px-4 py-2.5 text-[12px] leading-relaxed w-fit
                            ${isCustomer
                              ? "bg-[#2563EB] text-white rounded-br-sm"
                              : "bg-white text-slate-800 border border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] rounded-bl-sm"
                            }`}>
                            {t.content}
                          </div>
                          <span className="text-[10px] text-slate-400 px-1 mt-1">{t.time}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Inline note composer */}
                <div className="border-t border-slate-200 bg-white/95 px-3 py-2.5 flex items-center gap-2">
                  <input
                    value={newEstNote} onChange={(e) => setNewEstNote(e.target.value)}
                    placeholder="Add internal note..."
                    className="flex-1 text-[12px] bg-white border border-slate-300 rounded-full px-4 py-2 outline-none placeholder:text-slate-400"
                  />
                  <button onClick={() => handleAddEstNote(selectedEst.id)} disabled={!newEstNote.trim()}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-30 transition-all">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Line items summary */}
              <div className="bg-white rounded-xl border border-border p-4">
                <div className="text-[13px] text-foreground mb-3" style={{ fontWeight: 600 }}>Estimate Summary</div>
                {(() => {
                  const laborTotal: number = (selectedEst as any).subtotalLabor ?? 0;
                  const partsTotal: number = (selectedEst as any).subtotalParts ?? 0;
                  const outsideTotal: number = (selectedEst as any).subtotalOutside ?? 0;
                  return (
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">Labor</span><span className="text-foreground" style={{ fontWeight: 600 }}>${laborTotal.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Parts & Materials</span><span className="text-foreground" style={{ fontWeight: 600 }}>${partsTotal.toFixed(2)}</span></div>
                      {outsideTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Outside Services</span><span className="text-foreground" style={{ fontWeight: 600 }}>${outsideTotal.toFixed(2)}</span></div>}
                      <div className="flex justify-between border-t border-border pt-2 mt-2"><span className="text-foreground" style={{ fontWeight: 700 }}>Estimate Total</span><span className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>${selectedEst.total.toLocaleString()}</span></div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <div className="text-[14px]" style={{ fontWeight: 500 }}>Select an estimate to view its thread</div>
            </div>
          </div>
        )}

        {/* Estimate creator overlay (mirrors Squawks tab) */}
        <AnimatePresence>
          {showEstCreator && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 z-20 flex items-center justify-end">
              <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-[680px] h-full bg-white flex flex-col">
                <div className="bg-[#0A1628] px-5 py-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-white" />
                    <div>
                      <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>AI Estimate Creator</div>
                      <div className="text-white/50 text-[12px]">{selectedSquawks.length} squawk{selectedSquawks.length !== 1 ? "s" : ""} selected</div>
                    </div>
                  </div>
                  <button onClick={() => { setShowEstCreator(false); setCreatorStep("form"); setGeneratedEst(null); setScopeNotes(""); setEstNNumber(""); setEstFaaData(null); setEstFaaNotFound(false); setEstCustomerName(""); setEstCustomerEmail(""); setEstCustomerPhone(""); setEstCustomerNotes(""); setEditLaborLines([]); setEditPartsLines([]); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-white/70" />
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-5 space-y-4">

                  {/* ── Step: N-Number Lookup ── */}
                  {creatorStep === "tail" && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-[15px] text-foreground mb-1" style={{ fontWeight: 700 }}>Aircraft N-Number</h3>
                        <p className="text-[12px] text-muted-foreground">Enter the aircraft tail number to look up FAA records and auto-fill owner information.</p>
                      </div>
                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>N-Number <span className="text-red-500">*</span></label>
                        <input
                          value={estNNumber}
                          onChange={(e) => { setEstNNumber(e.target.value.toUpperCase()); setEstFaaNotFound(false); setEstFaaError(null); }}
                          onKeyDown={(e) => e.key === "Enter" && handleEstLookup()}
                          placeholder="e.g. N45678"
                          className="w-full border border-border rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 tracking-widest"
                          style={{ fontWeight: 600 }}
                          autoFocus
                        />
                        <p className="text-[11px] text-muted-foreground mt-1.5">Try: N45678, N55200, N88321, N12345, N67890</p>
                      </div>
                      <button onClick={handleEstLookup} disabled={!estNNumber.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
                        <Search className="w-3.5 h-3.5" /> Look Up in FAA Registry
                      </button>
                    </div>
                  )}

                  {/* ── Step: FAA Searching ── */}
                  {creatorStep === "faa-searching" && (
                    <div className="flex flex-col items-center py-12 gap-4">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="w-7 h-7 text-primary animate-pulse" />
                      </div>
                      <div className="text-[14px] text-foreground text-center" style={{ fontWeight: 600 }}>Searching FAA Registry…</div>
                      <p className="text-[12px] text-muted-foreground text-center">Looking up {estNNumber}…</p>
                    </div>
                  )}

                  {/* ── Step: FAA Result ── */}
                  {creatorStep === "faa-result" && (
                    <div className="space-y-4">
                      {estFaaNotFound ? (
                        <div className="flex flex-col items-center py-8 gap-3 text-center">
                          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                          </div>
                          <div>
                            <p className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                              {isFaaTemporarilyUnavailable(estFaaError) ? "FAA registry temporarily unavailable" : "Not found in FAA Registry"}
                            </p>
                            <p className="text-[12px] text-muted-foreground mt-1">
                              {isFaaTemporarilyUnavailable(estFaaError)
                                ? `The FAA registry did not respond cleanly for ${estNNumber}. You can retry, or continue and enter customer details manually.`
                                : `No active registration for ${estNNumber}. Verify the N-number or enter details manually.`}
                            </p>
                          </div>
                          <button onClick={() => setCreatorStep("tail")} className="border border-border px-5 py-2 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>← Try Again</button>
                        </div>
                      ) : estFaaData && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="text-[12px] text-emerald-800" style={{ fontWeight: 600 }}>FAA registry match — {estNNumber}</span>
                          </div>
                          <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 space-y-2">
                            <div className="flex items-center gap-2.5 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-[#0A1628] flex items-center justify-center shrink-0">
                                <Plane className="w-4.5 h-4.5 text-white" />
                              </div>
                              <div>
                                <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{estNNumber}</div>
                                <div className="text-[12px] text-muted-foreground">{estFaaData.aircraft.year} {estFaaData.aircraft.manufacturer} {estFaaData.aircraft.model}</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                              <div><span className="text-muted-foreground">Registrant</span><div className="text-foreground mt-0.5" style={{ fontWeight: 600 }}>{estFaaData.registrant.name}</div></div>
                              <div><span className="text-muted-foreground">Location</span><div className="text-foreground mt-0.5" style={{ fontWeight: 600 }}>{formatRegistrantLocation(estFaaData.registrant)}</div></div>
                            </div>
                          </div>

                          <div>
                            <div className="text-[12px] text-foreground mb-2 uppercase tracking-wider" style={{ fontWeight: 700 }}>Active Customer</div>
                            <div className="space-y-3">
                              <div>
                                <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Customer Name</label>
                                <input value={estCustomerName} onChange={(e) => setEstCustomerName(e.target.value)}
                                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                              </div>
                              <div>
                                <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Email</label>
                                <input value={estCustomerEmail} onChange={(e) => setEstCustomerEmail(e.target.value)}
                                  type="email" placeholder="customer@email.com"
                                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                              </div>
                              <div>
                                <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Phone</label>
                                <input value={estCustomerPhone} onChange={(e) => setEstCustomerPhone(e.target.value)}
                                  type="tel" placeholder="(512) 555-0000"
                                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Notes (optional)</label>
                              <textarea value={estCustomerNotes} onChange={(e) => setEstCustomerNotes(e.target.value)}
                                rows={2} placeholder="Any notes about this customer or aircraft..."
                                className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                            </div>
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button onClick={() => setCreatorStep("tail")} className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Back</button>
                            <button onClick={() => setCreatorStep("form")}
                              className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                              Continue to Estimate <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected squawks context */}
                  {creatorStep !== "tail" && creatorStep !== "faa-searching" && creatorStep !== "faa-result" && selectedSquawks.length > 0 && (
                    <div>
                      <div className="text-[12px] text-muted-foreground mb-2 uppercase tracking-wider" style={{ fontWeight: 600 }}>Source Squawks</div>
                      <div className="space-y-2">
                        {squawkQueue.filter((s) => selectedSquawks.includes(s.id)).map((sq) => (
                          <div key={sq.id} className="bg-[#F7F8FA] rounded-lg p-3 border border-border">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{sq.title}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${sevColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                            </div>
                            <div className="text-[12px] text-muted-foreground">{sq.tail} &middot; {sq.category} &middot; {sq.date}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {creatorStep === "form" && (
                    <>
                      <div className="bg-[#F7F8FA] rounded-xl border border-border p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-lg bg-[#0A1628] flex items-center justify-center shrink-0">
                            <Plane className="w-4.5 h-4.5 text-white" />
                          </div>
                          <div>
                            <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{estTail || "—"}</div>
                            <div className="text-[12px] text-muted-foreground">{estCustomerDisplay || "Unknown customer"}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-[12px]">
                          <div><span className="text-muted-foreground">Email</span><div className="text-foreground mt-0.5 truncate" style={{ fontWeight: 500 }}>{estCustomerEmail || "—"}</div></div>
                          <div><span className="text-muted-foreground">Phone</span><div className="text-foreground mt-0.5" style={{ fontWeight: 500 }}>{estCustomerPhone || "—"}</div></div>
                          <div><span className="text-muted-foreground">Notes</span><div className="text-foreground mt-0.5 truncate" style={{ fontWeight: 500 }}>{estCustomerNotes || "—"}</div></div>
                        </div>
                      </div>

                      {estAircraftSquawks.length > 0 && (
                        <div>
                          <div className="text-[12px] text-foreground mb-2" style={{ fontWeight: 600 }}>
                            Open Squawks on {estTail}
                            <span className="ml-2 text-[11px] text-muted-foreground" style={{ fontWeight: 400 }}>Check all that apply to this estimate</span>
                          </div>
                          <div className="space-y-2">
                            {estAircraftSquawks.map((sq) => (
                              <label key={sq.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-white hover:border-primary/30 hover:bg-primary/3 transition-all cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedSquawks.includes(sq.id)}
                                  onChange={() => toggleSquawk(sq.id)}
                                  className="mt-0.5 w-4 h-4 accent-primary"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{sq.title}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sevColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">{sq.category} · {sq.date}</div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Additional Scope Notes (optional)</label>
                        <textarea
                          value={scopeNotes}
                          onChange={(e) => setScopeNotes(e.target.value)}
                          className="w-full border border-border rounded-xl px-4 py-3 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                          rows={4}
                          placeholder='Describe any additional scope in plain English, e.g. "Include 100-hour inspection items while aircraft is open. Check magnetos while cowling is off."'
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <button className="flex items-center gap-1.5 text-[12px] text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                            <Mic className="w-3.5 h-3.5" /> Dictate
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Labor Rate</label>
                          <div className="flex items-center border border-border rounded-lg overflow-hidden">
                            <span className="px-3 text-[13px] text-muted-foreground bg-muted/30 border-r border-border py-2">$</span>
                            <input type="number" defaultValue="125" className="flex-1 px-3 py-2 text-[13px] outline-none" />
                            <span className="px-3 text-[13px] text-muted-foreground">/hr</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Valid For</label>
                          <select className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none bg-white">
                            <option>30 days</option>
                            <option>60 days</option>
                            <option>90 days</option>
                          </select>
                        </div>
                      </div>

                      <button onClick={handleGenerateEstimate}
                        className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3.5 rounded-xl text-[14px] hover:bg-primary/90 transition-colors"
                        style={{ fontWeight: 600 }}>
                        <Sparkles className="w-4 h-4" /> Generate Estimate with AI
                      </button>
                    </>
                  )}

                  {creatorStep === "generating" && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Bot className="w-7 h-7 text-primary animate-pulse" />
                      </div>
                      <div className="text-[14px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Generating estimate...</div>
                      <p className="text-[12px] text-muted-foreground text-center max-w-xs">AI is reading squawk descriptions, categorizing scope, and building your labor and parts line items.</p>
                      <div className="mt-4 flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {creatorStep === "generated" && generatedEst && (() => {
                    const laborTotal = editLaborLines.reduce((s, l) => s + l.total, 0);
                    const partsTotal = editPartsLines.reduce((s, p) => s + p.total, 0);
                    const grandTotal = laborTotal + partsTotal;
                    return (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                          <CheckCircle className="w-4 h-4 shrink-0" />
                          <span className="text-[12px]" style={{ fontWeight: 600 }}>Estimate generated — all fields are editable. Review before sending.</span>
                        </div>
                        <div>
                          <div className="text-[12px] text-foreground mb-2 flex items-center justify-between" style={{ fontWeight: 600 }}>
                            Labor Lines
                            <button onClick={() => setEditLaborLines(prev => [...prev, { id: `l-new-${Date.now()}`, desc: "Additional labor", hours: 1.0, rate: 125, total: 125 }])}
                              className="text-primary text-[11px] flex items-center gap-1" style={{ fontWeight: 500 }}>
                              <Plus className="w-3 h-3" /> Add line
                            </button>
                          </div>
                          <div className="border border-border rounded-xl overflow-hidden">
                            <table className="w-full text-[12px]">
                              <thead className="bg-muted/30">
                                <tr>
                                  <th className="text-left px-2.5 py-2 text-muted-foreground" style={{ fontWeight: 600 }}>Description</th>
                                  <th className="text-right px-2 py-2 text-muted-foreground w-14" style={{ fontWeight: 600 }}>Hrs</th>
                                  <th className="text-right px-2 py-2 text-muted-foreground w-14" style={{ fontWeight: 600 }}>Rate</th>
                                  <th className="text-right px-2 py-2 text-muted-foreground w-18" style={{ fontWeight: 600 }}>Total</th>
                                  <th className="w-6" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {editLaborLines.map((l, i) => (
                                  <tr key={l.id} className="hover:bg-muted/5">
                                    <td className="px-2.5 py-1.5">
                                      <input value={l.desc} onChange={e => setEditLaborLines(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
                                        className="w-full text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="number" value={l.hours} step="0.5"
                                        onChange={e => { const h = parseFloat(e.target.value) || 0; setEditLaborLines(prev => prev.map((x, j) => j === i ? { ...x, hours: h, total: h * x.rate } : x)); }}
                                        className="w-full text-right text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="number" value={l.rate}
                                        onChange={e => { const r = parseFloat(e.target.value) || 0; setEditLaborLines(prev => prev.map((x, j) => j === i ? { ...x, rate: r, total: x.hours * r } : x)); }}
                                        className="w-full text-right text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-foreground" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</td>
                                    <td className="pr-2 py-1.5">
                                      <button onClick={() => setEditLaborLines(prev => prev.filter((_, j) => j !== i))}
                                        className="text-muted-foreground hover:text-red-500 transition-colors">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div>
                          <div className="text-[12px] text-foreground mb-2 flex items-center justify-between" style={{ fontWeight: 600 }}>
                            Parts & Materials
                            <button onClick={() => setEditPartsLines(prev => [...prev, { id: `p-new-${Date.now()}`, pn: "", desc: "Part", qty: 1, price: 0, total: 0 }])}
                              className="text-primary text-[11px] flex items-center gap-1" style={{ fontWeight: 500 }}>
                              <Plus className="w-3 h-3" /> Add part
                            </button>
                          </div>
                          {editPartsLines.length === 0 ? (
                            <div className="border border-dashed border-border rounded-xl p-4 text-center text-[12px] text-muted-foreground">
                              No parts added. Click "+ Add part" to include parts.
                            </div>
                          ) : (
                            <div className="border border-border rounded-xl overflow-hidden">
                              <table className="w-full text-[12px]">
                                <thead className="bg-muted/30">
                                  <tr>
                                    <th className="text-left px-2.5 py-2 text-muted-foreground" style={{ fontWeight: 600 }}>Part / Description</th>
                                    <th className="text-left px-2 py-2 text-muted-foreground w-20" style={{ fontWeight: 600 }}>P/N</th>
                                    <th className="text-right px-2 py-2 text-muted-foreground w-12" style={{ fontWeight: 600 }}>Qty</th>
                                    <th className="text-right px-2 py-2 text-muted-foreground w-18" style={{ fontWeight: 600 }}>Total</th>
                                    <th className="w-6" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {editPartsLines.map((p, i) => (
                                    <tr key={p.id} className="hover:bg-muted/5">
                                      <td className="px-2.5 py-1.5">
                                        <input value={p.desc} onChange={e => setEditPartsLines(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
                                          className="w-full text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input value={p.pn} onChange={e => setEditPartsLines(prev => prev.map((x, j) => j === i ? { ...x, pn: e.target.value } : x))}
                                          className="w-full text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[11px] py-0.5" />
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input type="number" value={p.qty}
                                          onChange={e => { const q = parseInt(e.target.value) || 1; setEditPartsLines(prev => prev.map((x, j) => j === i ? { ...x, qty: q, total: q * x.price } : x)); }}
                                          className="w-full text-right text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                      </td>
                                      <td className="px-2 py-1.5 text-right text-foreground" style={{ fontWeight: 600 }}>${p.total.toFixed(2)}</td>
                                      <td className="pr-2 py-1.5">
                                        <button onClick={() => setEditPartsLines(prev => prev.filter((_, j) => j !== i))}
                                          className="text-muted-foreground hover:text-red-500 transition-colors">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 space-y-1.5 text-[13px]">
                          <div className="flex justify-between"><span className="text-muted-foreground">Labor Subtotal</span><span style={{ fontWeight: 600 }}>${laborTotal.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Parts Subtotal</span><span style={{ fontWeight: 600 }}>${partsTotal.toFixed(2)}</span></div>
                          <div className="flex justify-between border-t border-border pt-2 mt-1"><span className="text-foreground" style={{ fontWeight: 700 }}>Grand Total</span><span className="text-[16px]" style={{ fontWeight: 700 }}>${grandTotal.toFixed(2)}</span></div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {(creatorStep === "form" || creatorStep === "generated") && (() => {
                  const srcSq = squawkQueue.find((s) => selectedSquawks.includes(s.id));
                  const tail = srcSq?.tail || estNNumber || "";
                  const customer = srcSq?.customer || estCustomerName || "";
                  const closeCreator = () => {
                    setShowEstCreator(false); setCreatorStep("tail"); setGeneratedEst(null); setScopeNotes("");
                    setEstNNumber(""); setEstFaaData(null); setEstFaaNotFound(false);
                    setEstCustomerName(""); setEstCustomerEmail(""); setEstCustomerPhone(""); setEstCustomerNotes("");
                    setEditLaborLines([]); setEditPartsLines([]);
                  };
                  const persistEst = (status: "Draft" | "Sent") => {
                    const laborTotal = editLaborLines.reduce((s, l) => s + l.total, 0);
                    const partsTotal = editPartsLines.reduce((s, p) => s + p.total, 0);
                    const estNum = `EST-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
                    const saved = addEstimate({
                      estimateNumber: estNum, aircraft: tail, makeModel: "", customer,
                      mechanic: activeMechanic.name, status,
                      laborLines: editLaborLines, partsLines: editPartsLines,
                      outsideServices: [], assumptions: generatedEst?.assumptions || "",
                      internalNotes: scopeNotes, customerNotes: estCustomerNotes,
                      subtotalLabor: laborTotal, subtotalParts: partsTotal,
                      subtotalOutside: 0, total: laborTotal + partsTotal,
                    }, {
                      onPersisted: (persistedEstimate) => {
                        setSelectedEstId(persistedEstimate.id);
                      },
                    });
                    setSelectedEstId(saved.id);
                    closeCreator();
                    toast.success(status === "Draft" ? `Draft ${estNum} saved.` : `Estimate ${estNum} sent to ${customer || "customer"}.`, {
                      description: status === "Sent" ? `Email sent to ${estCustomerEmail || customer}` : undefined,
                    });
                  };
                  return (
                    <div className="shrink-0 px-5 py-4 border-t border-border bg-white flex items-center justify-between">
                      <button onClick={() => {
                          if (creatorStep === "generated") { setCreatorStep("form"); setGeneratedEst(null); setEditLaborLines([]); setEditPartsLines([]); }
                          else { closeCreator(); }
                        }}
                        className="text-[12px] text-muted-foreground hover:text-foreground transition-colors" style={{ fontWeight: 500 }}>
                        {creatorStep === "generated" ? "← Regenerate" : "Cancel"}
                      </button>
                      {creatorStep === "generated" && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => persistEst("Draft")}
                            className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 600 }}>
                            <Download className="w-3.5 h-3.5" /> Save as Draft
                          </button>
                          <button onClick={() => persistEst("Sent")}
                            className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                            <Send className="w-3.5 h-3.5" /> Send to Customer
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  function renderWorkOrders() {
    const ALL_WOS = [
      { wo: "WO-2026-0047", tail: "N67890", model: "Piper PA-28-181", customer: "Horizon Flights Inc.", desc: "Left brake caliper R&R — piston binding", status: "In Progress", progress: 45, mechanic: "Mike Torres, Dana Lee", due: "Apr 12, 2026" },
      { wo: "WO-2026-0042", tail: "N12345", model: "Cessna 172S", customer: "John Mitchell", desc: "Nav light intermittent — wire repair at wing root", status: "Awaiting Approval", progress: 70, mechanic: "Mike Torres", due: "Apr 10, 2026" },
    ];

    /* ── Mock activity per WO ── */
    type WOActItem = { id: string; type: string; author: string; role?: string; content: string; ts: string; chip?: string; visibility?: string };
    const WO_ACTIVITY: Record<string, WOActItem[]> = {
      "WO-2026-0047": [
        { id: "m1", type: "system",  author: "System",      content: "WO-2026-0047 opened · N67890 Piper PA-28-181", ts: "4 days ago" },
        { id: "m2", type: "status",  author: "System",      content: "Draft → In Progress", ts: "4 days ago" },
        { id: "m3", type: "note",    author: "Mike Torres", role: "Lead Mechanic", content: "Aircraft in bay 3. Pulled left wheel fairing — caliper piston is binding, pad contact uneven. Cleaning and lubing piston bore before deciding if caliper needs replacement.", ts: "3 days ago" },
        { id: "m4", type: "part",    author: "Dana Lee",    role: "Mechanic", content: "Ordered BRK-30026-5 brake disc and pad set from Aircraft Spruce. ETA 2 days.", ts: "2 days ago", chip: "P/N BRK-30026-5" },
        { id: "m5", type: "owner-update", author: "Mike Torres", role: "Lead Mechanic", content: "Hi Horizon team — N67890 is in for brake inspection. Left main caliper piston was binding. Parts ordered, arriving Thursday. Expect completion by end of week.", ts: "2 days ago", visibility: "owner-visible" },
        { id: "m6", type: "note",    author: "Dana Lee",    role: "Mechanic", content: "SB-60-22 checked — not applicable to this S/N range. No additional service bulletin action required.", ts: "1 day ago" },
      ],
      "WO-2026-0042": [
        { id: "n1", type: "system",  author: "System",      content: "WO-2026-0042 opened · N12345 Cessna 172S", ts: "9 days ago" },
        { id: "n2", type: "note",    author: "Mike Torres", role: "Lead Mechanic", content: "Traced intermittent nav light to right connector at wing root. Corrosion visible under insulation — wire shows abrasion at grommet edge.", ts: "8 days ago" },
        { id: "n3", type: "status",  author: "System",      content: "In Progress → Awaiting Approval", ts: "7 days ago" },
        { id: "n4", type: "owner-update", author: "Mike Torres", role: "Lead Mechanic", content: "Requesting owner approval for expanded scope: full wire re-route at grommet, +1.5 hrs (+$187.50). Parts on hand. No additional parts required.", ts: "7 days ago", visibility: "owner-visible" },
        { id: "n5", type: "ai-summary", author: "AI Assistant", content: "Nav light failure traced to corroded connector and chafed wire at wing root. MS connector on hand. Waiting on owner approval for +1.5 hrs. No additional parts needed. Ready to complete once approved.", ts: "2h ago" },
      ],
    };
    const WOS = isRestrictedMechanic
      ? ALL_WOS.filter((w) => w.mechanic.includes(activeMechanic.name))
      : ALL_WOS;
    const statusColor = (s: string) => ({
      "In Progress":       "bg-blue-50 text-blue-700",
      "Awaiting Approval": "bg-slate-100 text-slate-600",
      "Awaiting Parts":    "bg-slate-100 text-slate-600",
      "Open":              "bg-blue-50 text-blue-700",
      "Ready for Signoff": "bg-slate-800 text-white",
    }[s] || "bg-slate-100 text-slate-500");
    const statusDot = (s: string) => ({
      "In Progress":       "bg-blue-500",
      "Awaiting Approval": "bg-slate-400",
      "Awaiting Parts":    "bg-slate-400",
      "Open":              "bg-blue-500",
      "Ready for Signoff": "bg-white",
    }[s] || "bg-slate-300");

    const woParts = selectedWOId ? (woPartsById[selectedWOId] || []) : [];

    const handleWOPartSearch = (q: string) => {
      setWoPartSearch(q);
      if (!q.trim()) { setWoPartResults([]); return; }
      setWoPartSearching(true);
      setTimeout(() => {
        const results = savedParts.filter(p =>
          p.pn.toLowerCase().includes(q.toLowerCase()) ||
          p.desc.toLowerCase().includes(q.toLowerCase()) ||
          p.manufacturer.toLowerCase().includes(q.toLowerCase())
        );
        setWoPartResults(results);
        setWoPartSearching(false);
      }, 300);
    };

    const addPartToWO = (part: typeof savedParts[0]) => {
      if (!selectedWOId) return;
      const newLine = { id: `wop-${Date.now()}`, pn: part.pn, desc: part.desc, qty: 1, price: part.ourRate, total: part.ourRate, vendor: part.vendor };
      setWoPartsById(prev => ({ ...prev, [selectedWOId]: [...(prev[selectedWOId] || []), newLine] }));
      deductStock(part.id, 1);
      setWoPartSearch(""); setWoPartResults([]);
      toast.success(`${part.pn} added to ${selectedWOId}`, { description: `Stock updated · ${part.qtyInStock - 1} remaining` });
    };

    const requestPart = () => {
      if (!selectedWOId || !woRequestPart.trim()) return;
      const newLine = { id: `req-${Date.now()}`, pn: "REQUEST", desc: woRequestPart.trim(), qty: 1, price: 0, total: 0, vendor: "", requestOnly: true };
      setWoPartsById(prev => ({ ...prev, [selectedWOId]: [...(prev[selectedWOId] || []), newLine] }));
      setWoRequestPart(""); setWoRequestNote(""); setShowWOPartSearch(false);
      toast.success("Part request submitted", { description: woRequestPart.trim() });
    };

    const removeWOPart = (woId: string, lineId: string) => {
      setWoPartsById(prev => ({ ...prev, [woId]: (prev[woId] || []).filter(l => l.id !== lineId) }));
    };

    const ALL_WOS_COMBINED = [...liveWOs, ...WOS.filter(w => !liveWOs.find(l => l.wo === w.wo))];
    const selectedWO = ALL_WOS_COMBINED.find(w => w.wo === selectedWOId) || null;
    const aircraftOptions = aircraft.map(a => ({ id: a.id, tail: a.tail_number ?? "", model: [a.make, a.model].filter(Boolean).join(" ") }));
    const openSquawksForAircraft = newWOAircraftId ? savedSquawks.filter(s => {
      const ac = aircraft.find(a => a.id === newWOAircraftId);
      return ac && s.tail === ac.tail_number;
    }) : [];

    return (
      <div className="flex-1 flex min-h-0">
        {/* ── Left: WO list ── */}
        <div className={`${selectedWO ? "w-[280px]" : "flex-1 max-w-2xl mx-auto p-6"} shrink-0 border-r border-border flex flex-col bg-white`}>
          {!selectedWO && (
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Work Orders</h2>
                <p className="text-[12px] text-muted-foreground">{ALL_WOS_COMBINED.length} active{isRestrictedMechanic ? " · assigned to you" : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowNewWOForm(v => !v)}
                  className="flex items-center gap-1.5 text-[12px] bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  <Plus className="w-3.5 h-3.5" /> New Work Order
                </button>
                <Link href="/maintenance" className="flex items-center gap-1.5 text-[12px] text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* ── Inline New WO form ── */}
          {!selectedWO && showNewWOForm && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-5 bg-[#F7F8FA] border border-border rounded-xl overflow-hidden"
              >
                <div className="bg-[#0A1628] px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white text-[13px]" style={{ fontWeight: 600 }}>
                    <Wrench className="w-4 h-4" /> New Work Order
                  </div>
                  <button onClick={() => setShowNewWOForm(false)} className="p-1 hover:bg-white/10 rounded transition-colors">
                    <X className="w-3.5 h-3.5 text-white/60" />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-[11px] text-foreground mb-1" style={{ fontWeight: 600 }}>Aircraft *</label>
                    <select
                      value={newWOAircraftId}
                      onChange={e => { setNewWOAircraftId(e.target.value); setNewWOSquawks([]); }}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                    >
                      <option value="">Select aircraft…</option>
                      {aircraftOptions.map(a => (
                        <option key={a.id} value={a.id}>{a.tail}{a.model ? ` — ${a.model}` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-foreground mb-1" style={{ fontWeight: 600 }}>Title / Summary *</label>
                    <input
                      value={newWOTitle}
                      onChange={e => setNewWOTitle(e.target.value)}
                      placeholder="e.g. Annual inspection, brake caliper R&R…"
                      className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  {openSquawksForAircraft.length > 0 && (
                    <div>
                      <label className="block text-[11px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Attach Squawks (optional)</label>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {openSquawksForAircraft.map(sq => (
                          <label key={sq.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newWOSquawks.includes(sq.id)}
                              onChange={e => setNewWOSquawks(prev => e.target.checked ? [...prev, sq.id] : prev.filter(x => x !== sq.id))}
                              className="rounded"
                            />
                            <span className="text-foreground flex-1 truncate">{sq.title}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${sevColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] text-foreground mb-1" style={{ fontWeight: 600 }}>Labor Estimate (hrs, optional)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={newWOLabor}
                      onChange={e => setNewWOLabor(e.target.value)}
                      placeholder="e.g. 3.5"
                      className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setShowNewWOForm(false)}
                      className="flex-1 py-2 border border-border rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateWO}
                      disabled={newWOSaving || !newWOAircraftId || !newWOTitle.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-white py-2 rounded-lg text-[12px] hover:bg-primary/90 disabled:opacity-40 transition-colors"
                      style={{ fontWeight: 600 }}
                    >
                      {newWOSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</> : <><Plus className="w-3.5 h-3.5" /> Save &amp; Open</>}
                    </button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {selectedWO && (
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Work Orders</h2>
                <p className="text-[11px] text-muted-foreground">{ALL_WOS_COMBINED.length} active</p>
              </div>
              <button
                onClick={() => { setSelectedWOId(null); setShowNewWOForm(true); }}
                className="flex items-center gap-1 text-[11px] bg-primary text-white px-2.5 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
                style={{ fontWeight: 500 }}
              >
                <Plus className="w-3 h-3" /> New
              </button>
            </div>
          )}
          <div className={`${selectedWO ? "flex-1 overflow-auto divide-y divide-border" : "space-y-3"}`}>
            {ALL_WOS_COMBINED.map((w) => (
              <button key={w.wo} onClick={() => setSelectedWOId(w.wo === selectedWOId ? null : w.wo)}
                className={`w-full text-left transition-colors ${
                  selectedWO
                    ? `p-4 hover:bg-muted/20 ${selectedWOId === w.wo ? "bg-primary/5 border-l-2 border-primary" : ""}`
                    : `bg-white rounded-xl border border-border p-5 block hover:shadow-sm hover:border-primary/20`
                }`}>
                <div className={`flex items-start justify-between gap-2 ${selectedWO ? "mb-1" : "mb-3"}`}>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-foreground ${selectedWO ? "text-[13px]" : "text-[15px]"}`} style={{ fontWeight: 700 }}>{w.wo}</span>
                      <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${statusColor(w.status)}`} style={{ fontWeight: 600 }}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot(w.status)}`} />
                        {w.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{w.tail} · {w.customer}</div>
                  </div>
                  {!selectedWO && <div className="text-right shrink-0"><div className="text-[11px] text-muted-foreground">Due</div><div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{w.due}</div></div>}
                </div>
                {!selectedWO && (
                  <>
                    <p className="text-[13px] text-muted-foreground mb-3">{w.desc}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1"><span className="text-[11px] text-muted-foreground">Progress</span><span className="text-[11px]" style={{ fontWeight: 600 }}>{w.progress}%</span></div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${w.progress}%` }} /></div>
                      </div>
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: WO detail (iMessage style) ── */}
        {selectedWO ? (() => {
          const activity = WO_ACTIVITY[selectedWO.wo] || [];
          const threadNotes = woThreadNotes[selectedWO.wo] || [];
          const getAvatarColor = (name: string) => {
            const palette = ["bg-blue-600","bg-violet-600","bg-emerald-600","bg-amber-500","bg-rose-600","bg-teal-600"];
            const h = name.split("").reduce((a,c) => a + c.charCodeAt(0), 0);
            return palette[h % palette.length];
          };
          const getInitials = (name: string) => name.split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase();

          return (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Compact header */}
            <div className="bg-white border-b border-border px-5 py-3 flex items-center gap-3 shrink-0">
              <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{selectedWO.wo}</span>
              <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${statusColor(selectedWO.status)}`} style={{ fontWeight: 600 }}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(selectedWO.status)}`} />
                {selectedWO.status}
              </span>
              <span className="text-[11px] text-muted-foreground">{selectedWO.tail} · {selectedWO.customer}</span>
              <div className="ml-auto flex items-center gap-2">
                <Link href="/maintenance"
                  className="flex items-center gap-1.5 text-[11px] text-primary border border-primary/20 px-2.5 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
                  style={{ fontWeight: 500 }}>
                  <ExternalLink className="w-3 h-3" /> Full WO
                </Link>
                <button onClick={() => setSelectedWOId(null)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Progress strip */}
            <div className="shrink-0 bg-white border-b border-border px-5 py-2 flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${selectedWO.progress}%` }} />
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">{selectedWO.progress}% · {selectedWO.mechanic}</span>
            </div>

            {/* iMessage Thread */}
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3" style={{ background: "#F2F2F7" }}>
              {activity.map((act) => {
                /* System / status — centered pills */
                if (act.type === "system" || act.type === "status") {
                  return (
                    <div key={act.id} className="flex justify-center py-1">
                      <div className="text-[10px] text-slate-500 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                        {act.content} · {act.ts}
                      </div>
                    </div>
                  );
                }

                const isOwnerVisible = act.visibility === "owner-visible";
                const isAI = act.type === "ai-summary";
                const bubbleClass = isOwnerVisible
                  ? "bg-[#2563EB] text-white"
                  : isAI
                  ? "bg-[#EFF6FF] text-slate-800 border border-blue-100"
                  : "bg-white text-foreground border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)]";
                const chipClass = isOwnerVisible ? "bg-white/25 text-white/90" : "bg-slate-100 text-slate-600";

                return (
                  <motion.div key={act.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex items-end gap-2 group ${isOwnerVisible ? "flex-row-reverse" : ""}`}>
                    {/* Avatar */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] ${isAI ? "bg-primary" : getAvatarColor(act.author)}`} style={{ fontWeight: 700 }}>
                      {isAI ? <Bot className="w-3.5 h-3.5" /> : getInitials(act.author)}
                    </div>
                    {/* Bubble column */}
                    <div className={`min-w-0 flex flex-col ${isOwnerVisible ? "items-end" : "items-start"} max-w-[78%]`}>
                      <div className={`flex items-center gap-1.5 mb-1 px-1 ${isOwnerVisible ? "flex-row-reverse" : ""}`}>
                        <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>{act.author}</span>
                        {act.role && <span className="text-[10px] text-muted-foreground/60">{act.role}</span>}
                        {isOwnerVisible && (
                          <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Owner</span>
                        )}
                      </div>
                      <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed w-fit ${isOwnerVisible ? "rounded-br-sm" : "rounded-bl-sm"} ${bubbleClass}`}>
                        {isAI ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Sparkles className="w-3.5 h-3.5 text-primary" />
                              <span className="text-[11px] text-primary" style={{ fontWeight: 600 }}>AI Summary</span>
                            </div>
                            <div className="text-[12px] text-slate-600 leading-relaxed">{act.content}</div>
                          </div>
                        ) : (
                          <span>{act.content}</span>
                        )}
                        {act.chip && (
                          <div className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] ${chipClass}`} style={{ fontWeight: 600 }}>
                            <Package className="w-3 h-3" />{act.chip}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 mt-1 px-1">{act.ts}</span>
                    </div>
                  </motion.div>
                );
              })}

              {/* User-added quick notes */}
              {threadNotes.map((note) => (
                <motion.div key={note.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-end gap-2 flex-row-reverse">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>
                    {getInitials(activeMechanic.name)}
                  </div>
                  <div className="flex flex-col items-end max-w-[78%]">
                    <div className="flex items-center gap-1.5 mb-1 px-1 flex-row-reverse">
                      <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>{activeMechanic.name}</span>
                    </div>
                    <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">
                      {note.content}
                    </div>
                    <span className="text-[10px] text-muted-foreground/50 mt-1 px-1">{note.ts}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Parts summary bar (if parts added) */}
            {woParts.length > 0 && (
              <div className="shrink-0 bg-white border-t border-slate-100 px-4 py-2 flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[12px] text-muted-foreground">{woParts.length} part line{woParts.length !== 1 ? "s" : ""} added</span>
                <button onClick={() => setShowWOPartSearch(p => !p)}
                  className="ml-auto text-[11px] text-primary" style={{ fontWeight: 500 }}>
                  {showWOPartSearch ? "Hide" : "Manage Parts"}
                </button>
              </div>
            )}

            {/* Parts panel (collapsible) */}
            <AnimatePresence>
              {showWOPartSearch && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="shrink-0 bg-white border-t border-border overflow-hidden max-h-64 overflow-y-auto">
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2 bg-primary/5 border border-primary/15 rounded-lg px-3 py-2">
                      <Lock className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                      <span className="text-[11px] text-primary/80">Searching from inventory & saved parts only</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center gap-2 bg-[#F2F2F7] rounded-xl px-3 py-2">
                        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <input autoFocus value={woPartSearch} onChange={e => handleWOPartSearch(e.target.value)}
                          placeholder="Search by P/N or description..." className="flex-1 text-[12px] outline-none bg-transparent" />
                        {woPartSearching && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
                      </div>
                      <button onClick={() => { setShowWOPartSearch(false); setWoPartSearch(""); setWoPartResults([]); }}
                        className="px-3 py-2 rounded-xl border border-border text-[11px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                        Close
                      </button>
                    </div>
                    {woPartResults.length > 0 && (
                      <div className="space-y-1.5">
                        {woPartResults.map(part => (
                          <div key={part.id} className="flex items-center gap-3 bg-white rounded-lg border border-border px-3 py-2.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] text-foreground" style={{ fontWeight: 700 }}>{part.pn}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${part.qtyInStock > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`} style={{ fontWeight: 600 }}>
                                  {part.qtyInStock > 0 ? `${part.qtyInStock} in stock` : "Out of stock"}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">{part.desc} · ${part.ourRate.toFixed(2)}/ea</div>
                            </div>
                            <button onClick={() => addPartToWO(part)} disabled={part.qtyInStock === 0}
                              className="flex items-center gap-1 text-[11px] bg-primary text-white px-2.5 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0" style={{ fontWeight: 600 }}>
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {woParts.length > 0 && (
                      <div className="border-t border-border pt-3 space-y-1.5">
                        {woParts.map(line => (
                          <div key={line.id} className="flex items-center gap-2 text-[12px]">
                            <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="flex-1 truncate text-foreground">{line.desc}</span>
                            {line.requestOnly
                              ? <span className="text-amber-600 text-[11px]" style={{ fontWeight: 600 }}>Requested</span>
                              : <span className="text-foreground" style={{ fontWeight: 600 }}>${line.total.toFixed(2)}</span>}
                            <button onClick={() => removeWOPart(selectedWOId!, line.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setShowWOPartSearch(true)} className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground py-1 transition-colors hidden" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Add parts shortcut when no parts yet */}
            {woParts.length === 0 && !showWOPartSearch && (
              <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-2">
                <button onClick={() => setShowWOPartSearch(true)}
                  className="text-[11px] text-primary flex items-center gap-1.5" style={{ fontWeight: 500 }}>
                  <Package className="w-3.5 h-3.5" /> Add parts to this WO
                </button>
              </div>
            )}

            {/* Composer bar */}
            <div className="shrink-0 bg-white border-t border-slate-200 px-3 py-3 flex items-end gap-2">
              <div className="flex-1 bg-[#F2F2F7] rounded-2xl px-4 py-2.5">
                <input
                  value={woNoteText}
                  onChange={e => setWoNoteText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey && woNoteText.trim()) {
                      e.preventDefault();
                      const newNote = { id: `wn-${Date.now()}`, content: woNoteText.trim(), ts: "just now" };
                      setWoThreadNotes(prev => ({ ...prev, [selectedWO.wo]: [...(prev[selectedWO.wo] || []), newNote] }));
                      setWoNoteText("");
                      toast.success("Note added to thread");
                    }
                  }}
                  placeholder="Add internal note…"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
                />
              </div>
              <button
                disabled={!woNoteText.trim()}
                onClick={() => {
                  if (!woNoteText.trim()) return;
                  const newNote = { id: `wn-${Date.now()}`, content: woNoteText.trim(), ts: "just now" };
                  setWoThreadNotes(prev => ({ ...prev, [selectedWO.wo]: [...(prev[selectedWO.wo] || []), newNote] }));
                  setWoNoteText("");
                  toast.success("Note added to thread");
                }}
                className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center disabled:opacity-30 hover:bg-[#2563EB]/90 transition-colors shrink-0">
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>

              {/* ──────── end of WO thread right panel ──────── */}
              {false && (
                <div>
                <AnimatePresence>
                  {showWOPartSearch && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="border-b border-border bg-[#F7F8FA] overflow-hidden">
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2 bg-primary/5 border border-primary/15 rounded-lg px-3 py-2">
                          <Lock className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                          <span className="text-[11px] text-primary/80">Searching from inventory & saved parts only — use Parts section to add online parts</span>
                        </div>

                        {/* Search input */}
                        <div className="flex gap-2">
                          <div className="flex-1 flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2">
                            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <input
                              autoFocus
                              value={woPartSearch}
                              onChange={e => handleWOPartSearch(e.target.value)}
                              placeholder="Search by P/N or description..."
                              className="flex-1 text-[12px] outline-none bg-transparent"
                            />
                            {woPartSearching && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
                          </div>
                        </div>

                        {/* Inventory results */}
                        {woPartResults.length > 0 && (
                          <div className="space-y-1.5 max-h-60 overflow-auto">
                            {woPartResults.map(part => (
                              <div key={part.id} className="flex items-center gap-3 bg-white rounded-lg border border-border px-3 py-2.5 hover:border-primary/30 transition-all">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] text-foreground" style={{ fontWeight: 700 }}>{part.pn}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${part.qtyInStock > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`} style={{ fontWeight: 600 }}>
                                      {part.qtyInStock > 0 ? `${part.qtyInStock} in stock` : "Out of stock"}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground truncate">{part.desc}</div>
                                  <div className="text-[11px] text-foreground mt-0.5" style={{ fontWeight: 600 }}>${part.ourRate.toFixed(2)}/ea</div>
                                </div>
                                <button
                                  onClick={() => addPartToWO(part)}
                                  disabled={part.qtyInStock === 0}
                                  className="flex items-center gap-1 text-[11px] bg-primary text-white px-2.5 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                                  style={{ fontWeight: 600 }}
                                >
                                  <Plus className="w-3 h-3" /> Add
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {woPartSearch && woPartResults.length === 0 && !woPartSearching && (
                          <div className="text-center py-4 border border-dashed border-border rounded-xl">
                            <Package className="w-7 h-7 mx-auto mb-2 text-muted-foreground/30" />
                            <div className="text-[12px] text-muted-foreground" style={{ fontWeight: 500 }}>Not in inventory or saved parts</div>
                            <div className="text-[11px] text-muted-foreground/70 mt-0.5 mb-3">Use the Parts section to source parts online, or request below.</div>
                            <button
                              onClick={() => {
                                if (!selectedWOId || !woPartSearch.trim()) return;
                                const newLine = { id: `manual-${Date.now()}`, pn: "MANUAL", desc: woPartSearch.trim(), qty: 1, price: 0, total: 0, vendor: "" };
                                setWoPartsById(prev => ({ ...prev, [selectedWOId]: [...(prev[selectedWOId] || []), newLine] }));
                                setWoPartSearch(""); setWoPartResults([]); setShowWOPartSearch(false);
                                toast.success("Part line added", { description: "Set qty and rate in the table below" });
                              }}
                              className="text-[11px] text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
                              style={{ fontWeight: 600 }}
                            >
                              + Add as Line Item (set price manually)
                            </button>
                          </div>
                        )}

                        {/* Request part section */}
                        <div className="border-t border-border pt-3">
                          <div className="text-[11px] text-foreground mb-2" style={{ fontWeight: 600 }}>Request a Part</div>
                          <div className="space-y-2">
                            <input
                              value={woRequestPart}
                              onChange={e => setWoRequestPart(e.target.value)}
                              placeholder="Part number or description..."
                              className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <input
                              value={woRequestNote}
                              onChange={e => setWoRequestNote(e.target.value)}
                              placeholder="Notes (optional)..."
                              className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <button
                              onClick={requestPart}
                              disabled={!woRequestPart.trim()}
                              className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white py-2 rounded-lg text-[12px] hover:bg-amber-700 disabled:opacity-40 transition-colors"
                              style={{ fontWeight: 600 }}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" /> Submit Part Request
                            </button>
                          </div>
                        </div>

                        <button onClick={() => { setShowWOPartSearch(false); setWoPartSearch(""); setWoPartResults([]); }}
                          className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground py-1 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Parts list */}
                {woParts.length === 0 && !showWOPartSearch ? (
                  <div className="px-4 py-8 text-center">
                    <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                    <div className="text-[12px] text-muted-foreground">No parts added yet</div>
                    <button onClick={() => setShowWOPartSearch(true)} className="mt-2 text-[11px] text-primary" style={{ fontWeight: 500 }}>
                      + Search inventory or request a part
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left p-3 text-muted-foreground" style={{ fontWeight: 600 }}>Part / Description</th>
                        <th className="text-right p-3 text-muted-foreground w-16" style={{ fontWeight: 600 }}>Qty</th>
                        <th className="text-right p-3 text-muted-foreground w-20" style={{ fontWeight: 600 }}>Rate</th>
                        <th className="text-right p-3 text-muted-foreground w-20" style={{ fontWeight: 600 }}>Total</th>
                        <th className="w-8 p-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {woParts.map(line => (
                        <tr key={line.id} className="group hover:bg-muted/10">
                          <td className="p-3">
                            <div>
                              <div className="text-foreground" style={{ fontWeight: 500 }}>{line.desc}</div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                {line.pn !== "REQUEST" ? line.pn : ""}
                                {line.requestOnly && <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full text-[9px]" style={{ fontWeight: 600 }}>REQUESTED</span>}
                                {line.vendor && !line.requestOnly && <span className="text-muted-foreground/60">{line.vendor}</span>}
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            {line.requestOnly ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <input
                                type="number"
                                min="1"
                                value={line.qty}
                                onChange={e => {
                                  const qty = parseInt(e.target.value) || 1;
                                  setWoPartsById(prev => ({
                                    ...prev,
                                    [selectedWOId!]: (prev[selectedWOId!] || []).map(l =>
                                      l.id === line.id ? { ...l, qty, total: qty * l.price } : l
                                    ),
                                  }));
                                }}
                                className="w-14 text-right border border-transparent group-hover:border-border rounded px-1.5 py-0.5 text-[12px] outline-none focus:border-primary/40 bg-transparent focus:bg-white"
                                style={{ fontWeight: 600 }}
                              />
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {line.requestOnly ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.price}
                                onChange={e => {
                                  const price = parseFloat(e.target.value) || 0;
                                  setWoPartsById(prev => ({
                                    ...prev,
                                    [selectedWOId!]: (prev[selectedWOId!] || []).map(l =>
                                      l.id === line.id ? { ...l, price, total: l.qty * price } : l
                                    ),
                                  }));
                                }}
                                className="w-20 text-right border border-transparent group-hover:border-border rounded px-1.5 py-0.5 text-[12px] outline-none focus:border-primary/40 bg-transparent focus:bg-white"
                              />
                            )}
                          </td>
                          <td className="p-3 text-right" style={{ fontWeight: 600 }}>
                            {line.requestOnly ? <span className="text-amber-600 text-[11px]">Pending</span> : `$${line.total.toFixed(2)}`}
                          </td>
                          <td className="p-3">
                            <button onClick={() => removeWOPart(selectedWOId!, line.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {woParts.filter(l => !l.requestOnly).length > 0 && (
                      <tfoot>
                        <tr className="border-t border-border bg-muted/10">
                          <td className="p-3 text-[12px] text-foreground" colSpan={3} style={{ fontWeight: 700 }}>Parts Subtotal</td>
                          <td className="p-3 text-right text-[13px] text-foreground" style={{ fontWeight: 700 }}>
                            ${woParts.filter(l => !l.requestOnly).reduce((s, l) => s + l.total, 0).toFixed(2)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}
                </div>
              )}

          </div>
          );
        })() : null}
      </div>
    );
  }

  function renderInvoices() {
    const allMechInvoices = [...savedMechInvoices, ...MECHANIC_INVOICES];
    const selectedInvFromAll = allMechInvoices.find((i) => i.id === selectedInvId) || null;
    const inv = selectedInvFromAll;
    const filteredInvs = allMechInvoices.filter((i) => {
      const q = invSearch.toLowerCase();
      return !q || i.number.toLowerCase().includes(q) || i.customer.toLowerCase().includes(q) || i.aircraft.toLowerCase().includes(q);
    });
    return (
      <div className="flex-1 flex min-h-0">
        {/* Invoice list */}
        <div className="w-[300px] shrink-0 border-r border-border flex flex-col bg-white">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input type="text" placeholder="Search invoices..." value={invSearch} onChange={(e) => setInvSearch(e.target.value)} className="bg-transparent text-[12px] outline-none flex-1" />
            </div>
          </div>
          <div className="flex-1 overflow-auto divide-y divide-border">
            {filteredInvs.map((i) => (
              <button key={i.id} onClick={() => setSelectedInvId(i.id)}
                className={`w-full p-4 text-left hover:bg-muted/20 transition-colors ${selectedInvId === i.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{i.number}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${invoiceStatusColor(i.status)}`} style={{ fontWeight: 600 }}>{i.status}</span>
                </div>
                <div className="text-[12px] text-muted-foreground">{i.aircraft} &middot; {i.customer}</div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>${i.total.toFixed(2)}</span>
                  {i.paymentStatus === "Unpaid" && i.status !== "Draft" && (
                    <span className="text-[10px] text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>{i.daysOut}d out</span>
                  )}
                  {i.paymentStatus === "Paid" && (
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Paid</span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-border">
            <button onClick={() => { setShowNewInvoice(true); setNewInvType(null); }} className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
              <Plus className="w-4 h-4" /> New Invoice
            </button>
          </div>
        </div>

        {/* Invoice detail */}
        {inv ? (
          <div className="flex-1 flex flex-col min-h-0 bg-[#F7F8FA]">
            <div className="shrink-0 bg-white border-b border-border px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-0.5">
                  <span className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>{inv.number}</span>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${invoiceStatusColor(inv.status)}`} style={{ fontWeight: 600 }}>{inv.status}</span>
                  {inv.paymentStatus === "Unpaid" && inv.status !== "Draft" && (
                    <span className="text-[11px] bg-orange-50 text-orange-600 px-2.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Unpaid · {inv.daysOut} days</span>
                  )}
                </div>
                <div className="text-[13px] text-muted-foreground">{inv.aircraft} &middot; {inv.customer}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                  <Mail className="w-3.5 h-3.5" /> Email
                </button>
                <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                {inv.status === "Draft" && (
                  <button className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
                    <Send className="w-3.5 h-3.5" /> Send Invoice
                  </button>
                )}
                {inv.paymentStatus === "Unpaid" && inv.status === "Sent" && (
                  <button className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-[12px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 500 }}>
                    <CheckCircle className="w-3.5 h-3.5" /> Mark Paid
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              {/* Customer info */}
              <div className="bg-white rounded-xl border border-border p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wider" style={{ fontWeight: 600 }}>Bill To</div>
                    <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{inv.customer}</div>
                    {inv.company && <div className="text-[12px] text-muted-foreground">{inv.company}</div>}
                    <div className="text-[12px] text-muted-foreground">{inv.email}</div>
                    <div className="text-[12px] text-muted-foreground">{inv.phone}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wider" style={{ fontWeight: 600 }}>Invoice Info</div>
                    <div className="space-y-1 text-[12px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">Issued</span><span style={{ fontWeight: 500 }}>{inv.issuedDate}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span style={{ fontWeight: 500 }}>{inv.dueDate}</span></div>
                      {inv.linkedWO && <div className="flex justify-between"><span className="text-muted-foreground">Work Order</span><Link href="/maintenance" className="text-primary" style={{ fontWeight: 500 }}>{inv.linkedWO}</Link></div>}
                      <div className="flex justify-between"><span className="text-muted-foreground">Aircraft</span><span style={{ fontWeight: 500 }}>{inv.aircraft}</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Labor lines */}
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border"><span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Labor</span></div>
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left p-3 text-muted-foreground" style={{ fontWeight: 600 }}>Description</th>
                      <th className="text-right p-3 text-muted-foreground w-16" style={{ fontWeight: 600 }}>Hrs</th>
                      <th className="text-right p-3 text-muted-foreground w-16" style={{ fontWeight: 600 }}>Rate</th>
                      <th className="text-right p-3 text-muted-foreground w-20" style={{ fontWeight: 600 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inv.laborLines.map((l, i) => (
                      <tr key={i}><td className="p-3 text-foreground">{l.desc}</td><td className="p-3 text-right text-muted-foreground">{l.hours}</td><td className="p-3 text-right text-muted-foreground">${l.rate}</td><td className="p-3 text-right text-foreground" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Parts lines */}
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Parts & Materials</span>
                  <button
                    onClick={() => { setPartPickerAircraft(inv.aircraft); setPartPickerMode("all"); setPartPickerTarget("invoice"); setShowPartPicker(true); }}
                    className="flex items-center gap-1.5 text-[11px] text-primary hover:underline" style={{ fontWeight: 600 }}>
                    <Plus className="w-3.5 h-3.5" /> Add Part
                  </button>
                </div>
                {(() => {
                  const allLines = [...inv.partsLines, ...(invoiceDetailParts[inv.id] || [])];
                  return allLines.length === 0 ? (
                    <div className="px-4 py-8 text-center text-muted-foreground">
                      <Package className="w-6 h-6 mx-auto mb-2 opacity-30" />
                      <div className="text-[12px]">No parts added yet</div>
                      <button onClick={() => { setPartPickerAircraft(inv.aircraft); setPartPickerMode("all"); setPartPickerTarget("invoice"); setShowPartPicker(true); }}
                        className="mt-2 text-[12px] text-primary" style={{ fontWeight: 500 }}>+ Add from inventory or search online</button>
                    </div>
                  ) : (
                    <table className="w-full text-[12px]">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="text-left p-3 text-muted-foreground" style={{ fontWeight: 600 }}>Part / Description</th>
                          <th className="text-right p-3 text-muted-foreground w-12" style={{ fontWeight: 600 }}>Qty</th>
                          <th className="text-right p-3 text-muted-foreground w-20" style={{ fontWeight: 600 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {allLines.map((p, i) => (
                          <tr key={i}><td className="p-3"><div className="text-foreground">{p.desc}</div><div className="text-muted-foreground text-[10px]">{p.pn}</div></td><td className="p-3 text-right text-muted-foreground">{p.qty}</td><td className="p-3 text-right text-foreground" style={{ fontWeight: 600 }}>${p.total.toFixed(2)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>

              {/* Totals + payment */}
              <div className="bg-white rounded-xl border border-border p-5">
                <div className="space-y-2 text-[13px] mb-4">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span style={{ fontWeight: 500 }}>${inv.amount.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tax (7.5%)</span><span style={{ fontWeight: 500 }}>${inv.tax.toFixed(2)}</span></div>
                  <div className="flex justify-between border-t border-border pt-3 mt-2">
                    <span className="text-foreground" style={{ fontWeight: 700 }}>Total Due</span>
                    <span className="text-[20px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>${inv.total.toFixed(2)}</span>
                  </div>
                </div>

                {inv.paymentStatus === "Paid" ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-[13px] text-emerald-800" style={{ fontWeight: 600 }}>Payment received in full</span>
                  </div>
                ) : inv.status !== "Draft" ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                      <Receipt className="w-4 h-4 text-amber-600" />
                      <span className="text-[13px] text-amber-800" style={{ fontWeight: 600 }}>Payment outstanding · {inv.daysOut} days</span>
                    </div>
                    <button className="w-full flex items-center justify-center gap-2 bg-[#635BFF] text-white py-3 rounded-xl text-[14px] hover:bg-[#5851E5] transition-colors" style={{ fontWeight: 600 }}>
                      <CreditCard className="w-4 h-4" /> Pay ${inv.total.toFixed(2)} via Stripe
                    </button>
                    <p className="text-[10px] text-center text-muted-foreground">Secure payment powered by Stripe</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center"><Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" /><div className="text-[14px]" style={{ fontWeight: 500 }}>Select an invoice to view details</div></div>
          </div>
        )}
      </div>
    );
  }

  function renderLogbook() {
    // Combine seed entries with any newly saved entries
    type DisplayEntry = {
      id: string; number: string; aircraft: string; model: string;
      type: string; date: string; hobbs: number; tach: number;
      mechanic: string; cert: string; status: "signed" | "draft" | "archived";
      body: string; customer?: string; customerEmail?: string; linkedWO?: string;
    };
    const allEntries: DisplayEntry[] = [
      ...LOGBOOK_ENTRIES.map((e) => ({
        ...e,
        hobbs: e.hobbs ?? 0,
        tach: e.tach ?? 0,
        customer: e.mechanic === "Mike Torres" ? (e.aircraft === "N12345" ? "John Mitchell" : "Horizon Flights Inc.") : undefined,
      })),
    ];

    // Filter
    const filteredEntries = allEntries.filter((e) => {
      const matchTail = !lbFilterTail || e.aircraft.toLowerCase().includes(lbFilterTail.toLowerCase());
      const matchCust = !lbFilterCustomer || (e.customer || "").toLowerCase().includes(lbFilterCustomer.toLowerCase());
      return matchTail && matchCust;
    });

    const lb = allEntries.find((e) => e.id === selectedLBId) || null;

    return (
      <>
      <div className="flex-1 flex min-h-0">
        {/* List panel */}
        <div className="w-[310px] shrink-0 border-r border-border flex flex-col bg-white">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h2 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Logbook Entries</h2>
                <p className="text-[11px] text-muted-foreground">{filteredEntries.length} of {allEntries.length} entries</p>
              </div>
            </div>
            {/* Filters */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5">
                <Plane className="w-3 h-3 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Filter by tail #"
                  value={lbFilterTail}
                  onChange={(e) => setLbFilterTail(e.target.value)}
                  className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/60"
                />
                {lbFilterTail && <button onClick={() => setLbFilterTail("")} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
              </div>
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5">
                <User className="w-3 h-3 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Filter by customer"
                  value={lbFilterCustomer}
                  onChange={(e) => setLbFilterCustomer(e.target.value)}
                  className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/60"
                />
                {lbFilterCustomer && <button onClick={() => setLbFilterCustomer("")} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
              </div>
            </div>
          </div>

          {/* Entry list */}
          <div className="flex-1 overflow-auto divide-y divide-border">
            {filteredEntries.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <BookOpen className="w-7 h-7 mx-auto mb-2 opacity-30" />
                <div className="text-[13px]">No entries match filters</div>
                <button onClick={() => { setLbFilterTail(""); setLbFilterCustomer(""); }} className="text-[11px] text-primary mt-1" style={{ fontWeight: 500 }}>Clear filters</button>
              </div>
            ) : filteredEntries.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedLBId(e.id === selectedLBId ? null : e.id)}
                className={`w-full p-3.5 text-left hover:bg-muted/20 transition-colors ${selectedLBId === e.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{e.number}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${e.status === "signed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} style={{ fontWeight: 600 }}>
                    {e.status}
                  </span>
                </div>
                <div className="text-[12px] text-foreground truncate" style={{ fontWeight: 500 }}>{e.type}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  <span className="inline-flex items-center gap-1"><Plane className="w-2.5 h-2.5" />{e.aircraft}</span>
                  {e.customer && <> · {e.customer}</>}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{e.date}</div>
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="p-3 border-t border-border space-y-2">
            <button
              onClick={() => setShowCanaryGenerator(true)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#0A1628] to-[#2563EB] text-white py-2.5 rounded-lg text-[12px] hover:opacity-90 transition-opacity"
              style={{ fontWeight: 600 }}
            >
              <Sparkles className="w-3.5 h-3.5" /> Generate Logbook Entry with AI
            </button>
            <button
              onClick={() => { setShowLbSearch(v => !v); setSelectedLBId(null); }}
              className="w-full flex items-center justify-center gap-2 border border-primary/30 text-primary py-2.5 rounded-lg text-[12px] hover:bg-primary/5 transition-colors"
              style={{ fontWeight: 600 }}
            >
              <Search className="w-3.5 h-3.5" /> Search Logbook
            </button>
          </div>
        </div>

        {/* Detail panel */}
        {showLbSearch ? (
          <div className="flex-1 overflow-auto bg-[#F7F8FA] p-5">
            <div className="max-w-2xl space-y-4">
              {/* Search form */}
              <div className="bg-white rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>Search Logbook</h3>
                    <p className="text-[12px] text-muted-foreground">Search across all aircraft logbook entries</p>
                  </div>
                  <button onClick={() => setShowLbSearch(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-foreground mb-1" style={{ fontWeight: 600 }}>Search text</label>
                    <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <input
                        value={lbSearchQuery}
                        onChange={e => setLbSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleLogbookSearch()}
                        placeholder="e.g. annual inspection, brake, oil change…"
                        className="flex-1 text-[12px] outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-foreground mb-1" style={{ fontWeight: 600 }}>Aircraft</label>
                      <select
                        value={lbSearchAircraftId}
                        onChange={e => setLbSearchAircraftId(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none bg-white"
                      >
                        <option value="">All aircraft</option>
                        {aircraft.map(a => (
                          <option key={a.id} value={a.id}>{a.tail_number}{a.make ? ` — ${a.make} ${a.model ?? ""}` : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-foreground mb-1" style={{ fontWeight: 600 }}>Entry Type</label>
                      <select
                        value={lbSearchEntryType}
                        onChange={e => setLbSearchEntryType(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none bg-white"
                      >
                        <option value="all">All types</option>
                        <option value="annual">Annual</option>
                        <option value="100hr">100-Hour</option>
                        <option value="ad_compliance">AD Compliance</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="oil_change">Oil Change</option>
                        <option value="component_replacement">Component Replacement</option>
                        <option value="major_repair">Major Repair</option>
                        <option value="major_alteration">Major Alteration</option>
                        <option value="return_to_service">Return to Service</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-foreground mb-1" style={{ fontWeight: 600 }}>Date from</label>
                      <input type="date" value={lbSearchDateFrom} onChange={e => setLbSearchDateFrom(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-foreground mb-1" style={{ fontWeight: 600 }}>Date to</label>
                      <input type="date" value={lbSearchDateTo} onChange={e => setLbSearchDateTo(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none" />
                    </div>
                  </div>
                  <button
                    onClick={handleLogbookSearch}
                    disabled={lbSearchLoading}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-lg text-[12px] hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    {lbSearchLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…</> : <><Search className="w-3.5 h-3.5" /> Search Entries</>}
                  </button>
                </div>
              </div>

              {/* Search results */}
              {lbSearchError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[12px] text-red-700">{lbSearchError}</div>
              )}
              {lbSearchResults !== null && (
                <div className="bg-white rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{lbSearchResults.length} result{lbSearchResults.length !== 1 ? "s" : ""}</span>
                  </div>
                  {lbSearchResults.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">
                      <BookOpen className="w-7 h-7 mx-auto mb-2 opacity-30" />
                      <div className="text-[13px]">No entries found</div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {lbSearchResults.map(e => (
                        <div key={e.id} className="px-4 py-3 hover:bg-muted/10 transition-colors">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>
                              {e.entry_type?.replace(/_/g, " ")} — {e.entry_date}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${e.status === "signed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} style={{ fontWeight: 600 }}>
                              {e.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
                            <Plane className="w-2.5 h-2.5" />
                            {(e.aircraft as any)?.tail_number ?? e.aircraft_id}
                            {e.mechanic_name && <> · {e.mechanic_name}</>}
                          </div>
                          {e.description && (
                            <div className="text-[11px] text-muted-foreground line-clamp-2">{e.description}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Ask the Logbook (AI) */}
              <div className="bg-white rounded-xl border border-border p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0A1628] to-[#2563EB] flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <div className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>Ask the Logbook</div>
                    <div className="text-[11px] text-muted-foreground">AI searches all logbook entries to answer your question</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20">
                    <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                      value={lbAIQuery}
                      onChange={e => setLbAIQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleLogbookAIQuery()}
                      placeholder="e.g. When was the last annual inspection? Any AD compliance items?"
                      className="flex-1 text-[12px] outline-none"
                    />
                  </div>
                  {lbSearchAircraftId && (
                    <div className="text-[11px] text-primary/70">
                      Scoped to: {aircraft.find(a => a.id === lbSearchAircraftId)?.tail_number}
                    </div>
                  )}
                  <button
                    onClick={handleLogbookAIQuery}
                    disabled={lbAILoading || !lbAIQuery.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#0A1628] to-[#2563EB] text-white py-2.5 rounded-lg text-[12px] hover:opacity-90 disabled:opacity-50 transition-opacity"
                    style={{ fontWeight: 600 }}
                  >
                    {lbAILoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…</> : <><Sparkles className="w-3.5 h-3.5" /> Ask AI</>}
                  </button>
                </div>
                {lbAIAnswer && (
                  <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[11px] text-primary" style={{ fontWeight: 600 }}>AI Answer</span>
                    </div>
                    <div className="text-[12px] text-slate-700 leading-relaxed">{lbAIAnswer}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : lb ? (
          <div className="flex-1 overflow-auto bg-[#F7F8FA] p-5">
            <div className="max-w-2xl space-y-4">
              <div className="bg-white rounded-xl border border-border p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>{lb.number}</span>
                      <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${lb.status === "signed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} style={{ fontWeight: 600 }}>
                        {lb.status}
                      </span>
                      {lb.linkedWO && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700" style={{ fontWeight: 600 }}>
                          {lb.linkedWO}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-muted-foreground">{lb.aircraft} · {lb.model} · {lb.type}</div>
                    {lb.customer && <div className="text-[11px] text-muted-foreground/70 mt-0.5">{lb.customer}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                    <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <Send className="w-3.5 h-3.5" /> Send
                    </button>
                  </div>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-3 gap-3 mb-4 bg-[#F7F8FA] rounded-lg p-3">
                  {[{ l: "Date", v: lb.date }, { l: "Hobbs", v: lb.hobbs + " hrs" }, { l: "Tach", v: lb.tach + " hrs" }].map((f) => (
                    <div key={f.l}>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>{f.l}</div>
                      <div className="text-[13px] text-foreground mt-0.5" style={{ fontWeight: 600 }}>{f.v}</div>
                    </div>
                  ))}
                </div>

                {/* Body */}
                <div className="mb-4">
                  <div className="text-[12px] text-muted-foreground mb-2 uppercase tracking-wider" style={{ fontWeight: 600 }}>Maintenance Description</div>
                  <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 text-[13px] text-foreground leading-relaxed whitespace-pre-line">{lb.body}</div>
                </div>

                {/* Certificate of Return to Service */}
                <div className="border-t border-border pt-4">
                  <div className="text-[12px] text-muted-foreground mb-2 uppercase tracking-wider" style={{ fontWeight: 600 }}>Certificate of Return to Service</div>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{lb.mechanic}</div>
                    <div className="text-[12px] text-muted-foreground">{lb.cert}</div>
                    {(lb.status === "signed" || signedLocalIds.includes(lb.id)) ? (
                      <div className="flex items-center gap-2 mt-2">
                        <Lock className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-[12px] text-emerald-700" style={{ fontWeight: 600 }}>
                          Digitally signed &amp; cryptographically sealed · {lb.status === "signed" ? lb.date : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    ) : (
                      /* Sign Entry button for drafts */
                      <button
                        onClick={() => setShowSignModal(true)}
                        className="mt-3 w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#1E3A5F]/25 text-[#1E3A5F] py-3 rounded-xl text-[13px] hover:bg-[#1E3A5F]/5 hover:border-[#1E3A5F]/40 transition-all"
                        style={{ fontWeight: 600 }}
                      >
                        <Shield className="w-4 h-4" /> Sign Entry
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Next Required Steps ── */}
              <div className="bg-white rounded-xl border border-border p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CheckSquare className="w-4 h-4 text-[#1E3A5F]" />
                  <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>Next Required Steps</div>
                  {!(lb.status === "signed" || signedLocalIds.includes(lb.id)) && (
                    <span className="ml-auto text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Sign entry first</span>
                  )}
                </div>
                <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {nextStepsList(lb).map((step, i) => {
                    const done = (lbNextSteps[lb.id] || [])[i] ?? false;
                    return (
                      <button
                        key={i}
                        onClick={() => toggleNextStep(lb.id, i)}
                        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${done ? "bg-[#0A1628] border-[#0A1628]" : "border-border bg-white"}`}>
                            {done && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                                <path d="M1.5 5L3.5 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-[13px] ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>{step.label}</span>
                        </div>
                        {step.required && !done && (
                          <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full ml-2 shrink-0" style={{ fontWeight: 700 }}>Required</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground bg-[#F7F8FA]">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0A1628] to-[#2563EB] flex items-center justify-center mx-auto mb-4 opacity-80">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <div className="text-[14px] text-foreground mb-1" style={{ fontWeight: 600 }}>Select an entry or generate a new one</div>
              <p className="text-[12px] text-muted-foreground mb-4 max-w-xs mx-auto">Use AI Canary to generate a fully compliant FAR 43.9 logbook entry in seconds.</p>
              <button
                onClick={() => setShowCanaryGenerator(true)}
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] mx-auto hover:bg-primary/90 transition-colors"
                style={{ fontWeight: 600 }}
              >
                <Sparkles className="w-4 h-4" /> Generate with AI Canary
              </button>
            </div>
          </div>
        )}

        {/* Legacy WO generator modal */}
        <AnimatePresence>
          {showLBGenerator && (
            <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
                <div className="bg-[#0A1628] px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5 text-white" />
                    <div>
                      <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>Generate from Work Order</div>
                      <div className="text-white/50 text-[12px]">AI reads WO scope, parts and notes</div>
                    </div>
                  </div>
                  <button onClick={() => { setShowLBGenerator(false); setLbGenStep("select"); setLbDraftText(""); }} className="p1.5 hover:bg-white/10 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-white/70" />
                  </button>
                </div>
                <div className="p-6">
                  {lbGenStep === "select" && (
                    <div className="space-y-4">
                      <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Select Work Order</h3>
                      <p className="text-[13px] text-muted-foreground">AI will read the work order scope, parts, and notes to generate a maintenance logbook entry.</p>
                      <select value={selectedWOForLB} onChange={(e) => setSelectedWOForLB(e.target.value)}
                        className="w-full border-2 border-border rounded-xl px-4 py-3 text-[14px] outline-none focus:border-primary transition-all bg-white" style={{ fontWeight: 500 }}>
                        <option value="WO-2026-0047">WO-2026-0047 — N67890 — Left brake caliper R&R</option>
                        <option value="WO-2026-0042">WO-2026-0042 — N12345 — Nav light wire repair</option>
                      </select>
                      <button onClick={handleGenerateLogbook} className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3.5 rounded-xl text-[14px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                        <Sparkles className="w-4 h-4" /> Generate with AI
                      </button>
                    </div>
                  )}
                  {lbGenStep === "generating" && (
                    <div className="flex flex-col items-center py-10">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Bot className="w-7 h-7 text-primary animate-pulse" />
                      </div>
                      <div className="text-[14px] text-foreground mb-1" style={{ fontWeight: 600 }}>Reading work order...</div>
                      <p className="text-[12px] text-muted-foreground text-center">AI is analyzing scope, parts, and approvals to draft your logbook entry.</p>
                    </div>
                  )}
                  {lbGenStep === "edit" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-[12px] text-emerald-800" style={{ fontWeight: 600 }}>Draft generated — review and edit before signing</span>
                      </div>
                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Maintenance Description</label>
                        <textarea value={lbDraftText} onChange={(e) => setLbDraftText(e.target.value)} rows={8}
                          className="w-full border border-border rounded-xl px-4 py-3 text-[12px] outline-none resize-none focus:ring-2 focus:ring-primary/20 leading-relaxed" />
                      </div>
                      <div className="bg-[#F7F8FA] rounded-xl border border-border p-4">
                        <div className="text-[12px] text-foreground mb-3" style={{ fontWeight: 600 }}>Certificate of Return to Service</div>
                        <div className="grid grid-cols-2 gap-3 text-[12px]">
                          <div><div className="text-muted-foreground mb-1">Mechanic Name</div><div className="border border-border rounded-lg px-3 py-2 bg-white text-foreground" style={{ fontWeight: 500 }}>{activeMechanic.name}</div></div>
                          <div><div className="text-muted-foreground mb-1">Certificate Number</div><div className="border border-border rounded-lg px-3 py-2 bg-white text-foreground" style={{ fontWeight: 500 }}>{activeMechanic.cert}</div></div>
                        </div>
                      </div>
                      <button onClick={handleSignLogbook} disabled={lbSigning}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3.5 rounded-xl text-[14px] hover:bg-emerald-700 disabled:opacity-50 transition-colors" style={{ fontWeight: 600 }}>
                        {lbSigning ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing...</> : <><Lock className="w-4 h-4" /> Sign &amp; Finalize</>}
                      </button>
                    </div>
                  )}
                  {lbGenStep === "signed" && (
                    <div className="flex flex-col items-center py-8">
                      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-emerald-600" />
                      </div>
                      <div className="text-[18px] text-foreground mb-1" style={{ fontWeight: 700 }}>Entry Signed</div>
                      <p className="text-[13px] text-muted-foreground text-center mb-5">Logbook entry has been digitally signed and filed. It has been attached to {selectedWOForLB === "WO-2026-0047" ? "N67890" : "N12345"}'s aircraft record.</p>
                      <div className="flex gap-2">
                        <button className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}><Download className="w-3.5 h-3.5" /> PDF</button>
                        <button className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}><Mail className="w-3.5 h-3.5" /> Email to Owner</button>
                        <button onClick={() => { setShowLBGenerator(false); setLbGenStep("select"); setLbDraftText(""); }} className="px-4 py-2 rounded-lg bg-primary text-white text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>Done</button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Logbook Sign Modal ── */}
      <AnimatePresence>
        {showSignModal && lb && (
          <LogbookSignModal
            entryId={lb.id}
            entryNumber={lb.number}
            aircraft={lb.aircraft}
            mechanic={lb.mechanic || activeMechanic.name}
            cert={lb.cert || activeMechanic.cert}
            onCancel={() => setShowSignModal(false)}
            onSigned={(id) => {
              setSignedLocalIds(prev => [...prev, id]);
              setShowSignModal(false);
              toast.success("Entry signed & sealed", {
                description: `${lb.number} · ${lb.aircraft} — cryptographically sealed`,
              });
            }}
          />
        )}
      </AnimatePresence>

      {/* Canary AI generator (full drawer) */}
      <AnimatePresence>
        {showCanaryGenerator && (
          <LogbookCanaryGenerator
            onClose={() => setShowCanaryGenerator(false)}
            onSaved={(entry) => {
              setSelectedLBId(entry.id);
              setShowCanaryGenerator(false);
            }}
            activeMechanicName={activeMechanic.name}
            activeMechanicCert={activeMechanic.cert}
          />
        )}
      </AnimatePresence>
      </>
    );
  }

  function renderCustomers() {
    const disabledCount = customerAccessList.filter(c => !c.enabled).length;

    return (
      <div className="p-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Customers</h2>
            <p className="text-[12px] text-muted-foreground">
              {customerAccessList.filter(c => c.enabled).length} active · {disabledCount} access off
            </p>
          </div>
          <button className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>

        {/* Info banner */}
        <div className="mb-5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[12px] text-blue-700">
          <span style={{ fontWeight: 600 }}>Access Control:</span> Toggle a customer <span style={{ fontWeight: 600 }}>off</span> to hide all their aircraft, squawks, and work orders from your portal. Records stay intact — re-enable at any time.
        </div>

        <div className="space-y-4">
          {CUSTOMERS_DATA.map((c) => {
            const access   = customerAccessList.find(a => a.customerId === c.id);
            const isEnabled = access?.enabled ?? true;

            return (
              <div key={c.id} className={`bg-white rounded-xl border transition-all ${isEnabled ? "border-border" : "border-slate-200 opacity-60"}`}>
                <div className="p-5">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${isEnabled ? "bg-primary/10" : "bg-muted"}`}>
                        {c.company
                          ? <Building2 className={`w-5 h-5 ${isEnabled ? "text-primary" : "text-muted-foreground/40"}`} />
                          : <User className={`w-5 h-5 ${isEnabled ? "text-primary" : "text-muted-foreground/40"}`} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{c.name}</span>
                          {!isEnabled && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Access Off</span>
                          )}
                          {c.tags.map(t => (
                            <span key={t} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded" style={{ fontWeight: 500 }}>{t}</span>
                          ))}
                        </div>
                        {c.company && <div className="text-[12px] text-muted-foreground">{c.company}</div>}
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-[15px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>${c.billed.toLocaleString()}</div>
                        <div className="text-[11px] text-muted-foreground">total billed</div>
                        {c.outstanding > 0 && (
                          <div className="text-[11px] text-orange-600 mt-0.5" style={{ fontWeight: 600 }}>${c.outstanding.toLocaleString()} outstanding</div>
                        )}
                      </div>
                      {/* Access toggle */}
                      <button
                        onClick={() => toggleCustomerAccess(c.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] transition-all mt-0.5"
                        style={{
                          fontWeight: 600,
                          borderColor: isEnabled ? "rgb(16 185 129 / 0.3)" : "rgb(203 213 225)",
                          background:  isEnabled ? "rgb(240 253 244)"       : "rgb(248 250 252)",
                          color:       isEnabled ? "rgb(4 120 87)"           : "rgb(100 116 139)",
                        }}
                      >
                        <span className={`w-2 h-2 rounded-full inline-block ${isEnabled ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {isEnabled ? "Active" : "Off"}
                      </button>
                    </div>
                  </div>

                  {/* Aircraft chips */}
                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>Aircraft:</span>
                    {c.aircraft.map(tail => (
                      <span
                        key={tail}
                        className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border ${
                          isEnabled
                            ? "bg-primary/5 border-primary/20 text-primary"
                            : "bg-muted/30 border-border text-muted-foreground/50"
                        }`}
                        style={{ fontWeight: 600 }}
                      >
                        <Plane className="w-3 h-3" />{tail}
                        {!isEnabled && <span className="ml-1 text-[9px]">hidden</span>}
                      </span>
                    ))}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border text-[12px]">
                    <div><div className="text-muted-foreground">Work Orders</div><div className="text-foreground" style={{ fontWeight: 600 }}>{c.wos}</div></div>
                    <div><div className="text-muted-foreground">Last Service</div><div className="text-foreground" style={{ fontWeight: 600 }}>{c.lastService}</div></div>
                    <div>
                      <div className="text-muted-foreground">Portal Status</div>
                      <div className={`text-[11px] mt-0.5 ${isEnabled ? "text-emerald-600" : "text-slate-400"}`} style={{ fontWeight: 600 }}>
                        {isEnabled ? "✓ Visible in your portal" : "Hidden from your portal"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {disabledCount > 0 && (
          <div className="mt-5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[12px] text-slate-600">
            <span style={{ fontWeight: 600 }}>{disabledCount} customer{disabledCount > 1 ? "s" : ""} hidden</span> — their aircraft and work orders are not shown in your portal. Enable access to see their records.
          </div>
        )}
      </div>
    );
  }

  function renderTeam() {
    const LICENSE_TYPES = ["A&P/IA", "A&P Mechanic", "Student A&P", "None"] as const;
    const ROLE_COLORS: Record<string, string> = {
      "Lead Mechanic / IA": "bg-blue-100 text-blue-700",
      "Mechanic": "bg-violet-100 text-violet-700",
      "Apprentice Mechanic": "bg-slate-100 text-slate-600",
      "Read Only": "bg-muted text-muted-foreground",
    };

    const editMember = editMemberId ? team.find(m => m.id === editMemberId) : null;

    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Team</h2>
            <p className="text-[12px] text-muted-foreground">{team.filter(m => m.status === "Active").length} active · {team.filter(m => m.status === "Invited").length} pending</p>
          </div>
          <button onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 bg-primary text-white px-3 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
            <Plus className="w-4 h-4" /> Invite Mechanic
          </button>
        </div>

        <div className="space-y-3">
          {team.map((m) => (
            <div key={m.id} className="bg-white rounded-xl border border-border p-5">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className={`w-12 h-12 rounded-full ${m.color} flex items-center justify-center shrink-0 text-[15px]`} style={{ fontWeight: 700 }}>
                  {m.initials}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{m.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${ROLE_COLORS[m.role] || "bg-muted text-muted-foreground"}`} style={{ fontWeight: 600 }}>{m.role}</span>
                    {m.licenseType !== "None" && m.licenseType !== "Student A&P" && (
                      <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700" style={{ fontWeight: 600 }}>
                        <BadgeCheck className="w-3 h-3" /> {m.licenseType}
                      </span>
                    )}
                    {m.licenseType === "Student A&P" && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700" style={{ fontWeight: 600 }}>Student A&P</span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${m.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`} style={{ fontWeight: 600 }}>{m.status}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-2 text-[12px]">
                    <div>
                      <div className="text-muted-foreground">Email</div>
                      <div style={{ fontWeight: 500 }} className="text-foreground truncate">{m.email}</div>
                    </div>
                    {(m.licenseType === "A&P/IA" || m.licenseType === "A&P Mechanic") && (
                      <div>
                        <div className="text-muted-foreground">License #</div>
                        <div style={{ fontWeight: 600 }} className="text-foreground">{m.licenseNumber || "—"}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-muted-foreground">Labor Rate</div>
                      <div style={{ fontWeight: 700 }} className="text-foreground">${m.rate}/hr</div>
                    </div>
                    {m.specialty && (
                      <div>
                        <div className="text-muted-foreground">Specialty</div>
                        <div style={{ fontWeight: 500 }} className="text-foreground">{m.specialty}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setEditMemberId(m.id === editMemberId ? null : m.id)}
                    className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground">
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Inline edit panel */}
              <AnimatePresence>
                {editMemberId === m.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="border-t border-border mt-4 pt-4 overflow-hidden">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Role</label>
                        <select value={m.role} onChange={e => updateMember(m.id, { role: e.target.value as any, permissions: { ...m.permissions } })}
                          className="w-full border border-border rounded-xl px-3 py-2 text-[12px] outline-none bg-white focus:ring-2 focus:ring-primary/20">
                          {["Lead Mechanic / IA", "Mechanic", "Apprentice Mechanic", "Read Only"].map(r => <option key={r}>{r}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>License Type</label>
                        <select value={m.licenseType} onChange={e => updateMember(m.id, { licenseType: e.target.value as any })}
                          className="w-full border border-border rounded-xl px-3 py-2 text-[12px] outline-none bg-white focus:ring-2 focus:ring-primary/20">
                          {LICENSE_TYPES.map(lt => <option key={lt}>{lt}</option>)}
                        </select>
                      </div>
                      {(m.licenseType === "A&P/IA" || m.licenseType === "A&P Mechanic") && (
                        <div>
                          <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>License Number <span className="text-red-500">*</span></label>
                          <input value={m.licenseNumber}
                            onChange={e => updateMember(m.id, { licenseNumber: e.target.value })}
                            placeholder="FAA certificate #"
                            className="w-full border border-border rounded-xl px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                      )}
                      <div>
                        <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Labor Rate ($/hr)</label>
                        <input type="number" min="0" value={m.rate}
                          onChange={e => updateMember(m.id, { rate: parseFloat(e.target.value) || 0 })}
                          className="w-full border border-border rounded-xl px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" style={{ fontWeight: 600 }} />
                      </div>
                      <div>
                        <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Specialty</label>
                        <input value={m.specialty || ""}
                          onChange={e => updateMember(m.id, { specialty: e.target.value })}
                          placeholder="e.g. Powerplant, Avionics"
                          className="w-full border border-border rounded-xl px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <button onClick={() => { removeTeamMember(m.id); setEditMemberId(null); toast.success(`${m.name} removed from team`); }}
                        className="text-[12px] text-red-500 hover:text-red-700 flex items-center gap-1" style={{ fontWeight: 500 }}>
                        Remove from team
                      </button>
                      <button onClick={() => setEditMemberId(null)}
                        className="bg-primary text-white px-4 py-2 rounded-xl text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                        Done
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Invite Modal */}
        <AnimatePresence>
          {showInviteModal && <InviteTeamMemberModal onClose={() => setShowInviteModal(false)} onInvite={(m) => { addTeamMember(m); setShowInviteModal(false); toast.success(`Invitation sent to ${m.email}`); }} />}
        </AnimatePresence>
      </div>
    );
  }
  function renderParts() { return <PartsSection />; }

  const sectionRenderers: Record<MechanicSection, () => JSX.Element> = {
    dashboard: renderDashboard,
    aircraft: renderAircraft,
    squawks: renderSquawks,
    estimates: renderEstimates,
    workorders: renderWorkOrders,
    invoices: renderInvoices,
    logbook: renderLogbook,
    parts: renderParts,
    customers: renderCustomers,
    team: renderTeam,
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F7F8FA]">
      {/* Main content — nav is in AppLayout sidebar */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        <div className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="h-full flex flex-col"
            >
              {sectionRenderers[section]()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Add Aircraft Modal */}
      <AnimatePresence>
        {showAddAircraft && (
          <AddAircraftModal
            onClose={() => setShowAddAircraft(false)}
            assignedAircraft={ASSIGNED_AIRCRAFT}
            customersData={CUSTOMERS_DATA}
            tailToCustomerId={TAIL_TO_CUSTOMER_ID}
            onNavigateToAircraft={(tail) => { setSelectedAircraft(tail); setSection("aircraft"); }}
          />
        )}
      </AnimatePresence>

      {/* New Invoice Modal */}
      <AnimatePresence>
        {showNewInvoice && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={resetNewInvoice}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-[560px] max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="bg-[#0A1628] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Receipt className="w-5 h-5 text-white" />
                  <div>
                    <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>Create Invoice</div>
                    <div className="text-white/50 text-[12px]">
                      {!newInvType ? "Choose invoice type"
                        : newInvType === "wo" ? "Work Order — review & create"
                        : invFaaStep === "tail" ? "Custom — enter aircraft N-number"
                        : invFaaStep === "searching" ? "Looking up FAA registry…"
                        : invFaaStep === "found" ? "FAA registry matched — verify customer"
                        : "Custom Invoice"}
                    </div>
                  </div>
                </div>
                <button onClick={resetNewInvoice} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-white/70" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto" style={{ maxHeight: "70vh" }}>
                <AnimatePresence mode="wait">

                  {/* ── Step 1: Choose type ── */}
                  {!newInvType && (
                    <motion.div key="type" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.12 }}>
                      <p className="text-[13px] text-muted-foreground mb-5">Is this invoice tied to a specific work order, or a standalone custom invoice?</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setNewInvType("wo")}
                          className="p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                            <Wrench className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>Work Order</div>
                          <div className="text-[11px] text-muted-foreground mt-1">Link to a WO — auto-fills aircraft, customer, and all line items</div>
                        </button>
                        <button onClick={() => { setNewInvType("custom"); setInvFaaStep("tail"); }}
                          className="p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group">
                          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mb-3 group-hover:bg-violet-100 transition-colors">
                            <FileText className="w-5 h-5 text-violet-600" />
                          </div>
                          <div className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>Custom</div>
                          <div className="text-[11px] text-muted-foreground mt-1">N-number → FAA lookup → AI-generate line items</div>
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* ── Step 2a: WO-linked with real line items ── */}
                  {newInvType === "wo" && (
                    <motion.div key="wo" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.12 }} className="space-y-4">
                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Work Order</label>
                        <select value={newInvLinkedWO} onChange={(e) => setNewInvLinkedWO(e.target.value)}
                          className="w-full border border-border rounded-xl px-4 py-2.5 text-[13px] outline-none bg-white focus:ring-2 focus:ring-primary/20">
                          {WOS_FOR_INV.map(w => (
                            <option key={w.wo} value={w.wo}>{w.wo} — {w.tail} · {w.customer}</option>
                          ))}
                        </select>
                      </div>
                      {(() => {
                        const wo = WOS_FOR_INV.find(w => w.wo === newInvLinkedWO)!;
                        const existingInv = MECHANIC_INVOICES.find(i => i.linkedWO === newInvLinkedWO);
                        return (
                          <>
                            <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 space-y-1.5 text-[12px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">Aircraft</span><span style={{ fontWeight: 600 }}>{wo.tail} — {wo.model}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span style={{ fontWeight: 600 }}>{wo.customer}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{wo.email}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{wo.phone}</span></div>
                            </div>
                            {existingInv && (
                              <div>
                                <div className="text-[12px] text-foreground mb-2" style={{ fontWeight: 600 }}>Line Items (from Work Order)</div>
                                <div className="border border-border rounded-xl overflow-hidden divide-y divide-border text-[12px]">
                                  {existingInv.laborLines.map((l, i) => (
                                    <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-white">
                                      <span className="text-foreground flex-1 truncate">{l.desc}</span>
                                      <span className="text-muted-foreground ml-2 shrink-0">{l.hours}h @ ${l.rate}</span>
                                      <span className="ml-3 shrink-0" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</span>
                                    </div>
                                  ))}
                                  {existingInv.partsLines.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-white">
                                      <div className="flex-1 min-w-0">
                                        <span className="text-foreground">{p.desc}</span>
                                        <span className="text-muted-foreground ml-1 text-[10px]">{p.pn}</span>
                                      </div>
                                      <span className="text-muted-foreground ml-2 shrink-0">×{p.qty}</span>
                                      <span className="ml-3 shrink-0" style={{ fontWeight: 600 }}>${p.total.toFixed(2)}</span>
                                    </div>
                                  ))}
                                  <div className="flex justify-between px-3 py-2.5 bg-[#F7F8FA]">
                                    <span className="text-muted-foreground">Subtotal</span>
                                    <span style={{ fontWeight: 700 }}>${existingInv.amount.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setNewInvType(null)} className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Back</button>
                        <button onClick={handleCreateInvoice}
                          className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                          <Receipt className="w-3.5 h-3.5" /> Create Invoice Draft
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* ── Custom — Tail entry ── */}
                  {newInvType === "custom" && invFaaStep === "tail" && (
                    <motion.div key="custom-tail" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.12 }} className="space-y-4">
                      <p className="text-[13px] text-muted-foreground">Enter the aircraft N-number. We'll look it up in the FAA registry to auto-fill the registered owner.</p>
                      {(invFaaNotFound || invFaaError) && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700" style={{ fontWeight: 500 }}>
                          {isFaaTemporarilyUnavailable(invFaaError)
                            ? "FAA registry is temporarily unavailable. You can retry, or continue with manual customer details."
                            : "Aircraft not found in FAA registry — check the N-number and try again."}
                        </div>
                      )}
                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>N-Number <span className="text-red-500">*</span></label>
                        <input
                          value={invFaaTail}
                          onChange={e => { setInvFaaTail(e.target.value.toUpperCase()); setInvFaaNotFound(false); setInvFaaError(null); }}
                          onKeyDown={e => e.key === "Enter" && invFaaTail.trim() && handleInvFaaLookup()}
                          placeholder="e.g. N45678"
                          className="w-full border border-border rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 tracking-widest"
                          style={{ fontWeight: 600 }}
                          autoFocus
                        />
                        <p className="text-[11px] text-muted-foreground mt-1.5">Try: N45678, N55200, N88321</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setNewInvType(null)} className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Back</button>
                        <button onClick={handleInvFaaLookup} disabled={!invFaaTail.trim()}
                          className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
                          <Search className="w-3.5 h-3.5" /> Look Up Aircraft
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* ── Custom — Searching ── */}
                  {newInvType === "custom" && invFaaStep === "searching" && (
                    <motion.div key="custom-searching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center py-12 gap-4">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Searching FAA Registry…</div>
                      <div className="text-[12px] text-muted-foreground">Looking up {invFaaTail}…</div>
                    </motion.div>
                  )}

                  {/* ── Custom — FAA found + customer + notes + AI generate ── */}
                  {newInvType === "custom" && invFaaStep === "found" && invFaaData && !invGenerated && !invGenerating && (
                    <motion.div key="custom-faa" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.12 }} className="space-y-4">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1.5 text-[12px]">
                        <div className="flex items-center gap-2 mb-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <span className="text-emerald-800" style={{ fontWeight: 600 }}>FAA Registry Match — {invFaaTail}</span>
                        </div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Make / Model</span><span style={{ fontWeight: 500 }}>{invFaaData.aircraft.manufacturer} {invFaaData.aircraft.model}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Year</span><span style={{ fontWeight: 500 }}>{invFaaData.aircraft.year}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Registered Owner</span><span style={{ fontWeight: 600 }}>{invFaaData.registrant.name}</span></div>
                      </div>

                      <div className="space-y-3">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>Active Customer</div>
                        <div>
                          <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Name</label>
                          <input value={newInvCustomCustomer} onChange={e => setNewInvCustomCustomer(e.target.value)}
                            placeholder="Customer name"
                            className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Email</label>
                            <input value={newInvCustomEmail} onChange={e => setNewInvCustomEmail(e.target.value)}
                              type="email" placeholder="email@example.com"
                              className="w-full border border-border rounded-xl px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                          </div>
                          <div>
                            <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Phone</label>
                            <input value={invCustomPhone} onChange={e => setInvCustomPhone(e.target.value)}
                              placeholder="(512) 555-0100"
                              className="w-full border border-border rounded-xl px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Scope Notes</label>
                        <div className="relative">
                          <textarea value={newInvNotes} onChange={e => setNewInvNotes(e.target.value)}
                            rows={3} placeholder="Describe services, parts, or squawks to include…"
                            className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20 pr-10" />
                          <button className="absolute right-2.5 bottom-2.5 text-muted-foreground hover:text-primary transition-colors">
                            <Mic className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => { setInvFaaStep("tail"); setInvFaaData(null); }}
                          className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                          Back
                        </button>
                        <button onClick={handleGenerateInvoiceLines} disabled={!newInvCustomCustomer.trim()}
                          className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-[#0A1628] to-[#2563EB] text-white py-2.5 rounded-xl text-[13px] hover:opacity-90 disabled:opacity-40 transition-opacity" style={{ fontWeight: 600 }}>
                          <Sparkles className="w-3.5 h-3.5" /> Generate Invoice with AI
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* ── Custom — AI Generating ── */}
                  {newInvType === "custom" && invGenerating && (
                    <motion.div key="custom-generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center py-12 gap-4">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="w-7 h-7 text-primary animate-pulse" />
                      </div>
                      <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>AI is building your invoice…</div>
                      <p className="text-[12px] text-muted-foreground text-center max-w-xs">Reading squawks, matching labor rates, and generating line items.</p>
                      <div className="flex gap-1.5 mt-2">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* ── Custom — Review generated line items ── */}
                  {newInvType === "custom" && invFaaStep === "found" && invGenerated && !invGenerating && (
                    <motion.div key="custom-review" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.12 }} className="space-y-4">
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-[12px] text-emerald-800" style={{ fontWeight: 600 }}>Invoice generated — review and edit before creating</span>
                      </div>

                      <div className="bg-[#F7F8FA] rounded-xl border border-border p-3 text-[12px] space-y-1">
                        <div className="flex justify-between"><span className="text-muted-foreground">Aircraft</span><span style={{ fontWeight: 600 }}>{invFaaTail}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span style={{ fontWeight: 600 }}>{newInvCustomCustomer}</span></div>
                        {newInvCustomEmail && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{newInvCustomEmail}</span></div>}
                      </div>

                      {invLaborLines.length > 0 && (
                        <div>
                          <div className="text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Labor</div>
                          <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                            {invLaborLines.map((l, i) => (
                              <div key={l.id} className="flex items-center gap-2 px-3 py-2.5 bg-white">
                                <input
                                  value={l.desc}
                                  onChange={e => setInvLaborLines(prev => prev.map((x, xi) => xi === i ? { ...x, desc: e.target.value } : x))}
                                  className="text-[12px] flex-1 outline-none text-foreground min-w-0 truncate"
                                />
                                <div className="flex items-center gap-1 shrink-0 text-[11px]">
                                  <input
                                    type="number"
                                    value={l.hours}
                                    onChange={e => {
                                      const hrs = parseFloat(e.target.value) || 0;
                                      setInvLaborLines(prev => prev.map((x, xi) => xi === i ? { ...x, hours: hrs, total: hrs * x.rate } : x));
                                    }}
                                    className="w-10 border border-border rounded px-1 py-0.5 text-center outline-none text-[11px]"
                                  />
                                  <span className="text-muted-foreground">h</span>
                                </div>
                                <span className="text-[12px] shrink-0" style={{ fontWeight: 600 }}>${l.total.toFixed(0)}</span>
                                <button onClick={() => setInvLaborLines(prev => prev.filter((_, xi) => xi !== i))} className="text-muted-foreground hover:text-red-500 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => setInvLaborLines(prev => [...prev, { id: `l-${Date.now()}`, desc: "Additional service", hours: 1, rate: 125, total: 125 }])}
                            className="mt-1.5 text-[11px] text-primary flex items-center gap-1 hover:underline" style={{ fontWeight: 500 }}>
                            <Plus className="w-3 h-3" /> Add Labor Line
                          </button>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>Parts & Materials</div>
                          <button
                            onClick={() => { setPartPickerAircraft(invFaaTail || newInvCustomAircraft); setPartPickerMode("all"); setShowPartPicker(true); }}
                            className="text-[11px] text-primary flex items-center gap-1 hover:underline" style={{ fontWeight: 500 }}>
                            <Plus className="w-3 h-3" /> Add Part
                          </button>
                        </div>
                        {invPartsLines.length > 0 && (
                          <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                            {invPartsLines.map((p, i) => (
                              <div key={p.id} className="flex items-center gap-2 px-3 py-2.5 bg-white">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[12px] text-foreground truncate">{p.desc}</div>
                                  <div className="text-[10px] text-muted-foreground">{p.pn}</div>
                                </div>
                                <span className="text-muted-foreground text-[11px] shrink-0">×{p.qty}</span>
                                <span className="text-[12px] shrink-0" style={{ fontWeight: 600 }}>${p.total.toFixed(2)}</span>
                                <button onClick={() => setInvPartsLines(prev => prev.filter((_, xi) => xi !== i))} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {(() => {
                        const labor = invLaborLines.reduce((s, l) => s + l.total, 0);
                        const parts = invPartsLines.reduce((s, p) => s + p.total, 0);
                        const subtotal = labor + parts;
                        const tax = subtotal * 0.075;
                        return (
                          <div className="bg-[#F7F8FA] rounded-xl border border-border p-3 text-[12px] space-y-1">
                            <div className="flex justify-between"><span className="text-muted-foreground">Labor</span><span>${labor.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Parts</span><span>${parts.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Tax (7.5%)</span><span>${tax.toFixed(2)}</span></div>
                            <div className="flex justify-between border-t border-border pt-1.5 mt-1">
                              <span style={{ fontWeight: 700 }}>Total</span>
                              <span className="text-[14px]" style={{ fontWeight: 700 }}>${(subtotal + tax).toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex gap-2">
                        <button onClick={() => setInvGenerated(false)} className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Back</button>
                        <button onClick={handleCreateInvoice} disabled={!newInvCustomCustomer.trim()}
                          className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
                          <Receipt className="w-3.5 h-3.5" /> Create Invoice Draft
                        </button>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Part Picker Modal ── */}
      <AnimatePresence>
        {showPartPicker && (
          <PartPickerModal
            aircraft={partPickerAircraft}
            mode={partPickerMode}
            onClose={() => setShowPartPicker(false)}
            onAdd={(picked) => {
              if (partPickerTarget === "invoice" && selectedInvId) {
                const inv = [...MECHANIC_INVOICES, ...savedMechInvoices].find(i => i.id === selectedInvId);
                setInvoiceDetailParts(prev => ({
                  ...prev,
                  [selectedInvId]: [
                    ...(prev[selectedInvId] || []),
                    { pn: picked.pn, desc: picked.desc, qty: picked.qty, price: picked.price, total: picked.total }
                  ]
                }));
                // Deduct stock if from inventory
                if (picked.savedPartId) deductStock(picked.savedPartId, picked.qty);
                toast.success(`${picked.pn} added to invoice`, { description: `×${picked.qty} · $${picked.total.toFixed(2)}` });
              }
              setShowPartPicker(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
