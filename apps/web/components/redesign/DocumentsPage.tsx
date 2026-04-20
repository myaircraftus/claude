"use client";

import { useState, useRef } from "react";
import {
  FileText, Search, Upload, Download, Eye,
  CheckCircle, Clock, AlertTriangle, X, ChevronDown,
  Info, Lock, Users, DollarSign, BookOpen, Check,
  History, Layers
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppContext } from "./AppContext";

const documents = [
  { name: "Annual Inspection Report 2025", aircraft: "N12345", type: "Inspection", pages: 12, status: "Processed", statusColor: "text-emerald-600 bg-emerald-50", date: "Mar 15, 2026", confidence: 98 },
  { name: "Engine Logbook Pages 1-50", aircraft: "N12345", type: "Logbook", pages: 50, status: "Processed", statusColor: "text-emerald-600 bg-emerald-50", date: "Feb 20, 2026", confidence: 95 },
  { name: "AD Compliance Pack - N67890", aircraft: "N67890", type: "AD", pages: 8, status: "Needs Review", statusColor: "text-amber-600 bg-amber-50", date: "Feb 15, 2026", confidence: 72 },
  { name: "Weight & Balance - N24680", aircraft: "N24680", type: "Report", pages: 4, status: "Processed", statusColor: "text-emerald-600 bg-emerald-50", date: "Jan 28, 2026", confidence: 99 },
  { name: "Prop Overhaul Certificate", aircraft: "N12345", type: "Certificate", pages: 2, status: "Processed", statusColor: "text-emerald-600 bg-emerald-50", date: "Dec 5, 2025", confidence: 97 },
  { name: "Fuel System SB Compliance", aircraft: "N67890", type: "Service Bulletin", pages: 6, status: "Processing", statusColor: "text-blue-600 bg-blue-50", date: "Dec 1, 2025", confidence: 0 },
];

const typeFilters = ["All", "Logbook", "Inspection", "AD", "Certificate", "Report"];

const MANUAL_TYPES = ["Maintenance Manual", "Service Manual", "Parts Catalog"];
const DOC_TYPES_ALL = [
  "Logbook Entry",
  "Inspection Report",
  "AD Compliance",
  "Certificate",
  "Service Bulletin",
  "Report",
  "Maintenance Manual",
  "Service Manual",
  "Parts Catalog",
  "Other",
];
// Mechanic persona: only maintenance-related document types
const DOC_TYPES_MECHANIC = [
  "Inspection Report",
  "AD Compliance",
  "Service Bulletin",
  "Maintenance Manual",
  "Service Manual",
  "Parts Catalog",
];
const AIRCRAFT = [
  "N12345 — Cessna 172S",
  "N67890 — Piper PA-28",
  "N24680 — Beechcraft A36",
];

type Visibility = "private" | "team";
type BookType = "historical" | "present";
type ManualAccess = "private" | "free" | "paid";

interface UploadForm {
  title: string;
  docType: string;
  visibility: Visibility;
  aircraft: string;
  notes: string;
  bookType: BookType;
  manualAccess: ManualAccess;
  price: string;
  file: string;
  attest: boolean;
}

const FORM_DEFAULT: UploadForm = {
  title: "",
  docType: "Logbook Entry",
  visibility: "private",
  aircraft: "",
  notes: "",
  bookType: "present",
  manualAccess: "private",
  price: "25",
  file: "",
  attest: false,
};

