"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search, ShoppingCart, Package, TrendingUp, AlertTriangle, CheckCircle,
  ExternalLink, Star, Filter, SortAsc, RefreshCw, Plus, X, Info
} from "lucide-react";
import { useDataStore, type PartSearchResult } from "./DataStore";
import { motion, AnimatePresence } from "motion/react";
import { lookupAircraftByNNumber } from "../faaRegistryService";

interface PartsLookupPanelProps {
  initialQuery?: string;
  aircraft?: string;
  onAddToWorkOrder?: (part: PartSearchResult) => void;
  onClose?: () => void;
}

export function PartsLookupPanel({
  initialQuery = "",
  aircraft = "N12345",
  onAddToWorkOrder,
  onClose,
}: PartsLookupPanelProps) {
  const { aircraft: aircraftList, getAircraftIdByTail } = useDataStore();
  const CUSTOM_AIRCRAFT_KEY = "__custom__";
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<PartSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [faaStatusMessage, setFaaStatusMessage] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<PartSearchResult | null>(null);
  const [sortBy, setSortBy] = useState<"price-low" | "price-high" | "vendor">("price-low");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const initialAircraftId = useMemo(
    () => getAircraftIdByTail(aircraft) ?? CUSTOM_AIRCRAFT_KEY,
    [aircraft, getAircraftIdByTail]
  );
  const [selectedAircraftId, setSelectedAircraftId] = useState(initialAircraftId);
  const [customTail, setCustomTail] = useState(initialAircraftId === CUSTOM_AIRCRAFT_KEY ? aircraft : "");

  useEffect(() => {
    const matchedId = getAircraftIdByTail(aircraft) ?? CUSTOM_AIRCRAFT_KEY;
    setSelectedAircraftId(matchedId);
    setCustomTail(matchedId === CUSTOM_AIRCRAFT_KEY ? aircraft : "");
  }, [aircraft, getAircraftIdByTail]);

  const selectedAircraft = useMemo(
    () => aircraftList.find((item) => item.id === selectedAircraftId) ?? null,
    [aircraftList, selectedAircraftId]
  );
  const activeTail = selectedAircraft?.tail_number ?? customTail.trim().toUpperCase();
  const isCustomTailMode = selectedAircraftId === CUSTOM_AIRCRAFT_KEY;
  const usingSavedAircraft = Boolean(selectedAircraft);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      void handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearchError(null);
    try {
      const aircraftId = selectedAircraft?.id ?? null;
      let aircraftContext: Record<string, unknown> | null = null;
      let nextFaaMessage: string | null = null;

      if (!aircraftId && activeTail) {
        const lookup = await lookupAircraftByNNumber(activeTail).catch(() => null);
        if (lookup?.found) {
          aircraftContext = {
            tailNumber: lookup.aircraft.nNumber || activeTail,
            make: lookup.aircraft.manufacturer || "Unknown",
            model: lookup.aircraft.model || "Unknown",
            year: lookup.aircraft.year ?? null,
            serialNumber: lookup.aircraft.serialNumber ?? null,
            engineMake: lookup.engine.manufacturer ?? null,
            engineModel: lookup.engine.model ?? null,
            propModel: lookup.propeller ?? null,
          };
          nextFaaMessage =
            lookup.source === "internal"
              ? `Using saved aircraft profile for ${lookup.aircraft.nNumber || activeTail}.`
              : `FAA registry matched ${lookup.aircraft.nNumber || activeTail}.`;
        } else if (lookup?.error) {
          nextFaaMessage = /unavailable|unreachable|timed out|returned 4|returned 5/i.test(
            lookup.error
          )
            ? `FAA registry is temporarily unavailable for ${activeTail}. Continuing with a generic search.`
            : `${activeTail} was not found in the FAA registry. Continuing with a generic search.`;
        }
      } else if (selectedAircraft?.tail_number) {
        nextFaaMessage = `Using saved aircraft profile for ${selectedAircraft.tail_number}.`;
      }
      setFaaStatusMessage(nextFaaMessage);

      const res = await fetch("/api/parts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          aircraft_id: aircraftId,
          aircraft_context: aircraftContext,
          limit: 30,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Search failed");
      }
      const payload = await res.json().catch(() => ({}));
      const offers = Array.isArray(payload?.offers) ? payload.offers : [];
      const mapped: PartSearchResult[] = offers.map((o: any) => ({
        id: o.id ?? `offer-${Math.random().toString(36).slice(2)}`,
        pn: o.partNumber ?? o.title ?? "Unknown",
        desc: o.title ?? o.description ?? "Parts listing",
        vendor: o.vendorName ?? o.vendorDomain ?? "Unknown vendor",
        price: typeof o.totalEstimatedPrice === "number" ? o.totalEstimatedPrice : (o.price ?? 0),
        condition: o.condition ? String(o.condition) : "Serviceable",
        stock: o.stockLabel ?? "Check availability",
        leadTime: o.shippingSpeedLabel ?? "Varies",
        fit: o.compatibilityText?.length ? "Likely fit — verify" : "Check compatibility",
        sourceUrl: o.productUrl ?? "#",
        rating: typeof o.rating === "number" ? o.rating : 4.2,
        reviews: typeof o.ratingCount === "number" ? o.ratingCount : 0,
      }));
      setResults(mapped);
    } catch (err: any) {
      setResults([]);
      setSearchError(err?.message || "Parts search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // Sorting
  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === "price-low") return a.price - b.price;
    if (sortBy === "price-high") return b.price - a.price;
    if (sortBy === "vendor") return a.vendor.localeCompare(b.vendor);
    return 0;
  });

  // Filtering
  const filteredResults =
    filterCondition === "all"
      ? sortedResults
      : sortedResults.filter((r) => r.condition === filterCondition);

  const handleAddToWorkOrder = (part: PartSearchResult) => {
    if (onAddToWorkOrder) {
      onAddToWorkOrder(part);
    }
  };

  const conditionBadgeClass = (condition: string) => {
    switch (condition) {
      case "New":
        return "bg-emerald-50 text-emerald-700";
      case "New-PMA":
        return "bg-blue-50 text-blue-700";
      case "Overhauled":
        return "bg-amber-50 text-amber-700";
      case "Serviceable":
        return "bg-slate-100 text-slate-600";
      case "Used":
        return "bg-slate-100 text-slate-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const fitBadgeClass = (fit: string) => {
    if (fit.includes("Confirmed")) return "bg-emerald-50 text-emerald-700";
    if (fit.includes("Likely")) return "bg-amber-50 text-amber-700";
    return "bg-red-50 text-red-700";
  };

  return (
    <div className="h-full flex flex-col bg-white border-l border-border">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-[15px] text-foreground" style={{ fontWeight: 600 }}>
                Parts Lookup
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Search Atlas & vendor catalogs
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg border border-border px-3 py-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <select
              value={selectedAircraftId}
              onChange={(e) => setSelectedAircraftId(e.target.value)}
              className="flex-1 bg-transparent text-[13px] outline-none"
            >
              {aircraftList.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.tail_number} {item.make || item.model ? `— ${[item.make, item.model].filter(Boolean).join(" ")}` : ""}
                </option>
              ))}
              <option value={CUSTOM_AIRCRAFT_KEY}>Custom N-number…</option>
            </select>
          </div>

          {isCustomTailMode && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg border border-border px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={customTail}
                onChange={(e) => setCustomTail(e.target.value.toUpperCase())}
                placeholder="Enter custom N-number"
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          )}
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-lg border border-border px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Search by P/N or description..."
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-lg text-[13px] hover:bg-primary/90 disabled:opacity-50 transition-colors"
            style={{ fontWeight: 500 }}
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Search"}
          </button>
        </div>

        {/* Aircraft context */}
        <div className="mt-2 text-[11px] text-muted-foreground">
          Aircraft context: <span style={{ fontWeight: 500 }} className="text-foreground">{activeTail || "General search"}</span>
        </div>
        {faaStatusMessage && (
          <div
            className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
              faaStatusMessage.includes("temporarily unavailable")
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : faaStatusMessage.includes("not found")
                  ? "border-slate-200 bg-slate-50 text-slate-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {faaStatusMessage}
          </div>
        )}
      </div>

      {/* Filters & Sort */}
      {results.length > 0 && (
        <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value)}
              className="text-[12px] bg-transparent border-0 outline-none cursor-pointer"
            >
              <option value="all">All Conditions</option>
              <option value="New">New Only</option>
              <option value="New-PMA">PMA Only</option>
              <option value="Overhauled">Overhauled</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <SortAsc className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-[12px] bg-transparent border-0 outline-none cursor-pointer"
            >
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="vendor">Vendor</option>
            </select>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <RefreshCw className="w-8 h-8 animate-spin mb-3 text-primary" />
            <p className="text-[13px]">Searching parts catalog...</p>
          </div>
        ) : filteredResults.length === 0 && query ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
            <Package className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-[13px]">No parts found for "{query}"</p>
            <p className="text-[11px] mt-1">
              {searchError ? searchError : "Try a different search term or P/N"}
            </p>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
            <Search className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-[13px]">Search for aircraft parts</p>
            <p className="text-[11px] mt-1">Enter part number or description above</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            <div className="text-[12px] text-muted-foreground mb-2">
              Found <span style={{ fontWeight: 600 }} className="text-foreground">{filteredResults.length}</span> result
              {filteredResults.length !== 1 ? "s" : ""}
            </div>

            <AnimatePresence>
              {filteredResults.map((part, idx) => (
                <motion.div
                  key={part.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`border rounded-xl p-3 cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${
                    selectedPart?.id === part.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-white"
                  }`}
                  onClick={() => setSelectedPart(part)}
                >
                  {/* Part header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                        {part.pn}
                        {part.altPn && (
                          <span className="text-[11px] text-muted-foreground ml-2">
                            / {part.altPn}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-muted-foreground mt-0.5">
                        {part.desc}
                      </div>
                    </div>
                    <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>
                      ${part.price.toFixed(2)}
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${conditionBadgeClass(
                        part.condition
                      )}`}
                      style={{ fontWeight: 600 }}
                    >
                      {part.condition}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${fitBadgeClass(
                        part.fit
                      )}`}
                      style={{ fontWeight: 600 }}
                    >
                      {part.fit.includes("Confirmed") ? (
                        <CheckCircle className="w-2.5 h-2.5 inline mr-1" />
                      ) : part.fit.includes("Likely") ? (
                        <Info className="w-2.5 h-2.5 inline mr-1" />
                      ) : (
                        <AlertTriangle className="w-2.5 h-2.5 inline mr-1" />
                      )}
                      {part.fit}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {part.stock}
                    </span>
                  </div>

                  {/* Vendor */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      Vendor: <span style={{ fontWeight: 500 }}>{part.vendor}</span>
                    </span>
                    {part.leadTime && <span>{part.leadTime}</span>}
                  </div>

                  {/* Action buttons */}
                  {selectedPart?.id === part.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 pt-3 border-t border-border flex gap-2"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToWorkOrder(part);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-[12px] hover:bg-primary/90"
                        style={{ fontWeight: 500 }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add to Work Order
                      </button>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[12px] hover:bg-muted"
                        style={{ fontWeight: 500 }}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer stats */}
      {filteredResults.length > 0 && (
        <div className="p-3 border-t border-border bg-muted/30">
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div>
              <div className="text-muted-foreground">Avg Price</div>
              <div className="text-foreground" style={{ fontWeight: 600 }}>
                ${(filteredResults.reduce((s, r) => s + r.price, 0) / filteredResults.length).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Lowest</div>
              <div className="text-emerald-600" style={{ fontWeight: 600 }}>
                ${Math.min(...filteredResults.map((r) => r.price)).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Highest</div>
              <div className="text-muted-foreground" style={{ fontWeight: 600 }}>
                ${Math.max(...filteredResults.map((r) => r.price)).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
