"use client";

import { useState, useEffect } from "react";
import { X, Navigation2, Radio, ExternalLink, RefreshCw, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

/* ─── Simulated flight state per tail ────────────────────────── */
interface FlightState {
  inFlight: boolean;
  alt: number;
  gs: number;
  hdg: number;
  squawk: string;
  dep: string;
  dest: string;
  // 0-1 normalised position within the mini SVG viewport
  px: number;
  py: number;
  // trail points [x,y]
  trail: [number, number][];
}

const FLIGHT_DB: Record<string, FlightState> = {
  N12345: {
    inFlight: true,
    alt: 4500, gs: 112, hdg: 228, squawk: "1200",
    dep: "KAUS", dest: "KSAT",
    px: 0.52, py: 0.44,
    trail: [[0.25, 0.68], [0.34, 0.60], [0.42, 0.53], [0.52, 0.44]],
  },
  N67890: {
    inFlight: false,
    alt: 0, gs: 0, hdg: 90, squawk: "7000",
    dep: "KHYI", dest: "—",
    px: 0.55, py: 0.58,
    trail: [],
  },
  N24680: {
    inFlight: true,
    alt: 6500, gs: 143, hdg: 48, squawk: "1200",
    dep: "KEDC", dest: "KDFW",
    px: 0.54, py: 0.42,
    trail: [[0.68, 0.64], [0.63, 0.56], [0.58, 0.49], [0.54, 0.42]],
  },
};

/* ─── Mini avionics-style map ──────────────────────────────────  */
function AviMap({ state, tail }: { state: FlightState; tail: string }) {
  const W = 280, H = 148;
  const px = state.px * W;
  const py = state.py * H;

  // heading arrow transform
  const rad = (state.hdg - 90) * (Math.PI / 180);
  const arrowTip = [px + Math.cos(rad) * 12, py + Math.sin(rad) * 12];
  const arrowL   = [px + Math.cos(rad + 2.4) * 7, py + Math.sin(rad + 2.4) * 7];
  const arrowR   = [px + Math.cos(rad - 2.4) * 7, py + Math.sin(rad - 2.4) * 7];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {/* Background */}
      <defs>
        <linearGradient id="mapBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0A1628" />
          <stop offset="100%" stopColor="#0D1F3C" />
        </linearGradient>
        <radialGradient id="pulse" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2563EB" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#mapBg)" />

      {/* Subtle grid */}
      {Array.from({ length: 8 }, (_, i) => (
        <line key={`v${i}`} x1={i * 40} y1={0} x2={i * 40} y2={H}
          stroke="#1E3A5F" strokeWidth="0.5" />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i * 37} x2={W} y2={i * 37}
          stroke="#1E3A5F" strokeWidth="0.5" />
      ))}

      {/* Implied terrain patches */}
      <ellipse cx={80} cy={90} rx={55} ry={30} fill="#112236" opacity="0.6" />
      <ellipse cx={200} cy={60} rx={60} ry={28} fill="#112236" opacity="0.5" />
      <ellipse cx={160} cy={120} rx={45} ry={18} fill="#0F1E31" opacity="0.7" />

      {state.inFlight ? (
        <>
          {/* Route line (dashed, future) */}
          {state.dest !== "—" && (
            <line
              x1={px} y1={py}
              x2={px + Math.cos(rad) * 90}
              y2={py + Math.sin(rad) * 90}
              stroke="#3B82F6" strokeWidth="1" strokeDasharray="4 4" opacity="0.4"
            />
          )}

          {/* Trail */}
          {state.trail.length > 1 && (
            <polyline
              points={[...state.trail, [px, py]].map(([x, y]) => `${x * W},${y * H}`).join(" ")}
              fill="none"
              stroke="#2563EB"
              strokeWidth="1.5"
              opacity="0.7"
            />
          )}

          {/* Pulse rings */}
          <circle cx={px} cy={py} r="18" fill="url(#pulse)" opacity="0.3">
            <animate attributeName="r" values="10;22;10" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="2.5s" repeatCount="indefinite" />
          </circle>
          <circle cx={px} cy={py} r="10" fill="#1E40AF" opacity="0.25">
            <animate attributeName="r" values="6;14;6" dur="2.5s" begin="0.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.3;0;0.3" dur="2.5s" begin="0.6s" repeatCount="indefinite" />
          </circle>

          {/* Aircraft arrow */}
          <polygon
            points={`${arrowTip[0]},${arrowTip[1]} ${arrowL[0]},${arrowL[1]} ${px},${py + 3} ${arrowR[0]},${arrowR[1]}`}
            fill="white"
            stroke="#2563EB"
            strokeWidth="0.5"
          />

          {/* Dep / Dest labels */}
          {state.trail.length > 0 && (
            <>
              <circle cx={state.trail[0][0] * W} cy={state.trail[0][1] * H} r="3" fill="#64748B" />
              <text x={state.trail[0][0] * W} y={state.trail[0][1] * H + 14} textAnchor="middle"
                fill="#94A3B8" fontSize="8" fontWeight="600">{state.dep}</text>
            </>
          )}
          {state.dest !== "—" && (
            <>
              <circle
                cx={px + Math.cos(rad) * 90}
                cy={py + Math.sin(rad) * 90}
                r="3" fill="#3B82F6" opacity="0.6"
              />
              <text
                x={px + Math.cos(rad) * 90}
                y={py + Math.sin(rad) * 90 - 8}
                textAnchor="middle" fill="#93C5FD" fontSize="8" fontWeight="600"
              >{state.dest}</text>
            </>
          )}

          {/* Tail label */}
          <text x={px + 10} y={py - 10} fill="#93C5FD" fontSize="9" fontWeight="700">{tail}</text>
        </>
      ) : (
        /* On-ground state */
        <>
          <circle cx={px} cy={py} r="6" fill="#334155" stroke="#475569" strokeWidth="1" />
          <text x={px} y={py + 20} textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600">
            On Ground
          </text>
          <text x={px} y={py + 32} textAnchor="middle" fill="#475569" fontSize="8">
            {tail}
          </text>
        </>
      )}

      {/* LIVE badge */}
      {state.inFlight && (
        <>
          <rect x="8" y="8" width="36" height="14" rx="4" fill="#EF4444" opacity="0.9" />
          <text x="26" y="19" textAnchor="middle" fill="white" fontSize="8" fontWeight="800">LIVE</text>
        </>
      )}

      {/* Source watermark */}
      <text x={W - 6} y={H - 5} textAnchor="end" fill="#1E3A5F" fontSize="7">FlightAware ADS-B</text>
    </svg>
  );
}

