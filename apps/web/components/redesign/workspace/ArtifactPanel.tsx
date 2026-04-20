"use client";

import { useState, useRef, useEffect } from "react";
import {
  X, FileText, Wrench, Receipt, Search, User, Shield, CheckSquare,
  ClipboardList, Download, Share2, Mail, Printer, Copy, Edit3,
  RefreshCw, ChevronDown, Check, AlertTriangle, Clock, Plus,
  Trash2, DollarSign, Hash, Tag, MapPin, Phone, Building2,
  Plane, Lock, Unlock, PenTool, ChevronRight, Info, ExternalLink,
  Star, Save, Package, Loader2, Send,
} from "lucide-react";
import { toast } from "sonner";
import type { ArtifactType, ChatAction } from "./chatEngine";
import { usePartsStore, type OnlinePartResult } from "./PartsStore";

interface ArtifactPanelProps {
  type: ArtifactType;
  data: any;
  onClose: () => void;
  onAction?: (action: string) => void;
}

/* ============================================================= */
/*  LOGBOOK ENTRY ARTIFACT                                        */
/* ============================================================= */
function LogbookEntryPanel({ data, onAction }: { data: any; onAction?: (a: string) => void }) {
  const [body, setBody] = useState(data?.body || "");
  const [signed, setSigned] = useState(false);
  const [showSign, setShowSign] = useState(false);

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2.5 py-1 rounded-full ${
            data?.status === "draft" ? "bg-amber-50 text-amber-700" :
            signed ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
          }`} style={{ fontWeight: 600 }}>
            {signed ? "SIGNED FINAL" : data?.status?.toUpperCase() || "DRAFT"}
          </span>
          <span className="text-[11px] text-muted-foreground">{data?.type}</span>
        </div>
        <div className="flex gap-1">
          <button className="p-1.5 hover:bg-muted rounded text-muted-foreground"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button className="p-1.5 hover:bg-muted rounded text-muted-foreground"><Copy className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Aircraft info header */}
      <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
          <div><span className="text-muted-foreground">Aircraft:</span> <span style={{ fontWeight: 500 }}>{data?.aircraft}</span></div>
          <div><span className="text-muted-foreground">Make/Model:</span> <span style={{ fontWeight: 500 }}>{data?.makeModel}</span></div>
          <div><span className="text-muted-foreground">Serial:</span> <span style={{ fontWeight: 500 }}>{data?.serial}</span></div>
          <div><span className="text-muted-foreground">Engine:</span> <span style={{ fontWeight: 500 }}>{data?.engine?.split(" (")[0]}</span></div>
          <div><span className="text-muted-foreground">Total Time:</span> <span style={{ fontWeight: 500 }}>{data?.totalTime} hrs</span></div>
          <div><span className="text-muted-foreground">Date:</span> <span style={{ fontWeight: 500 }}>{data?.date}</span></div>
        </div>
      </div>

      {/* Missing fields warning */}
      {data?.missingFields?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-[12px] text-amber-800" style={{ fontWeight: 600 }}>Missing required fields</div>
            <div className="text-[11px] text-amber-700 mt-1">
              {data.missingFields.map((f: string) => f.replace(/_/g, " ")).join(", ")}
            </div>
          </div>
        </div>
      )}

      {/* Entry body */}
      <div>
        <label className="text-[12px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>MAINTENANCE RECORD ENTRY</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full min-h-[200px] p-3 text-[13px] bg-white border border-border rounded-lg resize-y focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
          style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", lineHeight: 1.7 }}
          disabled={signed}
        />
      </div>

      {/* Mechanic info */}
      <div className="bg-muted/50 rounded-lg p-3">
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div><span className="text-muted-foreground">Mechanic:</span> <span style={{ fontWeight: 500 }}>{data?.mechanic}</span></div>
          <div><span className="text-muted-foreground">Certificate #:</span> <span style={{ fontWeight: 500 }}>{data?.certificateNumber}</span></div>
        </div>
      </div>

      {/* Signature area */}
      {!signed ? (
        <button
          onClick={() => setShowSign(true)}
          className="w-full py-3 border-2 border-dashed border-primary/30 rounded-lg text-primary text-[13px] hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
          style={{ fontWeight: 500 }}
        >
          <PenTool className="w-4 h-4" /> Sign Entry
        </button>
      ) : (
        <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-emerald-600" />
            <span className="text-[12px] text-emerald-700" style={{ fontWeight: 600 }}>Signed & Sealed</span>
          </div>
          <div className="text-[24px] text-blue-800" style={{ fontFamily: "'Dancing Script', cursive", fontWeight: 400 }}>
            {data?.mechanic}
          </div>
          <div className="text-[11px] text-emerald-600 mt-1">
            {new Date().toLocaleString()} &middot; Certificate #{data?.certificateNumber}
          </div>
        </div>
      )}

      {/* Signature modal */}
      {showSign && (
        <SignatureModal
          mechanicName={data?.mechanic}
          certificateNumber={data?.certificateNumber}
          documentType={data?.type}
          onSign={() => { setSigned(true); setShowSign(false); }}
          onCancel={() => setShowSign(false)}
        />
      )}

      {/* Compliance panel */}
      <ComplianceNextSteps type={data?.type} />

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
        <button className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-[12px] hover:bg-primary/90" style={{ fontWeight: 500 }}>
          <Download className="w-3.5 h-3.5" /> Download PDF
        </button>
        <button className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-foreground text-[12px] hover:bg-muted" style={{ fontWeight: 500 }}>
          <Share2 className="w-3.5 h-3.5" /> Share Link
        </button>
        <button className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-foreground text-[12px] hover:bg-muted" style={{ fontWeight: 500 }}>
          <Mail className="w-3.5 h-3.5" /> Email
        </button>
        <button className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-foreground text-[12px] hover:bg-muted" style={{ fontWeight: 500 }}>
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  SIGNATURE MODAL                                                */
/* ============================================================= */
function SignatureModal({ mechanicName, certificateNumber, documentType, onSign, onCancel }: {
  mechanicName: string;
  certificateNumber: string;
  documentType: string;
  onSign: () => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<"draw" | "type">("draw");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1e40af";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const startDraw = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };
  const draw = (e: React.MouseEvent) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    setHasSignature(true);
  };
  const endDraw = () => setDrawing(false);
  const clearSig = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Sign Document</h3>
          </div>
          <p className="text-[12px] text-muted-foreground">
            You are signing a <span style={{ fontWeight: 600 }}>{documentType}</span> maintenance record entry.
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Signer info */}
          <div className="bg-muted/50 rounded-lg p-3 text-[12px] space-y-1">
            <div><span className="text-muted-foreground">Name:</span> <span style={{ fontWeight: 600 }}>{mechanicName}</span></div>
            <div><span className="text-muted-foreground">Certificate:</span> <span style={{ fontWeight: 600 }}>#{certificateNumber}</span></div>
            <div><span className="text-muted-foreground">Role:</span> <span style={{ fontWeight: 600 }}>A&P Mechanic / IA</span></div>
            <div><span className="text-muted-foreground">Timestamp:</span> <span style={{ fontWeight: 600 }}>{new Date().toLocaleString()}</span></div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setMode("draw")}
              className={`flex-1 py-1.5 rounded-md text-[12px] transition-colors ${mode === "draw" ? "bg-white shadow text-foreground" : "text-muted-foreground"}`}
              style={{ fontWeight: 500 }}
            >Draw Signature</button>
            <button
              onClick={() => setMode("type")}
              className={`flex-1 py-1.5 rounded-md text-[12px] transition-colors ${mode === "type" ? "bg-white shadow text-foreground" : "text-muted-foreground"}`}
              style={{ fontWeight: 500 }}
            >Type Signature</button>
          </div>

          {/* Signature area */}
          {mode === "draw" ? (
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={420}
                height={120}
                className="w-full h-[120px] border-2 border-dashed border-border rounded-lg cursor-crosshair bg-white"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
              />
              {!hasSignature && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[13px] text-muted-foreground/40">
                  Sign here
                </div>
              )}
              <button onClick={clearSig} className="absolute top-2 right-2 text-[11px] text-muted-foreground hover:text-foreground">Clear</button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-border rounded-lg p-4 bg-white text-center">
              <div className="text-[32px] text-blue-800" style={{ fontFamily: "'Dancing Script', cursive" }}>{mechanicName}</div>
            </div>
          )}

          {/* Consent */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-border text-primary" />
            <span className="text-[11px] text-muted-foreground leading-relaxed">
              I, <span style={{ fontWeight: 600 }}>{mechanicName}</span>, certify that the information in this maintenance record entry is true and accurate.
              I understand this signature is legally binding and will be cryptographically sealed with an immutable audit certificate.
            </span>
          </label>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-border text-[13px] hover:bg-muted" style={{ fontWeight: 500 }}>Cancel</button>
          <button
            onClick={onSign}
            disabled={!consent || (mode === "draw" && !hasSignature)}
            className="px-5 py-2 rounded-lg bg-primary text-white text-[13px] hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ fontWeight: 600 }}
          >
            <PenTool className="w-4 h-4" /> Sign & Seal
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  COMPLIANCE NEXT STEPS                                          */
/* ============================================================= */
function ComplianceNextSteps({ type }: { type?: string }) {
  const steps = [
    { text: "Save signed record to digital logbook", mandatory: true, done: false },
    { text: "Send digital copy to aircraft owner", mandatory: false, done: false },
    { text: "File copy in aircraft digital records", mandatory: true, done: false },
    ...(type?.includes("Annual") ? [
      { text: "Update inspection due calendar", mandatory: true, done: false },
      { text: "Verify all AD compliance current", mandatory: true, done: false },
    ] : []),
    ...(type?.includes("AD") ? [
      { text: "FAA Form 337 may be required", mandatory: true, done: false },
      { text: "Attach supporting documents / STC data", mandatory: false, done: false },
    ] : []),
    { text: "Add work performed to invoice", mandatory: false, done: false },
    { text: "Attach supporting documents", mandatory: false, done: false },
  ];

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="bg-muted/50 px-3 py-2 flex items-center gap-2 border-b border-border">
        <CheckSquare className="w-4 h-4 text-primary" />
        <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>Next Required Steps</span>
      </div>
      <div className="divide-y divide-border">
        {steps.map((s, i) => (
          <div key={i} className="px-3 py-2 flex items-center gap-2.5 hover:bg-muted/20 transition-colors">
            <input type="checkbox" className="w-3.5 h-3.5 rounded border-border text-primary" />
            <span className="text-[12px] text-foreground flex-1">{s.text}</span>
            {s.mandatory && (
              <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded" style={{ fontWeight: 600 }}>Required</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================= */
/*  WORK ORDER ARTIFACT                                            */
/* ============================================================= */
function WorkOrderPanel({ data }: { data: any }) {
  const [status, setStatus] = useState(data?.status || "Open");
  const [squawk, setSquawk] = useState(data?.squawk || "");
  const [laborLines, setLaborLines] = useState<{ desc: string; hours: number; rate: number }[]>([
    { desc: "Troubleshooting & inspection", hours: 1.5, rate: 125 },
  ]);
  const [partsLines, setPartsLines] = useState<{ pn: string; desc: string; qty: number; price: number }[]>([]);

  const statusColors: Record<string, string> = {
    Draft: "bg-slate-100 text-slate-600",
    Open: "bg-blue-50 text-blue-700",
    "In Progress": "bg-indigo-50 text-indigo-700",
    "Awaiting Parts": "bg-amber-50 text-amber-700",
    "Ready for Signoff": "bg-emerald-50 text-emerald-700",
    Closed: "bg-slate-100 text-slate-600",
  };

  const totalLabor = laborLines.reduce((s, l) => s + l.hours * l.rate, 0);
  const totalParts = partsLines.reduce((s, p) => s + p.qty * p.price, 0);

  return (
    <div className="space-y-4">
      {/* WO header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>{data?.woNumber}</div>
          <div className="text-[12px] text-muted-foreground">{data?.aircraft} &middot; {data?.makeModel}</div>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`text-[11px] px-3 py-1.5 rounded-full border-0 cursor-pointer ${statusColors[status] || "bg-muted"}`}
          style={{ fontWeight: 600 }}
        >
          {Object.keys(statusColors).map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Info grid */}
      <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-2 gap-2 text-[12px]">
        <div><span className="text-muted-foreground">Customer:</span> <span style={{ fontWeight: 500 }}>{data?.customer}</span></div>
        <div><span className="text-muted-foreground">Mechanic:</span> <span style={{ fontWeight: 500 }}>{data?.mechanic}</span></div>
        <div><span className="text-muted-foreground">Opened:</span> <span style={{ fontWeight: 500 }}>{new Date(data?.openedDate).toLocaleDateString()}</span></div>
        <div><span className="text-muted-foreground">Serial:</span> <span style={{ fontWeight: 500 }}>{data?.serial}</span></div>
      </div>

      {/* Squawk / Complaint */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>SQUAWK / CUSTOMER COMPLAINT</label>
        <textarea
          value={squawk}
          onChange={(e) => setSquawk(e.target.value)}
          placeholder="Enter customer complaint or squawk..."
          className="w-full p-2.5 text-[13px] border border-border rounded-lg resize-none h-[60px] focus:ring-2 focus:ring-primary/20 outline-none"
        />
      </div>

      {/* Labor */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>LABOR</label>
          <button
            onClick={() => setLaborLines([...laborLines, { desc: "", hours: 0, rate: 125 }])}
            className="text-[11px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}
          ><Plus className="w-3 h-3" /> Add</button>
        </div>
        <div className="space-y-1.5">
          {laborLines.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={l.desc} onChange={(e) => { const n = [...laborLines]; n[i].desc = e.target.value; setLaborLines(n); }}
                className="flex-1 text-[12px] px-2 py-1.5 border border-border rounded bg-white" placeholder="Description" />
              <input type="number" value={l.hours} onChange={(e) => { const n = [...laborLines]; n[i].hours = +e.target.value; setLaborLines(n); }}
                className="w-16 text-[12px] px-2 py-1.5 border border-border rounded bg-white text-right" />
              <span className="text-[11px] text-muted-foreground">hrs</span>
              <span className="text-[11px] text-muted-foreground">@${l.rate}</span>
              <button onClick={() => setLaborLines(laborLines.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Parts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>PARTS</label>
          <button
            onClick={() => setPartsLines([...partsLines, { pn: "", desc: "", qty: 1, price: 0 }])}
            className="text-[11px] text-primary flex items-center gap-1" style={{ fontWeight: 500 }}
          ><Plus className="w-3 h-3" /> Add</button>
        </div>
        {partsLines.length === 0 ? (
          <div className="text-[12px] text-muted-foreground italic py-2">No parts added yet. Say "find part..." in chat.</div>
        ) : (
          <div className="space-y-1.5">
            {partsLines.map((p, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={p.pn} onChange={(e) => { const n = [...partsLines]; n[i].pn = e.target.value; setPartsLines(n); }}
                  className="w-24 text-[12px] px-2 py-1.5 border border-border rounded bg-white" placeholder="P/N" />
                <input value={p.desc} onChange={(e) => { const n = [...partsLines]; n[i].desc = e.target.value; setPartsLines(n); }}
                  className="flex-1 text-[12px] px-2 py-1.5 border border-border rounded bg-white" placeholder="Description" />
                <input type="number" value={p.qty} onChange={(e) => { const n = [...partsLines]; n[i].qty = +e.target.value; setPartsLines(n); }}
                  className="w-12 text-[12px] px-2 py-1.5 border border-border rounded bg-white text-right" />
                <span className="text-[12px] text-muted-foreground">${(p.qty * p.price).toFixed(2)}</span>
                <button onClick={() => setPartsLines(partsLines.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-[12px]">
        <div className="flex justify-between"><span className="text-muted-foreground">Labor:</span> <span style={{ fontWeight: 500 }}>${totalLabor.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Parts:</span> <span style={{ fontWeight: 500 }}>${totalParts.toFixed(2)}</span></div>
        <div className="flex justify-between border-t border-border pt-1 mt-1"><span style={{ fontWeight: 600 }}>Total:</span> <span style={{ fontWeight: 700 }}>${(totalLabor + totalParts).toFixed(2)}</span></div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-[12px] hover:bg-primary/90" style={{ fontWeight: 500 }}>
          <FileText className="w-3.5 h-3.5" /> Generate Entry
        </button>
        <button className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-[12px] hover:bg-muted" style={{ fontWeight: 500 }}>
          <Receipt className="w-3.5 h-3.5" /> Generate Invoice
        </button>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  INVOICE ARTIFACT                                               */
/* ============================================================= */
function InvoicePanel({ data }: { data: any }) {
  const [laborLines, setLaborLines] = useState<{ desc: string; hours: number; rate: number }[]>([
    { desc: "Labor — Troubleshooting & repair", hours: 3, rate: 125 },
  ]);
  const [partsLines, setPartsLines] = useState<{ pn: string; desc: string; qty: number; price: number }[]>([
    { pn: "CH48110-1", desc: "Oil filter", qty: 1, price: 42.50 },
    { pn: "AW100-8QT", desc: "Engine oil — AeroShell W100 (8 qts)", qty: 1, price: 84.90 },
  ]);
  const [taxRate] = useState(0.0825);

  const totalLabor = laborLines.reduce((s, l) => s + l.hours * l.rate, 0);
  const totalParts = partsLines.reduce((s, p) => s + p.qty * p.price, 0);
  const subtotal = totalLabor + totalParts;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const updateLabor = (i: number, field: string, val: string | number) => {
    const n = [...laborLines]; (n[i] as any)[field] = val; setLaborLines(n);
  };
  const updatePart = (i: number, field: string, val: string | number) => {
    const n = [...partsLines]; (n[i] as any)[field] = val; setPartsLines(n);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>{data?.invoiceNumber}</div>
          <div className="text-[12px] text-muted-foreground">{data?.customer}</div>
        </div>
        <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 text-amber-700" style={{ fontWeight: 600 }}>
          {data?.status || "DRAFT"}
        </span>
      </div>

      <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-2 gap-2 text-[12px]">
        <div><span className="text-muted-foreground">Bill To:</span> <span style={{ fontWeight: 500 }}>{data?.customer}</span></div>
        <div><span className="text-muted-foreground">Aircraft:</span> <span style={{ fontWeight: 500 }}>{data?.aircraft}</span></div>
        <div><span className="text-muted-foreground">Date:</span> <span style={{ fontWeight: 500 }}>{data?.issuedDate}</span></div>
        <div><span className="text-muted-foreground">Due:</span> <span style={{ fontWeight: 500 }}>{data?.dueDate || "Net 30"}</span></div>
      </div>

      {/* ── LABOR ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>LABOR</label>
          <button
            onClick={() => setLaborLines([...laborLines, { desc: "", hours: 1, rate: 125 }])}
            className="text-[11px] text-primary flex items-center gap-1 hover:text-primary/80 transition-colors"
            style={{ fontWeight: 500 }}
          ><Plus className="w-3 h-3" /> Add Line</button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_52px_64px_64px_24px] gap-2 px-3 py-1.5 bg-muted/50 text-[10px] text-muted-foreground" style={{ fontWeight: 600 }}>
            <span>Description</span><span className="text-right">Hrs</span><span className="text-right">Rate</span><span className="text-right">Amount</span><span />
          </div>
          {laborLines.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-muted-foreground italic">No labor lines yet.</div>
          ) : laborLines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_52px_64px_64px_24px] gap-2 px-3 py-2 border-t border-border items-center text-[12px]">
              <input value={l.desc} onChange={(e) => updateLabor(i, "desc", e.target.value)} className="bg-transparent outline-none min-w-0" placeholder="Description" />
              <input type="number" value={l.hours} onChange={(e) => updateLabor(i, "hours", +e.target.value)} className="bg-transparent outline-none text-right w-full" />
              <input type="number" value={l.rate} onChange={(e) => updateLabor(i, "rate", +e.target.value)} className="bg-transparent outline-none text-right w-full" />
              <span className="text-right" style={{ fontWeight: 500 }}>${(l.hours * l.rate).toFixed(2)}</span>
              <button onClick={() => setLaborLines(laborLines.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
          <div className="border-t border-border px-3 py-1.5 flex justify-between text-[11px] bg-muted/30">
            <span className="text-muted-foreground">Labor subtotal</span>
            <span style={{ fontWeight: 600 }}>${totalLabor.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* ── PARTS ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>PARTS</label>
          <button
            onClick={() => setPartsLines([...partsLines, { pn: "", desc: "", qty: 1, price: 0 }])}
            className="text-[11px] text-primary flex items-center gap-1 hover:text-primary/80 transition-colors"
            style={{ fontWeight: 500 }}
          ><Plus className="w-3 h-3" /> Add Line</button>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[56px_1fr_36px_60px_64px_24px] gap-2 px-3 py-1.5 bg-muted/50 text-[10px] text-muted-foreground" style={{ fontWeight: 600 }}>
            <span>P/N</span><span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit $</span><span className="text-right">Amount</span><span />
          </div>
          {partsLines.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-muted-foreground italic">No parts added. Say "find part…" in chat.</div>
          ) : partsLines.map((p, i) => (
            <div key={i} className="grid grid-cols-[56px_1fr_36px_60px_64px_24px] gap-2 px-3 py-2 border-t border-border items-center text-[12px]">
              <input value={p.pn} onChange={(e) => updatePart(i, "pn", e.target.value)} className="bg-transparent outline-none min-w-0 text-[11px]" placeholder="P/N" />
              <input value={p.desc} onChange={(e) => updatePart(i, "desc", e.target.value)} className="bg-transparent outline-none min-w-0" placeholder="Description" />
              <input type="number" value={p.qty} onChange={(e) => updatePart(i, "qty", +e.target.value)} className="bg-transparent outline-none text-right w-full" />
              <input type="number" value={p.price} onChange={(e) => updatePart(i, "price", +e.target.value)} className="bg-transparent outline-none text-right w-full" />
              <span className="text-right" style={{ fontWeight: 500 }}>${(p.qty * p.price).toFixed(2)}</span>
              <button onClick={() => setPartsLines(partsLines.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
          <div className="border-t border-border px-3 py-1.5 flex justify-between text-[11px] bg-muted/30">
            <span className="text-muted-foreground">Parts subtotal</span>
            <span style={{ fontWeight: 600 }}>${totalParts.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-[13px]">
        <div className="flex justify-between"><span className="text-muted-foreground">Labor:</span> <span style={{ fontWeight: 500 }}>${totalLabor.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Parts:</span> <span style={{ fontWeight: 500 }}>${totalParts.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal:</span> <span style={{ fontWeight: 500 }}>${subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Tax (8.25%):</span> <span style={{ fontWeight: 500 }}>${tax.toFixed(2)}</span></div>
        <div className="flex justify-between border-t border-border pt-1.5 mt-1"><span style={{ fontWeight: 700 }}>Total:</span> <span className="text-[16px]" style={{ fontWeight: 700 }}>${total.toFixed(2)}</span></div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-[12px] hover:bg-primary/90" style={{ fontWeight: 500 }}>
          <Mail className="w-3.5 h-3.5" /> Email
        </button>
        <button className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-[12px] hover:bg-muted" style={{ fontWeight: 500 }}>
          <Download className="w-3.5 h-3.5" /> PDF
        </button>
        <button className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-[12px] hover:bg-muted" style={{ fontWeight: 500 }}>
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
      </div>

      {/* Payment status */}
      <div className="border border-border rounded-lg p-3">
        <label className="text-[11px] text-muted-foreground mb-2 block" style={{ fontWeight: 600 }}>PAYMENT STATUS</label>
        <div className="flex gap-2 flex-wrap">
          {["Unpaid", "Pending", "Partially Paid", "Paid"].map((s) => (
            <button key={s} className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              data?.paymentStatus === s ? "bg-primary text-white border-primary" : "border-border hover:bg-muted"
            }`} style={{ fontWeight: 500 }}>{s}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  PARTS LOOKUP ARTIFACT                                          */
