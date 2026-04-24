"use client";

import { useState } from "react";
import {
  Plane, X, Search, Loader2, AlertTriangle, ShieldCheck, ChevronRight,
  User, Building2, Mail, Phone, CheckCircle, Send,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { lookupAircraftByNNumber } from "../faaRegistryService";
import { formatHorsepower, formatRegistrantLocation } from "../faaDisplay";
import { createAircraftRecord } from "@/lib/aircraft/client";
import { useDataStore } from "../workspace/DataStore";
import type { FoundFaaResult } from "./types";
import { isFaaTemporarilyUnavailable } from "./helpers";

type AssignedAircraft = { tail: string };

type CustomerLite = {
  id: string;
  name: string;
  aircraft?: string[];
  company?: string;
  email?: string;
  phone?: string;
};

export interface AddAircraftModalProps {
  onClose: () => void;
  assignedAircraft: ReadonlyArray<AssignedAircraft>;
  customersData: ReadonlyArray<CustomerLite>;
  tailToCustomerId: Readonly<Record<string, string>>;
  onNavigateToAircraft: (tail: string) => void;
}

type Step = "tail" | "searching" | "faa-result" | "customer" | "done";

export function AddAircraftModal({
  onClose,
  assignedAircraft,
  customersData,
  tailToCustomerId,
  onNavigateToAircraft,
}: AddAircraftModalProps) {
  const { addCustomer, updateCustomer, refreshAircraft } = useDataStore();

  const [addAcTail, setAddAcTail] = useState("");
  const [addAcStep, setAddAcStep] = useState<Step>("tail");
  const [addAcFaaData, setAddAcFaaData] = useState<FoundFaaResult | null>(null);
  const [addAcInFleet, setAddAcInFleet] = useState(false);
  const [addAcFaaNotFound, setAddAcFaaNotFound] = useState(false);
  const [addAcFaaError, setAddAcFaaError] = useState<string | null>(null);
  const [addAcExistingCustomer, setAddAcExistingCustomer] = useState<CustomerLite | null>(null);
  const [addAcNewName, setAddAcNewName] = useState("");
  const [addAcNewEmail, setAddAcNewEmail] = useState("");
  const [addAcNewPhone, setAddAcNewPhone] = useState("");
  const [addAcInvited, setAddAcInvited] = useState(false);
  const [addAcSaving, setAddAcSaving] = useState(false);
  const [addAcSaveError, setAddAcSaveError] = useState<string | null>(null);

  const tailNorm = addAcTail.toUpperCase().trim();

  const handleAddAcLookup = async () => {
    const normalized = addAcTail.toUpperCase().trim();
    if (!normalized) return;
    setAddAcStep("searching");
    setAddAcFaaError(null);
    const inFleet = assignedAircraft.some((a) => a.tail === normalized);
    if (inFleet) {
      setAddAcInFleet(true);
      setAddAcFaaNotFound(false);
      setAddAcFaaData(null);
      setAddAcStep("faa-result");
      return;
    }
    const result = await lookupAircraftByNNumber(normalized);
    setAddAcInFleet(false);
    if (result.found) {
      setAddAcFaaNotFound(false);
      setAddAcFaaError(null);
      setAddAcFaaData(result);
    } else {
      setAddAcFaaError(result.error ?? null);
      setAddAcFaaNotFound(!result.error);
      setAddAcFaaData(null);
    }
    setAddAcStep("faa-result");
  };

  const handleAddAcContinueToCustomer = () => {
    const normalized = addAcTail.toUpperCase().trim();
    const custId = tailToCustomerId[normalized];
    const existingCust = custId ? customersData.find((c) => c.id === custId) ?? null : null;
    setAddAcExistingCustomer(existingCust);
    setAddAcStep("customer");
  };

  const handleConfirmAddAircraft = async (inviteCustomer: boolean) => {
    const normalized = addAcTail.toUpperCase().trim();
    if (!normalized) return;

    setAddAcSaving(true);
    setAddAcSaveError(null);

    try {
      let activeCustomerName = addAcExistingCustomer?.name ?? "";

      if (addAcExistingCustomer?.id) {
        if (!addAcExistingCustomer.aircraft?.includes(normalized)) {
          updateCustomer(addAcExistingCustomer.id, {
            aircraft: [...(addAcExistingCustomer.aircraft ?? []), normalized],
            lastService: new Date().toISOString(),
          });
        }
      } else if (addAcNewName.trim()) {
        activeCustomerName = addAcNewName.trim();
        const newCustomer = addCustomer({
          name: addAcNewName.trim(),
          email: addAcNewEmail.trim(),
          phone: addAcNewPhone.trim(),
          company: "",
          address: addAcFaaData ? formatRegistrantLocation(addAcFaaData.registrant) : "",
          aircraft: [normalized],
          totalWorkOrders: 0,
          openInvoices: 0,
          totalBilled: 0,
          outstandingBalance: 0,
          lastService: new Date().toISOString(),
          preferredContact: "Email",
          notes: "",
          tags: ["New Customer"],
        });
        if (newCustomer?.id) {
          setAddAcExistingCustomer(newCustomer);
        }
      }

      await createAircraftRecord({
        tail_number: normalized,
        make: (addAcFaaData?.aircraft.manufacturer ?? "").trim(),
        model: (addAcFaaData?.aircraft.model ?? "").trim(),
        year: addAcFaaData?.aircraft.year ?? undefined,
        serial_number: addAcFaaData?.aircraft.serialNumber?.trim() || undefined,
        engine_make: addAcFaaData?.engine.manufacturer?.trim() || undefined,
        engine_model: addAcFaaData?.engine.model?.trim() || undefined,
        operator_name: activeCustomerName || undefined,
      });
      await refreshAircraft();
      if (inviteCustomer && addAcNewEmail.trim()) {
        setAddAcInvited(true);
      }
      setAddAcSaving(false);
      setAddAcStep("done");
      onNavigateToAircraft(normalized);
      toast.success(`${normalized} added to fleet`);
    } catch (error) {
      setAddAcSaving(false);
      setAddAcSaveError(error instanceof Error ? error.message : "Failed to add aircraft");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[500px] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Plane className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>Add Aircraft</div>
              <div className="text-[11px] text-muted-foreground">
                {addAcStep === "tail" && "Enter the N-number to look up"}
                {addAcStep === "searching" && "Searching FAA Registry…"}
                {addAcStep === "faa-result" && (addAcInFleet ? "Already in your fleet" : addAcFaaNotFound ? "Aircraft not found" : "Aircraft found")}
                {addAcStep === "customer" && (addAcExistingCustomer ? "Customer matched" : "Add a customer")}
                {addAcStep === "done" && "Aircraft added"}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-1.5 px-6 pt-4 pb-0">
          {(["tail", "faa-result", "customer", "done"] as const).map((s, i) => (
            <div key={s} className={`h-1 rounded-full flex-1 transition-all ${
              addAcStep === "done" ? "bg-primary"
              : addAcStep === "customer" && i <= 2 ? "bg-primary"
              : addAcStep === "faa-result" && i <= 1 ? "bg-primary"
              : (addAcStep === "tail" || addAcStep === "searching") && i === 0 ? "bg-primary"
              : "bg-muted"
            }`} />
          ))}
        </div>

        <div className="px-6 py-5">
          <AnimatePresence mode="wait">

            {/* Step 1: Enter tail */}
            {addAcStep === "tail" && (
              <motion.div key="tail" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                <p className="text-[13px] text-muted-foreground mb-4">Enter the aircraft's FAA registration N-number. We'll look it up in the FAA registry and pull aircraft details automatically.</p>
                <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>N-Number <span className="text-red-500">*</span></label>
                <input
                  value={addAcTail}
                  onChange={(e) => setAddAcTail(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleAddAcLookup()}
                  placeholder="e.g. N45678"
                  className="w-full border border-border rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 tracking-widest"
                  style={{ fontWeight: 600, letterSpacing: "0.08em" }}
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground mt-2">Try: N45678 (customer match), N55200, N88321, N73041</p>
                <div className="flex justify-end mt-5">
                  <button onClick={handleAddAcLookup} disabled={!addAcTail.trim()}
                    className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
                    <Search className="w-3.5 h-3.5" /> Look Up
                  </button>
                </div>
              </motion.div>
            )}

            {/* Searching */}
            {addAcStep === "searching" && (
              <motion.div key="searching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-10 gap-4">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <div>
                  <div className="text-[14px] text-foreground text-center" style={{ fontWeight: 600 }}>Searching FAA Registry</div>
                  <div className="text-[12px] text-muted-foreground text-center mt-1">Looking up {tailNorm || addAcTail.toUpperCase()}…</div>
                </div>
              </motion.div>
            )}

            {/* FAA result */}
            {addAcStep === "faa-result" && (
              <motion.div key="faa-result" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>

                {addAcInFleet && (
                  <div className="flex flex-col items-center py-6 text-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
                      <Plane className="w-7 h-7 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>{tailNorm} is already in your fleet</div>
                      <div className="text-[13px] text-muted-foreground mt-1">This aircraft is already assigned to your mechanic workspace.</div>
                    </div>
                    <button onClick={() => { onNavigateToAircraft(tailNorm); onClose(); }}
                      className="mt-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                      View Aircraft
                    </button>
                  </div>
                )}

                {addAcFaaNotFound && !addAcInFleet && (
                  <div className="flex flex-col items-center py-6 text-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                      <AlertTriangle className="w-7 h-7 text-red-500" />
                    </div>
                    <div>
                      <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>
                        {isFaaTemporarilyUnavailable(addAcFaaError) ? "FAA registry temporarily unavailable" : "Not found in FAA Registry"}
                      </div>
                      <div className="text-[13px] text-muted-foreground mt-1">
                        {isFaaTemporarilyUnavailable(addAcFaaError)
                          ? `The FAA registry did not respond cleanly for ${tailNorm}. You can retry, or continue with manual details.`
                          : `No active registration for ${tailNorm}. Please verify the N-number and try again.`}
                      </div>
                    </div>
                    <button onClick={() => setAddAcStep("tail")}
                      className="mt-2 border border-border px-5 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      Try Again
                    </button>
                  </div>
                )}

                {addAcFaaData && !addAcInFleet && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-[12px] text-emerald-800" style={{ fontWeight: 600 }}>FAA registry match found for <span className="tracking-widest">{tailNorm}</span></span>
                    </div>
                    <div className="bg-[#F7F8FA] rounded-xl border border-border p-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-[#0A1628] flex items-center justify-center">
                          <Plane className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="text-[16px] text-foreground" style={{ fontWeight: 700, letterSpacing: "0.06em" }}>{tailNorm}</div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] text-muted-foreground">{addAcFaaData.aircraft.year} {addAcFaaData.aircraft.manufacturer} {addAcFaaData.aircraft.model}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${addAcFaaData.source === "live" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`} style={{ fontWeight: 600 }}>
                              {addAcFaaData.source === "live" ? "Live FAA API" : "Saved profile"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {[
                          { label: "Year", value: String(addAcFaaData.aircraft.year) },
                          { label: "Manufacturer", value: addAcFaaData.aircraft.manufacturer },
                          { label: "Model", value: addAcFaaData.aircraft.model },
                          { label: "Serial Number", value: addAcFaaData.aircraft.serialNumber },
                          { label: "Engine", value: `${addAcFaaData.engine.manufacturer} ${addAcFaaData.engine.model}` },
                          { label: "Engine Type", value: addAcFaaData.engine.type },
                          { label: "HP", value: formatHorsepower(addAcFaaData.engine) },
                          { label: "Aircraft Type", value: addAcFaaData.aircraft.aircraftType },
                          { label: "Category", value: addAcFaaData.aircraft.category },
                          { label: "Max Weight", value: addAcFaaData.aircraft.maxWeight },
                          { label: "Seats", value: String(addAcFaaData.aircraft.seats) },
                          { label: "Registrant", value: addAcFaaData.registrant.name },
                          { label: "City/State", value: formatRegistrantLocation(addAcFaaData.registrant) },
                          { label: "Cert Status", value: addAcFaaData.certificate.status },
                        ].map((f) => (
                          <div key={f.label}>
                            <div className="text-muted-foreground uppercase tracking-wider text-[10px]" style={{ fontWeight: 600 }}>{f.label}</div>
                            <div className="text-foreground text-[12px] mt-0.5" style={{ fontWeight: 500 }}>{f.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-between gap-2">
                      <button onClick={() => setAddAcStep("tail")} className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Back</button>
                      <button onClick={handleAddAcContinueToCustomer}
                        className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                        Continue <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Customer step */}
            {addAcStep === "customer" && (
              <motion.div key="customer" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                {addAcExistingCustomer ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-[12px] text-emerald-800" style={{ fontWeight: 600 }}>Customer found in your system — auto-matched</span>
                    </div>
                    <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        {addAcExistingCustomer.company ? <Building2 className="w-5 h-5 text-primary" /> : <User className="w-5 h-5 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{addAcExistingCustomer.name}</div>
                        {addAcExistingCustomer.company && <div className="text-[12px] text-muted-foreground">{addAcExistingCustomer.company}</div>}
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{addAcExistingCustomer.email}</span>
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{addAcExistingCustomer.phone}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between gap-2 pt-1">
                      <button onClick={() => setAddAcStep("faa-result")} className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Back</button>
                      <button
                        onClick={() => void handleConfirmAddAircraft(false)}
                        disabled={addAcSaving}
                        className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
                        {addAcSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Add to Fleet
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-[12px] text-amber-800" style={{ fontWeight: 600 }}>No customer found for {tailNorm} — add one below</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Full Name <span className="text-red-500">*</span></label>
                        <input value={addAcNewName} onChange={(e) => setAddAcNewName(e.target.value)} placeholder="e.g. James Carter"
                          className="w-full border border-border rounded-xl px-4 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                      </div>
                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Email Address <span className="text-red-500">*</span></label>
                        <input value={addAcNewEmail} onChange={(e) => setAddAcNewEmail(e.target.value)} placeholder="e.g. james@email.com" type="email"
                          className="w-full border border-border rounded-xl px-4 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                      </div>
                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Phone Number</label>
                        <input value={addAcNewPhone} onChange={(e) => setAddAcNewPhone(e.target.value)} placeholder="e.g. (512) 555-0100" type="tel"
                          className="w-full border border-border rounded-xl px-4 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                      </div>
                    </div>
                    <div className="flex justify-between gap-2 pt-1">
                      <button onClick={() => setAddAcStep("faa-result")} className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Back</button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void handleConfirmAddAircraft(false)}
                          disabled={addAcSaving}
                          className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 disabled:opacity-40 transition-colors" style={{ fontWeight: 500 }}>
                          Skip
                        </button>
                        <button onClick={() => void handleConfirmAddAircraft(true)}
                          disabled={!addAcNewName.trim() || !addAcNewEmail.trim()}
                          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
                          {addAcSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Invite Customer
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {addAcSaveError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
                    {addAcSaveError}
                  </div>
                )}
              </motion.div>
            )}

            {/* Done */}
            {addAcStep === "done" && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }} className="flex flex-col items-center py-8 text-center gap-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <div>
                  <div className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>
                    {addAcFaaData ? `${tailNorm} Added` : "Aircraft Added"}
                  </div>
                  {addAcFaaData && (
                    <div className="text-[13px] text-muted-foreground mt-1">{addAcFaaData.aircraft.year} {addAcFaaData.aircraft.manufacturer} {addAcFaaData.aircraft.model} · {tailNorm}</div>
                  )}
                  {addAcInvited && (
                    <div className="flex items-center justify-center gap-1.5 mt-2 text-[12px] text-primary bg-primary/8 px-3 py-1.5 rounded-full" style={{ fontWeight: 500 }}>
                      <Mail className="w-3.5 h-3.5" /> Invite sent to {addAcNewEmail}
                    </div>
                  )}
                  {addAcExistingCustomer && (
                    <div className="flex items-center justify-center gap-1.5 mt-2 text-[12px] text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full" style={{ fontWeight: 500 }}>
                      <CheckCircle className="w-3.5 h-3.5" /> Linked to {addAcExistingCustomer.name}
                    </div>
                  )}
                </div>
                <button onClick={onClose}
                  className="mt-2 bg-primary text-white px-6 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                  Done
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
