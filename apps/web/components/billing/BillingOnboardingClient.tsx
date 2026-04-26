"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plane, Wrench, ShieldCheck, CheckCircle2, Loader2 } from "lucide-react";
import type { Persona } from "@/lib/billing/gate";
import { PRODUCTS } from "@/lib/billing/products.client";
import { AddPaymentMethodButton } from "./AddPaymentMethodButton";

interface Props {
  persona: Persona;
  setupResult: string | null;
}

type FlowState = "intro" | "starting_trial" | "trial_started" | "error";

/**
 * Renders one of three states:
 *   - intro: pitch the trial, render the "Add payment method" button which
 *            redirects to Stripe-hosted Checkout in setup mode
 *   - on return from Stripe (?setup=success): kick off /api/billing/start-trial
 *   - trial_started: success splash, then redirect to the persona dashboard
 */
export function BillingOnboardingClient({ persona, setupResult }: Props) {
  const router = useRouter();
  const product = PRODUCTS[persona];
  const Icon = persona === "mechanic" ? Wrench : Plane;

  const [state, setState] = useState<FlowState>("intro");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (setupResult !== "success") return;

    let cancelled = false;
    setState("starting_trial");
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/billing/start-trial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(
            json.blocked === "card_already_used"
              ? "This card has already been used for a free trial. Please subscribe instead."
              : json.error || "Could not start your trial. Please try again."
          );
          setState("error");
          return;
        }
        setState("trial_started");
        const dest = persona === "mechanic" ? "/mechanic" : "/owner";
        setTimeout(() => router.push(dest), 1500);
      } catch {
        if (cancelled) return;
        setError("Network error. Please try again.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setupResult, persona, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-8">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mb-5">
          <Icon className="w-7 h-7" />
        </div>

        {state === "intro" && (
          <>
            <h1
              className="text-[26px] tracking-tight text-slate-900 mb-2"
              style={{ fontWeight: 800 }}
            >
              Start your 30-day {product.displayName} trial
            </h1>
            <p className="text-[14px] text-slate-600 mb-6">
              {product.tagline}
            </p>

            <div className="space-y-3 mb-7">
              <Bullet>
                <span>
                  <strong>Free for 30 days.</strong> Cancel anytime — no charge if
                  you cancel before day 31.
                </span>
              </Bullet>
              <Bullet>
                <span>
                  Card on file is required up-front so we can prevent trial abuse.
                  Your card is not charged today.
                </span>
              </Bullet>
              <Bullet>
                <span>
                  After 30 days the card is charged ${(product.monthlyPriceCents / 100).toFixed(0)}/mo
                  unless you cancel from <strong>Settings → Billing</strong>.
                </span>
              </Bullet>
            </div>

            <AddPaymentMethodButton
              persona={persona}
              returnPath={`/onboarding/billing?persona=${persona}`}
              label={`Add card and start free trial`}
            />

            <p className="mt-4 text-[11px] text-slate-500 leading-5">
              By continuing you agree to our terms. We use Stripe — your card details
              never touch our servers.
            </p>
          </>
        )}

        {state === "starting_trial" && (
          <div className="py-6 text-center">
            <Loader2 className="w-7 h-7 text-blue-600 animate-spin mx-auto mb-3" />
            <h1 className="text-[20px] text-slate-900" style={{ fontWeight: 700 }}>
              Starting your trial…
            </h1>
            <p className="text-[13px] text-slate-600 mt-1">
              We&apos;re recording your card and starting your 30 days.
            </p>
          </div>
        )}

        {state === "trial_started" && (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
            <h1 className="text-[22px] text-slate-900" style={{ fontWeight: 800 }}>
              You&apos;re in.
            </h1>
            <p className="text-[13px] text-slate-600 mt-1">
              Redirecting you to your {product.displayName} workspace…
            </p>
          </div>
        )}

        {state === "error" && (
          <>
            <h1
              className="text-[22px] text-slate-900 mb-2 flex items-center gap-2"
              style={{ fontWeight: 700 }}
            >
              <ShieldCheck className="w-5 h-5 text-amber-600" /> Trial start blocked
            </h1>
            <p className="text-[13px] text-slate-700 mb-5">
              {error || "We couldn't start your trial."}
            </p>
            <AddPaymentMethodButton
              persona={persona}
              returnPath={`/onboarding/billing?persona=${persona}`}
              label="Try a different card"
              variant="secondary"
            />
          </>
        )}
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[13px] text-slate-700">
      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
      <div className="leading-5">{children}</div>
    </div>
  );
}
