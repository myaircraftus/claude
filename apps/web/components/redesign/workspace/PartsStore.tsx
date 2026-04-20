"use client";

import { createContext, useContext, useState, ReactNode } from "react";

/* ─── Types ───────────────────────────────────────────────────── */

export type PartCondition = "New" | "New-PMA" | "Overhauled" | "Serviceable" | "Used";

export type PartCategory =
  | "Airframe"
  | "Powerplant"
  | "Avionics / Electrical"
  | "Landing Gear / Brakes"
  | "Fuel System"
  | "Propeller"
  | "Cabin / Interior"
  | "Hydraulics"
  | "Instruments"
  | "Filters & Fluids"
  | "Fasteners & Hardware"
  | "Misc";

export const PART_CATEGORIES: PartCategory[] = [
  "Airframe", "Powerplant", "Avionics / Electrical", "Landing Gear / Brakes",
  "Fuel System", "Propeller", "Cabin / Interior", "Hydraulics",
  "Instruments", "Filters & Fluids", "Fasteners & Hardware", "Misc",
];

export interface SavedPart {
  id: string;
  pn: string;
  altPn?: string;
  desc: string;
  category: PartCategory;
  manufacturer: string;
  vendor: string;
  sourceUrl?: string;
  condition: PartCondition;
  costPrice: number;   // what we paid
  ourRate: number;     // what we charge
  qtyInStock: number;
  minStock: number;    // reorder alert
  compatibleAircraft?: string[]; // e.g. ["N12345", "Cessna 172"]
  notes?: string;
  savedAt: string;
}

export interface OnlinePartResult {
  id: string;
  pn: string;
  altPn?: string;
  desc: string;
  manufacturer: string;
  vendor: string;
  vendorLogo: string;
  price: number;
  condition: PartCondition;
  stock: string;
  leadTime: string;
  fit: "Confirmed" | "Likely fit — verify" | "Check compatibility";
  sourceUrl: string;
  rating: number;   // 1-5
  reviews: number;
}

/* ─── Context Type ────────────────────────────────────────────── */
interface PartsStoreContextType {
  savedParts: SavedPart[];
  addPart: (part: Omit<SavedPart, "id" | "savedAt">) => SavedPart;
  updatePart: (id: string, patch: Partial<SavedPart>) => void;
  deletePart: (id: string) => void;
  deductStock: (partId: string, qty: number) => void; // called when used in WO
  searchInventory: (query: string) => SavedPart[];
  searchOnlineParts: (query: string, aircraft?: string) => Promise<OnlinePartResult[]>;
}

/* ─── Seed Data (disabled) ────────────────────────────────────── */
const SEED_PARTS: SavedPart[] = [];

/* ─── Context ─────────────────────────────────────────────────── */
const PartsStoreContext = createContext<PartsStoreContextType | null>(null);

export function usePartsStore() {
  const ctx = useContext(PartsStoreContext);
  if (!ctx) throw new Error("usePartsStore must be within PartsStoreProvider");
  return ctx;
}

export function PartsStoreProvider({ children }: { children: ReactNode }) {
  const [savedParts, setSavedParts] = useState<SavedPart[]>([]);

  const addPart = (part: Omit<SavedPart, "id" | "savedAt">): SavedPart => {
    const newPart: SavedPart = {
      ...part,
      id: `sp-${Date.now()}`,
      savedAt: new Date().toISOString().split("T")[0],
    };
    setSavedParts(prev => [newPart, ...prev]);
    return newPart;
  };

  const updatePart = (id: string, patch: Partial<SavedPart>) => {
    setSavedParts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  };

  const deletePart = (id: string) => {
    setSavedParts(prev => prev.filter(p => p.id !== id));
  };

  const deductStock = (partId: string, qty: number) => {
    setSavedParts(prev =>
      prev.map(p => p.id === partId ? { ...p, qtyInStock: Math.max(0, p.qtyInStock - qty) } : p)
    );
  };

  const searchInventory = (query: string): SavedPart[] => {
    if (!query.trim()) return savedParts;
    const q = query.toLowerCase();
    return savedParts.filter(p =>
      p.pn.toLowerCase().includes(q) ||
      p.desc.toLowerCase().includes(q) ||
      p.manufacturer.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.altPn?.toLowerCase().includes(q))
    );
  };

  const searchOnlineParts = async (query: string, aircraft?: string): Promise<OnlinePartResult[]> => {
    if (!query.trim()) return [];
    try {
      let aircraftId: string | null = null;
      if (aircraft) {
        const acRes = await fetch("/api/aircraft");
        if (acRes.ok) {
          const acPayload = await acRes.json().catch(() => []);
          const list = Array.isArray(acPayload) ? acPayload : [];
          const match = list.find((a: any) => String(a.tail_number ?? "").toUpperCase() === aircraft.toUpperCase());
          aircraftId = match?.id ?? null;
        }
      }
      const res = await fetch("/api/parts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          aircraft_id: aircraftId,
          limit: 40,
        }),
      });
      if (!res.ok) return [];
      const payload = await res.json().catch(() => ({}));
      const offers = Array.isArray(payload?.offers) ? payload.offers : [];
      return offers.map((o: any, idx: number) => ({
        id: o.id ?? `online-${idx}`,
        pn: o.partNumber ?? o.title ?? "Unknown",
        altPn: undefined,
        desc: o.title ?? o.description ?? "Parts listing",
        manufacturer: o.brand ?? "Unknown",
        vendor: o.vendorName ?? o.vendorDomain ?? "Unknown vendor",
        vendorLogo: "🔧",
        price: typeof o.totalEstimatedPrice === "number" ? o.totalEstimatedPrice : (o.price ?? 0),
        condition: o.condition ? String(o.condition) as PartCondition : "Serviceable",
        stock: o.stockLabel ?? "Check availability",
        leadTime: o.shippingSpeedLabel ?? "Varies",
        fit: o.compatibilityText?.length ? "Likely fit — verify" : "Check compatibility",
        sourceUrl: o.productUrl ?? "#",
        rating: typeof o.rating === "number" ? o.rating : 4.2,
        reviews: typeof o.ratingCount === "number" ? o.ratingCount : 0,
      }));
    } catch {
      return [];
    }
  };

  return (
    <PartsStoreContext.Provider value={{
      savedParts, addPart, updatePart, deletePart, deductStock,
      searchInventory, searchOnlineParts,
    }}>
      {children}
    </PartsStoreContext.Provider>
  );
}
