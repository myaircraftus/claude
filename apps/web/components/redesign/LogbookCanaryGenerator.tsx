"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Sparkles, Bot, CheckCircle, Lock, Loader2, Plane,
  Wrench, FileText, Mail, Phone, Download, Send, Save,
  UserPlus, Mic, MicOff, ChevronDown, ChevronLeft,
  AlertCircle, RefreshCw, Printer, Share2, Building2, Shield
} from "lucide-react";
import {
  lookupAircraftByNNumber,
  FaaLookupResult,
} from "./faaRegistryService";
import { useDataStore, type WorkOrder } from "./workspace/DataStore";
import {
  formatCertificateClass,
  formatCertificateStatus,
  formatEngineLabel,
  formatHorsepower,
  formatRegistrantLocation,
  formatTbo,
  isValidCertificate,
} from "./faaDisplay";

/* ─── Types ─────────────────────────────────────────────────── */
export interface LogbookEntry {
  id: string;
  number: string;
  aircraft: string;
  model: string;
  entryType: string;
  date: string;
  hobbs: number;
  tach: number;
  mechanic: string;
  cert: string;
  status: "draft" | "signed";
  body: string;
  customer?: string;
  customerEmail?: string;
  linkedWO?: string;
  checklistTemplateKey?: string | null;
  checklistTemplateLabel?: string | null;
  checklistSourceReferences?: string[];
  shopChecklistReferences?: string[];
  shopLogbookReferences?: string[];
  openRequiredChecklistItems?: string[];
  nextDueInterval?: string | null;
  requires337?: boolean;
  draftId?: string | null;
}

type MaintenanceGenerateSourceContext = {
  organization_name?: string;
  checklist_template_key?: string | null;
  checklist_template_label?: string | null;
  checklist_reference_names?: string[];
  logbook_reference_names?: string[];
  work_order_checklist?: {
    templateKey?: string | null;
    templateLabel?: string | null;
    requiredCount?: number;
    completedRequiredCount?: number;
    completedItems?: string[];
    openRequiredItems?: string[];
    sourceReferences?: string[];
  } | null;
}

type MaintenanceGenerateResponse = {
  error?: string;
  formatted_entry?: string;
  structured_fields?: Record<string, any> | null;
  warnings?: string[];
  notes?: string | null;
  draft_id?: string | null;
  source_context?: MaintenanceGenerateSourceContext | null;
}

interface Props {
  onClose: () => void;
  onSaved: (entry: LogbookEntry) => void;
  activeMechanicName: string;
  activeMechanicCert: string;
}

// ─── FAA result type (from faaRegistryService) ───────────────
type FoundFaaResult = Extract<FaaLookupResult, { found: true }>;

/* ─── Entry types ────────────────────────────────────────────── */
type EntryTypeOption = { value: string; label: string };
type EntryTypeGroup = { group: string; types: EntryTypeOption[] };

const ENTRY_TYPE_GROUPS: EntryTypeGroup[] = [
  {
    group: "Inspections",
    types: [
      { value: "annual", label: "Annual inspection" },
      { value: "100hr", label: "100-hour inspection" },
      { value: "progressive", label: "Progressive inspection" },
      { value: "phase", label: "Phase inspection" },
    ],
  },
  {
    group: "Routine Maintenance",
    types: [
      { value: "oil_change", label: "Oil change" },
      { value: "tire_replacement", label: "Tire replacement" },
      { value: "battery_replacement", label: "Battery replacement" },
      { value: "preventive_maintenance", label: "Preventive maintenance" },
    ],
  },
  {
    group: "Airframe / Engine / Propeller",
    types: [
      { value: "airframe_maintenance", label: "Airframe maintenance" },
      { value: "engine_maintenance", label: "Engine maintenance" },
      { value: "propeller_maintenance", label: "Propeller maintenance" },
      { value: "major_repair", label: "Major repair" },
      { value: "major_alteration", label: "Major alteration" },
      { value: "return_to_service", label: "Return to service" },
    ],
  },
  {
    group: "Avionics / Electrical",
    types: [
      { value: "avionics_install", label: "Avionics installation" },
      { value: "transponder_inspection", label: "Transponder inspection" },
      { value: "elt_inspection", label: "ELT inspection" },
    ],
  },
  {
    group: "Compliance",
    types: [
      { value: "ad_compliance", label: "AD compliance" },
      { value: "inspection_correction", label: "Inspection / discrepancy correction" },
    ],
  },
  {
    group: "Other",
    types: [
      { value: "other", label: "Other / custom" },
    ],
  },
];

const ENTRY_TYPE_OPTIONS = ENTRY_TYPE_GROUPS.flatMap((g) => g.types);
const ENTRY_TYPE_LABELS = new Map(ENTRY_TYPE_OPTIONS.map((t) => [t.value, t.label]));

type WorkOrderOption = {
  id: string;
  label: string;
  aircraft: string;
  model: string;
  customer: string;
  email: string;
  hobbs: number;
  tach: number;
  workOrder: WorkOrder;
};

const ENTRY_TYPE_ALIAS: Record<string, string> = {
  "100hr": "100hr",
  "100_hour": "100hr",
  "100-hour": "100hr",
  "annual": "annual",
  "oil_change": "oil_change",
  "oil": "oil_change",
  "ad_compliance": "ad_compliance",
  "ad": "ad_compliance",
  "major_repair": "major_repair",
  "major_alteration": "major_alteration",
  "return_to_service": "return_to_service",
  "inspection_correction": "inspection_correction",
  "repair": "inspection_correction",
  "maintenance": "airframe_maintenance",
  "overhaul": "engine_maintenance",
  "other": "other",
};

function normalizeEntryTypeValue(value?: string | null): string | null {
  if (!value) return null;
  const key = value.toLowerCase().replace(/\s+/g, "_");
  if (ENTRY_TYPE_LABELS.has(key)) return key;
  return ENTRY_TYPE_ALIAS[key] ?? null;
}

function entryTypeLabel(value?: string | null): string {
  if (!value) return "";
  return ENTRY_TYPE_LABELS.get(value) ?? value;
}

