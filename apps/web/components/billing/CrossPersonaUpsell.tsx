"use client";

import { useState } from "react";
import { Plane, Wrench, Sparkles, X } from "lucide-react";
import type { Persona } from "@/lib/billing/gate";
import { PRODUCTS } from "@/lib/billing/products.client";
import { useBilling } from "./BillingProvider";

interface Props {
  /** Which persona the user is trying to access without an entitlement. */
  persona: Persona;
  open: boolean;
  onClose: () => void;
  /** Called when the trial start succeeds, so the parent can refresh state. */
  onTrialStarted?: () => void;
}

/**
 * Modal fired when an authenticated user clicks the other persona's surface
 * without an active entitlement. Offers either: (a) start a 30-day trial for
 * that persona (if they haven't already), or (b) subscribe / bundle.
 */
export function CrossPersonaUpsell({ persona, open, onClose, onTrialStarted }: Props) {
  const { status, refresh } = useBilling();
  const [busy, setBusy] = useState<"trial" | "owner" | "mechanic" | "bundle" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const product = PRODUCTS[persona];
  const personaLabel = product.displayName;
  const Icon = persona === "mechanic" ? Wrench : Plane;
  const ownEntitlement = status?.[persona];
  const trialAlreadyUsed = ownEntitlement && ownEntitlement.state !== "none" && ownEntitlement.state !== "trial";
  const canStartTrial = !ownEntitlement || ownEntitlement.state === "none";

  const handleStartTrial = async () => {
    setBusy("trial");
    setError(null);
    try {
      const res = await fetch("/api/billing/start-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.blocked === "no_payment_method") {
          setError("Add a payment method first — head to Settings → Billing.");
        } else {
          setError(json.error || "Could not start trial.");
        }
        setBusy(null);
        return;
      }
      await refresh();
      onTrialStarted?.();
      onClose();
    } catch {
      setError("Network error. Please try again.");
      setBusy(null);
    }
  };

  const handleSubscribe = async (sku: "owner" | "mechanic" | "bundle") => {
    setBusy(sku);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error || "Could not start checkout.");
        setBusy(null);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Network error.");
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md hover:bg-slate-100 text-slate-500"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mb-3">
            <Icon className="w-6 h-6" />
          </div>
          <h2 className="text-[20px] tracking-tight text-slate-900 mb-1.5" style={{ fontWeight: 800 }}>
            Unlock the {personaLabel} side
          </h2>
          <p className="text-[13px] text-slate-600 mb-4">{product.tagline}</p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-900 text-[12px]">
              {error}
            </div>
          )}

          {canStartTrial && (
            <button
              type="button"
              onClick={handleStartTrial}
              disabled={busy !== null}
              className="w-full h-11 rounded-xl bg-slate-900 text-white text-[13px] hover:bg-slate-800 transition-colors disabled:opacity-60 mb-2.5"
              style={{ fontWeight: 600 }}
            >
              {busy === "trial" ? "Starting trial…" : `Start 30-day ${personaLabel} trial`}
            </button>
          )}

          {trialAlreadyUsed && (
            <p className="text-[11px] text-slate-500 mb-3">
              You&apos;ve already used your free {personaLabel} trial. Subscribe below to unlock.
            </p>
          )}

          <button
            type="button"
            onClick={() => handleSubscribe(persona === "owner" ? "owner" : "mechanic")}
            disabled={busy !== null}
            className="w-full h-11 rounded-xl border border-slate-300 bg-white text-slate-900 text-[13px] hover:bg-slate-50 transition-colors disabled:opacity-60 mb-2.5"
            style={{ fontWeight: 600 }}
          >
            {busy === persona ? "Redirecting…" : `Subscribe to ${personaLabel} — $${(product.monthlyPriceCents / 100).toFixed(0)}/mo`}
          </button>

          <button
            type="button"
            onClick={() => handleSubscribe("bundle")}
            disabled={busy !== null}
            className="w-full h-11 rounded-xl bg-violet-600 text-white text-[13px] hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ fontWeight: 600 }}
          >
            <Sparkles className="w-4 h-4" />
            {busy === "bundle" ? "Redirecting…" : `Get the bundle — $${(PRODUCTS.bundle.monthlyPriceCents / 100).toFixed(0)}/mo`}
          </button>
        </div>

        <div className="px-6 py-3 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] text-slate-500 hover:text-slate-900"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
