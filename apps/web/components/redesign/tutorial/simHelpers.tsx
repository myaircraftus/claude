/**
 * Tutorial Simulation Helpers
 * Shared mini-UI components used to build visual sim frames
 * in the Tutorial Center. Each component is a compact replica
 * of the actual myaircraft.us UI at ~1/4 scale.
 */

import React from "react";

/* ─── Full App Chrome ──────────────────────────────────────── */
export function SimApp({
  sidebar,
  main,
  topLabel,
}: {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  topLabel?: string;
}) {
  return (
    <div className="h-full flex overflow-hidden bg-slate-100">
      {/* Sidebar — wider at w-28 for better readability */}
      <div className="w-28 bg-[#0A1628] flex flex-col shrink-0 overflow-hidden">
        <div className="h-8 flex items-center gap-1.5 px-2.5 border-b border-white/10 shrink-0">
          <div className="w-5 h-5 bg-[#2563EB] rounded-sm flex items-center justify-center text-[7px] text-white shrink-0">✈</div>
          <span className="text-white text-[8px]" style={{ fontWeight: 700 }}>myaircraft</span>
        </div>
        <div className="flex-1 px-2 py-2 space-y-0.5 overflow-hidden">
          {sidebar}
        </div>
      </div>
      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-8 bg-white border-b border-gray-100 flex items-center px-3 gap-2 shrink-0">
          {topLabel
            ? <span className="text-[8px] text-gray-500 flex-1">{topLabel}</span>
            : <div className="flex-1 h-4 bg-gray-100 rounded-full" />}
          <div className="w-5 h-5 rounded-full bg-gray-100 shrink-0" />
          <div className="w-5 h-5 rounded-full bg-gray-100 shrink-0" />
        </div>
        <div className="flex-1 overflow-hidden p-2.5 flex flex-col gap-2">
          {main}
        </div>
      </div>
    </div>
  );
}

/* ─── Sidebar Items ────────────────────────────────────────── */
export function SNav({ label, active = false, badge }: { label: string; active?: boolean; badge?: number }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-[8px] ${active ? "bg-white/15 text-white" : "text-white/40"}`}>
      <div className={`w-3 h-3 rounded-sm shrink-0 ${active ? "bg-white/50" : "bg-white/15"}`} />
      <span className="flex-1 truncate" style={{ fontWeight: active ? 600 : 400 }}>{label}</span>
      {badge !== undefined && (
        <span className={`text-[6px] px-1 py-px rounded-full ${active ? "bg-white/25 text-white" : "bg-white/10 text-white/50"}`} style={{ fontWeight: 700 }}>{badge}</span>
      )}
    </div>
  );
}

export function SNavSub({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div className={`ml-3.5 pl-2 border-l border-white/10 flex items-center gap-1 py-0.5 text-[7px] ${active ? "text-white" : "text-white/30"}`}>
      <span style={{ fontWeight: active ? 600 : 400 }}>{label}</span>
    </div>
  );
}

export function SPersona({ active }: { active: "owner" | "mechanic" }) {
  return (
    <div className="flex items-center gap-0.5 bg-white/8 rounded p-0.5 mb-1">
      <div className={`flex-1 text-center text-[6px] py-0.5 rounded ${active === "owner" ? "bg-white text-gray-800" : "text-white/40"}`} style={{ fontWeight: 700 }}>Owner</div>
      <div className={`flex-1 text-center text-[6px] py-0.5 rounded ${active === "mechanic" ? "bg-white text-gray-800" : "text-white/40"}`} style={{ fontWeight: 700 }}>Mech</div>
    </div>
  );
}

/* ─── Stat Card ─────────────────────────────────────────────── */
export function MStatCard({ label, value, color = "blue" }: { label: string; value: string; color?: string }) {
  const clr: Record<string, string> = {
    blue: "bg-blue-50", green: "bg-emerald-50", amber: "bg-amber-50",
    red: "bg-red-50", violet: "bg-violet-50",
  };
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-2.5 shadow-sm flex flex-col gap-0.5">
      <div className={`w-6 h-6 rounded-md ${clr[color] ?? clr.blue} mb-0.5`} />
      <div className="text-[12px] text-gray-800 leading-none" style={{ fontWeight: 800 }}>{value}</div>
      <div className="text-[7px] text-gray-400">{label}</div>
    </div>
  );
}

/* ─── Content Card ──────────────────────────────────────────── */
export function MCard({
  title, subtitle, badge, badgeColor = "gray",
  children, highlighted = false,
}: {
  title: string; subtitle?: string; badge?: string; badgeColor?: string;
  children?: React.ReactNode; highlighted?: boolean;
}) {
  const bc: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-700", red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700", blue: "bg-blue-100 text-blue-700",
    gray: "bg-gray-100 text-gray-600", dark: "bg-gray-800 text-white",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <div className={`bg-white rounded-lg border p-2.5 shadow-sm ${highlighted ? "border-blue-400 ring-1 ring-blue-200 shadow-blue-100" : "border-gray-100"}`}>
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-[10px] text-gray-800 truncate" style={{ fontWeight: 600 }}>{title}</div>
        {badge && <span className={`text-[7px] px-1.5 py-0.5 rounded-full shrink-0 ${bc[badgeColor] ?? bc.gray}`} style={{ fontWeight: 700 }}>{badge}</span>}
      </div>
      {subtitle && <div className="text-[8px] text-gray-400">{subtitle}</div>}
      {children}
    </div>
  );
}

/* ─── Chat Bubbles ──────────────────────────────────────────── */
export function CBubble({ role, text }: { role: "user" | "ai"; text: string }) {
  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"} mb-1.5`}>
      <div className={`text-[8px] max-w-[80%] px-2.5 py-1.5 rounded-xl leading-relaxed ${
        role === "user" ? "bg-[#2563EB] text-white rounded-br-sm" : "bg-white border border-gray-100 text-gray-700 rounded-bl-sm shadow-sm"
      }`}>{text}</div>
    </div>
  );
}

