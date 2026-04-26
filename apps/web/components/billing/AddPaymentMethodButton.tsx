"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import type { Persona } from "@/lib/billing/gate";

interface Props {
  /** Optional persona — passed through to setup-intent metadata so the
   *  webhook / start-trial flow can auto-start the right trial after the
   *  card is captured. */
  persona?: Persona;
  /** Where to land the user after Stripe Checkout (relative path). Defaults
   *  to /settings/billing. The server appends `?setup=success`. */
  returnPath?: string;
  /** Display variant. "primary" = filled dark, "secondary" = outline. */
  variant?: "primary" | "secondary";
  /** Override the button label. Defaults to "Add payment method". */
  label?: string;
  className?: string;
}

/**
 * Single-button entry point for capturing a payment method via Stripe-hosted
 * Checkout in `mode: 'setup'`. Avoids the @stripe/stripe-js bundle by
 * delegating the entire card-capture UI to Stripe.
 */
export function AddPaymentMethodButton({
  persona,
  returnPath,
  variant = "primary",
  label = "Add payment method",
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/setup-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, returnPath }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error || "Could not start payment setup.");
        setBusy(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  const base =
    "inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-[13px] transition-colors disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50";

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={`${base} ${styles}`}
        style={{ fontWeight: 600 }}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CreditCard className="w-4 h-4" />
        )}
        {busy ? "Redirecting…" : label}
      </button>
      {error && (
        <p className="mt-2 text-[12px] text-red-700">{error}</p>
      )}
    </div>
  );
}
