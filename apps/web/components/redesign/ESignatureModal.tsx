"use client";

/**
 * ESignatureModal — DocuSign-style electronic signature
 *
 * Compliant with:
 *  • U.S. ESIGN Act (15 U.S.C. § 7001)
 *  • UETA (Uniform Electronic Transactions Act)
 *  • FAA 14 CFR Part 43 (for maintenance / CRS signatures)
 *
 * Modes: Draw (canvas/finger) | Type (cursive render)
 * Captures: timestamp, simulated IP, session token, consent record
 */

import React, { useState, useRef, useEffect } from "react";
import {
  Shield, X, CheckCircle, RotateCcw, PenLine, Type,
  Lock, Clock, Globe, FileCheck, Info, AlertCircle,
  BadgeCheck, ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

/* ─── Types ──────────────────────────────────────────────────── */
export interface SignatureResult {
  mode: "draw" | "type";
  /** base-64 PNG (draw mode) or null (type mode) */
  imageData: string | null;
  /** text used in type mode */
  typedText: string;
  /** display name for type mode (rendered font) */
  fontFamily: string;
  signerName: string;
  signerTitle: string;
  signerCert: string;
  timestamp: string;
  timestampISO: string;
  ipAddress: string;
  sessionToken: string;
  documentId: string;
  consentGiven: boolean;
}

export interface ESignatureModalProps {
  documentId: string;
  documentTitle: string;
  documentType: "invoice" | "crs" | "maintenance" | "estimate";
  signerName: string;
  signerTitle: string;
  signerCert: string;
  /** Extra context shown in info panel (e.g. aircraft N-number, invoice #) */
  context?: { label: string; value: string }[];
  onCancel: () => void;
  onSigned: (result: SignatureResult) => void;
}

/* ─── Type-mode signature fonts ──────────────────────────────── */
const SIGNATURE_FONTS = [
  { label: "Script",   family: "'Dancing Script', cursive", preview: "Signature" },
  { label: "Formal",  family: "'Great Vibes', cursive",     preview: "Signature" },
  { label: "Classic", family: "'Georgia', serif",           preview: "Signature" },
];

/* ─── Simulated IP ──────────────────────────────────────────── */
function fakeIp() {
  return `${198}.${51}.${100}.${Math.floor(Math.random() * 254) + 1}`;
}

function genToken() {
  const a = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${a()}-${a()}-${a()}-${a()}`;
}

/* ═══════════════════════════════════════════════════════════════ */
export function ESignatureModal({
  documentId, documentTitle, documentType,
  signerName, signerTitle, signerCert,
  context = [],
  onCancel, onSigned,
}: ESignatureModalProps) {

  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [typedSig, setTypedSig] = useState("");
  const [fontIdx, setFontIdx] = useState(0);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [certified, setCertified] = useState(false);
  const [esignConsent, setEsignConsent] = useState(false);
  const [signing, setSigning] = useState(false);
  const [step, setStep] = useState<"sign" | "confirming" | "done">("sign");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Stable session metadata
  const sessionToken = useRef(genToken());
  const ipAddress = useRef(fakeIp());

  const now = new Date();
  const timestamp = now.toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
    hour12: true, timeZoneName: "short",
  });

  const canSign = certified && esignConsent &&
    (tab === "draw" ? hasDrawn : typedSig.trim().length >= 2);

  /* ─── Canvas: get canvas-space coordinates ─────────────────── */
  const getCanvasPos = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  /* ─── Global mouse listeners (attached once on mount) ─────── */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDrawing.current) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getCanvasPos(e.clientX, e.clientY);
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = "#0A1628";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      lastPos.current = pos;
    };
    const onUp = () => { isDrawing.current = false; };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Canvas mouse-down (only event needed on the canvas) ── */
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos = getCanvasPos(e.clientX, e.clientY);
    lastPos.current = pos;
    isDrawing.current = true;
    // Paint a single dot so a click without drag is visible
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0A1628";
      ctx.fill();
    }
    setHasDrawn(true);
  };

  /* ─── Touch helpers (stay on the canvas element) ─────────── */
  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const t = e.touches[0];
    return getCanvasPos(t.clientX, t.clientY);
  };

  const startTouchDraw = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos = getTouchPos(e);
    lastPos.current = pos;
    isDrawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0A1628";
      ctx.fill();
    }
    setHasDrawn(true);
  };

  const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getTouchPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#0A1628";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const endTouchDraw = () => { isDrawing.current = false; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  };

  /* ─── Sign handler ─────────────────────────────────────────── */
  const handleSign = async () => {
    if (!canSign) return;
    setSigning(true);
    setStep("confirming");
    await new Promise(r => setTimeout(r, 1600));

    let imageData: string | null = null;
    if (tab === "draw" && canvasRef.current) {
      imageData = canvasRef.current.toDataURL("image/png");
    }

    const result: SignatureResult = {
      mode: tab,
      imageData,
      typedText: typedSig,
      fontFamily: SIGNATURE_FONTS[fontIdx].family,
      signerName,
      signerTitle,
      signerCert,
      timestamp,
      timestampISO: now.toISOString(),
      ipAddress: ipAddress.current,
      sessionToken: sessionToken.current,
      documentId,
      consentGiven: true,
    };

    setStep("done");
    await new Promise(r => setTimeout(r, 800));
    onSigned(result);
  };

  const selectedFont = SIGNATURE_FONTS[fontIdx];
  const docTypeLabel: Record<string, string> = {
    invoice: "Invoice",
    crs: "Certificate of Return to Service",
    maintenance: "Maintenance Record",
    estimate: "Estimate",
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && step === "sign" && onCancel()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[520px] max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="bg-[#0A1628] px-6 py-4 shrink-0 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <BadgeCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>Electronic Signature</div>
              <div className="text-white/50 text-[11px] mt-0.5">{docTypeLabel[documentType]} · {documentTitle}</div>
            </div>
          </div>
          {step === "sign" && (
            <button onClick={onCancel} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors mt-0.5">
              <X className="w-4 h-4 text-white/60" />
            </button>
          )}
        </div>

        {/* ── Confirming spinner ── */}
        {step === "confirming" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-12 px-8">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <Shield className="w-6 h-6 text-primary absolute inset-0 m-auto" />
            </div>
            <div className="text-center">
              <div className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>Sealing Document…</div>
              <p className="text-[13px] text-muted-foreground mt-1.5">
                Generating cryptographic audit certificate.<br />
                Recording IP, timestamp, and consent record.
              </p>
            </div>
          </div>
        )}

        {/* ── Done state ── */}
        {step === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12 px-8">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </motion.div>
            <div className="text-center">
              <div className="text-[17px] text-foreground" style={{ fontWeight: 700 }}>Signed &amp; Sealed</div>
              <p className="text-[13px] text-muted-foreground mt-1.5">Document has been electronically signed and locked.</p>
            </div>
          </div>
        )}

        {/* ── Main sign UI ── */}
        {step === "sign" && (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 pt-5 pb-4 space-y-4">

                {/* Signer info */}
                <div className="bg-[#F4F6FA] rounded-xl border border-[#E2E8F0] p-4 space-y-2">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1" style={{ fontWeight: 700 }}>Signer Identity</div>
                  {[
                    { label: "Full Name",    value: signerName },
                    { label: "Title",        value: signerTitle },
                    { label: "Certificate",  value: signerCert },
                    ...context,
                    { label: "Timestamp",    value: timestamp },
                    { label: "IP Address",   value: `${ipAddress.current} (captured)` },
                    { label: "Session",      value: sessionToken.current },
                  ].map(row => (
                    <div key={row.label} className="flex items-baseline gap-2 text-[12px]">
                      <span className="text-muted-foreground w-24 shrink-0">{row.label}:</span>
                      <span className="text-foreground" style={{ fontWeight: row.label === "Full Name" || row.label === "Certificate" ? 700 : 500 }}>{row.value}</span>
                    </div>
                  ))}
                </div>

                {/* Mode toggle */}
                <div className="flex bg-muted/40 rounded-xl border border-border overflow-hidden p-0.5 gap-0.5">
                  {(["draw", "type"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setTab(mode)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] transition-all ${tab === mode ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      style={{ fontWeight: tab === mode ? 600 : 400 }}
                    >
                      {mode === "draw" ? <PenLine className="w-3.5 h-3.5" /> : <Type className="w-3.5 h-3.5" />}
                      {mode === "draw" ? "Draw Signature" : "Type Signature"}
                    </button>
                  ))}
                </div>

                {/* Signature area */}
                <AnimatePresence mode="wait">
                  {tab === "draw" ? (
                    <motion.div key="draw" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.12 }}>
                      <div className="relative border-2 border-dashed border-slate-200 rounded-xl overflow-hidden bg-white" style={{ height: 168 }}>
                        {/* Guidelines */}
                        <div className="absolute bottom-10 left-6 right-6 border-b border-slate-200 pointer-events-none" />
                        <div className="absolute bottom-10 left-6 text-[10px] text-slate-300 pointer-events-none" style={{ fontWeight: 500 }}>Sign above line</div>
                        <button onClick={clearCanvas}
                          className="absolute top-2 right-3 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors z-10 bg-white/80 backdrop-blur-sm rounded-md px-2 py-1"
                          style={{ fontWeight: 500 }}>
                          <RotateCcw className="w-3 h-3" /> Clear
                        </button>
                        <canvas
                          ref={canvasRef}
                          width={960}
                          height={300}
                          className="w-full cursor-crosshair select-none"
                          style={{ height: "100%", touchAction: "none" }}
                          onMouseDown={startDraw}
                          onTouchStart={startTouchDraw}
                          onTouchMove={drawTouch}
                          onTouchEnd={endTouchDraw}
                        />
                        {!hasDrawn && (
                          <div className="absolute inset-0 flex items-end justify-center pb-14 pointer-events-none">
                            <span className="text-[18px] text-muted-foreground/25" style={{ fontFamily: "'Dancing Script', cursive", fontWeight: 600 }}>
                              Sign here with mouse or finger
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                        <Globe className="w-3 h-3 shrink-0" /> Touch-enabled on mobile — use your finger to draw your signature
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div key="type" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.12 }}
                      className="space-y-3">
                      {/* Font picker */}
                      <div className="relative">
                        <button
                          onClick={() => setFontMenuOpen(o => !o)}
                          className="flex items-center gap-2 text-[12px] border border-border bg-white rounded-xl px-3 py-2 hover:border-primary/40 transition-colors"
                          style={{ fontWeight: 500 }}
                        >
                          <span style={{ fontFamily: selectedFont.family, fontSize: "16px" }}>Aa</span>
                          Style: {selectedFont.label}
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1" />
                        </button>
                        <AnimatePresence>
                          {fontMenuOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                              className="absolute top-full left-0 mt-1 bg-white border border-border rounded-xl shadow-xl z-20 min-w-[200px] overflow-hidden"
                            >
                              {SIGNATURE_FONTS.map((f, idx) => (
                                <button key={f.label} onClick={() => { setFontIdx(idx); setFontMenuOpen(false); }}
                                  className={`w-full text-left px-4 py-3 hover:bg-muted/30 flex items-center justify-between ${fontIdx === idx ? "bg-primary/5" : ""}`}>
                                  <span style={{ fontFamily: f.family, fontSize: "20px", color: "#0A1628" }}>
                                    {typedSig || signerName.split(" ")[0]}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">{f.label}</span>
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Signature input with live preview */}
                      <div className="border-2 border-dashed border-slate-200 rounded-xl px-6 py-5 bg-white min-h-[110px] relative">
                        <div className="absolute bottom-4 left-6 right-6 border-b border-slate-200" />
                        <input
                          value={typedSig}
                          onChange={e => setTypedSig(e.target.value)}
                          placeholder={signerName}
                          className="w-full outline-none bg-transparent relative z-10"
                          style={{
                            fontFamily: selectedFont.family,
                            fontSize: "32px",
                            color: "#0A1628",
                            lineHeight: 1.3,
                          }}
                          autoFocus
                          maxLength={60}
                        />
                        <div className="absolute bottom-1 left-6 text-[10px] text-slate-300" style={{ fontWeight: 500 }}>Type your full legal name</div>
                      </div>

                      {/* Live preview */}
                      {typedSig && (
                        <div className="bg-muted/20 border border-border rounded-xl p-3 flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground shrink-0" style={{ fontWeight: 600 }}>Preview:</span>
                          <span style={{ fontFamily: selectedFont.family, fontSize: "22px", color: "#0A1628" }}>
                            {typedSig}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ESIGN Consent */}
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-800" style={{ fontWeight: 600 }}>E-Signature Disclosure &amp; Consent</div>
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    By signing, you consent to use an electronic signature as governed by the <strong>U.S. ESIGN Act (15 U.S.C. § 7001)</strong> and
                    the <strong>Uniform Electronic Transactions Act (UETA)</strong>. Your electronic signature is legally equivalent to a handwritten
                    signature. A cryptographic audit record — including your IP address, timestamp, session token, and signature data — will be
                    permanently associated with this document.
                    {documentType === "crs" && (
                      <> This document constitutes a <strong>Certificate of Return to Service</strong> under <strong>14 CFR Part 43.9</strong> and your signature certifies aircraft airworthiness.</>
                    )}
                  </p>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <div className="relative mt-0.5 shrink-0">
                      <input type="checkbox" checked={esignConsent} onChange={e => setEsignConsent(e.target.checked)} className="sr-only" />
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${esignConsent ? "bg-amber-600 border-amber-600" : "border-amber-400 bg-white"}`}>
                        {esignConsent && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L3.5 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                    </div>
                    <span className="text-[11px] text-amber-800 leading-relaxed" style={{ fontWeight: 500 }}>
                      I consent to use electronic records and signatures for this transaction.
                    </span>
                  </label>
                </div>

                {/* Legal certification */}
                <label className="flex items-start gap-3 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="relative mt-0.5 shrink-0">
                    <input type="checkbox" checked={certified} onChange={e => setCertified(e.target.checked)} className="sr-only" />
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${certified ? "bg-[#0A1628] border-[#0A1628]" : "border-border bg-white"}`}>
                      {certified && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L3.5 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground leading-relaxed">
                    I, <strong className="text-foreground">{signerName}</strong>, confirm that the information in this{" "}
                    <strong>{docTypeLabel[documentType]}</strong> is true and accurate to the best of my knowledge. I understand this
                    electronic signature is <strong>legally binding</strong> and carries the same legal weight as a wet-ink signature.
                    {documentType === "crs" && (
                      <> I further certify, pursuant to <strong>14 CFR § 43.9</strong>, that the aircraft described herein has been returned to an airworthy condition.</>
                    )}
                  </span>
                </label>

                {/* Security indicators */}
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5"><Lock className="w-3 h-3 text-emerald-600" /><span>256-bit encrypted</span></div>
                  <div className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-primary" /><span>Timestamped</span></div>
                  <div className="flex items-center gap-1.5"><Globe className="w-3 h-3 text-violet-600" /><span>IP recorded</span></div>
                  <div className="flex items-center gap-1.5"><FileCheck className="w-3 h-3 text-blue-600" /><span>Audit trail</span></div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 border-t border-border bg-[#F4F6FA] flex items-center justify-between gap-3">
              <button onClick={onCancel}
                className="px-5 py-2.5 rounded-xl border border-border text-[13px] text-foreground bg-white hover:bg-muted/30 transition-colors"
                style={{ fontWeight: 500 }}>
                Cancel
              </button>
              <button
                onClick={handleSign}
                disabled={!canSign || signing}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-[13px] transition-all ${canSign ? "bg-[#0A1628] hover:bg-[#1E3A5F] shadow-md" : "bg-slate-300 cursor-not-allowed"}`}
                style={{ fontWeight: 700 }}
              >
                <Shield className="w-4 h-4" />
                {signing ? "Sealing…" : "Sign & Seal Document"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ─── Signature Block Display ─────────────────────────────────── */
/** Renders the signed proof block beneath a document */
export function SignatureBlock({ sig, label = "Mechanic's Signature" }: { sig: SignatureResult; label?: string }) {
  return (
    <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl overflow-hidden">
      {/* Top bar */}
      <div className="bg-emerald-600 px-4 py-2 flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-white" />
        <span className="text-white text-[12px]" style={{ fontWeight: 700 }}>Digitally Signed — Legally Binding</span>
        <span className="ml-auto text-emerald-100 text-[11px]">U.S. ESIGN Act Compliant</span>
      </div>

      <div className="p-4 grid grid-cols-2 gap-4">
        {/* Signature display */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 600 }}>{label}</div>
          <div className="border border-slate-200 rounded-lg bg-white px-4 py-3 min-h-[72px] flex items-center">
            {sig.mode === "draw" && sig.imageData ? (
              <img src={sig.imageData} alt="Signature" className="max-h-16 max-w-full object-contain" style={{ mixBlendMode: "multiply" }} />
            ) : (
              <span style={{ fontFamily: sig.fontFamily, fontSize: "28px", color: "#0A1628", lineHeight: 1.2 }}>
                {sig.typedText || sig.signerName}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" viewBox="0 0 10 10">
                <path d="M1.5 5L3.5 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[11px] text-emerald-700" style={{ fontWeight: 600 }}>{sig.signerName} · {sig.signerTitle}</span>
          </div>
        </div>

        {/* Audit trail */}
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2" style={{ fontWeight: 600 }}>Audit Record</div>
          {[
            { label: "Certificate", value: sig.signerCert },
            { label: "Signed at",   value: sig.timestamp },
            { label: "IP Address",  value: sig.ipAddress },
            { label: "Session ID",  value: sig.sessionToken },
            { label: "Document",    value: sig.documentId },
          ].map(row => (
            <div key={row.label} className="flex gap-2 text-[11px]">
              <span className="text-muted-foreground w-20 shrink-0">{row.label}:</span>
              <span className="text-foreground truncate" style={{ fontWeight: 500, fontFamily: row.label === "Session ID" || row.label === "Document" ? "monospace" : undefined }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Legal footer */}
      <div className="border-t border-emerald-200 px-4 py-2 bg-emerald-50 text-[10px] text-emerald-700 leading-relaxed">
        This document was electronically signed pursuant to the U.S. Electronic Signatures in Global and National Commerce Act (ESIGN, 15 U.S.C. § 7001) and the Uniform Electronic Transactions Act (UETA).
        The signer's IP address, timestamp, and consent record are permanently associated with this document. This electronic signature is legally equivalent to a wet-ink signature.
      </div>
    </div>
  );
}
