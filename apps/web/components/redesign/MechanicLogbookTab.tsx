import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plane, BookOpen, Download, Send, X, Bot, Sparkles,
  CheckCircle, CheckSquare, Lock, Shield, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { LogbookSignModal } from "./LogbookSignModal";
import { LogbookCanaryGenerator } from "./LogbookCanaryGenerator";
import type { LogbookEntry as CanaryLogbookEntry } from "./LogbookCanaryGenerator";
import { LOGBOOK_ENTRIES } from "./workspace/mechanicData";

type DisplayEntry = {
  id: string; number: string; aircraft: string; model: string;
  type: string; date: string; hobbs: number; tach: number;
  mechanic: string; cert: string; status: "signed" | "draft";
  body: string; customer?: string; customerEmail?: string; linkedWO?: string;
  checklistTemplateLabel?: string | null;
  checklistSourceReferences?: string[];
  shopChecklistReferences?: string[];
  shopLogbookReferences?: string[];
  openRequiredChecklistItems?: string[];
  nextDueInterval?: string | null;
  requires337?: boolean;
};

interface Props {
  selectedLBId: string | null;
  setSelectedLBId: (v: string | null) => void;
  savedLBEntries: CanaryLogbookEntry[];
  setSavedLBEntries: React.Dispatch<React.SetStateAction<CanaryLogbookEntry[]>>;
  lbFilterTail: string;
  setLbFilterTail: (v: string) => void;
  lbFilterCustomer: string;
  setLbFilterCustomer: (v: string) => void;
  showSignModal: boolean;
  setShowSignModal: (v: boolean) => void;
  signedLocalIds: string[];
  setSignedLocalIds: React.Dispatch<React.SetStateAction<string[]>>;
  lbNextSteps: Record<string, boolean[]>;
  setLbNextSteps: React.Dispatch<React.SetStateAction<Record<string, boolean[]>>>;
  showCanaryGenerator: boolean;
  setShowCanaryGenerator: (v: boolean) => void;
  showLBGenerator: boolean;
  setShowLBGenerator: (v: boolean) => void;
  lbGenStep: "select" | "generating" | "edit" | "signed";
  setLbGenStep: (v: "select" | "generating" | "edit" | "signed") => void;
  selectedWOForLB: string;
  setSelectedWOForLB: (v: string) => void;
  lbDraftText: string;
  setLbDraftText: (v: string) => void;
  lbSigning: boolean;
  setLbSigning: (v: boolean) => void;
  handleGenerateLogbook: () => void;
  handleSignLogbook: () => void;
  activeMechanic: { name: string; cert: string };
}

const nextStepsList = (lb: {
  body: string;
  linkedWO?: string;
  openRequiredChecklistItems?: string[];
  nextDueInterval?: string | null;
  requires337?: boolean;
}) => {
  const body = (lb.body || "").toLowerCase();
  const steps: { label: string; required: boolean }[] = [
    { label: "Save signed record to digital logbook", required: true },
    { label: "Send digital copy to aircraft owner", required: false },
    { label: "File copy in aircraft digital records", required: true },
  ];
  if (!lb.linkedWO) steps.push({ label: "Add work performed to invoice", required: false });
  if ((lb.openRequiredChecklistItems?.length ?? 0) > 0) {
    steps.push({
      label: `Resolve remaining required checklist items (${lb.openRequiredChecklistItems?.join(", ")})`,
      required: true,
    });
  }
  if (lb.requires337 || body.includes("major") || body.includes("337") || body.includes("alteration")) {
    steps.push({ label: "Submit FAA Form 337 to local FSDO", required: true });
  }
  if (body.includes("annual") || body.includes("100-hour") || body.includes("100 hour")) {
    steps.push({ label: "Record entry in aircraft maintenance records", required: true });
  }
  if (lb.nextDueInterval) {
    steps.push({ label: `Update next-due tracking for ${lb.nextDueInterval}`, required: false });
  }
  steps.push({ label: "Attach supporting documents", required: false });
  return steps;
};

