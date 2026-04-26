"use client";

import { useState } from "react";
import { Lock, Plane, Wrench, Sparkles, Check } from "lucide-react";
import type { Persona } from "@/lib/billing/gate";
import { PRODUCTS } from "@/lib/billing/products.client";

interface Props {
  persona: Persona;
  /** True if the user is read-only (trial expired, can still see data). False if cancelled. */
  readOnly?: boolean;
}

/**
 * Full-page paywall shown over the persona's main surface when their trial
 * expires. Renders three subscribe options: Owner, Mechanic, Bundle.
 */
export function PaywallScreen({ persona, readOnly = true }: Props) {
  const [loadingSku, setLoadingSku] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (sku: "owner" | "mechanic" | "bundle") => {
    setLoadingSku(sku);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error || "Could not start checkout. Please try again.");
        setLoadingSku(null);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Network error. Please try again.");
      setLoadingSku(null);
    }
  };

  const Icon = persona === "mechanic" ? Wrench : Plane;
  const personaLabel = persona === "mechanic" ? "Mechanic" : "Aircraft Owner";

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-blue-50/50">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 text-white mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-[32px] tracking-tight text-slate-900 mb-2" style={{ fontWeight: 800 }}>
            Your {personaLabel} trial has ended
          </h1>
          <p className="text-slate-600 text-[15px] max-w-xl mx-auto">
            {readOnly ? (
              <>You can still view your existing data, but creating, editing, or signing off is paused. Pick a plan below to keep everything running.</>
            ) : (
              <>Your {personaLabel} subscription was cancelled. Re-subscribe below to restore access.</>
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-[13px] text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PlanCard
            sku="owner"
            currentPersona={persona}
            highlight={persona === "owner"}
            icon={<Plane className="w-5 h-5 text-blue-600" />}
            loading={loadingSku === "owner"}
            onSubscribe={handleSubscribe}
          />
          <PlanCard
            sku="bundle"
            currentPersona={persona}
            highlight
            badge="Best value"
            icon={<Sparkles className="w-5 h-5 text-violet-600" />}
            loading={loadingSku === "bundle"}
            onSubscribe={handleSubscribe}
          />
          <PlanCard
            sku="mechanic"
            currentPersona={persona}
            highlight={persona === "mechanic"}
            icon={<Wrench className="w-5 h-5 text-slate-700" />}
            loading={loadingSku === "mechanic"}
            onSubscribe={handleSubscribe}
          />
        </div>

        <p className="text-center mt-6 text-[12px] text-slate-500">
          Cancel anytime · Questions? <a href="mailto:info@myaircraft.us" className="underline">info@myaircraft.us</a>
        </p>

        <div className="hidden">
          {/* Visual cue used by tests / debugging */}
          <Icon />
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  sku,
  currentPersona,
  highlight,
  badge,
  icon,
  loading,
  onSubscribe,
}: {
  sku: "owner" | "mechanic" | "bundle";
  currentPersona: Persona;
  highlight?: boolean;
  badge?: string;
  icon: React.ReactNode;
  loading: boolean;
  onSubscribe: (sku: "owner" | "mechanic" | "bundle") => void;
}) {
  const product = PRODUCTS[sku];
  const priceDollars = (product.monthlyPriceCents / 100).toFixed(0);
  const features = featuresFor(sku);

  return (
    <div
      className={`relative rounded-2xl border bg-white p-5 ${
        highlight ? "border-blue-300 shadow-md ring-2 ring-blue-100" : "border-slate-200"
      }`}
    >
      {badge && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-semibold tracking-wider uppercase">
          {badge}
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">{icon}</div>
        <div>
          <div className="text-[14px] text-slate-900" style={{ fontWeight: 700 }}>
            {product.displayName}
          </div>
          <div className="text-[11px] text-slate-500">{product.tagline}</div>
        </div>
      </div>
      <div className="mb-4">
        <span className="text-[28px] text-slate-900 tracking-tight" style={{ fontWeight: 800 }}>
          ${priceDollars}
        </span>
        <span className="text-[12px] text-slate-500">/mo</span>
      </div>
      <ul className="space-y-1.5 mb-5 min-h-[88px]">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[12px] text-slate-700">
            <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onSubscribe(sku)}
        disabled={loading}
        className={`w-full h-10 rounded-xl text-[13px] transition-colors disabled:opacity-60 ${
          highlight
            ? "bg-slate-900 text-white hover:bg-slate-800"
            : "bg-white border border-slate-300 text-slate-900 hover:bg-slate-50"
        }`}
        style={{ fontWeight: 600 }}
      >
        {loading ? "Redirecting…" : sku === currentPersona || sku === "bundle" ? "Subscribe" : `Add ${product.displayName}`}
      </button>
    </div>
  );
}

function featuresFor(sku: "owner" | "mechanic" | "bundle"): string[] {
  if (sku === "owner") {
    return [
      "Unlimited aircraft & logbook uploads",
      "AD compliance tracking",
      "AI search across your records",
      "Inspection reminders",
    ];
  }
  if (sku === "mechanic") {
    return [
      "Unlimited work orders & estimates",
      "Customer portal & invoicing",
      "Parts catalog & inventory",
      "Logbook sign-off workflow",
    ];
  }
  return [
    "Everything in Owner",
    "Everything in Mechanic",
    "Cross-persona handoff",
    "Single subscription, 25% off",
  ];
}
