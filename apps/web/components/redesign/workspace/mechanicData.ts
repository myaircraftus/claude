/* ═══════════════════════════════════════════════════════════
   mechanicData.ts — Shared mock data, types, and helpers
   for the Mechanic Portal and its sub-components.
════════════════════════════════════════════════════════════ */

export const ASSIGNED_AIRCRAFT = [
  { tail: "N12345", model: "Cessna 172S Skyhawk SP", year: 1998, customer: "John Mitchell", company: "Mitchell Aviation LLC", hobbs: 4012.3, tach: 3847.1, status: "Airworthy", openSquawks: 3, activeWOs: 1, lastService: "Feb 8, 2026" },
  { tail: "N67890", model: "Piper PA-28-181 Archer III", year: 2005, customer: "Horizon Flights Inc.", company: "Horizon Flights Inc.", hobbs: 2103.7, tach: 2089.4, status: "Attention", openSquawks: 2, activeWOs: 1, lastService: "Jan 15, 2026" },
  { tail: "N24680", model: "Beechcraft A36 Bonanza", year: 2001, customer: "Steve Williams", company: "", hobbs: 1590.2, tach: 1574.8, status: "Airworthy", openSquawks: 1, activeWOs: 0, lastService: "Dec 5, 2025" },
];

export const SQUAWK_QUEUE = [
  { id: "sq-1", tail: "N12345", model: "Cessna 172S", customer: "John Mitchell", title: "Nav lights flickering intermittently", desc: "Both nav lights briefly flicker during engine run-up at ~1,800 RPM. Suspect loose connection at wing root.", category: "Avionics / Electrical", severity: "Medium" as const, date: "Apr 6", status: "Open" },
  { id: "sq-2", tail: "N12345", model: "Cessna 172S", customer: "John Mitchell", title: "Left door seal showing wear", desc: "Wind noise audible at cruise. Left door weather seal degraded at forward hinge area.", category: "Cabin / Interior", severity: "Low" as const, date: "Apr 2", status: "Open" },
  { id: "sq-3", tail: "N67890", model: "Piper PA-28-181", customer: "Horizon Flights", title: "Alternator output fluctuating — bus voltage drop at idle", desc: "Bus voltage dropping to 12.8V at idle. ALT light illuminated briefly on 2 consecutive flights.", category: "Avionics / Electrical", severity: "High" as const, date: "Apr 4", status: "Open" },
  { id: "sq-4", tail: "N24680", model: "Beechcraft A36", customer: "Steve Williams", title: "Fuel cap O-ring cracking — left tank", desc: "Slight fuel smell after fueling. O-ring shows heat cracking. No in-flight leakage confirmed.", category: "Fuel System", severity: "Medium" as const, date: "Apr 3", status: "Open" },
];

