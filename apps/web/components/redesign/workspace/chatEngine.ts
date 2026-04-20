/* ------------------------------------------------------------------ */
/*  Chat Intent Detection + Mock AI Response Engine                     */
/* ------------------------------------------------------------------ */

export type ArtifactType =
  | "logbook-entry"
  | "work-order"
  | "invoice"
  | "parts-lookup"
  | "customer-card"
  | "signature"
  | "compliance-checklist"
  | "inspection-checklist"
  | "thread-summary"
  | "estimate"
  | null;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  artifact?: ArtifactType;
  artifactData?: any;
  actions?: ChatAction[];
}

export interface ChatAction {
  label: string;
  icon?: string;
  action: string;
  variant?: "primary" | "secondary" | "ghost";
}

export interface AircraftContext {
  tailNumber: string;
  make: string;
  model: string;
  serial: string;
  year: number;
  engine: string;
  propeller: string;
  totalTime: number;
  hobbs: number;
  tach: number;
  owner: string;
  ownerCompany: string;
  maintenanceProgram: string;
  lastAnnual: string;
  nextAnnual: string;
  openSquawks: string[];
  activeWorkOrders: string[];
}

export interface ChatThread {
  id: string;
  title: string;
  aircraft?: string;
  customer?: string;
  workOrder?: string;
  pinned: boolean;
  archived: boolean;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  scope: "aircraft" | "customer" | "work-order" | "general";
}

/* ---- Aircraft mock data ---- */
export const AIRCRAFT_DB: Record<string, AircraftContext> = {
  N12345: {
    tailNumber: "N12345",
    make: "Cessna",
    model: "172S Skyhawk SP",
    serial: "172S-10847",
    year: 2006,
    engine: "Lycoming IO-360-L2A (S/N L-42891-51A)",
    propeller: "McCauley 1C235/LFA7570 (S/N 123456)",
    totalTime: 3847.2,
    hobbs: 3847.2,
    tach: 3621.8,
    owner: "John Mitchell",
    ownerCompany: "Mitchell Aviation LLC",
    maintenanceProgram: "Part 91 — Annual/100hr",
    lastAnnual: "2025-08-14",
    nextAnnual: "2026-08-14",
    openSquawks: ["Left brake pad wear noted", "Nav light intermittent"],
    activeWorkOrders: [],
  },
  N67890: {
    tailNumber: "N67890",
    make: "Piper",
    model: "PA-28-181 Archer III",
    serial: "2843517",
    year: 2001,
    engine: "Lycoming O-360-A4M (S/N L-30291-51A)",
    propeller: "Sensenich 76EM8-0-62 (S/N 87654)",
    totalTime: 5231.6,
    hobbs: 5231.6,
    tach: 4987.3,
    owner: "Horizon Flights Inc.",
    ownerCompany: "Horizon Flights Inc.",
    maintenanceProgram: "Part 135 — Progressive",
    lastAnnual: "2025-11-02",
    nextAnnual: "2026-11-02",
    openSquawks: ["AD 2024-15-06 compliance pending"],
    activeWorkOrders: ["WO-2026-0047"],
  },
  N24680: {
    tailNumber: "N24680",
    make: "Beechcraft",
    model: "A36 Bonanza",
    serial: "E-3214",
    year: 1998,
    engine: "Continental IO-550-B (S/N 123789)",
    propeller: "Hartzell PHC-C3YF-2UF (S/N FK1234)",
    totalTime: 4102.0,
    hobbs: 4102.0,
    tach: 3876.5,
    owner: "Steve & Karen Williams",
    ownerCompany: "",
    maintenanceProgram: "Part 91 — Annual",
    lastAnnual: "2025-06-20",
    nextAnnual: "2026-06-20",
    openSquawks: [],
    activeWorkOrders: [],
  },
};

/* ---- Intent patterns ---- */
interface IntentPattern {
  patterns: RegExp[];
  artifact: ArtifactType;
  handler: (input: string, aircraft: AircraftContext) => { content: string; artifactData?: any; actions?: ChatAction[] };
}

let woCounter = 1048;
let invCounter = 2031;

