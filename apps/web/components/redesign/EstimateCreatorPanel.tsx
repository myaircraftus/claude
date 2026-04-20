import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles, X, Search, AlertTriangle, CheckCircle, Plane,
  Bot, Plus, Mic, Send, Download,
} from "lucide-react";
import { SQUAWK_QUEUE, sevColor, GeneratedEstimate } from "./workspace/mechanicData";
import type { FaaLookupResult } from "./faaRegistryService";
import { formatRegistrantLocation } from "./faaDisplay";

type FoundFaaResult = Extract<FaaLookupResult, { found: true }>;
type CreatorStep = "tail" | "faa-searching" | "faa-result" | "form" | "generating" | "generated";

export interface EstimateCreatorPanelProps {
  showEstCreator: boolean;
  setShowEstCreator: (v: boolean) => void;
  creatorStep: CreatorStep;
  setCreatorStep: (v: CreatorStep) => void;
  estNNumber: string;
  setEstNNumber: (v: string) => void;
  estFaaData: FoundFaaResult | null;
  setEstFaaData: (v: FoundFaaResult | null) => void;
  estFaaNotFound: boolean;
  setEstFaaNotFound: (v: boolean) => void;
  handleEstLookup: () => Promise<void>;
  estCustomerName: string;
  setEstCustomerName: (v: string) => void;
  estCustomerEmail: string;
  setEstCustomerEmail: (v: string) => void;
  estCustomerPhone: string;
  setEstCustomerPhone: (v: string) => void;
  estCustomerNotes: string;
  setEstCustomerNotes: (v: string) => void;
  selectedSquawks: string[];
  toggleSquawk: (id: string) => void;
  scopeNotes: string;
  setScopeNotes: (v: string) => void;
  generatedEst: GeneratedEstimate | null;
  setGeneratedEst: (v: GeneratedEstimate | null) => void;
  editLaborLines: GeneratedEstimate["laborLines"];
  setEditLaborLines: React.Dispatch<React.SetStateAction<GeneratedEstimate["laborLines"]>>;
  editPartsLines: GeneratedEstimate["partsLines"];
  setEditPartsLines: React.Dispatch<React.SetStateAction<GeneratedEstimate["partsLines"]>>;
  handleGenerateEstimate: () => void;
  estTail: string;
  estCustomerDisplay: string;
  estAircraftSquawks: typeof SQUAWK_QUEUE;
  persistEst: (status: "Draft" | "Sent") => void;
  showPdfButton?: boolean;
}

