"use client";

import Link from "@/components/shared/tenant-link";
import { Plane, Search, Plus, Filter, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { AddAircraftModal } from "./AddAircraftModal";
import { AnimatePresence } from "motion/react";

interface AircraftItem {
  id: string;
  tail_number: string;
  make: string;
  model: string;
  year?: number | null;
  serial_number?: string | null;
  engine_make?: string | null;
  engine_model?: string | null;
  total_time_hours?: number | null;
  document_count?: number | null;
}

export function AircraftList() {
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [aircraftData, setAircraftData] = useState<AircraftItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadAircraft() {
      try {
        const res = await fetch("/api/aircraft");
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        setAircraftData(Array.isArray(payload) ? payload : []);
      } catch (err) {
        console.error("Failed to load aircraft", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadAircraft();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = aircraftData.filter((a) =>
    `${a.tail_number} ${a.make} ${a.model}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Aircraft</h1>
          <p className="text-[13px] text-muted-foreground">{aircraftData.length} aircraft in your portfolio</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors" style={{ fontWeight: 500 }}>
          <Plus className="w-4 h-4" /> Add Aircraft
        </button>
      </div>

      {/* Search & filter */}
      <div className="flex gap-3 mb-5">
        <div className="flex-1 flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by tail number, model, or serial..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-[13px] outline-none flex-1 placeholder:text-muted-foreground/60"
          />
        </div>
        <button className="flex items-center gap-2 bg-white border border-border rounded-lg px-4 py-2 text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>
          <Filter className="w-4 h-4" /> Filters
        </button>
      </div>

      {/* Add Aircraft Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddAircraftModal
            onClose={() => setShowAddModal(false)}
            onAdd={(result) => {
              const aircraft = result?.aircraft;
              if (!aircraft?.id) return;
              setAircraftData((prev) => [
                aircraft,
                ...prev.filter((item) => item.id !== aircraft.id),
              ]);
            }}
          />
        )}
      </AnimatePresence>

      {/* Empty state — first-time user */}
      {!isLoading && aircraftData.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-border p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-4">
            <Plane className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-[18px] text-foreground mb-2" style={{ fontWeight: 600 }}>
            Add your first aircraft to get started
          </h2>
          <p className="text-[14px] text-muted-foreground max-w-md mx-auto mb-6">
            Enter your tail number (like N12345). We&rsquo;ll look it up in the FAA registry and pre-fill the rest for you.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-[14px] hover:bg-primary/90 transition-colors"
            style={{ fontWeight: 500 }}
          >
            <Plus className="w-4 h-4" /> Add Your First Aircraft
          </button>
        </div>
      )}

      {/* No-search-result state */}
      {!isLoading && aircraftData.length > 0 && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <p className="text-[14px] text-muted-foreground">
            No aircraft match &ldquo;{search}&rdquo;. Try a different search.
          </p>
        </div>
      )}

      {/* Aircraft cards */}
      <div className="space-y-3">
        {filtered.map((ac) => (
          <Link
            href={`/aircraft/${ac.id}`}
            key={ac.id}
            className="block bg-white rounded-xl border border-border p-5 hover:shadow-md hover:shadow-primary/5 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/8 flex items-center justify-center">
                  <Plane className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-[17px] text-foreground" style={{ fontWeight: 700 }}>{ac.tail_number}</span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full text-emerald-600 bg-emerald-50" style={{ fontWeight: 600 }}>Active</span>
                  </div>
                  <div className="text-[13px] text-muted-foreground">{[ac.make, ac.model].filter(Boolean).join(" ")} &middot; {ac.year ?? "—"} &middot; S/N {ac.serial_number ?? "—"}</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-border text-[12px]">
              <div>
                <div className="text-muted-foreground mb-0.5">Engine</div>
                <div className="text-foreground" style={{ fontWeight: 500 }}>{[ac.engine_make, ac.engine_model].filter(Boolean).join(" ") || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5" title="Total Time Airframe">Total Hours</div>
                <div className="text-foreground" style={{ fontWeight: 500 }}>{ac.total_time_hours ? `${ac.total_time_hours} hrs` : "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Documents</div>
                <div className="text-foreground" style={{ fontWeight: 500 }}>{ac.document_count ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Next Due</div>
                <div className="text-foreground" style={{ fontWeight: 500 }}>—</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Last Activity</div>
                <div className="text-foreground" style={{ fontWeight: 500 }}>—</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