const INTENT_MAP: IntentPattern[] = [
  // Logbook entry
  {
    patterns: [
      /\b(prepare|create|make|generate|draft|write|log)\b.*\b(logbook|log\s?book|entry|maintenance entry|return.to.service)/i,
      /\b(logbook|log\s?book)\b.*\b(entry)/i,
      /\blog this work\b/i,
      /\breturn.to.service\b/i,
    ],
    artifact: "logbook-entry",
    handler: (input, ac) => {
      const isAnnual = /annual/i.test(input);
      const is100hr = /100.?h/i.test(input);
      const isOilChange = /oil\s?(change|service)/i.test(input);
      const isAD = /\bAD\b|airworthiness directive/i.test(input);

      let entryType = "Standard Maintenance";
      if (isAnnual) entryType = "Annual Inspection Signoff";
      else if (is100hr) entryType = "100-Hour Inspection Signoff";
      else if (isOilChange) entryType = "Oil Change";
      else if (isAD) entryType = "AD Compliance";

      return {
        content: `I'll prepare a **${entryType}** logbook entry for **${ac.tailNumber}** (${ac.make} ${ac.model}).

I've pre-filled what I know from the aircraft records. The entry draft is open in the workspace panel.

**What I still need from you:**
${isOilChange ? "- Oil quantity and brand used\n- Oil filter P/N if replaced\n- Hobbs/tach at time of service" : ""}
${isAnnual ? "- Hobbs time at inspection\n- Tach time at inspection\n- Any discrepancies found and corrected\n- Reference to inspection checklist used" : ""}
${!isOilChange && !isAnnual ? "- Description of work performed\n- Parts used (if any)\n- Reference manual/ICA/STC (if applicable)" : ""}

You can type the details here and I'll update the entry, or edit directly in the panel.`,
        artifactData: {
          type: entryType,
          aircraft: ac.tailNumber,
          makeModel: `${ac.make} ${ac.model}`,
          serial: ac.serial,
          engine: ac.engine,
          totalTime: ac.totalTime,
          hobbs: ac.hobbs,
          tach: ac.tach,
          date: new Date().toISOString().split("T")[0],
          mechanic: "John Mitchell",
          certificateNumber: "2847591",
          status: "draft",
          body: isOilChange
            ? `Drained engine oil and replaced with ___ quarts _____ W100. Replaced oil filter with Champion CH48110-1. Engine oil screen inspected — no debris noted. Hobbs: ___. Tach: ___.\n\nAircraft returned to service. 14 CFR 43.3(a).`
            : isAnnual
            ? `Conducted annual inspection in accordance with 14 CFR 91.409. Inspection performed per manufacturer's inspection checklist and AC 43.13-1B.\n\nAirframe total time: ${ac.totalTime} hrs.\n\nAll applicable ADs checked for compliance. No unresolved discrepancies.\n\nI hereby certify that this aircraft has been inspected in accordance with an annual inspection and was determined to be in airworthy condition.\n\n14 CFR 43.11, Appendix D.`
            : `[Work description to be entered]\n\nAircraft returned to service. 14 CFR 43.3(a).`,
          missingFields: isOilChange
            ? ["oil_quantity", "oil_brand", "hobbs_at_service", "tach_at_service"]
            : isAnnual
            ? ["hobbs_at_inspection", "tach_at_inspection", "discrepancies"]
            : ["work_description", "parts_used"],
        },
        actions: [
          { label: "Edit Entry", action: "edit-entry", variant: "primary" },
          { label: "Regenerate Wording", action: "regenerate", variant: "secondary" },
          { label: "Show Owner-Friendly", action: "owner-friendly", variant: "ghost" },
        ],
      };
    },
  },
  // Work order
  {
    patterns: [
      /\b(generate|create|start|open|new|prepare)\b.*\b(work\s?order|job|work\s?sheet|work\s?card)/i,
      /\bwork\s?order\b/i,
      /\bstart.*(job|maintenance)\b/i,
    ],
    artifact: "work-order",
    handler: (_input, ac) => {
      woCounter++;
      const woNum = `WO-2026-${String(woCounter).padStart(4, "0")}`;
      return {
        content: `I've created **${woNum}** for **${ac.tailNumber}** (${ac.make} ${ac.model}).

The work order is now open in the workspace panel with the aircraft and customer info pre-filled.

You can add details by typing naturally:
- *"add 2.5 hours labor"*
- *"add oil filter part ABC123"*
- *"set squawk to left brake dragging"*
- *"add discrepancy: brake pad worn beyond limits"*
- *"mark awaiting parts"*

I'll update the work order in real time.`,
        artifactData: {
          woNumber: woNum,
          aircraft: ac.tailNumber,
          makeModel: `${ac.make} ${ac.model}`,
          serial: ac.serial,
          customer: ac.owner,
          company: ac.ownerCompany,
          mechanic: "John Mitchell",
          openedDate: new Date().toISOString(),
          status: "Open",
          squawk: "",
          discrepancy: "",
          correctiveAction: "",
          findings: "",
          laborLines: [],
          partsLines: [],
          outsideServices: [],
          internalNotes: "",
          customerNotes: "",
          attachments: [],
          totalLabor: 0,
          totalParts: 0,
          totalOutside: 0,
          grandTotal: 0,
        },
        actions: [
          { label: "Add Labor", action: "add-labor", variant: "primary" },
          { label: "Add Part", action: "add-part", variant: "secondary" },
          { label: "Generate Entry", action: "generate-entry", variant: "ghost" },
        ],
      };
    },
  },
  // Invoice
  {
    patterns: [
      /\b(generate|create|prepare|make)\b.*\b(invoice|bill)/i,
      /\bbill\s+customer\b/i,
      /\bsummarize\s+charges\b/i,
    ],
    artifact: "invoice",
    handler: (_input, ac) => {
      invCounter++;
      const invNum = `INV-2026-${String(invCounter).padStart(4, "0")}`;
      return {
        content: `I've generated invoice **${invNum}** for **${ac.owner}** tied to **${ac.tailNumber}**.

The invoice is open in the workspace panel. I've pulled the customer and aircraft details.

You can add line items:
- *"add 3 hours labor at $125/hr"*
- *"add oil filter $42.50"*
- *"add outside service: prop balance $350"*
- *"set due date net 30"*
- *"add 8% tax"*`,
        artifactData: {
          invoiceNumber: invNum,
          aircraft: ac.tailNumber,
          customer: ac.owner,
          company: ac.ownerCompany,
          issuedDate: new Date().toISOString().split("T")[0],
          dueDate: "",
          status: "Draft",
          laborLines: [],
          partsLines: [],
          outsideServices: [],
          subtotalLabor: 0,
          subtotalParts: 0,
          subtotalOutside: 0,
          tax: 0,
          shipping: 0,
          total: 0,
          notes: "",
          paymentStatus: "Unpaid",
          linkedWorkOrder: "",
        },
        actions: [
          { label: "Add Line Item", action: "add-line", variant: "primary" },
          { label: "Email Customer", action: "email", variant: "secondary" },
          { label: "Download PDF", action: "download-pdf", variant: "ghost" },
        ],
      };
    },
  },
  // Parts
  {
    patterns: [
      /\b(find|search|look\s?up|locate)\b.*\b(part|alternator|filter|brake|magneto|spark\s?plug|tire|battery)/i,
      /\bparts?\b.*\b(catalog|IPC|lookup)\b/i,
      /\bIPC\b/i,
    ],
    artifact: "parts-lookup",
    handler: (input, ac) => {
      const partMatch = input.match(/\b(alternator|oil filter|brake|magneto|spark plug|tire|battery|starter|vacuum pump|fuel pump)\b/i);
      const partName = partMatch ? partMatch[1] : "part";

      const mockResults = [
        { pn: "ALX-9120", alt: "ALX-9120-1", desc: `${partName} assembly — OEM`, vendor: "Aircraft Spruce", price: "$485.00", condition: "New", fit: "Confirmed", stock: "In stock" },
        { pn: "RA-2126A", alt: "ALT-212-6A", desc: `${partName} — PMA Approved`, vendor: "Preferred Airparts", price: "$312.00", condition: "New-PMA", fit: "Confirmed", stock: "In stock" },
        { pn: "ALX-9120-OH", alt: "", desc: `${partName} — Overhauled`, vendor: "Southeast Components", price: "$195.00", condition: "Overhauled", fit: "Likely fit — verify S/N range", stock: "Available 3-5 days" },
      ];

      return {
        content: `I found **3 results** for **${partName}** compatible with **${ac.tailNumber}** (${ac.make} ${ac.model}).

Results are shown in the workspace panel with pricing, condition, and fit confidence.

⚠️ *Note: The overhauled unit needs serial number range verification before confirming fit.*

You can say:
- *"add the first one to the work order"*
- *"show more vendors"*
- *"save for later"*`,
        artifactData: {
          query: partName,
          aircraft: ac.tailNumber,
          makeModel: `${ac.make} ${ac.model}`,
          results: mockResults,
        },
        actions: [
          { label: "Add to Work Order", action: "add-to-wo", variant: "primary" },
          { label: "Refine Search", action: "refine", variant: "secondary" },
          { label: "Save for Later", action: "save", variant: "ghost" },
        ],
      };
    },
  },
  // Customer
  {
    patterns: [
      /\b(show|view|open|display)\b.*\b(customer|owner|client)\b/i,
      /\bcustomer\s*(history|profile|card|info|details)\b/i,
      /\b(create|add|new)\b.*\bcustomer\b/i,
    ],
    artifact: "customer-card",
    handler: (_input, ac) => ({
      content: `Here's the customer profile for **${ac.owner}**${ac.ownerCompany ? ` (${ac.ownerCompany})` : ""}.

The customer card is open in the workspace panel with their aircraft, work history, and billing summary.`,
      artifactData: {
        name: ac.owner,
        company: ac.ownerCompany,
        email: "john@mitchellaviation.com",
        phone: "(512) 555-0147",
        address: "4200 Airport Blvd, Suite 102, Austin TX 78722",
        aircraft: [ac.tailNumber],
        totalWorkOrders: 12,
        openInvoices: 1,
        totalBilled: "$14,827.50",
        outstandingBalance: "$1,250.00",
        lastService: "2026-03-15",
        preferredContact: "Email",
        notes: "Prefers detailed invoices. Always wants photos of work.",
        tags: ["Owner-Operator", "Part 91", "Regular Customer"],
      },
      actions: [
        { label: "Email Customer", action: "email", variant: "primary" },
        { label: "View Invoices", action: "invoices", variant: "secondary" },
        { label: "View Work Orders", action: "work-orders", variant: "ghost" },
      ],
    }),
  },
  // Show active work orders
  {
    patterns: [/\b(show|list|view)\b.*\b(active|open|pending)\b.*\b(work\s?orders?|jobs?)\b/i],
    artifact: null,
    handler: (_input, ac) => ({
      content: `Here are the **active work orders** for ${ac.tailNumber}:

| WO # | Status | Squawk | Opened |
|---|---|---|---|
| WO-2026-0047 | In Progress | Left brake dragging | Mar 28, 2026 |
| WO-2026-0042 | Awaiting Parts | Nav light intermittent | Mar 15, 2026 |

You can say *"open WO-2026-0047"* to view details, or *"create new work order"* to start a fresh one.`,
      actions: [
        { label: "Open WO-0047", action: "open-wo", variant: "primary" },
        { label: "New Work Order", action: "new-wo", variant: "secondary" },
      ],
    }),
  },
  // Show overdue invoices
  {
    patterns: [
      /\b(show|list|view)\b.*\b(overdue|unpaid|open|pending)\b.*\b(invoice|bill)/i,
      /\bwho\b.*\bnot\b.*\bpaid\b/i,
      /\bunpaid\b.*\bbalance/i,
    ],
    artifact: null,
    handler: () => ({
      content: `Here are **overdue invoices** across all customers:\n\n| Invoice | Customer | Amount | Due | Days Overdue |\n|---|---|---|---|---|\n| INV-2026-1987 | Horizon Flights Inc. | $3,450.00 | Mar 1, 2026 | 32 days |\n| INV-2026-2005 | Steve Williams | $875.00 | Mar 18, 2026 | 15 days |\n\n**Total outstanding: $4,325.00**\n\nYou can say *"send reminder for INV-2026-1987"* or *"mark INV-2026-2005 paid"*.`,
      actions: [
        { label: "Send Reminders", action: "send-reminders", variant: "primary" },
        { label: "View All Invoices", action: "all-invoices", variant: "secondary" },
      ],
    }),
  },
  // Estimate / Quote
  {
    patterns: [
      /\b(create|generate|prepare|make|build|start)\b.*\b(estimate|quote)/i,
      /\bhow much\b.*\b(cost|charge)\b/i,
      /\b(price|cost)\b.*\b(annual|oil change|brake|100.?hr|repair)\b/i,
    ],
    artifact: "estimate",
    handler: (_input, ac) => {
      const estNum = `EST-2026-${String(Math.floor(1000 + Math.random() * 9000))}`;
      return {
        content: `I've started estimate **${estNum}** for **${ac.owner}** — **${ac.tailNumber}** (${ac.make} ${ac.model}).\n\nThe estimate is open in the workspace panel. Add line items by typing naturally:\n- *"add 3 hours labor at $125/hr"*\n- *"add oil filter part CH48110-1 at $42.50"*\n- *"add outside service: prop balance $350"*\n- *"add 8% tax"*\n- *"set valid for 30 days"*\n\nOnce ready, you can email it to the customer or convert it to a work order.`,
        artifactData: {
          estimateNumber: estNum,
          aircraft: ac.tailNumber,
          makeModel: `${ac.make} ${ac.model}`,
          customer: ac.owner,
          company: ac.ownerCompany,
          createdDate: new Date().toISOString().split("T")[0],
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          status: "Draft",
          laborLines: [],
          partsLines: [],
          outsideServices: [],
          subtotalLabor: 0,
          subtotalParts: 0,
          subtotalOutside: 0,
          tax: 0,
          total: 0,
          notes: "",
        },
        actions: [
          { label: "Add Labor", action: "add-labor", variant: "primary" },
          { label: "Email Estimate", action: "email", variant: "secondary" },
          { label: "Convert to WO", action: "convert-wo", variant: "ghost" },
        ],
      };
    },
  },
  // List all customers
  {
    patterns: [
      /\b(list|show|view|all)\b.*\bcustomers?\b/i,
      /\bcustomer\s+list\b/i,
      /\bwho are my customers\b/i,
    ],
    artifact: "customer-card",
    handler: () => ({
      content: `Here are all **7 customers** currently in your system:\n\n| Customer | Aircraft | Outstanding | Last Service |\n|---|---|---|---|\n| John Mitchell | N12345 | $1,250 | Mar 15, 2026 |\n| Horizon Flights Inc. | N67890 | $3,450 | Feb 28, 2026 |\n| Steve & Karen Williams | N24680 | $0 | Jan 12, 2026 |\n| Blue Canyon Aviation | N88132 | $875 | Mar 22, 2026 |\n| Marcus Reed | N55491 | $0 | Dec 10, 2025 |\n| Sunrise Charter LLC | N34210 | $0 | Nov 3, 2025 |\n| Paula Devlin | N77043 | $220 | Apr 1, 2026 |\n\n**Total outstanding: $5,795.00**\n\nSay *"open customer Horizon Flights"*, *"create invoice for John Mitchell"*, or *"send reminder to all overdue"*.`,
      artifactData: {
        name: "All Customers",
        company: "",
        email: "",
        phone: "",
        address: "",
        aircraft: ["N12345", "N67890", "N24680"],
        totalWorkOrders: 47,
        openInvoices: 4,
        totalBilled: "$87,340.00",
        outstandingBalance: "$5,795.00",
        lastService: "2026-04-01",
        preferredContact: "—",
        notes: "Showing all customers in the system.",
        tags: ["All Customers"],
      },
      actions: [
        { label: "Add Customer", action: "add-customer", variant: "primary" },
        { label: "Send Reminders", action: "send-reminders", variant: "secondary" },
        { label: "Export CSV", action: "export", variant: "ghost" },
      ],
    }),
  },
  // Settings
  {
    patterns: [
      /\b(update|change|edit|modify|view|open)\b.*\b(setting|profile|password|email|notification|billing|labor rate|shop)\b/i,
      /\bsettings?\b/i,
      /\bmy profile\b/i,
      /\blabor rate\b/i,
    ],
    artifact: null,
    handler: () => ({
      content: `Here's a quick overview of your account settings. I can help you with any of these:\n\n**Account**\n- Update email, password, or profile photo\n- Manage notification preferences\n\n**Shop Settings**\n- Update shop name, address, certificate numbers\n- Configure default labor rates (currently **$125.00/hr**)\n- Manage mechanics & staff access\n\n**Billing & Invoicing**\n- Update payment methods\n- Set default payment terms (currently **Net 30**)\n- Configure tax rates (currently **8%**)\n- Invoice template & logo settings\n\nJust tell me what you'd like to update and I'll walk you through it.`,
      actions: [
        { label: "Account Settings", action: "account-settings", variant: "primary" },
        { label: "Shop Settings", action: "shop-settings", variant: "secondary" },
        { label: "Billing Settings", action: "billing-settings", variant: "ghost" },
      ],
    }),
  },
  // AD compliance lookup
  {
    patterns: [
      /\bAD\s+compliance\b/i,
      /\bairworthiness\s+directive\b/i,
      /\bcheck\b.*\bADs?\b/i,
      /\bopen\s+ADs?\b/i,
    ],
    artifact: "compliance-checklist",
    handler: (_input, ac) => ({
      content: `Here are the **Airworthiness Directives** status for **${ac.tailNumber}** (${ac.make} ${ac.model}):\n\n| AD Number | Subject | Compliance | Status |\n|---|---|---|---|\n| AD 2024-15-06 | Fuel cap seal inspection | One-time / Recurring 100hr | ⚠️ Pending |\n| AD 2023-08-12 | Seat rail inspection | One-time, completed | ✅ Done |\n| AD 2022-19-03 | ELT battery replacement | Every 2 yrs | ✅ Current |\n| AD 2021-07-15 | Alternator belt check | Every 100hr | ✅ Current |\n\n**1 open AD requiring attention.** Say *"create work order for AD 2024-15-06"* to address it.`,
      artifactData: {
        aircraft: ac.tailNumber,
        type: "AD Compliance",
        sections: [
          { name: "Fuel System", items: 3, completed: 2 },
          { name: "Structural", items: 5, completed: 5 },
          { name: "Electrical", items: 4, completed: 4 },
          { name: "Avionics", items: 2, completed: 2 },
        ],
      },
      actions: [
        { label: "Create WO for Open AD", action: "create-wo-ad", variant: "primary" },
        { label: "Full AD Report", action: "ad-report", variant: "secondary" },
      ],
    }),
  },
  // Inspection checklist
  {
    patterns: [
      /\b(inspection|annual|100.?hour)\b.*\b(checklist|list)\b/i,
      /\bchecklist\b.*\b(inspection|annual)\b/i,
    ],
    artifact: "inspection-checklist",
    handler: (_input, ac) => ({
      content: `I've generated an **inspection checklist** for **${ac.tailNumber}** (${ac.make} ${ac.model}).

The checklist is based on the manufacturer's inspection requirements and AC 43.13-1B guidelines. It's open in the workspace panel for you to work through.`,
      artifactData: {
        aircraft: ac.tailNumber,
        type: "Annual Inspection",
        sections: [
          { name: "Fuselage & Hull", items: 14, completed: 0 },
          { name: "Wings & Center Section", items: 12, completed: 0 },
          { name: "Empennage", items: 8, completed: 0 },
          { name: "Landing Gear", items: 10, completed: 0 },
          { name: "Engine", items: 18, completed: 0 },
          { name: "Propeller", items: 6, completed: 0 },
          { name: "Avionics & Instruments", items: 11, completed: 0 },
          { name: "Electrical", items: 9, completed: 0 },
        ],
      },
    }),
  },
];