export function SourceChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[6px] bg-blue-50 border border-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full mr-0.5">📄 {label}</span>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-white border border-gray-100 rounded-xl w-10 shadow-sm">
      {[0, 1, 2].map(i => (
        <div key={i} className="w-1 h-1 bg-gray-400 rounded-full" style={{ opacity: 0.4 + i * 0.2 }} />
      ))}
    </div>
  );
}

/* ─── Form Fields ───────────────────────────────────────────── */
export function FormField({ label, value, focused = false }: { label: string; value: string; focused?: boolean }) {
  return (
    <div>
      <div className="text-[7px] text-gray-500 mb-0.5" style={{ fontWeight: 600 }}>{label.toUpperCase()}</div>
      <div className={`h-6 border rounded text-[8px] px-2 flex items-center text-gray-700 bg-white ${focused ? "border-blue-500 ring-1 ring-blue-200" : "border-gray-200"}`}>{value}</div>
    </div>
  );
}

export function SelectField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[7px] text-gray-500 mb-0.5" style={{ fontWeight: 600 }}>{label.toUpperCase()}</div>
      <div className="h-6 border border-gray-200 rounded text-[8px] px-2 flex items-center justify-between bg-white">
        <span className="text-gray-700">{value}</span>
        <span className="text-gray-400 text-[6px]">▼</span>
      </div>
    </div>
  );
}

/* ─── Toggle Row ────────────────────────────────────────────── */
export function ToggleRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
      <span className="text-[7px] text-gray-700">{label}</span>
      <div className={`w-6 h-3 rounded-full ${on ? "bg-[#2563EB]" : "bg-gray-200"} flex items-center px-0.5 shrink-0`}>
        <div className={`w-2 h-2 rounded-full bg-white shadow-sm ${on ? "translate-x-3" : ""} transition-transform`} />
      </div>
    </div>
  );
}

