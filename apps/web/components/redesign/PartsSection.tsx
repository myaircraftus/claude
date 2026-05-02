"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import {
  Package, Search, Plus, X, Edit3, Trash2, ExternalLink,
  Star, Loader2, AlertTriangle, CheckCircle, Save, Plane,
  Sparkles, Globe, ShieldCheck, TrendingDown, BarChart3,
  ArrowRight, ChevronDown, ChevronUp, RefreshCw, Database,
  DollarSign, Archive, Info, Zap, Filter, List, LayoutGrid,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  usePartsStore, PART_CATEGORIES,
  type SavedPart, type OnlinePartResult, type PartCategory, type PartCondition,
} from "./workspace/PartsStore";
import { useDataStore } from "./workspace/DataStore";
import { lookupAircraftByNNumber } from "./faaRegistryService";
import { toast } from "sonner";

/* ─── Category colors ──────────────────────────────────────────── */
const CAT_COLORS: Record<string, string> = {
  "Airframe": "bg-blue-50 text-blue-600",
  "Powerplant": "bg-orange-50 text-orange-600",
  "Avionics / Electrical": "bg-violet-50 text-violet-600",
  "Landing Gear / Brakes": "bg-red-50 text-red-600",
  "Fuel System": "bg-amber-50 text-amber-600",
  "Propeller": "bg-cyan-50 text-cyan-600",
  "Cabin / Interior": "bg-pink-50 text-pink-600",
  "Hydraulics": "bg-teal-50 text-teal-600",
  "Instruments": "bg-indigo-50 text-indigo-600",
  "Filters & Fluids": "bg-emerald-50 text-emerald-600",
  "Fasteners & Hardware": "bg-slate-100 text-slate-600",
  "Misc": "bg-muted text-muted-foreground",
};

const COND_BADGE: Record<string, string> = {
  "New": "bg-emerald-50 text-emerald-700",
  "New-PMA": "bg-blue-50 text-blue-700",
  "Overhauled": "bg-amber-50 text-amber-700",
  "Serviceable": "bg-slate-100 text-slate-600",
  "Used": "bg-slate-100 text-slate-500",
};

/* ─── FAA Registry Mock (AI Search) ────────────────────────────── */
interface FaaAircraftRecord {
  tail: string;
  manufacturer?: string;
  modelCode?: string;
  modelFull?: string;
  year?: number;
  serial?: string;
  engine?: string;
  engineHP?: number | null;
  prop?: string;
  owner?: string;
  regDate?: string;
  category?: string;
  contextSource?: "faa" | "system";
}

/* ─── AI Part Search Engine (simulated) ─────────────────────────── */
interface AIPartResult {
  pn: string; altPn?: string; desc: string; manufacturer: string;
  vendor: string; vendorIcon: string; price: number; condition: string;
  stock: string; leadTime: string; fit: "Confirmed" | "Likely fit — verify" | "Check compatibility";
  sourceUrl: string; rating: number; reviews: number;
  imageUrl?: string | null;
}

interface AIResolutionMeta {
  partNumbers: string[];
  alternates: string[];
  confidence: "high" | "medium" | "low";
  description?: string;
  reasoning?: string;
}

interface AISearchResult {
  faaData: FaaAircraftRecord | null;
  aiSummary: string;
  partType: string;
  results: AIPartResult[];
  totalBeforeFilters?: number;
  aiResolution?: AIResolutionMeta | null;
  searchDurationMs?: number;
}

const VENDOR_LIST = [
  { name: "Aircraft Spruce", icon: "🛩️", url: "https://www.aircraftspruce.com" },
  { name: "Aviall / Boeing", icon: "✈️", url: "https://aviall.com" },
  { name: "Skygeek", icon: "🔧", url: "https://www.skygeek.com" },
  { name: "Wicks Aircraft", icon: "⚙️", url: "https://www.wicksaircraft.com" },
  { name: "eBay Aviation", icon: "🛒", url: "https://www.ebay.com/sch/aviation-parts" },
  { name: "CPT Aviation", icon: "🔩", url: "https://www.cptaviation.com" },
];

function vendorIconFor(name: string): string {
  const hit = VENDOR_LIST.find((v) => name.toLowerCase().includes(v.name.toLowerCase()));
  return hit?.icon ?? "🔧";
}

function toTitleCase(value?: string | null): string {
  if (!value) return "Unknown";
  return value
    .split(/[\s-]+/)
    .map((chunk) => chunk ? chunk[0].toUpperCase() + chunk.slice(1).toLowerCase() : "")
    .join(" ");
}

function mapOfferToResult(offer: any): AIPartResult {
  const price =
    typeof offer.totalEstimatedPrice === "number"
      ? offer.totalEstimatedPrice
      : typeof offer.price === "number"
        ? offer.price
        : 0;
  const condition = toTitleCase(offer.condition);
  const compatibility = Array.isArray(offer.compatibilityText) ? offer.compatibilityText.join(" ") : "";
  const fit = compatibility ? "Likely fit — verify" : "Check compatibility";

  return {
    pn: offer.partNumber || offer.title || "Unknown",
    altPn: undefined,
    desc: offer.title || offer.description || "Parts listing",
    manufacturer: offer.brand || "Unknown",
    vendor: offer.vendorName || offer.vendorDomain || "Unknown vendor",
    vendorIcon: vendorIconFor(String(offer.vendorName || offer.vendorDomain || "")),
    price,
    condition: condition === "Unknown" ? "Serviceable" : condition,
    stock: offer.stockLabel || "Check availability",
    leadTime: offer.shippingSpeedLabel || "Varies",
    fit,
    sourceUrl: offer.productUrl,
    rating: typeof offer.rating === "number" ? offer.rating : 4.2,
    reviews: typeof offer.ratingCount === "number" ? offer.ratingCount : 0,
    imageUrl: typeof offer.imageUrl === "string" ? offer.imageUrl : null,
  };
}

interface PartsAircraftContext {
  tail_number: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  serial_number?: string | null;
  engine_model?: string | null;
  ownerName?: string | null;
}

/* ─── Filter types — mirror lib/parts/types.ts ──────────────────── */
type ConditionFilter = "any" | "new" | "pma" | "overhauled" | "serviceable" | "used";
type ShippingFilter = "any" | "in_stock" | "next_day" | "two_day" | "this_week";
type VendorBucketFilter = "any" | "aviation_trusted";
type SortMode = "best_fit" | "price_asc" | "price_desc" | "fastest" | "highest_rated";

interface PartsFilters {
  condition: ConditionFilter;
  priceMin: number | null;
  priceMax: number | null;
  shipping: ShippingFilter;
  vendorBucket: VendorBucketFilter;
  brand: string;
  sortBy: SortMode;
}

const DEFAULT_FILTERS: PartsFilters = {
  condition: "any",
  priceMin: null,
  priceMax: null,
  shipping: "any",
  vendorBucket: "any",
  brand: "",
  sortBy: "best_fit",
};

