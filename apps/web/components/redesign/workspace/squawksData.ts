/**
 * Shared Squawk Data — used by CreateWorkOrderModal, CreateEstimateModal,
 * and the Squawk Queue view. Static records for demo aircraft + generator
 * for any other N-number.
 */

export interface Squawk {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  grounded: boolean;
  status: "Open" | "In Progress" | "Resolved";
  reportedBy: string;
  reportedByRole: string;
  date: string;
  photos?: number;
  linkedWO?: string;
}

// ── Static squawks for known demo aircraft ──────────────────────────────────

const STATIC_SQUAWKS: Record<string, Squawk[]> = {};

// ── Demo squawk generator for unknown aircraft ──────────────────────────────

const SQUAWK_TEMPLATES: Array<{
  title: string;
  description: string;
  category: string;
  severity: Squawk["severity"];
}> = [];

function _hashStr(str: string): number {
  return str.split("").reduce((acc, c) => ((acc * 31 + c.charCodeAt(0)) | 0) >>> 0, 0);
}

function generateDemoSquawks(_nNumber: string): Squawk[] {
  return [];
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getSquawksForAircraft(nNumber: string): Squawk[] {
  const norm = nNumber.toUpperCase().trim();
  // Try with and without leading N
  const withN = norm.startsWith("N") ? norm : `N${norm}`;
  const withoutN = norm.startsWith("N") ? norm.slice(1) : norm;

  if (STATIC_SQUAWKS[withN]) return STATIC_SQUAWKS[withN];
  if (STATIC_SQUAWKS[withoutN]) return STATIC_SQUAWKS[withoutN];

  return generateDemoSquawks(withN);
}

export const SEVERITY_COLORS: Record<Squawk["severity"], string> = {
  Low:      "bg-slate-100 text-slate-600",
  Medium:   "bg-amber-100 text-amber-700",
  High:     "bg-orange-100 text-orange-700",
  Critical: "bg-red-100 text-red-700",
};
