"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Persona } from "@/lib/billing/gate";

interface PersonaEntitlementClient {
  persona: Persona;
  state: "trial" | "active" | "paywalled" | "cancelled" | "past_due" | "none";
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  paywalledReason: string | null;
  stripeSubscriptionId: string | null;
  bundle: boolean;
  canRead: boolean;
  canWrite: boolean;
}

export interface BillingClientStatus {
  organizationId: string;
  owner: PersonaEntitlementClient;
  mechanic: PersonaEntitlementClient;
  hasAnyAccess: boolean;
  hasBundleEquivalent: boolean;
}

interface BillingContextValue {
  status: BillingClientStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Convenience: entitlement for a given persona, or null if status hasn't loaded. */
  entitlementFor: (persona: Persona) => PersonaEntitlementClient | null;
}

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BillingClientStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (!res.ok) {
        setStatus(null);
        return;
      }
      const json = (await res.json()) as BillingClientStatus;
      setStatus(json);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const entitlementFor = useCallback(
    (persona: Persona) => (status ? status[persona] : null),
    [status],
  );

  const value = useMemo<BillingContextValue>(
    () => ({ status, loading, refresh, entitlementFor }),
    [status, loading, refresh, entitlementFor],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) {
    throw new Error("useBilling must be used inside <BillingProvider>");
  }
  return ctx;
}

/**
 * Convenience hook returning just the entitlement for a single persona.
 * Returns null while loading.
 */
export function usePersonaEntitlement(persona: Persona): PersonaEntitlementClient | null {
  const { status } = useBilling();
  return status ? status[persona] : null;
}