export const MECHANIC_INVOICES = [
  { id: "inv-1", number: "INV-2026-0031", aircraft: "N12345", customer: "John Mitchell", company: "Mitchell Aviation LLC", amount: 460.00, tax: 34.50, total: 494.50, status: "Sent", paymentStatus: "Unpaid", issuedDate: "Apr 1, 2026", dueDate: "Apr 15, 2026", daysOut: 8, linkedWO: "WO-2026-0042", email: "john@mitchellaviation.com", phone: "(512) 555-0147", address: "4200 Airport Blvd, Austin TX 78722", laborLines: [{ desc: "Inspection and troubleshooting — nav light circuit", hours: 1.0, rate: 125, total: 125 }, { desc: "Wire repair and connector replacement", hours: 2.5, rate: 125, total: 312.5 }], partsLines: [{ pn: "CON-MS-2712", desc: "MS Connector 3-pin weatherproof", qty: 1, price: 22.5, total: 22.5 }] },
  { id: "inv-2", number: "INV-2026-0028", aircraft: "N67890", customer: "Horizon Flights Inc.", company: "Horizon Flights Inc.", amount: 2840.00, tax: 213.00, total: 3053.00, status: "Paid", paymentStatus: "Paid", issuedDate: "Mar 20, 2026", dueDate: "Apr 3, 2026", daysOut: 0, linkedWO: "WO-2026-0040", email: "ops@horizonflights.com", phone: "(512) 555-0289", address: "KHYI — San Marcos Regional", laborLines: [{ desc: "100-Hour Inspection — full", hours: 12.0, rate: 125, total: 1500 }, { desc: "Engine borescope inspection", hours: 2.0, rate: 125, total: 250 }], partsLines: [{ pn: "CH48110-1", desc: "Oil filter — Champion", qty: 1, price: 42.5, total: 42.5 }, { pn: "REM38E", desc: "Spark plugs — Champion (x12)", qty: 12, price: 28.5, total: 342 }] },
  { id: "inv-3", number: "INV-2026-0025", aircraft: "N24680", customer: "Steve Williams", company: "", amount: 1634.50, tax: 122.59, total: 1757.09, status: "Draft", paymentStatus: "Unpaid", issuedDate: "Apr 5, 2026", dueDate: "Apr 19, 2026", daysOut: 0, linkedWO: "", email: "steve.williams@email.com", phone: "(512) 555-0312", address: "KEDC — Austin Executive", laborLines: [{ desc: "Annual inspection — airframe", hours: 6.0, rate: 125, total: 750 }, { desc: "Annual inspection — engine/propeller", hours: 4.0, rate: 125, total: 500 }], partsLines: [{ pn: "CH48110-1", desc: "Oil filter — Champion", qty: 1, price: 42.5, total: 42.5 }, { pn: "REM38E", desc: "Spark plugs — Champion (x12)", qty: 12, price: 28.5, total: 342 }] },
];

export const LOGBOOK_ENTRIES = [
  { id: "lb-1", number: "LBE-2026-014", aircraft: "N12345", model: "Cessna 172S", type: "Oil Change & Filter Inspection", date: "Feb 8, 2026", hobbs: 3847.2, tach: 3821.0, mechanic: "Mike Torres", cert: "A&P/IA #3847512", status: "signed" as const, body: "Engine oil and filter changed at Hobbs 3847.2. Aeroshell W100 oil, 6 qts. Filter cut and inspected — clean, no metal found. Oil pressure and temperature normal after engine run. Returned to service per FAR 43.9 and 43.11. Aircraft airworthy.", linkedWO: "WO-2026-0038" },
  { id: "lb-2", number: "LBE-2026-013", aircraft: "N67890", model: "Piper PA-28-181", type: "100-Hour Inspection", date: "Jan 15, 2026", hobbs: 2050.0, tach: 2037.4, mechanic: "Mike Torres", cert: "A&P/IA #3847512", status: "signed" as const, body: "100-hour inspection completed in accordance with Piper PA-28-181 Service Manual. All inspection items checked satisfactory. Engine oil changed, filter cut — clean. Spark plugs inspected, gap-checked, reinstalled. Magneto timing checked and within limits. Compression check: all cylinders within limits. Aircraft airworthy — returned to service.", linkedWO: "WO-2026-0040" },
  { id: "lb-3", number: "LBE-2026-015", aircraft: "N67890", model: "Piper PA-28-181", type: "Left Main Brake Assembly R&R (Draft)", date: "Draft", hobbs: 2103.7, tach: 2089.4, mechanic: "Mike Torres", cert: "A&P #3847512", status: "draft" as const, body: "Left main brake assembly removed and inspected. Caliper piston found partially seized due to corrosion. Piston bore cleaned, lubed with approved brake fluid. New brake disc P/N BRK-30026-5 and pad set P/N BRK-PAD-L5 installed per Cleveland Service Instructions. Brake bled per manual procedure. Verified proper pedal travel and brake hold. Ground test performed — normal operation confirmed.", linkedWO: "WO-2026-0047" },
];

