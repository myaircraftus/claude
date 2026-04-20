"use client";

import { useState } from "react";
import { Search, Package, X, Plus, CheckCircle, ExternalLink, Star, Loader2, AlertTriangle, Globe, Database } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { usePartsStore, type SavedPart, type OnlinePartResult } from "./workspace/PartsStore";

interface PickedPart {
  pn: string;
  desc: string;
  qty: number;
  price: number;
  total: number;
  vendor?: string;
  condition?: string;
  savedPartId?: string; // if from inventory
}

interface PartPickerModalProps {
  aircraft?: string;
  mode?: "inventory-only" | "all"; // inventory-only for WO, all for invoice
  onAdd: (part: PickedPart) => void;
  onClose: () => void;
}

export function PartPickerModal({ aircraft, mode = "all", onAdd, onClose }: PartPickerModalProps) {
  const { savedParts, searchInventory, searchOnlineParts, addPart } = usePartsStore();

  const [tab, setTab] = useState<"inventory" | "online">("inventory");
  const [query, setQuery] = useState("");
  const [invResults, setInvResults] = useState<SavedPart[]>(savedParts);
  const [onlineResults, setOnlineResults] = useState<OnlinePartResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  // For qty confirm
  const [pending, setPending] = useState<{ part: PickedPart } | null>(null);
  const [pendingQty, setPendingQty] = useState(1);

  const handleSearch = async () => {
    if (!query.trim()) { setInvResults(savedParts); return; }
    const inv = searchInventory(query);
    setInvResults(inv);
    if (tab === "online" || (mode === "all" && inv.length === 0)) {
      setLoading(true);
      const results = await searchOnlineParts(query, aircraft);
      setOnlineResults(results);
      setLoading(false);
      if (inv.length === 0 && mode === "all") setTab("online");
    }
  };

  const handleOnlineSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const results = await searchOnlineParts(query, aircraft);
    setOnlineResults(results);
    setLoading(false);
  };

  const confirmAdd = (part: PickedPart) => {
    setPending({ part });
    setPendingQty(part.qty || 1);
  };

  const finalAdd = () => {
    if (!pending) return;
    const final = { ...pending.part, qty: pendingQty, total: parseFloat((pending.part.price * pendingQty).toFixed(2)) };
    onAdd(final);
    setPending(null);
  };

  const handleSaveOnlinePart = async (p: OnlinePartResult) => {
    setSavingId(p.id);
    await new Promise(r => setTimeout(r, 600));
    addPart({
      pn: p.pn, altPn: p.altPn, desc: p.desc, category: "Misc",
      manufacturer: p.manufacturer, vendor: p.vendor, sourceUrl: p.sourceUrl,
      condition: p.condition, costPrice: p.price, ourRate: Math.round(p.price * 1.35 * 100) / 100,
      qtyInStock: 0, minStock: 1, notes: "",
    });
    setSavedIds(prev => [...prev, p.id]);
    setSavingId(null);
  };

  const fitBadge = (fit: string) => ({
    "Confirmed": "bg-emerald-50 text-emerald-700",
    "Likely fit — verify": "bg-amber-50 text-amber-700",
    "Check compatibility": "bg-red-50 text-red-700",
  }[fit] || "bg-slate-100 text-slate-600");

  const condBadge = (c: string) => ({
    "New": "bg-emerald-50 text-emerald-700",
    "New-PMA": "bg-blue-50 text-blue-700",
    "Overhauled": "bg-amber-50 text-amber-700",
    "Serviceable": "bg-slate-100 text-slate-600",
    "Used": "bg-slate-100 text-slate-500",
  }[c] || "bg-slate-100 text-slate-500");

  return (
    <>
      {/* ── Main modal ── */}
      <AnimatePresence>
        <motion.div
          key="part-picker-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            key="part-picker-content"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-[680px] overflow-hidden flex flex-col"
            style={{ maxHeight: "82vh" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-[#0A1628]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <Package className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>Add Part</div>
                  <div className="text-white/50 text-[11px]">{aircraft ? `Aircraft: ${aircraft}` : "Search parts & inventory"}</div>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            {/* Search bar */}
            <div className="px-5 pt-4 pb-3 border-b border-border bg-[#F7F8FA]">
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-white border border-border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/20">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { tab === "online" ? handleOnlineSearch() : handleSearch(); } }}
                    placeholder="Search by part # or description…"
                    className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
                    autoFocus
                  />
                  {query && <button onClick={() => { setQuery(""); setInvResults(savedParts); setOnlineResults([]); }} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
                </div>
                <button
                  onClick={() => { tab === "online" ? handleOnlineSearch() : handleSearch(); }}
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-white rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-3">
                <button
                  onClick={() => setTab("inventory")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors ${tab === "inventory" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted/40"}`}
                  style={{ fontWeight: tab === "inventory" ? 600 : 400 }}
                >
                  <Database className="w-3.5 h-3.5" /> Inventory ({savedParts.length})
                </button>
                {mode === "all" && (
                  <button
                    onClick={() => { setTab("online"); if (query && onlineResults.length === 0) handleOnlineSearch(); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors ${tab === "online" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted/40"}`}
                    style={{ fontWeight: tab === "online" ? 600 : 400 }}
                  >
                    <Globe className="w-3.5 h-3.5" /> Online Parts Search
                  </button>
                )}
                {mode === "inventory-only" && (
                  <span className="ml-2 flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg" style={{ fontWeight: 500 }}>
                    <AlertTriangle className="w-3 h-3" /> WO: search inventory or request part
                  </span>
                )}
              </div>
            </div>

            {/* Results area */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Inventory tab ── */}
              {tab === "inventory" && (
                <div className="divide-y divide-border">
                  {invResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                      <Package className="w-10 h-10 mb-3 opacity-25" />
                      <div className="text-[13px]" style={{ fontWeight: 500 }}>No parts match "{query}"</div>
                      {mode === "all" && (
                        <button
                          onClick={() => { setTab("online"); if (query) handleOnlineSearch(); }}
                          className="mt-3 text-[12px] text-primary flex items-center gap-1 hover:underline" style={{ fontWeight: 500 }}>
                          <Globe className="w-3.5 h-3.5" /> Search online vendors instead
                        </button>
                      )}
                      {mode === "inventory-only" && (
                        <button
                          onClick={() => { onAdd({ pn: query, desc: `Request: ${query}`, qty: 1, price: 0, total: 0, vendor: "Request" }); onClose(); }}
                          className="mt-3 flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-xl text-[12px] hover:bg-amber-100 transition-colors" style={{ fontWeight: 600 }}>
                          <AlertTriangle className="w-3.5 h-3.5" /> Request This Part
                        </button>
                      )}
                    </div>
                  ) : invResults.map(p => (
                    <div key={p.id} className="px-5 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{p.pn}</span>
                          {p.altPn && <span className="text-[11px] text-muted-foreground">/ {p.altPn}</span>}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${condBadge(p.condition)}`} style={{ fontWeight: 600 }}>{p.condition}</span>
                        </div>
                        <div className="text-[12px] text-muted-foreground truncate">{p.desc}</div>
                        <div className="text-[11px] text-muted-foreground/70 mt-0.5">{p.category} · {p.manufacturer}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>${p.ourRate.toFixed(2)}</div>
                        <div className={`text-[11px] mt-0.5 ${p.qtyInStock <= p.minStock ? "text-red-600" : "text-emerald-600"}`} style={{ fontWeight: 500 }}>
                          {p.qtyInStock === 0 ? "Out of stock" : `${p.qtyInStock} in stock`}
                        </div>
                      </div>
                      <button
                        onClick={() => confirmAdd({ pn: p.pn, desc: p.desc, qty: 1, price: p.ourRate, total: p.ourRate, vendor: p.vendor, condition: p.condition, savedPartId: p.id })}
                        disabled={p.qtyInStock === 0}
                        className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-[12px] hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
                        style={{ fontWeight: 600 }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Online tab ── */}
              {tab === "online" && (
                <div>
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      </div>
                      <div className="text-[13px]" style={{ fontWeight: 500 }}>Searching {onlineResults.length > 0 ? "vendor catalogs" : "all aviation vendors"}…</div>
                      <p className="text-[11px] text-center max-w-xs">Checking Aircraft Spruce, Aviall, Skygeek, and more</p>
                    </div>
                  ) : onlineResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
                      <Globe className="w-10 h-10 mb-3 opacity-25" />
                      <div className="text-[13px]" style={{ fontWeight: 500 }}>Enter a part # or description to search online</div>
                    </div>
                  ) : (
                    <div>
                      <div className="px-5 py-2.5 bg-[#F7F8FA] border-b border-border text-[11px] text-muted-foreground">
                        Found <span style={{ fontWeight: 600 }} className="text-foreground">{onlineResults.length}</span> listings across aviation vendors
                        {aircraft && <> · Filtered for <span style={{ fontWeight: 600 }} className="text-foreground">{aircraft}</span></>}
                      </div>
                      <div className="divide-y divide-border">
                        {onlineResults.map(p => (
                          <div key={p.id} className="px-5 py-4">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-[18px] shrink-0">{p.vendorLogo}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                                  <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{p.pn}</span>
                                  {p.altPn && <span className="text-[11px] text-muted-foreground">/ {p.altPn}</span>}
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${condBadge(p.condition)}`} style={{ fontWeight: 600 }}>{p.condition}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${fitBadge(p.fit)}`} style={{ fontWeight: 600 }}>{p.fit}</span>
                                </div>
                                <div className="text-[12px] text-muted-foreground mb-1 truncate">{p.desc}</div>
                                <div className="flex items-center gap-3 text-[11px]">
                                  <span style={{ fontWeight: 600 }} className="text-foreground">{p.vendor}</span>
                                  <div className="flex items-center gap-0.5 text-amber-500">
                                    <Star className="w-3 h-3 fill-current" />
                                    <span className="text-foreground">{p.rating.toFixed(1)}</span>
                                    <span className="text-muted-foreground">({p.reviews})</span>
                                  </div>
                                  <span className="text-emerald-600" style={{ fontWeight: 500 }}>{p.stock}</span>
                                  <span className="text-muted-foreground">{p.leadTime}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>${p.price.toFixed(2)}</div>
                                <div className="flex items-center justify-end gap-1.5 mt-1.5">
                                  <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[11px] text-primary hover:underline" style={{ fontWeight: 500 }}>
                                    <ExternalLink className="w-3 h-3" /> View
                                  </a>
                                  {savedIds.includes(p.id) ? (
                                    <span className="flex items-center gap-1 text-[11px] text-emerald-600" style={{ fontWeight: 600 }}>
                                      <CheckCircle className="w-3 h-3" /> Saved
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleSaveOnlinePart(p)}
                                      disabled={savingId === p.id}
                                      className="text-[11px] text-muted-foreground border border-border px-2 py-0.5 rounded-lg hover:border-primary hover:text-primary transition-colors"
                                      style={{ fontWeight: 500 }}
                                    >
                                      {savingId === p.id ? "Saving…" : "Save"}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => confirmAdd({ pn: p.pn, desc: p.desc, qty: 1, price: p.price, total: p.price, vendor: p.vendor, condition: p.condition })}
                                    className="flex items-center gap-1 bg-primary text-white px-3 py-1 rounded-lg text-[11px] hover:bg-primary/90 transition-colors"
                                    style={{ fontWeight: 600 }}
                                  >
                                    <Plus className="w-3 h-3" /> Add
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Request part footer (inventory-only mode) */}
            {mode === "inventory-only" && tab === "inventory" && (
              <div className="px-5 py-3 border-t border-border bg-[#F7F8FA] flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">Part not in inventory?</span>
                <button
                  onClick={() => { onAdd({ pn: query || "TBD", desc: query ? `Request: ${query}` : "Parts request", qty: 1, price: 0, total: 0, vendor: "Pending — Request" }); onClose(); }}
                  className="flex items-center gap-1.5 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl hover:bg-amber-100 transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Submit Parts Request
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* ── Qty confirm overlay ── */}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-[70] flex items-center justify-center"
            onClick={() => setPending(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl p-6 w-72"
            >
              <div className="text-[14px] text-foreground mb-1" style={{ fontWeight: 700 }}>Confirm Quantity</div>
              <div className="text-[12px] text-muted-foreground mb-4">{pending.part.pn} · {pending.part.desc}</div>
              <div className="flex items-center gap-3 mb-5">
                <button onClick={() => setPendingQty(q => Math.max(1, q - 1))} className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-foreground hover:bg-muted/30">−</button>
                <input type="number" value={pendingQty} onChange={e => setPendingQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 text-center border border-border rounded-xl py-2 text-[16px] outline-none focus:ring-2 focus:ring-primary/20" style={{ fontWeight: 700 }} />
                <button onClick={() => setPendingQty(q => q + 1)} className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-foreground hover:bg-muted/30">+</button>
              </div>
              <div className="flex items-center justify-between mb-4 text-[13px]">
                <span className="text-muted-foreground">Unit price</span>
                <span style={{ fontWeight: 600 }}>${pending.part.price.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between mb-5 text-[14px]">
                <span style={{ fontWeight: 700 }}>Total</span>
                <span style={{ fontWeight: 700 }} className="text-primary">${(pending.part.price * pendingQty).toFixed(2)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPending(null)} className="flex-1 py-2.5 border border-border rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Cancel</button>
                <button onClick={finalAdd} className="flex-1 py-2.5 bg-primary text-white rounded-xl text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                  <CheckCircle className="w-4 h-4 inline mr-1.5" />Add to Line
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
