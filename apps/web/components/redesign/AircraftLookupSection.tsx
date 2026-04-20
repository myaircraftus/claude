"use client";

/**
 * AircraftLookupSection — shared component used in ALL create flows
 * (Work Orders, Estimates, Invoices, Squawks, Logbook)
 *
 * Handles:
 * 1. N-number input + live FAA registry lookup
 * 2. FAA Registered Owner display (read-only — who owns it on paper)
 * 3. Active Customer section (who is bringing it in / who pays)
 *    - Checks existing customers in DataStore for aircraft match
 *    - Or create new customer: name, email, phone + optional invite
 */

import { useState, useRef } from "react";
import {
  Plane, Loader2, CheckCircle, AlertCircle, Search,
  UserCheck, UserPlus, Mail, Phone, X, ChevronDown,
  Building2, Shield, Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  lookupAircraftByNNumber,
  FaaLookupResult,
} from "./faaRegistryService";
import type { Customer } from "./workspace/DataStore";
import {
  formatCertificateClass,
  formatCertificateStatus,
  formatEngineLabel,
  formatHorsepower,
  formatRegistrantSummary,
  isValidCertificate,
} from "./faaDisplay";

/* ── Types ──────────────────────────────────────────────────────── */

type FoundFaaResult = Extract<FaaLookupResult, { found: true }>;

export interface AircraftLookupState {
  nNumber: string;
  faaData: FoundFaaResult | null;
  lookupStatus: "idle" | "searching" | "found" | "notfound";
  lookupError?: string;
  registeredOwner: string;         // FAA registrant.name (auto-filled)
  // Active customer (may differ from registrant — e.g. lessee)
  existingCustomerId?: string;     // if matched to a customer in DataStore
  useExistingCustomer: boolean;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  inviteSent: boolean;
}

export const EMPTY_LOOKUP_STATE: AircraftLookupState = {
  nNumber: "",
  faaData: null,
  lookupStatus: "idle",
  lookupError: "",
  registeredOwner: "",
  existingCustomerId: undefined,
  useExistingCustomer: false,
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  inviteSent: false,
};

interface AircraftLookupSectionProps {
  value: AircraftLookupState;
  onChange: (updates: Partial<AircraftLookupState>) => void;
  existingCustomers: Customer[];
  /** If true, N-number input is locked (pre-filled from estimate/WO) */
  lockedNNumber?: boolean;
  /** Optional label override */
  label?: string;
}

/* ── Helper ─────────────────────────────────────────────────────── */

function findCustomerByAircraft(
  nNumber: string,
  customers: Customer[]
): Customer | null {
  const norm = nNumber.toUpperCase().trim();
  return (
    customers.find((c) =>
      c.aircraft.some(
        (a) =>
          a.toUpperCase() === norm ||
          a.toUpperCase() === norm.replace(/^N/, "")
      )
    ) ?? null
  );
}

function customerStateFromMatch(customer: Customer | null) {
  return {
    existingCustomerId: customer?.id,
    useExistingCustomer: !!customer,
    customerName: customer?.name ?? "",
    customerEmail: customer?.email ?? "",
    customerPhone: customer?.phone ?? "",
    inviteSent: false,
  };
}

/* ══════════════════════════════════════════════════════════════════ */
/*  COMPONENT                                                         */
/* ══════════════════════════════════════════════════════════════════ */