export const EST_THREADS: Record<string, any[]> = {
  "est-seed-1": [
    { id: "et1", type: "system", actor: "System", content: "Estimate EST-2026-0018 created by Mike Torres", time: "Apr 4, 2026" },
    { id: "et2", type: "email", actor: "System", content: "Estimate emailed to steve.williams@email.com", time: "Apr 4, 2026 · 2:14 PM" },
    { id: "et3", type: "tracking", actor: "System", content: "Estimate opened and viewed by Steve Williams", time: "Apr 5, 2026 · 10:23 AM" },
    { id: "et4", type: "internal", actor: "Mike Torres", content: "Steve's annual is coming up in June. We need this scheduled ASAP to keep the airworthiness window open.", time: "Apr 6, 2026" },
    { id: "et5", type: "reminder", actor: "System", content: "Follow-up reminder email sent to steve.williams@email.com", time: "Apr 7, 2026" },
  ],
  "est-seed-2": [
    { id: "et6", type: "system", actor: "System", content: "Estimate EST-2026-0017 created by Dana Lee", time: "Mar 30, 2026" },
    { id: "et7", type: "email", actor: "System", content: "Estimate emailed to john@mitchellaviation.com", time: "Mar 30, 2026 · 3:45 PM" },
    { id: "et8", type: "tracking", actor: "System", content: "Estimate opened and viewed by John Mitchell", time: "Mar 31, 2026 · 8:12 AM" },
    { id: "et9", type: "customer", actor: "John Mitchell", content: "This looks good, Dana. Does this include the logbook entry? I want everything properly documented.", time: "Mar 31, 2026" },
    { id: "et10", type: "reply", actor: "Dana Lee", content: "Yes — logbook entry is included in our scope. We'll have it ready for your signature when the work is complete.", time: "Apr 1, 2026" },
    { id: "et11", type: "approval", actor: "John Mitchell", content: "Approved. Go ahead and schedule when you have a slot open.", time: "Apr 2, 2026" },
    { id: "et12", type: "system", actor: "System", content: "Estimate manually approved by John Mitchell. Work order WO-2026-0042 created automatically.", time: "Apr 2, 2026" },
  ],
};

export const CUSTOMERS_DATA = [
  { id: "c1", name: "John Mitchell", company: "Mitchell Aviation LLC", email: "john@mitchellaviation.com", phone: "(512) 555-0147", aircraft: ["N12345"], wos: 12, billed: 14827.50, outstanding: 494.50, lastService: "Feb 8, 2026", tags: ["Regular", "Part 91"] },
  { id: "c2", name: "Horizon Flights Inc.", company: "Horizon Flights Inc.", email: "ops@horizonflights.com", phone: "(512) 555-0289", aircraft: ["N67890"], wos: 8, billed: 9450.00, outstanding: 0, lastService: "Jan 15, 2026", tags: ["Charter", "Part 135"] },
  { id: "c3", name: "Steve Williams", company: "", email: "steve.williams@email.com", phone: "(512) 555-0312", aircraft: ["N24680"], wos: 5, billed: 6200.00, outstanding: 1757.09, lastService: "Dec 5, 2025", tags: ["Part 91"] },
];

export const TAIL_TO_CUSTOMER_ID: Record<string, string> = {
  "N45678": "c1",
};

export const AIRCRAFT_TO_CUSTOMER_ID: Record<string, string> = {
  "N12345": "c1",
  "N67890": "c2",
  "N24680": "c3",
};

export const TEAM_DATA = [
  { id: "t1", name: "Mike Torres", role: "Lead Mechanic / IA", cert: "A&P/IA #3847512", specialty: "Powerplant, Avionics", status: "Active", wos: 2, color: "bg-blue-100 text-blue-700" },
  { id: "t2", name: "Dana Lee", role: "Mechanic", cert: "A&P #6129034", specialty: "Airframe, Electrical", status: "Active", wos: 1, color: "bg-violet-100 text-violet-700" },
  { id: "t3", name: "Chris Park", role: "Apprentice Mechanic", cert: "Student A&P", specialty: "General Airframe", status: "Active", wos: 0, color: "bg-slate-100 text-slate-600" },
];

