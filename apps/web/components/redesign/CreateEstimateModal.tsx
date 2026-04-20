/**
 * CreateEstimateModal — 3-step estimate creation wizard
 *
 * Step 1: Aircraft — AircraftLookupSection (FAA lookup + customer)
 * Step 2: Scope — service type + description + AI generate + dictate
 * Step 3: Review + Create → saves to DataStore
 */

"use client";

import { useState } from "react";
import {
  X, ChevronRight, ChevronLeft, CheckCircle, Sparkles,
  FileText, Loader2, Mic, MicOff, Calendar, User, Bot
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AircraftLookupSection, AircraftLookupState, EMPTY_LOOKUP_STATE } from "./AircraftLookupSection";
import { useDataStore } from "./workspace/DataStore";
import { useAppContext } from "./AppContext";
import { getSquawksForAircraft } from "./workspace/squawksData";
import { formatRegistrantLocation } from "./faaDisplay";

/* ── Service type options (same set as WO) ── */
const SERVICE_TYPES = [
  "Annual Inspection",
  "100-Hour Inspection",
  "50-Hour Inspection",
  "Oil and Filter Change",
  "Brake System Inspection & Repair",
  "Navigation Light Repair",
  "Spark Plug Replacement",
  "Magneto Inspection & Timing",
  "Engine Top Overhaul",
  "Landing Gear Inspection & Repair",
  "Fuel System Inspection",
  "Avionics Repair / Replacement",
  "ELT Battery Replacement",
  "Propeller Inspection",
  "Airworthiness Directive (AD) Compliance",
  "Progressive Inspection",
  "Compression Check",
  "Exhaust System Repair",
  "Major Repair",
  "Custom / Other",
];

function generateScopeSuggestion(serviceType: string, nNumber: string, makeModel: string): string {
  const aircraft = makeModel ? `${nNumber} (${makeModel})` : nNumber;
  const templates: Record<string, string> = {
    "Annual Inspection": `Estimate for annual inspection of ${aircraft} in accordance with FAR 43 Appendix D. Includes engine oil change and filter inspection, spark plug service, compression check, magneto timing verification, flight control inspection, fuel system inspection, landing gear and brake inspection, and airframe corrosion/damage check. Additional items billed separately if significant discrepancies are found.`,
    "100-Hour Inspection": `Estimate for 100-hour inspection of ${aircraft} per applicable manufacturer's maintenance manual. Includes engine oil change, oil filter replacement and inspection, spark plug inspection/rotation, compression check, ignition system check, control surfaces, fuel and landing gear systems. Time and material for repairs not included.`,
    "Oil and Filter Change": `Estimate for engine oil and filter service on ${aircraft}. Drain engine oil, replace oil filter (cut and inspected for metal), refill with approved oil (per manufacturer specification), engine run-up, and leak check.`,
    "Brake System Inspection & Repair": `Estimate to inspect and repair brake system on ${aircraft}. Inspect brake pads, discs, calipers, hydraulic lines and fittings. Replace worn components as required. Ground functional test included. Parts costs subject to actual condition found.`,
    "Progressive Inspection": `Annual/progressive inspection estimate for ${aircraft}. Full inspection per FAR 43 Appendix D including engine, airframe, flight controls, avionics, fuel, landing gear, and lighting systems. Estimate assumes serviceable condition — additional charges if significant discrepancies found.`,
  };
  return templates[serviceType] || `Estimate for ${serviceType} on ${aircraft}. Work to be performed per applicable FAA-approved maintenance data and manufacturer's maintenance manual. Parts and labor to be confirmed upon inspection.`;
}

/* ══════════════════════════════════════════════════════════════════ */
/*  PROPS                                                              */
/* ══════════════════════════════════════════════════════════════════ */

interface Props {
  onClose: () => void;
  onCreated?: (estimateId: string) => void;
}

type Step = "aircraft" | "scope" | "review";

/* ══════════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                          */
/* ══════════════════════════════════════════════════════════════════ */

