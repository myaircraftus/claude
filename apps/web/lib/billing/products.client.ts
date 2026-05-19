/**
 * Client-safe view of the persona product catalog. Same display fields as
 * lib/billing/products.ts but without the server-only Stripe price IDs.
 * Import this from "use client" components; import the server module from
 * server code that needs to look up price IDs.
 *
 * Phase 18 mig 119 — the mechanic SKU keeps its Stripe Product ID (so live
 * subscriptions aren't disturbed) but now grants the shop persona and is
 * shown to users as "Shop". The bundle is owner + shop.
 */
import type { Persona } from "./gate";

export type Sku = "owner" | "mechanic" | "bundle";

export interface ClientProduct {
  sku: Sku;
  displayName: string;
  tagline: string;
  monthlyPriceCents: number;
  grants: Persona[];
}

export const PRODUCTS: Record<Sku, ClientProduct> = {
  owner: {
    sku: "owner",
    displayName: "Aircraft Owner",
    tagline: "Logbooks, AD tracking, fleet dashboard, AI search",
    monthlyPriceCents: 4900,
    grants: ["owner"],
  },
  mechanic: {
    sku: "mechanic",
    displayName: "Shop",
    tagline: "Work orders, invoicing, customer portal, parts catalog",
    monthlyPriceCents: 7900,
    grants: ["shop"],
  },
  bundle: {
    sku: "bundle",
    displayName: "Owner + Shop Bundle",
    tagline: "Both surfaces, single subscription, 25% off",
    monthlyPriceCents: 9900,
    grants: ["owner", "shop"],
  },
};

/**
 * The single-persona Stripe SKU whose entitlement grant covers a given runtime
 * persona. The shop persona is served by the 'mechanic' SKU — mig 119 kept the
 * Stripe Product ID as 'mechanic' so live subscriptions weren't disturbed.
 */
export function skuForPersona(persona: Persona): Sku {
  return persona === "shop" ? "mechanic" : "owner";
}