export function EstimateCreatorPanel(props: EstimateCreatorPanelProps) {
  const {
    showEstCreator, setShowEstCreator,
    creatorStep, setCreatorStep,
    estNNumber, setEstNNumber,
    estFaaData, setEstFaaData,
    estFaaNotFound, setEstFaaNotFound,
    handleEstLookup,
    estCustomerName, setEstCustomerName,
    estCustomerEmail, setEstCustomerEmail,
    estCustomerPhone, setEstCustomerPhone,
    estCustomerNotes, setEstCustomerNotes,
    selectedSquawks, toggleSquawk,
    scopeNotes, setScopeNotes,
    generatedEst, setGeneratedEst,
    editLaborLines, setEditLaborLines,
    editPartsLines, setEditPartsLines,
    handleGenerateEstimate,
    estTail, estCustomerDisplay, estAircraftSquawks,
    persistEst,
    showPdfButton = false,
  } = props;

  const closeCreator = () => {
    setShowEstCreator(false);
    setCreatorStep("tail");
    setGeneratedEst(null);
    setScopeNotes("");
    setEstNNumber("");
    setEstFaaData(null);
    setEstFaaNotFound(false);
    setEstCustomerName("");
    setEstCustomerEmail("");
    setEstCustomerPhone("");
    setEstCustomerNotes("");
    setEditLaborLines([]);
    setEditPartsLines([]);
  };

  return (
    <AnimatePresence>
      {showEstCreator && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40 z-20 flex items-center justify-end"
        >
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="w-[680px] h-full bg-white flex flex-col"
          >
            {/* Header */}
            <div className="bg-[#0A1628] px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-white" />
                <div>
                  <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>AI Estimate Creator</div>
                  <div className="text-white/50 text-[12px]">
                    {selectedSquawks.length} squawk{selectedSquawks.length !== 1 ? "s" : ""} selected
                  </div>
                </div>
              </div>
              <button onClick={closeCreator} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-auto p-5 space-y-4">

              {/* Step: N-Number Lookup */}
              {creatorStep === "tail" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-[15px] text-foreground mb-1" style={{ fontWeight: 700 }}>Aircraft N-Number</h3>
                    <p className="text-[12px] text-muted-foreground">Enter the aircraft tail number to look up FAA records and auto-fill owner information.</p>
                  </div>
                  <div>
                    <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>N-Number <span className="text-red-500">*</span></label>
                    <input
                      value={estNNumber}
                      onChange={(e) => setEstNNumber(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && handleEstLookup()}
                      placeholder="e.g. N45678"
                      className="w-full border border-border rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 tracking-widest"
                      style={{ fontWeight: 600 }}
                      autoFocus
                    />
                    <p className="text-[11px] text-muted-foreground mt-1.5">Try: N45678, N55200, N88321, N12345, N67890</p>
                  </div>
                  <button
                    onClick={handleEstLookup}
                    disabled={!estNNumber.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    <Search className="w-3.5 h-3.5" /> Look Up in FAA Registry
                  </button>
                </div>
              )}

              {/* Step: FAA Searching */}
              {creatorStep === "faa-searching" && (
                <div className="flex flex-col items-center py-12 gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-7 h-7 text-primary animate-pulse" />
                  </div>
                  <div className="text-[14px] text-foreground text-center" style={{ fontWeight: 600 }}>Searching FAA Registry…</div>
                  <p className="text-[12px] text-muted-foreground text-center">Looking up {estNNumber}…</p>
                </div>
              )}

              {/* Step: FAA Result */}
              {creatorStep === "faa-result" && (
                <div className="space-y-4">
                  {estFaaNotFound ? (
                    <div className="flex flex-col items-center py-8 gap-3 text-center">
                      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6 text-red-500" />
                      </div>
                      <div>
                        <p className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>Not found in FAA Registry</p>
                        <p className="text-[12px] text-muted-foreground mt-1">No active registration for <span style={{ fontWeight: 600 }}>{estNNumber}</span>. Verify the N-number or enter details manually.</p>
                      </div>
                      <button onClick={() => setCreatorStep("tail")} className="border border-border px-5 py-2 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>← Try Again</button>
                    </div>
                  ) : estFaaData && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-[12px] text-emerald-800" style={{ fontWeight: 600 }}>FAA registry match — {estNNumber}</span>
                      </div>
                      <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 space-y-2">
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className="w-9 h-9 rounded-lg bg-[#0A1628] flex items-center justify-center shrink-0">
                            <Plane className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{estNNumber}</div>
                            <div className="text-[12px] text-muted-foreground">{estFaaData.aircraft.year} {estFaaData.aircraft.manufacturer} {estFaaData.aircraft.model}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                          <div><span className="text-muted-foreground">Registrant</span><div className="text-foreground mt-0.5" style={{ fontWeight: 600 }}>{estFaaData.registrant.name}</div></div>
                              <div><span className="text-muted-foreground">Location</span><div className="text-foreground mt-0.5" style={{ fontWeight: 600 }}>{formatRegistrantLocation(estFaaData.registrant)}</div></div>
                        </div>
                      </div>

                      <div>
                        <div className="text-[12px] text-foreground mb-2 uppercase tracking-wider" style={{ fontWeight: 700 }}>Active Customer</div>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Customer Name</label>
                            <input value={estCustomerName} onChange={(e) => setEstCustomerName(e.target.value)}
                              className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                          </div>
                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Email</label>
                            <input value={estCustomerEmail} onChange={(e) => setEstCustomerEmail(e.target.value)}
                              type="email" placeholder="customer@email.com"
                              className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                          </div>
                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Phone</label>
                            <input value={estCustomerPhone} onChange={(e) => setEstCustomerPhone(e.target.value)}
                              type="tel" placeholder="(512) 555-0000"
                              className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Notes (optional)</label>
                          <textarea value={estCustomerNotes} onChange={(e) => setEstCustomerNotes(e.target.value)}
                            rows={2} placeholder="Any notes about this customer or aircraft..."
                            className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setCreatorStep("tail")} className="border border-border px-4 py-2.5 rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Back</button>
                        <button onClick={() => setCreatorStep("form")}
                          className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                          Continue to Estimate <span className="ml-1">→</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Source squawks context */}
              {creatorStep !== "tail" && creatorStep !== "faa-searching" && creatorStep !== "faa-result" && selectedSquawks.length > 0 && (
                <div>
                  <div className="text-[12px] text-muted-foreground mb-2 uppercase tracking-wider" style={{ fontWeight: 600 }}>Source Squawks</div>
                  <div className="space-y-2">
                    {SQUAWK_QUEUE.filter((s) => selectedSquawks.includes(s.id)).map((sq) => (
                      <div key={sq.id} className="bg-[#F7F8FA] rounded-lg p-3 border border-border">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{sq.title}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${sevColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                        </div>
                        <div className="text-[12px] text-muted-foreground">{sq.tail} &middot; {sq.category} &middot; {sq.date}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step: Form */}
              {creatorStep === "form" && (
                <>
                  <div className="bg-[#F7F8FA] rounded-xl border border-border p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-lg bg-[#0A1628] flex items-center justify-center shrink-0">
                        <Plane className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{estTail || "—"}</div>
                        <div className="text-[12px] text-muted-foreground">{estCustomerDisplay || "Unknown customer"}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-[12px]">
                      <div><span className="text-muted-foreground">Email</span><div className="text-foreground mt-0.5 truncate" style={{ fontWeight: 500 }}>{estCustomerEmail || "—"}</div></div>
                      <div><span className="text-muted-foreground">Phone</span><div className="text-foreground mt-0.5" style={{ fontWeight: 500 }}>{estCustomerPhone || "—"}</div></div>
                      <div><span className="text-muted-foreground">Notes</span><div className="text-foreground mt-0.5 truncate" style={{ fontWeight: 500 }}>{estCustomerNotes || "—"}</div></div>
                    </div>
                  </div>

                  {estAircraftSquawks.length > 0 && (
                    <div>
                      <div className="text-[12px] text-foreground mb-2" style={{ fontWeight: 600 }}>
                        Open Squawks on {estTail}
                        <span className="ml-2 text-[11px] text-muted-foreground" style={{ fontWeight: 400 }}>Check all that apply</span>
                      </div>
                      <div className="space-y-2">
                        {estAircraftSquawks.map((sq) => (
                          <label key={sq.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-white hover:border-primary/30 hover:bg-primary/3 transition-all cursor-pointer">
                            <input type="checkbox" checked={selectedSquawks.includes(sq.id)} onChange={() => toggleSquawk(sq.id)} className="mt-0.5 w-4 h-4 accent-primary" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{sq.title}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sevColor(sq.severity)}`} style={{ fontWeight: 600 }}>{sq.severity}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">{sq.category} · {sq.date}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Additional Scope Notes (optional)</label>
                    <textarea
                      value={scopeNotes}
                      onChange={(e) => setScopeNotes(e.target.value)}
                      className="w-full border border-border rounded-xl px-4 py-3 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      rows={4}
                      placeholder='Describe any additional scope, e.g. "Include 100-hour inspection items while aircraft is open."'
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button className="flex items-center gap-1.5 text-[12px] text-muted-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                        <Mic className="w-3.5 h-3.5" /> Dictate
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Labor Rate</label>
                      <div className="flex items-center border border-border rounded-lg overflow-hidden">
                        <span className="px-3 text-[13px] text-muted-foreground bg-muted/30 border-r border-border py-2">$</span>
                        <input type="number" defaultValue="125" className="flex-1 px-3 py-2 text-[13px] outline-none" />
                        <span className="px-3 text-[13px] text-muted-foreground">/hr</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Valid For</label>
                      <select className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none bg-white">
                        <option>30 days</option>
                        <option>60 days</option>
                        <option>90 days</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleGenerateEstimate}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3.5 rounded-xl text-[14px] hover:bg-primary/90 transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    <Sparkles className="w-4 h-4" /> Generate Estimate with AI
                  </button>
                </>
              )}

              {/* Step: Generating */}
              {creatorStep === "generating" && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Bot className="w-7 h-7 text-primary animate-pulse" />
                  </div>
                  <div className="text-[14px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Generating estimate...</div>
                  <p className="text-[12px] text-muted-foreground text-center max-w-xs">AI is reading squawk descriptions, categorizing scope, and building labor and parts line items.</p>
                  <div className="mt-4 flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Step: Generated */}
              {creatorStep === "generated" && generatedEst && (() => {
                const laborTotal = editLaborLines.reduce((s, l) => s + l.total, 0);
                const partsTotal = editPartsLines.reduce((s, p) => s + p.total, 0);
                const grandTotal = laborTotal + partsTotal;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span className="text-[12px]" style={{ fontWeight: 600 }}>Estimate generated — all fields are editable. Review before sending.</span>
                    </div>

                    {/* Labor lines */}
                    <div>
                      <div className="text-[12px] text-foreground mb-2 flex items-center justify-between" style={{ fontWeight: 600 }}>
                        Labor Lines
                        <button onClick={() => setEditLaborLines(prev => [...prev, { id: `l-new-${Date.now()}`, desc: "Additional labor", hours: 1.0, rate: 125, total: 125 }])}
                          className="text-primary text-[11px] flex items-center gap-1" style={{ fontWeight: 500 }}>
                          <Plus className="w-3 h-3" /> Add line
                        </button>
                      </div>
                      <div className="border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-[12px]">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="text-left px-2.5 py-2 text-muted-foreground" style={{ fontWeight: 600 }}>Description</th>
                              <th className="text-right px-2 py-2 text-muted-foreground w-14" style={{ fontWeight: 600 }}>Hrs</th>
                              <th className="text-right px-2 py-2 text-muted-foreground w-14" style={{ fontWeight: 600 }}>Rate</th>
                              <th className="text-right px-2 py-2 text-muted-foreground w-18" style={{ fontWeight: 600 }}>Total</th>
                              <th className="w-6" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {editLaborLines.map((l, i) => (
                              <tr key={l.id} className="hover:bg-muted/5">
                                <td className="px-2.5 py-1.5">
                                  <input value={l.desc} onChange={e => setEditLaborLines(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
                                    className="w-full text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input type="number" value={l.hours} step="0.5"
                                    onChange={e => { const h = parseFloat(e.target.value) || 0; setEditLaborLines(prev => prev.map((x, j) => j === i ? { ...x, hours: h, total: h * x.rate } : x)); }}
                                    className="w-full text-right text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input type="number" value={l.rate}
                                    onChange={e => { const r = parseFloat(e.target.value) || 0; setEditLaborLines(prev => prev.map((x, j) => j === i ? { ...x, rate: r, total: x.hours * r } : x)); }}
                                    className="w-full text-right text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                </td>
                                <td className="px-2 py-1.5 text-right text-foreground" style={{ fontWeight: 600 }}>${l.total.toFixed(2)}</td>
                                <td className="pr-2 py-1.5">
                                  <button onClick={() => setEditLaborLines(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500 transition-colors">
                                    <X className="w-3 h-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Parts lines */}
                    <div>
                      <div className="text-[12px] text-foreground mb-2 flex items-center justify-between" style={{ fontWeight: 600 }}>
                        Parts &amp; Materials
                        <button onClick={() => setEditPartsLines(prev => [...prev, { id: `p-new-${Date.now()}`, pn: "", desc: "Part", qty: 1, price: 0, total: 0 }])}
                          className="text-primary text-[11px] flex items-center gap-1" style={{ fontWeight: 500 }}>
                          <Plus className="w-3 h-3" /> Add part
                        </button>
                      </div>
                      {editPartsLines.length === 0 ? (
                        <div className="border border-dashed border-border rounded-xl p-4 text-center text-[12px] text-muted-foreground">
                          No parts added. Click "+ Add part" to include parts.
                        </div>
                      ) : (
                        <div className="border border-border rounded-xl overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead className="bg-muted/30">
                              <tr>
                                <th className="text-left px-2.5 py-2 text-muted-foreground" style={{ fontWeight: 600 }}>Part / Description</th>
                                <th className="text-left px-2 py-2 text-muted-foreground w-20" style={{ fontWeight: 600 }}>P/N</th>
                                <th className="text-right px-2 py-2 text-muted-foreground w-12" style={{ fontWeight: 600 }}>Qty</th>
                                <th className="text-right px-2 py-2 text-muted-foreground w-18" style={{ fontWeight: 600 }}>Total</th>
                                <th className="w-6" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {editPartsLines.map((p, i) => (
                                <tr key={p.id} className="hover:bg-muted/5">
                                  <td className="px-2.5 py-1.5">
                                    <input value={p.desc} onChange={e => setEditPartsLines(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
                                      className="w-full text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input value={p.pn} onChange={e => setEditPartsLines(prev => prev.map((x, j) => j === i ? { ...x, pn: e.target.value } : x))}
                                      className="w-full text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[11px] py-0.5" />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input type="number" value={p.qty}
                                      onChange={e => { const q = parseInt(e.target.value) || 1; setEditPartsLines(prev => prev.map((x, j) => j === i ? { ...x, qty: q, total: q * x.price } : x)); }}
                                      className="w-full text-right text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none text-[12px] py-0.5" />
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-foreground" style={{ fontWeight: 600 }}>${p.total.toFixed(2)}</td>
                                  <td className="pr-2 py-1.5">
                                    <button onClick={() => setEditPartsLines(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500 transition-colors">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Totals */}
                    <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 space-y-1.5 text-[13px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">Labor Subtotal</span><span style={{ fontWeight: 600 }}>${laborTotal.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Parts Subtotal</span><span style={{ fontWeight: 600 }}>${partsTotal.toFixed(2)}</span></div>
                      <div className="flex justify-between border-t border-border pt-2 mt-1">
                        <span className="text-foreground" style={{ fontWeight: 700 }}>Grand Total</span>
                        <span className="text-[16px]" style={{ fontWeight: 700 }}>${grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            {(creatorStep === "form" || creatorStep === "generated") && (
              <div className="shrink-0 px-5 py-4 border-t border-border bg-white flex items-center justify-between">
                <button
                  onClick={() => {
                    if (creatorStep === "generated") {
                      setCreatorStep("form");
                      setGeneratedEst(null);
                      setEditLaborLines([]);
                      setEditPartsLines([]);
                    } else {
                      closeCreator();
                    }
                  }}
                  className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  {creatorStep === "generated" ? "← Regenerate" : "Cancel"}
                </button>
                {creatorStep === "generated" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => persistEst("Draft")}
                      className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors"
                      style={{ fontWeight: 600 }}
                    >
                      <Download className="w-3.5 h-3.5" /> Save Draft
                    </button>
                    {showPdfButton && (
                      <button
                        className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors"
                        style={{ fontWeight: 500 }}
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                    )}
                    <button
                      onClick={() => persistEst("Sent")}
                      className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors"
                      style={{ fontWeight: 600 }}
                    >
                      <Send className="w-3.5 h-3.5" /> Send to Customer
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
