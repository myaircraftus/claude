"use client";

import React from "react";
import Link from "@/components/shared/tenant-link";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, Search, X, Send, Sparkles, Bot,
  ExternalLink, Lock, Package, AlertTriangle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { usePartsStore } from "./workspace/PartsStore";

/* ─── Local mock data (self-contained) ──────────────────── */
const ALL_WOS = [
  { wo: "WO-2026-0047", tail: "N67890", model: "Piper PA-28-181", customer: "Horizon Flights Inc.", desc: "Left brake caliper R&R — piston binding", status: "In Progress", progress: 45, mechanic: "Mike Torres, Dana Lee", due: "Apr 12, 2026" },
  { wo: "WO-2026-0042", tail: "N12345", model: "Cessna 172S", customer: "John Mitchell", desc: "Nav light intermittent — wire repair at wing root", status: "Awaiting Approval", progress: 70, mechanic: "Mike Torres", due: "Apr 10, 2026" },
];

type WOActItem = { id: string; type: string; author: string; role?: string; content: string; ts: string; chip?: string; visibility?: string };
const WO_ACTIVITY: Record<string, WOActItem[]> = {
  "WO-2026-0047": [
    { id: "m1", type: "system",  author: "System",      content: "WO-2026-0047 opened · N67890 Piper PA-28-181", ts: "4 days ago" },
    { id: "m2", type: "status",  author: "System",      content: "Draft → In Progress", ts: "4 days ago" },
    { id: "m3", type: "note",    author: "Mike Torres", role: "Lead Mechanic", content: "Aircraft in bay 3. Pulled left wheel fairing — caliper piston is binding, pad contact uneven. Cleaning and lubing piston bore before deciding if caliper needs replacement.", ts: "3 days ago" },
    { id: "m4", type: "part",    author: "Dana Lee",    role: "Mechanic", content: "Ordered BRK-30026-5 brake disc and pad set from Aircraft Spruce. ETA 2 days.", ts: "2 days ago", chip: "P/N BRK-30026-5" },
    { id: "m5", type: "owner-update", author: "Mike Torres", role: "Lead Mechanic", content: "Hi Horizon team — N67890 is in for brake inspection. Left main caliper piston was binding. Parts ordered, arriving Thursday. Expect completion by end of week.", ts: "2 days ago", visibility: "owner-visible" },
    { id: "m6", type: "note",    author: "Dana Lee",    role: "Mechanic", content: "SB-60-22 checked — not applicable to this S/N range. No additional service bulletin action required.", ts: "1 day ago" },
  ],
  "WO-2026-0042": [
    { id: "n1", type: "system",  author: "System",      content: "WO-2026-0042 opened · N12345 Cessna 172S", ts: "9 days ago" },
    { id: "n2", type: "note",    author: "Mike Torres", role: "Lead Mechanic", content: "Traced intermittent nav light to right connector at wing root. Corrosion visible under insulation — wire shows abrasion at grommet edge.", ts: "8 days ago" },
    { id: "n3", type: "status",  author: "System",      content: "In Progress → Awaiting Approval", ts: "7 days ago" },
    { id: "n4", type: "owner-update", author: "Mike Torres", role: "Lead Mechanic", content: "Requesting owner approval for expanded scope: full wire re-route at grommet, +1.5 hrs (+$187.50). Parts on hand. No additional parts required.", ts: "7 days ago", visibility: "owner-visible" },
    { id: "n5", type: "ai-summary", author: "AI Assistant", content: "Nav light failure traced to corroded connector and chafed wire at wing root. MS connector on hand. Waiting on owner approval for +1.5 hrs. No additional parts needed. Ready to complete once approved.", ts: "2h ago" },
  ],
};

const statusColor = (s: string) => ({
  "In Progress":       "bg-blue-50 text-blue-700",
  "Awaiting Approval": "bg-slate-100 text-slate-600",
  "Awaiting Parts":    "bg-slate-100 text-slate-600",
  "Open":              "bg-blue-50 text-blue-700",
  "Ready for Signoff": "bg-slate-800 text-white",
}[s] || "bg-slate-100 text-slate-500");