/* ---- Inline command patterns (work order modifications) ---- */
interface InlineCommand {
  patterns: RegExp[];
  handler: (input: string, ac: AircraftContext) => string;
  woUpdate?: (input: string) => any;
}

const INLINE_COMMANDS: InlineCommand[] = [
  {
    patterns: [/\badd\b.*?(\d+\.?\d*)\s*(hours?|hrs?)\s*(labor|work)?/i],
    handler: (input, ac) => {
      const match = input.match(/(\d+\.?\d*)\s*(hours?|hrs?)/i);
      const hrs = match ? match[1] : "?";
      return `Added **${hrs} hours labor** to the active work order. Running total updated in the panel.`;
    },
  },
  {
    patterns: [/\badd\b.*\bpart\b.*?([\w-]+)/i, /\badd\b.*?([\w-]+)\s*(part|filter|plug|gasket)/i],
    handler: (input) => {
      const pnMatch = input.match(/[A-Z]{2,}[\w-]+/);
      const pn = pnMatch ? pnMatch[0] : "specified part";
      return `Added part **${pn}** to the work order parts list. You can specify quantity and price, or I'll look it up.`;
    },
  },
  {
    patterns: [/\b(set|add)\b.*\b(squawk|complaint)\b/i],
    handler: (input) => {
      const text = input.replace(/^.*?(squawk|complaint)\s*(to|:|\s)/i, "").trim();
      return `Set customer squawk/complaint to: *"${text || "[needs description]"}"*\n\nUpdated in the work order panel.`;
    },
  },
  {
    patterns: [/\bmark\b.*\b(awaiting\s?parts|waiting|complete|closed|in\s?progress)/i],
    handler: (input) => {
      const statusMatch = input.match(/(awaiting\s?parts|waiting|complete|closed|in\s?progress)/i);
      const status = statusMatch ? statusMatch[1] : "updated";
      return `Work order status changed to **${status.charAt(0).toUpperCase() + status.slice(1)}**. Updated in the panel.`;
    },
  },
  {
    patterns: [/\b(summarize|summary)\b.*\b(work\s?order|job|work)\b/i],
    handler: (_input, ac) =>
      `**Work Order Summary — ${ac.tailNumber}**\n\nCustomer: ${ac.owner}\nAircraft: ${ac.make} ${ac.model}\n\nLabor: 4.5 hrs @ $125/hr = $562.50\nParts: Oil filter, 8 qts oil = $127.40\nOutside Services: None\n\n**Estimated Total: $689.90**\n\nSay *"generate invoice"* to bill the customer, or *"generate logbook entry"* to create the maintenance record.`,
  },
];

