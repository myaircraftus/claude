"use client";

import { useState } from "react";
import {
  Wrench, Send, Sparkles, FileText, Download, Share2, Printer,
  Mail, PenTool, CheckCircle, ChevronDown, Plane, AlertCircle, BookOpen,
  ClipboardList, Package, GitBranch, Plus, Search, Filter, MoreHorizontal,
  Trash2, Edit3, Eye, Clock, DollarSign, AlertTriangle, ArrowRight,
  Phone, ExternalLink, ShoppingCart, Truck, Tag, Hash, X, Check,
  ChevronRight, Copy, RefreshCw, User, Building2, Calendar, Archive,
  CircleDot, ArrowUpRight, GripVertical, MapPin
} from "lucide-react";

/* ================================================================== */
/*  SHARED DATA                                                        */
/* ================================================================== */

const AIRCRAFT_OPTIONS = [
  { tail: "N12345", model: "Cessna 172S", serial: "172S-10847" },
  { tail: "N67890", model: "Piper PA-28-181", serial: "2843517" },
  { tail: "N24680", model: "Beechcraft A36", serial: "E-3214" },
];

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600",
  Open: "bg-blue-50 text-blue-700",
  "In Progress": "bg-indigo-50 text-indigo-700",
  "Awaiting Parts": "bg-amber-50 text-amber-700",
  "Awaiting Approval": "bg-purple-50 text-purple-700",
  "Waiting on Customer": "bg-orange-50 text-orange-700",
  "Ready for Signoff": "bg-cyan-50 text-cyan-700",
  Closed: "bg-slate-100 text-slate-600",
  Invoiced: "bg-emerald-50 text-emerald-700",
  Paid: "bg-green-50 text-green-700",
  Archived: "bg-gray-100 text-gray-500",
};