export function AircraftLookupSection({
  value,
  onChange,
  existingCustomers,
  lockedNNumber = false,
  label = "Aircraft Tail Number",
}: AircraftLookupSectionProps) {
  const tokenRef = useRef(0);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  /* ── N-number input handler ── */
  function handleNNumberChange(raw: string) {
    const normalized = raw.toUpperCase().replace(/\s/g, "");
    const existingCustomer = findCustomerByAircraft(normalized, existingCustomers);

    onChange({
      nNumber: normalized,
      faaData: null,
      lookupStatus: "idle",
      lookupError: "",
      registeredOwner: "",
      ...customerStateFromMatch(existingCustomer),
    });

    if (normalized.length < 4) return;

    onChange({ lookupStatus: "searching" });
    const token = ++tokenRef.current;

    lookupAircraftByNNumber(normalized)
      .then((res) => {
        if (token !== tokenRef.current) return; // stale

        if (res.found) {
          onChange({
            faaData: res,
            lookupStatus: "found",
            lookupError: "",
            registeredOwner: res.registrant.name,
            existingCustomerId: existingCustomer?.id,
            useExistingCustomer: !!existingCustomer,
            customerName: existingCustomer ? existingCustomer.name : res.registrant.name,
            customerEmail: existingCustomer ? existingCustomer.email : "",
            customerPhone: existingCustomer ? existingCustomer.phone : "",
            inviteSent: false,
          });
        } else {
          onChange({
            faaData: null,
            lookupStatus: "notfound",
            lookupError: res.error ?? "",
            registeredOwner: "",
            ...customerStateFromMatch(existingCustomer),
          });
        }
      })
      .catch(() => {
        if (token !== tokenRef.current) return;
        onChange({
          faaData: null,
          lookupStatus: "notfound",
          lookupError: "FAA Registry temporarily unavailable. Please verify later or enter details manually.",
          registeredOwner: "",
          ...customerStateFromMatch(existingCustomer),
        });
      });
  }

  /* ── Select existing customer from search ── */
  function selectCustomer(c: Customer) {
    onChange({
      existingCustomerId: c.id,
      useExistingCustomer: true,
      customerName: c.name,
      customerEmail: c.email,
      customerPhone: c.phone,
      inviteSent: false,
    });
    setShowCustomerSearch(false);
    setCustomerSearch("");
  }

  /* ── Clear customer selection ── */
  function clearCustomer() {
    onChange({
      existingCustomerId: undefined,
      useExistingCustomer: false,
      customerName: value.faaData ? value.faaData.registrant.name : "",
      customerEmail: "",
      customerPhone: "",
      inviteSent: false,
    });
  }

  const filteredCustomers = customerSearch
    ? existingCustomers.filter(
        (c) =>
          c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.email.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.company?.toLowerCase().includes(customerSearch.toLowerCase())
      )
    : existingCustomers;

  const selectedCustomer = value.existingCustomerId
    ? existingCustomers.find((c) => c.id === value.existingCustomerId)
    : null;

  const faa = value.faaData;
  const lookupUnavailable = /unavailable|unreachable|timed out|returned 4|returned 5/i.test(
    value.lookupError ?? ""
  );

  return (
    <div className="space-y-4">
      {/* ── N-Number Input ── */}
      <div>
        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>
          {label} <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <input
            type="text"
            value={value.nNumber}
            onChange={(e) => !lockedNNumber && handleNNumberChange(e.target.value)}
            readOnly={lockedNNumber}
            placeholder="e.g. N12345"
            className={`w-full border rounded-xl px-3.5 py-2.5 text-[13px] outline-none transition-all ${
              lockedNNumber
                ? "bg-muted/40 border-border text-muted-foreground cursor-not-allowed"
                : value.lookupStatus === "found"
                ? "border-emerald-400 bg-emerald-50/20"
                : value.lookupStatus === "notfound"
                ? "border-amber-400 bg-amber-50/20"
                : "border-border focus:border-primary/50"
            }`}
            style={{ fontWeight: 500 }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {value.lookupStatus === "searching" && (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            )}
            {value.lookupStatus === "found" && (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            )}
            {value.lookupStatus === "notfound" && (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            )}
          </div>
        </div>

        {/* Lookup status messages */}
        <AnimatePresence>
          {value.lookupStatus === "searching" && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Looking up {value.nNumber} in FAA registry…
            </motion.p>
          )}
          {value.lookupStatus === "notfound" && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
            >
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] text-amber-800" style={{ fontWeight: 500 }}>
                  {lookupUnavailable
                    ? `FAA registry unavailable for ${value.nNumber}`
                    : `${value.nNumber} not found in FAA registry`}
                </p>
                <p className="text-[11px] text-amber-700">
                  {lookupUnavailable
                    ? "The live FAA lookup service did not respond cleanly. You can continue manually, or retry once the registry service is reachable again."
                    : "The FAA registry did not return a match for this tail number. You can continue and enter customer details manually below."}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── FAA Aircraft Card ── */}
      <AnimatePresence>
        {value.lookupStatus === "found" && faa && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Plane className="w-4 h-4 text-emerald-700" />
                <span className="text-[12px] text-emerald-800" style={{ fontWeight: 700 }}>
                  Aircraft Found — FAA Registry
                </span>
                <span
                  className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
                    faa.source === "live"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                  style={{ fontWeight: 600 }}
                >
                  {faa.source === "live" ? "Live FAA API" : "Saved profile"}
                </span>
              </div>

              {/* Two-column aircraft details */}
              <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
                {[
                  { label: "Make", value: faa.aircraft.manufacturer },
                  { label: "Model", value: faa.aircraft.model },
                  { label: "Year", value: String(faa.aircraft.year || "—") },
                  { label: "Serial #", value: faa.aircraft.serialNumber || "—" },
                  { label: "Type", value: faa.aircraft.aircraftType },
                  { label: "Engine", value: formatEngineLabel(faa.engine) },
                  { label: "HP", value: formatHorsepower(faa.engine) },
                  { label: "Category", value: faa.aircraft.category },
                  { label: "Seats", value: String(faa.aircraft.seats) },
                ].map((row) => (
                  <div key={row.label}>
                    <div
                      className="text-[9px] text-emerald-600/70 uppercase tracking-wider"
                      style={{ fontWeight: 700 }}
                    >
                      {row.label}
                    </div>
                    <div
                      className="text-[11px] text-emerald-900"
                      style={{ fontWeight: 500 }}
                    >
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FAA Registered Owner (read-only) ── */}
      <AnimatePresence>
        {(value.lookupStatus === "found" || value.lookupStatus === "notfound") && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {value.lookupStatus === "found" && faa && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-slate-500" />
                  <span className="text-[12px] text-slate-700" style={{ fontWeight: 700 }}>
                    FAA Registered Owner
                  </span>
                  <span className="ml-auto text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>
                    Read-only · Registry data
                  </span>
                </div>
                <div className="text-[13px] text-slate-800" style={{ fontWeight: 600 }}>
                  {faa.registrant.name}
                </div>
                <div className="text-[12px] text-slate-600 mt-0.5">
                  {formatRegistrantSummary(faa.registrant)}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${isValidCertificate(faa.certificate) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`} style={{ fontWeight: 600 }}>
                    {formatCertificateClass(faa.certificate)} · {formatCertificateStatus(faa.certificate)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Issued {faa.certificate.issueDate || "Unavailable"}
                  </span>
                </div>
              </div>
            )}

            {/* ── Active Customer (who's paying / bringing aircraft in) ── */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <label className="text-[12px] text-foreground" style={{ fontWeight: 700 }}>
                    Active Customer
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Who is bringing in the aircraft? (may differ from FAA registrant if leased)
                  </p>
                </div>
                {/* Search/switch customer button */}
                {!showCustomerSearch && (
                  <button
                    type="button"
                    onClick={() => setShowCustomerSearch(true)}
                    className="flex items-center gap-1.5 text-[11px] text-primary border border-primary/30 px-2.5 py-1 rounded-lg hover:bg-primary/5 transition-colors"
                    style={{ fontWeight: 500 }}
                  >
                    <Search className="w-3 h-3" />
                    {selectedCustomer ? "Switch" : "Search"}
                  </button>
                )}
              </div>

              {/* Customer search dropdown */}
              <AnimatePresence>
                {showCustomerSearch && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="mb-3"
                  >
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        autoFocus
                        type="text"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Search customers by name or email…"
                        className="w-full border border-primary/40 rounded-xl pl-8 pr-10 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <button
                        onClick={() => { setShowCustomerSearch(false); setCustomerSearch(""); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                    {filteredCustomers.length > 0 && (
                      <div className="mt-1 bg-white border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                        {filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => selectCustomer(c)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
                          >
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-[11px] text-primary" style={{ fontWeight: 700 }}>
                                {c.name.slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                                {c.name}
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {c.email} · {c.aircraft.join(", ")}
                              </div>
                            </div>
                            {c.aircraft.some((a) =>
                              a.toUpperCase() === value.nNumber.toUpperCase()
                            ) && (
                              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                                This aircraft
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {filteredCustomers.length === 0 && customerSearch && (
                      <p className="text-[12px] text-muted-foreground mt-2 px-1">
                        No customers match &quot;{customerSearch}&quot; — enter details below to add new.
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Existing customer found in system — suggestion badge */}
              {selectedCustomer && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-3"
                >
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-blue-900" style={{ fontWeight: 700 }}>
                        {selectedCustomer.name}
                      </div>
                      <div className="text-[11px] text-blue-700 truncate">
                        {selectedCustomer.email}
                        {selectedCustomer.phone && ` · ${selectedCustomer.phone}`}
                        {selectedCustomer.company && ` · ${selectedCustomer.company}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                        In System
                      </span>
                      <button
                        onClick={clearCustomer}
                        className="text-blue-400 hover:text-blue-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {selectedCustomer.aircraft.some(
                    (a) => a.toUpperCase() === value.nNumber.toUpperCase()
                  ) && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-600">
                      <CheckCircle className="w-3 h-3" />
                      {value.nNumber} is already linked to this customer
                    </div>
                  )}
                </motion.div>
              )}

              {/* Manual customer entry form */}
              {!selectedCustomer && (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>
                      Customer Name <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={value.customerName}
                        onChange={(e) => onChange({ customerName: e.target.value })}
                        placeholder="Customer or company name"
                        className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
                      />
                    </div>
                    {value.lookupStatus === "found" && faa && value.customerName === faa.registrant.name && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Auto-filled from FAA registrant — update if the active customer differs from the registered owner
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        type="email"
                        value={value.customerEmail}
                        onChange={(e) => onChange({ customerEmail: e.target.value })}
                        placeholder="Email address"
                        className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        type="tel"
                        value={value.customerPhone}
                        onChange={(e) => onChange({ customerPhone: e.target.value })}
                        placeholder="Phone number"
                        className="w-full border border-border rounded-xl pl-8 pr-3 py-2.5 text-[13px] outline-none focus:border-primary/40 transition-colors"
                      />
                    </div>
                  </div>
                  {/* Invite button */}
                  {value.customerEmail && (
                    <button
                      type="button"
                      onClick={() => onChange({ inviteSent: true })}
                      disabled={value.inviteSent}
                      className={`flex items-center gap-2 text-[12px] px-3.5 py-2 rounded-lg border transition-all ${
                        value.inviteSent
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "border-primary/30 text-primary hover:bg-primary/5"
                      }`}
                      style={{ fontWeight: 500 }}
                    >
                      {value.inviteSent ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          Invite sent to {value.customerEmail}
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          Invite to myaircraft.us portal
                          <span className="text-muted-foreground ml-1">(optional)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