/* ---- Main response generator ---- */
export function generateResponse(
  input: string,
  aircraft: AircraftContext
): ChatMessage {
  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const timestamp = new Date();

  // Check intent patterns
  for (const intent of INTENT_MAP) {
    for (const pattern of intent.patterns) {
      if (pattern.test(input)) {
        const result = intent.handler(input, aircraft);
        return {
          id,
          role: "assistant",
          content: result.content,
          timestamp,
          artifact: intent.artifact,
          artifactData: result.artifactData,
          actions: result.actions,
        };
      }
    }
  }

  // Check inline commands
  for (const cmd of INLINE_COMMANDS) {
    for (const pattern of cmd.patterns) {
      if (pattern.test(input)) {
        return {
          id,
          role: "assistant",
          content: cmd.handler(input, aircraft),
          timestamp,
        };
      }
    }
  }

  // General fallback — contextual aviation response
  return {
    id,
    role: "assistant",
    content: getFallbackResponse(input, aircraft),
    timestamp,
  };
}

function getFallbackResponse(input: string, ac: AircraftContext): string {
  if (/last\s*annual/i.test(input)) {
    return `The last annual inspection for **${ac.tailNumber}** was completed on **${ac.lastAnnual}**.\n\nNext annual is due by **${ac.nextAnnual}**. That gives you approximately ${Math.round((new Date(ac.nextAnnual).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days.`;
  }
  if (/total\s*time/i.test(input)) {
    return `**${ac.tailNumber}** current total time: **${ac.totalTime} hours**\nHobbs: ${ac.hobbs} | Tach: ${ac.tach}`;
  }
  if (/open\s*(squawk|discrepanc)/i.test(input)) {
    if (ac.openSquawks.length === 0) return `No open squawks for **${ac.tailNumber}**. Aircraft is clean.`;
    return `Open squawks for **${ac.tailNumber}**:\n${ac.openSquawks.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nSay *"create work order"* to address these.`;
  }
  if (/hello|hi|hey/i.test(input)) {
    return `Hello! I'm your AI Command Center. I have **${ac.tailNumber}** (${ac.make} ${ac.model}) loaded.\n\nI can handle everything from here:\n- *"Prepare a logbook entry for oil change"*\n- *"Create a work order for brake repair"*\n- *"Generate invoice for John Mitchell"*\n- *"Create an estimate"*\n- *"Find alternator for this aircraft"*\n- *"List all customers"*\n- *"Show overdue invoices"*\n- *"Check AD compliance"*\n- *"Open inspection checklist"*\n- *"Update my settings"*\n\nWhat would you like to do?`;
  }

  return `I understand you're asking about "${input.slice(0, 60)}${input.length > 60 ? "..." : ""}" for **${ac.tailNumber}** (${ac.make} ${ac.model}).\n\nI can help with logbook entries, work orders, invoices, estimates, parts lookup, customer management, AD compliance, and settings. Could you clarify what you'd like me to do?\n\nTry:\n- *"Prepare a logbook entry for oil change"*\n- *"Create work order"*\n- *"Create an estimate"*\n- *"Find part for left brake disc"*\n- *"List all customers"*\n- *"Check AD compliance"*`;
}