type MainTab = "entries" | "work-orders" | "parts" | "workflow";

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export function MaintenanceEntry() {
  const [activeTab, setActiveTab] = useState<MainTab>("work-orders");

  const tabs: { id: MainTab; label: string; icon: typeof Wrench; count?: number }[] = [
    { id: "entries", label: "Entry Generator", icon: FileText },
    { id: "work-orders", label: "Work Orders", icon: ClipboardList, count: 7 },
    { id: "parts", label: "Parts & Ordering", icon: Package, count: 3 },
    { id: "workflow", label: "Workflow", icon: GitBranch },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tab header */}
      <div className="bg-white border-b border-border px-6 pt-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Maintenance</h1>
          </div>
        </div>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] rounded-t-lg transition-colors border-b-2 -mb-[1px] ${
                activeTab === t.id
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
              style={{ fontWeight: activeTab === t.id ? 600 : 400 }}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`} style={{ fontWeight: 600 }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "entries" && <EntryGeneratorTab />}
        {activeTab === "work-orders" && <WorkOrdersTab />}
        {activeTab === "parts" && <PartsOrderingTab />}
        {activeTab === "workflow" && <WorkflowTab />}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  TAB 1: ENTRY GENERATOR (existing functionality)                    */
/* ================================================================== */

function EntryGeneratorTab() {
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "I've drafted a maintenance entry based on the work described. Review the entry on the right and let me know if any changes are needed." },
  ]);

  const sampleEntry = {
    date: "04/02/2026",
    aircraft: "N12345",
    makeModel: "Cessna 172S",
    serial: "172S8001",
    hobbs: "3847.2",
    tach: "4102.8",
    discrepancy: "Pilot reported slight oil seepage around #3 cylinder base.",
    correctiveAction: "Removed and inspected #3 cylinder. Found worn O-ring on cylinder base. Replaced O-ring (P/N 632408). Torqued cylinder per Lycoming SI 1029. Performed engine run-up, no leaks observed. Oil quantity verified at 7 quarts.",
    partsUsed: "O-Ring P/N 632408 (Qty: 1), Safety Wire MS20995C32",
    references: "Lycoming SI 1029AD, Cessna MM Chapter 72-00",
    mechanic: "Mike Davis",
    certificate: "1234567",
    returnToService: "I certify that this aircraft has been inspected in accordance with applicable regulations and is approved for return to service.",
  };

  const handleSend = () => {
    if (!chatInput.trim()) return;
    setMessages([...messages, { role: "user", content: chatInput }]);
    setChatInput("");
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: "I've updated the entry with your changes. The corrective action now includes the updated torque values." }]);
    }, 500);
  };

  return (
    <div className="h-full flex">
      {/* Chat side */}
      <div className="w-[400px] flex flex-col border-r border-border bg-white shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>AI Entry Generator</h2>
          </div>
          <button className="w-full flex items-center justify-between bg-muted/30 border border-border rounded-lg px-3 py-2 text-[13px]" style={{ fontWeight: 500 }}>
            <span className="flex items-center gap-2"><Plane className="w-4 h-4 text-primary" /> N12345 · Cessna 172S</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "flex justify-end" : ""}>
              <div className={`max-w-[300px] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                msg.role === "user" ? "bg-primary text-white rounded-br-md" : "bg-muted/40 text-foreground rounded-bl-md"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center bg-muted/30 border border-border rounded-xl px-3 py-2.5">
              <input
                type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Describe the work or request changes..."
                className="bg-transparent text-[13px] outline-none flex-1"
              />
            </div>
            <button onClick={handleSend} className="bg-primary text-white px-3 rounded-xl hover:bg-primary/90 transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {["Oil change", "Annual inspection", "AD compliance", "Repair"].map((s) => (
              <button key={s} className="text-[11px] bg-muted/50 hover:bg-muted text-foreground px-2.5 py-1 rounded-full transition-colors" style={{ fontWeight: 500 }}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Entry preview */}
      <div className="flex-1 overflow-auto bg-[#f8f9fb] p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Maintenance Entry Draft</h2>
              <span className="text-[11px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Draft</span>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-border shadow-sm">
            <div className="p-5 border-b border-border">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 600 }}>Aircraft Maintenance Record</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px]">
                {[["Date", sampleEntry.date], ["Aircraft", `${sampleEntry.aircraft} / ${sampleEntry.makeModel}`], ["Serial", sampleEntry.serial], ["Hobbs / Tach", `${sampleEntry.hobbs} / ${sampleEntry.tach}`]].map(([k, v]) => (
                  <div key={k}><div className="text-muted-foreground mb-0.5">{k}</div><div className="text-foreground" style={{ fontWeight: 500 }}>{v}</div></div>
                ))}
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1" style={{ fontWeight: 600 }}>Discrepancy</div>
                <div className="text-[13px] text-foreground leading-relaxed bg-muted/20 rounded-lg p-3">{sampleEntry.discrepancy}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1" style={{ fontWeight: 600 }}>Corrective Action</div>
                <div className="text-[13px] text-foreground leading-relaxed bg-muted/20 rounded-lg p-3">{sampleEntry.correctiveAction}</div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1" style={{ fontWeight: 600 }}>Parts Used</div>
                  <div className="text-[13px] text-foreground bg-muted/20 rounded-lg p-3">{sampleEntry.partsUsed}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1" style={{ fontWeight: 600 }}>References</div>
                  <div className="text-[13px] text-foreground bg-muted/20 rounded-lg p-3">{sampleEntry.references}</div>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border bg-muted/10">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-3" style={{ fontWeight: 600 }}>Return to Service</div>
              <div className="text-[12px] text-foreground leading-relaxed italic mb-4">{sampleEntry.returnToService}</div>
              <div className="grid md:grid-cols-3 gap-4">
                <div><div className="text-[11px] text-muted-foreground mb-0.5">Mechanic</div><div className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>{sampleEntry.mechanic}</div></div>
                <div><div className="text-[11px] text-muted-foreground mb-0.5">Certificate #</div><div className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>{sampleEntry.certificate}</div></div>
                <div><div className="text-[11px] text-muted-foreground mb-0.5">Signature</div><div className="border-b-2 border-dashed border-muted-foreground/30 h-8 flex items-end"><PenTool className="w-4 h-4 text-muted-foreground/40 mb-1" /></div></div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { icon: CheckCircle, label: "Save to Logbook", primary: true },
              { icon: Download, label: "Download PDF" },
              { icon: Share2, label: "Share Link" },
              { icon: Mail, label: "Email" },
              { icon: Printer, label: "Print" },
              { icon: PenTool, label: "E-Sign" },
            ].map((a) => (
              <button key={a.label} className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] transition-colors ${a.primary ? "bg-primary text-white hover:bg-primary/90" : "bg-white border border-border text-foreground hover:bg-muted/30"}`} style={{ fontWeight: 500 }}>
                <a.icon className="w-4 h-4" /> {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  TAB 2: WORK ORDERS — Manual CRUD                                   */
/* ================================================================== */

interface WorkOrder {
  id: string;
  woNumber: string;
  aircraft: string;
  model: string;
  customer: string;
  mechanic: string;
  status: string;
  squawk: string;
  opened: string;
  laborHours: number;
  laborRate: number;
  partsTotal: number;
  outsideTotal: number;
  discrepancy: string;
  correctiveAction: string;
  internalNotes: string;
  customerNotes: string;
}

const MOCK_WORK_ORDERS: WorkOrder[] = [
  { id: "1", woNumber: "WO-2026-0047", aircraft: "N67890", model: "Piper PA-28-181", customer: "Horizon Flights Inc.", mechanic: "Mike Davis", status: "In Progress", squawk: "Left brake dragging during taxi", opened: "2026-03-28", laborHours: 3.5, laborRate: 125, partsTotal: 287.40, outsideTotal: 0, discrepancy: "Left brake caliper piston seized. Brake pads worn beyond service limit.", correctiveAction: "Replaced left brake caliper assembly, installed new brake pads. Bled brake system.", internalNotes: "Customer aware of cost estimate", customerNotes: "Brake issue found during pre-flight" },
  { id: "2", woNumber: "WO-2026-0046", aircraft: "N12345", model: "Cessna 172S", customer: "Mitchell Aviation LLC", mechanic: "John Mitchell", status: "Awaiting Parts", squawk: "Nav light intermittent on left wing", opened: "2026-03-25", laborHours: 1.0, laborRate: 125, partsTotal: 0, outsideTotal: 0, discrepancy: "Corroded ground wire at nav light housing. Lens cracked.", correctiveAction: "Pending parts — replacement nav light assembly on order.", internalNotes: "Part on backorder, ETA 5 days", customerNotes: "" },
  { id: "3", woNumber: "WO-2026-0045", aircraft: "N24680", model: "Beechcraft A36", customer: "Steve Williams", mechanic: "Mike Davis", status: "Ready for Signoff", squawk: "Annual inspection due", opened: "2026-03-20", laborHours: 18.0, laborRate: 125, partsTotal: 642.30, outsideTotal: 350.00, discrepancy: "Multiple items found during annual — see attached checklist", correctiveAction: "All discrepancies corrected. Aircraft meets airworthiness standards.", internalNotes: "Outstanding annual, clean aircraft", customerNotes: "Annual complete — ready for pickup" },
  { id: "4", woNumber: "WO-2026-0044", aircraft: "N12345", model: "Cessna 172S", customer: "Mitchell Aviation LLC", mechanic: "John Mitchell", status: "Closed", squawk: "Oil change & filter inspection", opened: "2026-03-15", laborHours: 1.5, laborRate: 125, partsTotal: 127.40, outsideTotal: 0, discrepancy: "Routine 50hr oil service", correctiveAction: "Drained oil, replaced filter CH48110-1, refilled 8qts AeroShell W100. Screen clean.", internalNotes: "", customerNotes: "Routine service complete" },
  { id: "5", woNumber: "WO-2026-0043", aircraft: "N67890", model: "Piper PA-28-181", customer: "Horizon Flights Inc.", mechanic: "Mike Davis", status: "Invoiced", squawk: "100-hour inspection", opened: "2026-03-10", laborHours: 14.0, laborRate: 125, partsTotal: 423.80, outsideTotal: 175.00, discrepancy: "100-hour inspection per Part 91.409(b)", correctiveAction: "Inspection complete — all items satisfactory. Minor items corrected.", internalNotes: "Invoice sent to Horizon Flights", customerNotes: "100-hour complete" },
  { id: "6", woNumber: "WO-2026-0042", aircraft: "N12345", model: "Cessna 172S", customer: "Mitchell Aviation LLC", mechanic: "John Mitchell", status: "Draft", squawk: "", opened: "2026-04-01", laborHours: 0, laborRate: 125, partsTotal: 0, outsideTotal: 0, discrepancy: "", correctiveAction: "", internalNotes: "", customerNotes: "" },
  { id: "7", woNumber: "WO-2026-0041", aircraft: "N24680", model: "Beechcraft A36", customer: "Steve Williams", mechanic: "Mike Davis", status: "Waiting on Customer", squawk: "Avionics upgrade — GTN 650Xi install", opened: "2026-03-05", laborHours: 2.0, laborRate: 125, partsTotal: 0, outsideTotal: 0, discrepancy: "Customer requested GTN 650Xi upgrade. Awaiting customer approval on $18,500 estimate.", correctiveAction: "", internalNotes: "Estimate sent 3/6, follow up needed", customerNotes: "Estimate pending your review" },
];

function WorkOrdersTab() {
  const [orders, setOrders] = useState<WorkOrder[]>(MOCK_WORK_ORDERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const selected = orders.find((o) => o.id === selectedId);

  const filtered = orders.filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return o.woNumber.toLowerCase().includes(q) || o.aircraft.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.squawk.toLowerCase().includes(q);
    }
    return true;
  });

  const allStatuses = [...new Set(orders.map((o) => o.status))];

  return (
    <div className="h-full flex">
      {/* List */}
      <div className={`${selectedId ? "w-[420px]" : "flex-1 max-w-5xl mx-auto"} flex flex-col border-r border-border bg-white shrink-0`}>
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>Work Orders</h2>
            <button
              onClick={() => { setShowCreate(true); setSelectedId(null); }}
              className="flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-primary/90 transition-colors"
              style={{ fontWeight: 500 }}
            >
              <Plus className="w-3.5 h-3.5" /> New Work Order
            </button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search work orders..."
                className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/50"
              />
            </div>
            <select
              value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="text-[12px] border border-border rounded-lg px-2.5 py-1.5 bg-white"
            >
              <option value="all">All Status</option>
              {allStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filtered.map((wo) => (
            <button
              key={wo.id}
              onClick={() => { setSelectedId(wo.id); setShowCreate(false); }}
              className={`w-full text-left p-4 border-b border-border hover:bg-muted/20 transition-colors ${
                selectedId === wo.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{wo.woNumber}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[wo.status] || "bg-muted"}`} style={{ fontWeight: 600 }}>{wo.status}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{wo.opened}</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <Plane className="w-3 h-3 text-muted-foreground" />
                <span className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{wo.aircraft}</span>
                <span className="text-[11px] text-muted-foreground">{wo.model}</span>
              </div>
              {wo.squawk && <div className="text-[12px] text-muted-foreground mt-1 line-clamp-1">{wo.squawk}</div>}
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                <span><User className="w-3 h-3 inline mr-1" />{wo.mechanic}</span>
                <span><Building2 className="w-3 h-3 inline mr-1" />{wo.customer}</span>
                {wo.laborHours > 0 && <span><Clock className="w-3 h-3 inline mr-1" />{wo.laborHours}h</span>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-[13px] text-muted-foreground">No work orders found.</div>
          )}
        </div>
      </div>

      {/* Detail / Create */}
      {(selectedId && selected) ? (
        <WorkOrderDetail
          wo={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={(updated) => setOrders(orders.map((o) => o.id === updated.id ? updated : o))}
        />
      ) : showCreate ? (
        <WorkOrderCreateForm
          onClose={() => setShowCreate(false)}
          onCreate={(wo) => { setOrders([wo, ...orders]); setShowCreate(false); setSelectedId(wo.id); }}
        />
      ) : !selectedId && (
        <div className="hidden" /> /* list takes full width when nothing selected */
      )}
    </div>
  );
}

/* ---- Work Order Detail ---- */
function WorkOrderDetail({ wo, onClose, onUpdate }: { wo: WorkOrder; onClose: () => void; onUpdate: (wo: WorkOrder) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(wo);
  const [laborLines, setLaborLines] = useState([
    { desc: "Labor — inspection & repair", hours: wo.laborHours, rate: wo.laborRate },
  ]);
  const [partsLines, setPartsLines] = useState<{ pn: string; desc: string; qty: number; price: number }[]>(
    wo.partsTotal > 0 ? [{ pn: "MISC", desc: "Parts (see details)", qty: 1, price: wo.partsTotal }] : []
  );

  const totalLabor = laborLines.reduce((s, l) => s + l.hours * l.rate, 0);
  const totalParts = partsLines.reduce((s, p) => s + p.qty * p.price, 0);
  const grandTotal = totalLabor + totalParts + wo.outsideTotal;

  const save = () => {
    onUpdate({ ...form, laborHours: laborLines.reduce((s, l) => s + l.hours, 0), partsTotal: totalParts });
    setEditing(false);
  };

  return (
    <div className="flex-1 overflow-auto bg-[#f8f9fb]">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-[20px] text-foreground" style={{ fontWeight: 700 }}>{wo.woNumber}</h2>
              <span className={`text-[11px] px-2.5 py-1 rounded-full ${STATUS_COLORS[wo.status] || "bg-muted"}`} style={{ fontWeight: 600 }}>{wo.status}</span>
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5">{wo.aircraft} · {wo.model} · {wo.customer}</div>
          </div>
          <div className="flex gap-2">
            {!editing ? (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-[12px] hover:bg-muted" style={{ fontWeight: 500 }}>
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
            ) : (
              <>
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg border border-border text-[12px] hover:bg-muted" style={{ fontWeight: 500 }}>Cancel</button>
                <button onClick={save} className="flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-primary/90" style={{ fontWeight: 500 }}>
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status changer */}
        <div className="bg-white rounded-xl border border-border p-4 mb-4">
          <label className="text-[11px] text-muted-foreground mb-2 block" style={{ fontWeight: 600 }}>STATUS</label>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(STATUS_COLORS).map((s) => (
              <button
                key={s}
                onClick={() => { setForm({ ...form, status: s }); onUpdate({ ...wo, status: s }); }}
                className={`text-[11px] px-3 py-1.5 rounded-full border transition-all ${
                  form.status === s ? "border-primary bg-primary text-white shadow-sm" : `border-border hover:bg-muted/50 ${STATUS_COLORS[s]}`
                }`}
                style={{ fontWeight: 500 }}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Info grid */}
        <div className="bg-white rounded-xl border border-border p-5 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px]">
            {[
              ["Aircraft", `${wo.aircraft} / ${wo.model}`],
              ["Customer", wo.customer],
              ["Mechanic", wo.mechanic],
              ["Opened", wo.opened],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-muted-foreground mb-0.5" style={{ fontWeight: 600 }}>{k}</div>
                <div className="text-foreground" style={{ fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Squawk & work description */}
        <div className="bg-white rounded-xl border border-border p-5 mb-4 space-y-4">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>SQUAWK / CUSTOMER COMPLAINT</label>
            {editing ? (
              <textarea value={form.squawk} onChange={(e) => setForm({ ...form, squawk: e.target.value })} className="w-full p-3 text-[13px] border border-border rounded-lg resize-none h-[60px] focus:ring-2 focus:ring-primary/20 outline-none" />
            ) : (
              <div className="text-[13px] text-foreground bg-muted/20 rounded-lg p-3">{wo.squawk || <span className="text-muted-foreground italic">None entered</span>}</div>
            )}
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>DISCREPANCY / FINDINGS</label>
            {editing ? (
              <textarea value={form.discrepancy} onChange={(e) => setForm({ ...form, discrepancy: e.target.value })} className="w-full p-3 text-[13px] border border-border rounded-lg resize-none h-[80px] focus:ring-2 focus:ring-primary/20 outline-none" />
            ) : (
              <div className="text-[13px] text-foreground bg-muted/20 rounded-lg p-3">{wo.discrepancy || <span className="text-muted-foreground italic">None</span>}</div>
            )}
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>CORRECTIVE ACTION</label>
            {editing ? (
              <textarea value={form.correctiveAction} onChange={(e) => setForm({ ...form, correctiveAction: e.target.value })} className="w-full p-3 text-[13px] border border-border rounded-lg resize-none h-[80px] focus:ring-2 focus:ring-primary/20 outline-none" />
            ) : (
              <div className="text-[13px] text-foreground bg-muted/20 rounded-lg p-3">{wo.correctiveAction || <span className="text-muted-foreground italic">None</span>}</div>
            )}
          </div>
        </div>

        {/* Labor lines */}
        <div className="bg-white rounded-xl border border-border p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>LABOR</label>
            {editing && (
              <button onClick={() => setLaborLines([...laborLines, { desc: "", hours: 0, rate: 125 }])} className="text-[11px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
                <Plus className="w-3 h-3" /> Add Line
              </button>
            )}
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_80px_80px_80px_28px] gap-2 px-3 py-2 bg-muted/50 text-[10px] text-muted-foreground" style={{ fontWeight: 600 }}>
              <span>Description</span><span className="text-right">Hours</span><span className="text-right">Rate</span><span className="text-right">Amount</span><span />
            </div>
            {laborLines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_80px_80px_28px] gap-2 px-3 py-2.5 border-t border-border items-center text-[12px]">
                {editing ? (
                  <>
                    <input value={l.desc} onChange={(e) => { const n = [...laborLines]; n[i].desc = e.target.value; setLaborLines(n); }} className="bg-transparent outline-none border-b border-dashed border-border focus:border-primary" />
                    <input type="number" step="0.5" value={l.hours} onChange={(e) => { const n = [...laborLines]; n[i].hours = +e.target.value; setLaborLines(n); }} className="bg-transparent outline-none text-right border-b border-dashed border-border focus:border-primary w-full" />
                    <input type="number" value={l.rate} onChange={(e) => { const n = [...laborLines]; n[i].rate = +e.target.value; setLaborLines(n); }} className="bg-transparent outline-none text-right border-b border-dashed border-border focus:border-primary w-full" />
                  </>
                ) : (
                  <>
                    <span>{l.desc}</span>
                    <span className="text-right">{l.hours}</span>
                    <span className="text-right">${l.rate}</span>
                  </>
                )}
                <span className="text-right" style={{ fontWeight: 500 }}>${(l.hours * l.rate).toFixed(2)}</span>
                {editing ? (
                  <button onClick={() => setLaborLines(laborLines.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                ) : <span />}
              </div>
            ))}
          </div>
        </div>

        {/* Parts lines */}
        <div className="bg-white rounded-xl border border-border p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>PARTS</label>
            {editing && (
              <button onClick={() => setPartsLines([...partsLines, { pn: "", desc: "", qty: 1, price: 0 }])} className="text-[11px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
                <Plus className="w-3 h-3" /> Add Part
              </button>
            )}
          </div>
          {partsLines.length === 0 ? (
            <div className="text-[12px] text-muted-foreground italic py-3 text-center">No parts recorded</div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[100px_1fr_60px_80px_80px_28px] gap-2 px-3 py-2 bg-muted/50 text-[10px] text-muted-foreground" style={{ fontWeight: 600 }}>
                <span>P/N</span><span>Description</span><span className="text-right">Qty</span><span className="text-right">Price</span><span className="text-right">Amount</span><span />
              </div>
              {partsLines.map((p, i) => (
                <div key={i} className="grid grid-cols-[100px_1fr_60px_80px_80px_28px] gap-2 px-3 py-2.5 border-t border-border items-center text-[12px]">
                  {editing ? (
                    <>
                      <input value={p.pn} onChange={(e) => { const n = [...partsLines]; n[i].pn = e.target.value; setPartsLines(n); }} className="bg-transparent outline-none border-b border-dashed border-border" placeholder="P/N" />
                      <input value={p.desc} onChange={(e) => { const n = [...partsLines]; n[i].desc = e.target.value; setPartsLines(n); }} className="bg-transparent outline-none border-b border-dashed border-border" placeholder="Description" />
                      <input type="number" value={p.qty} onChange={(e) => { const n = [...partsLines]; n[i].qty = +e.target.value; setPartsLines(n); }} className="bg-transparent outline-none text-right border-b border-dashed border-border w-full" />
                      <input type="number" value={p.price} onChange={(e) => { const n = [...partsLines]; n[i].price = +e.target.value; setPartsLines(n); }} className="bg-transparent outline-none text-right border-b border-dashed border-border w-full" />
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 500 }}>{p.pn}</span><span>{p.desc}</span><span className="text-right">{p.qty}</span><span className="text-right">${p.price.toFixed(2)}</span>
                    </>
                  )}
                  <span className="text-right" style={{ fontWeight: 500 }}>${(p.qty * p.price).toFixed(2)}</span>
                  {editing ? <button onClick={() => setPartsLines(partsLines.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button> : <span />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="bg-white rounded-xl border border-border p-5 mb-4">
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span className="text-muted-foreground">Labor ({laborLines.reduce((s, l) => s + l.hours, 0)} hrs):</span><span style={{ fontWeight: 500 }}>${totalLabor.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Parts:</span><span style={{ fontWeight: 500 }}>${totalParts.toFixed(2)}</span></div>
            {wo.outsideTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Outside Services:</span><span style={{ fontWeight: 500 }}>${wo.outsideTotal.toFixed(2)}</span></div>}
            <div className="flex justify-between border-t border-border pt-2 mt-2">
              <span style={{ fontWeight: 700 }}>Total:</span>
              <span className="text-[18px]" style={{ fontWeight: 700 }}>${grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-border p-5 mb-4 grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>INTERNAL NOTES</label>
            {editing ? (
              <textarea value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} className="w-full p-2.5 text-[12px] border border-border rounded-lg h-[60px] resize-none outline-none focus:ring-2 focus:ring-primary/20" />
            ) : (
              <div className="text-[12px] text-foreground bg-muted/20 rounded-lg p-2.5 min-h-[40px]">{wo.internalNotes || <span className="text-muted-foreground italic">None</span>}</div>
            )}
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>CUSTOMER NOTES</label>
            {editing ? (
              <textarea value={form.customerNotes} onChange={(e) => setForm({ ...form, customerNotes: e.target.value })} className="w-full p-2.5 text-[12px] border border-border rounded-lg h-[60px] resize-none outline-none focus:ring-2 focus:ring-primary/20" />
            ) : (
              <div className="text-[12px] text-foreground bg-muted/20 rounded-lg p-2.5 min-h-[40px]">{wo.customerNotes || <span className="text-muted-foreground italic">None</span>}</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[13px] hover:bg-primary/90" style={{ fontWeight: 500 }}>
            <FileText className="w-4 h-4" /> Generate Logbook Entry
          </button>
          <button className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[13px] hover:bg-muted" style={{ fontWeight: 500 }}>
            <DollarSign className="w-4 h-4" /> Generate Invoice
          </button>
          <button className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[13px] hover:bg-muted" style={{ fontWeight: 500 }}>
            <Download className="w-4 h-4" /> Export PDF
          </button>
          <button className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[13px] hover:bg-muted" style={{ fontWeight: 500 }}>
            <Mail className="w-4 h-4" /> Email Customer
          </button>
          <button className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[13px] hover:bg-muted" style={{ fontWeight: 500 }}>
            <Share2 className="w-4 h-4" /> Share Link
          </button>
          <button className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[13px] hover:bg-muted" style={{ fontWeight: 500 }}>
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Create Work Order Form ---- */
function WorkOrderCreateForm({ onClose, onCreate }: { onClose: () => void; onCreate: (wo: WorkOrder) => void }) {
  const [form, setForm] = useState({
    aircraft: "N12345",
    mechanic: "John Mitchell",
    squawk: "",
    internalNotes: "",
    customerNotes: "",
  });

  const handleCreate = () => {
    const acInfo = AIRCRAFT_OPTIONS.find((a) => a.tail === form.aircraft);
    const customers: Record<string, string> = { N12345: "Mitchell Aviation LLC", N67890: "Horizon Flights Inc.", N24680: "Steve Williams" };
    const newWo: WorkOrder = {
      id: `new-${Date.now()}`,
      woNumber: `WO-2026-${String(Math.floor(1050 + Math.random() * 100)).padStart(4, "0")}`,
      aircraft: form.aircraft,
      model: acInfo?.model || "",
      customer: customers[form.aircraft] || "",
      mechanic: form.mechanic,
      status: "Open",
      squawk: form.squawk,
      opened: new Date().toISOString().split("T")[0],
      laborHours: 0,
      laborRate: 125,
      partsTotal: 0,
      outsideTotal: 0,
      discrepancy: "",
      correctiveAction: "",
      internalNotes: form.internalNotes,
      customerNotes: form.customerNotes,
    };
    onCreate(newWo);
  };

  return (
    <div className="flex-1 overflow-auto bg-[#f8f9fb] p-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>New Work Order</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div className="bg-white rounded-xl border border-border p-5 space-y-4">
          <div>
            <label className="text-[12px] text-muted-foreground mb-1.5 block" style={{ fontWeight: 600 }}>Aircraft</label>
            <select value={form.aircraft} onChange={(e) => setForm({ ...form, aircraft: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2.5 text-[13px] bg-white">
              {AIRCRAFT_OPTIONS.map((a) => <option key={a.tail} value={a.tail}>{a.tail} — {a.model}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground mb-1.5 block" style={{ fontWeight: 600 }}>Assigned Mechanic</label>
            <select value={form.mechanic} onChange={(e) => setForm({ ...form, mechanic: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2.5 text-[13px] bg-white">
              <option>John Mitchell</option>
              <option>Mike Davis</option>
            </select>
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground mb-1.5 block" style={{ fontWeight: 600 }}>Squawk / Customer Complaint</label>
            <textarea value={form.squawk} onChange={(e) => setForm({ ...form, squawk: e.target.value })} placeholder="Describe the reported issue or requested service..." className="w-full border border-border rounded-lg px-3 py-2.5 text-[13px] resize-none h-[80px] outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div>
            <label className="text-[12px] text-muted-foreground mb-1.5 block" style={{ fontWeight: 600 }}>Internal Notes</label>
            <textarea value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} placeholder="Any internal notes..." className="w-full border border-border rounded-lg px-3 py-2.5 text-[13px] resize-none h-[60px] outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-[13px] hover:bg-muted" style={{ fontWeight: 500 }}>Cancel</button>
            <button onClick={handleCreate} className="flex-1 py-2.5 bg-primary text-white rounded-lg text-[13px] hover:bg-primary/90" style={{ fontWeight: 600 }}>Create Work Order</button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ================================================================== */
/*  TAB 3: PARTS & ORDERING                                            */
/* ================================================================== */

interface PartOrder {
  id: string;
  pn: string;
  description: string;
  aircraft: string;
  vendor: string;
  condition: string;
  qty: number;
  unitPrice: number;
  status: "Needed" | "Quoted" | "Ordered" | "Shipped" | "Received" | "Installed" | "Backordered";
  orderDate?: string;
  eta?: string;
  tracking?: string;
  woNumber?: string;
  notes: string;
}

const MOCK_PART_ORDERS: PartOrder[] = [
  { id: "p1", pn: "A1772-3", description: "Nav Light Assembly — Left Wing", aircraft: "N12345", vendor: "Aircraft Spruce", condition: "New", qty: 1, unitPrice: 142.50, status: "Ordered", orderDate: "2026-03-26", eta: "2026-04-05", tracking: "1Z999AA10123456784", woNumber: "WO-2026-0046", notes: "Backorder cleared, now shipped" },
  { id: "p2", pn: "066-01400", description: "Cleveland Brake Caliper Assy — Left", aircraft: "N67890", vendor: "Preferred Airparts", condition: "New", qty: 1, unitPrice: 215.00, status: "Received", orderDate: "2026-03-27", woNumber: "WO-2026-0047", notes: "Inspected and ready for install" },
  { id: "p3", pn: "LW-16702", description: "Brake Lining Kit — Cleveland", aircraft: "N67890", vendor: "Aircraft Spruce", condition: "New", qty: 1, unitPrice: 72.40, status: "Installed", orderDate: "2026-03-27", woNumber: "WO-2026-0047", notes: "Installed on WO-0047" },
  { id: "p4", pn: "GTN-650XI", description: "Garmin GTN 650Xi Nav/Comm/GPS", aircraft: "N24680", vendor: "Garmin (direct)", condition: "New", qty: 1, unitPrice: 14950.00, status: "Quoted", notes: "Awaiting customer approval" },
  { id: "p5", pn: "CH48110-1", description: "Oil Filter — Champion", aircraft: "N12345", vendor: "Aircraft Spruce", condition: "New", qty: 2, unitPrice: 42.50, status: "Needed", notes: "Stock replenishment" },
  { id: "p6", pn: "MS20995C32", description: "Safety Wire — .032 Stainless", aircraft: "", vendor: "Aircraft Spruce", condition: "New", qty: 3, unitPrice: 12.80, status: "Needed", notes: "Shop consumable" },
];

const VENDOR_DB = [
  { name: "Aircraft Spruce", phone: "(877) 477-7823", url: "aircraftspruce.com", type: "Distributor" },
  { name: "Preferred Airparts", phone: "(800) 433-0814", url: "preferredairparts.com", type: "Salvage / PMA" },
  { name: "Southeast Components", phone: "(305) 871-4050", url: "secomp.com", type: "Overhaul" },
  { name: "Garmin (direct)", phone: "(866) 739-5687", url: "garmin.com/aviation", type: "OEM" },
  { name: "SkyGeek", phone: "(866) 475-9335", url: "skygeek.com", type: "Distributor" },
  { name: "Wentworth Aircraft", phone: "(800) 493-6896", url: "wentworthaircraft.com", type: "Salvage" },
];

const PART_STATUS_COLORS: Record<string, string> = {
  Needed: "bg-red-50 text-red-700",
  Quoted: "bg-purple-50 text-purple-700",
  Ordered: "bg-blue-50 text-blue-700",
  Shipped: "bg-cyan-50 text-cyan-700",
  Received: "bg-emerald-50 text-emerald-700",
  Installed: "bg-green-50 text-green-700",
  Backordered: "bg-amber-50 text-amber-700",
};

function PartsOrderingTab() {
  const [parts, setParts] = useState<PartOrder[]>(MOCK_PART_ORDERS);
  const [view, setView] = useState<"orders" | "catalog" | "vendors">("orders");
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");

  const filtered = parts.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return p.pn.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.aircraft.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q);
    }
    return true;
  });

  const selected = parts.find((p) => p.id === selectedPart);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Sub-tabs */}
      <div className="flex items-center gap-4 mb-5">
        {([
          { id: "orders" as const, label: "Part Orders", icon: ShoppingCart, count: parts.filter((p) => !["Installed"].includes(p.status)).length },
          { id: "catalog" as const, label: "Parts Catalog", icon: Search },
          { id: "vendors" as const, label: "Vendors", icon: Building2 },
        ]).map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] transition-colors ${
              view === v.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
            }`}
            style={{ fontWeight: view === v.id ? 600 : 400 }}
          >
            <v.icon className="w-4 h-4" />
            {v.label}
            {v.count !== undefined && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>{v.count}</span>}
          </button>
        ))}
      </div>

      {/* ORDERS VIEW */}
      {view === "orders" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2 flex-1 max-w-lg">
              <div className="flex-1 flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search parts..." className="bg-transparent text-[12px] outline-none flex-1" />
              </div>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-[12px] border border-border rounded-lg px-2.5 bg-white">
                <option value="all">All Status</option>
                {Object.keys(PART_STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-lg text-[12px] hover:bg-primary/90" style={{ fontWeight: 500 }}>
              <Plus className="w-3.5 h-3.5" /> Add Part Order
            </button>
          </div>

          {/* Parts table */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-[100px_1fr_100px_100px_80px_80px_100px_40px] gap-3 px-4 py-2.5 bg-muted/50 text-[10px] text-muted-foreground" style={{ fontWeight: 700 }}>
              <span>P/N</span><span>Description</span><span>Aircraft</span><span>Vendor</span><span className="text-right">Qty</span><span className="text-right">Price</span><span>Status</span><span />
            </div>
            {filtered.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedPart(p.id)}
                className={`grid grid-cols-[100px_1fr_100px_100px_80px_80px_100px_40px] gap-3 px-4 py-3 border-t border-border items-center text-[12px] cursor-pointer hover:bg-muted/20 transition-colors ${
                  selectedPart === p.id ? "bg-primary/5" : ""
                }`}
              >
                <span style={{ fontWeight: 600 }} className="text-foreground">{p.pn}</span>
                <span className="text-foreground truncate">{p.description}</span>
                <span className="text-muted-foreground">{p.aircraft || "—"}</span>
                <span className="text-muted-foreground truncate">{p.vendor}</span>
                <span className="text-right">{p.qty}</span>
                <span className="text-right" style={{ fontWeight: 500 }}>${(p.qty * p.unitPrice).toFixed(2)}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full text-center ${PART_STATUS_COLORS[p.status]}`} style={{ fontWeight: 600 }}>{p.status}</span>
                <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            ))}
          </div>

          {/* Totals summary */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            {[
              { label: "Needed", count: parts.filter((p) => p.status === "Needed").length, color: "text-red-600", total: parts.filter((p) => p.status === "Needed").reduce((s, p) => s + p.qty * p.unitPrice, 0) },
              { label: "On Order", count: parts.filter((p) => ["Ordered", "Shipped", "Backordered"].includes(p.status)).length, color: "text-blue-600", total: parts.filter((p) => ["Ordered", "Shipped", "Backordered"].includes(p.status)).reduce((s, p) => s + p.qty * p.unitPrice, 0) },
              { label: "Received", count: parts.filter((p) => p.status === "Received").length, color: "text-emerald-600", total: parts.filter((p) => p.status === "Received").reduce((s, p) => s + p.qty * p.unitPrice, 0) },
              { label: "Total Value", count: parts.length, color: "text-foreground", total: parts.reduce((s, p) => s + p.qty * p.unitPrice, 0) },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-border p-4">
                <div className="text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>{s.label}</div>
                <div className={`text-[20px] ${s.color}`} style={{ fontWeight: 700 }}>${s.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                <div className="text-[11px] text-muted-foreground">{s.count} items</div>
              </div>
            ))}
          </div>

          {/* Selected part detail */}
          {selected && (
            <div className="mt-4 bg-white rounded-xl border border-border p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>{selected.pn}</div>
                  <div className="text-[13px] text-muted-foreground">{selected.description}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2.5 py-1 rounded-full ${PART_STATUS_COLORS[selected.status]}`} style={{ fontWeight: 600 }}>{selected.status}</span>
                  <button onClick={() => setSelectedPart(null)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px] mb-4">
                <div><span className="text-muted-foreground block mb-0.5">Aircraft</span><span style={{ fontWeight: 500 }}>{selected.aircraft || "Shop stock"}</span></div>
                <div><span className="text-muted-foreground block mb-0.5">Vendor</span><span style={{ fontWeight: 500 }}>{selected.vendor}</span></div>
                <div><span className="text-muted-foreground block mb-0.5">Condition</span><span style={{ fontWeight: 500 }}>{selected.condition}</span></div>
                <div><span className="text-muted-foreground block mb-0.5">Unit Price</span><span style={{ fontWeight: 500 }}>${selected.unitPrice.toFixed(2)}</span></div>
                {selected.orderDate && <div><span className="text-muted-foreground block mb-0.5">Order Date</span><span style={{ fontWeight: 500 }}>{selected.orderDate}</span></div>}
                {selected.eta && <div><span className="text-muted-foreground block mb-0.5">ETA</span><span style={{ fontWeight: 500 }}>{selected.eta}</span></div>}
                {selected.tracking && <div><span className="text-muted-foreground block mb-0.5">Tracking</span><span style={{ fontWeight: 500 }} className="text-primary">{selected.tracking}</span></div>}
                {selected.woNumber && <div><span className="text-muted-foreground block mb-0.5">Work Order</span><span style={{ fontWeight: 500 }} className="text-primary">{selected.woNumber}</span></div>}
              </div>
              {selected.notes && <div className="text-[12px] text-muted-foreground bg-muted/30 rounded-lg p-3">{selected.notes}</div>}

              {/* Status update buttons */}
              <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
                <label className="text-[11px] text-muted-foreground self-center mr-2" style={{ fontWeight: 600 }}>Update:</label>
                {Object.keys(PART_STATUS_COLORS).map((s) => (
                  <button
                    key={s}
                    onClick={() => setParts(parts.map((p) => p.id === selected.id ? { ...p, status: s as PartOrder["status"] } : p))}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                      selected.status === s ? "border-primary bg-primary text-white" : `border-border hover:bg-muted/50 ${PART_STATUS_COLORS[s]}`
                    }`}
                    style={{ fontWeight: 500 }}
                  >{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* Add part modal */}
          {showAdd && (
            <AddPartOrderModal
              onClose={() => setShowAdd(false)}
              onAdd={(p) => { setParts([p, ...parts]); setShowAdd(false); }}
            />
          )}
        </>
      )}

      {/* CATALOG VIEW */}
      {view === "catalog" && <PartsCatalogView searchQ={catalogSearch} setSearchQ={setCatalogSearch} />}

      {/* VENDORS VIEW */}
      {view === "vendors" && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {VENDOR_DB.map((v) => (
            <div key={v.name} className="bg-white rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{v.name}</div>
                  <span className="text-[11px] text-muted-foreground">{v.type}</span>
                </div>
                <Building2 className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="space-y-2 text-[12px]">
                <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground" /><span>{v.phone}</span></div>
                <div className="flex items-center gap-2"><ExternalLink className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-primary">{v.url}</span></div>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="flex-1 text-[11px] py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90" style={{ fontWeight: 500 }}>Search Parts</button>
                <button className="flex-1 text-[11px] py-1.5 rounded-lg border border-border hover:bg-muted" style={{ fontWeight: 500 }}>Contact</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Parts Catalog Search ---- */
const CATALOG_PARTS = [
  { pn: "CH48110-1", desc: "Oil Filter — Champion", category: "Engine", fit: ["Cessna 172", "Cessna 182", "Piper PA-28"], price: 42.50 },
  { pn: "632408", desc: "O-Ring — Cylinder Base", category: "Engine", fit: ["Lycoming IO-360", "Lycoming O-360"], price: 8.20 },
  { pn: "A1772-3", desc: "Nav Light Assembly — Whelen", category: "Electrical", fit: ["Cessna 172", "Cessna 182", "Cessna 206"], price: 142.50 },
  { pn: "066-01400", desc: "Brake Caliper Assembly — Cleveland", category: "Landing Gear", fit: ["Piper PA-28", "Piper PA-32", "Cessna 172"], price: 215.00 },
  { pn: "LW-16702", desc: "Brake Lining Kit — Cleveland", category: "Landing Gear", fit: ["Piper PA-28", "Cessna 172", "Beechcraft A36"], price: 72.40 },
  { pn: "MS20995C32", desc: "Safety Wire — .032 Stainless (1lb)", category: "Hardware", fit: ["Universal"], price: 12.80 },
  { pn: "REM38", desc: "Spark Plug — Champion (Massive)", category: "Engine", fit: ["Lycoming IO-360", "Lycoming O-360", "Lycoming IO-540"], price: 26.95 },
  { pn: "AE-132", desc: "Engine Oil — AeroShell W100 (case)", category: "Consumable", fit: ["Universal"], price: 84.90 },
  { pn: "PHC-C3YF-2UF", desc: "Propeller — Hartzell (Overhauled)", category: "Propeller", fit: ["Beechcraft A36", "Beechcraft B36TC"], price: 8500.00 },
  { pn: "ALX-9120", desc: "Alternator — Plane-Power", category: "Electrical", fit: ["Cessna 172", "Cessna 182", "Piper PA-28"], price: 485.00 },
  { pn: "GTN-650XI", desc: "Garmin GTN 650Xi Nav/Comm/GPS", category: "Avionics", fit: ["Universal (STC required)"], price: 14950.00 },
  { pn: "GI-275", desc: "Garmin GI 275 EIS Display", category: "Avionics", fit: ["Universal (STC required)"], price: 3995.00 },
];

function PartsCatalogView({ searchQ, setSearchQ }: { searchQ: string; setSearchQ: (q: string) => void }) {
  const [catFilter, setCatFilter] = useState("all");
  const categories = [...new Set(CATALOG_PARTS.map((p) => p.category))];

  const filtered = CATALOG_PARTS.filter((p) => {
    if (catFilter !== "all" && p.category !== catFilter) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return p.pn.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q) || p.fit.some((f) => f.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <>
      <div className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2.5">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search by part number, description, or aircraft type..." className="bg-transparent text-[13px] outline-none flex-1" />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="text-[12px] border border-border rounded-lg px-3 bg-white">
          <option value="all">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((p) => (
          <div key={p.pn} className="bg-white rounded-xl border border-border p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{p.pn}</div>
                <div className="text-[12px] text-muted-foreground">{p.desc}</div>
              </div>
              <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>${p.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="mb-3">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground" style={{ fontWeight: 600 }}>{p.category}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mb-3">
              <span style={{ fontWeight: 500 }}>Fits:</span> {p.fit.join(", ")}
            </div>
            <div className="flex gap-2">
              <button className="flex-1 text-[11px] py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 flex items-center justify-center gap-1" style={{ fontWeight: 500 }}>
                <ShoppingCart className="w-3 h-3" /> Order
              </button>
              <button className="text-[11px] py-1.5 px-3 rounded-lg border border-border hover:bg-muted" style={{ fontWeight: 500 }}>Add to WO</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- Add Part Order Modal ---- */
function AddPartOrderModal({ onClose, onAdd }: { onClose: () => void; onAdd: (p: PartOrder) => void }) {
  const [form, setForm] = useState({
    pn: "", description: "", aircraft: "", vendor: "Aircraft Spruce", condition: "New", qty: 1, unitPrice: 0, woNumber: "", notes: "",
  });

  const handleAdd = () => {
    const newPart: PartOrder = {
      id: `p-${Date.now()}`,
      ...form,
      status: "Needed",
    };
    onAdd(newPart);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Add Part Order</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[60vh] overflow-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>Part Number</label>
              <input value={form.pn} onChange={(e) => setForm({ ...form, pn: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" placeholder="e.g. CH48110-1" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>Aircraft</label>
              <select value={form.aircraft} onChange={(e) => setForm({ ...form, aircraft: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-white">
                <option value="">Shop stock</option>
                {AIRCRAFT_OPTIONS.map((a) => <option key={a.tail} value={a.tail}>{a.tail}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" placeholder="Part description" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>Vendor</label>
              <select value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-white">
                {VENDOR_DB.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>Condition</label>
              <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-white">
                {["New", "New-PMA", "Overhauled", "Serviceable", "As-Removed"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>Qty</label>
              <input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: +e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>Unit Price</label>
              <input type="number" step="0.01" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: +e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>Link to Work Order</label>
              <input value={form.woNumber} onChange={(e) => setForm({ ...form, woNumber: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none" placeholder="e.g. WO-2026-0047" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-[13px] resize-none h-[50px] outline-none" />
          </div>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-[13px] hover:bg-muted" style={{ fontWeight: 500 }}>Cancel</button>
          <button onClick={handleAdd} disabled={!form.pn || !form.description} className="px-5 py-2 rounded-lg bg-primary text-white text-[13px] hover:bg-primary/90 disabled:opacity-40" style={{ fontWeight: 600 }}>Add Part</button>
        </div>
      </div>
    </div>
  );
}


/* ================================================================== */
/*  TAB 4: WORKFLOW — Kanban Board                                     */
/* ================================================================== */

function WorkflowTab() {
  const columns: { status: string; label: string; color: string }[] = [
    { status: "Draft", label: "Draft", color: "border-t-slate-400" },
    { status: "Open", label: "Open", color: "border-t-blue-500" },
    { status: "In Progress", label: "In Progress", color: "border-t-indigo-500" },
    { status: "Awaiting Parts", label: "Awaiting Parts", color: "border-t-amber-500" },
    { status: "Ready for Signoff", label: "Ready for Signoff", color: "border-t-cyan-500" },
    { status: "Closed", label: "Closed / Invoiced", color: "border-t-emerald-500" },
  ];

  const allWOs = MOCK_WORK_ORDERS;

  const getCards = (status: string) => {
    if (status === "Closed") return allWOs.filter((wo) => ["Closed", "Invoiced", "Paid"].includes(wo.status));
    return allWOs.filter((wo) => wo.status === status);
  };

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Workflow Board</h2>
          <p className="text-[12px] text-muted-foreground">Visual overview of all active work orders across your shop.</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-[12px] hover:bg-muted" style={{ fontWeight: 500 }}>
            <Filter className="w-3.5 h-3.5" /> Filter
          </button>
          <button className="flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-primary/90" style={{ fontWeight: 500 }}>
            <Plus className="w-3.5 h-3.5" /> New Work Order
          </button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100% - 80px)" }}>
        {columns.map((col) => {
          const cards = getCards(col.status);
          return (
            <div key={col.status} className={`w-[280px] shrink-0 bg-muted/30 rounded-xl border-t-4 ${col.color} flex flex-col`}>
              <div className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{col.label}</span>
                  <span className="text-[10px] bg-white border border-border px-1.5 py-0.5 rounded-full text-muted-foreground" style={{ fontWeight: 600 }}>{cards.length}</span>
                </div>
              </div>
              <div className="flex-1 px-2 pb-2 space-y-2 overflow-auto">
                {cards.map((wo) => (
                  <div key={wo.id} className="bg-white rounded-lg border border-border p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-[12px] text-primary" style={{ fontWeight: 600 }}>{wo.woNumber}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[wo.status]}`} style={{ fontWeight: 600 }}>{wo.status}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Plane className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{wo.aircraft}</span>
                      <span className="text-[10px] text-muted-foreground">{wo.model}</span>
                    </div>
                    {wo.squawk && (
                      <div className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{wo.squawk}</div>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1"><User className="w-3 h-3" />{wo.mechanic}</div>
                      <div className="flex items-center gap-2">
                        {wo.laborHours > 0 && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{wo.laborHours}h</span>}
                        {(wo.laborHours * wo.laborRate + wo.partsTotal + wo.outsideTotal) > 0 && (
                          <span className="flex items-center gap-0.5" style={{ fontWeight: 500 }}>
                            <DollarSign className="w-3 h-3" />{(wo.laborHours * wo.laborRate + wo.partsTotal + wo.outsideTotal).toFixed(0)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Progress indicators */}
                    <div className="flex gap-1.5 mt-2">
                      {wo.partsTotal > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground" style={{ fontWeight: 500 }}>Parts</span>}
                      {wo.outsideTotal > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground" style={{ fontWeight: 500 }}>Outside</span>}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <div className="text-center py-8 text-[12px] text-muted-foreground/50">No items</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
