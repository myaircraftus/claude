"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { toDbWorkOrderStatus, toUiWorkOrderStatus } from "@/lib/work-orders/status";

interface ApiAircraft {
  id: string;
  tail_number: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  serial_number?: string | null;
  engine_model?: string | null;
  owner_customer_id?: string | null;
}

interface ApiWorkOrder {
  id: string;
  work_order_number: string;
  status: string;
  service_type?: string | null;
  customer_id?: string | null;
  customer_complaint?: string | null;
  discrepancy?: string | null;
  corrective_action?: string | null;
  findings?: string | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
  labor_total?: number | null;
  parts_total?: number | null;
  outside_services_total?: number | null;
  tax_amount?: number | null;
  total?: number | null;
  opened_at?: string | null;
  closed_at?: string | null;
  linked_invoice_id?: string | null;
  linked_logbook_entry_id?: string | null;
  created_at: string;
  updated_at: string;
  aircraft_id?: string | null;
  assigned_mechanic_id?: string | null;
  aircraft?: {
    id: string;
    tail_number: string;
    make?: string | null;
    model?: string | null;
    owner_customer_id?: string | null;
  };
  customer?: {
    id: string;
    name: string;
    company?: string | null;
    email?: string | null;
  } | null;
}

interface ApiInvoice {
  id: string;
  invoice_number: string;
  status: string;
  invoice_date?: string | null;
  due_date?: string | null;
  subtotal?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  total?: number | null;
  amount_paid?: number | null;
  balance_due?: number | null;
  notes?: string | null;
  work_order_id?: string | null;
  customer?: { id: string; name: string; email?: string | null } | null;
  aircraft?: { id: string; tail_number: string } | null;
}

interface ApiEstimate {
  id: string;
  estimate_number: string;
  status: string;
  service_type?: string | null;
  mechanic_name?: string | null;
  assumptions?: string | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
  labor_total?: number | null;
  parts_total?: number | null;
  outside_services_total?: number | null;
  total?: number | null;
  valid_until?: string | null;
  linked_work_order_id?: string | null;
  aircraft_id?: string | null;
  customer_id?: string | null;
  created_at: string;
  updated_at: string;
  aircraft?: {
    id: string;
    tail_number: string;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    owner_customer_id?: string | null;
  } | null;
  customer?: {
    id: string;
    name: string;
    email?: string | null;
    company?: string | null;
  } | null;
  line_items?: any[] | null;
}

interface ApiCustomer {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  billing_address?: string | null;
  notes?: string | null;
  preferred_contact?: string | null;
  tags?: string[] | null;
  aircraft_customer_assignments?: Array<{
    aircraft?: { id: string; tail_number: string; make?: string | null; model?: string | null } | null;
  }>;
}

interface ApiLogbookEntry {
  id: string;
  aircraft_id?: string | null;
  work_order_id?: string | null;
  entry_type: string;
  entry_date: string;
  description: string;
  total_time?: number | null;
  hobbs_out?: number | null;
  tach_time?: number | null;
  status: string;
  signed_at?: string | null;
  created_at: string;
  updated_at: string;
  aircraft?: {
    id: string;
    tail_number: string;
    make?: string | null;
    model?: string | null;
    serial_number?: string | null;
    engine_model?: string | null;
  } | null;
}

interface ApiThreadMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  intent?: string | null;
  metadata?: Record<string, any> | null;
  attachments?: Array<{ path?: string; name?: string; kind?: string }> | null;
  created_at: string;
  sender?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
}

/* ============================================================= */
/*  TYPES                                                        */
/* ============================================================= */