export function CreateEstimateModal({ onClose, onCreated }: Props) {
  const { addEstimate, addCustomer, updateCustomer, customers } = useDataStore();
  const { activeMechanic } = useAppContext();

  const [step, setStep] = useState<Step>("aircraft");
  const [lookup, setLookup] = useState<AircraftLookupState>(EMPTY_LOOKUP_STATE);
  const [serviceType, setServiceType] = useState("");
  const [serviceTypeOpen, setServiceTypeOpen] = useState(false);
  const [scopeText, setScopeText] = useState("");
  const [assumptions, setAssumptions] = useState("Estimate assumes no additional discrepancies. Significant findings billed at T&M with owner notification.");
  const [validDays, setValidDays] = useState("30");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const STEPS: Step[] = ["aircraft", "scope", "review"];
  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const canAdvanceAircraft =
    lookup.nNumber.length >= 4 &&
    (lookup.lookupStatus === "found" || lookup.lookupStatus === "notfound") &&
    lookup.customerName.trim().length > 0;

  const canAdvanceScope = !!serviceType && scopeText.trim().length > 0;

  function handleAIGenerate() {
    if (!serviceType) return;
    setIsGenerating(true);
    setTimeout(() => {
      const makeModel = lookup.faaData
        ? `${lookup.faaData.aircraft.manufacturer} ${lookup.faaData.aircraft.model}`
        : "";
      setScopeText(generateScopeSuggestion(serviceType, lookup.nNumber, makeModel));
      setIsGenerating(false);
    }, 1100);
  }

  function handleCreate() {
    setCreating(true);
    setTimeout(() => {
      const faa = lookup.faaData;

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
            openInvoices: 0,
            totalBilled: 0,
            outstandingBalance: 0,
            lastService: new Date().toISOString(),
            preferredContact: "Email",
            notes: "",
            tags: ["New Customer"],
          });
          custId = newCust.id;
        }
      }

      const validUntilDate = new Date();
      validUntilDate.setDate(validUntilDate.getDate() + parseInt(validDays || "30", 10));

      const newEst = addEstimate(
        {
          estimateNumber: `EST-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
          aircraft: lookup.nNumber || "Unknown",
          makeModel: faa ? `${faa.aircraft.manufacturer} ${faa.aircraft.model}` : "",
          customer: lookup.customerName || lookup.registeredOwner || "Unknown",
          company: "",
          mechanic: activeMechanic.name,
          status: "Draft",
          laborLines: [],
          partsLines: [],
          outsideServices: [],
          assumptions,
          internalNotes: `${serviceType} — ${lookup.nNumber}`,
          customerNotes: scopeText,
          subtotalLabor: 0,
          subtotalParts: 0,
          subtotalOutside: 0,
          total: 0,
          validUntil: validUntilDate.toISOString(),
        },
        {
          onPersisted: (persistedEstimate) => {
            onCreated?.(persistedEstimate.id);
          },
        }
      );

      setCreating(false);
      setCreated(true);
      onCreated?.(newEst.id);
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
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white text-[15px]" style={{ fontWeight: 700 }}>New Estimate</div>
              <div className="text-white/50 text-[11px]">
                Step {stepIndex + 1} of {STEPS.length} — {
                  step === "aircraft" ? "Aircraft & customer" :
                  step === "scope" ? "Service scope" :
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
            className="h-full bg-emerald-500"
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

              {/* ── STEP 1: Aircraft ── */}
              {step === "aircraft" && (
                <>
                  <div>
                    <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Aircraft & Customer</h3>
                    <p className="text-[13px] text-muted-foreground mt-1">
                      Enter the tail number to look up FAA registry data and confirm the active customer.
                    </p>
                  </div>

                  {/* Show open squawks when aircraft is found */}
                  {lookup.lookupStatus === "found" && lookup.nNumber.length >= 4 && (() => {
                    const squawks = getSquawksForAircraft(lookup.nNumber).filter(s => s.status !== "Resolved");
                    if (squawks.length === 0) return null;
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="text-[12px] text-amber-800" style={{ fontWeight: 700 }}>
                            {squawks.length} Open Squawk{squawks.length !== 1 ? "s" : ""} — {lookup.nNumber}
                          </span>
                          <span className="text-[10px] text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full ml-auto" style={{ fontWeight: 600 }}>
                            Will be included in scope
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {squawks.slice(0, 3).map((sq) => {
                            const sevColors: Record<string, string> = { Low: "bg-slate-100 text-slate-600", Medium: "bg-amber-100 text-amber-700", High: "bg-orange-100 text-orange-700", Critical: "bg-red-100 text-red-700" };
                            return (
                              <div key={sq.id} className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${sevColors[sq.severity] || "bg-slate-100 text-slate-600"}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                                <span className="text-[12px] text-amber-900 flex-1 truncate" style={{ fontWeight: 500 }}>{sq.title}</span>
                                <span className="text-[10px] text-emerald-600 shrink-0" style={{ fontWeight: 600 }}>→ Resolved</span>
                              </div>
                            );
                          })}
                          {squawks.length > 3 && (
                            <div className="text-[11px] text-amber-600 px-3 py-1">+{squawks.length - 3} more squawk{squawks.length - 3 !== 1 ? "s" : ""}…</div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <AircraftLookupSection
                    value={lookup}
                    onChange={(u) => setLookup((prev) => ({ ...prev, ...u }))}
                    existingCustomers={customers}
                  />

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setStep("scope")}
                      disabled={!canAdvanceAircraft}
                      className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-all"
                      style={{ fontWeight: 600 }}
                    >
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {!canAdvanceAircraft && lookup.nNumber.length >= 4 && (
                    <p className="text-[11px] text-muted-foreground text-center -mt-2">
                      {!lookup.customerName ? "Enter customer name to continue" : "Awaiting FAA registry result…"}
                    </p>
                  )}
                </>
              )}

              {/* ── STEP 2: Scope ── */}
              {step === "scope" && (
                <>
                  <div>
                    <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Service Scope</h3>
                    <p className="text-[13px] text-muted-foreground mt-1">
                      Describe what the estimate covers. Use AI to generate scope from the service type.
                    </p>
                  </div>

                  {/* Service type */}
                  <div>
                    <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>
                      Service Type <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setServiceTypeOpen((o) => !o)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 border rounded-xl text-[13px] text-left transition-all ${
                          serviceType ? "border-primary/40 bg-primary/3" : "border-border hover:border-primary/30"
                        }`}
                      >
                        <span className={serviceType ? "text-foreground" : "text-muted-foreground/60"} style={{ fontWeight: serviceType ? 500 : 400 }}>
                          {serviceType || "Select service type…"}
                        </span>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${serviceTypeOpen ? "rotate-90" : ""}`} />
                      </button>
                      <AnimatePresence>
                        {serviceTypeOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="absolute left-0 right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto"
                          >
                            {SERVICE_TYPES.map((t) => (
                              <button
                                key={t}
                                onClick={() => { setServiceType(t); setServiceTypeOpen(false); }}
                                className={`w-full px-4 py-2.5 text-left text-[13px] hover:bg-muted/40 transition-colors flex items-center justify-between ${
                                  serviceType === t ? "bg-primary/8 text-primary" : "text-foreground"
                                }`}
                                style={{ fontWeight: serviceType === t ? 600 : 400 }}
                              >
                                {t}
                                {serviceType === t && <CheckCircle className="w-3.5 h-3.5" />}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Scope description */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>
                        Scope Description <span className="text-destructive">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAIGenerate}
                          disabled={!serviceType || isGenerating}
                          className="flex items-center gap-1.5 text-[11px] text-violet-700 border border-violet-300 px-2.5 py-1 rounded-lg hover:bg-violet-50 disabled:opacity-40 transition-all"
                          style={{ fontWeight: 600 }}
                        >
                          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          AI Generate
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsRecording((r) => !r)}
                          className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                            isRecording ? "bg-destructive/10 border-destructive/30 text-destructive" : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                          style={{ fontWeight: 500 }}
                        >
                          {isRecording ? <><MicOff className="w-3 h-3" /> Stop</> : <><Mic className="w-3 h-3" /> Dictate</>}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={scopeText}
                      onChange={(e) => setScopeText(e.target.value)}
                      rows={5}
                      placeholder="Describe the scope of work. AI can generate a full estimate description from the service type and aircraft data."
                      className="w-full border border-border rounded-xl px-3.5 py-3 text-[13px] outline-none resize-none focus:border-primary/40 transition-colors leading-relaxed"
                    />
                    {isRecording && (
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-destructive">
                        <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        Recording… describe the scope of work
                      </div>
                    )}
                  </div>

                  {/* Assumptions + Valid days */}
                  <div>
                    <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Assumptions / Caveats</label>
                    <textarea
                      value={assumptions}
                      onChange={(e) => setAssumptions(e.target.value)}
                      rows={2}
                      className="w-full border border-border rounded-xl px-3.5 py-3 text-[13px] outline-none resize-none focus:border-primary/40 transition-colors leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Estimate Valid For (days)</label>
                    <input
                      type="number"
                      value={validDays}
                      onChange={(e) => setValidDays(e.target.value)}
                      min="7"
                      max="365"
                      className="w-32 border border-border rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
                    />
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
                      onClick={() => setStep("review")}
                      disabled={!canAdvanceScope}
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
                    <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Review Estimate</h3>
                    <p className="text-[13px] text-muted-foreground mt-1">Review and create as a Draft — add line items after creation.</p>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2.5" style={{ fontWeight: 700 }}>Aircraft</div>
                      <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>{lookup.nNumber}</div>
                      {lookup.faaData && (
                        <div className="text-[13px] text-muted-foreground">
                          {lookup.faaData.aircraft.manufacturer} {lookup.faaData.aircraft.model} · {lookup.faaData.aircraft.year}
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2.5" style={{ fontWeight: 700 }}>Customer</div>
                      <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{lookup.customerName}</div>
                      {lookup.customerEmail && <div className="text-[12px] text-muted-foreground">{lookup.customerEmail}</div>}
                      {lookup.existingCustomerId && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                          <CheckCircle className="w-2.5 h-2.5" /> Existing customer
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2.5" style={{ fontWeight: 700 }}>Scope</div>
                      <div className="text-[13px] text-foreground mb-1" style={{ fontWeight: 600 }}>{serviceType}</div>
                      <div className="text-[12px] text-muted-foreground leading-relaxed line-clamp-3">{scopeText}</div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                      <div className="text-[12px] text-blue-800">
                        <span style={{ fontWeight: 600 }}>Created as Draft</span> — add labor/parts line items after creation. Valid for {validDays} days.
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <button
                      onClick={() => setStep("scope")}
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
                        <><CheckCircle className="w-4 h-4" /> Estimate Created!</>
                      ) : (
                        <><FileText className="w-4 h-4" /> Create Estimate</>
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
