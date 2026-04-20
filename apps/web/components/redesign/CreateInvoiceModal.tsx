/**
 * CreateInvoiceModal — 3-step invoice creation wizard
 *
 * Step 1: Source — "From Work Order" (closed/ready) OR "Custom"
 * Step 2: Aircraft & Customer — AircraftLookupSection (pre-filled if from WO)
 * Step 3: Review + Create → saves to DataStore
 */

"use client";

import { useState } from "react";
import {
  X, ChevronRight, ChevronLeft, CheckCircle,
  Receipt, Loader2, FileText, Wrench, Calendar, DollarSign
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AircraftLookupSection, AircraftLookupState, EMPTY_LOOKUP_STATE } from "./AircraftLookupSection";
import { useDataStore, type WorkOrder } from "./workspace/DataStore";
import { formatRegistrantLocation } from "./faaDisplay";

/* ══════════════════════════════════════════════════════════════════ */
/*  PROPS                                                              */
/* ══════════════════════════════════════════════════════════════════ */

interface Props {
  onClose: () => void;
  onCreated?: (invoiceId: string) => void;
}

type Step = "source" | "aircraft" | "review";

/* ══════════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                          */
/* ══════════════════════════════════════════════════════════════════ */

export function CreateInvoiceModal({ onClose, onCreated }: Props) {
  const { addInvoice, addCustomer, updateCustomer, customers, workOrders, updateWorkOrder } = useDataStore();

  const [step, setStep] = useState<Step>("source");
  const [source, setSource] = useState<"workorder" | "custom">("custom");
  const [selectedWOId, setSelectedWOId] = useState<string>("");
  const [lookup, setLookup] = useState<AircraftLookupState>(EMPTY_LOOKUP_STATE);
  const [notes, setNotes] = useState("");
  const [dueInDays, setDueInDays] = useState("30");
  const [taxRate, setTaxRate] = useState("0");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  // Closed/ready WOs that don't already have an invoice linked
  const billableWOs = workOrders.filter(
    (w) =>
      (w.status === "Ready for Signoff" ||
        w.status === "Closed" ||
        w.status === "In Progress" ||
        w.status === "Open") &&
      !w.linkedInvoice
  );
  const selectedWO = workOrders.find((w) => w.id === selectedWOId);

  const STEPS: Step[] = ["source", "aircraft", "review"];
  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  /* ── Apply a selected WO to pre-fill aircraft + customer ── */
  function applyWorkOrder(wo: WorkOrder) {
    setSelectedWOId(wo.id);
    setLookup((prev) => ({
      ...prev,
      nNumber: wo.aircraft,
      lookupStatus: "idle",
      customerName: wo.customer,
      customerEmail: wo.company || "",
    }));
  }

  const canAdvanceAircraft =
    lookup.nNumber.length >= 4 &&
    (lookup.lookupStatus === "found" ||
      lookup.lookupStatus === "notfound" ||
      source === "workorder") && // WO mode: skip FAA requirement
    lookup.customerName.trim().length > 0;

  /* ── Totals from WO ── */
  const taxRateNum = parseFloat(taxRate) / 100 || 0;
  const subtotalLabor = selectedWO?.totalLabor || 0;
  const subtotalParts = selectedWO?.totalParts || 0;
  const subtotalOutside = selectedWO?.totalOutside || 0;
  const subtotal = selectedWO ? selectedWO.grandTotal : 0;
  const taxAmount = subtotal * taxRateNum;
  const grandTotal = subtotal + taxAmount;

  /* ── Create Invoice ── */
  function handleCreate() {
    setCreating(true);
    setTimeout(() => {
      const faa = lookup.faaData;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + parseInt(dueInDays || "30", 10));

      // Ensure customer exists
      let custId = lookup.existingCustomerId;
      if (!custId && lookup.customerName) {
        const existing = customers.find(
          (c) => c.name.toLowerCase() === lookup.customerName.toLowerCase()
        );
        if (existing) {
          custId = existing.id;
          if (lookup.nNumber && !existing.aircraft.includes(lookup.nNumber)) {
            updateCustomer(existing.id, { aircraft: [...existing.aircraft, lookup.nNumber] });
          }
        } else {
          const newCust = addCustomer({
            name: lookup.customerName,
            email: lookup.customerEmail,
            phone: lookup.customerPhone,
            company: "",
            address: faa ? formatRegistrantLocation(faa.registrant) : "",
            aircraft: lookup.nNumber ? [lookup.nNumber] : [],
            totalWorkOrders: 0,
            openInvoices: 1,
            totalBilled: grandTotal,
            outstandingBalance: grandTotal,
            lastService: new Date().toISOString(),
            preferredContact: "Email",
            notes: "",
            tags: ["New Customer"],
          });
          custId = newCust.id;
        }
      }

      const newInv = addInvoice({
        invoiceNumber: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
        aircraft: lookup.nNumber || selectedWO?.aircraft || "Unknown",
        customer: lookup.customerName || selectedWO?.customer || "Unknown",
        company: selectedWO?.company || "",
        issuedDate: new Date().toISOString(),
        dueDate: dueDate.toISOString(),
        status: "Draft",
        laborLines: selectedWO?.laborLines || [],
        partsLines: selectedWO?.partsLines || [],
        outsideServices: selectedWO?.outsideServices || [],
        subtotalLabor,
        subtotalParts,
        subtotalOutside,
        taxRate: taxRateNum,
        tax: taxAmount,
        shipping: 0,
        total: grandTotal,
        notes,
        paymentStatus: "Unpaid",
        amountPaid: 0,
        linkedWorkOrder: selectedWO?.id,
      });

      // Link back to WO
      if (selectedWO) {
        updateWorkOrder(selectedWO.id, { linkedInvoice: newInv.id, status: "Closed" });
      }

      setCreating(false);
      setCreated(true);
      onCreated?.(newInv.id);
      setTimeout(onClose, 1200);
    }, 1300);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-[620px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
      >
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-[#0A1628] to-[#1E3A5F] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white text-[15px]" style={{ fontWeight: 700 }}>New Invoice</div>
              <div className="text-white/50 text-[11px]">
                Step {stepIndex + 1} of {STEPS.length} — {
                  step === "source" ? "Choose source" :
                  step === "aircraft" ? "Aircraft & customer" :
                  "Review & create"
                }
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100 shrink-0">
          <motion.div
            className="h-full bg-amber-500"
            initial={{ width: "33%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
              className="p-6 space-y-5"
            >

              {/* ── STEP 1: Source ── */}
              {step === "source" && (
                <>
                  <div>
                    <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Create Invoice From…</h3>
                    <p className="text-[13px] text-muted-foreground mt-1">Pull from a closed or active work order, or create a standalone invoice.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setSource("workorder")}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        source === "workorder" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${source === "workorder" ? "bg-primary/10" : "bg-blue-50"}`}>
                        <Wrench className={`w-5 h-5 ${source === "workorder" ? "text-primary" : "text-blue-600"}`} />
                      </div>
                      <div className="text-[14px] text-foreground mb-1" style={{ fontWeight: 700 }}>From Work Order</div>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">
                        Pull labor, parts, and outside services from a work order automatically.
                      </p>
                      {billableWOs.length > 0 && (
                        <div className="mt-2 text-[11px] text-primary" style={{ fontWeight: 600 }}>
                          {billableWOs.length} billable work order{billableWOs.length !== 1 ? "s" : ""} →
                        </div>
                      )}
                    </button>

                    <button
                      onClick={() => setSource("custom")}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        source === "custom" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${source === "custom" ? "bg-primary/10" : "bg-slate-50"}`}>
                        <Receipt className={`w-5 h-5 ${source === "custom" ? "text-primary" : "text-slate-600"}`} />
                      </div>
                      <div className="text-[14px] text-foreground mb-1" style={{ fontWeight: 700 }}>Standalone Invoice</div>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">
                        Create a blank invoice and add line items manually.
                      </p>
                    </button>
                  </div>

                  {/* WO picker */}
                  {source === "workorder" && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                      {billableWOs.length === 0 ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] text-amber-800">
                          No billable work orders found. Switch to Standalone Invoice.
                        </div>
                      ) : (
                        <>
                          <label className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>Select Work Order</label>
                          <div className="space-y-2 max-h-52 overflow-y-auto">
                            {billableWOs.map((wo) => (
                              <button
                                key={wo.id}
                                onClick={() => applyWorkOrder(wo)}
                                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                                  selectedWOId === wo.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${selectedWOId === wo.id ? "border-primary bg-primary" : "border-border"}`}>
                                    {selectedWOId === wo.id && <div className="w-2 h-2 bg-white rounded-full" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{wo.woNumber}</span>
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                        wo.status === "Ready for Signoff" ? "bg-emerald-100 text-emerald-700" :
                                        wo.status === "Closed" ? "bg-slate-100 text-slate-600" :
                                        "bg-blue-100 text-blue-700"
                                      }`} style={{ fontWeight: 600 }}>{wo.status}</span>
                                    </div>
                                    <div className="text-[12px] text-muted-foreground">{wo.aircraft} · {wo.makeModel}</div>
                                    <div className="text-[11px] text-muted-foreground">{wo.customer} · ${wo.grandTotal.toLocaleString()}</div>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setStep("aircraft")}
                      disabled={source === "workorder" && !selectedWOId}
                      className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-all"
                      style={{ fontWeight: 600 }}
                    >
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}

              {/* ── STEP 2: Aircraft + Customer ── */}
              {step === "aircraft" && (
                <>
                  <div>
                    <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Aircraft & Customer</h3>
                    <p className="text-[13px] text-muted-foreground mt-1">
                      {source === "workorder"
                        ? "Details pre-filled from work order — confirm or update the active customer."
                        : "Enter the tail number to look up FAA registry data and confirm the customer."}
                    </p>
                  </div>

                  {/* Show WO summary if from WO */}
                  {source === "workorder" && selectedWO && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 700 }}>From Work Order</div>
                      <div className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{selectedWO.woNumber}</div>
                      <div className="text-[12px] text-muted-foreground">{selectedWO.squawk}</div>
                      <div className="flex items-center gap-4 mt-2 text-[12px] text-muted-foreground">
                        <span>Labor: ${selectedWO.totalLabor.toLocaleString()}</span>
                        <span>Parts: ${selectedWO.totalParts.toLocaleString()}</span>
                        <span className="text-foreground" style={{ fontWeight: 700 }}>Total: ${selectedWO.grandTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  <AircraftLookupSection
                    value={lookup}
                    onChange={(u) => setLookup((prev) => ({ ...prev, ...u }))}
                    existingCustomers={customers}
                    lockedNNumber={source === "workorder" && !!selectedWO}
                  />

                  {/* Invoice settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Due In (days)</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          type="number"
                          value={dueInDays}
                          onChange={(e) => setDueInDays(e.target.value)}
                          min="0"
                          className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Tax Rate (%)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          type="number"
                          value={taxRate}
                          onChange={(e) => setTaxRate(e.target.value)}
                          min="0"
                          max="30"
                          step="0.25"
                          className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Invoice Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Payment terms, thank-you note, or any additional details for the customer…"
                      className="w-full border border-border rounded-xl px-3.5 py-3 text-[13px] outline-none resize-none focus:border-primary/40 transition-colors leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-between pt-2">
                    <button
                      onClick={() => setStep("source")}
                      className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={() => setStep("review")}
                      disabled={!canAdvanceAircraft}
                      className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-all"
                      style={{ fontWeight: 600 }}
                    >
                      Review <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}

              {/* ── STEP 3: Review + Create ── */}
              {step === "review" && (
                <>
                  <div>
                    <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Review Invoice</h3>
                    <p className="text-[13px] text-muted-foreground mt-1">Created as Draft — you can edit line items before sending.</p>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2.5" style={{ fontWeight: 700 }}>Aircraft</div>
                      <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>{lookup.nNumber || selectedWO?.aircraft}</div>
                      {lookup.faaData && (
                        <div className="text-[13px] text-muted-foreground">
                          {lookup.faaData.aircraft.manufacturer} {lookup.faaData.aircraft.model}
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2.5" style={{ fontWeight: 700 }}>Bill To</div>
                      <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{lookup.customerName}</div>
                      {lookup.customerEmail && <div className="text-[12px] text-muted-foreground">{lookup.customerEmail}</div>}
                    </div>

                    {/* Totals */}
                    {selectedWO && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-3" style={{ fontWeight: 700 }}>Invoice Summary</div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[13px]">
                            <span className="text-muted-foreground">Labor</span>
                            <span>${subtotalLabor.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-[13px]">
                            <span className="text-muted-foreground">Parts</span>
                            <span>${subtotalParts.toLocaleString()}</span>
                          </div>
                          {subtotalOutside > 0 && (
                            <div className="flex justify-between text-[13px]">
                              <span className="text-muted-foreground">Outside Services</span>
                              <span>${subtotalOutside.toLocaleString()}</span>
                            </div>
                          )}
                          {taxRateNum > 0 && (
                            <div className="flex justify-between text-[13px]">
                              <span className="text-muted-foreground">Tax ({taxRate}%)</span>
                              <span>${taxAmount.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="border-t border-border pt-1.5 flex justify-between text-[14px]">
                            <span style={{ fontWeight: 700 }}>Total Due</span>
                            <span className="text-primary" style={{ fontWeight: 700 }}>${grandTotal.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span className="text-[12px] text-blue-800" style={{ fontWeight: 500 }}>
                        Created as Draft · Due in {dueInDays} days
                        {selectedWO ? ` · Linked to ${selectedWO.woNumber}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <button
                      onClick={() => setStep("aircraft")}
                      className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={creating || created}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] text-white transition-all ${
                        created ? "bg-emerald-600" : "bg-primary hover:bg-primary/90"
                      } disabled:opacity-60`}
                      style={{ fontWeight: 700 }}
                    >
                      {creating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                      ) : created ? (
                        <><CheckCircle className="w-4 h-4" /> Invoice Created!</>
                      ) : (
                        <><Receipt className="w-4 h-4" /> Create Invoice</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