/* ─── AI Draft generator ─────────────────────────────────────── */
function generateLogbookDraft(
  entryType: string,
  aircraft: string,
  faaData: FoundFaaResult | null,
  notes: string,
  mechanic: string,
  cert: string,
  woId?: string,
  woData?: WorkOrderOption,
): string {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const make = faaData?.aircraft?.manufacturer || "";
  const model = faaData?.aircraft?.model || woData?.model || "Aircraft";
  const makeModel = [make, model].filter(Boolean).join(" ") || model;
  const engineMake = faaData?.engine?.manufacturer || "";
  const engineModel = faaData?.engine?.model || "";
  const engine = [engineMake, engineModel].filter(Boolean).join(" ") || "installed engine";
  const serial = faaData?.aircraft?.serialNumber ? `S/N ${faaData.aircraft.serialNumber}` : "";
  const entryLabel = entryType || "Maintenance";

  const notesSection = notes.trim()
    ? `\n\nAdditional notes: ${notes.trim()}`
    : "";

  const templates: Record<string, string> = {
    "Annual inspection": `I certify that this aircraft has been inspected on ${today} in accordance with an annual inspection and was found to be in airworthy condition.\n\nAircraft: ${aircraft} — ${makeModel} ${serial}\nEngine: ${engine}\n\nAnnual inspection performed in accordance with FAR 43 Appendix D and applicable manufacturer's maintenance instructions. All items on the inspection checklist were inspected and found satisfactory, or repaired/replaced as noted below.${notesSection}\n\nAircraft returned to service per FAR 43.9 and 43.11.\nAirworthiness determination: AIRWORTHY`,

    "100-hour inspection": `I certify that this aircraft has been inspected on ${today} in accordance with a 100-hour inspection and was found to be in airworthy condition.\n\nAircraft: ${aircraft} — ${makeModel} ${serial}\nEngine: ${engine}\n\n100-hour inspection performed in accordance with FAR 43 Appendix D and the applicable manufacturer's maintenance manual. All inspection items checked satisfactory.${notesSection}\n\nAircraft returned to service per FAR 43.9 and 43.11.\nAirworthiness determination: AIRWORTHY`,

    "Oil change": `Oil and filter change performed on ${today}.\n\nAircraft: ${aircraft} — ${makeModel} ${serial}\nEngine: ${engine}\n\nDrained engine oil and removed oil filter. Oil filter cut open and inspected — no metal contamination found. New oil filter installed per manufacturer's spec. Refilled with approved engine oil per applicable service data. Engine run-up performed — oil pressure and temperature normal. Inspected for leaks — none found.${notesSection}\n\nAircraft returned to service per FAR 43.9.\nAirworthiness determination: AIRWORTHY`,

    "AD compliance": `Airworthiness Directive compliance performed on ${today}.\n\nAircraft: ${aircraft} — ${makeModel} ${serial}\nEngine: ${engine}\n\nComplied with applicable Airworthiness Directive per the requirements set forth therein. Inspection/modification performed per the prescribed method. Records updated to reflect compliance. Aircraft found to be in airworthy condition following compliance.${notesSection}\n\nAircraft returned to service per FAR 43.9 and 43.11.\nAD compliance status: COMPLIED`,
  };

  // Use specific template or default
  const body = templates[entryLabel] || `${entryLabel} performed on ${today}.\n\nAircraft: ${aircraft} — ${makeModel} ${serial}\nEngine: ${engine}\n\nMaintenance performed in accordance with applicable FAA-approved maintenance data and the manufacturer's maintenance instructions. Work completed as described. Aircraft inspected following maintenance — found in airworthy condition.${notesSection}\n\nAircraft returned to service per FAR 43.9 and 43.11.\nAirworthiness determination: AIRWORTHY`;

  return body;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                  */
/* ═══════════════════════════════════════════════════════════════ */
export function LogbookCanaryGenerator({ onClose, onSaved, activeMechanicName, activeMechanicCert }: Props) {
  const { workOrders, customers, aircraft, addLogbookEntry } = useDataStore();

  // Flow state
  type Mode = "choose" | "wo" | "custom";
  type Step = "input" | "generating" | "edit" | "done";
  const [mode, setMode] = useState<Mode>("choose");
  const [step, setStep] = useState<Step>("input");

  // WO mode
  const [selectedWOId, setSelectedWOId] = useState<string>("");

  // Custom mode
  const [entryTypeMode, setEntryTypeMode] = useState<"list" | "keyword">("list");
  const [entryType, setEntryType] = useState("");
  const [entryKeyword, setEntryKeyword] = useState("");
  const [aiSuggestedType, setAiSuggestedType] = useState<EntryTypeOption | null>(null);
  const [suggestStatus, setSuggestStatus] = useState<"idle" | "loading" | "error">("idle");
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [entryTypeOpen, setEntryTypeOpen] = useState(false);
  const [tailInput, setTailInput] = useState("");
  const [tailLookup, setTailLookup] = useState<"idle" | "searching" | "found" | "notfound">("idle");
  const [tailLookupError, setTailLookupError] = useState<string | null>(null);
  const [faaData, setFaaData] = useState<FoundFaaResult | null>(null);
  const [internalOwner, setInternalOwner] = useState<string | null>(null);
  const [ownerSource, setOwnerSource] = useState<"faa" | "internal" | "custom">("custom");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [inviteSent, setInviteSent] = useState(false);
  const [notes, setNotes] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  // Edit / done
  const [draftText, setDraftText] = useState("");
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiStructured, setAiStructured] = useState<Record<string, any> | null>(null);
  const [sourceContext, setSourceContext] = useState<MaintenanceGenerateSourceContext | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const tailRef = useRef<HTMLInputElement>(null);
  const lookupTokenRef = useRef(0);

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const aircraftByTail = useMemo(
    () => new Map(aircraft.map((a) => [a.tail_number?.toUpperCase() ?? "", a])),
    [aircraft]
  );

  const workOrderOptions = useMemo(() => {
    const eligible = workOrders.filter((wo) =>
      ["Open", "In Progress", "Ready for Signoff", "Closed"].includes(wo.status)
    );
    return eligible.map((wo) => {
      const customerEmail = customers.find((c) => c.name === wo.customer)?.email ?? "";
      return {
        id: wo.id,
        label: `${wo.woNumber} — ${wo.aircraft} — ${wo.squawk || wo.discrepancy || "Maintenance"} `,
        aircraft: wo.aircraft,
        model: wo.makeModel,
        customer: wo.customer,
        email: customerEmail,
        hobbs: 0,
        tach: 0,
        workOrder: wo,
      };
    });
  }, [workOrders, customers]);

  const aircraftOptions = useMemo(
    () =>
      aircraft
        .filter((a) => a.tail_number)
        .map((a) => ({
          id: a.id,
          tail: a.tail_number ?? "",
          label: `${a.tail_number ?? "Unknown"} — ${[a.make, a.model].filter(Boolean).join(" ")}`,
          ownerId: a.owner_customer_id ?? undefined,
          make: a.make ?? "",
          model: a.model ?? "",
        })),
    [aircraft]
  );

  const selectedWorkOrderOption = useMemo(
    () => workOrderOptions.find((w) => w.id === selectedWOId) ?? null,
    [selectedWOId, workOrderOptions]
  );

  // Ensure a sensible default work order selection
  useEffect(() => {
    if (!selectedWOId && workOrderOptions.length > 0) {
      setSelectedWOId(workOrderOptions[0].id);
    }
  }, [selectedWOId, workOrderOptions]);

  /* ── FAA lookup ── */
  function handleTailLookup(val: string) {
    const normalized = val.toUpperCase().replace(/\s/g, "");
    setTailInput(normalized);
    if (normalized.length < 4) {
      setTailLookup("idle");
      setTailLookupError(null);
      setFaaData(null);
      setInternalOwner(null);
      return;
    }
    const internal = aircraftByTail.get(normalized);
    const internalOwnerRecord = internal?.owner_customer_id ? customerById.get(internal.owner_customer_id) : null;
    const internalOwnerName = internalOwnerRecord?.name ?? null;
    setInternalOwner(internalOwnerName);

    const nextOwnerSource: "faa" | "internal" = internalOwnerName ? "internal" : "faa";
    if (internalOwnerName) {
      setOwnerSource(nextOwnerSource);
      setCustomerName(internalOwnerName);
      setCustomerEmail(internalOwnerRecord?.email ?? "");
      setCustomerPhone(internalOwnerRecord?.phone ?? "");
    } else {
      setOwnerSource(nextOwnerSource);
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
    }
    setTailLookup("searching");
    setTailLookupError(null);
    const token = ++lookupTokenRef.current;
    lookupAircraftByNNumber(normalized).then((res) => {
      if (token !== lookupTokenRef.current) return; // stale — discard
      if (res.found) {
        setFaaData(res);
        setTailLookup("found");
        setTailLookupError(null);
        // Auto-fill owner name from FAA registrant record if FAA is selected
        if (nextOwnerSource === "faa") {
          setCustomerName(res.registrant.name);
        }
      } else {
        setFaaData(null);
        setTailLookup("notfound");
        setTailLookupError(res.error ?? null);
      }
    });
  }

  function buildWorkOrderPrompt(wo: WorkOrder) {
    const lines: string[] = [
      `Work order ${wo.woNumber} (${wo.status})`,
      `Aircraft: ${wo.aircraft} ${wo.makeModel}`,
      wo.squawk ? `Customer complaint: ${wo.squawk}` : "",
      wo.discrepancy ? `Discrepancy: ${wo.discrepancy}` : "",
      wo.correctiveAction ? `Corrective action: ${wo.correctiveAction}` : "",
      wo.findings ? `Findings: ${wo.findings}` : "",
      wo.internalNotes ? `Internal notes: ${wo.internalNotes}` : "",
      wo.customerNotes ? `Customer notes: ${wo.customerNotes}` : "",
    ].filter(Boolean);

    if (wo.laborLines?.length) {
      lines.push(
        "Labor:",
        ...wo.laborLines.map((l) => `- ${l.desc} (${l.hours}h @ $${l.rate}/hr)`)
      );
    }
    if (wo.partsLines?.length) {
      lines.push(
        "Parts:",
        ...wo.partsLines.map((p) => `- ${p.desc} (${p.pn}) x${p.qty}`)
      );
    }
    if (wo.outsideServices?.length) {
      lines.push(
        "Outside services:",
        ...wo.outsideServices.map((s) => `- ${s.desc} (${s.vendor})`)
      );
    }
    return lines.join("\n");
  }

  function buildCustomPrompt() {
    const label = entryTypeLabel(entryType) || "";
    const keywordLine = entryTypeMode === "keyword" && entryKeyword
      ? `Keyword: ${entryKeyword}`
      : label
      ? `Entry type: ${label}`
      : "";

    const lines = [
      keywordLine,
      tailInput ? `Tail number: ${tailInput}` : "",
      notes ? `Notes: ${notes}` : "",
    ].filter(Boolean);

    return lines.join("\n");
  }

  async function handleGenerate() {
    setGenerateError(null);
    setAiWarnings([]);
    setAiStructured(null);
    setSourceContext(null);
    setCurrentDraftId(null);
    setStep("generating");

    const selectedOption = selectedWorkOrderOption;
    const workOrder = selectedOption?.workOrder;
    const aircraftId =
      (workOrder?.aircraft ? aircraftByTail.get(workOrder.aircraft.toUpperCase())?.id : null) ??
      (tailInput ? aircraftByTail.get(tailInput.toUpperCase())?.id : null) ??
      null;

    const prompt =
      mode === "wo" && workOrder
        ? buildWorkOrderPrompt(workOrder)
        : buildCustomPrompt();

    if (!prompt.trim()) {
      setGenerateError("Add details to generate a logbook entry.");
      setStep("input");
      return;
    }

    const requestedEntryType = entryType || normalizeEntryTypeValue(aiSuggestedType?.value ?? null);

    try {
      const res = await fetch("/api/maintenance/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          aircraft_id: aircraftId ?? undefined,
          work_order_id: mode === "wo" ? selectedWOId : undefined,
          entry_type: requestedEntryType ?? undefined,
          dry_run: false,
        }),
      });

      const data: MaintenanceGenerateResponse = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "AI generation failed");

      setAiStructured(data.structured_fields ?? null);
      setAiWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setSourceContext(data.source_context ?? null);
      setCurrentDraftId(typeof data?.draft_id === "string" ? data.draft_id : null);

      const normalizedEntry = normalizeEntryTypeValue(data?.structured_fields?.entry_type);
      if (normalizedEntry) {
        const option = ENTRY_TYPE_OPTIONS.find((t) => t.value === normalizedEntry) ?? null;
        setAiSuggestedType(option);
        if (entryTypeMode === "keyword" || !entryType) {
          setEntryType(normalizedEntry);
        }
      }

      setDraftText(data.formatted_entry ?? generateLogbookDraft(
        entryTypeLabel(entryType) || entryKeyword || "Maintenance",
        mode === "wo" ? (workOrder?.aircraft ?? "") : tailInput,
        faaData,
        notes,
        activeMechanicName,
        activeMechanicCert,
        workOrder?.id,
        selectedOption ?? undefined
      ));
      setStep("edit");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "AI generation failed";
      setGenerateError(message);
      setSourceContext(null);
      setDraftText(generateLogbookDraft(
        entryTypeLabel(entryType) || entryKeyword || "Maintenance",
        mode === "wo" ? (workOrder?.aircraft ?? "") : tailInput,
        faaData,
        notes,
        activeMechanicName,
        activeMechanicCert,
        workOrder?.id,
        selectedOption ?? undefined
      ));
      setStep("edit");
    }
  }

  async function handleSuggestEntryType() {
    if (!entryKeyword.trim()) return;
    setSuggestStatus("loading");
    setSuggestError(null);
    try {
      const res = await fetch("/api/maintenance/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Interpret this maintenance keyword or phrase and classify it for a mechanic logbook entry.\nKeyword: ${entryKeyword}\nTail number: ${tailInput || "Unknown"}`,
          aircraft_id: tailInput ? aircraftByTail.get(tailInput.toUpperCase())?.id ?? undefined : undefined,
          dry_run: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not classify keyword");

      const normalizedEntry = normalizeEntryTypeValue(data?.structured_fields?.entry_type);
      if (normalizedEntry) {
        const option = ENTRY_TYPE_OPTIONS.find((t) => t.value === normalizedEntry) ?? null;
        setAiSuggestedType(option);
        setEntryType(normalizedEntry);
        setAiWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      } else {
        setAiSuggestedType(null);
      }
      setSuggestStatus("idle");
    } catch (err: unknown) {
      setSuggestStatus("error");
      setSuggestError(err instanceof Error ? err.message : "AI suggestion failed");
    }
  }

  function buildStructuredDraftFields(finalize: boolean): Record<string, any> {
    return {
      ...(aiStructured ?? {}),
      checklist_template_key:
        sourceContext?.checklist_template_key
        ?? aiStructured?.checklist_template_key
        ?? null,
      shop_checklist_references:
        sourceContext?.checklist_reference_names
        ?? aiStructured?.shop_checklist_references
        ?? [],
      shop_logbook_references:
        sourceContext?.logbook_reference_names
        ?? aiStructured?.shop_logbook_references
        ?? [],
      linked_work_order_id: mode === "wo" ? selectedWOId : null,
      linked_work_order_number:
        mode === "wo" ? selectedWorkOrderOption?.workOrder.woNumber ?? null : null,
      open_required_checklist_items:
        sourceContext?.work_order_checklist?.openRequiredItems ?? [],
      finalized_from_generator: finalize,
    };
  }

  /* ── Save ── */
  async function handleSave(options?: { finalize?: boolean }): Promise<LogbookEntry | null> {
    const finalize = options?.finalize === true;
    setSaveState("saving");
    try {
      const wo = mode === "wo" ? selectedWorkOrderOption : null;
      const normalizedType = normalizeEntryTypeValue(entryType) ?? "other";
      const dateValue =
        typeof aiStructured?.date === "string" && aiStructured.date
          ? aiStructured.date
          : new Date().toISOString().split("T")[0];
      const makeModel =
        mode === "wo"
          ? wo?.model ?? ""
          : faaData
          ? [faaData.aircraft.manufacturer, faaData.aircraft.model].filter(Boolean).join(" ")
          : aircraftOptions.find((a) => a.tail === tailInput)?.label.split(" — ")[1] ?? "";
      const linkedWorkOrder =
        mode === "wo" ? wo?.workOrder.woNumber ?? selectedWOId : undefined;
      const structuredDraftFields = buildStructuredDraftFields(finalize);
      const created = addLogbookEntry({
        aircraft: mode === "wo" ? wo?.aircraft ?? "" : tailInput,
        makeModel,
        serial: faaData?.aircraft.serialNumber ?? "",
        engine: faaData ? [faaData.engine.manufacturer, faaData.engine.model].filter(Boolean).join(" ") : "",
        date: dateValue,
        type: entryTypeLabel(normalizedType) || entryKeyword || "Maintenance",
        body: draftText,
        mechanic: activeMechanicName,
        certificateNumber: activeMechanicCert,
        status: "draft",
        totalTime:
          Number(aiStructured?.airframe_tt ?? aiStructured?.tach_reference ?? 0) ||
          (mode === "wo" ? wo?.tach ?? 0 : 0),
        hobbs:
          Number(aiStructured?.tach_reference ?? 0) ||
          (mode === "wo" ? wo?.hobbs ?? 0 : 0),
        tach:
          Number(aiStructured?.tach_reference ?? 0) ||
          (mode === "wo" ? wo?.tach ?? 0 : 0),
        linkedWO: linkedWorkOrder,
      });

      if (currentDraftId) {
        await fetch("/api/maintenance/drafts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: currentDraftId,
            edited_text: draftText,
            structured_fields: structuredDraftFields,
            status: finalize ? "finalized" : "draft",
          }),
        }).catch(() => null);
      }

      const newEntry: LogbookEntry = {
        id: created.id,
        number: `LBE-${created.id.slice(-6).toUpperCase()}`,
        aircraft: created.aircraft,
        model: created.makeModel,
        entryType: created.type,
        date: new Date(created.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        hobbs: created.hobbs ?? 0,
        tach: created.tach ?? 0,
        mechanic: created.mechanic,
        cert: created.certificateNumber,
        status: "draft",
        body: created.body,
        customer: mode === "wo" ? wo?.customer : customerName,
        customerEmail: mode === "wo" ? wo?.email : customerEmail,
        linkedWO: linkedWorkOrder,
        checklistTemplateKey:
          sourceContext?.checklist_template_key
          ?? (typeof structuredDraftFields.checklist_template_key === "string"
            ? structuredDraftFields.checklist_template_key
            : null),
        checklistTemplateLabel:
          sourceContext?.checklist_template_label
          ?? sourceContext?.work_order_checklist?.templateLabel
          ?? null,
        checklistSourceReferences: sourceContext?.work_order_checklist?.sourceReferences ?? [],
        shopChecklistReferences: sourceContext?.checklist_reference_names ?? [],
        shopLogbookReferences: sourceContext?.logbook_reference_names ?? [],
        openRequiredChecklistItems: sourceContext?.work_order_checklist?.openRequiredItems ?? [],
        nextDueInterval:
          typeof structuredDraftFields.next_due_interval === "string"
            ? structuredDraftFields.next_due_interval
            : null,
        requires337: structuredDraftFields.requires_337 === true,
        draftId: currentDraftId,
      };
      onSaved(newEntry);
      setSaveState("saved");
      return newEntry;
    } catch (error) {
      console.error("Failed to save logbook entry", error);
      setSaveState("idle");
      setGenerateError("Could not save the logbook entry. Please try again.");
      return null;
    }
  }

  /* ── Send ── */
  async function handleSend() {
    if (sendState !== "idle") return;
    setSendState("sending");
    const saved = await handleSave({ finalize: true });
    if (!saved) {
      setSendState("idle");
    }
  }

  const wo = selectedWorkOrderOption;
  const canGenerate = mode === "wo"
    ? !!selectedWOId
    : ((entryTypeMode === "list" ? !!entryType : !!entryKeyword.trim()) &&
      (tailLookup === "found" || (tailLookup === "notfound" && tailInput.length >= 3)));

  /* ─── Step: Choose mode ─────────────────────────────────────── */
  const renderChoose = () => (
    <div className="p-8 space-y-6">
      <div className="text-center mb-2">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0A1628] to-[#2563EB] flex items-center justify-center mx-auto mb-3">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>Canary AI Logbook Generator</h2>
        <p className="text-[13px] text-muted-foreground mt-1">Choose how you'd like to create this entry</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* From WO */}
        <button
          onClick={() => setMode("wo")}
          className="p-5 rounded-2xl border-2 border-border hover:border-primary/40 hover:bg-primary/3 transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3 group-hover:bg-primary/10 transition-colors">
            <Wrench className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-[14px] text-foreground mb-1" style={{ fontWeight: 700 }}>From Work Order</div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            AI reads an existing WO — scope, parts, notes — and drafts the full maintenance entry automatically.
          </p>
          <div className="mt-3 text-[11px] text-primary" style={{ fontWeight: 600 }}>
            Best for active work orders →
          </div>
        </button>

        {/* Custom / Canary */}
        <button
          onClick={() => setMode("custom")}
          className="p-5 rounded-2xl border-2 border-border hover:border-violet-400/60 hover:bg-violet-50/30 transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mb-3 group-hover:bg-violet-100 transition-colors">
            <Sparkles className="w-5 h-5 text-violet-600" />
          </div>
          <div className="text-[14px] text-foreground mb-1 flex items-center gap-2" style={{ fontWeight: 700 }}>
            Custom Entry
            <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 700 }}>AI Canary</span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Enter tail number, entry type, and notes. AI looks up FAA registry data and generates a compliant entry.
          </p>
          <div className="mt-3 text-[11px] text-violet-600" style={{ fontWeight: 600 }}>
            Best for standalone entries →
          </div>
        </button>
      </div>
    </div>
  );

  /* ─── Step: WO input ────────────────────────────────────────── */
  const renderWOInput = () => (
    <div className="p-6 space-y-5">
      <button onClick={() => setMode("choose")} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors" style={{ fontWeight: 500 }}>
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <div>
        <h3 className="text-[16px] text-foreground mb-1" style={{ fontWeight: 700 }}>Select Work Order</h3>
        <p className="text-[12px] text-muted-foreground">AI will read the work order scope, parts, and notes to draft your logbook entry.</p>
      </div>

      <div className="space-y-3">
        {workOrderOptions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center">
            <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>No eligible work orders yet</div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Completed, active, or ready-for-signoff work orders will show up here automatically.
            </p>
          </div>
        ) : workOrderOptions.map((w) => (
          <button
            key={w.id}
            onClick={() => setSelectedWOId(w.id)}
            className={`w-full p-4 rounded-xl border-2 text-left transition-all ${selectedWOId === w.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${selectedWOId === w.id ? "border-primary bg-primary" : "border-border"}`}>
                {selectedWOId === w.id && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{w.workOrder.woNumber}</div>
                <div className="text-[12px] text-muted-foreground">{w.aircraft} · {w.model}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{w.customer} · Hobbs {w.hobbs}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {wo && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="text-[12px] text-blue-700 mb-2" style={{ fontWeight: 700 }}>AI will extract from {wo.workOrder.woNumber}:</div>
          <ul className="space-y-1 text-[12px] text-blue-600">
            {["Maintenance scope and description", "Parts used (P/N, quantities)", "Labor hours and mechanic notes", "Aircraft hobbs/tach at time of service", "Customer and aircraft details"].map((item) => (
              <li key={item} className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 shrink-0" />{item}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={!selectedWOId}
        className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3.5 rounded-xl text-[14px] hover:bg-primary/90 disabled:opacity-40 transition-colors"
        style={{ fontWeight: 600 }}
      >
        <Sparkles className="w-4 h-4" /> Generate with AI
      </button>
    </div>
  );

  /* ─── Step: Custom input ────────────────────────────────────── */
  const renderCustomInput = () => (
    <div className="p-6 space-y-5 overflow-y-auto">
      <button onClick={() => setMode("choose")} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors" style={{ fontWeight: 500 }}>
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Custom Logbook Entry</h3>
          <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 700 }}>AI Canary</span>
        </div>
        <p className="text-[12px] text-muted-foreground">Fill in the details — AI will generate an FAA-compliant maintenance entry.</p>
      </div>

      {/* Entry Type */}
      <div>
        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>
          Entry Type <span className="text-destructive">*</span>
        </label>
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => setEntryTypeMode("list")}
            className={`rounded-lg px-3 py-1.5 text-[12px] transition-colors ${entryTypeMode === "list" ? "bg-primary text-white" : "border border-border text-muted-foreground hover:text-foreground"}`}
            style={{ fontWeight: 600 }}
          >
            Pick from list
          </button>
          <button
            type="button"
            onClick={() => setEntryTypeMode("keyword")}
            className={`rounded-lg px-3 py-1.5 text-[12px] transition-colors ${entryTypeMode === "keyword" ? "bg-primary text-white" : "border border-border text-muted-foreground hover:text-foreground"}`}
            style={{ fontWeight: 600 }}
          >
            Type keyword
          </button>
        </div>
        {entryTypeMode === "list" ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setEntryTypeOpen((o) => !o)}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 border rounded-xl text-[13px] text-left transition-all ${entryType ? "border-primary/40 bg-primary/3" : "border-border hover:border-primary/30"}`}
          >
            <span className={entryType ? "text-foreground" : "text-muted-foreground/60"} style={{ fontWeight: entryType ? 500 : 400 }}>
              {entryType ? entryTypeLabel(entryType) : "Select entry type…"}
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${entryTypeOpen ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {entryTypeOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                className="absolute left-0 right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto"
              >
                {ENTRY_TYPE_GROUPS.map((group) => (
                  <div key={group.group}>
                    <div className="px-3 py-2 bg-muted/50 text-[10px] text-muted-foreground uppercase tracking-wider sticky top-0" style={{ fontWeight: 700 }}>
                      {group.group}
                    </div>
                    {group.types.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => { setEntryType(type.value); setEntryTypeOpen(false); }}
                        className={`w-full px-4 py-2 text-left text-[13px] hover:bg-muted/40 transition-colors flex items-center justify-between ${entryType === type.value ? "bg-primary/8 text-primary" : "text-foreground"}`}
                        style={{ fontWeight: entryType === type.value ? 600 : 400 }}
                      >
                        {type.label}
                        {entryType === type.value && <CheckCircle className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={entryKeyword}
                onChange={(e) => {
                  setEntryKeyword(e.target.value);
                  setSuggestError(null);
                }}
                placeholder="e.g. oil change, transponder, annual, alternator replaced"
                className="flex-1 border border-border rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
              />
              <button
                type="button"
                onClick={() => void handleSuggestEntryType()}
                disabled={!entryKeyword.trim() || suggestStatus === "loading"}
                className="rounded-xl bg-violet-600 px-3.5 py-2.5 text-[12px] text-white disabled:opacity-50"
                style={{ fontWeight: 600 }}
              >
                {suggestStatus === "loading" ? "Analyzing…" : "AI suggest"}
              </button>
            </div>
            {aiSuggestedType && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-[12px] text-violet-800">
                <div style={{ fontWeight: 700 }}>AI suggested entry type</div>
                <div className="mt-0.5">{aiSuggestedType.label}</div>
              </div>
            )}
            {suggestError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {suggestError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tail Number */}
      <div>
        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>
          Aircraft Tail Number <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <input
            ref={tailRef}
            list="logbook-aircraft-tails"
            type="text"
            value={tailInput}
            onChange={(e) => handleTailLookup(e.target.value)}
            placeholder="e.g. N12345"
            className={`w-full border rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-all ${
              tailLookup === "found" ? "border-emerald-400 bg-emerald-50/30" :
              tailLookup === "notfound" ? "border-destructive/40 bg-destructive/3" :
              "border-border focus:border-primary/40"
            }`}
            style={{ fontWeight: 500 }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {tailLookup === "searching" && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
            {tailLookup === "found" && <CheckCircle className="w-4 h-4 text-emerald-600" />}
            {tailLookup === "notfound" && <AlertCircle className="w-4 h-4 text-destructive" />}
          </div>
        </div>
        <datalist id="logbook-aircraft-tails">
          {aircraftOptions.map((option) => (
            <option key={option.id} value={option.tail}>
              {option.label}
            </option>
          ))}
        </datalist>

        {/* FAA result */}
        <AnimatePresence>
          {tailLookup === "found" && faaData && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 overflow-hidden"
            >
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <Plane className="w-4 h-4 text-emerald-700" />
                  <span className="text-[12px] text-emerald-800" style={{ fontWeight: 700 }}>FAA Registry — Aircraft Found</span>
                  <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${faaData.source === "live" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`} style={{ fontWeight: 600 }}>
                    {faaData.source === "live" ? "Live FAA API" : "Saved profile"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[
                    { label: "Make", value: faaData.aircraft.manufacturer },
                    { label: "Model", value: faaData.aircraft.model },
                    { label: "Year", value: String(faaData.aircraft.year) },
                    { label: "Serial #", value: faaData.aircraft.serialNumber },
                    { label: "Aircraft Type", value: faaData.aircraft.aircraftType },
                    { label: "Category", value: faaData.aircraft.category },
                    { label: "Seats", value: String(faaData.aircraft.seats) },
                    { label: "Max Weight", value: faaData.aircraft.maxWeight },
                    { label: "Cruise Speed", value: faaData.aircraft.cruiseSpeed || "N/A" },
                    { label: "Engine", value: formatEngineLabel(faaData.engine) },
                    { label: "Engine Mfr", value: faaData.engine.manufacturer },
                    { label: "Engine Type", value: faaData.engine.type },
                    { label: "HP", value: formatHorsepower(faaData.engine) },
                    { label: "TBO", value: formatTbo(faaData.engine) },
                    { label: "Propeller", value: faaData.propeller || "N/A" },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="text-[10px] text-emerald-600/70 uppercase tracking-wider" style={{ fontWeight: 600 }}>{row.label}</div>
                      <div className="text-[12px] text-emerald-900" style={{ fontWeight: 500 }}>{row.value}</div>
                    </div>
                  ))}
                </div>
                {/* Registrant + Certificate */}
                <div className="mt-3 pt-3 border-t border-emerald-200/60 grid grid-cols-2 gap-x-4 gap-y-2">
                  <div className="col-span-2">
                    <div className="text-[10px] text-emerald-600/70 uppercase tracking-wider mb-1" style={{ fontWeight: 600 }}>Registrant</div>
                    <div className="text-[12px] text-emerald-900" style={{ fontWeight: 500 }}>{faaData.registrant.name}</div>
                    <div className="text-[11px] text-emerald-700">
                      {formatRegistrantLocation(faaData.registrant)}
                      {faaData.registrant.type ? ` · ${faaData.registrant.type}` : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-emerald-600/70 uppercase tracking-wider" style={{ fontWeight: 600 }}>Certificate Class</div>
                    <div className="text-[12px] text-emerald-900" style={{ fontWeight: 500 }}>{formatCertificateClass(faaData.certificate)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-emerald-600/70 uppercase tracking-wider" style={{ fontWeight: 600 }}>Cert Status</div>
                    <div className={`text-[12px] ${isValidCertificate(faaData.certificate) ? "text-emerald-700" : "text-amber-600"}`} style={{ fontWeight: 600 }}>{formatCertificateStatus(faaData.certificate)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-emerald-600/70 uppercase tracking-wider" style={{ fontWeight: 600 }}>Cert Issued</div>
                    <div className="text-[12px] text-emerald-900" style={{ fontWeight: 500 }}>{faaData.certificate?.issueDate || "Unavailable"}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {tailLookup === "notfound" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
              <div className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                <span className="text-[12px] text-destructive">
                  {tailLookupError && /unavailable|unreachable|timed out|returned 4|returned 5/i.test(tailLookupError)
                    ? "FAA registry is temporarily unavailable. You can continue manually, or retry once the service responds."
                    : "Aircraft not found in FAA registry. You can continue and enter details manually below."}
                </span>
              </div>
            </motion.div>
          )}
          {tailLookup === "searching" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground px-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Looking up {tailInput} in FAA registry…
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Customer Info */}
      <div className="space-y-3">
        <label className="block text-[12px] text-foreground" style={{ fontWeight: 600 }}>
          Customer / Owner
          <span className="text-muted-foreground ml-1" style={{ fontWeight: 400 }}>(FAA, internal record, or custom)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setOwnerSource("faa");
              if (faaData?.registrant.name) setCustomerName(faaData.registrant.name);
            }}
            disabled={!faaData?.registrant.name}
            className={`rounded-lg px-3 py-1.5 text-[12px] ${ownerSource === "faa" ? "bg-emerald-100 text-emerald-800" : "border border-border text-muted-foreground"} disabled:opacity-50`}
            style={{ fontWeight: 600 }}
          >
            Use FAA owner
          </button>
          <button
            type="button"
            onClick={() => {
              setOwnerSource("internal");
              if (internalOwner) setCustomerName(internalOwner);
            }}
            disabled={!internalOwner}
            className={`rounded-lg px-3 py-1.5 text-[12px] ${ownerSource === "internal" ? "bg-blue-100 text-blue-800" : "border border-border text-muted-foreground"} disabled:opacity-50`}
            style={{ fontWeight: 600 }}
          >
            Use internal owner
          </button>
          <button
            type="button"
            onClick={() => setOwnerSource("custom")}
            className={`rounded-lg px-3 py-1.5 text-[12px] ${ownerSource === "custom" ? "bg-violet-100 text-violet-800" : "border border-border text-muted-foreground"}`}
            style={{ fontWeight: 600 }}
          >
            Custom owner
          </button>
        </div>
        <input
          type="text"
          value={customerName}
          onChange={(e) => {
            setOwnerSource("custom");
            setCustomerName(e.target.value);
          }}
          placeholder="Customer or company name"
          className="w-full border border-border rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => {
                setOwnerSource("custom");
                setCustomerEmail(e.target.value);
              }}
              placeholder="Email address"
              className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => {
                setOwnerSource("custom");
                setCustomerPhone(e.target.value);
              }}
              placeholder="Phone number"
              className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
            />
          </div>
        </div>
        {customerEmail && (
          <button
            onClick={() => setInviteSent(true)}
            disabled={inviteSent}
            className={`flex items-center gap-2 text-[12px] px-4 py-2 rounded-lg border transition-all ${
              inviteSent ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "border-primary/30 text-primary hover:bg-primary/5"
            }`}
            style={{ fontWeight: 500 }}
          >
            {inviteSent ? <><CheckCircle className="w-3.5 h-3.5" /> Invite sent to {customerEmail}</> : <><UserPlus className="w-3.5 h-3.5" /> Invite to myaircraft portal (optional)</>}
          </button>
        )}
      </div>

      {/* Notes / Dictation */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>
            Maintenance Notes
            <span className="text-muted-foreground ml-1" style={{ fontWeight: 400 }}>(describe what was done)</span>
          </label>
          <button
            onClick={() => setIsRecording((r) => !r)}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
              isRecording ? "bg-destructive/10 border-destructive/30 text-destructive" : "border-border text-muted-foreground hover:text-foreground"
            }`}
            style={{ fontWeight: 500 }}
          >
            {isRecording ? <><MicOff className="w-3 h-3" /> Stop</> : <><Mic className="w-3 h-3" /> Dictate</>}
          </button>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Describe what was inspected, repaired, or replaced. Include part numbers, findings, and any return-to-service notes. AI will expand this into a full FAA-compliant entry."
          className="w-full border border-border rounded-xl px-3.5 py-3 text-[13px] outline-none resize-none focus:border-primary/40 transition-colors leading-relaxed"
        />
        {isRecording && (
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-destructive">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            Recording… speak your maintenance notes
          </div>
        )}
      </div>

      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white py-3.5 rounded-xl text-[14px] hover:opacity-90 disabled:opacity-40 transition-all"
        style={{ fontWeight: 600 }}
      >
        <Sparkles className="w-4 h-4" /> Generate Logbook Entry with AI
      </button>
      {!canGenerate && (
        <p className="text-[11px] text-muted-foreground text-center">
          {entryTypeMode === "list"
            ? (!entryType ? "Select an entry type" : "Enter a valid aircraft tail number")
            : (!entryKeyword.trim() ? "Type a maintenance keyword" : "Enter a valid aircraft tail number")}
        </p>
      )}
    </div>
  );

  /* ─── Step: Generating ──────────────────────────────────────── */
  const renderGenerating = () => (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0A1628] to-[#2563EB] flex items-center justify-center">
          <Bot className="w-8 h-8 text-white" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-white" />
        </div>
      </div>
      <div className="text-[16px] text-foreground mb-2" style={{ fontWeight: 700 }}>Canary is writing your entry…</div>
      <p className="text-[13px] text-muted-foreground text-center max-w-xs mb-6">
        {mode === "wo"
          ? "Reading work order scope, parts, and approvals. Drafting a maintenance entry compliant with FAR 43.9."
          : "Looking up FAA registry data, cross-referencing entry type requirements, and composing your logbook entry."
        }
      </p>
      <div className="flex items-center gap-2">
        {["Fetching aircraft data", "Composing entry", "Formatting for FAR 43.9"].map((step, i) => (
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.6 }}
            className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1.5 text-[11px] text-muted-foreground"
            style={{ fontWeight: 500 }}
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            {step}
          </motion.div>
        ))}
      </div>
    </div>
  );

  /* ─── Step: Edit ────────────────────────────────────────────── */
  const renderEdit = () => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {generateError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">
            {generateError}
          </div>
        )}
        {/* Success banner */}
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[12px] text-emerald-800" style={{ fontWeight: 600 }}>Draft generated — review, edit, then save or send</span>
          </div>
          <button
            onClick={() => setStep("input")}
            className="text-[11px] text-emerald-600 flex items-center gap-1 shrink-0 hover:text-emerald-800 transition-colors"
            style={{ fontWeight: 500 }}
          >
            <RefreshCw className="w-3 h-3" /> Regenerate
          </button>
        </div>

        {aiSuggestedType && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-[12px] text-violet-800">
            <span style={{ fontWeight: 700 }}>AI suggested type:</span> {aiSuggestedType.label}
          </div>
        )}

        {aiWarnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-[12px] text-amber-800" style={{ fontWeight: 700 }}>Review before finalizing</div>
            <ul className="mt-2 space-y-1 text-[12px] text-amber-700">
              {aiWarnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}

        {(sourceContext?.work_order_checklist
          || (sourceContext?.checklist_reference_names?.length ?? 0) > 0
          || (sourceContext?.logbook_reference_names?.length ?? 0) > 0) && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="flex items-center gap-2 text-[12px] text-blue-800" style={{ fontWeight: 700 }}>
              <Shield className="w-3.5 h-3.5" />
              Shop source of truth applied
            </div>
            <div className="mt-2 space-y-2 text-[12px] text-blue-700">
              {sourceContext?.work_order_checklist && (
                <div>
                  <span style={{ fontWeight: 700 }}>
                    {sourceContext.work_order_checklist.templateLabel ?? sourceContext.checklist_template_label ?? "Checklist"}
                  </span>
                  {" · "}
                  {sourceContext.work_order_checklist.completedRequiredCount ?? 0}/
                  {sourceContext.work_order_checklist.requiredCount ?? 0}
                  {" required items completed"}
                  {(sourceContext.work_order_checklist.openRequiredItems?.length ?? 0) > 0 && (
                    <div className="mt-1 text-amber-700">
                      Open required items: {sourceContext.work_order_checklist.openRequiredItems?.join(", ")}
                    </div>
                  )}
                </div>
              )}
              {(sourceContext?.checklist_reference_names?.length ?? 0) > 0 && (
                <div>
                  <span style={{ fontWeight: 700 }}>Checklist refs:</span>{" "}
                  {sourceContext?.checklist_reference_names?.join(", ")}
                </div>
              )}
              {(sourceContext?.logbook_reference_names?.length ?? 0) > 0 && (
                <div>
                  <span style={{ fontWeight: 700 }}>Logbook refs:</span>{" "}
                  {sourceContext?.logbook_reference_names?.join(", ")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aircraft & type meta */}
        <div className="grid grid-cols-3 gap-3">
          {(mode === "wo" ? [
            { label: "Aircraft", value: wo?.aircraft || "" },
            { label: "Entry Type", value: entryTypeLabel(entryType) || aiSuggestedType?.label || "Generated from work order" },
            { label: "Work Order", value: wo?.workOrder.woNumber || selectedWOId },
          ] : [
            { label: "Aircraft", value: tailInput },
            { label: "Make / Model", value: faaData ? `${faaData.aircraft.manufacturer} ${faaData.aircraft.model}` : "—" },
            { label: "Entry Type", value: entryTypeLabel(entryType) || aiSuggestedType?.label || entryKeyword || "—" },
          ]).map((row) => (
            <div key={row.label} className="bg-muted/30 rounded-lg p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5" style={{ fontWeight: 600 }}>{row.label}</div>
              <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{row.value}</div>
            </div>
          ))}
        </div>

        {(aiStructured?.next_due_interval || aiStructured?.requires_337 === true) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>
                Next Due
              </div>
              <div className="mt-0.5 text-[12px] text-foreground" style={{ fontWeight: 600 }}>
                {aiStructured?.next_due_interval || "Not specified"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>
                FAA Form 337
              </div>
              <div className={`mt-0.5 text-[12px] ${aiStructured?.requires_337 === true ? "text-amber-700" : "text-foreground"}`} style={{ fontWeight: 600 }}>
                {aiStructured?.requires_337 === true ? "Review required before final signoff" : "Not indicated"}
              </div>
            </div>
          </div>
        )}

        {/* Editable body */}
        <div>
          <label className="block text-[12px] text-foreground mb-2" style={{ fontWeight: 600 }}>
            Maintenance Description
            <span className="text-muted-foreground ml-2" style={{ fontWeight: 400 }}>— edit as needed</span>
          </label>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={12}
            className="w-full border border-border rounded-xl px-4 py-3 text-[12px] outline-none resize-none focus:ring-2 focus:ring-primary/20 leading-relaxed font-mono"
          />
        </div>

        {/* Certificate of Return to Service */}
        <div className="bg-[#F7F8FA] rounded-xl border border-border p-4">
          <div className="text-[12px] text-foreground mb-3 uppercase tracking-wider" style={{ fontWeight: 700 }}>
            Certificate of Return to Service
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Mechanic Name</div>
              <div className="border border-border rounded-lg px-3 py-2 bg-white text-[13px] text-foreground" style={{ fontWeight: 500 }}>{activeMechanicName}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Certificate Number</div>
              <div className="border border-border rounded-lg px-3 py-2 bg-white text-[13px] text-foreground" style={{ fontWeight: 500 }}>{activeMechanicCert}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Lock className="w-3.5 h-3.5" />
            Entry will be digitally signed upon save
          </div>
        </div>

        {/* Customer */}
        {(mode === "custom" ? customerEmail : wo?.email) && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="text-[12px] text-blue-800 mb-1" style={{ fontWeight: 600 }}>Customer Notification</div>
            <p className="text-[12px] text-blue-600">
              When you click "Send", a copy of this logbook entry will be emailed to{" "}
              <span style={{ fontWeight: 600 }}>{mode === "custom" ? customerEmail : wo?.email}</span>
            </p>
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="shrink-0 border-t border-border bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          {/* PDF */}
          <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
          {/* Print */}
          <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          {/* Share */}
          <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>

          <div className="flex-1" />

          {/* Save */}
          <button
            onClick={() => {
              void handleSave();
            }}
            disabled={saveState !== "idle"}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] border transition-all ${
              saveState === "saved" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
              "border-primary/30 text-primary hover:bg-primary/5"
            }`}
            style={{ fontWeight: 600 }}
          >
            {saveState === "saving" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> :
             saveState === "saved" ? <><CheckCircle className="w-3.5 h-3.5" /> Saved</> :
             <><Save className="w-3.5 h-3.5" /> Save</>}
          </button>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={sendState !== "idle"}
            className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-[13px] text-white transition-all ${
              sendState === "sent" ? "bg-emerald-600" :
              "bg-primary hover:bg-primary/90"
            }`}
            style={{ fontWeight: 600 }}
          >
            {sendState === "sending" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</> :
             sendState === "sent" ? <><CheckCircle className="w-3.5 h-3.5" /> Sent!</> :
             <><Send className="w-3.5 h-3.5" /> Send &amp; Save</>}
          </button>
        </div>

        {sendState === "sent" && (
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[11px] text-emerald-600 mt-2 text-center" style={{ fontWeight: 500 }}>
            <CheckCircle className="w-3 h-3 inline mr-1" />
            Entry saved to logbook · Email sent to customer · PDF available for download
          </motion.p>
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 280 }}
        className="w-[580px] h-full bg-white flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-[#0A1628] to-[#1E3A5F] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>
                {mode === "choose" ? "Canary AI Logbook Generator"
                 : mode === "wo" ? "Generate from Work Order"
                 : "Custom Entry — AI Canary"}
              </div>
              <div className="text-white/50 text-[11px]">
                {step === "generating" ? "Generating…"
                 : step === "edit" ? "Review & sign your entry"
                 : mode === "choose" ? "Choose generation method"
                 : mode === "wo" ? "Select a work order to generate from"
                 : "Enter aircraft and maintenance details"}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Progress bar */}
        {step !== "input" || mode !== "choose" ? (
          <div className="h-1 bg-white/10 shrink-0">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: step === "input" ? "33%" : step === "generating" ? "66%" : "100%" }}
              transition={{ duration: 0.4 }}
            />
          </div>
        ) : null}

        {/* Content */}
        <div className={`flex-1 ${step === "edit" ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${mode}-${step}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
              className={step === "edit" ? "h-full flex flex-col" : ""}
            >
              {mode === "choose" && step === "input" && renderChoose()}
              {mode === "wo" && step === "input" && renderWOInput()}
              {mode === "custom" && step === "input" && renderCustomInput()}
              {step === "generating" && renderGenerating()}
              {step === "edit" && renderEdit()}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
