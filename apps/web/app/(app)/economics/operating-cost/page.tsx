// OWNER: AI-generated operating cost per aircraft.
// Fields: fuel burn, oil, insurance, engine reserve, lease amount, selling rate.
// AI pre-fills suggested values on aircraft registration. Owner can edit.
// Note: check codebase for existing operating-cost component from Core Spine build.
//
// Existing code to wire in a follow-up: API at
// app/api/aircraft/[id]/operating-cost/route.ts, calculator in
// lib/costs/calculator.ts + reserves in lib/costs/reserves.ts.

export default function PlaceholderPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-2">
      <p className="text-slate-400 text-sm">Coming soon</p>
      <p className="text-slate-500 text-xs">Owner read-only view</p>
    </div>
  )
}