const statusDot = (s: string) => ({
  "In Progress":       "bg-blue-500",
  "Awaiting Approval": "bg-slate-400",
  "Awaiting Parts":    "bg-slate-400",
  "Open":              "bg-blue-500",
  "Ready for Signoff": "bg-white",
}[s] || "bg-slate-300");

/* ─── Props ──────────────────────────────────────────────── */
type WOPartLine = { id: string; pn: string; desc: string; qty: number; price: number; total: number; vendor?: string; requestOnly?: boolean };

interface Props {
  selectedWOId: string | null;
  setSelectedWOId: (v: string | null) => void;
  woPartsById: Record<string, WOPartLine[]>;
  setWoPartsById: React.Dispatch<React.SetStateAction<Record<string, WOPartLine[]>>>;
  woPartSearch: string;
  setWoPartSearch: (v: string) => void;
  woPartResults: ReturnType<typeof usePartsStore>["savedParts"];
  setWoPartResults: (v: ReturnType<typeof usePartsStore>["savedParts"]) => void;
  showWOPartSearch: boolean;
  setShowWOPartSearch: React.Dispatch<React.SetStateAction<boolean>>;
  woPartSearching: boolean;
  setWoPartSearching: (v: boolean) => void;
  woRequestPart: string;
  setWoRequestPart: (v: string) => void;
  woRequestNote: string;
  setWoRequestNote: (v: string) => void;
  woNoteText: string;
  setWoNoteText: (v: string) => void;
  woThreadNotes: Record<string, { id: string; content: string; ts: string }[]>;
  setWoThreadNotes: React.Dispatch<React.SetStateAction<Record<string, { id: string; content: string; ts: string }[]>>>;
  isRestrictedMechanic: boolean;
  activeMechanic: { name: string; permissions: Record<string, boolean> };
}

