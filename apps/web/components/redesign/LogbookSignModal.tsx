"use client";

import React, { useState, useRef } from "react";
import { Shield, X, CheckCircle } from "lucide-react";
import { motion } from "motion/react";

interface LogbookSignModalProps {
  entryId: string;
  entryNumber: string;
  aircraft: string;
  mechanic: string;
  cert: string;
  onCancel: () => void;
  onSigned: (entryId: string) => void;
}

export function LogbookSignModal({
  entryId, entryNumber, aircraft, mechanic, cert, onCancel, onSigned,
}: LogbookSignModalProps) {
  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [typedSig, setTypedSig] = useState("");
  const [certified, setCertified] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signing, setSigning] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const timestamp = new Date().toLocaleString("en-US", {
    month: "numeric", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });

  /* ─── Canvas helpers ─────────────────────────────────────── */
  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawing.current = true;
    const pos = getPos(e);
    lastPos.current = pos;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 1, 0, Math.PI * 2);
      ctx.fillStyle = "#1E3A5F";
      ctx.fill();
    }
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1E3A5F";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = () => { isDrawing.current = false; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  };

  /* ─── Sign handler ───────────────────────────────────────── */
  const canSign = certified && (tab === "draw" ? hasDrawn : typedSig.trim().length > 0);

  const handleSign = async () => {
    if (!canSign) return;
    setSigning(true);
    await new Promise(r => setTimeout(r, 1200));
    onSigned(entryId);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0A1628]/10 flex items-center justify-center shrink-0 mt-0.5">
              <Shield className="w-5 h-5 text-[#1E3A5F]" />
            </div>
            <div>
              <div className="text-[17px] text-foreground" style={{ fontWeight: 700 }}>Sign Document</div>
              <div className="text-[13px] text-muted-foreground mt-0.5">You are signing a maintenance record entry.</div>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-muted rounded-lg transition-colors mt-0.5">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">

          {/* Signer info panel */}
          <div className="bg-[#F7F8FA] rounded-xl border border-border p-4 space-y-2 text-[13px]">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Name:</span>
              <span style={{ fontWeight: 500 }}>{mechanic}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Certificate:</span>
              <span style={{ fontWeight: 700 }}>{cert}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Role:</span>
              <span style={{ fontWeight: 700 }}>A&P Mechanic / IA</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Timestamp:</span>
              <span style={{ fontWeight: 600 }}>{timestamp}</span>
            </div>
          </div>

          {/* Signature mode toggle */}
          <div className="flex rounded-xl border border-border overflow-hidden bg-[#F7F8FA]">
            <button
              onClick={() => setTab("draw")}
              className={`flex-1 py-2.5 text-[13px] transition-colors ${tab === "draw" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}
              style={{ fontWeight: tab === "draw" ? 600 : 400 }}
            >
              Draw Signature
            </button>
            <button
              onClick={() => setTab("type")}
              className={`flex-1 py-2.5 text-[13px] transition-colors ${tab === "type" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}
              style={{ fontWeight: tab === "type" ? 600 : 400 }}
            >
              Type Signature
            </button>
          </div>

          {/* Signature area */}
          {tab === "draw" ? (
            <div className="relative border-2 border-dashed border-slate-200 rounded-xl overflow-hidden bg-white" style={{ height: 160 }}>
              <button
                onClick={clearCanvas}
                className="absolute top-2 right-3 text-[12px] text-muted-foreground hover:text-foreground transition-colors z-10"
                style={{ fontWeight: 500 }}
              >
                Clear
              </button>
              <canvas
                ref={canvasRef}
                width={640}
                height={200}
                className="w-full cursor-crosshair select-none"
                style={{ height: "100%", touchAction: "none" }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
              {!hasDrawn && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[15px] text-muted-foreground/30" style={{ fontWeight: 300 }}>Sign here</span>
                </div>
              )}
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 rounded-xl px-5 py-5 bg-white min-h-[100px] flex items-center">
              <input
                value={typedSig}
                onChange={e => setTypedSig(e.target.value)}
                placeholder="Type your full legal name"
                className="w-full outline-none text-[26px] text-[#1E3A5F] placeholder:text-muted-foreground/25"
                style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontWeight: 600 }}
                autoFocus={tab === "type"}
              />
            </div>
          )}

          {/* Certification checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={certified}
                onChange={e => setCertified(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${certified ? "bg-[#0A1628] border-[#0A1628]" : "border-border bg-white"}`}>
                {certified && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                    <path d="M1.5 5L3.5 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-[12px] text-muted-foreground leading-relaxed">
              I, <strong className="text-foreground">{mechanic}</strong>, certify that the information in this maintenance record entry is true and accurate. I understand this signature is legally binding and will be cryptographically sealed with an immutable audit certificate.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-[#F7F8FA]">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-border text-[13px] text-foreground hover:bg-muted/30 transition-colors"
            style={{ fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSign}
            disabled={!canSign || signing}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#1E3A5F] text-white text-[13px] hover:bg-[#0A1628] disabled:opacity-40 transition-all"
            style={{ fontWeight: 600 }}
          >
            {signing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sealing…
              </>
            ) : (
              <>
                <Shield className="w-3.5 h-3.5" />
                Sign &amp; Seal
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