/* ---- Smart thread title generator ---- */
export function generateThreadTitle(firstUserMessage: string, aircraft?: string): string {
  const msg = firstUserMessage.toLowerCase();
  const tail = aircraft ? ` · ${aircraft}` : "";

  // Logbook
  if (/annual|100.?hr inspection/.test(msg)) return `Annual Inspection${tail}`;
  if (/oil.?change/.test(msg)) return `Oil Change Log${tail}`;
  if (/return.to.service/.test(msg)) return `Return to Service${tail}`;
  if (/logbook|log\s?book/.test(msg)) return `Logbook Entry${tail}`;

  // Work order
  if (/work.?order|create.*job|start.*job/.test(msg)) {
    const forMatch = firstUserMessage.match(/for\s+(.{4,30}?)(?:\.|$)/i);
    return forMatch ? `WO: ${forMatch[1].trim()}${tail}` : `Work Order${tail}`;
  }

  // Invoice
  if (/invoice|bill customer/.test(msg)) return `Invoice${tail}`;

  // Estimate
  if (/estimate|quote/.test(msg)) return `Estimate${tail}`;

  // Parts
  const partMatch = msg.match(/(alternator|oil filter|brake|magneto|spark plug|tire|battery|starter|vacuum pump|fuel pump)/);
  if (partMatch) return `Parts: ${partMatch[1]}${tail}`;
  if (/parts?.*(lookup|search|find)|find.*part/.test(msg)) return `Parts Lookup${tail}`;

  // Customer
  if (/customer list|all customers|list customers/.test(msg)) return `Customer List`;
  if (/customer|client|owner/.test(msg)) return `Customer Profile${tail}`;

  // Overdue invoices
  if (/overdue|unpaid/.test(msg)) return `Overdue Invoices`;

  // Settings
  if (/setting|my profile|labor rate/.test(msg)) return `Settings`;

  // AD
  if (/\bad\b|airworthiness directive/i.test(firstUserMessage)) return `AD Compliance${tail}`;

  // Inspection
  if (/inspection|checklist/.test(msg)) return `Inspection Checklist${tail}`;

  // Default: first meaningful words
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  return cleaned.length > 46 ? cleaned.slice(0, 43) + "…" : cleaned;
}

/* ---- Create initial thread ---- */
export function createThread(scope: ChatThread["scope"] = "aircraft", aircraft?: string): ChatThread {
  return {
    id: `thread-${Date.now()}`,
    title: scope === "aircraft" && aircraft ? `${aircraft} — New Thread` : "New Thread",
    aircraft,
    pinned: false,
    archived: false,
    scope,
    messages: [
      {
        id: "system-welcome",
        role: "system",
        content: aircraft
          ? `Aircraft context loaded: ${aircraft}. All queries scoped to this aircraft.`
          : "No aircraft selected. Select an aircraft to begin.",
        timestamp: new Date(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}