export function DocumentsPage() {
  const { persona } = useAppContext();
  const DOC_TYPES = persona === "mechanic" ? DOC_TYPES_MECHANIC : DOC_TYPES_ALL;

  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState("All");
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<UploadForm>(FORM_DEFAULT);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pf = (f: Partial<UploadForm>) => setForm((prev) => ({ ...prev, ...f }));
  const isManualType = MANUAL_TYPES.includes(form.docType);

  const filtered = documents.filter((d) => {
    const matchSearch = `${d.name} ${d.aircraft}`.toLowerCase().includes(search.toLowerCase());
    const matchType = activeType === "All" || d.type === activeType;
    return matchSearch && matchType;
  });

  const gross = parseFloat(form.price || "0");
  const netAfterStripe = Math.max(0, gross - (gross * 0.029 + 0.3));
  const uploaderShare = (netAfterStripe * 0.5).toFixed(2);
  const platformShare = (netAfterStripe * 0.5).toFixed(2);

  const canSubmit = form.title.trim() && form.file;

  const handleSubmit = () => {
    setSubmitSuccess(true);
    setTimeout(() => {
      setSubmitSuccess(false);
      setShowUpload(false);
      setForm(FORM_DEFAULT);
    }, 2200);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Documents</h1>
          <p className="text-[13px] text-muted-foreground">{documents.length} documents across all aircraft</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-[13px] hover:bg-primary/90 transition-colors"
          style={{ fontWeight: 500 }}
        >
          <Upload className="w-4 h-4" /> Upload Documents
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Documents", value: "1,847", icon: FileText, color: "text-primary bg-primary/10" },
          { label: "Processed", value: "1,802", icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
          { label: "Needs Review", value: "38", icon: AlertTriangle, color: "text-amber-600 bg-amber-50" },
          { label: "Processing", value: "7", icon: Clock, color: "text-blue-600 bg-blue-50" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-border p-4">
            <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center mb-2`}>
              <s.icon className="w-4 h-4" />
            </div>
            <div className="text-[20px] text-foreground" style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-[11px] text-muted-foreground" style={{ fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search & filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents..." className="bg-transparent text-[13px] outline-none flex-1" />
        </div>
      </div>
      <div className="flex gap-1.5 mb-5">
        {typeFilters.map((t) => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${activeType === t ? "bg-primary text-white" : "bg-white border border-border text-muted-foreground hover:bg-muted/30"}`}
            style={{ fontWeight: 500 }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div className="bg-white rounded-xl border border-border divide-y divide-border">
        {filtered.map((doc, i) => (
          <div key={i} className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] text-foreground truncate" style={{ fontWeight: 500 }}>{doc.name}</div>
                <div className="text-[11px] text-muted-foreground">{doc.aircraft} &middot; {doc.type} &middot; {doc.pages} pages &middot; {doc.date}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {doc.confidence > 0 && (
                <div className="hidden md:flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${doc.confidence}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground" style={{ fontWeight: 500 }}>{doc.confidence}%</span>
                </div>
              )}
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${doc.statusColor}`} style={{ fontWeight: 600 }}>{doc.status}</span>
              <button className="p-1.5 hover:bg-muted rounded-lg transition-colors"><Eye className="w-4 h-4 text-muted-foreground" /></button>
              <button className="p-1.5 hover:bg-muted rounded-lg transition-colors"><Download className="w-4 h-4 text-muted-foreground" /></button>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Enhanced Upload Modal ─── */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto"
            onClick={(e) => { if (e.target === e.currentTarget) setShowUpload(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-2xl w-full max-w-lg my-8 overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="px-6 py-5 border-b border-border flex items-center justify-between">
                <h2 className="text-[18px] text-foreground" style={{ fontWeight: 700 }}>Upload Document</h2>
                <button onClick={() => setShowUpload(false)} className="p-1.5 hover:bg-muted rounded-lg">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {submitSuccess ? (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-12 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-[18px] text-foreground mb-2" style={{ fontWeight: 700 }}>Document uploaded!</h3>
                  <p className="text-[13px] text-muted-foreground max-w-xs">
                    {isManualType && form.manualAccess !== "private"
                      ? "Your manual has been submitted for community review."
                      : "Your document is being processed and will appear in your library shortly."}
                  </p>
                </motion.div>
              ) : (
                <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">

                  {/* Document title */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Document title <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => pf({ title: e.target.value })}
                      placeholder="e.g. Annual Inspection Report 2026"
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none"
                    />
                  </div>

                  {/* Document type */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Document type</label>
                    <div className="relative">
                      <select
                        value={form.docType}
                        onChange={(e) => pf({ docType: e.target.value })}
                        className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none appearance-none bg-white pr-8"
                      >
                        {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Visibility */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Visibility</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { val: "private" as Visibility, label: "Private", sub: "Only you", icon: Lock },
                        { val: "team" as Visibility, label: "Shared with team", sub: "All workspace members", icon: Users },
                      ]).map((v) => (
                        <button
                          key={v.val}
                          onClick={() => pf({ visibility: v.val })}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors ${
                            form.visibility === v.val
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/30"
                          }`}
                        >
                          <v.icon className={`w-4 h-4 shrink-0 ${form.visibility === v.val ? "text-primary" : "text-muted-foreground"}`} />
                          <div>
                            <div className={`text-[12px] ${form.visibility === v.val ? "text-primary" : "text-foreground"}`} style={{ fontWeight: 600 }}>{v.label}</div>
                            <div className="text-[11px] text-muted-foreground">{v.sub}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aircraft (optional) */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Aircraft <span className="text-muted-foreground/50">(optional)</span></label>
                    <div className="relative">
                      <select
                        value={form.aircraft}
                        onChange={(e) => pf({ aircraft: e.target.value })}
                        className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none appearance-none bg-white pr-8"
                      >
                        <option value="">— Not aircraft-specific —</option>
                        {AIRCRAFT.map((a) => <option key={a}>{a}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>Notes <span className="text-muted-foreground/50">(optional)</span></label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => pf({ notes: e.target.value })}
                      rows={2}
                      placeholder="Any notes for your team or about this document..."
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none resize-none"
                    />
                  </div>

                  {/* Book assignment type — only for non-manual types */}
                  {!isManualType && (
                    <div>
                      <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Book assignment type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { val: "historical" as BookType, label: "Historical", sub: "Past records & archive", icon: History },
                          { val: "present" as BookType, label: "Present", sub: "Current & active records", icon: Layers },
                        ]).map((b) => (
                          <button
                            key={b.val}
                            onClick={() => pf({ bookType: b.val })}
                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors ${
                              form.bookType === b.val
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/30"
                            }`}
                          >
                            <b.icon className={`w-4 h-4 shrink-0 ${form.bookType === b.val ? "text-primary" : "text-muted-foreground"}`} />
                            <div>
                              <div className={`text-[12px] ${form.bookType === b.val ? "text-primary" : "text-foreground"}`} style={{ fontWeight: 600 }}>{b.label}</div>
                              <div className="text-[11px] text-muted-foreground">{b.sub}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Manual-type community options ── */}
                  <AnimatePresence>
                    {isManualType && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="border border-primary/20 rounded-xl p-4 bg-primary/3 space-y-3">
                          {/* Info banner */}
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <p className="text-[12px] text-foreground leading-relaxed">
                              Manuals, service manuals, and parts catalogs can stay private or become community downloads. Paid listings follow the{" "}
                              <span style={{ fontWeight: 600 }}>50% uploader / 50% myaircraft.us split</span>.
                            </p>
                          </div>

                          <div>
                            <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Publishing option</label>
                            <div className="space-y-2">
                              {([
                                { val: "private" as ManualAccess, label: "Keep private", sub: "Only you and your team can access this", icon: Lock },
                                { val: "free" as ManualAccess, label: "Public free download", sub: "Listed on marketplace — anyone can download", icon: BookOpen },
                                { val: "paid" as ManualAccess, label: "Monetize", sub: "Paid listing — you earn 50% of net revenue", icon: DollarSign },
                              ]).map((opt) => (
                                <button
                                  key={opt.val}
                                  onClick={() => pf({ manualAccess: opt.val })}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                                    form.manualAccess === opt.val
                                      ? "border-primary bg-primary/5"
                                      : "border-border bg-white hover:bg-muted/20"
                                  }`}
                                >
                                  <opt.icon className={`w-4 h-4 shrink-0 ${form.manualAccess === opt.val ? "text-primary" : "text-muted-foreground"}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-[13px] ${form.manualAccess === opt.val ? "text-primary" : "text-foreground"}`} style={{ fontWeight: 600 }}>{opt.label}</div>
                                    <div className="text-[11px] text-muted-foreground">{opt.sub}</div>
                                  </div>
                                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                    form.manualAccess === opt.val ? "border-primary bg-primary" : "border-border"
                                  }`}>
                                    {form.manualAccess === opt.val && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Price input for paid */}
                          <AnimatePresence>
                            {form.manualAccess === "paid" && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <div className="space-y-2 pt-1">
                                  <div className="flex items-center gap-3">
                                    <label className="text-[12px] text-muted-foreground" style={{ fontWeight: 600 }}>Price</label>
                                    <div className="flex items-center gap-1.5 border border-border rounded-lg px-3 py-2 bg-white">
                                      <span className="text-[13px] text-muted-foreground">$</span>
                                      <input
                                        type="number"
                                        value={form.price}
                                        onChange={(e) => pf({ price: e.target.value })}
                                        className="w-16 text-[13px] outline-none bg-transparent"
                                        min="1"
                                      />
                                    </div>
                                  </div>
                                  {/* Revenue preview */}
                                  <div className="grid grid-cols-3 gap-2 text-center bg-white border border-border rounded-xl p-3">
                                    <div>
                                      <div className="text-[10px] text-muted-foreground">Free</div>
                                      <div className="text-[12px] text-foreground" style={{ fontWeight: 700 }}>${gross.toFixed(2)}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-muted-foreground">Uploader share</div>
                                      <div className="text-[12px] text-emerald-600" style={{ fontWeight: 700 }}>${uploaderShare}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-muted-foreground">Platform share</div>
                                      <div className="text-[12px] text-muted-foreground" style={{ fontWeight: 700 }}>${platformShare}</div>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Attestation for community listings */}
                          {(form.manualAccess === "free" || form.manualAccess === "paid") && (
                            <label className="flex items-start gap-2.5 cursor-pointer group">
                              <div
                                onClick={() => pf({ attest: !form.attest })}
                                className={`w-4 h-4 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
                                  form.attest ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                                }`}
                              >
                                {form.attest && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <span className="text-[12px] text-muted-foreground leading-relaxed">
                                I own the rights or have permission to distribute this document. I confirm this is not a POH, AFM, logbook, or aircraft-specific maintenance record.
                              </span>
                            </label>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* File upload */}
                  <div>
                    <label className="block text-[12px] text-muted-foreground mb-1" style={{ fontWeight: 600 }}>File <span className="text-red-500">*</span></label>
                    <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => pf({ file: e.target.files?.[0]?.name || "" })} />
                    <div
                      onClick={() => fileRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/40 transition-colors cursor-pointer ${
                        form.file ? "border-primary/30 bg-primary/3" : "border-border"
                      }`}
                    >
                      {form.file ? (
                        <div className="flex items-center justify-center gap-2 text-[13px] text-foreground">
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                          {form.file}
                        </div>
                      ) : (
                        <>
                          <Upload className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                          <div className="text-[13px] text-foreground mb-0.5" style={{ fontWeight: 500 }}>Drop files here or click to browse</div>
                          <div className="text-[12px] text-muted-foreground">PDF, JPG, PNG up to 50MB each</div>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="w-full py-3 rounded-xl bg-primary text-white text-[14px] hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ fontWeight: 600 }}
                  >
                    Upload &amp; Process
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