async function runContextualPartSearch({
  tail,
  query,
  aircraftId,
  aircraftContext,
  filters,
}: {
  tail: string;
  query: string;
  aircraftId?: string | null;
  aircraftContext?: PartsAircraftContext | null;
  filters?: PartsFilters | null;
}): Promise<AISearchResult> {
  const tailUp = tail.toUpperCase().trim();
  let faaData: FaaAircraftRecord | null = null;
  let requestAircraftContext: Record<string, unknown> | null = null;

  if (aircraftContext) {
    faaData = {
      tail: aircraftContext.tail_number || tailUp,
      manufacturer: aircraftContext.make || undefined,
      modelCode: aircraftContext.model || undefined,
      modelFull: [aircraftContext.make, aircraftContext.model].filter(Boolean).join(" ") || aircraftContext.model || undefined,
      year: aircraftContext.year ?? undefined,
      serial: aircraftContext.serial_number ?? undefined,
      engine: aircraftContext.engine_model ?? undefined,
      owner: aircraftContext.ownerName ?? undefined,
      category: "Saved aircraft profile",
      contextSource: "system",
    };
  } else if (tailUp) {
    const lookup = await lookupAircraftByNNumber(tailUp).catch(() => null);
    if (lookup?.found) {
      faaData = {
        tail: lookup.aircraft.nNumber || tailUp,
        manufacturer: lookup.aircraft.manufacturer || undefined,
        modelCode: lookup.aircraft.model || undefined,
        modelFull: [lookup.aircraft.manufacturer, lookup.aircraft.model].filter(Boolean).join(" ") || lookup.aircraft.model || undefined,
        year: lookup.aircraft.year ?? undefined,
        serial: lookup.aircraft.serialNumber ?? undefined,
        engine: [lookup.engine?.manufacturer, lookup.engine?.model].filter(Boolean).join(" ") || lookup.engine?.model || undefined,
        engineHP: lookup.engine?.horsepower ?? null,
        prop: lookup.propeller ?? undefined,
        owner: lookup.registrant?.name ?? undefined,
        category: lookup.aircraft.category ?? undefined,
        contextSource: lookup.source === "live" ? "faa" : "system",
      };
    }
  }

  if (faaData) {
    requestAircraftContext = {
      tailNumber: faaData.tail,
      make: faaData.manufacturer || "Unknown",
      model: faaData.modelCode || faaData.modelFull || "Unknown",
      year: faaData.year ?? null,
      serialNumber: faaData.serial ?? null,
      engineMake: faaData.engine?.split(" ")[0] ?? null,
      engineModel: faaData.engine ?? null,
      propModel: faaData.prop ?? null,
    };
  }

  // Translate UI filters to API contract — strip empty values so backend
  // defaults apply when the user hasn't tweaked anything.
  const apiFilters: Record<string, unknown> = {};
  if (filters) {
    if (filters.condition && filters.condition !== "any") apiFilters.condition = filters.condition;
    if (filters.priceMin != null) apiFilters.priceMin = filters.priceMin;
    if (filters.priceMax != null) apiFilters.priceMax = filters.priceMax;
    if (filters.shipping && filters.shipping !== "any") apiFilters.shipping = filters.shipping;
    if (filters.vendorBucket && filters.vendorBucket !== "any") apiFilters.vendorBucket = filters.vendorBucket;
    if (filters.brand) apiFilters.brand = filters.brand;
    if (filters.sortBy && filters.sortBy !== "best_fit") apiFilters.sortBy = filters.sortBy;
  }

  const startedAt = Date.now();
  const res = await fetch("/api/parts/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      aircraft_id: aircraftId ?? null,
      aircraft_context: requestAircraftContext,
      limit: 40,
      filters: Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
    }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || "Parts search failed");
  }

  const payload = await res.json().catch(() => ({}));
  const offers = Array.isArray(payload?.offers) ? payload.offers : [];
  const results = offers.map(mapOfferToResult);
  const searchDurationMs = Date.now() - startedAt;

  const aiResolution = payload?.aiResolution;
  const partType = aiResolution?.partNumbers?.[0] || query;

  let aiSummary = "";
  if (faaData) {
    const modelLabel = [faaData.year, faaData.modelFull].filter(Boolean).join(" ");
    if (faaData.contextSource === "system") {
      aiSummary = `Using your saved aircraft profile, **${tailUp}** is a **${modelLabel || "tracked aircraft"}** ` +
        `${faaData.serial ? `(Serial: ${faaData.serial}) ` : ""}` +
        `${faaData.engine ? `powered by **${faaData.engine}**` : ""}. ` +
        `${faaData.owner ? `Assigned owner/customer: ${faaData.owner}. ` : ""}` +
        `\n\nWe used your in-system aircraft context to resolve **${partType}** and rank likely compatible parts.`;
    } else {
      aiSummary = `Based on FAA Registry, **${tailUp}** is a **${modelLabel || "registered aircraft"}** ` +
        `${faaData.serial ? `(Serial: ${faaData.serial}) ` : ""}` +
        `${faaData.engine ? `powered by **${faaData.engine}**` : ""}. ` +
        `${faaData.owner ? `Registered to: ${faaData.owner}. ` : ""}` +
        `\n\nWe used this aircraft context to resolve **${partType}** and rank compatible parts from trusted vendors.`;
    }
  } else if (aiResolution?.partNumbers?.length) {
    aiSummary = `AI resolved **"${query}"** to part number(s) **${aiResolution.partNumbers.join(", ")}** and searched aviation suppliers for availability and pricing.`;
  } else {
    aiSummary = `Showing parts results matching "${query}". Select a saved aircraft or enter a valid custom N-number to apply aircraft context.`;
  }

  const aiResolutionMeta: AIResolutionMeta | null = aiResolution
    ? {
        partNumbers: Array.isArray(aiResolution.partNumbers) ? aiResolution.partNumbers : [],
        alternates: Array.isArray(aiResolution.alternates) ? aiResolution.alternates : [],
        confidence: ["high", "medium", "low"].includes(aiResolution.confidence) ? aiResolution.confidence : "low",
        description: typeof aiResolution.description === "string" ? aiResolution.description : undefined,
        reasoning: typeof aiResolution.reasoning === "string" ? aiResolution.reasoning : undefined,
      }
    : null;

  return {
    faaData,
    aiSummary,
    partType,
    results,
    totalBeforeFilters: typeof payload?.totalBeforeFilters === "number" ? payload.totalBeforeFilters : undefined,
    aiResolution: aiResolutionMeta,
    searchDurationMs,
  };
}