/* ─── Table ─────────────────────────────────────────────────── */
export function THead({ cells }: { cells: string[] }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 border-b border-gray-100">
      {cells.map((c, i) => <div key={i} className={`${i === 0 ? "flex-1" : "shrink-0 w-14"} text-[6px] text-gray-400 uppercase tracking-wide`} style={{ fontWeight: 700 }}>{c}</div>)}
    </div>
  );
}

export function TRow({ cells, highlighted = false }: { cells: string[]; highlighted?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 border-b border-gray-50 last:border-0 ${highlighted ? "bg-blue-50" : "bg-white"}`}>
      {cells.map((c, i) => (
        <div key={i} className={`${i === 0 ? "flex-1 text-gray-800" : "shrink-0 w-14 text-gray-500 text-right"} text-[7px]`} style={{ fontWeight: i === 0 ? 600 : 400 }}>{c}</div>
      ))}
    </div>
  );
}

/* ─── Badges & Buttons ──────────────────────────────────────── */
export function MBadge({ label, color = "gray" }: { label: string; color?: string }) {
  const bc: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-700", red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700", blue: "bg-blue-100 text-blue-700",
    gray: "bg-gray-100 text-gray-600", dark: "bg-gray-800 text-white",
    violet: "bg-violet-100 text-violet-700", teal: "bg-teal-100 text-teal-700",
  };
  return <span className={`text-[7px] px-2 py-0.5 rounded-full ${bc[color] ?? bc.gray}`} style={{ fontWeight: 700 }}>{label}</span>;
}

export function PBtn({ label, className = "" }: { label: string; className?: string }) {
  return <div className={`inline-flex items-center justify-center bg-[#2563EB] text-white text-[8px] px-3 py-1 rounded-md ${className}`} style={{ fontWeight: 700 }}>{label}</div>;
}

export function GBtn({ label, className = "" }: { label: string; className?: string }) {
  return <div className={`inline-flex items-center justify-center border border-gray-200 bg-white text-gray-600 text-[8px] px-3 py-1 rounded-md ${className}`} style={{ fontWeight: 500 }}>{label}</div>;
}

/* ─── Highlight Ring ────────────────────────────────────────── */
export function HL({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 ring-2 ring-[#2563EB] rounded-lg z-10 pointer-events-none" style={{ boxShadow: "0 0 0 4px rgba(37,99,235,0.2)" }} />
      {children}
    </div>
  );
}

/* ─── Workflow Bar ──────────────────────────────────────────── */
export function WFBar({ steps, activeIdx }: { steps: string[]; activeIdx: number }) {
  return (
    <div className="flex items-start gap-1 px-1 py-2 w-full">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center gap-0.5" style={{ minWidth: 0, flex: 1 }}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[7px] shrink-0 ${
              i < activeIdx ? "bg-emerald-500 text-white" : i === activeIdx ? "bg-[#2563EB] text-white ring-2 ring-blue-200" : "bg-gray-200 text-gray-400"
            }`} style={{ fontWeight: 700 }}>
              {i < activeIdx ? "✓" : i === activeIdx ? "●" : String(i + 1)}
            </div>
            <span className={`text-[5.5px] text-center leading-tight ${i === activeIdx ? "text-[#2563EB]" : i < activeIdx ? "text-gray-500" : "text-gray-300"}`} style={{ fontWeight: i === activeIdx ? 700 : 400 }}>{s}</span>
          </div>
          {i < steps.length - 1 && <div className="h-px bg-gray-200 mt-2.5" style={{ flex: "0 0 8px" }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ─── Mini Modal Overlay ────────────────────────────────────── */
export function MiniModal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center bg-black/15 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[260px] overflow-hidden">
        <div className="bg-[#0A1628] px-3 py-2 flex items-center justify-between">
          <div className="text-white text-[8px]" style={{ fontWeight: 700 }}>{title}</div>
          <div className="w-3 h-3 rounded-full bg-white/10 text-white/40 flex items-center justify-center text-[5px]">✕</div>
        </div>
        <div className="p-3 space-y-2">{children}</div>
      </div>
    </div>
  );
}

/* ─── Upload Drop Zone ──────────────────────────────────────── */
export function UploadZone({ active = false }: { active?: boolean }) {
  return (
    <div className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1 ${active ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50"}`}>
      <div className={`text-lg ${active ? "text-blue-400" : "text-gray-300"}`}>📤</div>
      <div className={`text-[7px] ${active ? "text-blue-600" : "text-gray-400"}`} style={{ fontWeight: active ? 600 : 400 }}>
        {active ? "Drop file here…" : "Drag & drop or click to browse"}
      </div>
      <div className="text-[6px] text-gray-300">PDF · JPG · PNG supported</div>
    </div>
  );
}

/* ─── Health Ring ───────────────────────────────────────────── */
export function HealthRingSim({ pct }: { pct: number }) {
  const size = 44;
  const stroke = 5;
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="absolute text-[8px]" style={{ fontWeight: 800, color }}>{pct}%</span>
    </div>
  );
}

