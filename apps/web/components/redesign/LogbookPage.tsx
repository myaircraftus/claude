"use client";

import { useState } from "react";
import {
  FileText, Plus, Search, Filter, Download, Printer, Eye, Edit3, Trash2,
  Plane, Calendar, Lock, Unlock, Shield, CheckCircle, X, Bot, Sparkles, Send
} from "lucide-react";
import { useDataStore, type LogbookEntry } from "./workspace/DataStore";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

/* ─── Seed logbook entries ─────────────────────────────── */
const _now = new Date();
const _daysAgo = (d: number) => new Date(_now.getTime() - d * 86400000).toISOString();

const SEED_ENTRIES: LogbookEntry[] = [];

export function LogbookPage() {
  const { logbookEntries, deleteLogbookEntry, updateLogbookEntry } = useDataStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [aircraftFilter, setAircraftFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Merge DataStore entries with seed data
  const allEntries: LogbookEntry[] = logbookEntries;

  const filteredEntries = allEntries.filter((entry) => {
    const matchesSearch =
      entry.aircraft.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.mechanic.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || entry.status === statusFilter;
    const matchesAircraft = aircraftFilter === "all" || entry.aircraft === aircraftFilter;
    return matchesSearch && matchesStatus && matchesAircraft;
  });

  const selectedEntry = allEntries.find((e) => e.id === selectedId) ?? null;
  const aircraftList = Array.from(new Set(allEntries.map((e) => e.aircraft)));

  const isSeedEntry = (_id: string) => false;

  const handleSign = (entry: LogbookEntry) => {
    if (isSeedEntry(entry.id)) {
      toast.info("Demo entry — create your own logbook entries to sign them.");
      return;
    }
    updateLogbookEntry(entry.id, {
      status: "signed",
      signature: entry.mechanic,
      signatureDate: new Date().toISOString(),
    });
    toast.success(`${entry.type} — signed and sealed by ${entry.mechanic}.`);
  };

  const handleDelete = (entry: LogbookEntry) => {
    if (isSeedEntry(entry.id)) {
      toast.info("Demo entry — create your own entries to delete them.");
      return;
    }
    if (confirm(`Delete logbook entry for ${entry.aircraft}?`)) {
      deleteLogbookEntry(entry.id);
      if (selectedId === entry.id) setSelectedId(null);
      toast.success("Entry deleted.");
    }
  };

  const statusColors: Record<string, string> = {
    draft: "bg-amber-50 text-amber-700",
    signed: "bg-emerald-50 text-emerald-700",
    archived: "bg-slate-100 text-slate-600",
  };

  const stats = {
    total: allEntries.length,
    draft: allEntries.filter((e) => e.status === "draft").length,
    signed: allEntries.filter((e) => e.status === "signed").length,
  };

  return (
    <div className="h-full flex overflow-hidden bg-[#F7F8FA]">
      {/* Left panel */}
      <div className="w-[300px] shrink-0 border-r border-border flex flex-col bg-white">
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[16px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Logbook</h1>
            <button
              onClick={() => toast.info("Open a work order and go to the Logbook tab to generate a new entry.")}
              className="inline-flex items-center gap-1.5 bg-[#0A1628] text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-[#0A1628]/90 transition-colors"
              style={{ fontWeight: 600 }}
            >
              <Sparkles className="w-3.5 h-3.5" /> New Entry
            </button>
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg border border-border px-2.5 py-1.5 mb-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entries..."
              className="flex-1 bg-transparent text-[12px] outline-none"
            />
          </div>
          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={aircraftFilter}
              onChange={(e) => setAircraftFilter(e.target.value)}
              className="flex-1 text-[11px] bg-white border border-border rounded-lg px-2 py-1.5 outline-none cursor-pointer"
            >
              <option value="all">All Aircraft</option>
              {aircraftList.map((ac) => <option key={ac}>{ac}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 text-[11px] bg-white border border-border rounded-lg px-2 py-1.5 outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="signed">Signed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {/* Stats mini row */}
        <div className="grid grid-cols-3 border-b border-border shrink-0">
          {[
            { l: "Total", v: stats.total, c: "text-foreground" },
            { l: "Draft", v: stats.draft, c: "text-amber-600" },
            { l: "Signed", v: stats.signed, c: "text-emerald-600" },
          ].map((s) => (
            <div key={s.l} className="px-2 py-2 text-center">
              <div className={`text-[15px] ${s.c}`} style={{ fontWeight: 700 }}>{s.v}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-[13px]">No entries match</p>
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const active = entry.id === selectedId;
              return (
                <button
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={`w-full text-left px-4 py-3.5 border-b border-border hover:bg-muted/20 transition-colors ${active ? "bg-primary/5 border-l-[3px] border-l-primary" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Plane className="w-3 h-3" />{entry.aircraft}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColors[entry.status] || "bg-muted text-muted-foreground"}`} style={{ fontWeight: 600 }}>
                      {entry.status === "signed" ? <Lock className="w-2.5 h-2.5 inline mr-0.5" /> : null}{entry.status}
                    </span>
                  </div>
                  <div className="text-[12px] text-foreground mb-0.5 truncate" style={{ fontWeight: 600 }}>{entry.type}</div>
                  <div className="text-[11px] text-muted-foreground">{entry.mechanic} · {new Date(entry.date).toLocaleDateString()}</div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right detail panel */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {selectedEntry ? (
            <motion.div
              key={selectedEntry.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-6 py-5 max-w-3xl"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-[20px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{selectedEntry.type}</h2>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full flex items-center gap-1 ${statusColors[selectedEntry.status] || "bg-muted text-muted-foreground"}`} style={{ fontWeight: 600 }}>
                      {selectedEntry.status === "signed" ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      {selectedEntry.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[13px] text-muted-foreground">{selectedEntry.aircraft} · {selectedEntry.makeModel} · {new Date(selectedEntry.date).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedEntry.status === "draft" && (
                    <button
                      onClick={() => handleSign(selectedEntry)}
                      className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-[12px] hover:bg-emerald-700 transition-colors"
                      style={{ fontWeight: 600 }}
                    >
                      <Lock className="w-3.5 h-3.5" /> Sign & Finalize
                    </button>
                  )}
                  <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                  <button className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                    <Send className="w-3.5 h-3.5" /> Email
                  </button>
                  {selectedEntry.status === "draft" && (
                    <button onClick={() => handleDelete(selectedEntry)} className="p-2 border border-border rounded-lg hover:bg-red-50 hover:border-red-200 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Signed banner */}
              {selectedEntry.status === "signed" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-emerald-600" />
                    <span className="text-[12px] text-emerald-700" style={{ fontWeight: 700 }}>DIGITALLY SIGNED & SEALED — FAR 43.9 / 43.11</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-[24px] text-blue-800" style={{ fontFamily: "'Georgia', serif", fontStyle: "italic" }}>
                      {selectedEntry.mechanic}
                    </div>
                    <div className="text-[11px] text-emerald-700">
                      <div style={{ fontWeight: 600 }}>{selectedEntry.mechanic}</div>
                      <div>{selectedEntry.certificateNumber}</div>
                      {selectedEntry.signatureDate && <div>{new Date(selectedEntry.signatureDate).toLocaleString()}</div>}
                    </div>
                  </div>
                </div>
              )}

              {/* Aircraft info */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { l: "Aircraft", v: selectedEntry.aircraft },
                  { l: "Make / Model", v: selectedEntry.makeModel.split(" ").slice(0, 3).join(" ") },
                  { l: "Serial #", v: selectedEntry.serial || "—" },
                  { l: "Total Time", v: selectedEntry.totalTime ? `${selectedEntry.totalTime} hrs` : "—" },
                ].map((f) => (
                  <div key={f.l} className="bg-white rounded-xl border border-border p-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1" style={{ fontWeight: 600 }}>{f.l}</div>
                    <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{f.v}</div>
                  </div>
                ))}
              </div>

              {/* Entry body */}
              <div className="bg-white rounded-xl border border-border overflow-hidden mb-4">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Maintenance Description</span>
                  {selectedEntry.status === "draft" && (
                    <div className="flex items-center gap-1.5 text-[11px] text-primary">
                      <Bot className="w-3.5 h-3.5" /> AI-drafted · editable
                    </div>
                  )}
                </div>
                {selectedEntry.status === "draft" ? (
                  <textarea
                    defaultValue={selectedEntry.body}
                    rows={14}
                    className="w-full px-4 py-3 text-[12px] font-mono leading-relaxed outline-none resize-none bg-white text-foreground"
                  />
                ) : (
                  <div className="px-4 py-3 text-[12px] font-mono leading-relaxed whitespace-pre-wrap text-foreground bg-slate-50">
                    {selectedEntry.body}
                  </div>
                )}
              </div>

              {/* Mechanic info */}
              <div className="bg-white rounded-xl border border-border p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 700 }}>Certificate of Return to Service</div>
                <div className="grid grid-cols-2 gap-4 text-[12px]">
                  <div>
                    <div className="text-muted-foreground mb-0.5">Mechanic</div>
                    <div className="text-foreground" style={{ fontWeight: 600 }}>{selectedEntry.mechanic}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">Certificate #</div>
                    <div className="text-foreground" style={{ fontWeight: 600 }}>{selectedEntry.certificateNumber}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="no-entry"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex items-center justify-center text-muted-foreground"
            >
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-[14px]" style={{ fontWeight: 500 }}>Select a logbook entry</p>
                <p className="text-[12px] mt-1">or generate one from a work order</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
