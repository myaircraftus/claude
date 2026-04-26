"use client";

import { useEffect } from "react";
import {
  buildAskResponse,
  demoAircraft,
  demoBillingStatus,
  demoCustomers,
  demoEstimates,
  demoFaraimEntitlement,
  demoFaraimSession,
  demoIntegrations,
  demoInvoices,
  demoLogbookEntries,
  demoMe,
  demoOrganization,
  demoPartsSearchResult,
  demoReminders,
  demoSquawks,
  demoTeam,
  demoWorkOrders,
} from "../_lib/mockData";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

function parseUrl(input: RequestInfo | URL): { url: string; method: string } | null {
  try {
    if (typeof input === "string") return { url: input, method: "GET" };
    if (input instanceof URL) return { url: input.toString(), method: "GET" };
    if (input instanceof Request) return { url: input.url, method: input.method.toUpperCase() };
  } catch {
    return null;
  }
  return null;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function pathOf(rawUrl: string): { pathname: string; search: URLSearchParams } {
  try {
    const u = new URL(rawUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    return { pathname: u.pathname, search: u.searchParams };
  } catch {
    return { pathname: rawUrl, search: new URLSearchParams() };
  }
}

async function readJson(input: RequestInfo | URL, init?: RequestInit): Promise<any> {
  try {
    if (init?.body) {
      if (typeof init.body === "string") return JSON.parse(init.body);
      if (init.body instanceof FormData) {
        const obj: Record<string, any> = {};
        init.body.forEach((v, k) => (obj[k] = v));
        return obj;
      }
    }
    if (input instanceof Request) {
      const cloned = input.clone();
      try {
        return await cloned.json();
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function ok(payload: unknown = { ok: true }) {
  return json(payload);
}

async function handleApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> {
  const parsed = parseUrl(input);
  if (!parsed) return null;
  const { pathname, search } = pathOf(parsed.url);
  if (!pathname.startsWith("/api/")) return null;
  const method = methodOf(input, init);
  const body = method !== "GET" ? await readJson(input, init) : null;

  // ── Identity / org ────────────────────────────────────────────
  if (pathname === "/api/me") {
    if (method === "PATCH") return json({ profile: { ...demoMe.profile, ...(body ?? {}) } });
    return json(demoMe);
  }
  if (pathname === "/api/me/handle-available") {
    return json({ available: true });
  }
  if (pathname === "/api/me/avatar") return ok();
  if (pathname === "/api/organization") {
    if (method === "PATCH") return json({ organization: { ...demoOrganization, ...(body ?? {}) } });
    return json({ organization: demoOrganization, role: "owner" });
  }
  if (pathname === "/api/organization/template-assets") return json({ assets: [] });
  if (pathname === "/api/team") return json({ members: demoTeam });

  // ── Aircraft ──────────────────────────────────────────────────
  if (pathname === "/api/aircraft") {
    if (method === "GET") return json({ aircraft: demoAircraft });
    if (method === "POST") return json({ aircraft: { id: `demo-ac-${Date.now()}`, ...(body ?? {}) } });
  }
  if (pathname.startsWith("/api/aircraft/faa-lookup")) {
    return json({
      tail_number: search.get("tail")?.toUpperCase() ?? "N12345",
      make: "Cessna",
      model: "182 Skylane",
      year: 2014,
      serial_number: "18283456",
      registered_owner: "Demo Owner",
      registration_status: "Active",
      airworthiness_class: "Standard",
      certificate_issue_date: "2014-05-12",
    });
  }

  // ── Squawks ───────────────────────────────────────────────────
  if (pathname === "/api/squawks") {
    if (method === "GET") {
      const acId = search.get("aircraft_id");
      const list = acId ? demoSquawks.filter((s) => s.aircraft_id === acId) : demoSquawks;
      return json({ squawks: list });
    }
    if (method === "POST") {
      return json({ squawk: { id: `demo-sq-${Date.now()}`, status: "open", priority: "medium", created_at: new Date().toISOString(), ...(body ?? {}) } });
    }
  }
  if (pathname === "/api/squawks/structure" || pathname === "/api/squawks/transcribe" || pathname === "/api/squawks/from-photo") {
    return json({
      title: "Demo squawk title",
      description: "This is a demo response — in production we use AI to extract a clean squawk from your input.",
      priority: "medium",
    });
  }

  // ── Work orders ───────────────────────────────────────────────
  if (pathname === "/api/work-orders") {
    if (method === "GET") return json({ work_orders: demoWorkOrders });
    if (method === "POST") return json({ work_order: { id: `demo-wo-${Date.now()}`, status: "scheduled", ...(body ?? {}) } });
  }
  if (pathname.startsWith("/api/work-orders/")) {
    if (pathname.endsWith("/messages")) return json({ messages: [] });
    if (pathname.endsWith("/checklist")) return json({ checklist: [] });
    if (pathname.endsWith("/lines")) return json({ lines: [] });
    if (method === "DELETE") return ok();
    return json({ work_order: demoWorkOrders[0] ?? null });
  }

  // ── Customers ─────────────────────────────────────────────────
  if (pathname === "/api/customers") {
    if (method === "GET") return json({ customers: demoCustomers });
    if (method === "POST") return json({ customer: { id: `demo-cust-${Date.now()}`, ...(body ?? {}) } });
  }
  if (pathname.startsWith("/api/customers/")) {
    if (pathname.endsWith("/aircraft")) return json({ aircraft: [] });
    return json({ customer: demoCustomers[0] ?? null });
  }

  // ── Estimates / Invoices ──────────────────────────────────────
  if (pathname === "/api/estimates") {
    if (method === "GET") return json({ estimates: demoEstimates });
    if (method === "POST") return json({ estimate: { id: `demo-est-${Date.now()}`, ...(body ?? {}) } });
  }
  if (pathname.startsWith("/api/estimates/")) return json({ estimate: demoEstimates[0] ?? null });
  if (pathname === "/api/invoices") {
    if (method === "GET") return json({ invoices: demoInvoices });
    if (method === "POST") return json({ invoice: { id: `demo-inv-${Date.now()}`, ...(body ?? {}) } });
  }
  if (pathname.startsWith("/api/invoices/")) {
    if (pathname.endsWith("/payments")) return json({ payment: { id: `demo-pmt-${Date.now()}` } });
    if (pathname.endsWith("/send")) return ok();
    return json({ invoice: demoInvoices[0] ?? null });
  }

  // ── Logbook ───────────────────────────────────────────────────
  if (pathname === "/api/logbook-entries") {
    if (method === "GET") return json({ entries: demoLogbookEntries });
    if (method === "POST") return json({ entry: { id: `demo-lb-${Date.now()}`, ...(body ?? {}) } });
  }

  // ── Reminders / history / scanner ─────────────────────────────
  if (pathname === "/api/reminders") return json({ reminders: demoReminders });
  if (pathname === "/api/history") return json({ events: [] });
  if (pathname.startsWith("/api/scanner")) return json({ batches: [], items: [] });

  // ── Integrations ──────────────────────────────────────────────
  if (pathname === "/api/integrations") return json({ integrations: demoIntegrations });
  if (pathname.startsWith("/api/integrations")) return ok();

  // ── Parts search ──────────────────────────────────────────────
  if (pathname === "/api/parts/search") return json(demoPartsSearchResult);

  // ── AI / Ask ──────────────────────────────────────────────────
  if (pathname === "/api/ask") {
    const question = (body && (body.question || body.prompt || body.q)) ?? "";
    return json(buildAskResponse(typeof question === "string" ? question : ""));
  }
  if (pathname.startsWith("/api/ai/") || pathname.startsWith("/api/maintenance/")) {
    return json({ result: "Demo response — sign up to use the live AI." });
  }
  if (pathname.startsWith("/api/reports")) return json({ id: "demo-report", status: "complete", url: null });

  // ── FAR/AIM ──────────────────────────────────────────────────
  if (pathname === "/api/faraim/entitlement") return json(demoFaraimEntitlement);
  if (pathname === "/api/faraim/session") return json(demoFaraimSession);

  // ── Billing ───────────────────────────────────────────────────
  if (pathname === "/api/billing/status") return json(demoBillingStatus);

  // ── Mechanic search ──────────────────────────────────────────
  if (pathname.startsWith("/api/mechanics/search")) return json({ mechanics: [] });
  if (pathname === "/api/mechanics/invite") return ok();

  // ── Documents ────────────────────────────────────────────────
  if (pathname.startsWith("/api/documents")) return json({ documents: [] });

  // ── Catch-all so the UI never sees a real 401 ─────────────────
  return json({ ok: true, demo: true, path: pathname }, { status: 200 });
}

let installed = false;

export function DemoFetchInterceptor() {
  useEffect(() => {
    if (installed) return;
    if (typeof window === "undefined") return;

    const original = window.fetch.bind(window);
    installed = true;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const handled = await handleApi(input, init);
        if (handled) return handled;
      } catch (err) {
        // Fall through to real fetch on interceptor error.
        if (typeof console !== "undefined") {
          console.error("[demo] fetch interceptor error", err);
        }
      }
      return original(input, init);
    };

    return () => {
      window.fetch = original;
      installed = false;
    };
  }, []);

  return null;
}