/* ============================================================= */
function PartsLookupPanel({ data }: { data: any }) {
  const { searchOnlineParts, addPart } = usePartsStore();
  const [liveResults, setLiveResults] = useState<OnlinePartResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  const [requestNote, setRequestNote] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  // Auto-search using query from chat engine
  const runSearch = async () => {
    if (searchDone || !data?.query) return;
    setSearchDone(true);
    setLoading(true);
    const r = await searchOnlineParts(data.query, data.aircraft);
    setLiveResults(r);
    setLoading(false);
  };

  // Trigger search on mount
  if (!searchDone && data?.query) runSearch();

  const handleSave = async (p: OnlinePartResult) => {
    setSavingId(p.id);
    await new Promise(r => setTimeout(r, 400));
    addPart({
      pn: p.pn, altPn: p.altPn, desc: p.desc, category: "Misc",
      manufacturer: p.manufacturer, vendor: p.vendor, sourceUrl: p.sourceUrl,
      condition: p.condition, costPrice: p.price,
      ourRate: Math.round(p.price * 1.35 * 100) / 100,
      qtyInStock: 0, minStock: 1,
    });
    setSavedIds(prev => [...prev, p.id]);
    setSavingId(null);
  };

  const fitColor = (fit: string) =>
    fit.includes("Confirmed") ? "bg-emerald-50 text-emerald-700" :
    fit.includes("Likely") ? "bg-amber-50 text-amber-700" :
    "bg-red-50 text-red-700";

  const displayResults = liveResults.length > 0 ? liveResults :
    (searchDone ? [] : (data?.results?.map((r: any, i: number) => ({
      id: `static-${i}`, pn: r.pn, altPn: r.alt, desc: r.desc,
      manufacturer: r.vendor, vendor: r.vendor, vendorLogo: "🔧",
      price: parseFloat(r.price?.replace("$", "") || "0"),
      condition: r.condition, fit: r.fit, stock: r.stock,
      leadTime: "1-3 days", sourceUrl: "#", rating: 4.5, reviews: 24,
    })) || []));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>Parts: "{data?.query}"</div>
          <div className="text-[12px] text-muted-foreground">{data?.aircraft} &middot; {data?.makeModel}</div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Package className="w-3.5 h-3.5" />
          {displayResults.length} results
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-8 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <div className="text-[13px]" style={{ fontWeight: 500 }}>Searching all aviation vendors…</div>
        </div>
      ) : (
        <div className="space-y-2">
          {displayResults.map((r: any, i: number) => (
            <div key={r.id || i} className="border border-border rounded-xl p-3 hover:shadow-sm hover:border-primary/20 transition-all bg-white">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-[18px] shrink-0">{r.vendorLogo || "🔧"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>{r.pn}</span>
                    {r.altPn && <span className="text-[10px] text-muted-foreground">/ {r.altPn}</span>}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${fitColor(r.fit)}`} style={{ fontWeight: 600 }}>{r.fit}</span>
                  </div>
                  <div className="text-[12px] text-foreground">{r.desc}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 500 }}>{r.vendor}</span>
                    {r.rating && (
                      <div className="flex items-center gap-0.5 text-amber-500">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        <span className="text-[10px] text-foreground">{r.rating.toFixed?.(1) ?? r.rating}</span>
                      </div>
                    )}
                    <span className={`text-[10px] ${r.stock === "In Stock" ? "text-emerald-600" : "text-amber-600"}`}>{r.stock}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>${typeof r.price === "number" ? r.price.toFixed(2) : r.price}</div>
                  <div className="flex flex-col gap-1 mt-1.5">
                    <a href={r.sourceUrl !== "#" ? r.sourceUrl : undefined}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 border border-border px-2 py-1 rounded-lg text-[10px] text-primary hover:bg-primary/5 transition-colors" style={{ fontWeight: 500 }}>
                      <ExternalLink className="w-2.5 h-2.5" /> Order
                    </a>
                    {savedIds.includes(r.id) ? (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-600 px-1" style={{ fontWeight: 600 }}>
                        <Check className="w-3 h-3" /> Saved
                      </div>
                    ) : (
                      <button onClick={() => handleSave(r)} disabled={savingId === r.id}
                        className="flex items-center gap-1 bg-primary text-white px-2 py-1 rounded-lg text-[10px] hover:bg-primary/90 disabled:opacity-50 transition-colors" style={{ fontWeight: 600 }}>
                        {savingId === r.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Save className="w-2.5 h-2.5" />}
                        Save
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No results — request parts */}
      {!loading && searchDone && displayResults.length === 0 && (
        <div className="border border-dashed border-amber-200 bg-amber-50/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-[13px] text-amber-800" style={{ fontWeight: 600 }}>No parts found online</span>
          </div>
          <p className="text-[12px] text-amber-700">
            Could not find <strong>"{data?.query}"</strong> from connected vendors. Submit a parts request and the parts manager will source it.
          </p>
          {!requestSubmitted ? (
            <div className="space-y-2">
              <textarea
                value={requestNote}
                onChange={e => setRequestNote(e.target.value)}
                placeholder="Add notes (qty needed, urgency, alternative P/N)..."
                rows={2}
                className="w-full border border-amber-200 rounded-lg px-3 py-2 text-[12px] outline-none resize-none bg-white focus:ring-2 focus:ring-amber-300/40"
              />
              <button
                onClick={() => {
                  setRequestSubmitted(true);
                  toast.success("Parts request submitted", {
                    description: `"${data?.query}" — ${data?.aircraft || "aircraft"} · Request logged`,
                  });
                }}
                className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white py-2 rounded-lg text-[12px] hover:bg-amber-700 transition-colors"
                style={{ fontWeight: 600 }}
              >
                <Send className="w-3.5 h-3.5" /> Submit Parts Request
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-700 text-[12px]" style={{ fontWeight: 600 }}>
              <Check className="w-4 h-4" /> Parts request submitted — Parts manager notified
            </div>
          )}
        </div>
      )}

      {displayResults.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span className="text-[11px] text-amber-700">Verify compatibility with aircraft IPC before ordering. Save parts to inventory or say "request parts" to submit a parts request.</span>
        </div>
      )}
    </div>
  );
}

/* ============================================================= */
/*  CUSTOMER CARD ARTIFACT                                         */
/* ============================================================= */
function CustomerCardPanel({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <User className="w-6 h-6 text-primary" />
        </div>
        <div>
          <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>{data?.name}</div>
          {data?.company && <div className="text-[12px] text-muted-foreground">{data.company}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {[
          { icon: Mail, label: data?.email },
          { icon: Phone, label: data?.phone },
          { icon: MapPin, label: data?.address },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Work Orders", value: data?.totalWorkOrders },
          { label: "Open Invoices", value: data?.openInvoices },
          { label: "Total Billed", value: data?.totalBilled },
          { label: "Outstanding", value: data?.outstandingBalance },
        ].map((s, i) => (
          <div key={i} className="bg-muted/50 rounded-lg p-2.5">
            <div className="text-[10px] text-muted-foreground" style={{ fontWeight: 600 }}>{s.label}</div>
            <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div>
        <label className="text-[11px] text-muted-foreground mb-1.5 block" style={{ fontWeight: 600 }}>AIRCRAFT</label>
        <div className="space-y-1.5">
          {data?.aircraft?.map((a: string) => (
            <div key={a} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Plane className="w-4 h-4 text-primary" />
              <span className="text-[13px]" style={{ fontWeight: 500 }}>{a}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[11px] text-muted-foreground mb-1.5 block" style={{ fontWeight: 600 }}>TAGS</label>
        <div className="flex flex-wrap gap-1.5">
          {data?.tags?.map((t: string) => (
            <span key={t} className="text-[11px] px-2.5 py-1 rounded-full bg-primary/8 text-primary" style={{ fontWeight: 500 }}>{t}</span>
          ))}
        </div>
      </div>

      {data?.notes && (
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block" style={{ fontWeight: 600 }}>NOTES</label>
          <div className="text-[12px] text-foreground bg-muted/50 rounded-lg p-2.5">{data.notes}</div>
        </div>
      )}
    </div>
  );
}

/* ============================================================= */
/*  INSPECTION CHECKLIST ARTIFACT                                  */
/* ============================================================= */
function InspectionChecklistPanel({ data }: { data: any }) {
  const [sections, setSections] = useState(data?.sections || []);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{data?.type || "Inspection"} Checklist</div>
        <div className="text-[12px] text-muted-foreground">{data?.aircraft}</div>
      </div>
      <div className="space-y-2">
        {sections.map((s: any, i: number) => (
          <div key={i} className="border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{s.name}</span>
              <span className="text-[11px] text-muted-foreground">{s.completed}/{s.items}</span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(s.completed / s.items) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-muted/50 rounded-lg p-3 text-center">
        <div className="text-[24px] text-foreground" style={{ fontWeight: 700 }}>
          {sections.reduce((s: number, sec: any) => s + sec.completed, 0)} / {sections.reduce((s: number, sec: any) => s + sec.items, 0)}
        </div>
        <div className="text-[12px] text-muted-foreground">Items Inspected</div>
      </div>
    </div>
  );
}

/* ============================================================= */
/*  MAIN ARTIFACT PANEL ROUTER                                     */
/* ============================================================= */
export function ArtifactPanel({ type, data, onClose, onAction }: ArtifactPanelProps) {
  if (!type) return null;

  const TITLES: Record<string, { icon: typeof FileText; label: string }> = {
    "logbook-entry": { icon: FileText, label: "Logbook Entry" },
    "work-order": { icon: Wrench, label: "Work Order" },
    invoice: { icon: Receipt, label: "Invoice" },
    "parts-lookup": { icon: Search, label: "Parts Lookup" },
    "customer-card": { icon: User, label: "Customer" },
    signature: { icon: Shield, label: "Signature" },
    "compliance-checklist": { icon: CheckSquare, label: "Compliance" },
    "inspection-checklist": { icon: ClipboardList, label: "Inspection Checklist" },
    "thread-summary": { icon: FileText, label: "Thread Summary" },
    estimate: { icon: DollarSign, label: "Estimate" },
  };

  const meta = TITLES[type] || { icon: FileText, label: "Artifact" };
  const Icon = meta.icon;

  return (
    <div className="h-full flex flex-col bg-white border-l border-border">
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>{meta.label}</span>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {type === "logbook-entry" && <LogbookEntryPanel data={data} onAction={onAction} />}
        {type === "work-order" && <WorkOrderPanel data={data} />}
        {type === "invoice" && <InvoicePanel data={data} />}
        {type === "parts-lookup" && <PartsLookupPanel data={data} />}
        {type === "customer-card" && <CustomerCardPanel data={data} />}
        {type === "inspection-checklist" && <InspectionChecklistPanel data={data} />}
      </div>
    </div>
  );
}
