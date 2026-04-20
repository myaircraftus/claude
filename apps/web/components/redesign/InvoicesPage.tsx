"use client";

import { useState } from "react";
import {
  Receipt, Plus, Search, Filter, Download, Printer, Eye, Edit3, Trash2,
  DollarSign, AlertTriangle, CheckCircle, Clock, Mail, Plane, Calendar,
  X, Shield, PenLine, FileCheck, Wrench,
} from "lucide-react";
import { useDataStore, type Invoice } from "./workspace/DataStore";
import { motion, AnimatePresence } from "motion/react";
import { CreateInvoiceModal } from "./CreateInvoiceModal";
import { ESignatureModal, SignatureBlock, type SignatureResult } from "./ESignatureModal";
import { useAppContext } from "./AppContext";
import { toast } from "sonner";

/* ─── Seed invoices ──────────────────────────────────────────── */
const SEED_INVOICES: Invoice[] = [];

/* ─── Signature state ────────────────────────────────────────── */
interface InvoiceSigs {
  invoice?: SignatureResult;
  crs?: SignatureResult;
}

export function InvoicesPage() {
  const { invoices, deleteInvoice, updateInvoice } = useDataStore();
  const { activeMechanic } = useAppContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);

  // Signature state: keyed by invoice id → { invoice?: sig, crs?: sig }
  const [signatures, setSignatures] = useState<Record<string, InvoiceSigs>>({});
  // Which signature modal is open: null | "invoice" | "crs"
  const [sigModal, setSigModal] = useState<null | "invoice" | "crs">(null);

  const allInvoices: Invoice[] = invoices;

  const filteredInvoices = allInvoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.aircraft.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    const matchesPayment = paymentFilter === "all" || inv.paymentStatus === paymentFilter;
    return matchesSearch && matchesStatus && matchesPayment;
  });

  const selectedInv = allInvoices.find((i) => i.id === selectedInvId) ?? null;
  const invSigs = selectedInv ? (signatures[selectedInv.id] ?? {}) : {};

  const statusColors: Record<string, string> = {
    Draft: "bg-slate-100 text-slate-600",
    Sent: "bg-blue-50 text-blue-700",
    Paid: "bg-emerald-50 text-emerald-700",
    Overdue: "bg-red-50 text-red-700",
    Cancelled: "bg-slate-100 text-slate-500",
  };
  const paymentColors: Record<string, string> = {
    Unpaid: "bg-amber-50 text-amber-700",
    Partial: "bg-blue-50 text-blue-700",
    Paid: "bg-emerald-50 text-emerald-700",
  };

  const isSeedInvoice = (_id: string) => false;

  const handleMarkPaid = (inv: Invoice) => {
    if (isSeedInvoice(inv.id)) { toast.info("Demo invoice — create your own to mark payment."); return; }
    updateInvoice(inv.id, { paymentStatus: "Paid", status: "Paid", amountPaid: inv.total });
    toast.success(`${inv.invoiceNumber} marked as Paid.`);
  };

  const handleSend = (inv: Invoice) => {
    if (isSeedInvoice(inv.id)) { toast.info("Demo invoice — create your own to send."); return; }
    updateInvoice(inv.id, { status: "Sent" });
    toast.success(`${inv.invoiceNumber} marked as Sent.`);
  };

  const handleSigned = (type: "invoice" | "crs", result: SignatureResult) => {
    if (!selectedInv) return;
    setSignatures(prev => ({
      ...prev,
      [selectedInv.id]: { ...prev[selectedInv.id], [type]: result },
    }));
    setSigModal(null);
    toast.success(type === "invoice" ? "Invoice signed & sealed." : "Certificate of Return to Service signed & sealed.");
  };

  const mechName = activeMechanic?.name ?? "Mike Torres";
  const mechTitle = activeMechanic?.role ?? "Lead Mechanic / IA";
  const mechCert = activeMechanic?.cert ?? "A&P/IA #987654321";

  const stats = {
    total: allInvoices.length,
    unpaid: allInvoices.filter(i => i.paymentStatus === "Unpaid").length,
    overdue: allInvoices.filter(i => i.status === "Overdue").length,
    paid: allInvoices.filter(i => i.paymentStatus === "Paid").length,
  };

  return (
    <div className="h-full flex overflow-hidden bg-[#F7F8FA]">

      {/* ── Left list panel ── */}
      <div className="w-[340px] shrink-0 border-r border-border flex flex-col bg-white">
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[16px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Invoices</h1>
            <button onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 bg-[#0A1628] text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-[#0A1628]/90 transition-colors"
              style={{ fontWeight: 600 }}>
              <Plus className="w-3.5 h-3.5" /> New Invoice
            </button>
          </div>
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg border border-border px-2.5 py-1.5 mb-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search invoices..." className="flex-1 bg-transparent text-[12px] outline-none" />
          </div>
          <div className="flex gap-2">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="flex-1 text-[11px] bg-white border border-border rounded-lg px-2 py-1.5 outline-none cursor-pointer">
              <option value="all">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Paid">Paid</option>
              <option value="Overdue">Overdue</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
              className="flex-1 text-[11px] bg-white border border-border rounded-lg px-2 py-1.5 outline-none cursor-pointer">
              <option value="all">All Payments</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
        </div>

        {/* Stats mini row */}
        <div className="grid grid-cols-4 border-b border-border shrink-0">
          {[
            { l: "Total", v: stats.total, c: "text-foreground" },
            { l: "Unpaid", v: stats.unpaid, c: "text-amber-600" },
            { l: "Overdue", v: stats.overdue, c: "text-red-600" },
            { l: "Paid", v: stats.paid, c: "text-emerald-600" },
          ].map(s => (
            <div key={s.l} className="px-2 py-2 text-center">
              <div className={`text-[15px] ${s.c}`} style={{ fontWeight: 700 }}>{s.v}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Receipt className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-[13px]">No invoices match</p>
            </div>
          ) : (
            filteredInvoices.map(inv => {
              const active = inv.id === selectedInvId;
              const isOverdue = inv.status === "Overdue";
              const invSigned = !!(signatures[inv.id]?.invoice);
              const crsAvail = !!(signatures[inv.id]?.crs);
              return (
                <button key={inv.id} onClick={() => setSelectedInvId(inv.id)}
                  className={`w-full text-left px-4 py-3.5 border-b border-border hover:bg-muted/20 transition-colors ${active ? "bg-primary/5 border-l-[3px] border-l-primary" : ""}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-primary" style={{ fontWeight: 700 }}>{inv.invoiceNumber}</span>
                    <div className="flex items-center gap-1.5">
                      {invSigned && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1" style={{ fontWeight: 600 }}><Shield className="w-2.5 h-2.5" /> Signed</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColors[inv.status] || "bg-muted text-muted-foreground"}`} style={{ fontWeight: 600 }}>{inv.status}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-1 truncate">{inv.customer}</div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Plane className="w-3 h-3" />{inv.aircraft}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${paymentColors[inv.paymentStatus] || "bg-slate-100 text-slate-500"}`} style={{ fontWeight: 600 }}>{inv.paymentStatus}</span>
                      <span className={`text-[12px] ${isOverdue ? "text-red-600" : "text-foreground"}`} style={{ fontWeight: 700 }}>${inv.total.toFixed(2)}</span>
                    </div>
                  </div>
                  {isOverdue && (
                    <div className="mt-1 text-[10px] text-red-500 flex items-center gap-1" style={{ fontWeight: 600 }}>
                      <AlertTriangle className="w-3 h-3" /> Overdue · due {new Date(inv.dueDate).toLocaleDateString()}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right detail panel ── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {selectedInv ? (
            <motion.div key={selectedInv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="px-6 py-5 max-w-3xl space-y-4">

              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-[20px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{selectedInv.invoiceNumber}</h2>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${statusColors[selectedInv.status] || "bg-muted text-muted-foreground"}`} style={{ fontWeight: 600 }}>{selectedInv.status}</span>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${paymentColors[selectedInv.paymentStatus] || "bg-muted text-muted-foreground"}`} style={{ fontWeight: 600 }}>{selectedInv.paymentStatus}</span>
                    {invSigs.invoice && (
                      <span className="flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700" style={{ fontWeight: 600 }}>
                        <Shield className="w-3 h-3" /> Signed
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-muted-foreground">{selectedInv.customer} · {selectedInv.aircraft}</div>
                  {selectedInv.status === "Overdue" && (
                    <div className="mt-1 text-[12px] text-red-600 flex items-center gap-1.5" style={{ fontWeight: 600 }}>
                      <AlertTriangle className="w-3.5 h-3.5" /> Overdue · due {new Date(selectedInv.dueDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {selectedInv.paymentStatus !== "Paid" && selectedInv.status !== "Sent" && (
                    <button onClick={() => handleSend(selectedInv)}
                      className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <Mail className="w-3.5 h-3.5" /> Send
                    </button>
                  )}
                  <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                  {selectedInv.paymentStatus !== "Paid" && (
                    <button onClick={() => handleMarkPaid(selectedInv)}
                      className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-[12px] hover:bg-emerald-700 transition-colors" style={{ fontWeight: 600 }}>
                      <CheckCircle className="w-3.5 h-3.5" /> Mark Paid
                    </button>
                  )}
                </div>
              </div>

              {/* Bill To + Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-border p-4">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 700 }}>Bill To</div>
                  <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{selectedInv.customer}</div>
                  {selectedInv.company && <div className="text-[12px] text-muted-foreground">{selectedInv.company}</div>}
                  <div className="flex items-center gap-1.5 mt-2 text-[12px] text-muted-foreground">
                    <Plane className="w-3 h-3" /> {selectedInv.aircraft}
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-border p-4">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 700 }}>Dates</div>
                  <div className="space-y-1.5 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Issued</span>
                      <span style={{ fontWeight: 500 }}>{new Date(selectedInv.issuedDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Due</span>
                      <span className={selectedInv.status === "Overdue" ? "text-red-600" : ""} style={{ fontWeight: 500 }}>
                        {new Date(selectedInv.dueDate).toLocaleDateString()}
                      </span>
                    </div>
                    {selectedInv.linkedWorkOrder && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Work Order</span>
                        <span className="text-primary" style={{ fontWeight: 600 }}>{selectedInv.linkedWorkOrder}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Line items */}
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border text-[13px] text-foreground" style={{ fontWeight: 600 }}>Line Items</div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-4 py-2 text-muted-foreground" style={{ fontWeight: 600 }}>Description</th>
                      <th className="text-right px-4 py-2 text-muted-foreground w-24" style={{ fontWeight: 600 }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedInv.laborLines.map(l => (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5 text-foreground">
                          {l.desc}
                          <span className="text-muted-foreground ml-1">({l.hours}h @ ${l.rate}/hr)</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</td>
                      </tr>
                    ))}
                    {selectedInv.partsLines.map(p => (
                      <tr key={p.id}>
                        <td className="px-4 py-2.5 text-foreground">
                          {p.desc}
                          <span className="text-muted-foreground ml-1">P/N {p.pn}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>${p.total.toFixed(2)}</td>
                      </tr>
                    ))}
                    {selectedInv.outsideServices.map(o => (
                      <tr key={o.id}>
                        <td className="px-4 py-2.5 text-foreground">{o.desc} <span className="text-muted-foreground">— {o.vendor}</span></td>
                        <td className="px-4 py-2.5 text-right text-foreground" style={{ fontWeight: 600 }}>${o.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border">
                    {selectedInv.tax > 0 && (
                      <tr className="bg-muted/10">
                        <td className="px-4 py-2 text-muted-foreground">Tax ({(selectedInv.taxRate * 100).toFixed(1)}%)</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">${selectedInv.tax.toFixed(2)}</td>
                      </tr>
                    )}
                    <tr className="bg-primary/5">
                      <td className="px-4 py-3 text-foreground" style={{ fontWeight: 700 }}>Total Due</td>
                      <td className="px-4 py-3 text-right text-[18px] text-foreground" style={{ fontWeight: 700 }}>${selectedInv.total.toFixed(2)}</td>
                    </tr>
                    {selectedInv.paymentStatus === "Paid" && (
                      <tr className="bg-emerald-50">
                        <td className="px-4 py-2 text-emerald-700" style={{ fontWeight: 600 }}>✓ Paid in Full</td>
                        <td className="px-4 py-2 text-right text-emerald-700" style={{ fontWeight: 600 }}>${selectedInv.amountPaid.toFixed(2)}</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              {/* Notes */}
              {selectedInv.notes && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 700 }}>Notes</div>
                  <div className="text-[12px] text-muted-foreground leading-relaxed">{selectedInv.notes}</div>
                </div>
              )}

              {/* ── Invoice Signature Section ── */}
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PenLine className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Invoice Signature</span>
                    {invSigs.invoice && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1" style={{ fontWeight: 600 }}>
                        <Shield className="w-2.5 h-2.5" /> ESIGN Compliant
                      </span>
                    )}
                  </div>
                  {!invSigs.invoice && (
                    <button
                      onClick={() => setSigModal("invoice")}
                      className="flex items-center gap-1.5 bg-[#0A1628] text-white px-4 py-2 rounded-lg text-[12px] hover:bg-[#1E3A5F] transition-colors"
                      style={{ fontWeight: 600 }}
                    >
                      <PenLine className="w-3.5 h-3.5" /> Sign Invoice
                    </button>
                  )}
                </div>
                <div className="p-4">
                  {invSigs.invoice ? (
                    <SignatureBlock sig={invSigs.invoice} label="Mechanic's Signature" />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <PenLine className="w-5 h-5 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-[13px] text-muted-foreground" style={{ fontWeight: 500 }}>Invoice not yet signed</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Draw or type your signature to create a legally binding electronic record</p>
                      </div>
                      <button onClick={() => setSigModal("invoice")}
                        className="flex items-center gap-2 border border-dashed border-slate-300 px-5 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
                        style={{ fontWeight: 600 }}>
                        <PenLine className="w-4 h-4" /> Click to Sign
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Certificate of Return to Service ── */}
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                {/* CRS Header */}
                <div className="bg-[#0A1628] px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-white" />
                    <span className="text-white text-[13px]" style={{ fontWeight: 700 }}>Certificate of Return to Service</span>
                    <span className="text-white/50 text-[11px]">· 14 CFR Part 43.9</span>
                  </div>
                  {invSigs.crs && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 flex items-center gap-1" style={{ fontWeight: 700 }}>
                      <Shield className="w-2.5 h-2.5" /> Certified
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-4">
                  {/* CRS Body */}
                  <div className="bg-[#F7F9FC] border border-[#E2E8F0] rounded-xl p-4 space-y-3 text-[12px]">
                    <div className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>
                      Maintenance / Preventive Maintenance / Alteration — Return to Service
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      I certify that the work described on this invoice was performed on the aircraft identified below, in accordance with the current
                      Manufacturer's Data, FAA-approved data, or data acceptable to the Administrator. The aircraft identified below has been returned
                      to an airworthy condition.
                    </p>

                    <div className="grid grid-cols-2 gap-y-2 gap-x-6">
                      {[
                        { label: "Aircraft N-Number", value: selectedInv.aircraft },
                        { label: "Invoice Reference", value: selectedInv.invoiceNumber },
                        { label: "Date of Service", value: new Date(selectedInv.issuedDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
                        { label: "Regulation", value: "14 CFR Part 43.9 / 43.11" },
                        { label: "Mechanic", value: mechName },
                        { label: "FAA Certificate", value: mechCert },
                      ].map(row => (
                        <div key={row.label} className="flex gap-1">
                          <span className="text-muted-foreground shrink-0">{row.label}:</span>
                          <span className="text-foreground" style={{ fontWeight: 600 }}>{row.value}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-[#E2E8F0] pt-3">
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        <strong className="text-foreground">Work Performed:</strong>{" "}
                        {selectedInv.laborLines.map(l => l.desc).join("; ")}.
                        {selectedInv.partsLines.length > 0 && (
                          <> Parts replaced: {selectedInv.partsLines.map(p => `${p.desc} (P/N ${p.pn})`).join(", ")}.</>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* CRS Signature */}
                  {invSigs.crs ? (
                    <SignatureBlock sig={invSigs.crs} label="IA / A&P Mechanic Signature" />
                  ) : (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col items-center gap-3 text-center">
                      <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                        <Wrench className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-[12px] text-muted-foreground" style={{ fontWeight: 600 }}>CRS not yet signed</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Required under 14 CFR § 43.9 — A&P or IA signature required to return aircraft to service
                        </p>
                      </div>
                      <button onClick={() => setSigModal("crs")}
                        className="flex items-center gap-2 bg-[#1E3A5F] text-white px-5 py-2.5 rounded-xl text-[12px] hover:bg-[#0A1628] transition-colors"
                        style={{ fontWeight: 700 }}>
                        <Shield className="w-3.5 h-3.5" /> Sign CRS — 14 CFR § 43.9
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment actions */}
              {selectedInv.paymentStatus !== "Paid" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => toast.info("Stripe payments coming soon — connect your Stripe account in Settings.")}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#635BFF] text-white py-3 rounded-xl text-[13px] hover:bg-[#5851E5] transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    <Receipt className="w-4 h-4" /> Pay via Stripe
                  </button>
                  <button onClick={() => handleMarkPaid(selectedInv)}
                    className="flex items-center gap-1.5 border border-border px-4 py-3 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors"
                    style={{ fontWeight: 500 }}>
                    <CheckCircle className="w-4 h-4" /> Mark Paid Manually
                  </button>
                </div>
              )}

            </motion.div>
          ) : (
            <motion.div key="no-invoice" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-[14px]" style={{ fontWeight: 500 }}>Select an invoice</p>
                <p className="text-[12px] mt-1">or create a new one with the button above</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Create Invoice Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateInvoiceModal
            onClose={() => setShowCreateModal(false)}
            onCreated={(id) => { setShowCreateModal(false); setSelectedInvId(id); toast.success("Invoice created successfully!"); }}
          />
        )}
      </AnimatePresence>

      {/* E-Signature Modals */}
      <AnimatePresence>
        {sigModal && selectedInv && (
          <ESignatureModal
            documentId={selectedInv.invoiceNumber}
            documentTitle={sigModal === "invoice" ? selectedInv.invoiceNumber : `CRS — ${selectedInv.aircraft}`}
            documentType={sigModal === "invoice" ? "invoice" : "crs"}
            signerName={mechName}
            signerTitle={mechTitle}
            signerCert={mechCert}
            context={[
              { label: "Aircraft", value: selectedInv.aircraft },
              { label: "Customer", value: selectedInv.customer },
              { label: "Invoice", value: selectedInv.invoiceNumber },
            ]}
            onCancel={() => setSigModal(null)}
            onSigned={(result) => handleSigned(sigModal, result)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
