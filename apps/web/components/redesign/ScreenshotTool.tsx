/**
 * ScreenshotExportPage
 * ─────────────────────
 * Standalone full-page screenshot tool. Navigate to /#/export-pages to use it.
 * Captures every key page at 2× pixel ratio, bundles them into a dated ZIP,
 * and auto-downloads when finished.
 *
 * The demo banner (id="demo-banner") is temporarily hidden before each
 * capture so it never appears in the output screenshots.
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Camera, Download, CheckSquare, Square, Loader2,
  AlertCircle, CheckCircle, ChevronDown, ChevronUp,
  Play, X, FileImage, Plane, Wrench, Globe,
  ArrowLeft,
} from "lucide-react";
import { toPng } from "html-to-image";
import JSZip from "jszip";

/* ─────────────────────────────────────────────────────────────── */
/*  Helpers                                                         */
/* ─────────────────────────────────────────────────────────────── */

function saveAs(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ─────────────────────────────────────────────────────────────── */
/*  Page definitions                                               */
/* ─────────────────────────────────────────────────────────────── */

interface PageDef {
  id: string;
  label: string;
  group: string;
  path: string;
  /** Click a tab/button with this text after navigating */
  setup?: string;
  /** Capture the full scrollable height */
  scrollFull?: boolean;
  /** Extra wait in ms after navigation */
  waitMs?: number;
}

const ALL_PAGES: PageDef[] = [
  // ── Public / Marketing
  { id: "home",     label: "Home Page",        group: "Public Website",  path: "/",          scrollFull: true },
  { id: "pricing",  label: "Pricing",           group: "Public Website",  path: "/pricing",   scrollFull: true },
  { id: "scanning", label: "Scanning Service",  group: "Public Website",  path: "/scanning",  scrollFull: true },
  { id: "login",    label: "Login",             group: "Auth",            path: "/login" },
  { id: "signup",   label: "Sign Up",           group: "Auth",            path: "/signup" },

  // ── Owner Persona
  { id: "o-dashboard",   label: "Dashboard",               group: "Owner",  path: "/app",                 scrollFull: true },
  { id: "o-aircraft",    label: "Aircraft List",            group: "Owner",  path: "/app/aircraft",        scrollFull: true },
  { id: "o-ac-overview", label: "Aircraft — Overview",     group: "Owner",  path: "/app/aircraft/N12345" },
  { id: "o-ac-docs",     label: "Aircraft — Documents",    group: "Owner",  path: "/app/aircraft/N12345", setup: "Documents" },
  { id: "o-ac-ask",      label: "Aircraft — Ask AI",       group: "Owner",  path: "/app/aircraft/N12345", setup: "Ask" },
  { id: "o-ac-timeline", label: "Aircraft — Timeline",     group: "Owner",  path: "/app/aircraft/N12345", setup: "Timeline" },
  { id: "o-ac-ads",      label: "Aircraft — ADs",          group: "Owner",  path: "/app/aircraft/N12345", setup: "ADs" },
  { id: "o-documents",   label: "Documents Manager",       group: "Owner",  path: "/app/documents",       scrollFull: true },
  { id: "o-ai",          label: "Ask / AI Command",        group: "Owner",  path: "/app/ai",              waitMs: 800 },
  { id: "o-marketplace", label: "Marketplace",             group: "Owner",  path: "/app/marketplace",     scrollFull: true },
  { id: "o-settings",    label: "Settings — Profile",      group: "Owner",  path: "/app/settings" },
  { id: "o-settings-t",  label: "Settings — Team",         group: "Owner",  path: "/app/settings",        setup: "Team" },
  { id: "o-settings-b",  label: "Settings — Billing",      group: "Owner",  path: "/app/settings",        setup: "Billing" },

  // ── Mechanic Persona
  { id: "m-dashboard",  label: "Mechanic — Dashboard",    group: "Mechanic", path: "/app/mechanic",                   waitMs: 800 },
  { id: "m-workorders", label: "Mechanic — Work Orders",  group: "Mechanic", path: "/app/mechanic?tab=workorders",    waitMs: 800 },
  { id: "m-logbook",    label: "Mechanic — Logbook",      group: "Mechanic", path: "/app/mechanic?tab=logbook",       waitMs: 800 },
  { id: "m-estimates",  label: "Mechanic — Estimates",    group: "Mechanic", path: "/app/mechanic?tab=estimates",     waitMs: 800 },
  { id: "m-invoices",   label: "Mechanic — Invoices",     group: "Mechanic", path: "/app/mechanic?tab=invoices",      waitMs: 800 },
  { id: "m-squawks",    label: "Mechanic — Squawks",      group: "Mechanic", path: "/app/mechanic?tab=squawks",       waitMs: 800 },
];

/* ─────────────────────────────────────────────────────────────── */
/*  Types                                                           */
/* ─────────────────────────────────────────────────────────────── */

type CaptureStatus = "idle" | "pending" | "capturing" | "verifying" | "done" | "failed" | "blank";

interface PageState {
  page: PageDef;
  selected: boolean;
  status: CaptureStatus;
  message?: string;
  blob?: Blob;
}

/* ─────────────────────────────────────────────────────────────── */
/*  Group icon map                                                  */
/* ─────────────────────────────────────────────────────────────── */

const GROUP_ICONS: Record<string, React.ReactNode> = {
  "Public Website": <Globe className="w-4 h-4" />,
  "Auth":           <Globe className="w-4 h-4" />,
  "Owner":          <Plane className="w-4 h-4" />,
  "Mechanic":       <Wrench className="w-4 h-4" />,
};

/* ─────────────────────────────────────────────────────────────── */
/*  Component                                                       */
/* ─────────────────────────────────────────────────────────────── */

export function ScreenshotExportPage() {
  const [pages, setPages] = useState<PageState[]>(() =>
    ALL_PAGES.map((p) => ({ page: p, selected: true, status: "idle" }))
  );
  const [capturing,       setCapturing]       = useState(false);
  const [done,            setDone]            = useState(false);
  const [progress,        setProgress]        = useState({ current: 0, total: 0 });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const abortRef = useRef(false);

  // Warn if user tries to leave mid-capture
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (capturing) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [capturing]);

  const selectedCount = pages.filter((p) => p.selected).length;
  const allSelected   = selectedCount === pages.length;
  const doneCount     = pages.filter((p) => p.status === "done").length;
  const failedCount   = pages.filter((p) => p.status === "failed" || p.status === "blank").length;

  const toggleAll   = () => setPages((p) => p.map((x) => ({ ...x, selected: !allSelected })));
  const togglePage  = (id: string) => setPages((p) => p.map((x) => x.page.id === id ? { ...x, selected: !x.selected } : x));
  const toggleGroup = (group: string) => {
    const allG = pages.filter((p) => p.page.group === group).every((p) => p.selected);
    setPages((p) => p.map((x) => x.page.group === group ? { ...x, selected: !allG } : x));
  };
  const toggleCollapseGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const n = new Set(prev);
      n.has(group) ? n.delete(group) : n.add(group);
      return n;
    });
  };

  const updatePage = useCallback((id: string, patch: Partial<PageState>) => {
    setPages((prev) => prev.map((p) => p.page.id === id ? { ...p, ...patch } : p));
  }, []);

  /* ── Navigate without router (standalone tool) ── */
  const navigateTo = async (path: string) => {
    window.location.assign(path);
    await wait(1800);
  };

  /* ── Click a visible tab/button by text ── */
  const clickTab = async (text: string): Promise<boolean> => {
    const els = document.querySelectorAll("button, a, [role='tab']");
    for (const pass of [0, 1, 2]) {
      for (const el of els) {
        if ((el as HTMLElement).offsetParent === null) continue;
        const t = (el as HTMLElement).textContent?.trim() ?? "";
        if (pass === 0 && t === text)                              { (el as HTMLElement).click(); await wait(800); return true; }
        if (pass === 1 && t.startsWith(text))                      { (el as HTMLElement).click(); await wait(800); return true; }
        if (pass === 2 && t.includes(text) && t.length < text.length + 20) { (el as HTMLElement).click(); await wait(800); return true; }
      }
    }
    return false;
  };

  /* ── Hide/show the demo banner ── */
  const hideDemoBanner = () => {
    const el = document.getElementById("demo-banner");
    if (el) el.style.setProperty("display", "none", "important");
  };
  const showDemoBanner = () => {
    const el = document.getElementById("demo-banner");
    if (el) el.style.removeProperty("display");
  };

  /* ── Verify blob has real visual content ── */
  const verifyNotBlank = (blob: Blob): Promise<boolean> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width  = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(false); return; }
        ctx.drawImage(img, 0, 0);
        let colored = 0;
        const n = 500;
        for (let i = 0; i < n; i++) {
          const [r, g, b, a] = ctx.getImageData(
            Math.floor(Math.random() * img.width),
            Math.floor(Math.random() * img.height),
            1, 1
          ).data;
          if (a > 10 && (r < 250 || g < 250 || b < 250)) colored++;
        }
        URL.revokeObjectURL(img.src);
        resolve(colored >= n * 0.02);
      };
      img.onerror = () => resolve(false);
      img.src = URL.createObjectURL(blob);
    });

  /* ── Capture current view via html-to-image ── */
  const captureCurrentView = async (scrollFull: boolean): Promise<Blob | null> => {
    const root   = document.getElementById("root");
    const target = root ?? document.body;

    // Temporarily expand overflow containers for full-page captures
    const saved: { el: HTMLElement; overflow: string; height: string }[] = [];
    if (scrollFull) {
      const mainEl     = target.querySelector("main");
      const flexParent = target.querySelector(".h-screen");
      for (const el of [mainEl, flexParent].filter(Boolean) as HTMLElement[]) {
        saved.push({ el, overflow: el.style.overflow, height: el.style.height });
        el.style.overflow = "visible";
        el.style.height   = "auto";
      }
    }

    try {
      const captureHeight = scrollFull
        ? Math.max(target.scrollHeight, target.offsetHeight, window.innerHeight)
        : window.innerHeight;

      const dataUrl = await toPng(target, {
        width:           window.innerWidth,
        height:          captureHeight,
        pixelRatio:      2,
        backgroundColor: "#ffffff",
        cacheBust:       true,
        skipFonts:       true,
        fetchRequestInit: { mode: "cors", cache: "no-cache" },
        filter: (node) => {
          if (node instanceof HTMLElement) {
            if (node.id === "screenshot-capture-overlay") return false;
            if (node.dataset?.screenshotIgnore === "true") return false;
            if (node.id === "demo-banner") return false;
          }
          return true;
        },
      });

      const res = await fetch(dataUrl);
      return await res.blob();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown capture error";
      console.warn("Capture skipped:", msg);
      return null;
    } finally {
      for (const s of saved) {
        s.el.style.overflow = s.overflow;
        s.el.style.height   = s.height;
      }
    }
  };

  /* ── Capture a single page ── */
  const capturePage = async (ps: PageState): Promise<Blob | null> => {
    const { page } = ps;

    updatePage(page.id, { status: "capturing", message: "Navigating…" });
    await navigateTo(page.path);

    if (page.setup) {
      updatePage(page.id, { status: "capturing", message: `Clicking "${page.setup}"…` });
      const found = await clickTab(page.setup);
      if (!found) updatePage(page.id, { status: "capturing", message: `Tab "${page.setup}" not found, capturing anyway…` });
    }

    if (page.waitMs) await wait(page.waitMs);
    await wait(500);

    // Hide demo banner before every capture
    hideDemoBanner();
    await wait(150); // allow repaint

    updatePage(page.id, { status: "capturing", message: "Rendering…" });

    let blob = await captureCurrentView(!!page.scrollFull);

    showDemoBanner();

    if (blob && (await verifyNotBlank(blob))) {
      updatePage(page.id, { status: "done", message: "✓ Captured", blob });
      return blob;
    }

    // Retry once
    updatePage(page.id, { status: "verifying", message: "Retrying…" });
    await wait(2500);

    hideDemoBanner();
    await wait(150);
    blob = await captureCurrentView(!!page.scrollFull);
    showDemoBanner();

    if (blob && (await verifyNotBlank(blob))) {
      updatePage(page.id, { status: "done", message: "✓ Captured (retry)", blob });
      return blob;
    }

    // Accept anything over 5 KB
    if (blob && blob.size > 5000) {
      updatePage(page.id, { status: "done", message: "✓ Captured (unverified)", blob });
      return blob;
    }

    updatePage(page.id, { status: "blank", message: "⚠ Blank after retry" });
    return null;
  };

  /* ── Main capture flow ── */
  const startCapture = async () => {
    const sel = pages.filter((p) => p.selected);
    if (sel.length === 0) return;

    const returnPath = window.location.hash.replace(/^#/, "") || "/export-pages";
    setCapturing(true);
    setDone(false);
    abortRef.current = false;
    setProgress({ current: 0, total: sel.length });
    setPages((prev) => prev.map((p) => p.selected ? { ...p, status: "pending", message: undefined, blob: undefined } : p));

    await wait(400);

    const zip = new JSZip();
    let count = 0;

    for (let i = 0; i < sel.length; i++) {
      if (abortRef.current) break;
      setProgress({ current: i + 1, total: sel.length });
      const blob = await capturePage(sel[i]);
      if (blob) {
        count++;
        const safeName = sel[i].page.id.replace(/[^a-z0-9-]/g, "_");
        const group    = sel[i].page.group.replace(/[^a-zA-Z0-9 _-]/g, "_");
        zip.file(`${group}/${String(i + 1).padStart(2, "0")}_${safeName}.png`, blob);
      }
    }

    // Navigate back to this page
    await navigateTo(returnPath);

    if (!abortRef.current && count > 0) {
      const dateStr = new Date().toISOString().slice(0, 10);
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `myaircraft-screenshots-${dateStr}.zip`);
    }

    setCapturing(false);
    setDone(true);
  };

  const stopCapture = () => { abortRef.current = true; showDemoBanner(); };

  /* ── Status icon ── */
  const StatusIcon = ({ status, message }: { status: CaptureStatus; message?: string }) => {
    switch (status) {
      case "idle":     return null;
      case "pending":  return <div className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />;
      case "capturing":
      case "verifying": return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />;
      case "done":     return <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
      case "failed":
        return (
          <span title={message}>
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          </span>
        );
      case "blank":
        return (
          <span title={message}>
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          </span>
        );
      default:         return null;
    }
  };

  const groups = Array.from(new Set(ALL_PAGES.map((p) => p.group)));
  const pct    = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;

  /* ─────────────────── RENDER ─────────────────── */
  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col">

      {/* ── Header ── */}
      <div className="border-b border-white/10 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#2563EB] flex items-center justify-center shadow-lg shadow-blue-900/40">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white text-[20px]" style={{ fontWeight: 800 }}>
              Screenshot Export
            </h1>
            <p className="text-white/40 text-[12px]" style={{ fontWeight: 400 }}>
              myaircraft.us · 2× retina · ZIP download
            </p>
          </div>
        </div>
        <button
          onClick={() => navigateTo("/")}
          className="flex items-center gap-2 text-white/40 hover:text-white text-[13px] transition-colors"
          style={{ fontWeight: 500 }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to site
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 gap-0 max-w-6xl mx-auto w-full px-8 py-8">

        {/* Left: page list */}
        <div className="flex-1 mr-8">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={toggleAll}
              disabled={capturing}
              className="flex items-center gap-2 text-[13px] text-white/60 hover:text-white transition-colors disabled:opacity-40"
              style={{ fontWeight: 500 }}
            >
              {allSelected
                ? <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                : <Square className="w-4 h-4" />}
              {allSelected ? "Deselect All" : "Select All"}
            </button>
            <span className="text-[12px] text-white/30">
              {selectedCount} of {pages.length} pages selected
            </span>
          </div>

          {/* Groups */}
          <div className="space-y-2">
            {groups.map((group) => {
              const gp        = pages.filter((p) => p.page.group === group);
              const allG      = gp.every((p) => p.selected);
              const someG     = gp.some((p) => p.selected);
              const collapsed = collapsedGroups.has(group);
              const doneG     = gp.filter((p) => p.status === "done").length;

              return (
                <div key={group} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
                    <button onClick={() => !capturing && toggleGroup(group)} className="shrink-0 disabled:opacity-40" disabled={capturing}>
                      {allG ? (
                        <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                      ) : someG ? (
                        <div className="w-4 h-4 rounded border-2 border-[#2563EB] bg-[#2563EB]/20 flex items-center justify-center">
                          <div className="w-1.5 h-0.5 bg-[#2563EB] rounded" />
                        </div>
                      ) : (
                        <Square className="w-4 h-4 text-white/30" />
                      )}
                    </button>
                    <span className="text-white/40">{GROUP_ICONS[group]}</span>
                    <button
                      onClick={() => toggleCollapseGroup(group)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>{group}</span>
                      <span className="text-[11px] text-white/30">
                        {doneG > 0 ? `${doneG}/${gp.length} done` : `${gp.filter((p) => p.selected).length}/${gp.length}`}
                      </span>
                      {collapsed
                        ? <ChevronDown className="w-3.5 h-3.5 text-white/30 ml-auto" />
                        : <ChevronUp   className="w-3.5 h-3.5 text-white/30 ml-auto" />}
                    </button>
                  </div>

                  {/* Page rows */}
                  {!collapsed && (
                    <div className="divide-y divide-white/5">
                      {gp.map((ps) => (
                        <div
                          key={ps.page.id}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                            capturing ? "opacity-70 cursor-not-allowed" : "hover:bg-white/5"
                          } ${ps.selected ? "bg-[#2563EB]/8" : ""}`}
                          onClick={() => !capturing && togglePage(ps.page.id)}
                        >
                          {ps.selected
                            ? <CheckSquare className="w-4 h-4 text-[#2563EB] shrink-0" />
                            : <Square      className="w-4 h-4 text-white/20 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-white/85" style={{ fontWeight: 500 }}>
                              {ps.page.label}
                            </div>
                            {ps.message && (
                              <div className={`text-[11px] ${
                                ps.status === "done" ? "text-emerald-400" :
                                ps.status === "blank" || ps.status === "failed" ? "text-amber-400" :
                                "text-white/35"
                              }`}>
                                {ps.message}
                              </div>
                            )}
                          </div>
                          <StatusIcon status={ps.status} message={ps.message} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: controls panel */}
        <div className="w-72 shrink-0">
          <div className="sticky top-8 space-y-4">

            {/* Info card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-white/60 text-[12px]" style={{ fontWeight: 600 }}>
                <FileImage className="w-4 h-4 text-[#2563EB]" />
                OUTPUT FORMAT
              </div>
              {[
                ["Resolution", "2× retina (high-DPI)"],
                ["Format",     "PNG per page"],
                ["Bundle",     "Single ZIP file"],
                ["Naming",     "Group / 01_page-id.png"],
                ["Demo banner","Auto-hidden"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-white/40 text-[12px]">{k}</span>
                  <span className="text-white/80 text-[12px]" style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Progress card (when capturing) */}
            {capturing && (
              <div className="bg-[#2563EB]/10 border border-[#2563EB]/30 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Loader2 className="w-4 h-4 text-[#2563EB] animate-spin" />
                  <span className="text-white text-[13px]" style={{ fontWeight: 600 }}>
                    Capturing {progress.current} / {progress.total}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-[#2563EB] rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-white/40">
                  <span>{doneCount} done · {failedCount} skipped</span>
                  <span>{pct}%</span>
                </div>
                <button
                  onClick={stopCapture}
                  className="mt-4 w-full flex items-center justify-center gap-2 border border-red-500/40 text-red-400 hover:bg-red-500/10 py-2.5 rounded-xl text-[13px] transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  <X className="w-4 h-4" /> Stop
                </button>
              </div>
            )}

            {/* Done card */}
            {done && !capturing && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <div className="text-white text-[14px] mb-1" style={{ fontWeight: 700 }}>Download started!</div>
                <div className="text-white/50 text-[12px]">
                  {doneCount} screenshots in ZIP.<br />
                  Check your Downloads folder.
                </div>
                {failedCount > 0 && (
                  <div className="mt-2 text-amber-400 text-[11px]">{failedCount} pages skipped (blank/error)</div>
                )}
              </div>
            )}

            {/* Start button */}
            {!capturing && (
              <button
                onClick={startCapture}
                disabled={selectedCount === 0}
                className="w-full flex items-center justify-center gap-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] disabled:opacity-40 text-white py-3.5 rounded-xl text-[14px] shadow-lg shadow-blue-900/40 transition-all"
                style={{ fontWeight: 700 }}
              >
                {done ? (
                  <><Download className="w-5 h-5" /> Capture Again</>
                ) : (
                  <><Play className="w-5 h-5" /> Capture &amp; Download ZIP</>
                )}
              </button>
            )}

            {/* Tip */}
            <p className="text-white/25 text-[11px] text-center leading-relaxed px-2">
              Keep this tab active during capture.<br />
              The app will navigate through each page automatically.
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}
