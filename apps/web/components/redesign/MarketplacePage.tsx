"use client";

import React, { useState, useRef } from "react";
import {
  Search, Filter, Grid3X3, List, Star, Phone, Mail, MessageSquare,
  Plus, ChevronRight, X, Check, Upload, Camera,
  ArrowLeft, Zap, Shield, BadgeCheck, Tag, MapPin, Package, Eye,
  Edit2, Copy, Archive, RotateCcw, TrendingUp, BarChart3,
  Clock, Sparkles, AlertTriangle, Heart,
  Plane, Info, Loader2, FileCheck, Video,
  CheckCircle2, SortAsc, Globe, MoreHorizontal,
  BookOpen, Download, Cpu, ExternalLink,
  FileText, DatabaseZap, Brain, Layers, DollarSign, Wrench, ShoppingCart,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  DEMO_LISTINGS,
  CATEGORIES,
  MANUAL_LISTINGS,
  type MarketListing,
  type MarketView,
  type MarketMode,
  type PartCondition,
  type ListingStatus,
  type SubscriptionPlan,
  type ManualListing,
  type ManualType,
} from "./marketplace/types";

/* ─── Constants ─────────────────────────────────────────────── */
const CONDITION_COLORS: Record<PartCondition, string> = {
  "New":          "bg-emerald-100 text-emerald-700 border-emerald-200",
  "New Surplus":  "bg-teal-100 text-teal-700 border-teal-200",
  "Overhauled":   "bg-blue-100 text-blue-700 border-blue-200",
  "Serviceable":  "bg-sky-100 text-sky-700 border-sky-200",
  "As Removed":   "bg-amber-100 text-amber-700 border-amber-200",
  "Used":         "bg-orange-100 text-orange-700 border-orange-200",
  "For Repair":   "bg-red-100 text-red-700 border-red-200",
};

const STATUS_COLORS: Record<ListingStatus, string> = {
  "Available": "bg-emerald-100 text-emerald-700",
  "Pending":   "bg-amber-100 text-amber-700",
  "Sold":      "bg-slate-100 text-slate-600",
  "Draft":     "bg-purple-100 text-purple-700",
};

const STARTER_LIMIT = 25;