/* ─── Edit Part Modal ──────────────────────────────────────────── */
function EditPartModal({ part, onSave, onClose }: {
  part: Partial<SavedPart> & { id?: string };
  onSave: (p: any) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    pn: part.pn || "",
    altPn: part.altPn || "",
    desc: part.desc || "",
    category: (part.category || "Misc") as PartCategory,
    manufacturer: part.manufacturer || "",
    vendor: part.vendor || "",
    sourceUrl: part.sourceUrl || "",
    condition: (part.condition || "New") as PartCondition,
    costPrice: part.costPrice ?? 0,
    ourRate: part.ourRate ?? 0,
    qtyInStock: part.qtyInStock ?? 0,
    minStock: part.minStock ?? 1,
    notes: part.notes || "",
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const markup = form.costPrice > 0 ? (((form.ourRate - form.costPrice) / form.costPrice) * 100).toFixed(0) : "—";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
        transition={{ duration: 0.14 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[540px] overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-[#0A1628]">
          <div className="flex items-center gap-2.5">
            <Package className="w-4 h-4 text-white/70" />
            <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>
              {part.id ? "Edit Part" : "Add New Part"}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* Part Number row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Part Number *</label>
              <input value={form.pn} onChange={e => set("pn", e.target.value.toUpperCase())}
                placeholder="e.g. CH48110-1"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 tracking-wider bg-[#FAFAFA]" style={{ fontWeight: 600 }} />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Alt P/N</label>
              <input value={form.altPn} onChange={e => set("altPn", e.target.value.toUpperCase())}
                placeholder="Optional cross-reference"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 tracking-wider bg-[#FAFAFA]" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Description *</label>
            <input value={form.desc} onChange={e => set("desc", e.target.value)}
              placeholder="Part description"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 bg-[#FAFAFA]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Category</label>
              <select value={form.category} onChange={e => set("category", e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none bg-[#FAFAFA] focus:ring-2 focus:ring-primary/20">
                {PART_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Condition</label>
              <select value={form.condition} onChange={e => set("condition", e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none bg-[#FAFAFA] focus:ring-2 focus:ring-primary/20">
                {["New", "New-PMA", "Overhauled", "Serviceable", "Used"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Manufacturer</label>
              <input value={form.manufacturer} onChange={e => set("manufacturer", e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 bg-[#FAFAFA]" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Vendor / Supplier</label>
              <input value={form.vendor} onChange={e => set("vendor", e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 bg-[#FAFAFA]" />
            </div>
          </div>

          {/* Pricing row */}
          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-3">
            <div className="text-[11px] text-blue-700 uppercase tracking-wide" style={{ fontWeight: 700 }}>Pricing & Inventory</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Cost Price ($)</label>
                <input type="number" min="0" step="0.01" value={form.costPrice}
                  onChange={e => set("costPrice", parseFloat(e.target.value) || 0)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                  Our Rate ($) <span className="text-emerald-600 ml-1">{markup !== "—" ? `+${markup}%` : ""}</span>
                </label>
                <input type="number" min="0" step="0.01" value={form.ourRate}
                  onChange={e => set("ourRate", parseFloat(e.target.value) || 0)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Qty in Stock</label>
                <input type="number" min="0" value={form.qtyInStock}
                  onChange={e => set("qtyInStock", parseInt(e.target.value) || 0)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Min Stock (reorder alert)</label>
                <input type="number" min="0" value={form.minStock}
                  onChange={e => set("minStock", parseInt(e.target.value) || 0)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Vendor URL</label>
                <input value={form.sourceUrl} onChange={e => set("sourceUrl", e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-border rounded-xl px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 bg-white" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide" style={{ fontWeight: 600 }}>Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
              rows={2} placeholder="Storage bin, lead time notes, compatible aircraft…"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20 bg-[#FAFAFA]" />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border bg-[#F7F8FA]">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
            Cancel
          </button>
          <button
            onClick={() => { if (!form.pn.trim() || !form.desc.trim()) return; onSave(form); onClose(); }}
            disabled={!form.pn.trim() || !form.desc.trim()}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
            <Save className="w-3.5 h-3.5" /> Save Part
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── AI Search Phase Indicator ─────────────────────────────────── */
function PhaseLoader({ phase }: { phase: "faa" | "ai" | "done" }) {
  const phases = [
    { id: "faa", label: "FAA Registry lookup", icon: Database },
    { id: "ai", label: "AI cross-referencing parts", icon: Sparkles },
    { id: "done", label: "Results ready", icon: CheckCircle },
  ];
  const current = phases.findIndex(p => p.id === phase);
  return (
    <div className="flex items-center gap-2">
      {phases.map((p, i) => {
        const Icon = p.icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={p.id} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] transition-all ${
              done ? "bg-emerald-100 text-emerald-700" :
              active ? "bg-blue-100 text-blue-700 animate-pulse" :
              "bg-slate-100 text-slate-400"
            }`} style={{ fontWeight: active || done ? 600 : 400 }}>
              {active ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
              {p.label}
            </div>
            {i < phases.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Filter chips bar (Google-style) ──────────────────────────── */
function FilterChipsBar({
  filters,
  onChange,
  onPriceChange,
  onReset,
  showAdvanced,
  activeCount,
}: {
  filters: PartsFilters;
  onChange: <K extends keyof PartsFilters>(key: K, value: PartsFilters[K]) => void;
  onPriceChange: (min: number | null, max: number | null) => void;
  onReset: () => void;
  showAdvanced: boolean;
  activeCount: number;
}) {
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Sort by */}
        <ChipDropdown
          icon={<TrendingDown className="w-3.5 h-3.5" />}
          label="Sort"
          value={
            filters.sortBy === "best_fit"
              ? "Best fit"
              : filters.sortBy === "price_asc"
                ? "Lowest price"
                : filters.sortBy === "price_desc"
                  ? "Highest price"
                  : filters.sortBy === "fastest"
                    ? "Fastest delivery"
                    : "Highest rated"
          }
          options={[
            { value: "best_fit", label: "Best fit" },
            { value: "price_asc", label: "Lowest price" },
            { value: "fastest", label: "Fastest delivery" },
            { value: "highest_rated", label: "Highest rated" },
            { value: "price_desc", label: "Highest price" },
          ]}
          onSelect={(v) => onChange("sortBy", v as SortMode)}
          active={filters.sortBy !== "best_fit"}
        />

        {/* Condition */}
        <ChipDropdown
          icon={<ShieldCheck className="w-3.5 h-3.5" />}
          label="Condition"
          value={
            filters.condition === "any"
              ? "Any"
              : filters.condition === "new"
                ? "New"
                : filters.condition === "pma"
                  ? "PMA / FAA-approved"
                  : filters.condition === "overhauled"
                    ? "Overhauled"
                    : filters.condition === "serviceable"
                      ? "Serviceable"
                      : "Used"
          }
          options={[
            { value: "any", label: "Any condition" },
            { value: "new", label: "New" },
            { value: "pma", label: "PMA / FAA-approved" },
            { value: "overhauled", label: "Overhauled" },
            { value: "serviceable", label: "Serviceable" },
            { value: "used", label: "Used" },
          ]}
          onSelect={(v) => onChange("condition", v as ConditionFilter)}
          active={filters.condition !== "any"}
        />

        {/* Shipping speed */}
        <ChipDropdown
          icon={<Zap className="w-3.5 h-3.5" />}
          label="Delivery"
          value={
            filters.shipping === "any"
              ? "Any"
              : filters.shipping === "in_stock"
                ? "In stock"
                : filters.shipping === "next_day"
                  ? "Next-day"
                  : filters.shipping === "two_day"
                    ? "2-day"
                    : "This week"
          }
          options={[
            { value: "any", label: "Any speed" },
            { value: "in_stock", label: "In stock now" },
            { value: "next_day", label: "Next-day" },
            { value: "two_day", label: "2-day" },
            { value: "this_week", label: "This week" },
          ]}
          onSelect={(v) => onChange("shipping", v as ShippingFilter)}
          active={filters.shipping !== "any"}
        />

        {/* Vendor bucket — proxy for "trusted/aviation only" */}
        <ChipDropdown
          icon={<Globe className="w-3.5 h-3.5" />}
          label="Vendor"
          value={filters.vendorBucket === "any" ? "All vendors" : "Aviation-trusted only"}
          options={[
            { value: "any", label: "All vendors" },
            { value: "aviation_trusted", label: "Aviation-trusted only" },
          ]}
          onSelect={(v) => onChange("vendorBucket", v as VendorBucketFilter)}
          active={filters.vendorBucket !== "any"}
        />

        {/* Price range chips */}
        <PriceChip
          min={filters.priceMin}
          max={filters.priceMax}
          onChange={onPriceChange}
        />

        {activeCount > 0 && (
          <button
            onClick={onReset}
            className="text-[11px] text-white/65 hover:text-white px-2"
            style={{ fontWeight: 500 }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Advanced filters expansion (brand input) */}
      {showAdvanced && (
        <div className="bg-white/8 border border-white/15 rounded-xl px-3 py-2.5 flex items-center gap-2 text-[12px]">
          <span className="text-white/65 shrink-0">Brand:</span>
          <input
            value={filters.brand}
            onChange={(e) => onChange("brand", e.target.value)}
            placeholder="e.g. Champion, Tempest, Lycoming"
            className="flex-1 bg-transparent text-white outline-none placeholder:text-white/30 text-[12px]"
          />
        </div>
      )}
    </div>
  );
}

/* ─── Chip dropdown (compact, Google-Maps-style) ─────────────────── */
function ChipDropdown({
  icon,
  label,
  value,
  options,
  onSelect,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] border transition-colors ${
          active
            ? "bg-white text-slate-900 border-white"
            : "bg-white/10 text-white border-white/20 hover:bg-white/15 hover:border-white/30"
        }`}
        style={{ fontWeight: 600 }}
      >
        {icon}
        <span className={active ? "text-slate-900" : "text-white"}>{value}</span>
        <ChevronDown className={`w-3 h-3 ${active ? "text-slate-500" : "text-white/60"}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-30 min-w-[180px]">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-[12px] text-slate-900 hover:bg-slate-50 flex items-center justify-between"
              style={{ fontWeight: 500 }}
            >
              {opt.label}
              {value === opt.label && <CheckCircle className="w-3.5 h-3.5 text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PriceChip({
  min,
  max,
  onChange,
}: {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const active = min != null || max != null;
  const label =
    min != null && max != null
      ? `$${min}–$${max}`
      : min != null
        ? `From $${min}`
        : max != null
          ? `Under $${max}`
          : "Any price";

  const presets = [
    { label: "Under $50", min: null, max: 50 },
    { label: "$50 – $200", min: 50, max: 200 },
    { label: "$200 – $500", min: 200, max: 500 },
    { label: "Over $500", min: 500, max: null },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] border transition-colors ${
          active
            ? "bg-white text-slate-900 border-white"
            : "bg-white/10 text-white border-white/20 hover:bg-white/15 hover:border-white/30"
        }`}
        style={{ fontWeight: 600 }}
      >
        <DollarSign className={`w-3.5 h-3.5 ${active ? "text-slate-900" : "text-white"}`} />
        <span className={active ? "text-slate-900" : "text-white"}>{label}</span>
        <ChevronDown className={`w-3 h-3 ${active ? "text-slate-500" : "text-white/60"}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-30 w-[260px] p-3">
          <div className="grid grid-cols-2 gap-1.5 mb-2.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  onChange(p.min, p.max);
                  setOpen(false);
                }}
                className="text-[11px] px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700"
                style={{ fontWeight: 500 }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-200 pt-2.5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5" style={{ fontWeight: 700 }}>
              Custom range
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={min ?? ""}
                onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value), max)}
                placeholder="Min"
                className="flex-1 border border-slate-200 rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-blue-400"
              />
              <span className="text-slate-400 text-[11px]">to</span>
              <input
                type="number"
                value={max ?? ""}
                onChange={(e) => onChange(min, e.target.value === "" ? null : Number(e.target.value))}
                placeholder="Max"
                className="flex-1 border border-slate-200 rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-blue-400"
              />
            </div>
            {active && (
              <button
                onClick={() => {
                  onChange(null, null);
                  setOpen(false);
                }}
                className="w-full mt-2 text-[11px] text-blue-600 hover:text-blue-700 py-1"
                style={{ fontWeight: 600 }}
              >
                Clear price filter
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── AI Search Panel ───────────────────────────────────────────── */
function AISearchPanel({ onSavePart }: { onSavePart: (p: Partial<SavedPart>) => void }) {
  const { aircraft, customers } = useDataStore();
  const CUSTOM_AIRCRAFT_KEY = "__custom__";
  const defaultAircraftId = useMemo(() => aircraft[0]?.id ?? CUSTOM_AIRCRAFT_KEY, [aircraft]);
  const [selectedAircraftId, setSelectedAircraftId] = useState(defaultAircraftId);
  const [customTail, setCustomTail] = useState("");
  useEffect(() => {
    setSelectedAircraftId((prev) => (prev && prev !== CUSTOM_AIRCRAFT_KEY ? prev : defaultAircraftId));
  }, [defaultAircraftId]);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"idle" | "faa" | "ai" | "done">("idle");
  const [result, setResult] = useState<AISearchResult | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [expandedPn, setExpandedPn] = useState<string | null>(null);
  const [filters, setFilters] = useState<PartsFilters>(DEFAULT_FILTERS);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window === "undefined") return "list";
    return (window.localStorage.getItem("partsSearchViewMode") as "list" | "grid") || "list";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("partsSearchViewMode", viewMode);
    }
  }, [viewMode]);
  const selectedAircraft = useMemo(
    () => aircraft.find((item) => item.id === selectedAircraftId) ?? null,
    [aircraft, selectedAircraftId]
  );
  const selectedOwnerName = useMemo(() => {
    if (!selectedAircraft?.owner_customer_id) return null;
    return customers.find((customer) => customer.id === selectedAircraft.owner_customer_id)?.name ?? null;
  }, [customers, selectedAircraft]);
  const activeTail = selectedAircraft?.tail_number || customTail.trim().toUpperCase();
  const isCustomTailMode = selectedAircraftId === CUSTOM_AIRCRAFT_KEY;

  const handleSearch = async (overrideFilters?: PartsFilters) => {
    if (!query.trim()) return;
    setResult(null);
    setPhase("faa");
    try {
      setPhase("ai");
      const res = await runContextualPartSearch({
        tail: activeTail,
        query,
        aircraftId: selectedAircraft?.id ?? null,
        aircraftContext: selectedAircraft
          ? {
              tail_number: selectedAircraft.tail_number,
              make: selectedAircraft.make,
              model: selectedAircraft.model,
              year: selectedAircraft.year,
              serial_number: selectedAircraft.serial_number,
              engine_model: selectedAircraft.engine_model,
              ownerName: selectedOwnerName,
            }
          : null,
        filters: overrideFilters ?? filters,
      });
      setResult(res);
      setPhase("done");
    } catch (err: any) {
      setPhase("idle");
      toast.error("Parts search failed", { description: err?.message ?? "Try again in a moment." });
    }
  };

  /** Update one filter slot and immediately re-run the search if we already have results. */
  const updateFilter = <K extends keyof PartsFilters>(key: K, value: PartsFilters[K]) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (result || phase === "done") {
      // Re-run with the new filters; the backend handles strict P/N + conditions etc.
      handleSearch(next);
    }
  };

  /** Batched price update — sets both bounds in one render to avoid double-fetch. */
  const updatePriceRange = (min: number | null, max: number | null) => {
    const next = { ...filters, priceMin: min, priceMax: max };
    setFilters(next);
    if (result || phase === "done") handleSearch(next);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    if (result) handleSearch(DEFAULT_FILTERS);
  };

  const activeFilterCount =
    (filters.condition !== "any" ? 1 : 0) +
    (filters.shipping !== "any" ? 1 : 0) +
    (filters.vendorBucket !== "any" ? 1 : 0) +
    (filters.priceMin != null || filters.priceMax != null ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.sortBy !== "best_fit" ? 1 : 0);

  const handleSave = (r: AIPartResult) => {
    const key = `${r.pn}-${r.vendor}`;
    if (savedIds.has(key)) return;
    onSavePart({
      pn: r.pn, altPn: r.altPn, desc: r.desc, category: "Misc",
      manufacturer: r.manufacturer, vendor: r.vendor, sourceUrl: r.sourceUrl,
      condition: r.condition as PartCondition,
      costPrice: r.price, ourRate: Math.round(r.price * 1.35 * 100) / 100,
      qtyInStock: 0, minStock: 1,
    });
    setSavedIds(prev => new Set([...prev, key]));
    toast.success(`${r.pn} saved to Parts`, { description: `${r.vendor} · $${r.price.toFixed(2)}` });
  };

  const fitBadge = (fit: string) => ({
    "Confirmed": "bg-emerald-50 text-emerald-700",
    "Likely fit — verify": "bg-amber-50 text-amber-700",
    "Check compatibility": "bg-red-50 text-red-700",
  }[fit] || "bg-slate-100 text-slate-500");

  // Group results by part number — backend already applied filters + sort
  const grouped: Record<string, AIPartResult[]> = {};
  if (result) {
    for (const r of result.results) {
      if (!grouped[r.pn]) grouped[r.pn] = [];
      grouped[r.pn].push(r);
    }
  }

  const quickSearches = ["spark plug", "oil filter", "brake disc", "alternator", "tire", "magneto"];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search toolbar — Google-style wide centered search */}
      <div className="bg-gradient-to-br from-[#0A1628] to-[#1E3A5F] px-6 py-5 space-y-3.5 shrink-0">
        <div className="flex items-center justify-between gap-3 max-w-[1280px] mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[15px] text-white" style={{ fontWeight: 700 }}>AI Parts Search</div>
              <div className="text-[11px] text-white/50">FAA registry lookup + AI cross-reference across all aviation vendors</div>
            </div>
          </div>
          {result && (
            <button
              onClick={() => setShowAdvancedFilters((s) => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border transition-colors ${
                showAdvancedFilters
                  ? "bg-white/15 border-white/30 text-white"
                  : "bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
              style={{ fontWeight: 600 }}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center" style={{ fontWeight: 700 }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Wide Google-style search bar */}
        <div className="max-w-[1280px] mx-auto w-full">
          <div className="flex items-stretch gap-2 bg-white rounded-2xl shadow-lg overflow-hidden focus-within:ring-4 focus-within:ring-blue-500/30 transition-all">
            {/* Aircraft selector — compact pill on the left */}
            <div className="flex items-center gap-2 bg-slate-50 border-r border-slate-200 px-4 min-w-[210px] max-w-[260px]">
              <Plane className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={selectedAircraftId}
                onChange={(e) => setSelectedAircraftId(e.target.value)}
                className="flex-1 bg-transparent text-[13px] text-slate-900 outline-none min-w-0"
                style={{ fontWeight: 600 }}
              >
                {aircraft.map((item) => (
                  <option key={item.id} value={item.id} className="text-slate-900">
                    {item.tail_number}
                    {item.make || item.model ? ` — ${[item.make, item.model].filter(Boolean).join(" ")}` : ""}
                  </option>
                ))}
                <option value={CUSTOM_AIRCRAFT_KEY} className="text-slate-900">Custom N-number…</option>
              </select>
            </div>

            {/* Search input — flex-1 fills the rest */}
            <div className="flex items-center gap-2.5 px-4 flex-1 min-w-0">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Part # or plain English — e.g. CH48110-1, REM38E, spark plug for Lycoming O-320…"
                className="flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400 py-3.5"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    setResult(null);
                    setPhase("idle");
                  }}
                  className="text-slate-400 hover:text-slate-600 shrink-0"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Search button — Google-style on the right */}
            <button
              onClick={() => handleSearch()}
              disabled={phase === "faa" || phase === "ai" || !query.trim()}
              className="px-6 bg-[#2563EB] text-white text-[14px] hover:bg-blue-600 disabled:opacity-40 transition-colors flex items-center gap-2 shrink-0"
              style={{ fontWeight: 600 }}
            >
              {phase === "faa" || phase === "ai" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI Search
                </>
              )}
            </button>
          </div>
        </div>

        {isCustomTailMode && (
          <div className="max-w-[1280px] mx-auto w-full">
            <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 focus-within:border-white/40 focus-within:bg-white/15 transition-all">
              <Plane className="w-3.5 h-3.5 text-white/60 shrink-0" />
              <input
                value={customTail}
                onChange={(e) => setCustomTail(e.target.value.toUpperCase())}
                placeholder="Enter custom N-number"
                className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40 tracking-wider min-w-0"
                style={{ fontWeight: 600 }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
          </div>
        )}

        {!isCustomTailMode && (
          <div className="max-w-[1280px] mx-auto w-full flex items-center gap-2 text-[11px] text-white/65">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            Using saved aircraft context for {selectedAircraft?.tail_number}
            {selectedAircraft?.make || selectedAircraft?.model
              ? ` — ${[selectedAircraft?.make, selectedAircraft?.model].filter(Boolean).join(" ")}`
              : ""}
            {selectedAircraft?.engine_model ? ` · ${selectedAircraft.engine_model}` : ""}
          </div>
        )}

        {/* Quick searches */}
        {phase === "idle" && !result && (
          <div className="max-w-[1280px] mx-auto w-full flex flex-wrap gap-1.5">
            <span className="text-[11px] text-white/40 self-center">Try:</span>
            {quickSearches.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setQuery(q);
                }}
                className="text-[11px] bg-white/8 text-white/70 border border-white/15 px-2.5 py-1 rounded-full hover:bg-white/15 hover:text-white transition-colors"
                style={{ fontWeight: 500 }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Phase indicator */}
        {(phase === "faa" || phase === "ai" || phase === "done") && result === null && (
          <div className="max-w-[1280px] mx-auto w-full overflow-x-auto">
            <PhaseLoader phase={phase === "done" ? "done" : phase} />
          </div>
        )}
        {phase === "done" && result && (
          <div className="max-w-[1280px] mx-auto w-full">
            <PhaseLoader phase="done" />
          </div>
        )}

        {/* Google-style filter chips row — visible after results land */}
        {result && (
          <FilterChipsBar
            filters={filters}
            onChange={updateFilter}
            onPriceChange={updatePriceRange}
            onReset={resetFilters}
            showAdvanced={showAdvancedFilters}
            activeCount={activeFilterCount}
          />
        )}
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-auto bg-[#F7F8FA]">
        {/* Idle state */}
        {phase === "idle" && !result && (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0A1628] to-[#2563EB] flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>
                AI-Powered Aviation Parts Search
              </div>
              <p className="text-[13px] text-muted-foreground mt-2 max-w-md">
                Enter an N-number and a part number or plain English description.
                Our AI will use your saved aircraft profile or an FAA registry lookup to identify the exact specs,
                and search across Aircraft Spruce, Aviall, Skygeek, eBay, Wicks, and more.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2 w-full max-w-md">
              {[
                { icon: Database, label: "FAA Registry", desc: "Aircraft type + engine verified" },
                { icon: Sparkles, label: "AI Analysis", desc: "Compatibility cross-reference" },
                { icon: Globe, label: "Multi-Vendor", desc: "Best prices across all suppliers" },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="bg-white rounded-xl border border-border p-3 text-center">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {(phase === "faa" || phase === "ai") && (
          <div className="flex flex-col items-center justify-center h-full gap-5 p-8">
            <div className="flex gap-4">
              {["Aircraft Spruce", "Aviall", "Skygeek", "eBay Aviation"].map((v, i) => (
                <div key={v} className="flex flex-col items-center gap-2 animate-pulse" style={{ animationDelay: `${i * 0.12}s` }}>
                  <div className="w-12 h-12 rounded-xl bg-slate-200" />
                  <div className="text-[10px] text-slate-400">{v}</div>
                </div>
              ))}
            </div>
            <div className="text-center">
              <div className="text-[15px] text-foreground" style={{ fontWeight: 600 }}>
                {phase === "faa"
                  ? isCustomTailMode
                    ? `Looking up ${activeTail || "your N-number"} in FAA registry…`
                    : `Loading saved aircraft context for ${activeTail || "selected aircraft"}…`
                  : "AI is cross-referencing parts database…"}
              </div>
              <p className="text-[12px] text-muted-foreground mt-1">
                {phase === "faa"
                  ? "Retrieving aircraft make, model, engine, and serial number"
                  : `Finding compatible parts for ${result?.faaData?.modelFull || activeTail || "your aircraft"} across all vendors`}
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {phase === "done" && result && (
          <div className="p-5 space-y-4 max-w-[1280px] mx-auto">
            {/* FAA + AI context card */}
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              {/* FAA Registry strip */}
              {result.faaData ? (
                <div className="bg-gradient-to-r from-[#0A1628] to-[#1E3A5F] px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                          {result.faaData.contextSource === "system" ? "SAVED AIRCRAFT CONTEXT" : "FAA REGISTRY VERIFIED"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[12px]">
                        <div><span className="text-white/50">Aircraft</span> <span className="text-white" style={{ fontWeight: 600 }}>{result.faaData.year} {result.faaData.modelFull}</span></div>
                        <div><span className="text-white/50">Serial</span> <span className="text-white" style={{ fontWeight: 600 }}>{result.faaData.serial}</span></div>
                        <div>
                          <span className="text-white/50">Engine</span>{" "}
                          <span className="text-white" style={{ fontWeight: 600 }}>
                            {result.faaData.engine}
                            {result.faaData.engineHP ? ` (${result.faaData.engineHP} HP)` : ""}
                          </span>
                        </div>
                        <div><span className="text-white/50">Propeller</span> <span className="text-white" style={{ fontWeight: 600 }}>{result.faaData.prop}</span></div>
                        <div><span className="text-white/50">Category</span> <span className="text-white/80">{result.faaData.category}</span></div>
                        <div><span className="text-white/50">Registered to</span> <span className="text-white/80">{result.faaData.owner}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-[12px] text-amber-800">Aircraft context could not be verified. Showing general aviation parts matching your query.</span>
                </div>
              )}
              {/* AI analysis */}
              <div className="px-5 py-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-violet-600 mb-1 uppercase tracking-wide" style={{ fontWeight: 700 }}>AI Analysis — Generated with AI · Verify before ordering</div>
                  <p className="text-[13px] text-foreground leading-relaxed">
                    {result.aiSummary.split("**").map((chunk, i) =>
                      i % 2 === 1 ? <strong key={i}>{chunk}</strong> : chunk
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Result summary — Google-style "About X results" */}
            <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground flex-wrap">
              <span>
                About <span className="text-foreground" style={{ fontWeight: 600 }}>{result.results.length}</span>
                {typeof result.totalBeforeFilters === "number" && result.totalBeforeFilters > result.results.length
                  ? <> of {result.totalBeforeFilters}</>
                  : null}
                {" "}listings across <span className="text-foreground" style={{ fontWeight: 600 }}>{Object.keys(grouped).length}</span> part{Object.keys(grouped).length !== 1 ? "s" : ""}
                {typeof result.searchDurationMs === "number"
                  ? <> · {(result.searchDurationMs / 1000).toFixed(2)}s</>
                  : null}
              </span>
              <div className="flex items-center gap-2">
                {result.aiResolution?.partNumbers && result.aiResolution.partNumbers.length > 0 && (
                  <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full text-[11px]" style={{ fontWeight: 600 }}>
                    <Sparkles className="w-3 h-3" />
                    P/N: {result.aiResolution.partNumbers.slice(0, 2).join(", ")}
                    {result.aiResolution.partNumbers.length > 2 ? ` +${result.aiResolution.partNumbers.length - 2}` : ""}
                    <span className={`ml-1 px-1 rounded text-[9px] ${
                      result.aiResolution.confidence === "high" ? "bg-emerald-100 text-emerald-800" :
                      result.aiResolution.confidence === "medium" ? "bg-amber-100 text-amber-800" :
                      "bg-slate-100 text-slate-700"
                    }`}>{result.aiResolution.confidence}</span>
                  </span>
                )}
                {activeFilterCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-[11px]"
                    style={{ fontWeight: 600 }}
                  >
                    <X className="w-3 h-3" /> Clear filters ({activeFilterCount})
                  </button>
                )}
                {/* List / Grid view toggle */}
                <div className="inline-flex items-center bg-white border border-border rounded-lg p-0.5 shadow-sm">
                  <button
                    onClick={() => setViewMode("list")}
                    aria-label="List view"
                    className={`p-1.5 rounded-md transition-colors ${
                      viewMode === "list"
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    aria-label="Grid view"
                    className={`p-1.5 rounded-md transition-colors ${
                      viewMode === "grid"
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Results — switches between LIST and GRID layouts */}
            {viewMode === "list" ? (
              <>
                {Object.entries(grouped).map(([pn, listings]) => {
                  const isExpanded = expandedPn === pn || expandedPn === null;
                  const topListing = listings[0];
                  return (
                    <div key={pn} className="bg-white rounded-xl border border-border overflow-hidden">
                      {/* Part header */}
                      <button
                        onClick={() => setExpandedPn(isExpanded && expandedPn === pn ? null : pn)}
                        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors text-left"
                      >
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${fitBadge(topListing.fit)}`} style={{ fontWeight: 600 }}>{topListing.fit}</span>
                            <span className="text-[15px] text-foreground tracking-wide" style={{ fontWeight: 700 }}>{pn}</span>
                            {topListing.altPn && <span className="text-[12px] text-muted-foreground">/ {topListing.altPn}</span>}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${COND_BADGE[topListing.condition] || "bg-slate-100 text-slate-500"}`} style={{ fontWeight: 600 }}>{topListing.condition}</span>
                          </div>
                          <div className="text-[13px] text-foreground">{topListing.desc}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {topListing.manufacturer} · {listings.length} vendor{listings.length !== 1 ? "s" : ""} · from ${Math.min(...listings.map(l => l.price)).toFixed(2)}
                          </div>
                        </div>
                        {isExpanded && expandedPn === pn
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                      </button>

                      {/* Vendor listings */}
                      <AnimatePresence>
                        {(expandedPn === pn || expandedPn === null) && (
                          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                            className="overflow-hidden border-t border-border">
                            <div className="divide-y divide-border">
                              {listings.map((listing, idx) => {
                                const saveKey = `${listing.pn}-${listing.vendor}`;
                                const isSaved = savedIds.has(saveKey);
                                return (
                                  <motion.div key={`${listing.pn}-${listing.vendor}-${idx}`}
                                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.04 }}
                                    className="px-5 py-3.5 flex items-center gap-4 hover:bg-muted/10 transition-colors">
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-border flex items-center justify-center text-[18px] shrink-0 overflow-hidden">
                                      {listing.imageUrl
                                        ? <img src={listing.imageUrl} alt="" className="w-full h-full object-contain" />
                                        : listing.vendorIcon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{listing.vendor}</span>
                                        <div className="flex items-center gap-0.5 text-amber-500">
                                          <Star className="w-3 h-3 fill-current" />
                                          <span className="text-[11px] text-foreground">{listing.rating.toFixed(1)}</span>
                                          <span className="text-[10px] text-muted-foreground">({listing.reviews})</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className={`text-[11px] ${listing.stock === "In Stock" ? "text-emerald-600" : "text-amber-600"}`} style={{ fontWeight: 500 }}>
                                          {listing.stock}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">· Ships {listing.leadTime}</span>
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <div className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>${listing.price.toFixed(2)}</div>
                                      <div className="text-[10px] text-muted-foreground">each</div>
                                    </div>
                                    <div className="flex flex-col gap-1.5 shrink-0">
                                      <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1 border border-primary/20 text-primary px-2.5 py-1.5 rounded-lg text-[11px] hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
                                        <ExternalLink className="w-3 h-3" /> Order
                                      </a>
                                      {isSaved ? (
                                        <div className="flex items-center gap-1 text-[11px] text-emerald-600 justify-center px-1" style={{ fontWeight: 600 }}>
                                          <CheckCircle className="w-3.5 h-3.5" /> Saved
                                        </div>
                                      ) : (
                                        <button onClick={() => handleSave(listing)}
                                          className="flex items-center gap-1 bg-primary text-white px-2.5 py-1.5 rounded-lg text-[11px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 600 }}>
                                          <Save className="w-3 h-3" /> Save
                                        </button>
                                      )}
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </>
            ) : (
              /* GRID / CARD layout — Google-Shopping-style 2/3/4-column grid of vendor offers */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Object.entries(grouped).flatMap(([pn, listings]) =>
                  listings.map((listing, idx) => {
                    const saveKey = `${listing.pn}-${listing.vendor}`;
                    const isSaved = savedIds.has(saveKey);
                    return (
                      <motion.div
                        key={`${pn}-${listing.vendor}-${idx}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        className="bg-white rounded-xl border border-border overflow-hidden flex flex-col hover:shadow-md hover:border-slate-300 transition-all"
                      >
                        {/* Product image */}
                        <a
                          href={listing.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative aspect-square bg-slate-50 border-b border-border overflow-hidden flex items-center justify-center group"
                        >
                          {listing.imageUrl ? (
                            <img
                              src={listing.imageUrl}
                              alt={listing.desc}
                              loading="lazy"
                              className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="text-[48px] text-slate-300 select-none">
                              <Package className="w-12 h-12 text-slate-300" />
                            </div>
                          )}
                          <span
                            className={`absolute top-2 left-2 text-[9px] px-1.5 py-0.5 rounded-full ${fitBadge(listing.fit)}`}
                            style={{ fontWeight: 700 }}
                          >
                            {listing.fit}
                          </span>
                          <span
                            className={`absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded-full ${COND_BADGE[listing.condition] || "bg-slate-100 text-slate-500"}`}
                            style={{ fontWeight: 700 }}
                          >
                            {listing.condition}
                          </span>
                        </a>

                        {/* Card body */}
                        <div className="p-3 flex flex-col gap-1.5 flex-1 min-h-0">
                          {/* P/N + manufacturer */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[12px] text-foreground tracking-wide" style={{ fontWeight: 700 }}>
                              {listing.pn}
                            </span>
                            {listing.manufacturer && listing.manufacturer !== "Unknown" && (
                              <span className="text-[10px] text-muted-foreground">· {listing.manufacturer}</span>
                            )}
                          </div>

                          {/* Description (clamp 2 lines) */}
                          <div
                            className="text-[12px] text-foreground leading-snug"
                            style={{
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {listing.desc}
                          </div>

                          {/* Vendor + rating */}
                          <div className="flex items-center gap-1.5 mt-auto pt-1.5">
                            <span className="text-[15px]">{listing.vendorIcon}</span>
                            <span className="text-[11px] text-foreground truncate flex-1" style={{ fontWeight: 600 }}>
                              {listing.vendor}
                            </span>
                            <div className="flex items-center gap-0.5 text-amber-500 shrink-0">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              <span className="text-[10px] text-foreground">{listing.rating.toFixed(1)}</span>
                            </div>
                          </div>

                          {/* Stock + ship */}
                          <div className="flex items-center justify-between text-[10px]">
                            <span className={listing.stock === "In Stock" ? "text-emerald-600" : "text-amber-600"} style={{ fontWeight: 500 }}>
                              {listing.stock}
                            </span>
                            <span className="text-muted-foreground">Ships {listing.leadTime}</span>
                          </div>

                          {/* Price + actions */}
                          <div className="flex items-end justify-between pt-2 border-t border-border mt-1">
                            <div>
                              <div className="text-[18px] text-foreground leading-none" style={{ fontWeight: 700 }}>
                                ${listing.price.toFixed(2)}
                              </div>
                              <div className="text-[9px] text-muted-foreground mt-0.5">each</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {isSaved ? (
                                <div className="flex items-center gap-1 text-[10px] text-emerald-600" style={{ fontWeight: 600 }}>
                                  <CheckCircle className="w-3 h-3" /> Saved
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleSave(listing)}
                                  aria-label="Save"
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                                >
                                  <Save className="w-3 h-3" />
                                </button>
                              )}
                              <a
                                href={listing.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 bg-primary text-white px-2.5 py-1.5 rounded-md text-[10px] hover:bg-primary/90 transition-colors"
                                style={{ fontWeight: 600 }}
                              >
                                <ExternalLink className="w-3 h-3" /> Order
                              </a>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Saved Parts Inventory ─────────────────────────────────────── */
function SavedPartsInventory({
  onEdit, onAddNew,
}: {
  onEdit: (p: SavedPart) => void;
  onAddNew: () => void;
}) {
  const { savedParts, deletePart, updatePart } = usePartsStore();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(savedParts[0]?.id || null);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockInput, setStockInput] = useState("");
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState("");

  const filtered = savedParts.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q || p.pn.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q) || p.manufacturer.toLowerCase().includes(q);
    const matchCat = catFilter === "all" || p.category === catFilter;
    return matchQ && matchCat;
  });

  const selected = savedParts.find(p => p.id === selectedId) || null;

  const totalValue = savedParts.reduce((s, p) => s + p.qtyInStock * p.costPrice, 0);
  const retailValue = savedParts.reduce((s, p) => s + p.qtyInStock * p.ourRate, 0);
  const lowStock = savedParts.filter(p => p.qtyInStock > 0 && p.qtyInStock <= p.minStock).length;
  const outOfStock = savedParts.filter(p => p.qtyInStock === 0).length;

  const catCounts: Record<string, number> = {};
  savedParts.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });

  const stockStatus = (p: SavedPart) => {
    if (p.qtyInStock === 0) return { label: "Out of Stock", cls: "text-red-600 bg-red-50" };
    if (p.qtyInStock <= p.minStock) return { label: "Low Stock", cls: "text-amber-600 bg-amber-50" };
    return { label: "In Stock", cls: "text-emerald-600 bg-emerald-50" };
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: list */}
      <div className="w-[420px] flex flex-col border-r border-border shrink-0">
        {/* Stats bar */}
        <div className="grid grid-cols-4 divide-x divide-border border-b border-border shrink-0">
          {[
            { label: "Parts", value: savedParts.length, icon: Package, color: "text-primary" },
            { label: "Low Stock", value: lowStock, icon: TrendingDown, color: "text-amber-600" },
            { label: "Out of Stock", value: outOfStock, icon: AlertTriangle, color: "text-red-600" },
            { label: "Inv. Value", value: `$${totalValue.toFixed(0)}`, icon: DollarSign, color: "text-emerald-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="p-3 flex flex-col">
              <div className={`text-[18px] ${color}`} style={{ fontWeight: 700 }}>{value}</div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                <Icon className="w-3 h-3" />
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Search + add */}
        <div className="p-3 border-b border-border flex gap-2 shrink-0">
          <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search P/N, description…"
              className="flex-1 bg-transparent text-[12px] outline-none" />
            {search && <button onClick={() => setSearch("")}><X className="w-3 h-3 text-muted-foreground" /></button>}
          </div>
          <button onClick={onAddNew}
            className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-xl text-[12px] hover:bg-primary/90 transition-colors shrink-0" style={{ fontWeight: 600 }}>
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>

        {/* Category chips */}
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto shrink-0 border-b border-border">
          <button onClick={() => setCatFilter("all")}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] transition-colors ${catFilter === "all" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`} style={{ fontWeight: 500 }}>
            All ({savedParts.length})
          </button>
          {Object.entries(catCounts).map(([cat, count]) => (
            <button key={cat} onClick={() => setCatFilter(catFilter === cat ? "all" : cat)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] transition-colors ${catFilter === cat ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`} style={{ fontWeight: 500 }}>
              {cat.split(" / ")[0]} ({count})
            </button>
          ))}
        </div>

        {/* Parts list */}
        <div className="flex-1 overflow-auto divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-6">
              <Package className="w-10 h-10 opacity-20" />
              <div className="text-[13px]">No parts found</div>
            </div>
          ) : filtered.map(p => {
            const ss = stockStatus(p);
            const isSelected = selectedId === p.id;
            return (
              <button key={p.id} onClick={() => setSelectedId(p.id)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5 border-l-2 border-primary" : ""}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${CAT_COLORS[p.category] || "bg-muted text-muted-foreground"}`}>
                  <Package className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] text-foreground tracking-wide" style={{ fontWeight: 700 }}>{p.pn}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ss.cls}`} style={{ fontWeight: 600 }}>{ss.label}</span>
                  </div>
                  <div className="text-[11px] text-foreground truncate mt-0.5">{p.desc}</div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                    <span className="text-emerald-600" style={{ fontWeight: 600 }}>${p.ourRate.toFixed(2)}</span>
                    <span>·</span>
                    <span>Qty: {p.qtyInStock}</span>
                    <span>·</span>
                    <span>{p.vendor}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Detail panel */}
      <div className="flex-1 overflow-auto bg-[#F7F8FA]">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Archive className="w-12 h-12 opacity-20" />
            <div className="text-[13px]">Select a part to view details</div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Part header */}
            <div className="bg-white rounded-xl border border-border p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[18px] text-foreground tracking-wider" style={{ fontWeight: 700 }}>{selected.pn}</span>
                    {selected.altPn && <span className="text-[12px] text-muted-foreground">/ {selected.altPn}</span>}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${COND_BADGE[selected.condition] || "bg-slate-100"}`} style={{ fontWeight: 600 }}>{selected.condition}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${CAT_COLORS[selected.category] || ""}`} style={{ fontWeight: 600 }}>{selected.category}</span>
                  </div>
                  <div className="text-[14px] text-foreground">{selected.desc}</div>
                  <div className="text-[12px] text-muted-foreground mt-1">{selected.manufacturer} · {selected.vendor}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => onEdit(selected)}
                    className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-xl text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => {
                    if (confirm(`Delete ${selected.pn}?`)) { deletePart(selected.id); setSelectedId(null); toast.success(`${selected.pn} removed`); }
                  }}
                    className="flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-[12px] hover:bg-red-50 transition-colors" style={{ fontWeight: 500 }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Pricing & Inventory cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* Inventory */}
              <div className="bg-white rounded-xl border border-border p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-3" style={{ fontWeight: 600 }}>Inventory</div>
                <div className="space-y-3">
                  {/* Qty in stock — inline edit */}
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Qty in Stock</span>
                    {editingStockId === selected.id ? (
                      <div className="flex items-center gap-1.5">
                        <input type="number" min="0" value={stockInput}
                          onChange={e => setStockInput(e.target.value)}
                          className="w-16 border border-border rounded-lg px-2 py-1 text-[12px] outline-none text-right focus:ring-2 focus:ring-primary/20"
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              updatePart(selected.id, { qtyInStock: parseInt(stockInput) || 0 });
                              setEditingStockId(null);
                              toast.success("Stock updated");
                            }
                          }}
                          autoFocus />
                        <button onClick={() => {
                          updatePart(selected.id, { qtyInStock: parseInt(stockInput) || 0 });
                          setEditingStockId(null);
                          toast.success("Stock updated");
                        }} className="text-primary hover:text-primary/80"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => setEditingStockId(null)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingStockId(selected.id); setStockInput(String(selected.qtyInStock)); }}
                        className="flex items-center gap-1.5 group">
                        <span className={`text-[16px] ${selected.qtyInStock === 0 ? "text-red-600" : selected.qtyInStock <= selected.minStock ? "text-amber-600" : "text-foreground"}`} style={{ fontWeight: 700 }}>{selected.qtyInStock}</span>
                        <Edit3 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Min Stock</span>
                    <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{selected.minStock}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${selected.qtyInStock === 0 ? "bg-red-400" : selected.qtyInStock <= selected.minStock ? "bg-amber-400" : "bg-emerald-400"}`}
                      style={{ width: `${Math.min(100, (selected.qtyInStock / Math.max(selected.minStock * 3, 1)) * 100)}%` }}
                    />
                  </div>
                  {selected.qtyInStock <= selected.minStock && selected.qtyInStock > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2.5 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Reorder alert — below minimum stock level
                    </div>
                  )}
                  {selected.qtyInStock === 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-red-600 bg-red-50 rounded-lg px-2.5 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Out of stock — order required
                    </div>
                  )}
                </div>
              </div>

              {/* Pricing */}
              <div className="bg-white rounded-xl border border-border p-4">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-3" style={{ fontWeight: 600 }}>Pricing</div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Cost Price</span>
                    <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>${selected.costPrice.toFixed(2)}</span>
                  </div>
                  {/* Our Rate — inline edit */}
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted-foreground">Our Rate (billed)</span>
                    {editingRateId === selected.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] text-muted-foreground">$</span>
                        <input type="number" min="0" step="0.01" value={rateInput}
                          onChange={e => setRateInput(e.target.value)}
                          className="w-20 border border-border rounded-lg px-2 py-1 text-[12px] outline-none text-right focus:ring-2 focus:ring-primary/20"
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              updatePart(selected.id, { ourRate: parseFloat(rateInput) || 0 });
                              setEditingRateId(null);
                              toast.success("Rate updated");
                            }
                          }}
                          autoFocus />
                        <button onClick={() => {
                          updatePart(selected.id, { ourRate: parseFloat(rateInput) || 0 });
                          setEditingRateId(null);
                          toast.success("Rate updated");
                        }} className="text-primary"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => setEditingRateId(null)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingRateId(selected.id); setRateInput(selected.ourRate.toFixed(2)); }}
                        className="flex items-center gap-1.5 group">
                        <span className="text-[16px] text-primary" style={{ fontWeight: 700 }}>${selected.ourRate.toFixed(2)}</span>
                        <Edit3 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </div>
                  {selected.costPrice > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-muted-foreground">Markup</span>
                      <span className="text-[13px] text-emerald-600" style={{ fontWeight: 600 }}>
                        +{(((selected.ourRate - selected.costPrice) / selected.costPrice) * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-muted-foreground">Inventory Value</span>
                      <div className="text-right">
                        <div className="text-[12px] text-muted-foreground">Cost: ${(selected.qtyInStock * selected.costPrice).toFixed(2)}</div>
                        <div className="text-[12px] text-primary" style={{ fontWeight: 600 }}>Retail: ${(selected.qtyInStock * selected.ourRate).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Vendor + source */}
            <div className="bg-white rounded-xl border border-border p-4">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-3" style={{ fontWeight: 600 }}>Supplier</div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{selected.vendor}</div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">{selected.manufacturer}</div>
                </div>
                {selected.sourceUrl && (
                  <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 border border-primary/20 text-primary px-3 py-1.5 rounded-lg text-[12px] hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
                    <ExternalLink className="w-3.5 h-3.5" /> View at {selected.vendor}
                  </a>
                )}
              </div>
              {selected.notes && (
                <div className="mt-3 text-[12px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2.5 flex gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {selected.notes}
                </div>
              )}
              <div className="mt-3 text-[11px] text-muted-foreground">Added {selected.savedAt}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main PartsSection Component ──────────────────────────────── */
export function PartsSection() {
  const { savedParts, addPart, updatePart } = usePartsStore();

  const [view, setView] = useState<"inventory" | "search">("inventory");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPart, setEditingPart] = useState<Partial<SavedPart> | null>(null);

  const openEdit = (part?: SavedPart) => {
    setEditingPart(part ?? {});
    setShowEditModal(true);
  };

  const handleSavePart = (form: any) => {
    if (editingPart?.id) {
      updatePart(editingPart.id, form);
      toast.success(`${form.pn} updated`);
    } else {
      const p = addPart(form);
      toast.success(`${form.pn} added to Parts inventory`);
    }
  };

  const handleSaveFromSearch = (partial: Partial<SavedPart>) => {
    addPart({
      pn: partial.pn || "",
      altPn: partial.altPn,
      desc: partial.desc || "",
      category: (partial.category || "Misc") as PartCategory,
      manufacturer: partial.manufacturer || "",
      vendor: partial.vendor || "",
      sourceUrl: partial.sourceUrl,
      condition: (partial.condition || "New") as PartCondition,
      costPrice: partial.costPrice || 0,
      ourRate: partial.ourRate || 0,
      qtyInStock: 0,
      minStock: 1,
    });
  };

  const lowStock = savedParts.filter(p => p.qtyInStock <= p.minStock && p.qtyInStock > 0).length;
  const outOfStock = savedParts.filter(p => p.qtyInStock === 0).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Parts & Inventory</h2>
            <p className="text-[12px] text-muted-foreground">
              {savedParts.length} parts · {lowStock > 0 && <span className="text-amber-600">{lowStock} low stock</span>}{lowStock > 0 && outOfStock > 0 && " · "}{outOfStock > 0 && <span className="text-red-600">{outOfStock} out of stock</span>}
              {lowStock === 0 && outOfStock === 0 && "All inventory levels OK"}
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
          <button onClick={() => setView("inventory")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] transition-all ${
              view === "inventory" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`} style={{ fontWeight: view === "inventory" ? 600 : 400 }}>
            <Archive className="w-3.5 h-3.5" />
            Saved Parts
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>{savedParts.length}</span>
          </button>
          <button onClick={() => setView("search")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] transition-all ${
              view === "search" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`} style={{ fontWeight: view === "search" ? 600 : 400 }}>
            <Sparkles className="w-3.5 h-3.5" />
            AI Part Search
            <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>AI</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {view === "inventory" ? (
            <motion.div key="inventory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} className="h-full">
              <SavedPartsInventory onEdit={openEdit} onAddNew={() => openEdit()} />
            </motion.div>
          ) : (
            <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} className="h-full">
              <AISearchPanel onSavePart={handleSaveFromSearch} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Edit / Add Modal */}
      <AnimatePresence>
        {showEditModal && editingPart !== null && (
          <EditPartModal
            part={editingPart}
            onSave={handleSavePart}
            onClose={() => { setShowEditModal(false); setEditingPart(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