/* ─── Full-screen expanded track panel ──────────────────────── */
function ExpandedTrackPanel({
  state,
  tail,
  onClose,
}: {
  state: FlightState;
  tail: string;
  onClose: () => void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Slightly jitter alt/gs each tick for "live" feel
  const alt = state.alt + (state.inFlight ? Math.round(Math.sin(tick * 0.4) * 50) : 0);
  const gs  = state.gs + (state.inFlight ? Math.round(Math.sin(tick * 0.7) * 3) : 0);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
        initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {state.inFlight && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
              <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                {state.inFlight ? "Live Track" : "Ground Position"} — {tail}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">FlightAware AeroAPI · ADS-B</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Large map */}
        <div className="bg-[#0A1628] overflow-hidden" style={{ height: 300 }}>
          <svg width="100%" height="300" viewBox="0 0 600 300">
            <defs>
              <linearGradient id="lgBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0A1628" />
                <stop offset="100%" stopColor="#0D2040" />
              </linearGradient>
            </defs>
            <rect width="600" height="300" fill="url(#lgBg)" />
            {/* Grid */}
            {Array.from({ length: 16 }, (_, i) => (
              <line key={`v${i}`} x1={i * 40} y1={0} x2={i * 40} y2={300} stroke="#1E3A5F" strokeWidth="0.5" />
            ))}
            {Array.from({ length: 8 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 40} x2={600} y2={i * 40} stroke="#1E3A5F" strokeWidth="0.5" />
            ))}

            {/* Terrain */}
            <ellipse cx={180} cy={200} rx={130} ry={70} fill="#112236" opacity="0.7" />
            <ellipse cx={420} cy={130} rx={150} ry={65} fill="#0F1E31" opacity="0.6" />
            <ellipse cx={320} cy={240} rx={100} ry={40} fill="#112236" opacity="0.5" />

            {state.inFlight ? (() => {
              const px = state.px * 600;
              const py = state.py * 300;
              const rad = (state.hdg - 90) * (Math.PI / 180);
              const trail = state.trail.map(([x, y]) => [x * 600, y * 300] as [number, number]);

              const arrowTip = [px + Math.cos(rad) * 22, py + Math.sin(rad) * 22];
              const arrowL   = [px + Math.cos(rad + 2.4) * 13, py + Math.sin(rad + 2.4) * 13];
              const arrowR   = [px + Math.cos(rad - 2.4) * 13, py + Math.sin(rad - 2.4) * 13];

              return (
                <>
                  {/* Future route */}
                  <line
                    x1={px} y1={py}
                    x2={px + Math.cos(rad) * 200}
                    y2={py + Math.sin(rad) * 200}
                    stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.5"
                  />
                  {/* Trail */}
                  {trail.length > 1 && (
                    <polyline
                      points={[...trail, [px, py]].map(([x, y]) => `${x},${y}`).join(" ")}
                      fill="none" stroke="#2563EB" strokeWidth="2" opacity="0.8"
                    />
                  )}
                  {/* Pulse */}
                  <circle cx={px} cy={py} r="30" fill="#2563EB" opacity="0.06">
                    <animate attributeName="r" values="18;38;18" dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.12;0;0.12" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                  {/* Aircraft */}
                  <polygon
                    points={`${arrowTip[0]},${arrowTip[1]} ${arrowL[0]},${arrowL[1]} ${px},${py + 5} ${arrowR[0]},${arrowR[1]}`}
                    fill="white" stroke="#2563EB" strokeWidth="1"
                  />
                  {/* Labels */}
                  {trail.length > 0 && (
                    <>
                      <circle cx={trail[0][0]} cy={trail[0][1]} r="5" fill="#475569" />
                      <text x={trail[0][0]} y={trail[0][1] + 18} textAnchor="middle" fill="#94A3B8" fontSize="12" fontWeight="600">{state.dep}</text>
                    </>
                  )}
                  <text x={px + 16} y={py - 16} fill="#93C5FD" fontSize="13" fontWeight="700">{tail}</text>
                  <text x={px + Math.cos(rad) * 200} y={py + Math.sin(rad) * 200 - 14} textAnchor="middle" fill="#3B82F6" fontSize="12" fontWeight="600" opacity="0.7">{state.dest}</text>
                </>
              );
            })() : (
              /* On ground */
              <>
                <circle cx={state.px * 600} cy={state.py * 300} r="10" fill="#334155" stroke="#94A3B8" strokeWidth="1.5" />
                <text x={state.px * 600} y={state.py * 300 + 28} textAnchor="middle" fill="#94A3B8" fontSize="13" fontWeight="600">On Ground · {tail}</text>
              </>
            )}

            {/* LIVE badge */}
            {state.inFlight && (
              <>
                <rect x="12" y="12" width="50" height="20" rx="6" fill="#EF4444" opacity="0.9" />
                <text x="37" y="25" textAnchor="middle" fill="white" fontSize="11" fontWeight="800">LIVE</text>
              </>
            )}
            <text x={594} y={294} textAnchor="end" fill="#1E3A5F" fontSize="9">FlightAware AeroAPI · ADS-B</text>
          </svg>
        </div>

        {/* Telemetry grid */}
        <div className="grid grid-cols-3 gap-0 border-t border-border">
          {[
            { label: "Altitude",    value: state.inFlight ? `${alt.toLocaleString()} ft` : "On Ground" },
            { label: "Groundspeed", value: state.inFlight ? `${gs} kts` : "0 kts" },
            { label: "Heading",     value: `${state.hdg}°` },
            { label: "Squawk",      value: state.squawk },
            { label: "Departure",   value: state.dep },
            { label: "Destination", value: state.dest },
          ].map(({ label, value }, i) => (
            <div
              key={label}
              className={`px-5 py-3.5 ${i % 3 !== 2 ? "border-r border-border" : ""} ${i < 3 ? "border-b border-border" : ""}`}
            >
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>{label}</div>
              <div className="text-[16px] text-foreground mt-0.5 tracking-tight" style={{ fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-muted/20 border-t border-border flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Updating every 10 seconds via ADS-B
          </div>
          <button className="text-[11px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
            Open in FlightAware <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SIDEBAR WIDGET (compact)                                        */
/* ═══════════════════════════════════════════════════════════════ */
export function LiveTrackWidget({ tail }: { tail: string }) {
  const state = FLIGHT_DB[tail] ?? FLIGHT_DB["N12345"];
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!state.inFlight) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state.inFlight]);

  const alt = state.alt + (state.inFlight ? Math.round(Math.sin(tick * 0.4) * 50) : 0);
  const gs  = state.gs  + (state.inFlight ? Math.round(Math.sin(tick * 0.7) * 3) : 0);
  const secAgo = tick % 10 === 0 ? 0 : tick % 10;

  return (
    <>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Live Track</span>
            {state.inFlight && (
              <span className="flex items-center gap-1 text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title="Expand"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Map */}
        <div className="bg-[#0A1628]">
          <AviMap state={state} tail={tail} />
        </div>

        {/* Telemetry */}
        <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
          <div className="px-4 py-2.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>Altitude</div>
            <div className="text-[14px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>
              {state.inFlight ? `${alt.toLocaleString()} ft` : "On Ground"}
            </div>
          </div>
          <div className="px-4 py-2.5">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>G / S</div>
            <div className="text-[14px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>
              {state.inFlight ? `${gs} kts` : "0 kts"}
            </div>
          </div>
          <div className="px-4 py-2.5 border-t border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>Heading</div>
            <div className="flex items-center gap-1.5">
              <Navigation2
                className="w-3.5 h-3.5 text-primary shrink-0"
                style={{ transform: `rotate(${state.hdg}deg)` }}
              />
              <span className="text-[14px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{state.hdg}°</span>
            </div>
          </div>
          <div className="px-4 py-2.5 border-t border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>Squawk</div>
            <div className="text-[14px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{state.squawk}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground">
            {state.inFlight ? `Updated ${secAgo}s ago · FlightAware ADS-B` : `Position: ${state.dep} · Ground`}
          </div>
          <button onClick={() => setExpanded(true)} className="text-[11px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}>
            Expand <Maximize2 className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* Expanded modal */}
      <AnimatePresence>
        {expanded && (
          <ExpandedTrackPanel state={state} tail={tail} onClose={() => setExpanded(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
