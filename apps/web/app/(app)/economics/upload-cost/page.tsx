// OWNER: Upload/photograph any bill (fuel, maintenance, hangar, insurance).
// AI reads and categorizes the cost. Graphs accumulated spend by category.
// Note: check codebase for existing cost-upload component from prior build.
//
// Existing code to wire in a follow-up: app/(app)/costs/intake/intake-view.tsx
// + app/(app)/costs/cost-entry-form.tsx, API at app/api/costs/upload + the
// AI categorizer in lib/costs/categorizer.ts.

export default function PlaceholderPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-2">
      <p className="text-slate-400 text-sm">Coming soon</p>
      <p className="text-slate-500 text-xs">Owner read-only view</p>
    </div>
  )
}
