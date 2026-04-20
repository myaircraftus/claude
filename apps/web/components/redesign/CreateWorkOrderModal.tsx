"use client";

/**
 * CreateWorkOrderModal — 4-step work order creation wizard
 *
 * Step 1: Source — "From Estimate" (approved only) OR "Custom"
 * Step 2: Aircraft — AircraftLookupSection (FAA lookup + customer)
 * Step 3: Squawk/Scope — description + AI generate + dictate + target date
 * Step 4: Review + Create → saves to DataStore
 */

import { useState, useRef } from "react";
import {
  X, ChevronRight, ChevronLeft, CheckCircle, Sparkles,
  FileText, Wrench, Loader2, Mic, MicOff, Calendar,
  ClipboardList, AlertTriangle, User, Bot, Square, CheckSquare, Users
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AircraftLookupSection, AircraftLookupState, EMPTY_LOOKUP_STATE } from "./AircraftLookupSection";
import { useDataStore, type Estimate } from "./workspace/DataStore";
import { useAppContext } from "./AppContext";
import { getSquawksForAircraft, type Squawk } from "./workspace/squawksData";
import { formatRegistrantLocation } from "./faaDisplay";

/* ── Service type options ── */
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

/* ── AI squawk generator ── */
function generateSquawkSuggestion(serviceType: string, nNumber: string, makeModel: string): string {
  const aircraft = makeModel ? `${nNumber} (${makeModel})` : nNumber;
  const templates: Record<string, string> = {
    "Annual Inspection": `${aircraft} — Annual inspection due. Aircraft to be inspected in accordance with FAR 43 Appendix D and applicable manufacturer's maintenance data.`,
    "100-Hour Inspection": `${aircraft} — 100-hour inspection required. Engine, airframe, and systems to be inspected per manufacturer's maintenance manual.`,
    "Oil and Filter Change": `${aircraft} — Oil and filter change at scheduled interval. Drain, refill with approved oil, replace filter, inspect for metal contamination.`,
    "Brake System Inspection & Repair": `${aircraft} — Brake system squawk: customer reports increased pedal travel and uneven braking. Inspect calipers, pads, discs, and hydraulic lines.`,
    "Navigation Light Repair": `${aircraft} — Navigation/position lights inoperative or intermittent. Troubleshoot wiring, connectors, and bulbs. Repair to airworthy condition.`,
    "Spark Plug Replacement": `${aircraft} — Scheduled spark plug replacement. Remove all plugs, inspect for wear and fouling, replace with new, gap-check and torque to spec.`,
    "Engine Top Overhaul": `${aircraft} — Engine top overhaul required. Cylinder replacement/overhaul, valve service, piston and ring inspection.`,
    "Airworthiness Directive (AD) Compliance": `${aircraft} — AD compliance required. Review applicable ADs, perform inspections/modifications per AD requirements, update records.`,
  };
  return templates[serviceType] || `${aircraft} — ${serviceType}. Perform inspection and maintenance per applicable manufacturer's data and FAA regulations.`;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PROPS                                                           */
/* ═══════════════════════════════════════════════════════════════ */

interface Props {
  onClose: () => void;
  onCreated?: (woId: string) => void;
}

type Step = "source" | "aircraft" | "squawk" | "review";

/* ═══════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                       */
/* ═══════════════════════════════════════════════════════════════ */

export function CreateWorkOrderModal({ onClose, onCreated }: Props) {
  const { addWorkOrder, addCustomer, updateCustomer, updateEstimate, estimates, customers } = useDataStore();
  const { activeMechanic, team } = useAppContext();

  const [step, setStep] = useState<Step>("source");
  const [source, setSource] = useState<"estimate" | "custom">("custom");
  const [selectedEstimateId, setSelectedEstimateId] = useState<string>("");
  const [lookup, setLookup] = useState<AircraftLookupState>(EMPTY_LOOKUP_STATE);
  const [serviceType, setServiceType] = useState("");
  const [serviceTypeOpen, setServiceTypeOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  // Squawk selection
  const [selectedSquawkIds, setSelectedSquawkIds] = useState<string[]>([]);
  const [showAllSquawks, setShowAllSquawks] = useState(false);
  // Mechanic assignment
  const [assignedMechanic, setAssignedMechanic] = useState(activeMechanic.name);
  const [mechanicDropdownOpen, setMechanicDropdownOpen] = useState(false);

  // Get squawks when on squawk step
  const aircraftSquawks = lookup.nNumber.length >= 4
    ? getSquawksForAircraft(lookup.nNumber).filter(s => s.status !== "Resolved")
    : [];

  // Auto-select all squawks when entering squawk step
  function handleEnterSquawkStep() {
    if (aircraftSquawks.length > 0 && selectedSquawkIds.length === 0) {
      setSelectedSquawkIds(aircraftSquawks.map(s => s.id));
    }
    setStep("squawk");
  }

  // When squawks are toggled, update description
  function toggleSquawk(id: string) {
    setSelectedSquawkIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      // Auto-update description from selected squawks
      const selected = aircraftSquawks.filter(s => next.includes(s.id));
      if (selected.length > 0 && !description) {
        const combined = selected.map(s => `${s.title}: ${s.description}`).join("\n\n");
        setDescription(combined);
      }
      return next;
    });
  }

  const activeEstimates = estimates.filter(
    (e) => e.status === "Approved" && !e.linkedWorkOrder
  );
  const selectedEstimate = estimates.find((e) => e.id === selectedEstimateId);

  /* ── From Estimate: pre-fill aircraft + service ── */
  function applyEstimate(est: Estimate) {
    setSelectedEstimateId(est.id);
    setLookup((prev) => ({
      ...prev,
      nNumber: est.aircraft,
      lookupStatus: "idle",
      customerName: est.customer,
      customerEmail: "",
    }));
    setAssignedMechanic(est.mechanic || activeMechanic.name);
    setServiceType(est.customerNotes ? "Custom / Other" : "");
    setDescription(est.customerNotes || est.assumptions || "");
    setTargetDate(est.validUntil?.split("T")[0] ?? "");
  }

  /* ── AI generate description ── */
  function handleAIGenerate() {
    if (!serviceType) return;
    setIsGenerating(true);
    setTimeout(() => {
      const makeModel = lookup.faaData
        ? `${lookup.faaData.aircraft.manufacturer} ${lookup.faaData.aircraft.model}`
        : "";
      setDescription(generateSquawkSuggestion(serviceType, lookup.nNumber, makeModel));
      setIsGenerating(false);
    }, 1200);
  }

  /* ── Create Work Order ── */
  function handleCreate() {
    setCreating(true);
    setTimeout(() => {
      const faa = lookup.faaData;

      // Ensure customer exists in DataStore
      let custId = lookup.existingCustomerId;
      if (!custId && lookup.customerName) {
        const existing = customers.find(
          (c) => c.name.toLowerCase() === lookup.customerName.toLowerCase()
        );
        if (existing) {
          custId = existing.id;
          // Add aircraft to existing customer if not already there
          if (lookup.nNumber && !existing.aircraft.includes(lookup.nNumber)) {
            updateCustomer(existing.id, {
              aircraft: [...existing.aircraft, lookup.nNumber],
            });
          }
        } else {
          const newCust = addCustomer({
            name: lookup.customerName,
            email: lookup.customerEmail,
            phone: lookup.customerPhone,
            company: "",
            address: faa ? formatRegistrantLocation(faa.registrant) : "",
            aircraft: lookup.nNumber ? [lookup.nNumber] : [],
            totalWorkOrders: 1,
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

      const newWO = addWorkOrder(
        {
          woNumber: `WO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
          serviceType: serviceType || undefined,
          aircraft: lookup.nNumber || "Unknown",
          makeModel: faa ? `${faa.aircraft.manufacturer} ${faa.aircraft.model}` : "",
          serial: faa?.aircraft.serialNumber || "",
          customer: lookup.customerName || lookup.registeredOwner || "Unknown",
          customerId: custId,
          company: selectedEstimate?.company || "",
          mechanic: assignedMechanic,
          assignedMechanicId:
            team.find((member) => member.name === assignedMechanic)?.id,
          assignedMechanics: [assignedMechanic],
          openedDate: new Date().toISOString(),
          targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
          status: "Open",
          progress: 0,
          squawk: description || serviceType,
          discrepancy: description,
          correctiveAction: "",
          findings: "",
          laborLines: selectedEstimate?.laborLines || [],
          partsLines: selectedEstimate?.partsLines || [],
          outsideServices: selectedEstimate?.outsideServices || [],
          activity: [
            {
              id: `act-${Date.now()}`,
              type: "system",
              author: "System",
              content: selectedEstimate
                ? `Work order created from Estimate ${selectedEstimate.estimateNumber}.`
                : `Work order created for ${lookup.nNumber}.`,
              visibility: "internal",
              timestamp: new Date().toISOString(),
            },
          ],
          internalNotes: "",
          customerNotes: "",
          totalLabor: selectedEstimate?.subtotalLabor || 0,
          totalParts: selectedEstimate?.subtotalParts || 0,
          totalOutside: selectedEstimate?.subtotalOutside || 0,
          grandTotal: selectedEstimate?.total || 0,
          linkedEstimate: selectedEstimate?.id,
        },
        {
          onPersisted: (persistedWorkOrder) => {
            if (selectedEstimate) {
              updateEstimate(selectedEstimate.id, {
                status: "Converted",
                linkedWorkOrder: persistedWorkOrder.id,
              });
            }
            onCreated?.(persistedWorkOrder.id);
          },
        }
      );

      if (selectedEstimate) {
        updateEstimate(selectedEstimate.id, {
          status: "Converted",
          linkedWorkOrder: newWO.id,
        });
      }

      setCreating(false);
      setCreated(true);
      onCreated?.(newWO.id);
      setTimeout(onClose, 1200);
    }, 1500);
  }

  const canAdvanceAircraft =
    lookup.nNumber.length >= 4 &&
    (lookup.lookupStatus === "found" ||
      lookup.lookupStatus === "notfound") &&
    lookup.customerName.trim().length > 0;

  const canAdvanceSquawk = !!serviceType && description.trim().length > 0;

  /* ── Step label map ── */
  const STEPS: Step[] = ["source", "aircraft", "squawk", "review"];
  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-[640px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
      >
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-[#0A1628] to-[#1E3A5F] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white text-[15px]" style={{ fontWeight: 700 }}>New Work Order</div>
              <div className="text-white/50 text-[11px]">
                Step {stepIndex + 1} of {STEPS.length} — {
                  step === "source" ? "Choose source" :
                  step === "aircraft" ? "Aircraft & customer" :
                  step === "squawk" ? "Squawk / scope" :
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
            className="h-full bg-primary"
            initial={{ width: "25%" }}
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
                    <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>How would you like to start?</h3>
                    <p className="text-[13px] text-muted-foreground mt-1">Create from an existing approved estimate, or start a fresh custom work order.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* From Estimate */}
                    <button
                      onClick={() => setSource("estimate")}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        source === "estimate"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${source === "estimate" ? "bg-primary/10" : "bg-blue-50"}`}>
                        <FileText className={`w-5 h-5 ${source === "estimate" ? "text-primary" : "text-blue-600"}`} />
                      </div>
                      <div className="text-[14px] text-foreground mb-1" style={{ fontWeight: 700 }}>From Estimate</div>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">
                        Pick an approved estimate and carry aircraft, customer, and scope into the work order automatically.
                      </p>
                      {activeEstimates.length > 0 && (
                        <div className="mt-2 text-[11px] text-primary" style={{ fontWeight: 600 }}>
                          {activeEstimates.length} approved estimate{activeEstimates.length !== 1 ? "s" : ""} ready to convert →
                        </div>
                      )}
                    </button>

                    {/* Custom */}
                    <button
                      onClick={() => setSource("custom")}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        source === "custom"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${source === "custom" ? "bg-primary/10" : "bg-slate-50"}`}>
                        <Wrench className={`w-5 h-5 ${source === "custom" ? "text-primary" : "text-slate-600"}`} />
                      </div>
                      <div className="text-[14px] text-foreground mb-1" style={{ fontWeight: 700 }}>Custom / New</div>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">
                        Enter tail number, look up from FAA registry, add customer, and describe the squawk.
                      </p>
                    </button>
                  </div>

                  {/* Estimate picker */}
                  {source === "estimate" && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                      {activeEstimates.length === 0 ? (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] text-amber-800">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          No approved estimates found. Switch to Custom to create a fresh work order.
                        </div>
                      ) : (
                        <>
                          <label className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>Select Estimate</label>
                          {activeEstimates.map((est) => (
                            <button
                              key={est.id}
                              onClick={() => applyEstimate(est)}
                              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                                selectedEstimateId === est.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${selectedEstimateId === est.id ? "border-primary bg-primary" : "border-border"}`}>
                                  {selectedEstimateId === est.id && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{est.estimateNumber}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                      est.status === "Approved" ? "bg-emerald-100 text-emerald-700" :
                                      est.status === "Sent" ? "bg-blue-100 text-blue-700" :
                                      "bg-slate-100 text-slate-600"
                                    }`} style={{ fontWeight: 600 }}>{est.status}</span>
                                  </div>
                                  <div className="text-[12px] text-muted-foreground">{est.aircraft} · {est.makeModel}</div>
                                  <div className="text-[11px] text-muted-foreground">{est.customer} · ${est.total.toLocaleString()}</div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </>
                      )}
                    </motion.div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setStep("aircraft")}
                      disabled={source === "estimate" && !selectedEstimateId}
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
                      Enter the tail number to look up FAA registry data and confirm the active customer.
                    </p>
                  </div>

                  <AircraftLookupSection
                    value={lookup}
                    onChange={(u) => setLookup((prev) => ({ ...prev, ...u }))}
                    existingCustomers={customers}
                    lockedNNumber={source === "estimate" && !!selectedEstimate}
                  />

                  <div className="flex justify-between pt-2">
                    <button
                      onClick={() => setStep("source")}
                      className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={() => handleEnterSquawkStep()}
                      disabled={!canAdvanceAircraft}
                      className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-all"
                      style={{ fontWeight: 600 }}
                    >
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {!canAdvanceAircraft && lookup.nNumber.length >= 4 && (
                    <p className="text-[11px] text-muted-foreground text-center -mt-2">
                      {!lookup.customerName ? "Enter customer name to continue" : "Complete aircraft lookup to continue"}
                    </p>
                  )}
                </>
              )}

              {/* ── STEP 3: Squawk / Scope ── */}
              {step === "squawk" && (
                <>
                  <div>
                    <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Squawk / Maintenance Scope</h3>
                    <p className="text-[13px] text-muted-foreground mt-1">
                      Describe what needs to be done. Use AI to generate a compliant description from the service type.
                    </p>
                  </div>

                  {/* Open Squawks for this aircraft */}
                  {aircraftSquawks.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>
                          Open Squawks — {lookup.nNumber}
                          <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                            {aircraftSquawks.length} open
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedSquawkIds.length === aircraftSquawks.length) {
                              setSelectedSquawkIds([]);
                              setDescription("");
                            } else {
                              const all = aircraftSquawks.map(s => s.id);
                              setSelectedSquawkIds(all);
                              const combined = aircraftSquawks.map(s => s.title + ": " + s.description).join("\n\n");
                              setDescription(combined);
                            }
                          }}
                          className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                          style={{ fontWeight: 600 }}
                        >
                          {selectedSquawkIds.length === aircraftSquawks.length ? "Deselect all" : "Select all"}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {aircraftSquawks.map((sq) => {
                          const checked = selectedSquawkIds.includes(sq.id);
                          const sevColors: Record<string, string> = { Low: "bg-slate-100 text-slate-600", Medium: "bg-amber-100 text-amber-700", High: "bg-orange-100 text-orange-700", Critical: "bg-red-100 text-red-700" };
                          return (
                            <button
                              key={sq.id}
                              type="button"
                              onClick={() => {
                                toggleSquawk(sq.id);
                                if (!checked) {
                                  // Add to description
                                  setDescription(prev => {
                                    const line = sq.title + ": " + sq.description;
                                    return prev ? prev + "\n\n" + line : line;
                                  });
                                } else {
                                  // Remove from description
                                  const line = sq.title + ": " + sq.description;
                                  setDescription(prev => prev.replace(line, "").replace(/\n\n\n+/g, "\n\n").trim());
                                }
                              }}
                              className={`w-full text-left p-3 rounded-xl border-2 transition-all ${checked ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/20 bg-white"}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <div className={`mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center ${checked ? "bg-primary border-primary" : "border-2 border-muted-foreground/30"}`}>
                                  {checked && <CheckCircle className="w-3 h-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{sq.title}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${sevColors[sq.severity] || "bg-slate-100 text-slate-600"}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground truncate">{sq.category} · {sq.date}</div>
                                </div>
                                {checked && (
                                  <span className="shrink-0 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>→ Resolved</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {selectedSquawkIds.length > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                          <CheckCircle className="w-3 h-3" />
                          {selectedSquawkIds.length} squawk{selectedSquawkIds.length !== 1 ? "s" : ""} will be marked Resolved when WO is created
                        </div>
                      )}
                    </div>
                  )}

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
                            transition={{ duration: 0.1 }}
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

                  {/* Description */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>
                        Squawk Description <span className="text-destructive">*</span>
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
                            isRecording
                              ? "bg-destructive/10 border-destructive/30 text-destructive"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                          style={{ fontWeight: 500 }}
                        >
                          {isRecording ? <><MicOff className="w-3 h-3" /> Stop</> : <><Mic className="w-3 h-3" /> Dictate</>}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      placeholder="Describe the squawk or maintenance scope. AI can expand this into a full description based on the service type."
                      className="w-full border border-border rounded-xl px-3.5 py-3 text-[13px] outline-none resize-none focus:border-primary/40 transition-colors leading-relaxed"
                    />
                    {isRecording && (
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-destructive">
                        <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        Recording… speak the squawk or maintenance description
                      </div>
                    )}
                  </div>

                  {/* Target date + mechanic */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>
                        Target Completion Date
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          type="date"
                          value={targetDate}
                          onChange={(e) => setTargetDate(e.target.value)}
                          className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>
                        Assigned Mechanic
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMechanicDropdownOpen((o) => !o)}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 border rounded-xl text-[13px] text-left transition-all ${
                            mechanicDropdownOpen ? "border-primary/40 bg-primary/3" : "border-border hover:border-primary/30"
                          }`}
                        >
                          <span className={assignedMechanic ? "text-foreground" : "text-muted-foreground/60"} style={{ fontWeight: assignedMechanic ? 500 : 400 }}>
                            {assignedMechanic || "Select mechanic…"}
                          </span>
                          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${mechanicDropdownOpen ? "rotate-90" : ""}`} />
                        </button>
                        <AnimatePresence>
                          {mechanicDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.1 }}
                              className="absolute left-0 right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto"
                            >
                              {team.map((m) => (
                                <button
                                  key={m.name}
                                  onClick={() => { setAssignedMechanic(m.name); setMechanicDropdownOpen(false); }}
                                  className={`w-full px-4 py-2.5 text-left text-[13px] hover:bg-muted/40 transition-colors flex items-center justify-between ${
                                    assignedMechanic === m.name ? "bg-primary/8 text-primary" : "text-foreground"
                                  }`}
                                  style={{ fontWeight: assignedMechanic === m.name ? 600 : 400 }}
                                >
                                  {m.name}
                                  {assignedMechanic === m.name && <CheckCircle className="w-3.5 h-3.5" />}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
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
                      onClick={() => setStep("review")}
                      disabled={!canAdvanceSquawk}
                      className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-all"
                      style={{ fontWeight: 600 }}
                    >
                      Review <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}

              {/* ── STEP 4: Review + Create ── */}
              {step === "review" && (
                <>
                  <div>
                    <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Review Work Order</h3>
                    <p className="text-[13px] text-muted-foreground mt-1">Everything looks correct? Create the work order to open it.</p>
                  </div>

                  <div className="space-y-3">
                    {/* Aircraft */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2.5" style={{ fontWeight: 700 }}>Aircraft</div>
                      <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>{lookup.nNumber}</div>
                      {lookup.faaData && (
                        <div className="text-[13px] text-muted-foreground">
                          {lookup.faaData.aircraft.manufacturer} {lookup.faaData.aircraft.model} · S/N {lookup.faaData.aircraft.serialNumber}
                        </div>
                      )}
                    </div>

                    {/* Customer */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2.5" style={{ fontWeight: 700 }}>Active Customer</div>
                      <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{lookup.customerName}</div>
                      {lookup.customerEmail && <div className="text-[12px] text-muted-foreground">{lookup.customerEmail}</div>}
                      {lookup.customerPhone && <div className="text-[12px] text-muted-foreground">{lookup.customerPhone}</div>}
                      {lookup.existingCustomerId && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                          <CheckCircle className="w-2.5 h-2.5" /> Existing customer
                        </span>
                      )}
                    </div>

                    {/* Scope */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2.5" style={{ fontWeight: 700 }}>Service Type & Squawk</div>
                      <div className="text-[13px] text-foreground mb-2" style={{ fontWeight: 600 }}>{serviceType}</div>
                      <div className="text-[12px] text-muted-foreground leading-relaxed line-clamp-3">{description}</div>
                    </div>

                    {/* From estimate badge */}
                    {selectedEstimate && (
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="text-[12px] text-blue-800" style={{ fontWeight: 600 }}>
                          From Estimate {selectedEstimate.estimateNumber} · ${selectedEstimate.total.toLocaleString()} scoped
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-2">
                    <button
                      onClick={() => setStep("squawk")}
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
                        <><CheckCircle className="w-4 h-4" /> Work Order Created!</>
                      ) : (
                        <><ClipboardList className="w-4 h-4" /> Create Work Order</>
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