export interface LogbookEntry {
  id: string;
  aircraft: string;
  makeModel: string;
  serial: string;
  engine: string;
  date: string;
  type: string;
  body: string;
  mechanic: string;
  certificateNumber: string;
  status: "draft" | "signed" | "archived";
  totalTime: number;
  hobbs?: number;
  tach?: number;
  linkedWO?: string;
  signature?: string;
  signatureDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrder {
  id: string;
  woNumber: string;
  serviceType?: string;
  aircraft: string;
  makeModel: string;
  serial: string;
  customer: string;
  customerId?: string;
  company?: string;
  mechanic: string;
  assignedMechanicId?: string;
  assignedMechanics?: string[];
  openedDate: string;
  closedDate?: string;
  targetDate?: string;
  status: "Draft" | "Open" | "In Progress" | "Awaiting Parts" | "Awaiting Approval" | "Waiting Customer" | "Ready for Signoff" | "Closed" | "Invoice Paid" | "Archived";
  progress?: number;
  squawk: string;
  discrepancy: string;
  correctiveAction: string;
  findings: string;
  laborLines: LaborLine[];
  partsLines: PartsLine[];
  outsideServices: OutsideService[];
  activity?: ActivityEntry[];
  internalNotes: string;
  customerNotes: string;
  totalLabor: number;
  totalParts: number;
  totalOutside: number;
  grandTotal: number;
  linkedInvoice?: string;
  linkedEstimate?: string;
  linkedLogbookEntry?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LaborLine {
  id: string;
  desc: string;
  hours: number;
  rate: number;
  total: number;
}

export interface PartsLine {
  id: string;
  pn: string;
  desc: string;
  qty: number;
  price: number;
  total: number;
  vendor?: string;
  condition?: string;
  status?: "Ordered" | "Received" | "Installed" | "Backordered";
}

export interface OutsideService {
  id: string;
  desc: string;
  vendor: string;
  cost: number;
  status?: "Pending" | "Completed" | "Cancelled";
}

export interface ActivityEntry {
  id: string;
  type: "note" | "status" | "labor" | "part" | "media" | "approval" | "system" | "owner-update" | "ai-summary";
  author: string;
  role?: string;
  content: string;
  visibility: "internal" | "owner-visible";
  timestamp: string;
  mediaUrls?: string[];
  laborHours?: number;
  laborCategory?: string;
  partPN?: string;
  statusFrom?: string;
  statusTo?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  aircraft: string;
  customer: string;
  company?: string;
  issuedDate: string;
  dueDate: string;
  status: "Draft" | "Sent" | "Paid" | "Overdue" | "Cancelled";
  laborLines: LaborLine[];
  partsLines: PartsLine[];
  outsideServices: OutsideService[];
  subtotalLabor: number;
  subtotalParts: number;
  subtotalOutside: number;
  taxRate: number;
  tax: number;
  shipping: number;
  total: number;
  notes: string;
  paymentStatus: "Unpaid" | "Partial" | "Paid";
  amountPaid: number;
  linkedWorkOrder?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Estimate {
  id: string;
  estimateNumber: string;
  aircraft: string;
  makeModel: string;
  customer: string;
  company?: string;
  mechanic: string;
  status: "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";
  laborLines: LaborLine[];
  partsLines: PartsLine[];
  outsideServices: OutsideService[];
  assumptions: string;
  internalNotes: string;
  customerNotes: string;
  subtotalLabor: number;
  subtotalParts: number;
  subtotalOutside: number;
  total: number;
  linkedWorkOrder?: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartSearchResult {
  id: string;
  pn: string;
  altPn?: string;
  desc: string;
  vendor: string;
  price: number;
  condition: "New" | "New-PMA" | "Overhauled" | "Serviceable" | "Used";
  fit: "Confirmed" | "Likely fit — verify" | "Check compatibility";
  stock: string;
  leadTime?: string;
  imgUrl?: string;
}

export interface Customer {
  id: string;
  name: string;
  company?: string;
  email: string;
  phone: string;
  address: string;
  aircraft: string[];
  totalWorkOrders: number;
  openInvoices: number;
  totalBilled: number;
  outstandingBalance: number;
  lastService: string;
  preferredContact: "Email" | "Phone" | "Text";
  notes: string;
  tags: string[];
  createdAt: string;
}

type AddWorkOrderOptions = {
  onPersisted?: (workOrder: WorkOrder) => void;
};

type AddInvoiceOptions = {
  onPersisted?: (invoice: Invoice) => void;
};

type AddEstimateOptions = {
  onPersisted?: (estimate: Estimate) => void;
};

interface DataStoreContextType {
  aircraft: ApiAircraft[];
  getAircraftIdByTail: (tail: string) => string | null;
  refreshAircraft: () => Promise<void>;
  logbookEntries: LogbookEntry[];
  workOrders: WorkOrder[];
  invoices: Invoice[];
  customers: Customer[];
  estimates: Estimate[];
  
  addLogbookEntry: (entry: Omit<LogbookEntry, "id" | "createdAt" | "updatedAt">) => LogbookEntry;
  updateLogbookEntry: (id: string, updates: Partial<LogbookEntry>) => void;
  deleteLogbookEntry: (id: string) => void;
  
  addWorkOrder: (
    wo: Omit<WorkOrder, "id" | "createdAt" | "updatedAt">,
    options?: AddWorkOrderOptions
  ) => WorkOrder;
  updateWorkOrder: (id: string, updates: Partial<WorkOrder>) => Promise<boolean>;
  deleteWorkOrder: (id: string) => void;
  addWorkOrderActivity: (woId: string, entry: Omit<ActivityEntry, "id">) => void;
  
  addInvoice: (
    invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt">,
    options?: AddInvoiceOptions
  ) => Invoice;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  
  addCustomer: (customer: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;

  addEstimate: (
    est: Omit<Estimate, "id" | "createdAt" | "updatedAt">,
    options?: AddEstimateOptions
  ) => Estimate;
  updateEstimate: (id: string, updates: Partial<Estimate>) => void;
  deleteEstimate: (id: string) => void;
  convertEstimateToWorkOrder: (
    estimateId: string,
    options?: AddWorkOrderOptions
  ) => WorkOrder | null;
  
  searchParts: (query: string, aircraft: string) => PartSearchResult[];
  
  exportAllData: () => string;
  importData: (jsonString: string) => void;
  clearAllData: () => void;
}

/* ============================================================= */
/*  CONTEXT                                                      */
/* ============================================================= */

const DataStoreContext = createContext<DataStoreContextType | null>(null);

export function useDataStore() {
  const context = useContext(DataStoreContext);
  if (!context) {
    throw new Error("useDataStore must be used within DataStoreProvider");
  }
  return context;
}

/* ============================================================= */
/*  PROVIDER                                                     */
/* ============================================================= */

const STORAGE_KEY = "myaircraft_workspace_data_v1";

function normalizeTailNumber(tail: string): string {
  return tail.trim().toUpperCase();
}

function isLocalWorkspaceId(id?: string | null): boolean {
  return typeof id === "string" && /^(wo|inv|cust|est|entry)-/.test(id);
}

function toPersistableId(id?: string | null): string | null {
  if (!id || isLocalWorkspaceId(id)) {
    return null;
  }
  return id;
}

function toApiLogbookEntryType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("annual")) return "annual";
  if (normalized.includes("100")) return "100hr";
  if (normalized.includes("ad")) return "ad_compliance";
  if (normalized.includes("service") || normalized.includes("return")) return "return_to_service";
  if (normalized.includes("oil")) return "oil_change";
  if (normalized.includes("repair")) return "major_repair";
  if (normalized.includes("alter")) return "major_alteration";
  if (normalized.includes("replace")) return "component_replacement";
  return "maintenance";
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error("Failed to load from storage:", e);
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Failed to save to storage:", e);
  }
}

function normalizePartLineStatus(status: unknown): PartsLine["status"] {
  if (typeof status !== "string") return undefined;
  const normalized = status.trim().toLowerCase();
  switch (normalized) {
    case "ordered":
      return "Ordered";
    case "received":
      return "Received";
    case "installed":
      return "Installed";
    case "backordered":
      return "Backordered";
    default:
      return undefined;
  }
}

function normalizeOutsideServiceStatus(status: unknown): OutsideService["status"] {
  if (typeof status !== "string") return undefined;
  const normalized = status.trim().toLowerCase();
  switch (normalized) {
    case "pending":
      return "Pending";
    case "completed":
      return "Completed";
    case "cancelled":
    case "canceled":
      return "Cancelled";
    default:
      return undefined;
  }
}

function normalizeEstimateStatus(status: unknown): Estimate["status"] {
  if (typeof status !== "string") return "Draft";
  switch (status.trim().toLowerCase()) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "converted":
      return "Converted";
    default:
      return "Draft";
  }
}

function isActivityType(value: unknown): value is ActivityEntry["type"] {
  return typeof value === "string" && [
    "note",
    "status",
    "labor",
    "part",
    "media",
    "approval",
    "system",
    "owner-update",
    "ai-summary",
  ].includes(value);
}

function mapThreadMessagesToActivity(messages: ApiThreadMessage[] | null | undefined): ActivityEntry[] {
  const safeMessages = Array.isArray(messages) ? messages : [];
  return safeMessages.map((message) => {
    const metadata = message.metadata ?? {};
    const type =
      isActivityType(metadata.type)
        ? metadata.type
        : message.role === "system"
          ? "system"
          : typeof metadata.laborHours === "number"
            ? "labor"
            : "note";
    const senderName =
      (typeof metadata.author === "string" && metadata.author.trim()) ||
      message.sender?.full_name ||
      message.sender?.email ||
      (message.role === "assistant" ? "AI" : message.role === "system" ? "System" : "Team");

    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    const mediaUrls = attachments
      .map((attachment) => attachment.path || attachment.name)
      .filter((value): value is string => Boolean(value));

    return {
      id: message.id,
      type,
      author: senderName,
      role:
        typeof metadata.role === "string"
          ? metadata.role
          : message.role === "assistant"
            ? "AI"
            : undefined,
      content: message.content,
      visibility: metadata.visibility === "owner-visible" ? "owner-visible" : "internal",
      timestamp: message.created_at,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      laborHours:
        typeof metadata.laborHours === "number"
          ? metadata.laborHours
          : undefined,
      laborCategory:
        typeof metadata.laborCategory === "string"
          ? metadata.laborCategory
          : undefined,
      partPN:
        typeof metadata.partPN === "string"
          ? metadata.partPN
          : undefined,
      statusFrom:
        typeof metadata.statusFrom === "string"
          ? metadata.statusFrom
          : undefined,
      statusTo:
        typeof metadata.statusTo === "string"
          ? metadata.statusTo
          : undefined,
    } satisfies ActivityEntry;
  });
}

function inferMessageIntent(entry: Omit<ActivityEntry, "id">): string | null {
  switch (entry.type) {
    case "labor":
      return "action";
    case "part":
      return "parts_lookup";
    case "approval":
    case "owner-update":
    case "system":
      return "action";
    case "ai-summary":
      return "query";
    default:
      return "work_order";
  }
}

function mapWorkOrderLines(lines: any[] | null | undefined) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const laborLines: LaborLine[] = safeLines
    .filter((line) => line?.line_type === "labor")
    .map((line) => ({
      id: line.id,
      desc: line.description ?? "Labor",
      hours: Number(line.hours ?? line.quantity ?? 0),
      rate: Number(line.rate ?? line.unit_price ?? 0),
      total: Number(line.line_total ?? (Number(line.quantity ?? 0) * Number(line.unit_price ?? 0))),
    }));

