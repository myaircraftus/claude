"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { useBilling } from "./BillingProvider";
import type { Persona } from "@/lib/billing/gate";

interface Props {
  /**
   * Which persona's trial/paywall state to surface in the banner. Defaults to
   * showing whichever persona is most urgent (paywalled > shortest trial).
   */
  persona?: Persona;
}

export function BillingBanner({ persona }: Props) {
  const { status } = useBilling();
  const [dismissed, setDismissed] = useState(false);

  if (!status || dismissed) return null;

  const target = persona
    ? status[persona]
    : pickMostUrgent(status.owner, status.mechanic);

  if (!target) return null;
  if (target.state === "active") return null;

  const isNone = target.state === "none";
  const isPaywalled = target.state === "paywalled" || target.state === "past_due" || target.state === "cancelled";
  const personaLabel = target.persona === "owner" ? "Aircraft Owner" : "Mechanic";

  const bg = isPaywalled
    ? "bg-gradient-to-r from-red-50 to-orange-50 border-red-200 text-red-900"
    : isNone
      ? "bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200 text-amber-900"
      : "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 text-blue-900";

  const ctaHref = isNone
    ? `/onboarding/billing?persona=${target.persona}`
    : `/settings?tab=billing&focus=${target.persona}`;
  const ctaLabel = isNone ? "Start free trial" : isPaywalled ? "Re-subscribe" : "Subscribe now";
  const ctaClasses = isPaywalled
    ? "bg-red-600 text-white hover:bg-red-700"
    : isNone
      ? "bg-amber-600 text-white hover:bg-amber-700"
      : "bg-blue-600 text-white hover:bg-blue-700";

  return (
    <div className={`border-b ${bg} px-4 py-2.5`}>
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 text-[13px]">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isPaywalled ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Sparkles className="w-4 h-4 shrink-0" />}
          {isPaywalled ? (
            <span className="truncate">
              <span className="font-semibold">Your {personaLabel} subscription has lapsed.</span>{" "}
              You can still view existing data, but creating or editing is paused until you re-subscribe.
            </span>
          ) : isNone ? (
            <span className="truncate">
              <span className="font-semibold">Add a payment method to start your 30-day {personaLabel} trial.</span>{" "}
              <span className="hidden sm:inline">Card on file required — not charged today.</span>
            </span>
          ) : (
            <span className="truncate">
              <span className="font-semibold">
                {target.trialDaysRemaining !== null && target.trialDaysRemaining > 0
                  ? `${target.trialDaysRemaining} day${target.trialDaysRemaining === 1 ? "" : "s"} left in your ${personaLabel} trial.`
                  : `Your ${personaLabel} trial is ending today.`}
              </span>{" "}
              <span className="hidden sm:inline">Subscribe to keep full access.</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={ctaHref}
            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold ${ctaClasses}`}
          >
            {ctaLabel}
          </Link>
          {!isPaywalled && !isNone && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-[12px] text-slate-500 hover:text-slate-900 px-1"
              aria-label="Dismiss banner"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function pickMostUrgent(
  owner: ReturnType<typeof useBilling>["status"] extends infer S
    ? S extends { owner: infer O } ? O : never
    : never,
  mechanic: ReturnType<typeof useBilling>["status"] extends infer S
    ? S extends { mechanic: infer M } ? M : never
    : never,
) {
  // Paywalled > 'none' (no trial yet) > trial-ending-soonest > active.
  const both = [owner, mechanic];

  const paywalled = both.find((e) => e.state === "paywalled" || e.state === "past_due" || e.state === "cancelled");
  if (paywalled) return paywalled;

  const noneState = both.find((e) => e.state === "none");
  if (noneState) return noneState;

  const trialing = both.filter((e) => e.state === "trial")
    .sort((a, b) => (a.trialDaysRemaining ?? 99) - (b.trialDaysRemaining ?? 99));
  if (trialing[0]) return trialing[0];

  return both.find((e) => e.state === "active") ?? null;
}
