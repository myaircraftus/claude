"use client";

import { Bot, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";

export default function DemoWorkspacePage() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <h1 className="text-[24px] text-slate-900" style={{ fontWeight: 700 }}>
            AI Command Center
          </h1>
        </div>
        <p className="text-slate-600 mb-8 text-[14px]">
          Your hands-free maintenance copilot. Drafts logbook entries, looks up ADs, finds part
          numbers, and writes squawk descriptions — in plain aviation language.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            {
              icon: Wrench,
              title: "Draft a logbook entry",
              body:
                "“C/W right brake assembly overhaul IAW Cleveland S/L 92.” Pre-filled with the work order details.",
            },
            {
              icon: Sparkles,
              title: "Look up an AD",
              body:
                "“Is AD 2024-12-08 applicable to N12345?” The AI checks the airframe and engine and tells you.",
            },
            {
              icon: Bot,
              title: "Write a squawk",
              body:
                "Read the pilot's email, dictate it, or paste a photo and the AI returns a clean, structured squawk.",
            },
          ].map((card) => (
            <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center mb-2">
                <card.icon className="w-4 h-4" />
              </div>
              <p className="text-[14px] text-slate-900 mb-1" style={{ fontWeight: 600 }}>
                {card.title}
              </p>
              <p className="text-[12px] text-slate-600 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-[14px] text-slate-900 mb-3" style={{ fontWeight: 600 }}>
            The Command Center is live for paying users. In the demo we keep it read-only so you can
            explore the rest of the app safely.
          </p>
          <Link
            href="/signup?preview=1"
            className="inline-block rounded-full bg-blue-600 text-white px-4 py-2 text-[13px] font-semibold hover:bg-blue-700 transition-colors"
          >
            Start free 30-day trial
          </Link>
        </div>
      </div>
    </div>
  );
}
