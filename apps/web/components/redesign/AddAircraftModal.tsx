"use client";

import { useState } from "react";
import { Plane, Search, CheckCircle, X, Sparkles, ChevronRight, AlertCircle, Shield, UserPlus, Mail, Phone, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { lookupAircraftByNNumber, FaaLookupResult } from "./faaRegistryService";
import { useDataStore } from "./workspace/DataStore";
import { createAircraftRecord } from "@/lib/aircraft/client";
import {
  formatCertificateStatus,
  formatHorsepower,
  formatRegistrantLocation,
  formatRegistrantSummary,
  formatTbo,
} from "./faaDisplay";

interface AddAircraftModalProps {
  onClose: () => void;
  onAdd?: (data: any) => void;
}

type FoundFaaResult = Extract<FaaLookupResult, { found: true }>;

const OPERATION_TYPES = [
  { id: "part91",      label: "Part 91",          desc: "Private / non-commercial" },
  { id: "part135",     label: "Part 135",          desc: "On-demand charter / air taxi" },
  { id: "part141",     label: "Part 141",          desc: "Certificated flight school" },
  { id: "part61",      label: "Part 61",           desc: "Non-certificated training" },
  { id: "flightschool",label: "Flight School",     desc: "Aviation training operation" },
  { id: "charter",     label: "Charter",           desc: "Commercial charter service" },
  { id: "private",     label: "Private Owner",     desc: "Personal / family use" },
  { id: "lease",       label: "Lease / Managed",   desc: "Aircraft management or lease" },
  { id: "corporate",   label: "Corporate",         desc: "Business / executive transport" },
  { id: "maintenance", label: "Maintenance Shop",  desc: "Shop-managed / in-service" },
];

const OP_IMPACTS: Record<string, string> = {
  part135:     "Adds 100-hr mandatory checks, Part 135 certificate tracking, and charter compliance reminders.",
  part141:     "Adds training-specific reminders, student/instructor role assignments, and curriculum categories.",
  charter:     "Adds charter compliance, manifest tracking, and operations certificate document categories.",
  corporate:   "Adds corporate flight department documents and executive operations compliance.",
  maintenance: "Enables MRO document set, shop-priority work order queues, and maintenance compliance tracking.",
  flightschool:"Adds hobbs-tracked training reminders, student flight records, and instructor assignment roles.",
};

const STEP_LABELS = ["Tail Number", "Confirm Aircraft", "Operation Type", "Aircraft Times", "Review & Add"];

export function AddAircraftModal({ onClose, onAdd }: AddAircraftModalProps) {
  const { customers, addCustomer, updateCustomer, refreshAircraft } = useDataStore();
  const [step, setStep] = useState(1);
  const [tailNumber, setTailNumber] = useState("");
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "notfound">("idle");
  const [lookupError, setLookupError] = useState("");
  const [faaData, setFaaData] = useState<FoundFaaResult | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [overrideFields, setOverrideFields] = useState<Record<string, string>>({});
  const [selectedOps, setSelectedOps] = useState<string[]>([]);
  const [hobbs, setHobbs] = useState("");
  const [tach, setTach] = useState("");
  const [ttaf, setTtaf] = useState("");
  const [basedAt, setBasedAt] = useState("");
  // Active Customer — distinct from FAA registrant (handles leased aircraft)
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerInviteSent, setCustomerInviteSent] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [saveError, setSaveError] = useState("");

  const doLookup = async () => {
    if (tailNumber.trim().length < 3) return;
    setLookupState("loading");
    const result = await lookupAircraftByNNumber(tailNumber.trim());
    if (result.found) {
      setFaaData(result);
      setLookupState("found");
      setLookupError("");
      // Auto-fill active customer from registrant (user can override for leased aircraft)
      if (!customerName) setCustomerName(result.registrant.name);
    } else {
      setFaaData(null);
      setLookupState("notfound");
      setLookupError(result.error ?? "");
    }
  };

  const toggleOp = (id: string) =>
    setSelectedOps((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleAdd = async () => {
    setAdding(true);
    setSaveError("");
    try {
      // Persist customer in DataStore if name is provided
      if (customerName) {
        const existing = customers.find(
          (c) => c.name.toLowerCase() === customerName.toLowerCase()
        );
        if (existing) {
          // Add this aircraft to the existing customer if not already there
          if (tailNumber && !existing.aircraft.includes(tailNumber)) {
            updateCustomer(existing.id, {
              aircraft: [...existing.aircraft, tailNumber],
              lastService: new Date().toISOString(),
            });
          }
        } else {
          // Create new customer
          addCustomer({
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
            company: "",
            address: faaData
              ? formatRegistrantLocation(faaData.registrant)
              : "",
            aircraft: tailNumber ? [tailNumber] : [],
            totalWorkOrders: 0,
            openInvoices: 0,
            totalBilled: 0,
            outstandingBalance: 0,
            lastService: new Date().toISOString(),
            preferredContact: "Email",
            notes: "",
            tags: ["New Customer"],
          });
        }
      }

      const normalizedTail = tailNumber.trim().toUpperCase();
      const createdAircraft = await createAircraftRecord({
        tail_number: normalizedTail,
        make: (overrideFields.make ?? faaData?.aircraft.manufacturer ?? "").trim(),
        model: (overrideFields.model ?? faaData?.aircraft.model ?? "").trim(),
        year: Number.parseInt(overrideFields.year ?? `${faaData?.aircraft.year ?? ""}`, 10) || undefined,
        serial_number: (overrideFields.serial ?? faaData?.aircraft.serialNumber ?? "").trim() || undefined,
        engine_make:
          (overrideFields.engine?.trim().split(/\s+/).shift() ?? faaData?.engine.manufacturer ?? "").trim() || undefined,
        engine_model:
          (overrideFields.engine
            ? overrideFields.engine.trim().split(/\s+/).slice(1).join(" ")
            : faaData?.engine.model ?? ""
          ).trim() || undefined,
        base_airport: basedAt.trim() || undefined,
        operator_name: customerName.trim() || undefined,
        operation_types: selectedOps,
        notes: [
          ttaf.trim() ? `TTAF: ${ttaf.trim()}` : null,
          hobbs.trim() ? `Hobbs: ${hobbs.trim()}` : null,
          tach.trim() ? `Tach: ${tach.trim()}` : null,
        ].filter(Boolean).join(" | ") || undefined,
      });
      await refreshAircraft();
      setAdding(false);
      setAdded(true);
      setTimeout(() => {
        onAdd?.({
          tail: normalizedTail,
          faaData,
          selectedOps,
          hobbs,
          tach,
          basedAt,
          customerName,
          customerEmail,
          aircraft: createdAircraft,
        });
        onClose();
      }, 1200);
    } catch (error) {
      setAdding(false);
      setSaveError(error instanceof Error ? error.message : "Failed to add aircraft");
    }
  };

  const canProceed =
    step === 1 ? tailNumber.trim().length >= 3 && (lookupState === "found" || lookupState === "notfound") :
    step === 3 ? selectedOps.length > 0 :
    step === 4 ? hobbs.trim() !== "" && tach.trim() !== "" :
    true;

  const activeImpacts = selectedOps.filter((op) => OP_IMPACTS[op]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-[#0A1628] px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white text-[15px]" style={{ fontWeight: 700 }}>Add Aircraft</div>
              <div className="text-white/50 text-[12px]">Step {step} of 5 — {STEP_LABELS[step - 1]}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex shrink-0">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className={`flex-1 h-1 transition-all duration-300 ${s <= step ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-7">
          <AnimatePresence mode="wait">

            {/* ── Step 1: Tail number ── */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="flex flex-col min-h-[360px]">
                <h2 className="text-[20px] text-foreground mb-1" style={{ fontWeight: 700 }}>Enter Tail Number</h2>
                <p className="text-[13px] text-muted-foreground mb-7">We'll look up your aircraft in the FAA civil aircraft registry automatically.</p>
                <div className="flex gap-3 mb-4">
                  <input
                    type="text"
                    value={tailNumber}
                    onChange={(e) => { setTailNumber(e.target.value.toUpperCase()); setLookupState("idle"); setFaaData(null); setLookupError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && doLookup()}
                    placeholder="N12345"
                    className="flex-1 border-2 border-border rounded-xl px-5 py-3.5 text-[24px] tracking-widest outline-none focus:border-primary transition-all uppercase font-mono"
                    style={{ fontWeight: 700, letterSpacing: "0.1em" }}
                    autoFocus
                  />
                  <button
                    onClick={doLookup}
                    disabled={tailNumber.trim().length < 3 || lookupState === "loading"}
                    className="flex items-center gap-2 bg-primary text-white px-6 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-50 transition-all shrink-0"
                    style={{ fontWeight: 600 }}
                  >
                    {lookupState === "loading" ? (
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Looking up</>
                    ) : (
                      <><Search className="w-4 h-4" /> Look Up FAA</>
                    )}
                  </button>
                </div>

                <AnimatePresence>
                  {lookupState === "found" && faaData && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[13px] text-emerald-900" style={{ fontWeight: 700 }}>Aircraft found in FAA registry</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${faaData.source === "live" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`} style={{ fontWeight: 600 }}>
                            {faaData.source === "live" ? "Live FAA API" : "Saved profile"}
                          </span>
                        </div>
                        <div className="text-[13px] text-emerald-800 mt-0.5">
                          {faaData.aircraft.year} {faaData.aircraft.manufacturer} {faaData.aircraft.model} &middot; S/N {faaData.aircraft.serialNumber}
                        </div>
                        <div className="text-[12px] text-emerald-700">
                          {faaData.engine.manufacturer} {faaData.engine.model} &middot; {faaData.aircraft.aircraftType}
                        </div>
                        <div className="text-[12px] text-emerald-600 mt-0.5">
                          Registrant: {faaData.registrant.name} · {formatRegistrantLocation(faaData.registrant)}
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {lookupState === "notfound" && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[13px] text-amber-800" style={{ fontWeight: 600 }}>Aircraft not found in FAA registry</div>
                        <div className="text-[12px] text-amber-700 mt-0.5">
                          {/unavailable|unreachable|timed out|returned 4|returned 5/i.test(lookupError)
                            ? "The live FAA registry service is temporarily unavailable. You can retry, or continue and enter details manually."
                            : "The FAA registry did not return a match for this tail number. Continue to enter details manually."}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-auto pt-4">
                  <button onClick={() => { setManualMode(true); setLookupState("notfound"); }}
                    className="text-[12px] text-primary underline decoration-dotted">
                    Can't find your aircraft? Enter details manually
                  </button>
                </div>

                {saveError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
                    {saveError}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Step 2: Confirm aircraft ── */}
            {step === 2 && (() => {
              const fields = [
                { label: "Registration", key: "tail",     value: tailNumber,                                               readOnly: true },
                { label: "Make",         key: "make",     value: overrideFields.make    ?? (faaData?.aircraft.manufacturer || "") },
                { label: "Model",        key: "model",    value: overrideFields.model   ?? (faaData?.aircraft.model || "") },
                { label: "Year",         key: "year",     value: overrideFields.year    ?? (faaData ? String(faaData.aircraft.year) : "") },
                { label: "Serial #",     key: "serial",   value: overrideFields.serial  ?? (faaData?.aircraft.serialNumber || "") },
                { label: "Engine",       key: "engine",   value: overrideFields.engine  ?? (faaData ? `${faaData.engine.manufacturer} ${faaData.engine.model}` : "") },
                { label: "Aircraft Type",key: "category", value: overrideFields.category ?? (faaData?.aircraft.aircraftType || "") },
                { label: "Cert Status",  key: "status",   value: formatCertificateStatus(faaData?.certificate),          readOnly: true },
              ];
              return (
                <motion.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                  <h2 className="text-[20px] text-foreground mb-1" style={{ fontWeight: 700 }}>Confirm Aircraft Details</h2>
                  <p className="text-[13px] text-muted-foreground mb-5">Review the FAA data. Edit any field that needs correcting.</p>
                  <div className="grid grid-cols-2 gap-4">
                    {fields.map((f) => (
                      <div key={f.label}>
                        <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wider" style={{ fontWeight: 600 }}>{f.label}</label>
                        <input
                          type="text"
                          defaultValue={f.value}
                          readOnly={f.readOnly}
                          onChange={(e) => !f.readOnly && setOverrideFields((p) => ({ ...p, [f.key]: e.target.value }))}
                          className={`w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 transition-all ${f.readOnly ? "bg-muted/30 text-muted-foreground" : ""}`}
                        />
                      </div>
                    ))}
                  </div>
                  {faaData && (
                    <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3.5">
                      <div className="text-[11px] text-blue-700 mb-1.5 uppercase tracking-wider" style={{ fontWeight: 700 }}>Additional FAA Details</div>
                      <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
                        {[
                          { label: "Seats",       value: String(faaData.aircraft.seats) },
                          { label: "Max Weight",  value: faaData.aircraft.maxWeight },
                          { label: "Cruise Speed",value: faaData.aircraft.cruiseSpeed || "N/A" },
                          { label: "HP",          value: formatHorsepower(faaData.engine) },
                          { label: "TBO",         value: formatTbo(faaData.engine) },
                          { label: "Propeller",   value: faaData.propeller || "N/A" },
                          { label: "Registrant",  value: faaData.registrant.name },
                          { label: "City/State",  value: formatRegistrantLocation(faaData.registrant) },
                          { label: "Reg. Type",   value: faaData.registrant.type },
                        ].map((row) => (
                          <div key={row.label}>
                            <div className="text-[10px] text-blue-600/70 uppercase tracking-wider" style={{ fontWeight: 600 }}>{row.label}</div>
                            <div className="text-[12px] text-blue-900" style={{ fontWeight: 500 }}>{row.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })()}

            {/* ── Step 3: Operation type ── */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="flex flex-col min-h-[360px]">
                <h2 className="text-[20px] text-foreground mb-1" style={{ fontWeight: 700 }}>Operation Type</h2>
                <p className="text-[13px] text-muted-foreground mb-5">Select all that apply. This configures your reminders, documents, and role assignments automatically.</p>
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  {OPERATION_TYPES.map((op) => {
                    const sel = selectedOps.includes(op.id);
                    return (
                      <button
                        key={op.id}
                        onClick={() => toggleOp(op.id)}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${sel ? "border-primary bg-primary/5 shadow-sm shadow-primary/10" : "border-border hover:border-primary/30 bg-white"}`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${sel ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                          {sel && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <div>
                          <div className="text-[13px] text-foreground" style={{ fontWeight: sel ? 600 : 500 }}>{op.label}</div>
                          <div className="text-[11px] text-muted-foreground">{op.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {activeImpacts.length > 0 && (
                  <div className="mt-auto bg-primary/5 border border-primary/15 rounded-xl p-4">
                    <div className="text-[12px] text-primary mb-2 flex items-center gap-1.5" style={{ fontWeight: 700 }}>
                      <Sparkles className="w-3.5 h-3.5" /> AI-powered setup changes applied:
                    </div>
                    {activeImpacts.map((op) => (
                      <div key={op} className="text-[12px] text-primary/80 leading-relaxed">&bull; {OP_IMPACTS[op]}</div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Step 4: Times + Active Customer ── */}
            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <h2 className="text-[20px] text-foreground mb-1" style={{ fontWeight: 700 }}>Aircraft Times</h2>
                <p className="text-[13px] text-muted-foreground mb-5">Enter current Hobbs and Tach readings. These drive all time-based reminders.</p>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    { label: "Hobbs Hours",    placeholder: "3847.2", value: hobbs, set: setHobbs, required: true },
                    { label: "Tach Hours",     placeholder: "3821.5", value: tach,  set: setTach,  required: true },
                    { label: "TTAF (optional)",placeholder: "3847",   value: ttaf,  set: setTtaf,  required: false },
                  ].map((f) => (
                    <div key={f.label}>
                      <label className="block text-[12px] text-foreground mb-2" style={{ fontWeight: 600 }}>
                        {f.label}{f.required && <span className="text-primary ml-0.5">*</span>}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder={f.placeholder}
                        value={f.value}
                        onChange={(e) => f.set(e.target.value)}
                        className="w-full border-2 border-border rounded-xl px-4 py-3 text-[20px] outline-none focus:border-primary transition-all"
                        style={{ fontWeight: 700 }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mb-5">
                  <label className="block text-[12px] text-foreground mb-2" style={{ fontWeight: 600 }}>Based At (Airport)</label>
                  <input
                    type="text"
                    placeholder="e.g. KAUS — Austin-Bergstrom Intl"
                    value={basedAt}
                    onChange={(e) => setBasedAt(e.target.value)}
                    className="w-full border border-border rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                {/* Divider */}
                <div className="border-t border-border my-5" />

                {/* FAA Registered Owner (read-only) */}
                {faaData && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-slate-500" />
                      <span className="text-[12px] text-slate-700" style={{ fontWeight: 700 }}>FAA Registered Owner</span>
                      <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>
                        Read-only · Registry data
                      </span>
                    </div>
                    <div className="text-[13px] text-slate-800" style={{ fontWeight: 600 }}>{faaData.registrant.name}</div>
                    <div className="text-[12px] text-slate-500">{formatRegistrantSummary(faaData.registrant)}</div>
                  </div>
                )}

                {/* Active Customer (who is paying / managing this aircraft) */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <UserPlus className="w-4 h-4 text-primary" />
                    <label className="text-[12px] text-foreground" style={{ fontWeight: 700 }}>Active Customer</label>
                    <span className="text-[11px] text-muted-foreground">(may differ from FAA registrant if leased)</span>
                  </div>
                  {faaData && customerName === faaData.registrant.name && (
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Auto-filled from FAA registrant — update if aircraft is leased or managed by another party
                    </p>
                  )}
                  <div className="space-y-2.5">
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Customer or company name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          type="email"
                          placeholder="Email address"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
                        />
                      </div>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          type="tel"
                          placeholder="Phone number"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
                        />
                      </div>
                    </div>
                    {customerEmail && (
                      <button
                        type="button"
                        onClick={() => setCustomerInviteSent(true)}
                        disabled={customerInviteSent}
                        className={`flex items-center gap-2 text-[12px] px-3.5 py-2 rounded-lg border transition-all ${
                          customerInviteSent
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "border-primary/30 text-primary hover:bg-primary/5"
                        }`}
                        style={{ fontWeight: 500 }}
                      >
                        {customerInviteSent ? (
                          <><CheckCircle className="w-3.5 h-3.5" /> Invite sent to {customerEmail}</>
                        ) : (
                          <><UserPlus className="w-3.5 h-3.5" /> Invite to myaircraft.us portal <span className="text-muted-foreground">(optional)</span></>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Step 5: Review & Confirm ── */}
            {step === 5 && (
              <motion.div key="s5" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="flex flex-col min-h-[360px]">
                {added ? (
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 10 }}
                      className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                      <CheckCircle className="w-10 h-10 text-emerald-600" />
                    </motion.div>
                    <div className="text-[20px] text-foreground mb-1.5" style={{ fontWeight: 700 }}>Aircraft Added Successfully</div>
                    <div className="text-[13px] text-muted-foreground text-center max-w-xs">
                      {tailNumber} has been added to your fleet. AI is generating your reminder templates and document structure.
                    </div>
                    {customerName && (
                      <div className="mt-3 text-[12px] text-emerald-600">
                        <CheckCircle className="w-3.5 h-3.5 inline mr-1.5" />
                        Customer "{customerName}" saved to system
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-2 text-[12px] text-primary/80">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      Setting up {selectedOps.length} operation type{selectedOps.length > 1 ? "s" : ""}...
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="text-[20px] text-foreground mb-1" style={{ fontWeight: 700 }}>Review & Confirm</h2>
                    <p className="text-[13px] text-muted-foreground mb-5">Everything looks right? Add this aircraft to your platform.</p>
                    <div className="bg-[#F7F8FA] rounded-xl border border-border p-5 space-y-3 mb-5">
                      {[
                        { label: "Registration",    value: tailNumber },
                        { label: "Aircraft",        value: faaData ? `${faaData.aircraft.year} ${faaData.aircraft.manufacturer} ${faaData.aircraft.model}` : tailNumber },
                        { label: "Engine",          value: faaData ? `${faaData.engine.manufacturer} ${faaData.engine.model}` : "—" },
                        { label: "Serial Number",   value: faaData?.aircraft.serialNumber || "—" },
                        { label: "Operation Type",  value: selectedOps.map((op) => OPERATION_TYPES.find((o) => o.id === op)?.label).join(", ") || "—" },
                        { label: "Hobbs",           value: hobbs ? `${hobbs} hrs` : "—" },
                        { label: "Tach",            value: tach  ? `${tach} hrs`  : "—" },
                        { label: "Based At",        value: basedAt || "Not specified" },
                        ...(customerName ? [{ label: "Active Customer", value: customerName }] : []),
                        ...(faaData && faaData.registrant.name !== customerName ? [{ label: "FAA Registrant", value: faaData.registrant.name }] : []),
                      ].map((row) => (
                        <div key={row.label} className="flex justify-between text-[13px]">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className="text-foreground" style={{ fontWeight: 600 }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                      <div className="text-[12px] text-primary/90 leading-relaxed">
                        <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-primary" />
                        <strong className="text-primary">AI will automatically</strong> generate reminder templates, adaptive document categories, role suggestions, and intelligence modules based on your operation type and aircraft data.
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        {!added && (
          <div className="px-7 pb-6 flex items-center justify-between border-t border-border pt-5 shrink-0">
            <button
              onClick={() => step > 1 ? setStep(step - 1) : onClose()}
              className="px-5 py-2.5 rounded-xl border border-border text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors"
              style={{ fontWeight: 500 }}
            >
              {step > 1 ? "← Back" : "Cancel"}
            </button>
            <div className="flex items-center gap-2">
              {step < 5 && (
                <span className="text-[12px] text-muted-foreground">
                  {!canProceed && step === 1 && "Enter and look up a tail number to continue"}
                  {!canProceed && step === 3 && "Select at least one operation type"}
                  {!canProceed && step === 4 && "Hobbs and Tach are required"}
                </span>
              )}
              {step === 5 && saveError && (
                <span className="text-[12px] text-red-600">{saveError}</span>
              )}
              <button
                onClick={() => step < 5 ? setStep(step + 1) : handleAdd()}
                disabled={!canProceed || adding}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-all"
                style={{ fontWeight: 600 }}
              >
                {adding ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Adding Aircraft...</>
                ) : step === 5 ? (
                  <><CheckCircle className="w-4 h-4" /> Add Aircraft</>
                ) : (
                  <>Continue <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