/* ─── Shared small components ───────────────────────────────── */
function ConditionBadge({ condition }: { condition: PartCondition }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium ${CONDITION_COLORS[condition]}`}>
      {condition}
    </span>
  );
}

function StatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
      {status === "Available" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />}
      {status === "Pending"   && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />}
      {status === "Sold"      && <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5" />}
      {status === "Draft"     && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mr-1.5" />}
      {status}
    </span>
  );
}

function TrustChips({ listing }: { listing: MarketListing }) {
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {listing.traceAvailable && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs">
          <FileCheck size={10} /> Trace
        </span>
      )}
      {listing.certTagAvailable && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded text-xs">
          <BadgeCheck size={10} /> Tagged
        </span>
      )}
      {listing.hasPhotos && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 rounded text-xs">
          <Camera size={10} /> Photos
        </span>
      )}
      {listing.sellerVerified && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-xs">
          <Shield size={10} /> Verified Seller
        </span>
      )}
    </div>
  );
}

/* ─── Listing Card (grid view) ──────────────────────────────── */
function ListingCard({
  listing,
  onClick,
}: {
  listing: MarketListing;
  onClick: () => void;
}) {
  const [saved, setSaved] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer group flex flex-col"
      onClick={onClick}
    >
      {/* Image area */}
      <div className="relative h-44 bg-gradient-to-br from-slate-100 to-slate-200 flex-shrink-0">
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={40} className="text-slate-300" />
          </div>
        )}
        {listing.featured && (
          <span className="absolute top-2 left-2 bg-[#2563EB] text-white text-xs px-2 py-0.5 rounded-full font-medium">
            Featured
          </span>
        )}
        <button
          className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-all shadow-sm"
          onClick={e => { e.stopPropagation(); setSaved(!saved); }}
        >
          <Heart size={13} className={saved ? "fill-red-500 text-red-500" : "text-slate-400"} />
        </button>
        <div className="absolute bottom-2 right-2">
          <ConditionBadge condition={listing.condition} />
        </div>
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-xs text-slate-400 font-mono">{listing.partNumber}</p>
          {listing.priceNegotiable && <span className="text-xs text-slate-400">OBO</span>}
        </div>
        <h3 className="text-sm font-semibold text-slate-800 leading-snug mb-1 group-hover:text-blue-700 transition-colors line-clamp-2">
          {listing.title}
        </h3>
        <p className="text-xs text-slate-500 mb-2">{listing.manufacturer}</p>

        <TrustChips listing={listing} />

        <div className="mt-auto pt-3 flex items-end justify-between">
          <div>
            <span className="text-lg font-bold text-slate-900">${listing.price.toLocaleString()}</span>
            {listing.quantity > 1 && (
              <span className="text-xs text-slate-400 ml-1">× {listing.quantity} avail.</span>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <MapPin size={10} /> {listing.location.split(",")[0]}
            </div>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Eye size={11} /> {listing.viewCount}
          </div>
          <span className="text-xs font-medium text-[#2563EB] group-hover:underline">View Part →</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Listing Row (list view) ───────────────────────────────── */
function ListingRow({
  listing,
  onClick,
}: {
  listing: MarketListing;
  onClick: () => void;
}) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4 items-center hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="w-20 h-16 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt={listing.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={24} className="text-slate-300" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-mono text-slate-400">{listing.partNumber}</span>
          <ConditionBadge condition={listing.condition} />
        </div>
        <h3 className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors truncate">
          {listing.title}
        </h3>
        <p className="text-xs text-slate-500 mb-1">{listing.manufacturer} · {listing.location}</p>
        <TrustChips listing={listing} />
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-base font-bold text-slate-900">${listing.price.toLocaleString()}</p>
        {listing.priceNegotiable && <p className="text-xs text-slate-400">Negotiable</p>}
        <p className="text-xs text-blue-600 mt-2 font-medium group-hover:underline">View →</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW: MARKETPLACE HOME
═══════════════════════════════════════════════════════════════ */
function HomeView({
  onViewListing,
  onBrowse,
  onBrowseCategory,
  onListPart,
  onViewPlans,
  subscriptionPlan,
}: {
  onViewListing: (id: string) => void;
  onBrowse: (query?: string) => void;
  onBrowseCategory: (catId: string) => void;
  onListPart: () => void;
  onViewPlans: () => void;
  subscriptionPlan: SubscriptionPlan;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [aiSuggestions] = useState([
    "serviceable Cessna brake assemblies",
    "Garmin avionics tray GTN 750",
    "used alternator Lycoming IO-360",
    "overhauled magnetos under $1000",
  ]);

  const featured = DEMO_LISTINGS.filter(l => l.featured);
  const recent   = DEMO_LISTINGS.filter(l => !l.isMine).slice(0, 6);
  const trending = DEMO_LISTINGS.filter(l => l.viewCount > 60).slice(0, 4);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    onBrowse(searchInput);
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Hero Banner */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0A1628 0%, #1E3A5F 60%, #2563EB 100%)" }}
      >
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("https://images.unsplash.com/photo-1764625433212-792495d15761?w=1400&q=60")`,
            backgroundSize: "cover", backgroundPosition: "center",
          }}
        />
        <div className="relative px-6 py-10 max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <Plane size={18} className="text-blue-400" />
            <span className="text-blue-300 text-sm font-medium tracking-wide uppercase">Aviation Parts Marketplace</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Find Any Aircraft Part, Fast.</h1>
          <p className="text-blue-200 text-base mb-6 max-w-xl">
            List and discover aircraft parts with aviation-aware intelligence. Sellers publish in minutes. Buyers connect directly.
          </p>

          {/* Search */}
          <form onSubmit={handleSearch} className="relative mb-4">
            <div className="flex items-center bg-white rounded-xl shadow-xl overflow-hidden">
              <div className="pl-4 pr-2">
                {aiMode
                  ? <Sparkles size={18} className="text-blue-500" />
                  : <Search size={18} className="text-slate-400" />
                }
              </div>
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder={aiMode ? "Ask naturally: show me serviceable Cessna brake assemblies…" : "Part number, description, or aircraft type…"}
                className="flex-1 py-3.5 px-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="m-1.5 px-5 py-2.5 bg-[#2563EB] text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Search
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAiMode(!aiMode)}
              className={`absolute -bottom-8 left-1 flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-all ${aiMode ? "bg-blue-500/20 text-blue-200 border border-blue-400/30" : "text-blue-300 hover:text-white"}`}
            >
              <Sparkles size={11} />
              {aiMode ? "AI search on" : "Try AI search"}
            </button>
          </form>

          {/* AI Suggestions */}
          {aiMode && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-10 flex flex-wrap gap-2">
              {aiSuggestions.map(s => (
                <button
                  key={s}
                  onClick={() => { setSearchInput(s); onBrowse(s); }}
                  className="text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20 px-3 py-1.5 rounded-full transition-all"
                >
                  {s}
                </button>
              ))}
            </motion.div>
          )}
          {!aiMode && <div className="mt-10" />}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* Category Grid */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">Browse by Category</h2>
            <button onClick={() => onBrowse()} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              All categories <ChevronRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {CATEGORIES.slice(0, 12).map(cat => (
              <button
                key={cat.id}
                onClick={() => onBrowseCategory(cat.id)}
                className={`flex flex-col items-center p-3 rounded-xl border-2 ${cat.color} hover:shadow-md hover:scale-[1.02] transition-all text-center group`}
              >
                {cat.imageUrl ? (
                  <div className="w-10 h-10 rounded-lg overflow-hidden mb-2 shadow-sm">
                    <img src={cat.imageUrl} alt={cat.label} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-white/60 flex items-center justify-center text-xl mb-2 shadow-sm">
                    {cat.icon}
                  </div>
                )}
                <span className="text-xs font-medium text-slate-700 leading-tight">{cat.label}</span>
                <span className="text-[10px] text-slate-400 mt-0.5">{cat.count} parts</span>
              </button>
            ))}
          </div>
        </section>

        {/* Featured Listings */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Star size={16} className="text-amber-500" />
              <h2 className="text-base font-semibold text-slate-800">Featured Parts</h2>
            </div>
            <button onClick={() => onBrowse()} className="text-xs text-blue-600 hover:underline">View all →</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {featured.map(l => (
              <div
                key={l.id}
                onClick={() => onViewListing(l.id)}
                className="bg-white rounded-xl border border-amber-200 overflow-hidden flex hover:shadow-lg cursor-pointer group transition-all"
              >
                <div className="w-32 flex-shrink-0 bg-slate-100">
                  {l.imageUrl
                    ? <img src={l.imageUrl} alt={l.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Package size={28} className="text-slate-300" /></div>
                  }
                </div>
                <div className="p-3 flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">Featured</span>
                    <ConditionBadge condition={l.condition} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors truncate">{l.title}</h3>
                  <p className="text-xs text-slate-400 mb-1">{l.manufacturer} · {l.location}</p>
                  <TrustChips listing={l} />
                  <p className="text-sm font-bold text-slate-900 mt-2">${l.price.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trending + Recent side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trending */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-blue-600" />
              <h2 className="text-base font-semibold text-slate-800">Most Viewed</h2>
            </div>
            <div className="space-y-2">
              {trending.map((l, i) => (
                <div
                  key={l.id}
                  onClick={() => onViewListing(l.id)}
                  className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3 cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all group"
                >
                  <span className="text-base font-bold text-slate-200 w-6 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-slate-400 truncate">{l.partNumber}</p>
                    <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-700 truncate">{l.title}</p>
                    <p className="text-xs text-slate-400">{l.viewCount} views</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 flex-shrink-0">${l.price.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recently Listed */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-slate-500" />
                <h2 className="text-base font-semibold text-slate-800">Recently Listed</h2>
              </div>
              <button onClick={() => onBrowse()} className="text-xs text-blue-600 hover:underline">View all →</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recent.slice(0, 4).map(l => (
                <ListingCard key={l.id} listing={l} onClick={() => onViewListing(l.id)} />
              ))}
            </div>
          </div>
        </div>

        {/* Seller CTA Banner */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #0A1628 0%, #1E3A5F 100%)" }}>
          <div className="px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap size={16} className="text-blue-400" />
                <span className="text-blue-300 text-sm font-medium">Sell your parts</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">List a Part in Under 2 Minutes</h3>
              <p className="text-slate-300 text-sm max-w-md">
                Enter a part number → AI autofills details → upload photos → publish. Buyers contact you directly.
              </p>
              <div className="flex flex-wrap gap-4 mt-3">
                <div className="flex items-center gap-2 text-blue-200 text-xs"><Check size={12} className="text-emerald-400" /> AI-assisted listing</div>
                <div className="flex items-center gap-2 text-blue-200 text-xs"><Check size={12} className="text-emerald-400" /> Direct buyer contact</div>
                <div className="flex items-center gap-2 text-blue-200 text-xs"><Check size={12} className="text-emerald-400" /> From $25/mo</div>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                onClick={onListPart}
                className="px-6 py-3 bg-[#2563EB] hover:bg-blue-600 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-lg"
              >
                <Plus size={16} /> List a Part
              </button>
              <button
                onClick={onViewPlans}
                className="px-6 py-2.5 border border-white/20 text-white/80 hover:bg-white/10 rounded-xl text-sm transition-colors text-center"
              >
                View Seller Plans
              </button>
            </div>
          </div>
        </div>

        {/* Trust row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4">
          {[
            { icon: <Zap size={20} className="text-blue-600" />, label: "Fast Listing", desc: "Publish parts in minutes, not hours" },
            { icon: <Shield size={20} className="text-emerald-600" />, label: "Direct Contact", desc: "Buyers call or email you directly" },
            { icon: <Sparkles size={20} className="text-purple-600" />, label: "AI-Assisted", desc: "Part number autofill + smart descriptions" },
            { icon: <Globe size={20} className="text-sky-600" />, label: "Aviation-Native", desc: "Built for mechanics, shops & owners" },
          ].map(t => (
            <div key={t.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="flex justify-center mb-2">{t.icon}</div>
              <p className="text-sm font-semibold text-slate-800 mb-0.5">{t.label}</p>
              <p className="text-xs text-slate-500">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW: BROWSE / SEARCH RESULTS
═══════════════════════════════════════════════════════════════ */
function BrowseView({
  initialQuery = "",
  initialCategory = "",
  onViewListing,
}: {
  initialQuery?: string;
  initialCategory?: string;
  onViewListing: (id: string) => void;
}) {
  const [query, setQuery]               = useState(initialQuery);
  const [category, setCategory]         = useState(initialCategory);
  const [condition, setCondition]       = useState("");
  const [minPrice, setMinPrice]         = useState("");
  const [maxPrice, setMaxPrice]         = useState("");
  const [traceOnly, setTraceOnly]       = useState(false);
  const [taggedOnly, setTaggedOnly]     = useState(false);
  const [photosOnly, setPhotosOnly]     = useState(false);
  const [gridView, setGridView]         = useState(true);
  const [sortBy, setSortBy]             = useState("newest");
  const [filtersOpen, setFiltersOpen]   = useState(false);
  const [aiInterpretation, setAiInterp] = useState(initialQuery ? `Searching for: "${initialQuery}"` : "");

  const conditions: PartCondition[] = ["New","New Surplus","Overhauled","Serviceable","As Removed","Used","For Repair"];

  const filtered = DEMO_LISTINGS.filter(l => {
    if (l.isMine) return false;
    const q = query.toLowerCase();
    const matchQ = !q || l.title.toLowerCase().includes(q) || l.partNumber.toLowerCase().includes(q) || l.manufacturer.toLowerCase().includes(q) || (l.applicability || "").toLowerCase().includes(q);
    const matchCat = !category || l.category === category;
    const matchCond = !condition || l.condition === condition;
    const matchMin = !minPrice || l.price >= parseFloat(minPrice);
    const matchMax = !maxPrice || l.price <= parseFloat(maxPrice);
    const matchTrace = !traceOnly || l.traceAvailable;
    const matchTag = !taggedOnly || l.certTagAvailable;
    const matchPhotos = !photosOnly || l.hasPhotos;
    return matchQ && matchCat && matchCond && matchMin && matchMax && matchTrace && matchTag && matchPhotos;
  }).sort((a, b) => {
    if (sortBy === "price-asc") return a.price - b.price;
    if (sortBy === "price-desc") return b.price - a.price;
    if (sortBy === "views") return b.viewCount - a.viewCount;
    return new Date(b.listedDate).getTime() - new Date(a.listedDate).getTime();
  });

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Search + category strip */}
      <div className="border-b border-gray-200 bg-white flex-shrink-0">
        {/* Hero search row */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-3 max-w-5xl mx-auto">
            <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 gap-2 shadow-sm">
              <Search size={15} className="text-slate-400 flex-shrink-0" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setAiInterp(""); }}
                placeholder="Search by part number, description, or aircraft type…"
                className="flex-1 py-2.5 bg-transparent text-sm outline-none text-slate-800 placeholder:text-slate-400"
              />
              {query && <button onClick={() => setQuery("")}><X size={13} className="text-slate-400" /></button>}
            </div>
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${filtersOpen ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-200 text-slate-600 hover:bg-slate-50"}`}
            >
              <Filter size={14} /> Filters
            </button>
            <div className="flex border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setGridView(true)} className={`px-2.5 py-2.5 ${gridView ? "bg-blue-50 text-blue-700" : "bg-white text-slate-400 hover:bg-slate-50"}`}><Grid3X3 size={15} /></button>
              <button onClick={() => setGridView(false)} className={`px-2.5 py-2.5 ${!gridView ? "bg-blue-50 text-blue-700" : "bg-white text-slate-400 hover:bg-slate-50"}`}><List size={15} /></button>
            </div>
          </div>
          {aiInterpretation && (
            <div className="flex items-center gap-2 mt-2 px-1 max-w-5xl mx-auto">
              <span className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                <Sparkles size={11} /> AI: {aiInterpretation}
              </span>
              <button onClick={() => setAiInterp("")}><X size={11} className="text-slate-400" /></button>
            </div>
          )}
        </div>

        {/* Category quick-filter strip */}
        <div className="flex items-center gap-2 px-4 pb-2.5 overflow-x-auto max-w-5xl mx-auto">
          <button
            onClick={() => setCategory("")}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              !category ? "bg-[#0A1628] text-white border-[#0A1628]" : "bg-white text-slate-600 border-gray-200 hover:border-slate-400"
            }`}
          >
            All parts
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(category === cat.id ? "" : cat.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all whitespace-nowrap ${
                category === cat.id
                  ? "bg-[#2563EB] text-white border-[#2563EB]"
                  : "bg-white text-slate-600 border-gray-200 hover:border-slate-400"
              }`}
            >
              <span>{cat.icon}</span> {cat.label}
              <span className="text-[10px] opacity-60 ml-0.5">{cat.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Filters sidebar */}
        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0"
            >
              <div className="p-4 space-y-5" style={{ width: 220 }}>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Category</p>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 outline-none"
                  >
                    <option value="">All Categories</option>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Condition</p>
                  <div className="space-y-1.5">
                    {conditions.map(c => (
                      <label key={c} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="condition"
                          value={c}
                          checked={condition === c}
                          onChange={() => setCondition(condition === c ? "" : c)}
                          className="accent-blue-600"
                        />
                        <span className="text-xs text-slate-700">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Price Range</p>
                  <div className="flex items-center gap-2">
                    <input value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="Min" className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 outline-none text-slate-700" />
                    <span className="text-xs text-slate-400">–</span>
                    <input value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Max" className="w-full text-xs border border-gray-200 rounded-lg px-2 py-2 outline-none text-slate-700" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Trust / Docs</p>
                  <div className="space-y-2">
                    {[
                      { label: "Trace docs available",   val: traceOnly,   set: setTraceOnly },
                      { label: "Cert / tag available",   val: taggedOnly,  set: setTaggedOnly },
                      { label: "Photos included",        val: photosOnly,  set: setPhotosOnly },
                    ].map(f => (
                      <label key={f.label} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={f.val} onChange={e => f.set(e.target.checked)} className="accent-blue-600 rounded" />
                        <span className="text-xs text-slate-700">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => { setCategory(""); setCondition(""); setMinPrice(""); setMaxPrice(""); setTraceOnly(false); setTaggedOnly(false); setPhotosOnly(false); }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <div className="flex-1 overflow-auto p-4">
          {/* Results header */}
          <div className="flex items-center justify-between mb-4 max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{filtered.length}</span> parts available
                {category && (
                  <span className="ml-1 text-blue-700 font-medium">
                    · {CATEGORIES.find(c => c.id === category)?.label}
                  </span>
                )}
                {query && (
                  <span className="ml-1 text-blue-700 font-medium">· "{query}"</span>
                )}
              </p>
              {(query || category || condition) && (
                <button
                  onClick={() => { setQuery(""); setCategory(""); setCondition(""); setMinPrice(""); setMaxPrice(""); setTraceOnly(false); setTaggedOnly(false); setPhotosOnly(false); }}
                  className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                >
                  <X size={11} /> Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <SortAsc size={13} className="text-slate-400" />
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="text-xs border border-gray-200 rounded-xl px-2 py-1.5 bg-white text-slate-700 outline-none">
                <option value="newest">Newest first</option>
                <option value="price-asc">Price: Low → High</option>
                <option value="price-desc">Price: High → Low</option>
                <option value="views">Most viewed</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Package size={28} className="text-slate-300" />
              </div>
              <p className="text-base font-semibold text-slate-800 mb-1">No parts found</p>
              <p className="text-sm text-slate-500 mb-4">Try adjusting your search or filters</p>
              <button onClick={() => { setQuery(""); setCategory(""); setCondition(""); }} className="text-sm text-blue-600 hover:underline">Clear filters</button>
            </div>
          ) : gridView ? (
            <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(l => <ListingCard key={l.id} listing={l} onClick={() => onViewListing(l.id)} />)}
            </div>
          ) : (
            <div className="max-w-5xl mx-auto space-y-3">
              {filtered.map(l => <ListingRow key={l.id} listing={l} onClick={() => onViewListing(l.id)} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW: LISTING DETAIL
═══════════════════════════════════════════════════════════════ */
function ListingDetailView({
  listingId,
  onBack,
  onViewListing,
}: {
  listingId: string;
  onBack: () => void;
  onViewListing: (id: string) => void;
}) {
  const listing = DEMO_LISTINGS.find(l => l.id === listingId);
  const [contactMode, setContactMode] = useState<"" | "phone" | "email">("");
  const [reported, setReported] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!listing) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-slate-500">Listing not found.</p>
    </div>
  );

  const similar = DEMO_LISTINGS.filter(l => l.id !== listingId && l.category === listing.category && !l.isMine).slice(0, 3);

  function handleContact(mode: "phone" | "email" | "sms") {
    toast.success(`Opening ${mode === "phone" ? "phone call" : mode === "sms" ? "SMS" : "email"} to seller`, { description: listing!.sellerName });
    setContactMode(mode === "phone" ? "phone" : "email");
  }

  return (
    <div className="flex-1 overflow-auto bg-[#f8f9fb]">
      {/* Back bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-700 transition-colors">
          <ArrowLeft size={16} /> Back to results
        </button>
        <span className="text-slate-300">|</span>
        <span className="text-xs text-slate-400 font-mono">{listing.partNumber}</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Images + details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Image gallery */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="relative h-72 bg-gradient-to-br from-slate-100 to-slate-200">
              {listing.imageUrl ? (
                <img src={listing.imageUrl} alt={listing.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <Package size={48} className="text-slate-200" />
                  <p className="text-xs text-slate-400">No photos uploaded</p>
                </div>
              )}
              <div className="absolute top-3 left-3 flex gap-2">
                {listing.featured && (
                  <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">Featured</span>
                )}
                <StatusBadge status={listing.status} />
              </div>
            </div>
            {listing.hasPhotos && (
              <div className="p-3 flex gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-16 h-12 rounded-lg bg-slate-100 border-2 border-transparent hover:border-blue-400 cursor-pointer overflow-hidden">
                    {listing.imageUrl && <img src={listing.imageUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                ))}
                <div className="w-16 h-12 rounded-lg bg-slate-100 border border-gray-200 flex items-center justify-center cursor-pointer hover:bg-slate-200">
                  <Video size={16} className="text-slate-400" />
                </div>
              </div>
            )}
          </div>

          {/* Part details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{listing.partNumber}</span>
                  {listing.altPartNumbers?.map(pn => (
                    <span key={pn} className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">Alt: {pn}</span>
                  ))}
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-1">{listing.title}</h1>
                <p className="text-sm text-slate-500">{listing.manufacturer}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900">${listing.price.toLocaleString()}</p>
                {listing.priceNegotiable && <p className="text-xs text-slate-400">Negotiable</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <ConditionBadge condition={listing.condition} />
              <TrustChips listing={listing} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 text-sm">
              {[
                { label: "Quantity",  val: `${listing.quantity} available` },
                { label: "Location",  val: listing.location },
                { label: "Listed",    val: listing.listedDate },
                { label: "Category",  val: CATEGORIES.find(c => c.id === listing.category)?.label || listing.category },
                ...(listing.serialNumber ? [{ label: "Serial", val: listing.serialNumber }] : []),
              ].map(r => (
                <div key={r.label} className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-xs text-slate-400 mb-0.5">{r.label}</p>
                  <p className="text-xs font-semibold text-slate-800">{r.val}</p>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Description</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{listing.description}</p>
            </div>

            {listing.applicability && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1.5">
                  <Plane size={12} /> Aircraft Applicability
                </p>
                <p className="text-xs text-blue-600">{listing.applicability}</p>
              </div>
            )}

            {/* Trace / Cert section */}
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Documentation & Certification</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-3 rounded-lg border text-xs ${listing.traceAvailable ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {listing.traceAvailable ? <CheckCircle2 size={14} className="text-green-600" /> : <X size={14} className="text-slate-400" />}
                    <span className={`font-semibold ${listing.traceAvailable ? "text-green-700" : "text-slate-500"}`}>Trace Docs</span>
                  </div>
                  <p className={listing.traceAvailable ? "text-green-600" : "text-slate-400"}>
                    {listing.traceAvailable ? "Available — ask seller" : "Not available"}
                  </p>
                </div>
                <div className={`p-3 rounded-lg border text-xs ${listing.certTagAvailable ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {listing.certTagAvailable ? <CheckCircle2 size={14} className="text-green-600" /> : <X size={14} className="text-slate-400" />}
                    <span className={`font-semibold ${listing.certTagAvailable ? "text-green-700" : "text-slate-500"}`}>8130-3 / Tag</span>
                  </div>
                  <p className={listing.certTagAvailable ? "text-green-600" : "text-slate-400"}>
                    {listing.certTagAvailable ? "Available with part" : "Not included"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                <Info size={11} /> Documentation status is seller-provided. Verify before purchase.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Seller contact */}
        <div className="space-y-4">
          {/* Contact card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-4">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {listing.sellerName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{listing.sellerName}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{listing.sellerType}</span>
                  {listing.sellerVerified && (
                    <span className="flex items-center gap-0.5 text-xs text-blue-600">
                      <BadgeCheck size={11} /> Verified
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <button
                onClick={() => handleContact("phone")}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0A1628] hover:bg-[#1E3A5F] text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Phone size={15} /> Call Seller
              </button>
              <button
                onClick={() => handleContact("sms")}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <MessageSquare size={15} /> Text Seller
              </button>
              <button
                onClick={() => handleContact("email")}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors"
              >
                <Mail size={15} /> Email Seller
              </button>
            </div>

            {contactMode === "phone" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-3">
                <p className="font-semibold mb-0.5">Seller Phone</p>
                <a href={`tel:${listing.sellerPhone}`} className="text-blue-700 hover:underline font-mono">{listing.sellerPhone}</a>
              </div>
            )}
            {contactMode === "email" && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 mb-3">
                <p className="font-semibold mb-0.5">Seller Email</p>
                <a href={`mailto:${listing.sellerEmail}`} className="text-blue-700 hover:underline">{listing.sellerEmail}</a>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-100">
              <button onClick={() => setSaved(!saved)} className={`flex items-center gap-1.5 transition-colors ${saved ? "text-red-500" : "hover:text-slate-700"}`}>
                <Heart size={13} className={saved ? "fill-red-500" : ""} />
                {saved ? "Saved" : "Save listing"}
              </button>
              <button onClick={() => setReported(true)} className={`flex items-center gap-1.5 hover:text-slate-700 transition-colors ${reported ? "text-slate-400" : ""}`}>
                <AlertTriangle size={12} /> {reported ? "Reported" : "Report"}
              </button>
            </div>
          </div>

          {/* Listing stats */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">Listing Activity</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Views", val: listing.viewCount },
                { label: "Contacts", val: listing.contactClicks },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-lg font-bold text-slate-800">{s.val}</p>
                  <p className="text-xs text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Similar parts */}
      {similar.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 pb-8">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Similar Parts</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {similar.map(l => <ListingCard key={l.id} listing={l} onClick={() => onViewListing(l.id)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW: SELLER PLANS
═══════════════════════════════════════════════════════════════ */
function SellerPlansView({
  onSubscribe,
  currentPlan,
}: {
  onSubscribe: (plan: "starter" | "pro") => void;
  currentPlan: SubscriptionPlan;
}) {
  const [billingAnnual, setBillingAnnual] = useState(false);
  const starterPrice = billingAnnual ? 20 : 25;
  const proPrice = billingAnnual ? 41.99 : 49.99;

  const starter = [
    "Up to 25 active listings",
    "AI-assisted listing creation",
    "Part number autofill",
    "Photo upload",
    "Direct buyer contact",
    "Mark sold / available / pending",
  ];
  const pro = [
    "Unlimited active listings",
    "AI-assisted listing creation",
    "Part number autofill",
    "Photo + short video upload",
    "Direct buyer contact",
    "Listing performance insights",
    "Priority ranking in search",
    "Advanced listing analytics",
  ];

  return (
    <div className="flex-1 overflow-auto py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Seller Plans</h2>
          <p className="text-slate-500 text-sm mb-5">Subscribe to list parts. Buyers browse for free, no subscription needed.</p>
          <div className="inline-flex items-center bg-slate-100 rounded-full p-1 gap-1">
            <button
              onClick={() => setBillingAnnual(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${!billingAnnual ? "bg-white shadow text-slate-800" : "text-slate-500"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingAnnual(true)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${billingAnnual ? "bg-white shadow text-slate-800" : "text-slate-500"}`}
            >
              Annual
              <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Save 20%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Starter */}
          <div className={`bg-white rounded-2xl border-2 p-6 ${currentPlan === "starter" ? "border-blue-500" : "border-gray-200"}`}>
            {currentPlan === "starter" && (
              <div className="flex items-center gap-1.5 mb-3 text-xs text-blue-700 font-semibold">
                <CheckCircle2 size={13} className="text-blue-600" /> Current Plan
              </div>
            )}
            <h3 className="text-lg font-bold text-slate-900 mb-1">Starter</h3>
            <p className="text-slate-500 text-xs mb-4">For individual owners, mechanics, and small shops.</p>
            <div className="flex items-end gap-1 mb-5">
              <span className="text-3xl font-bold text-slate-900">${starterPrice}</span>
              <span className="text-slate-400 text-sm mb-1">/month</span>
            </div>
            <ul className="space-y-2.5 mb-6">
              {starter.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                  <Check size={14} className="text-emerald-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            {currentPlan === "starter" ? (
              <button className="w-full py-2.5 border-2 border-blue-200 text-blue-700 rounded-xl text-sm font-semibold bg-blue-50" disabled>
                Current Plan
              </button>
            ) : (
              <button
                onClick={() => onSubscribe("starter")}
                className="w-full py-2.5 border-2 border-[#0A1628] text-[#0A1628] hover:bg-[#0A1628] hover:text-white rounded-xl text-sm font-semibold transition-all"
              >
                {currentPlan === "pro" ? "Downgrade to Starter" : "Subscribe — Starter"}
              </button>
            )}
          </div>

          {/* Pro */}
          <div className={`rounded-2xl border-2 p-6 relative overflow-hidden ${currentPlan === "pro" ? "border-blue-500 bg-white" : "border-[#2563EB] bg-gradient-to-br from-blue-50 to-white"}`}>
            <div className="absolute top-3 right-3">
              <span className="bg-[#2563EB] text-white text-xs px-2.5 py-1 rounded-full font-medium">Most Popular</span>
            </div>
            {currentPlan === "pro" && (
              <div className="flex items-center gap-1.5 mb-3 text-xs text-blue-700 font-semibold">
                <CheckCircle2 size={13} className="text-blue-600" /> Current Plan
              </div>
            )}
            <h3 className="text-lg font-bold text-slate-900 mb-1">Pro</h3>
            <p className="text-slate-500 text-xs mb-4">For active sellers, shops, and MROs with high listing volume.</p>
            <div className="flex items-end gap-1 mb-5">
              <span className="text-3xl font-bold text-slate-900">${proPrice.toFixed(2)}</span>
              <span className="text-slate-400 text-sm mb-1">/month</span>
            </div>
            <ul className="space-y-2.5 mb-6">
              {pro.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                  <Check size={14} className="text-emerald-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            {currentPlan === "pro" ? (
              <button className="w-full py-2.5 border-2 border-blue-200 text-blue-700 rounded-xl text-sm font-semibold bg-blue-50" disabled>
                Current Plan
              </button>
            ) : (
              <button
                onClick={() => onSubscribe("pro")}
                className="w-full py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md"
              >
                {currentPlan === "starter" ? "Upgrade to Pro" : "Subscribe — Pro"}
              </button>
            )}
          </div>
        </div>

        {/* Future tease */}
        <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
          <p className="text-xs text-slate-500 mb-1">
            <span className="font-semibold text-slate-600">Coming soon:</span> Dealer / MRO storefronts, bulk upload, CSV import, team seats
          </p>
          <p className="text-xs text-slate-400">Phase 3 roadmap · <a href="#" className="text-blue-600 hover:underline">Join waitlist</a></p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW: CREATE LISTING WIZARD
═══════════════════════════════════════════════════════════════ */
const AI_LOOKUP: Record<string, { title: string; manufacturer: string; category: string; applicability: string; altNums: string[] }> = {
  "lw-11979":  { title: "Lycoming IO-360 Cylinder Assembly",    manufacturer: "Lycoming",        category: "engine",       applicability: "Lycoming IO-360 series, Cessna 172S, Piper Arrow",                        altNums: ["76350"] },
  "30-97a":    { title: "Cleveland Brake Rotor Disc 30-97A",     manufacturer: "Cleveland/Parker",category: "landing-gear", applicability: "Cessna 172, 182; Piper PA-28 series",                                     altNums: ["30-97"] },
  "066-00001": { title: "Garmin GNS 430W GPS/NAV/COM",          manufacturer: "Garmin",          category: "avionics",     applicability: "Universal — common in Cessna, Piper, Beechcraft",                          altNums: ["010-00231-11"] },
  "4370":      { title: "Slick 4370 Magneto",                   manufacturer: "Champion/Slick",  category: "engine",       applicability: "Lycoming O-320, O-360, IO-360 series",                                    altNums: ["M4370","4370-00"] },
  "va-131c3-2":{ title: "Airborne 211CC Vacuum Pump",           manufacturer: "Airborne",        category: "instruments",  applicability: "Wide — Cessna, Piper, Beechcraft with vacuum instruments",                  altNums: ["V831CC"] },
};

function CreateListingWizard({
  onComplete,
  onCancel,
  subscriptionPlan,
  activeCount,
}: {
  onComplete: () => void;
  onCancel: () => void;
  subscriptionPlan: SubscriptionPlan;
  activeCount: number;
}) {
  const [step, setStep] = useState(1);
  const [partNumber, setPartNumber] = useState("");
  const [aiLooking, setAiLooking] = useState(false);
  const [aiResult, setAiResult] = useState<typeof AI_LOOKUP[string] | null>(null);
  const [aiConfidence, setAiConfidence] = useState<"high" | "low" | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Step 2 fields
  const [title, setTitle] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState<PartCondition>("Serviceable");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [location, setLocation] = useState("");
  const [traceAvail, setTraceAvail] = useState(false);
  const [certAvail, setCertAvail] = useState(false);
  const [serialNo, setSerialNo] = useState("");
  const [notes, setNotes] = useState("");
  const [aiDesc, setAiDesc] = useState("");
  const [showAiDesc, setShowAiDesc] = useState(false);

  // Step 3 fields
  const [photos, setPhotos] = useState<string[]>([]);
  const [hasVideo, setHasVideo] = useState(false);

  const conditions: PartCondition[] = ["New","New Surplus","Overhauled","Serviceable","As Removed","Used","For Repair"];
  const limit = subscriptionPlan === "starter" ? STARTER_LIMIT : Infinity;
  const atLimit = activeCount >= limit;

  function doAiLookup() {
    if (!partNumber.trim()) return;
    setAiLooking(true);
    setNotFound(false);
    setAiResult(null);
    setTimeout(() => {
      const key = partNumber.toLowerCase().trim();
      const found = AI_LOOKUP[key];
      setAiLooking(false);
      if (found) {
        setAiResult(found);
        setAiConfidence("high");
        setTitle(found.title);
        setManufacturer(found.manufacturer);
        setCategory(found.category);
      } else {
        setNotFound(true);
        setAiConfidence("low");
      }
    }, 1800);
  }

  function generateAiDesc() {
    setShowAiDesc(true);
    setAiDesc("");
    const desc = `${condition} ${title} (P/N ${partNumber}${serialNo ? `, S/N ${serialNo}` : ""}). ${traceAvail ? "Trace documentation available." : ""} ${certAvail ? "8130-3 tag included." : ""} ${notes ? notes : "Contact seller for additional details."} Part is priced at $${price} for quantity ${quantity}.`;
    let i = 0;
    const interval = setInterval(() => {
      if (i <= desc.length) { setAiDesc(desc.slice(0, i)); i += 4; }
      else clearInterval(interval);
    }, 30);
  }

  function handlePublish() {
    toast.success("Part listing published!", { description: `${title} · P/N ${partNumber}` });
    onComplete();
  }

  const stepTitles = ["Part Number Lookup", "Details & Condition", "Add Media", "Review & Publish"];

  return (
    <div className="flex-1 overflow-auto bg-[#f8f9fb] py-6 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={onCancel} className="flex items-center gap-2 text-sm text-slate-500 hover:text-blue-700 transition-colors">
            <ArrowLeft size={15} /> Cancel
          </button>
          <h2 className="text-base font-semibold text-slate-800">Create Listing</h2>
          <span className="text-xs text-slate-400">Step {step} of 4</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-6">
          {[1,2,3,4].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s < step ? "bg-blue-600" : s === step ? "bg-blue-400" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-sm text-slate-500 text-center mb-6">Step {step}: {stepTitles[step-1]}</p>

        {/* Plan usage warning */}
        {atLimit && subscriptionPlan === "starter" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Starter plan limit reached ({STARTER_LIMIT} listings)</p>
              <p className="text-xs text-amber-600">Upgrade to Pro for unlimited listings.</p>
            </div>
            <button className="ml-auto px-3 py-1.5 bg-amber-500 text-white text-xs rounded-lg font-medium">Upgrade</button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center py-2">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Sparkles size={22} className="text-blue-600" />
                </div>
                <h3 className="text-base font-semibold text-slate-800 mb-1">Enter Part Number</h3>
                <p className="text-xs text-slate-500">AI will autofill details from known catalog data.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Part Number *</label>
                <div className="flex gap-2">
                  <input
                    value={partNumber}
                    onChange={e => { setPartNumber(e.target.value); setAiResult(null); setNotFound(false); }}
                    onKeyDown={e => e.key === "Enter" && doAiLookup()}
                    placeholder="e.g. LW-11979, 30-97A, 4370"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 font-mono"
                  />
                  <button
                    onClick={doAiLookup}
                    disabled={!partNumber.trim() || aiLooking}
                    className="px-4 py-2.5 bg-[#2563EB] text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2 hover:bg-blue-700 transition-colors"
                  >
                    {aiLooking ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {aiLooking ? "Looking up…" : "AI Lookup"}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">Try: LW-11979 · 30-97A · 066-00001 · 4370</p>
              </div>

              {aiLooking && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                  <Loader2 size={16} className="text-blue-500 animate-spin" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Searching aviation parts catalog…</p>
                    <p className="text-xs text-blue-600">Cross-referencing part number databases</p>
                  </div>
                </div>
              )}

              {aiResult && !aiLooking && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-800">Match found — catalog data autofilled</span>
                    <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">High confidence</span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex gap-2"><span className="text-slate-500 w-24">Title:</span><span className="font-semibold text-slate-800">{aiResult.title}</span></div>
                    <div className="flex gap-2"><span className="text-slate-500 w-24">Manufacturer:</span><span className="font-semibold text-slate-800">{aiResult.manufacturer}</span></div>
                    <div className="flex gap-2"><span className="text-slate-500 w-24">Category:</span><span className="font-semibold text-slate-800">{CATEGORIES.find(c => c.id === aiResult!.category)?.label}</span></div>
                    {aiResult.altNums.length > 0 && (
                      <div className="flex gap-2"><span className="text-slate-500 w-24">Alt P/Ns:</span><span className="font-mono text-slate-700">{aiResult.altNums.join(", ")}</span></div>
                    )}
                    <div className="flex gap-2"><span className="text-slate-500 w-24">Fits:</span><span className="text-slate-700">{aiResult.applicability}</span></div>
                  </div>
                  <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><Info size={10} /> Matched from known catalog data — verify before publishing</p>
                </motion.div>
              )}

              {notFound && !aiLooking && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">Part number not found in catalog</span>
                  </div>
                  <p className="text-xs text-amber-600">No worries — you can fill in the details manually on the next step.</p>
                </div>
              )}

              <button
                onClick={() => setStep(2)}
                disabled={!partNumber.trim()}
                className="w-full py-3 bg-[#0A1628] text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#1E3A5F] transition-colors flex items-center justify-center gap-2"
              >
                Continue <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setStep(1)} className="text-xs text-slate-500 hover:text-blue-700 flex items-center gap-1"><ArrowLeft size={12} /> Back</button>
                <span className="text-xs text-slate-400 font-mono">{partNumber}</span>
              </div>

              {aiResult && (
                <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <Sparkles size={13} className="text-blue-500" />
                  <p className="text-xs text-blue-700">Details autofilled by AI — review and adjust below</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Part Title *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" placeholder="Descriptive part title" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Manufacturer</label>
                    <input value={manufacturer} onChange={e => setManufacturer(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Category</label>
                    <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
                      <option value="">Select…</option>
                      {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Condition *</label>
                    <select value={condition} onChange={e => setCondition(e.target.value as PartCondition)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white">
                      {conditions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Price ($) *</label>
                    <input value={price} onChange={e => setPrice(e.target.value)} type="number" min="0" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" placeholder="0.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Quantity</label>
                    <input value={quantity} onChange={e => setQuantity(e.target.value)} type="number" min="1" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Location</label>
                    <input value={location} onChange={e => setLocation(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" placeholder="City, ST" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Serial Number <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input value={serialNo} onChange={e => setSerialNo(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" placeholder="Optional" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2.5 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={traceAvail} onChange={e => setTraceAvail(e.target.checked)} className="accent-blue-600" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700">Trace docs available</p>
                      <p className="text-xs text-slate-400">8130, work order, etc.</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2.5 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={certAvail} onChange={e => setCertAvail(e.target.checked)} className="accent-blue-600" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700">8130-3 / Tag available</p>
                      <p className="text-xs text-slate-400">Cert or approval tag</p>
                    </div>
                  </label>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600">Seller Notes</label>
                    {title && !showAiDesc && (
                      <button onClick={generateAiDesc} className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                        <Sparkles size={11} /> Generate AI description
                      </button>
                    )}
                  </div>
                  <textarea
                    value={showAiDesc ? aiDesc : notes}
                    onChange={e => { if (showAiDesc) setAiDesc(e.target.value); else setNotes(e.target.value); }}
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                    placeholder="Describe the part condition, any issues, shipping, etc."
                  />
                  {showAiDesc && (
                    <p className="text-xs text-blue-600 flex items-center gap-1 mt-1"><Sparkles size={11} /> AI-generated — review and edit before publishing</p>
                  )}
                </div>
              </div>

              <button
                onClick={() => setStep(3)}
                disabled={!title.trim() || !price}
                className="w-full py-3 bg-[#0A1628] text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#1E3A5F] transition-colors flex items-center justify-center gap-2"
              >
                Continue <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setStep(2)} className="text-xs text-slate-500 hover:text-blue-700 flex items-center gap-1"><ArrowLeft size={12} /> Back</button>
                <span className="text-xs text-slate-400">Add photos to sell faster</span>
              </div>

              <div className="text-center py-2">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Camera size={22} className="text-slate-500" />
                </div>
                <h3 className="text-base font-semibold text-slate-800 mb-1">Add Media</h3>
                <p className="text-xs text-slate-500">Listings with real photos get 3× more contact clicks.</p>
              </div>

              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
                onClick={() => {
                  const mockFilenames = ["IMG_0042.jpg", "IMG_0043.jpg", "IMG_0044.jpg"];
                  setPhotos(mockFilenames.slice(0, photos.length + 1));
                  if (photos.length < 3) toast.success("Photo added");
                }}
              >
                <Upload size={24} className="text-slate-300 group-hover:text-blue-400 mx-auto mb-2 transition-colors" />
                <p className="text-sm font-medium text-slate-600">Click to upload photos</p>
                <p className="text-xs text-slate-400 mt-1">JPG, PNG, HEIC · Max 20MB per photo</p>
              </div>

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group">
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera size={20} className="text-slate-300" />
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="w-7 h-7 bg-red-500 rounded-full flex items-center justify-center">
                          <X size={13} className="text-white" />
                        </button>
                      </div>
                      <span className="absolute bottom-1 left-1 text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded">{p}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setPhotos(prev => [...prev, "camera_shot.jpg"]); toast.success("Camera photo added"); }}
                  className="flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Camera size={15} /> Take Photo
                </button>
                <button
                  onClick={() => { setHasVideo(true); toast.success("Video added"); }}
                  className={`flex items-center justify-center gap-2 py-2.5 border rounded-xl text-sm transition-colors ${hasVideo ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  <Video size={15} /> {hasVideo ? "Video added ✓" : "Add Short Video"}
                  {!hasVideo && <span className="text-xs text-blue-500 border border-blue-200 bg-blue-50 px-1.5 py-0.5 rounded-full">Pro</span>}
                </button>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(4)} className="flex-1 py-3 bg-[#0A1628] text-white rounded-xl text-sm font-semibold hover:bg-[#1E3A5F] transition-colors flex items-center justify-center gap-2">
                  Continue <ChevronRight size={16} />
                </button>
                <button onClick={() => setStep(4)} className="px-4 py-3 border border-gray-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors">
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setStep(3)} className="text-xs text-slate-500 hover:text-blue-700 flex items-center gap-1"><ArrowLeft size={12} /> Back</button>
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> Ready to publish</span>
              </div>

              <h3 className="text-base font-semibold text-slate-800 text-center">Review Your Listing</h3>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2.5">
                {[
                  { label: "Part Number", val: partNumber },
                  { label: "Title",       val: title },
                  { label: "Manufacturer",val: manufacturer },
                  { label: "Condition",   val: condition },
                  { label: "Price",       val: price ? `$${parseFloat(price).toLocaleString()}` : "—" },
                  { label: "Quantity",    val: quantity },
                  { label: "Location",    val: location || "—" },
                  { label: "Trace docs",  val: traceAvail ? "Yes" : "No" },
                  { label: "Cert / Tag",  val: certAvail  ? "Yes" : "No" },
                  { label: "Photos",      val: photos.length > 0 ? `${photos.length} photo(s)` : "None" },
                ].map(r => (
                  <div key={r.label} className="flex items-start justify-between text-sm">
                    <span className="text-slate-500 w-28">{r.label}</span>
                    <span className="font-semibold text-slate-800 text-right">{r.val}</span>
                  </div>
                ))}
              </div>

              {/* Plan usage */}
              <div className={`p-3 rounded-xl border text-xs ${subscriptionPlan === "starter" ? "bg-blue-50 border-blue-200" : "bg-emerald-50 border-emerald-200"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`font-semibold ${subscriptionPlan === "starter" ? "text-blue-700" : "text-emerald-700"}`}>
                    {subscriptionPlan === "starter" ? "Starter Plan" : "Pro Plan"} — Listing Usage
                  </span>
                  <span className={subscriptionPlan === "starter" ? "text-blue-600" : "text-emerald-600"}>
                    {activeCount + 1} / {subscriptionPlan === "starter" ? STARTER_LIMIT : "∞"}
                  </span>
                </div>
                {subscriptionPlan === "starter" && (
                  <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, ((activeCount + 1) / STARTER_LIMIT) * 100)}%` }} />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <button
                  onClick={handlePublish}
                  className="w-full py-3 bg-[#2563EB] text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg"
                >
                  <Zap size={16} /> Publish Listing
                </button>
                <button
                  onClick={() => { toast.success("Draft saved"); onCancel(); }}
                  className="w-full py-2.5 border border-gray-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors"
                >
                  Save as Draft
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW: SELLER DASHBOARD
═══════════════════════════════════════════════════════════════ */
function SellerDashboardView({
  subscriptionPlan,
  onCreateListing,
  onViewPlans,
  onMyListings,
}: {
  subscriptionPlan: SubscriptionPlan;
  onCreateListing: () => void;
  onViewPlans: () => void;
  onMyListings: () => void;
}) {
  const myListings = DEMO_LISTINGS.filter(l => l.isMine);
  const active = myListings.filter(l => l.status === "Available").length;
  const pending = myListings.filter(l => l.status === "Pending").length;
  const sold = myListings.filter(l => l.status === "Sold").length;
  const totalViews = myListings.reduce((s, l) => s + l.viewCount, 0);
  const totalContacts = myListings.reduce((s, l) => s + l.contactClicks, 0);

  const limit = subscriptionPlan === "starter" ? STARTER_LIMIT : null;
  const usagePct = limit ? (active / limit) * 100 : 0;

  return (
    <div className="flex-1 overflow-auto bg-[#f8f9fb] py-6 px-4">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Seller Dashboard</h2>
            <p className="text-sm text-slate-500">Mike Torres A&P · {subscriptionPlan === "none" ? "No subscription" : subscriptionPlan === "starter" ? "Starter Plan" : "Pro Plan"}</p>
          </div>
          <button
            onClick={onCreateListing}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={15} /> New Listing
          </button>
        </div>

        {/* Plan usage card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${subscriptionPlan === "pro" ? "bg-blue-100" : subscriptionPlan === "starter" ? "bg-indigo-100" : "bg-slate-100"}`}>
                <Tag size={16} className={subscriptionPlan === "pro" ? "text-blue-600" : subscriptionPlan === "starter" ? "text-indigo-600" : "text-slate-400"} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {subscriptionPlan === "none" ? "No active plan" : subscriptionPlan === "starter" ? "Starter Plan" : "Pro Plan"}
                </p>
                <p className="text-xs text-slate-500">
                  {subscriptionPlan === "none" ? "Subscribe to list parts"
                    : subscriptionPlan === "starter" ? `$25/month · ${active} of ${STARTER_LIMIT} listings used`
                    : "$49.99/month · Unlimited listings"}
                </p>
              </div>
            </div>
            <button onClick={onViewPlans} className="text-xs text-blue-600 hover:underline">
              {subscriptionPlan === "none" ? "Subscribe →" : subscriptionPlan === "starter" ? "Upgrade to Pro →" : "Manage →"}
            </button>
          </div>
          {subscriptionPlan === "starter" && limit && (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>Active listings</span>
                <span>{active} / {limit}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${usagePct > 80 ? "bg-amber-500" : "bg-blue-500"}`}
                  style={{ width: `${Math.min(100, usagePct)}%` }}
                />
              </div>
              {usagePct > 80 && <p className="text-xs text-amber-600 mt-1">Running low on listing slots. <button onClick={onViewPlans} className="underline">Upgrade to Pro</button></p>}
            </div>
          )}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Active Listings",  val: active,        icon: <Package size={18} className="text-blue-600" />,   bg: "bg-blue-50" },
            { label: "Pending",          val: pending,       icon: <Clock size={18} className="text-amber-600" />,    bg: "bg-amber-50" },
            { label: "Sold (all time)",  val: sold,          icon: <CheckCircle2 size={18} className="text-emerald-600" />, bg: "bg-emerald-50" },
            { label: "Total Views",      val: totalViews,    icon: <Eye size={18} className="text-slate-600" />,       bg: "bg-slate-50" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`w-9 h-9 rounded-lg ${k.bg} flex items-center justify-center mb-2`}>{k.icon}</div>
              <p className="text-xl font-bold text-slate-900">{k.val}</p>
              <p className="text-xs text-slate-500">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Listings table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">My Listings</h3>
            <button onClick={onMyListings} className="text-xs text-blue-600 hover:underline">Manage all →</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Part", "Condition", "Price", "Status", "Views", "Contacts", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myListings.map(l => (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono text-slate-400">{l.partNumber}</p>
                      <p className="text-sm font-semibold text-slate-800 truncate max-w-48">{l.title}</p>
                    </td>
                    <td className="px-4 py-3"><ConditionBadge condition={l.condition} /></td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-800">${l.price}</td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{l.viewCount}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{l.contactClicks}</td>
                    <td className="px-4 py-3">
                      <button className="text-slate-400 hover:text-slate-700 p-1 rounded"><MoreHorizontal size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Contact performance */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Contact Performance</h3>
          <div className="space-y-3">
            {myListings.filter(l => l.contactClicks > 0).map(l => (
              <div key={l.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{l.title}</p>
                  <p className="text-xs text-slate-400">{l.viewCount} views</p>
                </div>
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (l.contactClicks / totalContacts) * 100)}%` }} />
                </div>
                <span className="text-xs font-semibold text-slate-700 w-8 text-right">{l.contactClicks}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW: MY LISTINGS
═══════════════════════════════════════════════════════════════ */
function MyListingsView({
  subscriptionPlan,
  onCreateListing,
  onViewPlans,
}: {
  subscriptionPlan: SubscriptionPlan;
  onCreateListing: () => void;
  onViewPlans: () => void;
}) {
  const myListings = DEMO_LISTINGS.filter(l => l.isMine);
  const [activeTab, setActiveTab] = useState<"all" | ListingStatus>("all");
  const [gridView, setGridView] = useState(false);
  const [search, setSearch] = useState("");
  const [statusMap, setStatusMap] = useState<Record<string, ListingStatus>>(
    Object.fromEntries(myListings.map(l => [l.id, l.status]))
  );

  const tabs: Array<{ key: "all" | ListingStatus; label: string }> = [
    { key: "all", label: "All" },
    { key: "Available", label: "Available" },
    { key: "Pending", label: "Pending" },
    { key: "Sold", label: "Sold" },
    { key: "Draft", label: "Draft" },
  ];

  const filtered = myListings.filter(l => {
    const matchTab = activeTab === "all" || statusMap[l.id] === activeTab;
    const matchSearch = !search || l.title.toLowerCase().includes(search.toLowerCase()) || l.partNumber.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  function changeStatus(id: string, newStatus: ListingStatus) {
    setStatusMap(prev => ({ ...prev, [id]: newStatus }));
    toast.success(`Status updated to ${newStatus}`);
  }

  const activeCount = Object.values(statusMap).filter(s => s === "Available").length;
  const limit = subscriptionPlan === "starter" ? STARTER_LIMIT : null;

  return (
    <div className="flex-1 overflow-auto bg-[#f8f9fb] py-6 px-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">My Listings</h2>
          <div className="flex items-center gap-2">
            {limit && activeCount >= limit && (
              <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                <AlertTriangle size={11} /> Listing limit reached · <button onClick={onViewPlans} className="underline">Upgrade</button>
              </span>
            )}
            <button
              onClick={onCreateListing}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              <Plus size={15} /> New Listing
            </button>
          </div>
        </div>

        {/* Plan usage mini */}
        {limit && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                <span className="font-semibold">Starter Plan · Active listings</span>
                <span>{activeCount} / {limit}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${activeCount / limit > 0.8 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${(activeCount / limit) * 100}%` }} />
              </div>
            </div>
            <button onClick={onViewPlans} className="text-xs text-blue-600 hover:underline flex-shrink-0">Upgrade to Pro →</button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="flex border border-gray-200 bg-white rounded-xl overflow-hidden flex-shrink-0">
            {tabs.map(t => {
              const count = t.key === "all" ? myListings.length : myListings.filter(l => statusMap[l.id] === t.key).length;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-3 py-2 text-xs font-medium transition-all flex items-center gap-1.5 ${activeTab === t.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {t.label}
                  <span className={`text-[10px] px-1 rounded-full ${activeTab === t.key ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 flex items-center bg-white border border-gray-200 rounded-xl px-3 gap-2">
            <Search size={13} className="text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search my listings…" className="flex-1 py-2 text-xs bg-transparent outline-none text-slate-800 placeholder:text-slate-400" />
          </div>
          <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white">
            <button onClick={() => setGridView(false)} className={`p-2.5 ${!gridView ? "bg-blue-50 text-blue-700" : "text-slate-400"}`}><List size={14} /></button>
            <button onClick={() => setGridView(true)} className={`p-2.5 ${gridView ? "bg-blue-50 text-blue-700" : "text-slate-400"}`}><Grid3X3 size={14} /></button>
          </div>
        </div>

        {/* Listings */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 flex flex-col items-center text-center">
            <Package size={40} className="text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-700 mb-1">No listings here</p>
            <p className="text-xs text-slate-400 mb-4">{activeTab === "all" ? "List your first part to get started." : `No listings with status "${activeTab}".`}</p>
            <button onClick={onCreateListing} className="px-4 py-2 bg-[#2563EB] text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Create Listing</button>
          </div>
        ) : gridView ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map(l => (
              <div key={l.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-all">
                <div className="h-36 bg-slate-100 relative">
                  {l.imageUrl
                    ? <img src={l.imageUrl} alt={l.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Package size={28} className="text-slate-200" /></div>
                  }
                  <div className="absolute top-2 right-2"><StatusBadge status={statusMap[l.id] ?? l.status} /></div>
                </div>
                <div className="p-3">
                  <p className="text-xs font-mono text-slate-400">{l.partNumber}</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{l.title}</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">${l.price}</p>
                  <ListingActions listing={l} currentStatus={statusMap[l.id] ?? l.status} onChangeStatus={changeStatus} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Part", "P/N", "Condition", "Price", "Status", "Views", "Listed", "Actions"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const curStatus = statusMap[l.id] ?? l.status;
                  return (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800 max-w-44 truncate">{l.title}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-400">{l.partNumber}</td>
                      <td className="px-4 py-3"><ConditionBadge condition={l.condition} /></td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800">${l.price}</td>
                      <td className="px-4 py-3">
                        <select
                          value={curStatus}
                          onChange={e => changeStatus(l.id, e.target.value as ListingStatus)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none"
                        >
                          {["Available","Pending","Sold","Draft"].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{l.viewCount}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{l.listedDate}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button title="Edit" className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 size={13} /></button>
                          <button title="Duplicate" onClick={() => toast.success("Listing duplicated")} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Copy size={13} /></button>
                          <button title="Archive" onClick={() => toast("Listing archived")} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Archive size={13} /></button>
                          {curStatus === "Sold" && (
                            <button title="Relist" onClick={() => changeStatus(l.id, "Available")} className="p-1 rounded hover:bg-slate-100 text-blue-500 hover:text-blue-700"><RotateCcw size={13} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ListingActions({ listing, currentStatus, onChangeStatus }: { listing: MarketListing; currentStatus: ListingStatus; onChangeStatus: (id: string, s: ListingStatus) => void }) {
  return (
    <div className="flex items-center gap-1 mt-2">
      <button onClick={() => onChangeStatus(listing.id, "Available")} className="flex-1 text-xs py-1 rounded-lg border border-gray-200 text-slate-600 hover:bg-slate-50">Active</button>
      <button onClick={() => onChangeStatus(listing.id, "Sold")} className="flex-1 text-xs py-1 rounded-lg border border-gray-200 text-slate-600 hover:bg-slate-50">Mark Sold</button>
      <button title="Edit" className="p-1 rounded border border-gray-200 text-slate-400 hover:bg-slate-50"><Edit2 size={12} /></button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUBSCRIPTION ONBOARDING MODAL
═══════════════════════════════════════════════════════════════ */
function SubscribeModal({
  onClose,
  onSubscribe,
}: {
  onClose: () => void;
  onSubscribe: (plan: "starter" | "pro") => void;
}) {
  const [selected, setSelected] = useState<"starter" | "pro">("starter");
  const [confirming, setConfirming] = useState(false);

  function handleConfirm() {
    setConfirming(true);
    setTimeout(() => {
      onSubscribe(selected);
      setConfirming(false);
    }, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0A1628, #1E3A5F)" }}>
          <div>
            <p className="text-sm text-blue-300 mb-0.5">Seller subscription required</p>
            <h3 className="text-base font-bold text-white">Choose a Plan to List Parts</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 text-white"><X size={14} /></button>
        </div>

        {!confirming ? (
          <div className="p-5 space-y-3">
            {[
              { key: "starter" as const, label: "Starter", price: "$25/mo", desc: "Up to 25 listings · AI autofill · Direct contact" },
              { key: "pro" as const, label: "Pro", price: "$49.99/mo", desc: "Unlimited listings · Video upload · Priority ranking", popular: true },
            ].map(p => (
              <button
                key={p.key}
                onClick={() => setSelected(p.key)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${selected === p.key ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{p.label}</span>
                    {p.popular && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Popular</span>}
                  </div>
                  <span className="text-sm font-bold text-slate-900">{p.price}</span>
                </div>
                <p className="text-xs text-slate-500">{p.desc}</p>
              </button>
            ))}
            <button
              onClick={handleConfirm}
              className="w-full py-3 bg-[#2563EB] text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors mt-2"
            >
              Subscribe — {selected === "starter" ? "$25/mo" : "$49.99/mo"}
            </button>
            <p className="text-xs text-center text-slate-400">Cancel anytime · Stripe secure checkout</p>
          </div>
        ) : (
          <div className="p-8 flex flex-col items-center text-center">
            <Loader2 size={28} className="text-blue-500 animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-800 mb-1">Activating your subscription…</p>
            <p className="text-xs text-slate-500">Setting up {selected === "starter" ? "Starter" : "Pro"} plan</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MANUALS & CATALOGS — INGEST MODAL
   Shows after "Get Access" is obtained (paid or free).
   Lets user Download PDF or Inject into Aircraft Workspace.
═══════════════════════════════════════════════════════════════ */
const AIRCRAFT_OPTIONS = [
  { tail: "N12345", label: "N12345 — Cessna 172S Skyhawk SP" },
  { tail: "N67890", label: "N67890 — Piper PA-28-181 Archer III" },
  { tail: "N24680", label: "N24680 — Beechcraft A36 Bonanza" },
];

function IngestModal({
  listing,
  onClose,
}: {
  listing: ManualListing;
  onClose: (injected?: string) => void;
}) {
  const [phase, setPhase] = useState<"choose" | "select-aircraft" | "injecting" | "done" | "downloading">("choose");
  const [selectedAircraft, setSelectedAircraft] = useState(AIRCRAFT_OPTIONS[0].tail);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  function startInject() {
    setPhase("injecting");
    const steps = [
      { pct: 15, label: "Parsing PDF structure…" },
      { pct: 35, label: `Splitting into ${Math.ceil(listing.pages / 8)} sections…` },
      { pct: 58, label: "Generating vector embeddings…" },
      { pct: 78, label: "Indexing into aircraft knowledge base…" },
      { pct: 92, label: "Linking to aircraft workspace…" },
      { pct: 100, label: "Injection complete." },
    ];
    let i = 0;
    const iv = setInterval(() => {
      if (i < steps.length) {
        setProgress(steps[i].pct);
        setProgressLabel(steps[i].label);
        i++;
      } else {
        clearInterval(iv);
        setTimeout(() => setPhase("done"), 400);
      }
    }, 600);
  }

  function startDownload() {
    setPhase("downloading");
    setTimeout(() => {
      toast.success("Download started", { description: `${listing.title} — ${listing.pages} pages` });
      onClose();
    }, 1200);
  }

  const aircraftLabel = AIRCRAFT_OPTIONS.find(a => a.tail === selectedAircraft)?.label ?? selectedAircraft;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => onClose()}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <BookOpen size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">{listing.title}</p>
              <p className="text-xs text-slate-400">{listing.make} · {listing.models} · {listing.pages} pages · {listing.revision}</p>
            </div>
          </div>
          <button onClick={() => onClose()} className="text-slate-400 hover:text-slate-700 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">

          {/* CHOOSE */}
          {phase === "choose" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">You have access to this document. What would you like to do?</p>

              <div className="grid grid-cols-2 gap-3">
                {/* Download */}
                <button
                  onClick={startDownload}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all group text-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center transition-all">
                    <Download size={22} className="text-slate-500 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Download PDF</p>
                    <p className="text-xs text-slate-400 mt-0.5">Save to your device</p>
                  </div>
                </button>

                {/* Inject */}
                <button
                  onClick={() => setPhase("select-aircraft")}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-blue-200 bg-blue-50/40 hover:border-blue-400 hover:bg-blue-50 transition-all group text-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-all">
                    <DatabaseZap size={22} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Inject to Workspace</p>
                    <p className="text-xs text-blue-500 mt-0.5">Index for AI queries</p>
                  </div>
                  <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">Recommended</span>
                </button>
              </div>

              {/* What is Injection? */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Brain size={14} className="text-purple-600" />
                  <p className="text-xs font-semibold text-slate-700">What is Workspace Injection?</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-3">
                  When you inject a manual, myaircraft.us's AI pipeline processes the PDF and makes its full content available to your AI assistant. You can then ask aircraft-specific questions and get precise, cited answers from the actual manual — like torque specs, procedures, or part numbers.
                </p>
                <div className="space-y-1.5">
                  {[
                    { icon: <FileText size={11} />, text: "PDF parsed into logical sections" },
                    { icon: <Layers size={11} />, text: "Each section embedded as a vector" },
                    { icon: <Cpu size={11} />, text: "Stored and linked to your aircraft" },
                    { icon: <Brain size={11} />, text: "AI can now cite exact passages in answers" },
                  ].map(s => (
                    <div key={s.text} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="text-purple-500">{s.icon}</span>
                      {s.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SELECT AIRCRAFT */}
          {phase === "select-aircraft" && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-1">Select Aircraft</p>
                <p className="text-xs text-slate-500 mb-3">Choose which aircraft workspace to inject this manual into.</p>
                <div className="space-y-2">
                  {AIRCRAFT_OPTIONS.map(a => (
                    <label key={a.tail} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedAircraft === a.tail ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <input type="radio" name="aircraft" value={a.tail} checked={selectedAircraft === a.tail} onChange={() => setSelectedAircraft(a.tail)} className="accent-blue-600" />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{a.label}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <Info size={12} /> The injected manual will be searchable from the AI Workspace for this aircraft only.
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setPhase("choose")} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Back</button>
                <button
                  onClick={startInject}
                  className="flex-1 py-2.5 bg-[#2563EB] text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <DatabaseZap size={15} /> Inject Manual
                </button>
              </div>
            </div>
          )}

          {/* INJECTING */}
          {phase === "injecting" && (
            <div className="py-4 space-y-5">
              <div className="text-center">
                <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <DatabaseZap size={26} className="text-blue-600 animate-pulse" />
                </div>
                <p className="text-sm font-semibold text-slate-800 mb-1">Injecting into workspace…</p>
                <p className="text-xs text-slate-500">{aircraftLabel}</p>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span className="text-blue-600 font-medium">{progressLabel}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-1.5 text-xs text-slate-500">
                <p className="font-semibold text-slate-700 mb-2">Processing: {listing.title}</p>
                {[
                  `${listing.pages} pages detected`,
                  `~${Math.ceil(listing.pages / 8)} semantic sections`,
                  `${listing.pages * 12} estimated tokens`,
                  "Embedding model: text-embedding-3-small",
                ].map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DONE */}
          {phase === "done" && (
            <div className="py-2 space-y-5">
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle2 size={30} className="text-emerald-600" />
                </motion.div>
                <p className="text-base font-bold text-slate-900 mb-1">Manual Injected!</p>
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">{listing.title}</span> is now indexed in your AI workspace for <span className="font-semibold text-blue-700">{selectedAircraft}</span>.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-blue-800 flex items-center gap-2"><Brain size={13} /> You can now ask your AI assistant:</p>
                {[
                  `"What is the torque spec for the prop bolts on ${selectedAircraft}?"`,
                  `"Show me the fuel system diagram from this service manual."`,
                  `"Find the alternator replacement procedure."`,
                ].map(q => (
                  <p key={q} className="text-xs text-blue-600 italic pl-4">— {q}</p>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { toast.success("Opening AI Workspace…"); onClose(selectedAircraft); }}
                  className="flex-1 py-2.5 bg-[#0A1628] text-white rounded-xl text-sm font-semibold hover:bg-[#1E3A5F] transition-colors flex items-center justify-center gap-2"
                >
                  <Brain size={15} /> Open AI Workspace
                </button>
                <button onClick={() => onClose(selectedAircraft)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Done</button>
              </div>
            </div>
          )}

          {/* DOWNLOADING */}
          {phase === "downloading" && (
            <div className="py-8 flex flex-col items-center text-center gap-3">
              <Loader2 size={28} className="text-blue-500 animate-spin" />
              <p className="text-sm font-semibold text-slate-800">Preparing download…</p>
              <p className="text-xs text-slate-500">{listing.title}</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MANUALS — PAYMENT MODAL
   Shown when user clicks "Get Access" on a paid listing they
   don't own yet. After confirming, shows IngestModal.
═══════════════════════════════════════════════════════════════ */
function PaymentModal({
  listing,
  onClose,
  onSuccess,
}: {
  listing: ManualListing;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [processing, setProcessing] = useState(false);

  function handlePurchase() {
    setProcessing(true);
    setTimeout(() => {
      onSuccess();
    }, 1800);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #0A1628, #1E3A5F)" }}>
          <div>
            <p className="text-xs text-blue-300 mb-0.5">Get Access</p>
            <h3 className="text-sm font-bold text-white">{listing.title}</h3>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X size={15} /></button>
        </div>

        {!processing ? (
          <div className="p-5 space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">Document access</span>
                <span className="text-base font-bold text-slate-900">${listing.price}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{listing.pages} pages · {listing.revision}</span>
                <span className="capitalize">{listing.type}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600">
              {[
                "Permanent access to this document",
                "Download PDF to your device",
                "Inject into any aircraft AI workspace",
                "AI-searchable via your Workspace assistant",
              ].map(f => (
                <div key={f} className="flex items-center gap-2">
                  <Check size={12} className="text-emerald-500" />
                  {f}
                </div>
              ))}
            </div>

            <button
              onClick={handlePurchase}
              className="w-full py-3 bg-[#2563EB] text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Purchase — ${listing.price}
            </button>
            <p className="text-xs text-center text-slate-400">Secure checkout · Instant access after payment</p>
          </div>
        ) : (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <Loader2 size={28} className="text-blue-500 animate-spin" />
            <p className="text-sm font-semibold text-slate-800">Processing payment…</p>
            <p className="text-xs text-slate-500">Activating access to {listing.title}</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MANUALS — LIST A MANUAL MODAL
   Subscription-based. No 50/50 split. Seller sets price.
═══════════════════════════════════════════════════════════════ */
function ListManualModal({
  onClose,
  subscriptionPlan,
}: {
  onClose: () => void;
  subscriptionPlan: SubscriptionPlan;
}) {
  const [form, setForm] = useState({
    docType: "maintenance manual" as ManualType,
    revision: "",
    title: "",
    make: "",
    model: "",
    description: "",
    pdfFile: "",
    pricing: "paid" as "free" | "paid",
    price: "",
    launchMode: "publish" as "publish" | "draft",
    attest1: false,
    attest2: false,
    attest3: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    form.title.trim() && form.make.trim() && form.model.trim() &&
    form.pdfFile && form.attest1 && form.attest2 && form.attest3 &&
    (form.pricing === "free" || (form.pricing === "paid" && parseFloat(form.price) > 0));

  function handleSubmit() {
    setSubmitted(true);
    setTimeout(() => {
      toast.success("Manual listed successfully!", { description: form.title });
      onClose();
    }, 2200);
  }

  const manualTypes: ManualType[] = ["maintenance manual", "service manual", "parts catalog"];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full my-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100"
          style={{ background: "linear-gradient(135deg, #0A1628, #1E3A5F)" }}>
          <div>
            <p className="text-xs text-blue-300 mb-0.5">Community Library</p>
            <h3 className="text-base font-bold text-white">List a Manual or Parts Catalog</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"><X size={14} /></button>
        </div>

        {submitted ? (
          <div className="p-10 flex flex-col items-center text-center gap-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
              <CheckCircle2 size={30} className="text-emerald-600" />
            </motion.div>
            <p className="text-base font-bold text-slate-900">{form.launchMode === "publish" ? "Manual listed!" : "Draft saved"}</p>
            <p className="text-sm text-slate-500">{form.title}</p>
          </div>
        ) : (
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Subscription gate notice */}
            {subscriptionPlan === "none" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">Seller subscription required</p>
                  <p className="text-xs text-amber-600">Subscribe to a Starter or Pro plan to list manuals in the community library.</p>
                </div>
              </div>
            )}

            {/* Business model note */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs text-blue-700 font-semibold mb-1 flex items-center gap-1.5"><DollarSign size={12} /> How pricing works</p>
              <p className="text-xs text-blue-600">
                You set the price. Buyers pay that amount directly. No revenue split — your subscription covers listing access. Standard payment processing fees apply.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Document Type *</label>
                <select value={form.docType} onChange={e => setForm({...form, docType: e.target.value as ManualType})} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-300 capitalize">
                  {manualTypes.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Revision / Edition</label>
                <input value={form.revision} onChange={e => setForm({...form, revision: e.target.value})} placeholder="e.g. Rev 12 / 2023" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Document Title *</label>
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Cessna 172S Maintenance Manual" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Aircraft Make *</label>
                <input value={form.make} onChange={e => setForm({...form, make: e.target.value})} placeholder="e.g. Cessna" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Model(s) *</label>
                <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="e.g. 172S, 172SP" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Description</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} placeholder="Brief description of content, coverage, and any notes…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
            </div>

            {/* PDF Upload */}
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">PDF File *</label>
              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => setForm({...form, pdfFile: e.target.files?.[0]?.name ?? ""})} />
                {form.pdfFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText size={18} className="text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">{form.pdfFile}</span>
                  </div>
                ) : (
                  <>
                    <Upload size={20} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">Click to upload PDF · Max 200MB</p>
                  </>
                )}
              </div>
            </div>

            {/* Pricing */}
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Pricing</label>
              <div className="flex gap-2 mb-3">
                {(["free","paid"] as const).map(p => (
                  <button key={p} onClick={() => setForm({...form, pricing: p})}
                    className={`flex-1 py-2 rounded-xl border text-xs font-semibold capitalize transition-all ${form.pricing === p ? "bg-[#0A1628] text-white border-[#0A1628]" : "border-gray-200 text-slate-600 hover:bg-slate-50"}`}
                  >{p}</button>
                ))}
              </div>
              {form.pricing === "paid" && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Your Price ($)</label>
                  <input type="number" min="1" value={form.price} onChange={e => setForm({...form, price: e.target.value})} placeholder="e.g. 25" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
                  <p className="text-xs text-slate-400 mt-1">You keep 100% minus payment processing. No platform revenue split.</p>
                </div>
              )}
            </div>

            {/* Attestations */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
              <p className="text-xs font-semibold text-slate-700 mb-2">Required Attestations</p>
              {[
                { key: "attest1", label: "I have the rights or permission to distribute this document in the myaircraft.us community library." },
                { key: "attest2", label: "This is not a POH, AFM, or aircraft logbook — only maintenance manuals, service manuals, and parts catalogs are permitted." },
                { key: "attest3", label: "I understand that myaircraft.us may moderate or remove this listing if it violates community standards." },
              ].map(a => (
                <label key={a.key} className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={(form as any)[a.key]} onChange={e => setForm({...form, [a.key]: e.target.checked})} className="accent-blue-600 mt-0.5" />
                  <span className="text-xs text-slate-600">{a.label}</span>
                </label>
              ))}
            </div>

            {/* Launch mode */}
            <div className="flex gap-2">
              {(["publish","draft"] as const).map(m => (
                <button key={m} onClick={() => setForm({...form, launchMode: m})}
                  className={`flex-1 py-2 rounded-xl border text-xs font-semibold capitalize transition-all ${form.launchMode === m ? "bg-blue-50 border-blue-400 text-blue-700" : "border-gray-200 text-slate-500 hover:bg-slate-50"}`}
                >
                  {m === "publish" ? "Publish immediately" : "Save as draft"}
                </button>
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || subscriptionPlan === "none"}
              className="w-full py-3 bg-[#2563EB] text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {form.launchMode === "publish" ? "Publish Listing" : "Save Draft"}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MANUALS — MANUAL LISTING CARD
═══════════════════════════════════════════════════════════════ */
const TYPE_COLORS: Record<ManualType, string> = {
  "maintenance manual": "bg-orange-100 text-orange-700 border-orange-200",
  "service manual":     "bg-blue-100 text-blue-700 border-blue-200",
  "parts catalog":      "bg-green-100 text-green-700 border-green-200",
};
const TYPE_ICONS: Record<ManualType, React.ReactNode> = {
  "maintenance manual": <Wrench size={11} />,
  "service manual":     <FileText size={11} />,
  "parts catalog":      <Layers size={11} />,
};

function ManualCard({
  listing,
  accessState,
  injectedAircraft,
  onGetAccess,
  onIngest,
}: {
  listing: ManualListing;
  accessState: boolean;
  injectedAircraft: string[];
  onGetAccess: () => void;
  onIngest: () => void;
}) {
  const isFree = listing.price === 0;
  const hasAccess = isFree || accessState;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition-all flex flex-col gap-3"
    >
      {/* Price + status row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isFree ? (
            <span className="text-base font-bold text-slate-900">Free</span>
          ) : (
            <span className="text-base font-bold text-slate-900">${listing.price.toFixed(2)}</span>
          )}
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
            listing.status === "published"
              ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
              : listing.status === "draft"
              ? "text-slate-500 bg-slate-100 border border-slate-200"
              : "text-amber-700 bg-amber-50 border border-amber-200"
          }`}>
            {listing.status}
          </span>
        </div>
        {/* Rating */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Star size={12} className="fill-amber-400 text-amber-400" />
          <span className="text-xs font-semibold text-amber-600">{listing.rating}</span>
          <span className="text-xs text-slate-400 ml-0.5">· {listing.reviews} review{listing.reviews !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Title + make/models */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 leading-snug mb-0.5">{listing.title}</h3>
        <p className="text-xs text-slate-500">{listing.make} · {listing.models}</p>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 flex-1">{listing.description}</p>

      {/* Type + meta chips */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium flex items-center gap-1 capitalize border ${TYPE_COLORS[listing.type]}`}>
          {TYPE_ICONS[listing.type]} {listing.type}
        </span>
        <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200">
          {listing.pages} page{listing.pages !== 1 ? "s" : ""}
        </span>
        <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200">
          {listing.visibility}
        </span>
        {injectedAircraft.length > 0 && (
          <span className="text-[11px] bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md flex items-center gap-1">
            <Brain size={9} /> Injected · {injectedAircraft.join(", ")}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-slate-100">
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all font-medium">
          <Eye size={13} /> View details
        </button>
        {hasAccess ? (
          <button
            onClick={onIngest}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#0A1628] hover:bg-[#1E3A5F] text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
          >
            <DatabaseZap size={13} />
            {injectedAircraft.length > 0 ? "Re-inject / Download" : isFree ? "Open and ingest" : "Download / Inject"}
          </button>
        ) : (
          <button
            onClick={onGetAccess}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#0A1628] hover:bg-[#1E3A5F] text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
          >
            <ShoppingCart size={13} /> Get access
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MANUALS — CATALOG VIEW (main browsing + seller dashboard + moderation)
═══════════════════════════════════════════════════════════════ */
function ManualsCatalogView({
  subscriptionPlan,
}: {
  subscriptionPlan: SubscriptionPlan;
}) {
  const [tab, setTab]               = useState<"browse" | "seller" | "moderation">("browse");
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ManualType>("all");
  const [showPublish, setShowPublish] = useState(false);

  // Per-listing access & inject state (client-side simulation)
  const [accessMap, setAccessMap]   = useState<Record<string, boolean>>(
    Object.fromEntries(MANUAL_LISTINGS.map(l => [l.id, l.hasAccess ?? false]))
  );
  const [injectMap, setInjectMap]   = useState<Record<string, string[]>>(
    Object.fromEntries(MANUAL_LISTINGS.map(l => [l.id, l.injectedAircraft ?? []]))
  );
  const [payingId, setPayingId]     = useState<string | null>(null);
  const [ingestId, setIngestId]     = useState<string | null>(null);

  const manualTypes: ManualType[] = ["maintenance manual", "service manual", "parts catalog"];

  const filtered = MANUAL_LISTINGS.filter(l => {
    const q = search.toLowerCase();
    const matchQ = !q || l.title.toLowerCase().includes(q) || l.models.toLowerCase().includes(q) || l.make.toLowerCase().includes(q);
    const matchT = typeFilter === "all" || l.type === typeFilter;
    return matchQ && matchT;
  });

  const myListings = MANUAL_LISTINGS.filter(l => l.sellerId === "me");
  const moderationQueue = [
    { id: "mod-1", title: "Beechcraft Bonanza A36 Service Manual", make: "Beechcraft", model: "A36", type: "service manual", sellerName: "JimBob Aviation", submittedAt: "2026-04-08" },
    { id: "mod-2", title: "Continental TSIO-520 Overhaul Manual", make: "Continental", model: "TSIO-520", type: "maintenance manual", sellerName: "Engine Docs LLC", submittedAt: "2026-04-07" },
  ];

  function handleGetAccess(listingId: string) {
    const l = MANUAL_LISTINGS.find(ll => ll.id === listingId);
    if (!l) return;
    if (l.price === 0) {
      // Free — go directly to ingest
      setAccessMap(m => ({ ...m, [listingId]: true }));
      setIngestId(listingId);
    } else {
      setPayingId(listingId);
    }
  }

  function handlePaymentSuccess(listingId: string) {
    setAccessMap(m => ({ ...m, [listingId]: true }));
    setPayingId(null);
    toast.success("Access granted!", { description: "You can now download or inject this document." });
    setIngestId(listingId);
  }

  function handleIngestClose(aircraft?: string) {
    if (aircraft && ingestId) {
      setInjectMap(m => ({
        ...m,
        [ingestId]: [...(m[ingestId] || []).filter(a => a !== aircraft), aircraft],
      }));
    }
    setIngestId(null);
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Info banner */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 max-w-5xl mx-auto">
          <span className="flex items-center gap-1.5"><Shield size={11} className="text-blue-500" /> Aircraft-private records stay private</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-emerald-500" /> Only approved manuals allowed</span>
          <span className="flex items-center gap-1.5"><DatabaseZap size={11} className="text-purple-500" /> Direct ingest into aircraft AI workspaces</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 flex items-center px-4 gap-1">
        {[
          { key: "browse" as const,     label: "Browse Manuals",     icon: <BookOpen size={13} /> },
          { key: "seller" as const,     label: "Seller Dashboard",   icon: <BarChart3 size={13} /> },
          { key: "moderation" as const, label: "Moderation Queue",   icon: <Shield size={13} /> },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-all ${tab === t.key ? "border-[#2563EB] text-[#2563EB]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <button
          onClick={() => setShowPublish(true)}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-[#0A1628] text-white rounded-lg text-xs font-semibold hover:bg-[#1E3A5F] transition-colors"
        >
          <Upload size={12} /> List a Manual
        </button>
      </div>

      {/* BROWSE TAB */}
      {tab === "browse" && (
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Search + type filter */}
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center bg-white border border-gray-200 rounded-xl px-3 gap-2 shadow-sm">
                <Search size={14} className="text-slate-400 flex-shrink-0" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, aircraft model, or description…" className="flex-1 py-2.5 bg-transparent text-sm outline-none text-slate-800 placeholder:text-slate-400" />
                {search && <button onClick={() => setSearch("")}><X size={13} className="text-slate-400" /></button>}
              </div>
              <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <button onClick={() => setTypeFilter("all")} className={`px-3 py-2.5 text-xs font-medium border-r border-gray-200 transition-all ${typeFilter === "all" ? "bg-[#0A1628] text-white" : "text-slate-500 hover:bg-slate-50"}`}>All types</button>
                {manualTypes.map(t => (
                  <button key={t} onClick={() => setTypeFilter(typeFilter === t ? "all" : t)} className={`px-3 py-2.5 text-xs font-medium border-r border-gray-200 capitalize transition-all ${typeFilter === t ? "bg-[#0A1628] text-white" : "text-slate-500 hover:bg-slate-50"}`}>{t}</button>
                ))}
              </div>
            </div>

            {/* Result count + breakdown */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{filtered.length}</span> manual{filtered.length !== 1 ? "s" : ""} available
                {typeFilter !== "all" && <span className="text-blue-700 font-medium capitalize ml-1">· {typeFilter}</span>}
                {search && <span className="text-blue-700 font-medium ml-1">· "{search}"</span>}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                {manualTypes.map(t => {
                  const n = MANUAL_LISTINGS.filter(l => l.type === t).length;
                  return <span key={t} className="capitalize">{n} {t}</span>;
                })}
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(l => (
                <ManualCard
                  key={l.id}
                  listing={l}
                  accessState={accessMap[l.id]}
                  injectedAircraft={injectMap[l.id] ?? []}
                  onGetAccess={() => handleGetAccess(l.id)}
                  onIngest={() => { if (!accessMap[l.id]) { setAccessMap(m => ({...m, [l.id]: true})); } setIngestId(l.id); }}
                />
              ))}
            </div>

            {/* Upload CTA */}
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 flex items-center justify-between gap-6 mt-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Upload size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-0.5">Upload to Community Library</p>
                  <p className="text-xs text-slate-500">Publish maintenance manuals and parts catalogs. POH, AFM, and logbooks are not permitted.</p>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Shield size={10} /> Rights attestation required</span>
                    <span className="flex items-center gap-1"><DollarSign size={10} /> You set the price — no revenue split</span>
                    <span className="flex items-center gap-1"><Check size={10} /> Net after Stripe fees</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowPublish(true)} className="flex items-center gap-2 px-5 py-2.5 bg-[#0A1628] text-white rounded-xl text-sm font-semibold hover:bg-[#1E3A5F] transition-colors flex-shrink-0 shadow-sm">
                Publish listing <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELLER DASHBOARD TAB */}
      {tab === "seller" && (
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">My Manual Listings</h3>
              <button onClick={() => setShowPublish(true)} className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors">
                <Plus size={13} /> New Listing
              </button>
            </div>

            {/* Plan note */}
            <div className={`bg-white border rounded-xl p-4 flex items-center justify-between ${subscriptionPlan !== "none" ? "border-blue-200 bg-blue-50/30" : "border-amber-200 bg-amber-50/30"}`}>
              <div className="flex items-center gap-3">
                <BookOpen size={18} className={subscriptionPlan !== "none" ? "text-blue-600" : "text-amber-500"} />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {subscriptionPlan === "none" ? "No active seller plan" : subscriptionPlan === "starter" ? "Starter Plan active" : "Pro Plan active"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {subscriptionPlan === "none" ? "Subscribe to list manuals in the community library."
                      : "You can list maintenance manuals, service manuals, and parts catalogs."}
                  </p>
                </div>
              </div>
              {subscriptionPlan === "none" && (
                <span className="text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">Subscribe to list →</span>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {["Title", "Type", "Price", "Status", "Pages", "Actions"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myListings.map(l => (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">{l.title}</p>
                        <p className="text-xs text-slate-400">{l.make} · {l.models}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-1.5 py-0.5 rounded border capitalize font-medium ${TYPE_COLORS[l.type]}`}>{l.type}</span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800">{l.price === 0 ? "Free" : `$${l.price}`}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{l.status}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{l.pages}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Edit2 size={13} /></button>
                          <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><ExternalLink size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODERATION TAB */}
      {tab === "moderation" && (
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <Shield size={16} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Moderation Queue</h3>
                <p className="text-xs text-slate-500">{moderationQueue.length} pending review</p>
              </div>
            </div>

            {moderationQueue.map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-amber-200 p-4 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>{item.make} · {item.model}</span>
                    <span className="capitalize">{item.type}</span>
                    <span>Submitted by <span className="font-semibold">{item.sellerName}</span></span>
                    <span>{item.submittedAt}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toast.success("Listing approved")} className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg font-semibold hover:bg-emerald-700 transition-colors">Approve</button>
                  <button onClick={() => toast("Listing rejected")} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg font-semibold hover:bg-red-700 transition-colors">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {payingId && (
          <PaymentModal
            listing={MANUAL_LISTINGS.find(l => l.id === payingId)!}
            onClose={() => setPayingId(null)}
            onSuccess={() => handlePaymentSuccess(payingId)}
          />
        )}
        {ingestId && (
          <IngestModal
            listing={MANUAL_LISTINGS.find(l => l.id === ingestId)!}
            onClose={handleIngestClose}
          />
        )}
        {showPublish && (
          <ListManualModal onClose={() => setShowPublish(false)} subscriptionPlan={subscriptionPlan} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN MarketplacePage
═══════════════════════════════════════════════════════════════ */
export function MarketplacePage() {
  const [marketMode, setMarketMode]             = useState<MarketMode>("parts");
  const [view, setView]                         = useState<MarketView>("browse");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [browseQuery, setBrowseQuery]           = useState("");
  const [browseCategory, setBrowseCategory]     = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan>("starter");
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [historyStack, setHistoryStack]         = useState<MarketView[]>([]);

  const myActiveCount = DEMO_LISTINGS.filter(l => l.isMine && l.status === "Available").length;

  function navigateTo(v: MarketView) {
    setHistoryStack(s => [...s, view]);
    setView(v);
  }

  function goBack() {
    const prev = historyStack[historyStack.length - 1] ?? "home";
    setHistoryStack(s => s.slice(0, -1));
    setView(prev);
  }

  function handleViewListing(id: string) {
    setSelectedListingId(id);
    navigateTo("detail");
  }

  function handleBrowse(query?: string) {
    setBrowseQuery(query ?? "");
    setBrowseCategory("");
    navigateTo("browse");
  }

  function handleBrowseCategory(catId: string) {
    setBrowseCategory(catId);
    setBrowseQuery("");
    navigateTo("browse");
  }

  function handleListPart() {
    if (subscriptionPlan === "none") {
      setShowSubscribeModal(true);
    } else {
      navigateTo("create");
    }
  }

  function handleSubscribe(plan: "starter" | "pro") {
    setSubscriptionPlan(plan);
    setShowSubscribeModal(false);
    toast.success(`${plan === "starter" ? "Starter" : "Pro"} plan activated!`, {
      description: "You can now list parts in the marketplace.",
    });
    navigateTo("create");
  }

  const subNavTabs = [
    { key: "browse",      label: "Browse Parts",    icon: <Search size={14} /> },
    { key: "dashboard",   label: "Seller Dashboard", icon: <BarChart3 size={14} /> },
    { key: "my-listings", label: "My Listings",      icon: <Package size={14} /> },
    { key: "plans",       label: "Seller Plans",     icon: <Tag size={14} /> },
  ] as const;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f8f9fb]">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Back button for detail / create */}
            {marketMode === "parts" && (view === "detail" || view === "create") && (
              <button onClick={goBack} className="text-slate-500 hover:text-blue-700 transition-colors">
                <ArrowLeft size={17} />
              </button>
            )}
            <h1 className="text-base font-bold text-slate-900">Marketplace</h1>
            {marketMode === "parts" && view === "detail" && selectedListingId && (
              <span className="text-xs text-slate-400">
                · {DEMO_LISTINGS.find(l => l.id === selectedListingId)?.partNumber}
              </span>
            )}
            {marketMode === "parts" && view === "create" && <span className="text-xs text-slate-400">· Create Listing</span>}
          </div>

          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
              <button
                onClick={() => { setMarketMode("parts"); setView("browse"); setHistoryStack([]); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${marketMode === "parts" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
              >
                <Package size={12} /> Parts
              </button>
              <button
                onClick={() => setMarketMode("manuals")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${marketMode === "manuals" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
              >
                <BookOpen size={12} /> Manuals &amp; Catalogs
              </button>
            </div>

            {/* Subscription badge */}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5
              ${subscriptionPlan === "pro" ? "bg-blue-50 text-blue-700 border-blue-200"
              : subscriptionPlan === "starter" ? "bg-indigo-50 text-indigo-700 border-indigo-200"
              : "bg-slate-50 text-slate-500 border-slate-200"}`}
            >
              <Tag size={11} />
              {subscriptionPlan === "none" ? "No plan" : subscriptionPlan === "starter" ? "Starter" : "Pro"}
            </span>
            {marketMode === "parts" ? (
              <button
                onClick={handleListPart}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus size={13} /> List a Part
              </button>
            ) : (
              <button
                onClick={() => {/* handled inside ManualsCatalogView */}}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#0A1628] text-white rounded-lg text-xs font-semibold hover:bg-[#1E3A5F] transition-colors shadow-sm"
              >
                <Upload size={13} /> List a Manual
              </button>
            )}
          </div>
        </div>

        {/* Sub-nav (parts mode only, hide during create/detail) */}
        {marketMode === "parts" && view !== "create" && view !== "detail" && (
          <div className="flex border-t border-slate-100 overflow-x-auto">
            {subNavTabs.map(t => (
              <button
                key={t.key}
                onClick={() => { setHistoryStack([]); setView(t.key); }}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all ${
                  view === t.key
                    ? "border-[#2563EB] text-[#2563EB] bg-blue-50/40"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* View content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={marketMode === "manuals" ? "manuals" : view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="flex-1 overflow-hidden flex flex-col min-h-0"
        >
          {/* ── MANUALS MODE ───────────────────────────────── */}
          {marketMode === "manuals" && (
            <ManualsCatalogView subscriptionPlan={subscriptionPlan} />
          )}

          {/* ── PARTS MODE ─────────────────────────────────── */}
          {marketMode === "parts" && view === "home" && (
            <HomeView
              onViewListing={handleViewListing}
              onBrowse={handleBrowse}
              onBrowseCategory={handleBrowseCategory}
              onListPart={handleListPart}
              onViewPlans={() => navigateTo("plans")}
              subscriptionPlan={subscriptionPlan}
            />
          )}

          {marketMode === "parts" && view === "browse" && (
            <BrowseView
              initialQuery={browseQuery}
              initialCategory={browseCategory}
              onViewListing={handleViewListing}
            />
          )}

          {marketMode === "parts" && view === "detail" && selectedListingId && (
            <ListingDetailView
              listingId={selectedListingId}
              onBack={goBack}
              onViewListing={handleViewListing}
            />
          )}

          {marketMode === "parts" && view === "plans" && (
            <SellerPlansView
              onSubscribe={plan => {
                setSubscriptionPlan(plan);
                toast.success(`${plan === "starter" ? "Starter" : "Pro"} plan activated!`);
              }}
              currentPlan={subscriptionPlan}
            />
          )}

          {marketMode === "parts" && view === "create" && (
            <CreateListingWizard
              onComplete={() => { setView("my-listings"); setHistoryStack([]); }}
              onCancel={goBack}
              subscriptionPlan={subscriptionPlan}
              activeCount={myActiveCount}
            />
          )}

          {marketMode === "parts" && view === "dashboard" && (
            <SellerDashboardView
              subscriptionPlan={subscriptionPlan}
              onCreateListing={handleListPart}
              onViewPlans={() => navigateTo("plans")}
              onMyListings={() => navigateTo("my-listings")}
            />
          )}

          {marketMode === "parts" && view === "my-listings" && (
            <MyListingsView
              subscriptionPlan={subscriptionPlan}
              onCreateListing={handleListPart}
              onViewPlans={() => navigateTo("plans")}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Subscribe modal */}
      <AnimatePresence>
        {showSubscribeModal && (
          <SubscribeModal
            onClose={() => setShowSubscribeModal(false)}
            onSubscribe={handleSubscribe}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