export function MechanicLogbookTab(props: Props) {
  const {
    selectedLBId, setSelectedLBId,
    savedLBEntries, setSavedLBEntries,
    lbFilterTail, setLbFilterTail,
    lbFilterCustomer, setLbFilterCustomer,
    showSignModal, setShowSignModal,
    signedLocalIds, setSignedLocalIds,
    lbNextSteps, setLbNextSteps,
    showCanaryGenerator, setShowCanaryGenerator,
    showLBGenerator, setShowLBGenerator,
    lbGenStep, setLbGenStep,
    selectedWOForLB, setSelectedWOForLB,
    lbDraftText, setLbDraftText,
    lbSigning,
    handleGenerateLogbook,
    handleSignLogbook,
    activeMechanic,
  } = props;

  const toggleNextStep = (entryId: string, idx: number) => {
    setLbNextSteps(prev => {
      const current = prev[entryId] || [];
      const updated = [...current];
      updated[idx] = !updated[idx];
      return { ...prev, [entryId]: updated };
    });
  };

  const allEntries: DisplayEntry[] = [
    ...LOGBOOK_ENTRIES.map((e) => ({
      ...e,
      customer: e.mechanic === "Mike Torres"
        ? (e.aircraft === "N12345" ? "John Mitchell" : "Horizon Flights Inc.")
        : undefined,
    })),
    ...savedLBEntries.map((e) => ({
      id: e.id, number: e.number, aircraft: e.aircraft, model: e.model,
      type: e.entryType, date: e.date, hobbs: e.hobbs, tach: e.tach,
      mechanic: e.mechanic, cert: e.cert, status: e.status,
      body: e.body,
      customer: e.customer,
      customerEmail: e.customerEmail,
      linkedWO: e.linkedWO,
      checklistTemplateLabel: e.checklistTemplateLabel,
      checklistSourceReferences: e.checklistSourceReferences,
      shopChecklistReferences: e.shopChecklistReferences,
      shopLogbookReferences: e.shopLogbookReferences,
      openRequiredChecklistItems: e.openRequiredChecklistItems,
      nextDueInterval: e.nextDueInterval,
      requires337: e.requires337,
    })),
  ];

  const filteredEntries = allEntries.filter((e) => {
    const matchTail = !lbFilterTail || e.aircraft.toLowerCase().includes(lbFilterTail.toLowerCase());
    const matchCust = !lbFilterCustomer || (e.customer || "").toLowerCase().includes(lbFilterCustomer.toLowerCase());
    return matchTail && matchCust;
  });

  const lb = allEntries.find((e) => e.id === selectedLBId) || null;

  return (
    <>
      <div className="flex-1 flex min-h-0">
        {/* List panel */}
        <div className="w-[310px] shrink-0 border-r border-border flex flex-col bg-white">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h2 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>Logbook Entries</h2>
                <p className="text-[11px] text-muted-foreground">{filteredEntries.length} of {allEntries.length} entries</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5">
                <Plane className="w-3 h-3 text-muted-foreground shrink-0" />
                <input type="text" placeholder="Filter by tail #" value={lbFilterTail} onChange={(e) => setLbFilterTail(e.target.value)}
                  className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/60" />
                {lbFilterTail && <button onClick={() => setLbFilterTail("")} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
              </div>
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5">
                <BookOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                <input type="text" placeholder="Filter by customer" value={lbFilterCustomer} onChange={(e) => setLbFilterCustomer(e.target.value)}
                  className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/60" />
                {lbFilterCustomer && <button onClick={() => setLbFilterCustomer("")} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto divide-y divide-border">
            {filteredEntries.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <BookOpen className="w-7 h-7 mx-auto mb-2 opacity-30" />
                <div className="text-[13px]">No entries match filters</div>
                <button onClick={() => { setLbFilterTail(""); setLbFilterCustomer(""); }} className="text-[11px] text-primary mt-1" style={{ fontWeight: 500 }}>Clear filters</button>
              </div>
            ) : filteredEntries.map((e) => (
              <button key={e.id} onClick={() => setSelectedLBId(e.id === selectedLBId ? null : e.id)}
                className={`w-full p-3.5 text-left hover:bg-muted/20 transition-colors ${selectedLBId === e.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{e.number}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${e.status === "signed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} style={{ fontWeight: 600 }}>
                    {e.status}
                  </span>
                </div>
                <div className="text-[12px] text-foreground truncate" style={{ fontWeight: 500 }}>{e.type}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  <span className="inline-flex items-center gap-1"><Plane className="w-2.5 h-2.5" />{e.aircraft}</span>
                  {e.customer && <> · {e.customer}</>}
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{e.date}</div>
              </button>
            ))}
          </div>

          <div className="p-3 border-t border-border space-y-2">
            <button onClick={() => setShowCanaryGenerator(true)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#0A1628] to-[#2563EB] text-white py-2.5 rounded-lg text-[12px] hover:opacity-90 transition-opacity"
              style={{ fontWeight: 600 }}>
              <Sparkles className="w-3.5 h-3.5" /> Generate Logbook Entry with AI
            </button>
          </div>
        </div>

        {/* Detail panel */}
        {lb ? (
          <div className="flex-1 overflow-auto bg-[#F7F8FA] p-5">
            <div className="max-w-2xl space-y-4">
              <div className="bg-white rounded-xl border border-border p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>{lb.number}</span>
                      <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${lb.status === "signed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`} style={{ fontWeight: 600 }}>{lb.status}</span>
                      {lb.linkedWO && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700" style={{ fontWeight: 600 }}>{lb.linkedWO}</span>}
                      {lb.checklistTemplateLabel && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700" style={{ fontWeight: 600 }}>
                          {lb.checklistTemplateLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-muted-foreground">{lb.aircraft} · {lb.model} · {lb.type}</div>
                    {lb.customer && <div className="text-[11px] text-muted-foreground/70 mt-0.5">{lb.customer}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                    <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      <Send className="w-3.5 h-3.5" /> Send
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4 bg-[#F7F8FA] rounded-lg p-3">
                  {[{ l: "Date", v: lb.date }, { l: "Hobbs", v: lb.hobbs + " hrs" }, { l: "Tach", v: lb.tach + " hrs" }].map((f) => (
                    <div key={f.l}>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>{f.l}</div>
                      <div className="text-[13px] text-foreground mt-0.5" style={{ fontWeight: 600 }}>{f.v}</div>
                    </div>
                  ))}
                </div>

                <div className="mb-4">
                  <div className="text-[12px] text-muted-foreground mb-2 uppercase tracking-wider" style={{ fontWeight: 600 }}>Maintenance Description</div>
                  <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 text-[13px] text-foreground leading-relaxed whitespace-pre-line">{lb.body}</div>
                </div>

                {(lb.checklistSourceReferences?.length
                  || lb.shopChecklistReferences?.length
                  || lb.shopLogbookReferences?.length
                  || lb.nextDueInterval
                  || lb.requires337
                  || lb.openRequiredChecklistItems?.length) ? (
                  <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <div className="text-[12px] text-blue-800 mb-2 uppercase tracking-wider" style={{ fontWeight: 700 }}>
                      Source of Truth Context
                    </div>
                    <div className="space-y-2 text-[12px] text-blue-700">
                      {lb.checklistSourceReferences?.length ? (
                        <div>
                          <span style={{ fontWeight: 700 }}>Checklist source:</span> {lb.checklistSourceReferences.join(" | ")}
                        </div>
                      ) : null}
                      {lb.shopChecklistReferences?.length ? (
                        <div>
                          <span style={{ fontWeight: 700 }}>Shop checklist refs:</span> {lb.shopChecklistReferences.join(", ")}
                        </div>
                      ) : null}
                      {lb.shopLogbookReferences?.length ? (
                        <div>
                          <span style={{ fontWeight: 700 }}>Shop logbook refs:</span> {lb.shopLogbookReferences.join(", ")}
                        </div>
                      ) : null}
                      {lb.openRequiredChecklistItems?.length ? (
                        <div className="text-amber-700">
                          <span style={{ fontWeight: 700 }}>Open required checklist items:</span> {lb.openRequiredChecklistItems.join(", ")}
                        </div>
                      ) : null}
                      {lb.nextDueInterval ? (
                        <div>
                          <span style={{ fontWeight: 700 }}>Next due:</span> {lb.nextDueInterval}
                        </div>
                      ) : null}
                      {lb.requires337 ? (
                        <div className="text-amber-700">
                          <span style={{ fontWeight: 700 }}>FAA Form 337 review required before final signoff.</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-border pt-4">
                  <div className="text-[12px] text-muted-foreground mb-2 uppercase tracking-wider" style={{ fontWeight: 600 }}>Certificate of Return to Service</div>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{lb.mechanic}</div>
                    <div className="text-[12px] text-muted-foreground">{lb.cert}</div>
                    {(lb.status === "signed" || signedLocalIds.includes(lb.id)) ? (
                      <div className="flex items-center gap-2 mt-2">
                        <Lock className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-[12px] text-emerald-700" style={{ fontWeight: 600 }}>
                          Digitally signed &amp; cryptographically sealed · {lb.status === "signed" ? lb.date : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    ) : (
                      <button onClick={() => setShowSignModal(true)}
                        className="mt-3 w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#1E3A5F]/25 text-[#1E3A5F] py-3 rounded-xl text-[13px] hover:bg-[#1E3A5F]/5 hover:border-[#1E3A5F]/40 transition-all"
                        style={{ fontWeight: 600 }}>
                        <Shield className="w-4 h-4" /> Sign Entry
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Next Required Steps */}
              <div className="bg-white rounded-xl border border-border p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CheckSquare className="w-4 h-4 text-[#1E3A5F]" />
                  <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>Next Required Steps</div>
                  {!(lb.status === "signed" || signedLocalIds.includes(lb.id)) && (
                    <span className="ml-auto text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Sign entry first</span>
                  )}
                </div>
                <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {nextStepsList(lb).map((step, i) => {
                    const done = (lbNextSteps[lb.id] || [])[i] ?? false;
                    return (
                      <button key={i} onClick={() => toggleNextStep(lb.id, i)}
                        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${done ? "bg-[#0A1628] border-[#0A1628]" : "border-border bg-white"}`}>
                            {done && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                                <path d="M1.5 5L3.5 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-[13px] ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>{step.label}</span>
                        </div>
                        {step.required && !done && (
                          <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full ml-2 shrink-0" style={{ fontWeight: 700 }}>Required</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground bg-[#F7F8FA]">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0A1628] to-[#2563EB] flex items-center justify-center mx-auto mb-4 opacity-80">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <div className="text-[14px] text-foreground mb-1" style={{ fontWeight: 600 }}>Select an entry or generate a new one</div>
              <p className="text-[12px] text-muted-foreground mb-4 max-w-xs mx-auto">Use AI Canary to generate a fully compliant FAR 43.9 logbook entry in seconds.</p>
              <button onClick={() => setShowCanaryGenerator(true)}
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-[13px] mx-auto hover:bg-primary/90 transition-colors"
                style={{ fontWeight: 600 }}>
                <Sparkles className="w-4 h-4" /> Generate with AI Canary
              </button>
            </div>
          </div>
        )}

        {/* Legacy WO generator modal */}
        <AnimatePresence>
          {showLBGenerator && (
            <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
                <div className="bg-[#0A1628] px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5 text-white" />
                    <div>
                      <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>Generate from Work Order</div>
                      <div className="text-white/50 text-[12px]">AI reads WO scope, parts and notes</div>
                    </div>
                  </div>
                  <button onClick={() => { setShowLBGenerator(false); setLbGenStep("select"); setLbDraftText(""); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-white/70" />
                  </button>
                </div>
                <div className="p-6">
                  {lbGenStep === "select" && (
                    <div className="space-y-4">
                      <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Select Work Order</h3>
                      <p className="text-[13px] text-muted-foreground">AI will read the work order scope, parts, and notes to generate a maintenance logbook entry.</p>
                      <select value={selectedWOForLB} onChange={(e) => setSelectedWOForLB(e.target.value)}
                        className="w-full border-2 border-border rounded-xl px-4 py-3 text-[14px] outline-none focus:border-primary transition-all bg-white" style={{ fontWeight: 500 }}>
                        <option value="WO-2026-0047">WO-2026-0047 — N67890 — Left brake caliper R&R</option>
                        <option value="WO-2026-0042">WO-2026-0042 — N12345 — Nav light wire repair</option>
                      </select>
                      <button onClick={handleGenerateLogbook} className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3.5 rounded-xl text-[14px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                        <Sparkles className="w-4 h-4" /> Generate with AI
                      </button>
                    </div>
                  )}
                  {lbGenStep === "generating" && (
                    <div className="flex flex-col items-center py-10">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Bot className="w-7 h-7 text-primary animate-pulse" />
                      </div>
                      <div className="text-[14px] text-foreground mb-1" style={{ fontWeight: 600 }}>Reading work order...</div>
                      <p className="text-[12px] text-muted-foreground text-center">AI is analyzing scope, parts, and approvals to draft your logbook entry.</p>
                    </div>
                  )}
                  {lbGenStep === "edit" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-[12px] text-emerald-800" style={{ fontWeight: 600 }}>Draft generated — review and edit before signing</span>
                      </div>
                      <div>
                        <label className="block text-[12px] text-foreground mb-1.5" style={{ fontWeight: 600 }}>Maintenance Description</label>
                        <textarea value={lbDraftText} onChange={(e) => setLbDraftText(e.target.value)} rows={8}
                          className="w-full border border-border rounded-xl px-4 py-3 text-[12px] outline-none resize-none focus:ring-2 focus:ring-primary/20 leading-relaxed" />
                      </div>
                      <div className="bg-[#F7F8FA] rounded-xl border border-border p-4">
                        <div className="text-[12px] text-foreground mb-3" style={{ fontWeight: 600 }}>Certificate of Return to Service</div>
                        <div className="grid grid-cols-2 gap-3 text-[12px]">
                          <div><div className="text-muted-foreground mb-1">Mechanic Name</div><div className="border border-border rounded-lg px-3 py-2 bg-white text-foreground" style={{ fontWeight: 500 }}>{activeMechanic.name}</div></div>
                          <div><div className="text-muted-foreground mb-1">Certificate Number</div><div className="border border-border rounded-lg px-3 py-2 bg-white text-foreground" style={{ fontWeight: 500 }}>{activeMechanic.cert}</div></div>
                        </div>
                      </div>
                      <button onClick={handleSignLogbook} disabled={lbSigning}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-3.5 rounded-xl text-[14px] hover:bg-emerald-700 disabled:opacity-50 transition-colors" style={{ fontWeight: 600 }}>
                        {lbSigning ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing...</> : <><Lock className="w-4 h-4" /> Sign &amp; Finalize</>}
                      </button>
                    </div>
                  )}
                  {lbGenStep === "signed" && (
                    <div className="flex flex-col items-center py-8">
                      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-emerald-600" />
                      </div>
                      <div className="text-[18px] text-foreground mb-1" style={{ fontWeight: 700 }}>Entry Signed</div>
                      <p className="text-[13px] text-muted-foreground text-center mb-5">
                        Logbook entry has been digitally signed and filed. Attached to {selectedWOForLB === "WO-2026-0047" ? "N67890" : "N12345"}'s aircraft record.
                      </p>
                      <div className="flex gap-2">
                        <button className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}><Download className="w-3.5 h-3.5" /> PDF</button>
                        <button className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}><Mail className="w-3.5 h-3.5" /> Email to Owner</button>
                        <button onClick={() => { setShowLBGenerator(false); setLbGenStep("select"); setLbDraftText(""); }} className="px-4 py-2 rounded-lg bg-primary text-white text-[12px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>Done</button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Logbook Sign Modal */}
      <AnimatePresence>
        {showSignModal && lb && (
          <LogbookSignModal
            entryId={lb.id}
            entryNumber={lb.number}
            aircraft={lb.aircraft}
            mechanic={lb.mechanic || activeMechanic.name}
            cert={lb.cert || activeMechanic.cert}
            onCancel={() => setShowSignModal(false)}
            onSigned={(id) => {
              setSignedLocalIds(prev => [...prev, id]);
              setShowSignModal(false);
              toast.success("Entry signed & sealed", { description: `${lb.number} · ${lb.aircraft} — cryptographically sealed` });
            }}
          />
        )}
      </AnimatePresence>

      {/* Canary AI generator */}
      <AnimatePresence>
        {showCanaryGenerator && (
          <LogbookCanaryGenerator
            onClose={() => setShowCanaryGenerator(false)}
            onSaved={(entry) => {
              setSavedLBEntries((prev) => [entry, ...prev]);
              setSelectedLBId(entry.id);
              setShowCanaryGenerator(false);
            }}
            activeMechanicName={activeMechanic.name}
            activeMechanicCert={activeMechanic.cert}
          />
        )}
      </AnimatePresence>
    </>
  );
}