/* ─── Helpers ────────────────────────────────────────────── */
export const sevColor = (s: "Low" | "Medium" | "High" | "Critical") =>
  ({ Low: "bg-slate-100 text-slate-500", Medium: "bg-slate-100 text-slate-600", High: "bg-slate-800 text-white", Critical: "bg-slate-900 text-white" }[s]);

export const invoiceStatusColor = (s: string) =>
  ({ Draft: "bg-slate-100 text-slate-600", Sent: "bg-slate-100 text-slate-700", Paid: "bg-slate-800 text-white", Overdue: "bg-slate-200 text-slate-700" }[s] || "bg-slate-100 text-slate-600");

/* ─── Types ──────────────────────────────────────────────── */
export type MechanicSection = "dashboard" | "aircraft" | "squawks" | "estimates" | "workorders" | "invoices" | "logbook" | "customers" | "team" | "parts";

export interface GeneratedEstimate {
  laborLines: { id: string; desc: string; hours: number; rate: number; total: number }[];
  partsLines: { id: string; pn: string; desc: string; qty: number; price: number; total: number }[];
  assumptions: string;
  total: number;
}

/* ─── AI Estimate generator ──────────────────────────────── */
export function generateEstimateFromSquawks(squawkIds: string[]): GeneratedEstimate {
  const squawks = SQUAWK_QUEUE.filter((s) => squawkIds.includes(s.id));
  const laborLines: GeneratedEstimate["laborLines"] = [];
  const partsLines: GeneratedEstimate["partsLines"] = [];
  let laborTotal = 0;
  let partsTotal = 0;

  squawks.forEach((sq, i) => {
    if (sq.category === "Avionics / Electrical") {
      laborLines.push({ id: `l${i}a`, desc: "Inspect and troubleshoot electrical system — " + sq.title.split(" ")[0] + " circuit", hours: 1.5, rate: 125, total: 187.5 });
      laborLines.push({ id: `l${i}b`, desc: "Wire repair and connector replacement", hours: 2.0, rate: 125, total: 250 });
      partsLines.push({ id: `p${i}a`, pn: "CON-MS-2712", desc: "Weatherproof connector — 3 pin", qty: 1, price: 22.5, total: 22.5 });
      laborTotal += 437.5; partsTotal += 22.5;
    } else if (sq.category === "Landing Gear / Brakes") {
      laborLines.push({ id: `l${i}a`, desc: "Brake assembly inspection and troubleshoot", hours: 1.5, rate: 125, total: 187.5 });
      laborLines.push({ id: `l${i}b`, desc: "Brake caliper R&R — " + (sq.title.toLowerCase().includes("left") ? "left" : "right") + " main", hours: 2.5, rate: 125, total: 312.5 });
      partsLines.push({ id: `p${i}a`, pn: "BRK-30026-5", desc: "Brake disc — Cleveland", qty: 1, price: 285, total: 285 });
      partsLines.push({ id: `p${i}b`, pn: "BRK-PAD-L5", desc: "Brake pad set — Cleveland", qty: 1, price: 68, total: 68 });
      laborTotal += 500; partsTotal += 353;
    } else if (sq.category === "Fuel System") {
      laborLines.push({ id: `l${i}a`, desc: "Fuel system inspection — cap and seal assembly", hours: 1.0, rate: 125, total: 125 });
      partsLines.push({ id: `p${i}a`, pn: "FUELCAP-OR-6", desc: "Fuel cap O-ring seal kit", qty: 1, price: 18.50, total: 18.50 });
      laborTotal += 125; partsTotal += 18.50;
    } else {
      laborLines.push({ id: `l${i}a`, desc: `Inspect and address — ${sq.title}`, hours: 1.0, rate: 125, total: 125 });
      laborTotal += 125;
    }
  });

  return {
    laborLines,
    partsLines,
    assumptions: "Estimate based on initial inspection. Additional scope billed at T&M with prior customer notification. Does not include logbook entry (billed separately if required).",
    total: laborTotal + partsTotal,
  };
}
