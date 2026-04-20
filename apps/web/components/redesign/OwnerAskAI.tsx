"use client";

import React, { useState, lazy, Suspense } from "react";
import { MessageSquare, Cpu } from "lucide-react";

/* Lazy-load the two heavy sub-panels so they don't block startup */
const AskPage          = lazy(() => import("./AskPage").then(m => ({ default: m.AskPage })));
const OwnerCommandCenter = lazy(() => import("./OwnerCommandCenter").then(m => ({ default: m.OwnerCommandCenter })));

type Tab = "ask" | "command";

function PanelLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#2563EB]/20 border-t-[#2563EB] rounded-full animate-spin" />
    </div>
  );
}

export function OwnerAskAI() {
  const [tab, setTab] = useState<Tab>("ask");

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* ── Tab bar ── */}
      <div className="shrink-0 bg-white border-b border-border px-2 flex items-end">
        {(
          [
            {
              id: "ask" as Tab,
              icon: MessageSquare,
              label: "Ask Your Aircraft",
              sub: "Logbook queries · AI-cited answers",
            },
            {
              id: "command" as Tab,
              icon: Cpu,
              label: "AI Command Center",
              sub: "Act on fleet · plain-English commands",
            },
          ] satisfies { id: Tab; icon: any; label: string; sub: string }[]
        ).map(({ id, icon: Icon, label, sub }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative flex items-center gap-3 px-6 py-3.5 transition-all ${
                active
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  active ? "bg-primary/10" : "bg-muted/40"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="text-left">
                <div className="text-[13px]" style={{ fontWeight: active ? 600 : 400 }}>
                  {label}
                </div>
                <div className="text-[10px] text-muted-foreground hidden sm:block" style={{ fontWeight: 400 }}>
                  {sub}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Suspense fallback={<PanelLoader />}>
          {tab === "ask"     && <AskPage />}
          {tab === "command" && <OwnerCommandCenter showRightPanel />}
        </Suspense>
      </div>
    </div>
  );
}