export function MechanicWorkOrdersTab(props: Props) {
  const {
    selectedWOId, setSelectedWOId,
    woPartsById, setWoPartsById,
    woPartSearch, setWoPartSearch,
    woPartResults, setWoPartResults,
    showWOPartSearch, setShowWOPartSearch,
    woPartSearching, setWoPartSearching,
    woRequestPart, setWoRequestPart,
    woRequestNote, setWoRequestNote,
    woNoteText, setWoNoteText,
    woThreadNotes, setWoThreadNotes,
    isRestrictedMechanic,
    activeMechanic,
  } = props;

  const { savedParts, deductStock } = usePartsStore();

  const WOS = isRestrictedMechanic
    ? ALL_WOS.filter((w) => w.mechanic.includes(activeMechanic.name))
    : ALL_WOS;

  const selectedWO = WOS.find(w => w.wo === selectedWOId) || null;
  const woParts = selectedWOId ? (woPartsById[selectedWOId] || []) : [];

  const handleWOPartSearch = (q: string) => {
    setWoPartSearch(q);
    if (!q.trim()) { setWoPartResults([]); return; }
    setWoPartSearching(true);
    setTimeout(() => {
      const results = savedParts.filter(p =>
        p.pn.toLowerCase().includes(q.toLowerCase()) ||
        p.desc.toLowerCase().includes(q.toLowerCase()) ||
        p.manufacturer.toLowerCase().includes(q.toLowerCase())
      );
      setWoPartResults(results);
      setWoPartSearching(false);
    }, 300);
  };

  const addPartToWO = (part: typeof savedParts[0]) => {
    if (!selectedWOId) return;
    const newLine: WOPartLine = { id: `wop-${Date.now()}`, pn: part.pn, desc: part.desc, qty: 1, price: part.ourRate, total: part.ourRate, vendor: part.vendor };
    setWoPartsById(prev => ({ ...prev, [selectedWOId]: [...(prev[selectedWOId] || []), newLine] }));
    deductStock(part.id, 1);
    setWoPartSearch(""); setWoPartResults([]);
    toast.success(`${part.pn} added to ${selectedWOId}`, { description: `Stock updated · ${part.qtyInStock - 1} remaining` });
  };

  const requestPart = () => {
    if (!selectedWOId || !woRequestPart.trim()) return;
    const newLine: WOPartLine = { id: `req-${Date.now()}`, pn: "REQUEST", desc: woRequestPart.trim(), qty: 1, price: 0, total: 0, vendor: "", requestOnly: true };
    setWoPartsById(prev => ({ ...prev, [selectedWOId]: [...(prev[selectedWOId] || []), newLine] }));
    setWoRequestPart(""); setWoRequestNote(""); setShowWOPartSearch(false);
    toast.success("Part request submitted", { description: woRequestPart.trim() });
  };

  const removeWOPart = (woId: string, lineId: string) => {
    setWoPartsById(prev => ({ ...prev, [woId]: (prev[woId] || []).filter(l => l.id !== lineId) }));
  };

  const getAvatarColor = (name: string) => {
    const palette = ["bg-blue-600","bg-violet-600","bg-emerald-600","bg-amber-500","bg-rose-600","bg-teal-600"];
    const h = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return palette[h % palette.length];
  };
  const getInitials = (name: string) => name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex-1 flex min-h-0">
      {/* ── Left: WO list ── */}
      <div className={`${selectedWO ? "w-[280px]" : "flex-1 max-w-2xl mx-auto p-6"} shrink-0 border-r border-border flex flex-col bg-white`}>
        {!selectedWO && (
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Work Orders</h2>
              <p className="text-[12px] text-muted-foreground">{WOS.length} active{isRestrictedMechanic ? " · assigned to you" : ""}</p>
            </div>
            <Link href="/maintenance" className="flex items-center gap-1.5 text-[12px] text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
              <ExternalLink className="w-3.5 h-3.5" /> Maintenance Hub
            </Link>
          </div>
        )}
        {selectedWO && (
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Work Orders</h2>
            <p className="text-[11px] text-muted-foreground">{WOS.length} active</p>
          </div>
        )}
        <div className={`${selectedWO ? "flex-1 overflow-auto divide-y divide-border" : "space-y-3"}`}>
          {WOS.map((w) => (
            <button key={w.wo} onClick={() => setSelectedWOId(w.wo === selectedWOId ? null : w.wo)}
              className={`w-full text-left transition-colors ${
                selectedWO
                  ? `p-4 hover:bg-muted/20 ${selectedWOId === w.wo ? "bg-primary/5 border-l-2 border-primary" : ""}`
                  : `bg-white rounded-xl border border-border p-5 block hover:shadow-sm hover:border-primary/20`
              }`}>
              <div className={`flex items-start justify-between gap-2 ${selectedWO ? "mb-1" : "mb-3"}`}>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-foreground ${selectedWO ? "text-[13px]" : "text-[15px]"}`} style={{ fontWeight: 700 }}>{w.wo}</span>
                    <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${statusColor(w.status)}`} style={{ fontWeight: 600 }}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot(w.status)}`} />
                      {w.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{w.tail} · {w.customer}</div>
                </div>
                {!selectedWO && <div className="text-right shrink-0"><div className="text-[11px] text-muted-foreground">Due</div><div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{w.due}</div></div>}
              </div>
              {!selectedWO && (
                <>
                  <p className="text-[13px] text-muted-foreground mb-3">{w.desc}</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1"><span className="text-[11px] text-muted-foreground">Progress</span><span className="text-[11px]" style={{ fontWeight: 600 }}>{w.progress}%</span></div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${w.progress}%` }} /></div>
                    </div>
                  </div>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: WO detail ── */}
      {selectedWO ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Compact header */}
          <div className="bg-white border-b border-border px-5 py-3 flex items-center gap-3 shrink-0">
            <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{selectedWO.wo}</span>
            <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${statusColor(selectedWO.status)}`} style={{ fontWeight: 600 }}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot(selectedWO.status)}`} />
              {selectedWO.status}
            </span>
            <span className="text-[11px] text-muted-foreground">{selectedWO.tail} · {selectedWO.customer}</span>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/maintenance" className="flex items-center gap-1.5 text-[11px] text-primary border border-primary/20 px-2.5 py-1.5 rounded-lg hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
                <ExternalLink className="w-3 h-3" /> Full WO
              </Link>
              <button onClick={() => setSelectedWOId(null)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Progress strip */}
          <div className="shrink-0 bg-white border-b border-border px-5 py-2 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${selectedWO.progress}%` }} />
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0">{selectedWO.progress}% · {selectedWO.mechanic}</span>
          </div>

          {/* iMessage Thread */}
          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3" style={{ background: "#F2F2F7" }}>
            {(WO_ACTIVITY[selectedWO.wo] || []).map((act) => {
              if (act.type === "system" || act.type === "status") {
                return (
                  <div key={act.id} className="flex justify-center py-1">
                    <div className="text-[10px] text-slate-500 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                      {act.content} · {act.ts}
                    </div>
                  </div>
                );
              }
              const isOwnerVisible = act.visibility === "owner-visible";
              const isAI = act.type === "ai-summary";
              const bubbleClass = isOwnerVisible
                ? "bg-[#2563EB] text-white"
                : isAI
                ? "bg-[#EFF6FF] text-slate-800 border border-blue-100"
                : "bg-white text-foreground border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)]";
              const chipClass = isOwnerVisible ? "bg-white/25 text-white/90" : "bg-slate-100 text-slate-600";
              return (
                <motion.div key={act.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex items-end gap-2 group ${isOwnerVisible ? "flex-row-reverse" : ""}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] ${isAI ? "bg-primary" : getAvatarColor(act.author)}`} style={{ fontWeight: 700 }}>
                    {isAI ? <Bot className="w-3.5 h-3.5" /> : getInitials(act.author)}
                  </div>
                  <div className={`min-w-0 flex flex-col ${isOwnerVisible ? "items-end" : "items-start"} max-w-[78%]`}>
                    <div className={`flex items-center gap-1.5 mb-1 px-1 ${isOwnerVisible ? "flex-row-reverse" : ""}`}>
                      <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>{act.author}</span>
                      {act.role && <span className="text-[10px] text-muted-foreground/60">{act.role}</span>}
                      {isOwnerVisible && <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Owner</span>}
                    </div>
                    <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed w-fit ${isOwnerVisible ? "rounded-br-sm" : "rounded-bl-sm"} ${bubbleClass}`}>
                      {isAI ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[11px] text-primary" style={{ fontWeight: 600 }}>AI Summary</span>
                          </div>
                          <div className="text-[12px] text-slate-600 leading-relaxed">{act.content}</div>
                        </div>
                      ) : <span>{act.content}</span>}
                      {act.chip && (
                        <div className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] ${chipClass}`} style={{ fontWeight: 600 }}>
                          <Package className="w-3 h-3" />{act.chip}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground/50 mt-1 px-1">{act.ts}</span>
                  </div>
                </motion.div>
              );
            })}

            {/* User-added notes */}
            {(woThreadNotes[selectedWO.wo] || []).map((note) => (
              <motion.div key={note.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-end gap-2 flex-row-reverse">
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 text-white text-[10px]" style={{ fontWeight: 700 }}>
                  {getInitials(activeMechanic.name)}
                </div>
                <div className="flex flex-col items-end max-w-[78%]">
                  <div className="flex items-center gap-1.5 mb-1 px-1 flex-row-reverse">
                    <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>{activeMechanic.name}</span>
                  </div>
                  <div className="rounded-2xl rounded-br-sm px-4 py-3 text-[13px] leading-relaxed bg-[#2563EB] text-white">{note.content}</div>
                  <span className="text-[10px] text-muted-foreground/50 mt-1 px-1">{note.ts}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Parts summary bar */}
          {woParts.length > 0 && (
            <div className="shrink-0 bg-white border-t border-slate-100 px-4 py-2 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[12px] text-muted-foreground">{woParts.length} part line{woParts.length !== 1 ? "s" : ""} added</span>
              <button onClick={() => setShowWOPartSearch(p => !p)} className="ml-auto text-[11px] text-primary" style={{ fontWeight: 500 }}>
                {showWOPartSearch ? "Hide" : "Manage Parts"}
              </button>
            </div>
          )}

          {/* Parts panel */}
          <AnimatePresence>
            {showWOPartSearch && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="shrink-0 bg-white border-t border-border overflow-hidden max-h-64 overflow-y-auto">
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2 bg-primary/5 border border-primary/15 rounded-lg px-3 py-2">
                    <Lock className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                    <span className="text-[11px] text-primary/80">Searching from inventory &amp; saved parts only</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-[#F2F2F7] rounded-xl px-3 py-2">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <input autoFocus value={woPartSearch} onChange={e => handleWOPartSearch(e.target.value)}
                        placeholder="Search by P/N or description..." className="flex-1 text-[12px] outline-none bg-transparent" />
                      {woPartSearching && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
                    </div>
                    <button onClick={() => { setShowWOPartSearch(false); setWoPartSearch(""); setWoPartResults([]); }}
                      className="px-3 py-2 rounded-xl border border-border text-[11px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                      Close
                    </button>
                  </div>
                  {woPartResults.length > 0 && (
                    <div className="space-y-1.5">
                      {woPartResults.map(part => (
                        <div key={part.id} className="flex items-center gap-3 bg-white rounded-lg border border-border px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-foreground" style={{ fontWeight: 700 }}>{part.pn}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${part.qtyInStock > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`} style={{ fontWeight: 600 }}>
                                {part.qtyInStock > 0 ? `${part.qtyInStock} in stock` : "Out of stock"}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">{part.desc} · ${part.ourRate.toFixed(2)}/ea</div>
                          </div>
                          <button onClick={() => addPartToWO(part)} disabled={part.qtyInStock === 0}
                            className="flex items-center gap-1 text-[11px] bg-primary text-white px-2.5 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0" style={{ fontWeight: 600 }}>
                            <Plus className="w-3 h-3" /> Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {woPartSearch && woPartResults.length === 0 && !woPartSearching && (
                    <div className="text-center py-4 border border-dashed border-border rounded-xl">
                      <Package className="w-7 h-7 mx-auto mb-2 text-muted-foreground/30" />
                      <div className="text-[12px] text-muted-foreground" style={{ fontWeight: 500 }}>Not in inventory or saved parts</div>
                      <button onClick={() => {
                        if (!selectedWOId || !woPartSearch.trim()) return;
                        const newLine: WOPartLine = { id: `manual-${Date.now()}`, pn: "MANUAL", desc: woPartSearch.trim(), qty: 1, price: 0, total: 0, vendor: "" };
                        setWoPartsById(prev => ({ ...prev, [selectedWOId]: [...(prev[selectedWOId] || []), newLine] }));
                        setWoPartSearch(""); setWoPartResults([]); setShowWOPartSearch(false);
                        toast.success("Part line added", { description: "Set qty and rate in the table below" });
                      }} className="mt-2 text-[11px] text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors" style={{ fontWeight: 600 }}>
                        + Add as Line Item (set price manually)
                      </button>
                    </div>
                  )}
                  <div className="border-t border-border pt-3">
                    <div className="text-[11px] text-foreground mb-2" style={{ fontWeight: 600 }}>Request a Part</div>
                    <div className="space-y-2">
                      <input value={woRequestPart} onChange={e => setWoRequestPart(e.target.value)} placeholder="Part number or description..."
                        className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
                      <input value={woRequestNote} onChange={e => setWoRequestNote(e.target.value)} placeholder="Notes (optional)..."
                        className="w-full border border-border rounded-lg px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
                      <button onClick={requestPart} disabled={!woRequestPart.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white py-2 rounded-lg text-[12px] hover:bg-amber-700 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
                        <AlertTriangle className="w-3.5 h-3.5" /> Submit Part Request
                      </button>
                    </div>
                  </div>
                  <button onClick={() => { setShowWOPartSearch(false); setWoPartSearch(""); setWoPartResults([]); }}
                    className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground py-1 transition-colors">Cancel</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Add parts shortcut */}
          {woParts.length === 0 && !showWOPartSearch && (
            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-2">
              <button onClick={() => setShowWOPartSearch(true)} className="text-[11px] text-primary flex items-center gap-1.5" style={{ fontWeight: 500 }}>
                <Package className="w-3.5 h-3.5" /> Add parts to this WO
              </button>
            </div>
          )}

          {/* Parts list (bottom panel) */}
          {woParts.length > 0 && (
            <div className="shrink-0 border-t border-border bg-white max-h-52 overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left p-3 text-muted-foreground" style={{ fontWeight: 600 }}>Part / Description</th>
                    <th className="text-right p-3 text-muted-foreground w-16" style={{ fontWeight: 600 }}>Qty</th>
                    <th className="text-right p-3 text-muted-foreground w-20" style={{ fontWeight: 600 }}>Rate</th>
                    <th className="text-right p-3 text-muted-foreground w-20" style={{ fontWeight: 600 }}>Total</th>
                    <th className="w-8 p-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {woParts.map(line => (
                    <tr key={line.id} className="group hover:bg-muted/10">
                      <td className="p-3">
                        <div className="text-foreground" style={{ fontWeight: 500 }}>{line.desc}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          {line.pn !== "REQUEST" ? line.pn : ""}
                          {line.requestOnly && <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full text-[9px]" style={{ fontWeight: 600 }}>REQUESTED</span>}
                          {line.vendor && !line.requestOnly && <span className="text-muted-foreground/60">{line.vendor}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-right">{line.requestOnly ? <span className="text-muted-foreground">—</span> : (
                        <input type="number" min="1" value={line.qty}
                          onChange={e => { const qty = parseInt(e.target.value) || 1; setWoPartsById(prev => ({ ...prev, [selectedWOId!]: (prev[selectedWOId!] || []).map(l => l.id === line.id ? { ...l, qty, total: qty * l.price } : l) })); }}
                          className="w-14 text-right border border-transparent group-hover:border-border rounded px-1.5 py-0.5 text-[12px] outline-none focus:border-primary/40 bg-transparent focus:bg-white" style={{ fontWeight: 600 }} />
                      )}</td>
                      <td className="p-3 text-right">{line.requestOnly ? <span className="text-muted-foreground">—</span> : (
                        <input type="number" min="0" step="0.01" value={line.price}
                          onChange={e => { const price = parseFloat(e.target.value) || 0; setWoPartsById(prev => ({ ...prev, [selectedWOId!]: (prev[selectedWOId!] || []).map(l => l.id === line.id ? { ...l, price, total: l.qty * price } : l) })); }}
                          className="w-20 text-right border border-transparent group-hover:border-border rounded px-1.5 py-0.5 text-[12px] outline-none focus:border-primary/40 bg-transparent focus:bg-white" />
                      )}</td>
                      <td className="p-3 text-right" style={{ fontWeight: 600 }}>{line.requestOnly ? <span className="text-amber-600 text-[11px]">Pending</span> : `$${line.total.toFixed(2)}`}</td>
                      <td className="p-3">
                        <button onClick={() => removeWOPart(selectedWOId!, line.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {woParts.filter(l => !l.requestOnly).length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border bg-muted/10">
                      <td className="p-3 text-[12px] text-foreground" colSpan={3} style={{ fontWeight: 700 }}>Parts Subtotal</td>
                      <td className="p-3 text-right text-[13px] text-foreground" style={{ fontWeight: 700 }}>
                        ${woParts.filter(l => !l.requestOnly).reduce((s, l) => s + l.total, 0).toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Composer bar */}
          <div className="shrink-0 bg-white border-t border-slate-200 px-3 py-3 flex items-end gap-2">
            <div className="flex-1 bg-[#F2F2F7] rounded-2xl px-4 py-2.5">
              <input
                value={woNoteText}
                onChange={e => setWoNoteText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey && woNoteText.trim()) {
                    e.preventDefault();
                    const newNote = { id: `wn-${Date.now()}`, content: woNoteText.trim(), ts: "just now" };
                    setWoThreadNotes(prev => ({ ...prev, [selectedWO.wo]: [...(prev[selectedWO.wo] || []), newNote] }));
                    setWoNoteText("");
                    toast.success("Note added to thread");
                  }
                }}
                placeholder="Add internal note…"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <button
              disabled={!woNoteText.trim()}
              onClick={() => {
                if (!woNoteText.trim()) return;
                const newNote = { id: `wn-${Date.now()}`, content: woNoteText.trim(), ts: "just now" };
                setWoThreadNotes(prev => ({ ...prev, [selectedWO.wo]: [...(prev[selectedWO.wo] || []), newNote] }));
                setWoNoteText("");
                toast.success("Note added to thread");
              }}
              className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center disabled:opacity-30 hover:bg-[#2563EB]/90 transition-colors shrink-0">
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