/* ─── Activity Timeline Item ────────────────────────────────── */
export function TimelineItem({ text, time, color = "blue" }: { text: string; time: string; color?: string }) {
  const dot: Record<string, string> = { blue: "bg-blue-400", green: "bg-emerald-400", amber: "bg-amber-400", red: "bg-red-400", violet: "bg-violet-400" };
  return (
    <div className="flex items-start gap-2">
      <div className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${dot[color] ?? dot.blue}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[7px] text-gray-700 leading-tight">{text}</div>
        <div className="text-[6px] text-gray-400">{time}</div>
      </div>
    </div>
  );
}

/* ─── Signature Pad ─────────────────────────────────────────── */
export function SignaturePad({ signed = false }: { signed?: boolean }) {
  return (
    <div className={`h-12 border-2 rounded-xl flex items-center justify-center ${signed ? "border-emerald-300 bg-emerald-50" : "border-dashed border-gray-200 bg-gray-50"}`}>
      {signed
        ? <span className="text-emerald-600 text-[8px]" style={{ fontWeight: 700, fontFamily: "cursive" }}>Mike Torres, A&P/IA</span>
        : <span className="text-gray-300 text-[7px]">Sign here…</span>
      }
    </div>
  );
}

/* ─── FAA Registry Card ─────────────────────────────────────── */
export function FAACard({ tail }: { tail: string }) {
  const data: Record<string, { model: string; year: string; engine: string; reg: string }> = {
    "N12345": { model: "Cessna 172S Skyhawk SP", year: "1998", engine: "Lycoming IO-360-L2A", reg: "John Mitchell" },
    "N67890": { model: "Piper PA-28-181 Archer III", year: "2005", engine: "Lycoming O-360-A4M", reg: "Horizon Flights Inc." },
    "N24680": { model: "Beechcraft A36 Bonanza", year: "2001", engine: "Continental IO-550-BB", reg: "Steve Williams" },
  };
  const d = data[tail] ?? data["N12345"];
  return (
    <div className="bg-white rounded-lg border border-emerald-200 p-2 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className="w-3 h-3 bg-emerald-100 rounded-full flex items-center justify-center text-[6px]">✓</div>
        <span className="text-[8px] text-emerald-700" style={{ fontWeight: 700 }}>FAA Registry — Found</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {[
          ["N-Number", tail], ["Model", d.model], ["Year", d.year],
          ["Engine", d.engine], ["Registrant", d.reg],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[5px] text-gray-400 uppercase">{k}</div>
            <div className="text-[6.5px] text-gray-700" style={{ fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Invoice Summary ───────────────────────────────────────── */
export function InvSummary({ subtotal, tax, total }: { subtotal: string; tax: string; total: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 space-y-0.5">
      <div className="flex justify-between text-[7px] text-gray-500"><span>Subtotal</span><span>{subtotal}</span></div>
      <div className="flex justify-between text-[7px] text-gray-500"><span>Tax (7.5%)</span><span>{tax}</span></div>
      <div className="flex justify-between text-[8px] text-gray-800 border-t border-gray-200 pt-0.5 mt-0.5" style={{ fontWeight: 700 }}><span>Total</span><span>{total}</span></div>
    </div>
  );
}