  const partsLines: PartsLine[] = safeLines
    .filter((line) => line?.line_type === "part")
    .map((line) => ({
      id: line.id,
      pn: line.part_number ?? "",
      desc: line.description ?? "Part",
      qty: Number(line.quantity ?? 1),
      price: Number(line.unit_price ?? 0),
      total: Number(line.line_total ?? (Number(line.quantity ?? 1) * Number(line.unit_price ?? 0))),
      vendor: line.vendor ?? undefined,
      condition: line.condition ?? undefined,
      status: normalizePartLineStatus(line.status),
    }));

  const outsideServices: OutsideService[] = safeLines
    .filter((line) => line?.line_type === "outside_service")
    .map((line) => ({
      id: line.id,
      desc: line.description ?? "Outside service",
      vendor: line.vendor ?? "",
      cost: Number(line.line_total ?? (Number(line.quantity ?? 1) * Number(line.unit_price ?? 0))),
      status: normalizeOutsideServiceStatus(line.status),
    }));

  return { laborLines, partsLines, outsideServices };
}

function mapInvoiceLineItems(items: any[] | null | undefined) {
  const safeItems = Array.isArray(items) ? items : [];
  const laborLines: LaborLine[] = safeItems
    .filter((item) => item?.item_type === "labor")
    .map((item) => ({
      id: item.id,
      desc: item.description ?? "Labor",
      hours: Number(item.quantity ?? 0),
      rate: Number(item.unit_price ?? 0),
      total: Number(item.line_total ?? (Number(item.quantity ?? 0) * Number(item.unit_price ?? 0))),
    }));

  const partsLines: PartsLine[] = safeItems
    .filter((item) => item?.item_type === "part")
    .map((item) => ({
      id: item.id,
      pn: item.part_number ?? "",
      desc: item.description ?? "Part",
      qty: Number(item.quantity ?? 1),
      price: Number(item.unit_price ?? 0),
      total: Number(item.line_total ?? (Number(item.quantity ?? 1) * Number(item.unit_price ?? 0))),
      vendor: item.vendor ?? undefined,
      condition: item.condition ?? undefined,
      status: normalizePartLineStatus(item.status),
    }));

  const outsideServices: OutsideService[] = safeItems
    .filter((item) => item?.item_type === "outside_service")
    .map((item) => ({
      id: item.id,
      desc: item.description ?? "Outside service",
      vendor: item.vendor ?? "",
      cost: Number(item.line_total ?? (Number(item.quantity ?? 1) * Number(item.unit_price ?? 0))),
      status: normalizeOutsideServiceStatus(item.status),
    }));

  return { laborLines, partsLines, outsideServices };
}

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [logbookEntries, setLogbookEntries] = useState<LogbookEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>(() => {
    if (typeof window === "undefined") return [];
    return loadFromStorage<Estimate[]>("myaircraft_estimates_v1", []);
  });
  const [aircraft, setAircraft] = useState<ApiAircraft[]>([]);
  const aircraftIdByTail = (tail: string) => {
    const normalized = normalizeTailNumber(tail);
    if (!normalized) return null;
    const match = aircraft.find((a) => a.tail_number?.toUpperCase() === normalized);
    return match?.id ?? null;
  };

  const refreshAircraft = async () => {
    try {
      const res = await fetch("/api/aircraft", { cache: "no-store" });
      if (!res.ok) return;
      const payload = await res.json().catch(() => []);
      const aircraftList = Array.isArray(payload) ? payload : [];
      setAircraft(aircraftList as ApiAircraft[]);
    } catch (error) {
      console.error("Failed to refresh aircraft", error);
    }
  };

  const shouldHydrateWorkspaceData =
    !pathname.startsWith("/documents") &&
    !pathname.startsWith("/ask") &&
    !pathname.startsWith("/scanner") &&
    !pathname.startsWith("/review");

  // Load real data from the backend.
  useEffect(() => {
    if (!shouldHydrateWorkspaceData) {
      return;
    }

    let cancelled = false;

    async function loadAll() {
      try {
        const [aircraftRes, customersRes, workOrdersRes, invoicesRes, estimatesRes, logbookRes] = await Promise.all([
          fetch("/api/aircraft"),
          fetch("/api/customers"),
          fetch("/api/work-orders"),
          fetch("/api/invoices"),
          fetch("/api/estimates"),
          fetch("/api/logbook-entries"),
        ]);

        const aircraftPayload = await aircraftRes.json().catch(() => []);
        const customersPayload = await customersRes.json().catch(() => ({ customers: [] }));
        const workOrdersPayload = await workOrdersRes.json().catch(() => ({ work_orders: [] }));
        const invoicesPayload = await invoicesRes.json().catch(() => ({ invoices: [] }));
        const estimatesPayload = await estimatesRes.json().catch(() => ({ estimates: [] }));
        const logbookPayload = await logbookRes.json().catch(() => ({ entries: [] }));

        if (cancelled) return;

        const aircraftList = Array.isArray(aircraftPayload) ? aircraftPayload : [];
        setAircraft(aircraftList as ApiAircraft[]);

        const apiCustomers = (customersPayload?.customers ?? []) as ApiCustomer[];
        if (apiCustomers.length === 0) {
          const orgPayload = await fetch("/api/organization", { cache: "no-store" })
            .then(async (res) => (res.ok ? res.json() : null))
            .catch(() => null);
          const orgName = orgPayload?.organization?.name ?? "Horizon Flights";
          const created = await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: orgName,
              company: orgName,
              email: "ops@horizonflights.com",
              phone: "",
              tags: ["Primary Customer"],
            }),
          });
          const createdPayload = await created.json().catch(() => null);
          if (createdPayload?.id) {
            apiCustomers.push(createdPayload as ApiCustomer);
          }
        }

        const customersMapped = apiCustomers.map((c) => {
          const tails =
            c.aircraft_customer_assignments?.map((a) => a.aircraft?.tail_number).filter(Boolean) as string[] || [];
          return {
            id: c.id,
            name: c.name,
            company: c.company ?? "",
            email: c.email ?? "",
            phone: c.phone ?? "",
            address: c.billing_address ?? "",
            aircraft: tails,
            totalWorkOrders: 0,
            openInvoices: 0,
            totalBilled: 0,
            outstandingBalance: 0,
            lastService: "",
            preferredContact: (c.preferred_contact as Customer["preferredContact"]) ?? "Email",
            notes: c.notes ?? "",
            tags: c.tags ?? [],
            createdAt: new Date().toISOString(),
          } satisfies Customer;
        });
        setCustomers(customersMapped);

        const customerById = new Map(customersMapped.map((c) => [c.id, c]));
        const aircraftById = new Map(aircraftList.map((a: ApiAircraft) => [a.id, a]));

        const workOrdersApi = (workOrdersPayload?.work_orders ?? []) as ApiWorkOrder[];
        const workOrderDetails = await Promise.all(
          workOrdersApi.map(async (workOrder) => {
            try {
              const res = await fetch(`/api/work-orders/${workOrder.id}`, { cache: "no-store" });
              if (!res.ok) return null;
              return await res.json();
            } catch (error) {
              console.error("Failed to load work order detail", error);
              return null;
            }
          })
        );
        const workOrderMessages = await Promise.all(
          workOrdersApi.map(async (workOrder) => {
            try {
              const res = await fetch(`/api/work-orders/${workOrder.id}/messages?limit=200`, {
                cache: "no-store",
              });
              if (!res.ok) return null;
              const payload = await res.json().catch(() => null);
              return {
                id: workOrder.id,
                messages: Array.isArray(payload?.messages) ? (payload.messages as ApiThreadMessage[]) : [],
              };
            } catch (error) {
              console.error("Failed to load work order messages", error);
              return null;
            }
          })
        );
        const workOrderDetailById = new Map(
          workOrderDetails.filter((detail): detail is { id: string; lines?: any[] } => Boolean(detail?.id)).map((detail) => [detail.id, detail])
        );
        const workOrderMessagesById = new Map(
          workOrderMessages
            .filter((entry): entry is { id: string; messages: ApiThreadMessage[] } => Boolean(entry?.id))
            .map((entry) => [entry.id, entry.messages])
        );
        const mappedWos = workOrdersApi.map((wo) => {
          const ac = wo.aircraft ?? (wo.aircraft_id ? aircraftById.get(wo.aircraft_id) : undefined);
          const owner = ac?.owner_customer_id ? customerById.get(ac.owner_customer_id) : undefined;
          const customer =
            wo.customer ??
            (wo.customer_id ? customerById.get(wo.customer_id) : undefined) ??
            owner;
          const detail = workOrderDetailById.get(wo.id);
          const { laborLines, partsLines, outsideServices } = mapWorkOrderLines(detail?.lines);
          return {
            id: wo.id,
            woNumber: wo.work_order_number,
            serviceType: wo.service_type ?? "",
            aircraft: ac?.tail_number ?? "",
            makeModel: [ac?.make, ac?.model].filter(Boolean).join(" ") || "",
            serial: "",
            customer: customer?.name ?? "",
            customerId: wo.customer_id ?? customer?.id ?? undefined,
            company: customer?.company ?? "",
            mechanic: "",
            assignedMechanicId: wo.assigned_mechanic_id ?? undefined,
            assignedMechanics: [],
            openedDate: wo.opened_at ?? wo.created_at,
            closedDate: wo.closed_at ?? undefined,
            status: toUiWorkOrderStatus(wo.status),
            progress: undefined,
            squawk: wo.customer_complaint ?? "",
            discrepancy: wo.discrepancy ?? "",
            correctiveAction: wo.corrective_action ?? "",
            findings: wo.findings ?? "",
            laborLines,
            partsLines,
            outsideServices,
            activity: mapThreadMessagesToActivity(workOrderMessagesById.get(wo.id)),
            internalNotes: wo.internal_notes ?? "",
            customerNotes: wo.customer_notes ?? "",
            totalLabor: wo.labor_total ?? 0,
            totalParts: wo.parts_total ?? 0,
            totalOutside: wo.outside_services_total ?? 0,
            grandTotal: wo.total ?? 0,
            linkedInvoice: wo.linked_invoice_id ?? undefined,
            linkedEstimate: undefined,
            linkedLogbookEntry: wo.linked_logbook_entry_id ?? undefined,
            createdAt: wo.created_at,
            updatedAt: wo.updated_at,
          } satisfies WorkOrder;
        });
        setWorkOrders(mappedWos);

        const invoicesApi = (invoicesPayload?.invoices ?? []) as ApiInvoice[];
        const invoiceDetails = await Promise.all(
          invoicesApi.map(async (invoice) => {
            try {
              const res = await fetch(`/api/invoices/${invoice.id}`, { cache: "no-store" });
              if (!res.ok) return null;
              return await res.json();
            } catch (error) {
              console.error("Failed to load invoice detail", error);
              return null;
            }
          })
        );
        const invoiceDetailById = new Map(
          invoiceDetails.filter((detail): detail is { id: string; line_items?: any[]; customer?: { name?: string | null } | null } => Boolean(detail?.id)).map((detail) => [detail.id, detail])
        );
        const mappedInvoices = invoicesApi.map((inv) => {
          const detail = invoiceDetailById.get(inv.id);
          const { laborLines, partsLines, outsideServices } = mapInvoiceLineItems(detail?.line_items);
          return {
            id: inv.id,
            invoiceNumber: inv.invoice_number,
            aircraft: inv.aircraft?.tail_number ?? "",
            customer: inv.customer?.name ?? "",
            company: detail?.customer?.name ?? inv.customer?.name ?? "",
            issuedDate: inv.invoice_date ?? "",
            dueDate: inv.due_date ?? "",
            status: (inv.status ?? "Draft").replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) as Invoice["status"],
            laborLines,
            partsLines,
            outsideServices,
            subtotalLabor: laborLines.reduce((sum, line) => sum + line.total, 0),
            subtotalParts: partsLines.reduce((sum, line) => sum + line.total, 0),
            subtotalOutside: outsideServices.reduce((sum, line) => sum + line.cost, 0),
            taxRate: inv.tax_rate ?? 0,
            tax: inv.tax_amount ?? 0,
            shipping: 0,
            total: inv.total ?? 0,
            notes: inv.notes ?? "",
            paymentStatus:
              inv.status === "paid"
                ? "Paid"
                : inv.amount_paid && inv.amount_paid > 0
                  ? "Partial"
                  : "Unpaid",
            amountPaid: inv.amount_paid ?? 0,
            linkedWorkOrder: inv.work_order_id ?? undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } satisfies Invoice;
        });
        setInvoices(mappedInvoices);

        const estimatesApi = (estimatesPayload?.estimates ?? []) as ApiEstimate[];
        const mappedEstimates: Estimate[] = estimatesApi.map((estimate) => {
          const aircraftRecord =
            estimate.aircraft ??
            (estimate.aircraft_id ? aircraftById.get(estimate.aircraft_id) : undefined);
          const owner =
            aircraftRecord?.owner_customer_id
              ? customerById.get(aircraftRecord.owner_customer_id)
              : undefined;
          const customer =
            estimate.customer ??
            (estimate.customer_id ? customerById.get(estimate.customer_id) : undefined) ??
            owner;
          const { laborLines, partsLines, outsideServices } = mapInvoiceLineItems(estimate.line_items);

          return {
            id: estimate.id,
            estimateNumber: estimate.estimate_number,
            aircraft: aircraftRecord?.tail_number ?? "",
            makeModel: [aircraftRecord?.make, aircraftRecord?.model].filter(Boolean).join(" "),
            customer: customer?.name ?? "",
            company: customer?.company ?? "",
            mechanic: estimate.mechanic_name ?? "",
            status: normalizeEstimateStatus(estimate.status),
            laborLines,
            partsLines,
            outsideServices,
            assumptions: estimate.assumptions ?? "",
            internalNotes: estimate.internal_notes ?? "",
            customerNotes: estimate.customer_notes ?? "",
            subtotalLabor: estimate.labor_total ?? laborLines.reduce((sum, line) => sum + line.total, 0),
            subtotalParts: estimate.parts_total ?? partsLines.reduce((sum, line) => sum + line.total, 0),
            subtotalOutside:
              estimate.outside_services_total ??
              outsideServices.reduce((sum, line) => sum + line.cost, 0),
            total: estimate.total ?? 0,
            linkedWorkOrder: estimate.linked_work_order_id ?? undefined,
            validUntil: estimate.valid_until ?? undefined,
            createdAt: estimate.created_at,
            updatedAt: estimate.updated_at,
          } satisfies Estimate;
        });
        setEstimates((prev) => {
          const localOnly = prev.filter((estimate) => isLocalWorkspaceId(estimate.id));
          const merged: Estimate[] = [...mappedEstimates];
          localOnly.forEach((estimate) => {
            if (!merged.some((item) => item.id === estimate.id)) {
              merged.unshift(estimate);
            }
          });
          return merged;
        });

        const logbookEntriesApi = (logbookPayload?.entries ?? []) as ApiLogbookEntry[];
        const mappedLogbookEntries = logbookEntriesApi.map((entry) => {
          const aircraftRecord =
            entry.aircraft ??
            (entry.aircraft_id ? aircraftById.get(entry.aircraft_id) : undefined);
          return {
            id: entry.id,
            aircraft: aircraftRecord?.tail_number ?? "",
            makeModel: [aircraftRecord?.make, aircraftRecord?.model].filter(Boolean).join(" "),
            serial: aircraftRecord?.serial_number ?? "",
            engine: aircraftRecord?.engine_model ?? "",
            date: entry.entry_date,
            type: entry.entry_type,
            body: entry.description,
            mechanic: "",
            certificateNumber: "",
            status:
              entry.status === "signed"
                ? "signed"
                : entry.status === "draft"
                  ? "draft"
                  : "archived",
            totalTime: entry.total_time ?? 0,
            hobbs: entry.hobbs_out ?? undefined,
            tach: entry.tach_time ?? undefined,
            linkedWO: entry.work_order_id ?? undefined,
            signatureDate: entry.signed_at ?? undefined,
            createdAt: entry.created_at,
            updatedAt: entry.updated_at,
          } satisfies LogbookEntry;
        });
        setLogbookEntries(mappedLogbookEntries);
      } catch (err) {
        console.error("Failed to load workspace data", err);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [shouldHydrateWorkspaceData]);

  useEffect(() => {
    saveToStorage("myaircraft_estimates_v1", estimates);
  }, [estimates]);

  /* ---- Logbook Entries ---- */
  const addLogbookEntry = (entry: Omit<LogbookEntry, "id" | "createdAt" | "updatedAt">) => {
    const newEntry: LogbookEntry = {
      ...entry,
      id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setLogbookEntries((prev) => [newEntry, ...prev]);
    (async () => {
      try {
        const aircraftId = aircraftIdByTail(entry.aircraft);
        if (!aircraftId) return;

        const res = await fetch("/api/logbook-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aircraft_id: aircraftId,
            work_order_id: toPersistableId(entry.linkedWO),
            entry_type: toApiLogbookEntryType(entry.type),
            entry_date: entry.date,
            description: entry.body,
            total_time: entry.totalTime ?? 0,
            hobbs_out: entry.hobbs ?? null,
            tach_time: entry.tach ?? null,
            status: entry.status === "signed" ? "signed" : "draft",
          }),
        });

        if (!res.ok) return;
        const payload = await res.json().catch(() => null);
        if (!payload?.id) return;

        setLogbookEntries((prev) =>
          prev.map((item) =>
            item.id === newEntry.id
              ? {
                  ...item,
                  id: payload.id,
                  status: payload.status === "signed" ? "signed" : item.status,
                  signatureDate: payload.signed_at ?? item.signatureDate,
                  createdAt: payload.created_at ?? item.createdAt,
                  updatedAt: payload.updated_at ?? item.updatedAt,
                }
              : item
          )
        );

        const linkedWorkOrderIds: string[] = [];
        setWorkOrders((prev) =>
          prev.map((item) => {
            if (item.linkedLogbookEntry !== newEntry.id) {
              return item;
            }
            linkedWorkOrderIds.push(item.id);
            return { ...item, linkedLogbookEntry: payload.id, updatedAt: new Date().toISOString() };
          })
        );
        linkedWorkOrderIds
          .filter((workOrderId) => !isLocalWorkspaceId(workOrderId))
          .forEach((workOrderId) => {
            void fetch(`/api/work-orders/${workOrderId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ linked_logbook_entry_id: payload.id }),
            }).catch((error) => {
              console.error("Failed to link logbook entry to work order", error);
            });
          });
      } catch (error) {
        console.error("Failed to create logbook entry", error);
      }
    })();
    return newEntry;
  };

  const updateLogbookEntry = (id: string, updates: Partial<LogbookEntry>) => {
    setLogbookEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
      )
    );
  };

  const deleteLogbookEntry = (id: string) => {
    setLogbookEntries((prev) => prev.filter((e) => e.id !== id));
  };

  /* ---- Work Orders ---- */
  const remapWorkOrderReferences = (
    previousId: string,
    nextId: string,
    nextWorkOrderNumber?: string | null
  ) => {
    setWorkOrders((prev) =>
      prev.map((item) =>
        item.id === previousId
          ? {
              ...item,
              id: nextId,
              woNumber: nextWorkOrderNumber ?? item.woNumber,
            }
          : item
      )
    );
    const linkedEstimateIds: string[] = [];
    setEstimates((prev) =>
      prev.map((item) => {
        if (item.linkedWorkOrder !== previousId) {
          return item;
        }
        if (!isLocalWorkspaceId(item.id)) {
          linkedEstimateIds.push(item.id);
        }
        return { ...item, linkedWorkOrder: nextId, updatedAt: new Date().toISOString() };
      })
    );
    linkedEstimateIds.forEach((estimateId) => {
      void fetch(`/api/estimates/${estimateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linked_work_order_id: nextId }),
      }).catch((error) => {
        console.error("Failed to link estimate to work order", error);
      });
    });
    setInvoices((prev) =>
      prev.map((item) =>
        item.linkedWorkOrder === previousId
          ? { ...item, linkedWorkOrder: nextId }
          : item
      )
    );
    setLogbookEntries((prev) =>
      prev.map((item) =>
        item.linkedWO === previousId
          ? { ...item, linkedWO: nextId }
          : item
      )
    );
  };

  const addWorkOrder = (
    wo: Omit<WorkOrder, "id" | "createdAt" | "updatedAt">,
    options?: AddWorkOrderOptions
  ) => {
    const newWO: WorkOrder = {
      ...wo,
      id: `wo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setWorkOrders((prev) => [newWO, ...prev]);
    (async () => {
      try {
        const aircraftMatch = aircraft.find(
          (a) => normalizeTailNumber(a.tail_number) === normalizeTailNumber(wo.aircraft)
        );
        const matchedCustomer =
          customers.find((c) => c.id === wo.customerId) ??
          customers.find((c) => c.name.trim().toLowerCase() === wo.customer.trim().toLowerCase());
        const res = await fetch("/api/work-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aircraft_id: aircraftMatch?.id ?? null,
            customer_id: toPersistableId(matchedCustomer?.id ?? wo.customerId),
            assigned_mechanic_id: toPersistableId(wo.assignedMechanicId),
            status: toDbWorkOrderStatus(wo.status),
            service_type: wo.serviceType ?? null,
            complaint: wo.squawk ?? "",
            discrepancy: wo.discrepancy ?? wo.squawk ?? "",
            corrective_action: wo.correctiveAction ?? "",
            findings: wo.findings ?? "",
            internal_notes: wo.internalNotes ?? "",
            customer_notes: wo.customerNotes ?? "",
          }),
        });
        if (!res.ok) return;
        const payload = await res.json().catch(() => null);
        if (!payload?.id) return;
        const persistedWorkOrder: WorkOrder = {
          ...newWO,
          id: payload.id,
          woNumber: payload.work_order_number ?? newWO.woNumber,
          customerId: payload.customer_id ?? newWO.customerId,
          assignedMechanicId: payload.assigned_mechanic_id ?? newWO.assignedMechanicId,
          linkedInvoice: payload.linked_invoice_id ?? newWO.linkedInvoice,
          linkedLogbookEntry: payload.linked_logbook_entry_id ?? newWO.linkedLogbookEntry,
        };
        remapWorkOrderReferences(
          newWO.id,
          persistedWorkOrder.id,
          persistedWorkOrder.woNumber
        );
        options?.onPersisted?.(persistedWorkOrder);
      } catch (err) {
        console.error("Failed to create work order", err);
      }
    })();
    return newWO;
  };

  const updateWorkOrder = async (id: string, updates: Partial<WorkOrder>) => {
    const previous = workOrders.find((w) => w.id === id);
    if (!previous) return false;

    const nextWorkOrder = {
      ...previous,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    setWorkOrders((prev) =>
      prev.map((w) =>
        w.id === id ? nextWorkOrder : w
      )
    );
    try {
      const payload: Record<string, unknown> = {};
      if (updates.status) {
        payload.status = toDbWorkOrderStatus(updates.status);
      }
      if (updates.serviceType !== undefined) payload.service_type = updates.serviceType;
      if (updates.squawk !== undefined) payload.complaint = updates.squawk;
      if (updates.discrepancy !== undefined) payload.discrepancy = updates.discrepancy;
      if (updates.correctiveAction !== undefined) payload.corrective_action = updates.correctiveAction;
      if (updates.findings !== undefined) payload.findings = updates.findings;
      if (updates.internalNotes !== undefined) payload.internal_notes = updates.internalNotes;
      if (updates.customerNotes !== undefined) payload.customer_notes = updates.customerNotes;
      if (updates.customerId !== undefined) payload.customer_id = toPersistableId(updates.customerId);
      if (updates.assignedMechanicId !== undefined) {
        payload.assigned_mechanic_id = toPersistableId(updates.assignedMechanicId);
      }
      if (updates.linkedInvoice !== undefined) {
        payload.linked_invoice_id = toPersistableId(updates.linkedInvoice);
      }
      if (updates.linkedLogbookEntry !== undefined) {
        payload.linked_logbook_entry_id = toPersistableId(updates.linkedLogbookEntry);
      }
      if (updates.closedDate !== undefined) payload.closed_at = updates.closedDate;
      if (Object.keys(payload).length === 0) return true;

      const res = await fetch(`/api/work-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      const persisted = await res.json().catch(() => null);
      if (persisted?.id) {
        setWorkOrders((prev) =>
          prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  customerId: persisted.customer_id ?? nextWorkOrder.customerId,
                  assignedMechanicId:
                    persisted.assigned_mechanic_id ?? nextWorkOrder.assignedMechanicId,
                  linkedInvoice: persisted.linked_invoice_id ?? nextWorkOrder.linkedInvoice,
                  linkedLogbookEntry:
                    persisted.linked_logbook_entry_id ?? nextWorkOrder.linkedLogbookEntry,
                  closedDate: persisted.closed_at ?? nextWorkOrder.closedDate,
                  updatedAt: persisted.updated_at ?? nextWorkOrder.updatedAt,
                }
              : w
          )
        );
      }

      return true;
    } catch (err) {
      console.error("Failed to update work order", err);
      setWorkOrders((prev) => prev.map((w) => (w.id === id ? previous : w)));
      return false;
    }
  };

  const deleteWorkOrder = (id: string) => {
    setWorkOrders((prev) => prev.filter((w) => w.id !== id));
    (async () => {
      try {
        await fetch(`/api/work-orders/${id}`, { method: "DELETE" });
      } catch (err) {
        console.error("Failed to delete work order", err);
      }
    })();
  };

  const addWorkOrderActivity = (woId: string, entry: Omit<ActivityEntry, "id">) => {
    const newEntry: ActivityEntry = {
      ...entry,
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    setWorkOrders((prev) =>
      prev.map((w) =>
        w.id === woId
          ? { ...w, activity: [...(w.activity || []), newEntry], updatedAt: new Date().toISOString() }
          : w
      )
    );
    if (isLocalWorkspaceId(woId)) {
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/work-orders/${woId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: entry.content,
            intent: inferMessageIntent(entry),
            metadata: {
              type: entry.type,
              visibility: entry.visibility,
              role: entry.role,
              author: entry.author,
              timestamp: entry.timestamp,
              mediaUrls: entry.mediaUrls ?? [],
              laborHours: entry.laborHours ?? null,
              laborCategory: entry.laborCategory ?? null,
              partPN: entry.partPN ?? null,
              statusFrom: entry.statusFrom ?? null,
              statusTo: entry.statusTo ?? null,
            },
            attachments: (entry.mediaUrls ?? []).map((url) => ({
              path: url,
              kind: "file",
            })),
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.id) {
          return;
        }
        const persistedEntry = mapThreadMessagesToActivity([payload as ApiThreadMessage])[0];
        if (!persistedEntry) {
          return;
        }
        setWorkOrders((prev) =>
          prev.map((workOrder) =>
            workOrder.id === woId
              ? {
                  ...workOrder,
                  activity: (workOrder.activity ?? []).map((item) =>
                    item.id === newEntry.id ? persistedEntry : item
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : workOrder
          )
        );
      } catch (error) {
        console.error("Failed to persist work order activity", error);
      }
    })();
  };

  /* ---- Invoices ---- */
  const addInvoice = (
    invoice: Omit<Invoice, "id" | "createdAt" | "updatedAt">,
    options?: AddInvoiceOptions
  ) => {
    const newInvoice: Invoice = {
      ...invoice,
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setInvoices((prev) => [newInvoice, ...prev]);
    (async () => {
      try {
        const customerMatch = customers.find(
          (c) => c.name.trim().toLowerCase() === invoice.customer.trim().toLowerCase()
        );
        const aircraftMatch = aircraft.find(
          (a) => normalizeTailNumber(a.tail_number) === normalizeTailNumber(invoice.aircraft)
        );
        const res = await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: customerMatch?.id ?? null,
            aircraft_id: aircraftMatch?.id ?? null,
            work_order_id: toPersistableId(invoice.linkedWorkOrder),
            notes: invoice.notes ?? "",
          }),
        });
        if (!res.ok) return;
        const payload = await res.json().catch(() => null);
        if (!payload?.id) return;
        const persistedInvoice: Invoice = {
          ...newInvoice,
          id: payload.id,
          invoiceNumber: payload.invoice_number ?? newInvoice.invoiceNumber,
        };
        setInvoices((prev) =>
          prev.map((item) =>
            item.id === newInvoice.id
              ? persistedInvoice
              : item
          )
        );
        const linkedWorkOrderIds: string[] = [];
        setWorkOrders((prev) =>
          prev.map((item) => {
            if (item.linkedInvoice !== newInvoice.id) {
              return item;
            }
            linkedWorkOrderIds.push(item.id);
            return { ...item, linkedInvoice: payload.id, updatedAt: new Date().toISOString() };
          })
        );
        linkedWorkOrderIds
          .filter((workOrderId) => !isLocalWorkspaceId(workOrderId))
          .forEach((workOrderId) => {
            void fetch(`/api/work-orders/${workOrderId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ linked_invoice_id: payload.id }),
            }).catch((error) => {
              console.error("Failed to link invoice to work order", error);
            });
          });
        options?.onPersisted?.(persistedInvoice);
      } catch (err) {
        console.error("Failed to create invoice", err);
      }
    })();
    return newInvoice;
  };

  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    const previous = invoices.find((invoice) => invoice.id === id);
    if (!previous) return;
    const nextInvoice = { ...previous, ...updates, updatedAt: new Date().toISOString() };

    setInvoices((prev) =>
      prev.map((invoice) =>
        invoice.id === id ? nextInvoice : invoice
      )
    );

    if (isLocalWorkspaceId(id)) {
      return;
    }

    (async () => {
      try {
        if (
          updates.paymentStatus === "Paid" &&
          typeof nextInvoice.total === "number" &&
          nextInvoice.total > (previous.amountPaid ?? 0)
        ) {
          const paymentAmount = Number((nextInvoice.total - (previous.amountPaid ?? 0)).toFixed(2));
          const paymentRes = await fetch(`/api/invoices/${id}/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: paymentAmount,
              payment_method: "manual",
              notes: "Marked paid from workspace",
            }),
          });

          if (!paymentRes.ok) {
            const json = await paymentRes.json().catch(() => ({}));
            throw new Error(json.error ?? `HTTP ${paymentRes.status}`);
          }
          return;
        }

        const payload: Record<string, unknown> = {};
        if (updates.status) {
          payload.status =
            updates.status === "Cancelled"
              ? "void"
              : updates.status.toLowerCase();
        }
        if (updates.dueDate !== undefined) payload.due_date = updates.dueDate;
        if (updates.issuedDate !== undefined) payload.invoice_date = updates.issuedDate;
        if (updates.taxRate !== undefined) payload.tax_rate = updates.taxRate;
        if (updates.tax !== undefined) payload.tax_amount = updates.tax;
        if (updates.notes !== undefined) payload.notes = updates.notes;

        if (Object.keys(payload).length === 0) return;

        const res = await fetch(`/api/invoices/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
      } catch (error) {
        console.error("Failed to update invoice", error);
        setInvoices((prev) => prev.map((invoice) => (invoice.id === id ? previous : invoice)));
      }
    })();
  };

  const deleteInvoice = (id: string) => {
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  };

  /* ---- Customers ---- */
  const addCustomer = (customer: Omit<Customer, "id" | "createdAt">) => {
    const newCustomer: Customer = {
      ...customer,
      id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    setCustomers((prev) => [newCustomer, ...prev]);
    (async () => {
      try {
        const res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: customer.name,
            company: customer.company,
            email: customer.email,
            phone: customer.phone,
            billing_address: customer.address,
            notes: customer.notes,
            tags: customer.tags,
          }),
        });
        if (!res.ok) return;
        const payload = await res.json().catch(() => null);
        if (!payload?.id) return;
        setCustomers((prev) =>
          prev.map((c) => (c.id === newCustomer.id ? { ...c, id: payload.id } : c))
        );
        const linkedWorkOrderIds: string[] = [];
        setWorkOrders((prev) =>
          prev.map((workOrder) => {
            if (workOrder.customerId !== newCustomer.id) {
              return workOrder;
            }
            linkedWorkOrderIds.push(workOrder.id);
            return {
              ...workOrder,
              customerId: payload.id,
              updatedAt: new Date().toISOString(),
            };
          })
        );
        linkedWorkOrderIds
          .filter((workOrderId) => !isLocalWorkspaceId(workOrderId))
          .forEach((workOrderId) => {
            void fetch(`/api/work-orders/${workOrderId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ customer_id: payload.id }),
            }).catch((error) => {
              console.error("Failed to link customer to work order", error);
            });
          });
      } catch (err) {
        console.error("Failed to create customer", err);
      }
    })();
    return newCustomer;
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    (async () => {
      try {
        await fetch(`/api/customers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: updates.name,
            company: updates.company,
            email: updates.email,
            phone: updates.phone,
            billing_address: updates.address,
            notes: updates.notes,
            tags: updates.tags,
            preferred_contact: updates.preferredContact,
          }),
        });
      } catch (err) {
        console.error("Failed to update customer", err);
      }
    })();
  };

  /* ---- Estimates ---- */
  const addEstimate = (
    est: Omit<Estimate, "id" | "createdAt" | "updatedAt">,
    options?: AddEstimateOptions
  ) => {
    const newEst: Estimate = {
      ...est,
      id: `est-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEstimates((prev) => [newEst, ...prev]);
    (async () => {
      try {
        const aircraftMatch = aircraft.find(
          (item) => normalizeTailNumber(item.tail_number) === normalizeTailNumber(est.aircraft)
        );
        const customerMatch = customers.find(
          (customer) => customer.name.trim().toLowerCase() === est.customer.trim().toLowerCase()
        );

        const res = await fetch("/api/estimates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aircraft_id: aircraftMatch?.id ?? null,
            customer_id: toPersistableId(customerMatch?.id),
            mechanic_name: est.mechanic,
            status: est.status.toLowerCase(),
            assumptions: est.assumptions ?? "",
            internal_notes: est.internalNotes ?? "",
            customer_notes: est.customerNotes ?? "",
            labor_total: est.subtotalLabor ?? 0,
            parts_total: est.subtotalParts ?? 0,
            outside_services_total: est.subtotalOutside ?? 0,
            total: est.total ?? 0,
            valid_until: est.validUntil ?? null,
            linked_work_order_id: toPersistableId(est.linkedWorkOrder),
            labor_lines: est.laborLines,
            parts_lines: est.partsLines,
            outside_services: est.outsideServices,
          }),
        });
        if (!res.ok) return;
        const payload = await res.json().catch(() => null);
        if (!payload?.id) return;
        const persistedEstimate: Estimate = {
          ...newEst,
          id: payload.id,
          estimateNumber: payload.estimate_number ?? newEst.estimateNumber,
          linkedWorkOrder: payload.linked_work_order_id ?? newEst.linkedWorkOrder,
          validUntil: payload.valid_until ?? newEst.validUntil,
          createdAt: payload.created_at ?? newEst.createdAt,
          updatedAt: payload.updated_at ?? newEst.updatedAt,
        };
        setEstimates((prev) =>
          prev.map((item) => (item.id === newEst.id ? persistedEstimate : item))
        );
        options?.onPersisted?.(persistedEstimate);
      } catch (error) {
        console.error("Failed to create estimate", error);
      }
    })();
    return newEst;
  };

  const updateEstimate = (id: string, updates: Partial<Estimate>) => {
    const previous = estimates.find((estimate) => estimate.id === id);
    if (!previous) return;
    const nextEstimate = {
      ...previous,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    setEstimates((prev) =>
      prev.map((estimate) =>
        estimate.id === id ? nextEstimate : estimate
      )
    );

    if (isLocalWorkspaceId(id)) {
      return;
    }

    (async () => {
      try {
        const payload: Record<string, unknown> = {};
        if (updates.status) payload.status = updates.status.toLowerCase();
        if (updates.assumptions !== undefined) payload.assumptions = updates.assumptions;
        if (updates.internalNotes !== undefined) payload.internal_notes = updates.internalNotes;
        if (updates.customerNotes !== undefined) payload.customer_notes = updates.customerNotes;
        if (updates.validUntil !== undefined) payload.valid_until = updates.validUntil;
        if (updates.linkedWorkOrder !== undefined) {
          payload.linked_work_order_id = toPersistableId(updates.linkedWorkOrder);
        }
        if (updates.mechanic !== undefined) payload.mechanic_name = updates.mechanic;
        if (Object.keys(payload).length === 0) return;

        const res = await fetch(`/api/estimates/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }

        const persisted = await res.json().catch(() => null);
        if (persisted?.id) {
          setEstimates((prev) =>
            prev.map((estimate) =>
              estimate.id === id
                ? {
                    ...estimate,
                    status: normalizeEstimateStatus(persisted.status ?? nextEstimate.status),
                    linkedWorkOrder: persisted.linked_work_order_id ?? nextEstimate.linkedWorkOrder,
                    validUntil: persisted.valid_until ?? nextEstimate.validUntil,
                    updatedAt: persisted.updated_at ?? nextEstimate.updatedAt,
                  }
                : estimate
            )
          );
        }
      } catch (error) {
        console.error("Failed to update estimate", error);
        setEstimates((prev) => prev.map((estimate) => (estimate.id === id ? previous : estimate)));
      }
    })();
  };

  const deleteEstimate = (id: string) => {
    setEstimates((prev) => prev.filter((e) => e.id !== id));
    if (isLocalWorkspaceId(id)) {
      return;
    }
    (async () => {
      try {
        await fetch(`/api/estimates/${id}`, { method: "DELETE" });
      } catch (error) {
        console.error("Failed to delete estimate", error);
      }
    })();
  };

  const convertEstimateToWorkOrder = (
    estimateId: string,
    options?: AddWorkOrderOptions
  ): WorkOrder | null => {
    const est = estimates.find((e) => e.id === estimateId);
    if (!est) return null;
    if (est.linkedWorkOrder) {
      return workOrders.find((workOrder) => workOrder.id === est.linkedWorkOrder) ?? null;
    }
    if (est.status !== "Approved") {
      return null;
    }
    const matchedCustomer = customers.find(
      (customer) => customer.name.trim().toLowerCase() === est.customer.trim().toLowerCase()
    );
    const newWO = addWorkOrder(
      {
        woNumber: `WO-${Date.now().toString().slice(-6)}`,
        aircraft: est.aircraft,
        makeModel: est.makeModel,
        serial: "",
        customer: est.customer,
        customerId: matchedCustomer?.id,
        company: est.company,
        mechanic: est.mechanic,
        assignedMechanicId: undefined,
        assignedMechanics: [est.mechanic],
        openedDate: new Date().toISOString(),
        status: "Open",
        progress: 0,
        squawk: est.customerNotes,
        discrepancy: "",
        correctiveAction: "",
        findings: "",
        laborLines: est.laborLines,
        partsLines: est.partsLines,
        outsideServices: est.outsideServices,
        activity: [
          {
            id: `act-${Date.now()}`,
            type: "system",
            author: "System",
            content: `Work order created from Estimate ${est.estimateNumber}.`,
            visibility: "internal",
            timestamp: new Date().toISOString(),
          },
        ],
        internalNotes: est.internalNotes,
        customerNotes: est.customerNotes,
        totalLabor: est.subtotalLabor,
        totalParts: est.subtotalParts,
        totalOutside: est.subtotalOutside,
        grandTotal: est.total,
        linkedEstimate: est.id,
      },
      options
    );
    updateEstimate(estimateId, { status: "Converted", linkedWorkOrder: newWO.id });
    return newWO;
  };

  /* ---- Parts Search (mock Atlas API) ---- */
  const searchParts = (query: string, _aircraft: string): PartSearchResult[] => {
    void query;
    return [];
  };

  /* ---- Data Export/Import ---- */
  const exportAllData = () => {
    const data = {
      logbookEntries,
      workOrders,
      invoices,
      customers,
      estimates,
      exportDate: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  };

  const importData = (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.logbookEntries) setLogbookEntries(data.logbookEntries);
      if (data.workOrders) setWorkOrders(data.workOrders);
      if (data.invoices) setInvoices(data.invoices);
      if (data.customers) setCustomers(data.customers);
      if (data.estimates) setEstimates(data.estimates);
    } catch (e) {
      console.error("Failed to import data:", e);
      throw new Error("Invalid data format");
    }
  };

  const clearAllData = () => {
    setLogbookEntries([]);
    setWorkOrders([]);
    setInvoices([]);
    setCustomers([]);
    setEstimates([]);
  };

  const value: DataStoreContextType = {
    aircraft,
    getAircraftIdByTail: aircraftIdByTail,
    refreshAircraft,
    logbookEntries,
    workOrders,
    invoices,
    customers,
    estimates,
    addLogbookEntry,
    updateLogbookEntry,
    deleteLogbookEntry,
    addWorkOrder,
    updateWorkOrder,
    deleteWorkOrder,
    addWorkOrderActivity,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    addCustomer,
    updateCustomer,
    addEstimate,
    updateEstimate,
    deleteEstimate,
    convertEstimateToWorkOrder,
    searchParts,
    exportAllData,
    importData,
    clearAllData,
  };

  return <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>;
}
